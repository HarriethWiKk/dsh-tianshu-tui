/**
 * 启动时对照 npm `latest`，把 profile 里的本包升到新版本。
 * 已加载的模块不会热替换——更新落盘后需重启才生效。
 *
 * @module @huiliyi37/dsh-tianshu-tui/self-update
 */

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 与 package.json name 对齐；profile 依赖键、npm 包名都用它。 */
export const TUI_PACKAGE = '@huiliyi37/dsh-tianshu-tui'

/** 显式关闭启动自更新（测试 / 不想联网）。 */
export const SKIP_UPDATE_ENV = 'DSH_TUI_SKIP_UPDATE'

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

export async function fetchNpmLatest(packageName: string = TUI_PACKAGE, timeoutMs = 3_000): Promise<string | null> {
  const url = `https://registry.npmjs.org/${packageName.replace('/', '%2f')}/latest`
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) return null
  const body = await res.json() as { version?: unknown }
  return typeof body.version === 'string' ? body.version : null
}

export function installNpmVersion(latest: string, profileDir: string, timeoutMs = 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    // Windows 上 pnpm 是 pnpm.cmd，spawn 直接执行会 EINVAL（.cmd 不能
    // 不经 shell 启动），传 'pnpm' 又会 ENOENT（无扩展名不在 PATH）。
    // 经 cmd.exe /d /c 显式派发：shell:false 时 args 作为 argv 传给
    // cmd.exe，不触发 Node DEP0190 弃用警告（shell:true + args 数组组合
    // 会把警告经 stderr 渲染进 TUI 输入框区域）。version 来自 npm registry
    // 的 semver 字符串，字符集受限（无空格/引号/&|<> 等元字符），实际注入
    // 面低；cmd /c 对参数数组按 argv 传递，不拼 shell 字符串。
    const isWin = process.platform === 'win32'
    const command = isWin ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm'
    const args = isWin
      ? ['/d', '/c', 'pnpm', 'add', `${TUI_PACKAGE}@${latest}`]
      : ['add', `${TUI_PACKAGE}@${latest}`]
    const child = spawn(command, args, {
      cwd: profileDir,
      stdio: 'ignore',
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('pnpm add timed out'))
    }, timeoutMs)
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`pnpm add exited ${code ?? 'null'}`))
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
    const latest = opts.fetchLatest === undefined ? await fetchNpmLatest() : await opts.fetchLatest()
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
  return `插件已更新到 ${version}，请重启 dsh 后生效`
}

/** 更新后将自动重启（autoRestartOnUpdate）时的提示。 */
export function autoRestartNoticeText(version: string): string {
  return `插件已更新到 ${version}，正在自动重启…`
}
