/**
 * 启动时对照 npm `latest`，把 profile 里的本包升到新版本。
 * 已加载的模块不会热替换——更新落盘后需重启才生效。
 *
 * @module @huiliyi37/dsh-tianshu-tui/self-update
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** 与 package.json name 对齐；profile 依赖键、npm 包名都用它。 */
export const TUI_PACKAGE = '@huiliyi37/dsh-tianshu-tui'

/** 显式关闭启动自更新（测试 / 不想联网）。 */
export const SKIP_UPDATE_ENV = 'DSH_TUI_SKIP_UPDATE'

/** 更新检查磁盘缓存 TTL：1h——每次启动都打 registry 没必要，24h 又会让
 *  装好新版本的用户一整天看不到更新提示（上游 updater 同款权衡）。 */
export const UPDATE_CACHE_TTL_MS = 60 * 60 * 1_000

/** 缓存落在本包 home（与自定义主题根 ~/.dsh-tui 同处，不污染 profile 目录）。 */
export function defaultUpdateCachePath(): string {
  return join(homedir(), '.dsh-tui', 'update-cache.json')
}

export type SkipReason = 'env' | 'ci' | 'not-npm' | 'same' | 'no-profile' | 'no-latest'

export type UpdatePlan =
  | { action: 'skip'; reason: SkipReason }
  | { action: 'update'; latest: string }

export type UpdateResult =
  | { kind: 'updated'; version: string }
  | { kind: 'noop' }
  | { kind: 'failed'; error: string }

export interface RunSelfUpdateOptions {
  env?: NodeJS.ProcessEnv
  currentVersion?: string
  profileDir?: string
  installSpec?: string
  startDir?: string
  fetchLatest?: () => Promise<string | null>
  install?: (latest: string, profileDir: string) => Promise<void>
  /** 更新检查缓存路径（缺省 ~/.dsh-tui/update-cache.json）；仅真实网络路径使用。 */
  cachePath?: string
  /** 时钟注入（缓存新鲜度判定）。 */
  now?: () => number
}

/** registry / dist-tag / 范围：视为 npm 安装。git 与本地路径不是。 */
export function isNpmVersionSpec(spec: string): boolean {
  return !/^(github:|git\+|file:|link:|workspace:|https?:)/.test(spec)
}

/** CI、vitest、显式开关下不联网。 */
export function shouldCheckForUpdate(env: NodeJS.ProcessEnv): boolean {
  if (env[SKIP_UPDATE_ENV] === '1' || env[SKIP_UPDATE_ENV] === 'true') return false
  if (env.CI === 'true' || env.CI === '1') return false
  if (env.VITEST === 'true' || env.VITEST === '1') return false
  return true
}

interface ProfilePackageJson {
  name?: string
  dependencies?: Record<string, string>
  dsh?: { profile?: unknown }
}

function readJson(path: string): ProfilePackageJson | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ProfilePackageJson
  } catch {
    return undefined
  }
}

/**
 * 从本包安装目录向上找 profile（含 `dsh.profile` 或对本包的 dependencies）。
 * 跳过本包自己的 package.json。
 */
export function findProfileDir(startDir: string): string | undefined {
  let dir = startDir
  for (let i = 0; i < 16; i++) {
    const pkg = readJson(join(dir, 'package.json'))
    if (pkg !== undefined && pkg.name !== TUI_PACKAGE
      && (pkg.dsh?.profile !== undefined || pkg.dependencies?.[TUI_PACKAGE] !== undefined)) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/** 读本包 version（向上找 name === TUI_PACKAGE 的 package.json）。 */
export function readOwnVersion(startDir: string): string | undefined {
  let dir = startDir
  for (let i = 0; i < 8; i++) {
    const pkg = readJson(join(dir, 'package.json'))
    if (pkg?.name === TUI_PACKAGE && typeof (pkg as { version?: unknown }).version === 'string') {
      return (pkg as { version: string }).version
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

export function readInstallSpec(profileDir: string): string | undefined {
  return readJson(join(profileDir, 'package.json'))?.dependencies?.[TUI_PACKAGE]
}

export function planSelfUpdate(input: {
  env: NodeJS.ProcessEnv
  currentVersion: string
  profileDir: string | undefined
  installSpec: string | undefined
  latest: string | null
}): UpdatePlan {
  if (!shouldCheckForUpdate(input.env)) {
    return { action: 'skip', reason: input.env.CI !== undefined || input.env.VITEST !== undefined ? 'ci' : 'env' }
  }
  if (input.profileDir === undefined) return { action: 'skip', reason: 'no-profile' }
  if (input.installSpec === undefined || !isNpmVersionSpec(input.installSpec)) {
    return { action: 'skip', reason: 'not-npm' }
  }
  if (input.latest === null || input.latest === '') return { action: 'skip', reason: 'no-latest' }
  if (input.latest === input.currentVersion) return { action: 'skip', reason: 'same' }
  return { action: 'update', latest: input.latest }
}

/** registry 基址链：官方源 → 国内镜像（npmmirror，完整 npm REST 镜像）。
 *  #43：registry.npmjs.org 直连不通的网络下，单源 3s 超时让启动检查恒失败。 */
export const UPDATE_REGISTRY_FALLBACKS = ['https://registry.npmjs.org', 'https://registry.npmmirror.com'] as const

/** 自定义 registry 链（逗号分隔多个；优先生效）——私有源/代理场景。 */
export const UPDATE_REGISTRY_ENV = 'DSH_TUI_UPDATE_REGISTRY'

/** 解析 registry 尝试链：DSH_TUI_UPDATE_REGISTRY 覆盖 > 官方 + npmmirror。 */
export function npmRegistryCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const custom = env[UPDATE_REGISTRY_ENV]
  if (custom !== undefined && custom.trim() !== '') {
    const list = custom.split(',').map(s => s.trim()).filter(s => s !== '')
    if (list.length > 0) return list
  }
  return [...UPDATE_REGISTRY_FALLBACKS]
}

/** fetchNpmLatest 的注入面（测试密封）。 */
export interface FetchLatestOptions {
  /** registry 基址链；缺省 npmRegistryCandidates()。 */
  registries?: string[]
  /** fetch 实现；缺省全局 fetch。 */
  fetchImpl?: typeof fetch
}

async function fetchLatestFromRegistry(
  baseUrl: string,
  packageName: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const url = `${baseUrl.replace(/\/$/, '')}/${packageName.replace('/', '%2f')}/latest`
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) return null
  const body = await res.json() as { version?: unknown }
  return typeof body.version === 'string' ? body.version : null
}

/**
 * 逐源查 latest：任一源拿到版本即返回——官方源超时/不可达时回退镜像。
 * 单源失败（超时/网络错/非 200）不中断链；全部源都网络错则抛最后一个错误
 * （保持启动「自更新失败」warning 语义，#43 之前行为）。全部源 200 但无
 * version → null（no-latest 静默跳过）。
 */
export async function fetchNpmLatest(packageName: string = TUI_PACKAGE, timeoutMs = 3_000, opts: FetchLatestOptions = {}): Promise<string | null> {
  const registries = opts.registries ?? npmRegistryCandidates()
  const fetchImpl = opts.fetchImpl ?? fetch
  let lastError: unknown
  let sawError = false
  for (const baseUrl of registries) {
    try {
      const version = await fetchLatestFromRegistry(baseUrl, packageName, timeoutMs, fetchImpl)
      if (version !== null) return version
    } catch (err) {
      sawError = true
      lastError = err
    }
  }
  if (sawError) throw lastError
  return null
}

// ── 更新检查磁盘缓存（免每启联网）─────────────────────────────

/** 缓存文件形状。 */
export interface UpdateCache {
  /** 写入时刻（Date.now()，毫秒）。 */
  timestamp: number
  /** 当时查得的 npm latest。 */
  latest: string
}

/** 读缓存；缺失/损坏/形状不对 → null（容错：缓存坏不挡更新检查）。 */
export function readUpdateCache(path: string): UpdateCache | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<UpdateCache>
    if (typeof raw.timestamp === 'number' && typeof raw.latest === 'string') {
      return { timestamp: raw.timestamp, latest: raw.latest }
    }
    return null
  } catch {
    return null
  }
}

/** 原子写缓存（tmp + rename）；失败静默（缓存只是优化，不是正确性依赖）。 */
export function writeUpdateCache(path: string, latest: string, now: number): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    const tmp = `${path}.${process.pid}.tmp`
    writeFileSync(tmp, `${JSON.stringify({ timestamp: now, latest } satisfies UpdateCache)}\n`)
    renameSync(tmp, path)
  } catch {
    // best-effort：磁盘不可写（只读 home/权限）时保持每启联网的原行为
  }
}

/** 缓存是否仍新鲜（age < TTL；时钟回拨到写入前视为新鲜）。 */
export function isCacheFresh(cache: UpdateCache, now: number, ttlMs = UPDATE_CACHE_TTL_MS): boolean {
  return now - cache.timestamp < ttlMs
}

/**
 * 带缓存的 latest 获取：新鲜缓存直接用（零联网）；否则打 registry 并回写。
 * 网络失败 → null（不回退旧值：旧值会让离线场景触发注定失败的安装尝试）。
 */
export async function fetchLatestWithCache(input: {
  cachePath: string
  now: number
  /** 网络获取函数（测试注入）；缺省真实 fetchNpmLatest。 */
  fetchNet?: () => Promise<string | null>
}): Promise<string | null> {
  const cached = readUpdateCache(input.cachePath)
  if (cached !== null && isCacheFresh(cached, input.now)) return cached.latest
  const fetched = await (input.fetchNet ?? fetchNpmLatest)()
  if (fetched !== null && fetched !== '') writeUpdateCache(input.cachePath, fetched, input.now)
  return fetched
}

export type PackageManager = 'pnpm' | 'npm' | 'yarn'

/**
 * 按 profile 锁文件探测包管理器（安装历史的确定性证据）：
 * pnpm-lock.yaml → pnpm；package-lock.json → npm；yarn.lock → yarn；
 * node_modules/.package-lock.json（npm v7+ 隐藏锁文件）→ npm；
 * 均无 → 默认 pnpm（历史行为；npm install 会重写 pnpm symlink 布局，更糟）。
 */
export function detectPackageManager(profileDir: string): PackageManager {
  if (existsSync(join(profileDir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(profileDir, 'package-lock.json'))) return 'npm'
  if (existsSync(join(profileDir, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(profileDir, 'node_modules', '.package-lock.json'))) return 'npm'
  return 'pnpm'
}

export interface InstallInvocation {
  /** win32 下为 cmd.exe（/d /c 派发 .cmd）；否则为包管理器可执行名。 */
  command: string
  args: string[]
  /** 错误消息用的人类可读标签，如 'pnpm add' / 'npm install'。 */
  label: string
}

/** 包管理器 → 安装调用。win32 经 cmd.exe /d /c 派发（.cmd 不能不经 shell 启动，
 *  DEP0190 约束保持：shell:false + args 数组）。 */
export function installCommandFor(pm: PackageManager, latest: string): InstallInvocation {
  const spec = `${TUI_PACKAGE}@${latest}`
  const sub = pm === 'npm' ? 'install' : 'add'
  const label = `${pm} ${sub}`
  const isWin = process.platform === 'win32'
  return isWin
    ? { command: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/c', pm, sub, spec], label }
    : { command: pm, args: [sub, spec], label }
}

export function installNpmVersion(latest: string, profileDir: string, timeoutMs = 60_000): Promise<void> {
  const { command, args, label } = installCommandFor(detectPackageManager(profileDir), latest)
  return new Promise((resolve, reject) => {
    // Windows 上 pnpm/npm/yarn 是 .cmd，spawn 直接执行会 EINVAL（.cmd 不能
    // 不经 shell 启动），传 'pnpm' 又会 ENOENT（无扩展名不在 PATH）。
    // 经 cmd.exe /d /c 显式派发：shell:false 时 args 作为 argv 传给
    // cmd.exe，不触发 Node DEP0190 弃用警告（shell:true + args 数组组合
    // 会把警告经 stderr 渲染进 TUI 输入框区域）。version 来自 npm registry
    // 的 semver 字符串，字符集受限（无空格/引号/&|<> 等元字符），实际注入
    // 面低；cmd /c 对参数数组按 argv 传递，不拼 shell 字符串。
    const child = spawn(command, args, {
      cwd: profileDir,
      stdio: 'ignore',
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`${label} timed out`))
    }, timeoutMs)
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`${label} exited ${code ?? 'null'}`))
    })
  })
}

/**
 * 对照 npm latest；需要时在 profile 里安装。失败不抛（启动不能被更新拖死）。
 */
export async function runSelfUpdate(opts: RunSelfUpdateOptions = {}): Promise<UpdateResult> {
  const env = opts.env ?? process.env
  const startDir = opts.startDir ?? process.cwd()
  const profileDir = opts.profileDir ?? findProfileDir(startDir)
  const currentVersion = opts.currentVersion ?? readOwnVersion(startDir) ?? ''
  const installSpec = opts.installSpec ?? (profileDir === undefined ? undefined : readInstallSpec(profileDir))
  try {
    // 注入缝优先（测试密封化）；真实路径走 1h 磁盘缓存免每启联网
    const latest = opts.fetchLatest !== undefined
      ? await opts.fetchLatest()
      : await fetchLatestWithCache({
          cachePath: opts.cachePath ?? defaultUpdateCachePath(),
          now: opts.now?.() ?? Date.now(),
        })
    const plan = planSelfUpdate({ env, currentVersion, profileDir, installSpec, latest })
    if (plan.action === 'skip') return { kind: 'noop' }
    if (profileDir === undefined) return { kind: 'noop' }
    const install = opts.install ?? installNpmVersion
    await install(plan.latest, profileDir)
    return { kind: 'updated', version: plan.latest }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { kind: 'failed', error }
  }
}

export function updateNoticeText(version: string): string {
  return `插件已更新到 ${version}。输入 /restart 立即生效（或 Ctrl+Q 退出后重新启动 dsh）`
}

/** 失败提示里的手动更新命令包名（app 侧文案引用）。 */
export const updateNoticePackage = TUI_PACKAGE

/** 更新后将自动重启（autoRestartOnUpdate）时的提示。 */
export function autoRestartNoticeText(version: string): string {
  return `插件已更新到 ${version}，正在自动重启…`
}
