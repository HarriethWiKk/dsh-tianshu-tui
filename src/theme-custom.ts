/**
 * 用户自定义主题加载 — `~/.dsh-tui/themes/*.json`。
 *
 * 文件格式（语义 token 局部覆盖，缺省继承 base 主题）：
 * ```json
 * {
 *   "base": "cobalt",
 *   "background": "dark",
 *   "description": "My theme",
 *   "colors": { "primary": "#ff8800", "toolEdit": "#88ccff" },
 *   "overrides": { "userColor": "#ffffff" }
 * }
 * ```
 * 文件名（去 .json）即主题名，引用方式 `custom:<name>`。
 * 单个文件解析失败只跳过该文件（警告走 onWarning 回调/stderr 出口），不影响其他主题与启动。
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, basename } from 'node:path'
import {
  getActiveThemeBackground,
  getActiveThemeName,
  getTheme,
  registerCustomTheme,
  type CustomThemeInput,
  type ColorSet,
  type ThemeOverrides,
} from './theme.js'
import { THEME_PALETTES } from './theme-palettes.js'
import { validateThemeContrast } from './theme-contrast.js'

/** 默认自定义主题根目录（`~/.dsh-tui`；源 `rivetHome()` 为天枢路径，移植时改为本包路径）。 */
function defaultThemesRoot(): string {
  return join(homedir(), '.dsh-tui')
}

/**
 * 自定义主题目录。
 * @param base - 根目录（测试注入）；缺省 `~/.dsh-tui`。
 * @returns `<base>/themes` 路径。
 */
export function customThemesDir(base?: string): string {
  return join(base ?? defaultThemesRoot(), 'themes')
}

const HEX_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/

const COLOR_KEYS: readonly (keyof ColorSet)[] = [
  'primary', 'secondary', 'success', 'warning', 'error', 'dim',
  'pulseQuiet', 'pulseActive', 'pulseAlert',
  'toolShell', 'toolEdit', 'toolTest', 'toolDelegate',
]

const OVERRIDE_KEYS: readonly (keyof ThemeOverrides)[] = [
  'userColor', 'assistantColor', 'muted', 'systemColor',
]

function pickHexFields<K extends string>(raw: unknown, keys: readonly K[]): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {}
  if (typeof raw !== 'object' || raw === null) return out
  for (const key of keys) {
    const v = (raw as Record<string, unknown>)[key]
    if (typeof v === 'string' && HEX_RE.test(v)) out[key] = v
  }
  return out
}

/**
 * 解析单个自定义主题 JSON → CustomThemeInput。结构非法返回 null。
 * @param text - 主题文件的原始 JSON 文本。
 * @returns 过滤掉非法字段后的主题输入；JSON 或顶层结构非法时为 null。
 */
export function parseCustomThemeJson(text: string): CustomThemeInput | null {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return null }
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>

  const input: CustomThemeInput = {}
  if (typeof obj.base === 'string' && obj.base in THEME_PALETTES) {
    input.base = obj.base as keyof typeof THEME_PALETTES
  }
  if (obj.background === 'dark' || obj.background === 'light') input.background = obj.background
  if (typeof obj.description === 'string') input.description = obj.description
  input.colors = pickHexFields(obj.colors, COLOR_KEYS)
  input.overrides = pickHexFields(obj.overrides, OVERRIDE_KEYS)
  return input
}

/** 主题名合法性：字母数字、连字符、下划线（避免 `custom:` 引用歧义/路径注入）。 */
const NAME_RE = /^[A-Za-z0-9_-]+$/

/**
 * 扫描并注册全部自定义主题。返回成功注册的裸名列表。
 * 目录不存在 → 空列表（不是错误）。
 * 解析失败/低对比警告：onWarning 注入时路由给回调（TUI 装配收集后落 scrollback），
 * 缺省写 process.stderr（pre-TUI / 独立调用保持可见）。
 * @param baseDir - 根目录（测试注入）；缺省 `~/.dsh-tui`。
 * @param onWarning - 警告收集回调；缺省写 stderr（`[theme] ` 前缀，对齐历史文案）。
 * @returns 成功注册的主题裸名（不含 `custom:` 前缀）。
 */
export function loadCustomThemes(baseDir?: string, onWarning?: (message: string) => void): string[] {
  const dir = customThemesDir(baseDir)
  let files: string[]
  try {
    files = readdirSync(dir).filter(f => f.endsWith('.json'))
  } catch {
    return []
  }
  // 警告出口：回调优先（TUI 收集），缺省 stderr。
  const warn = (message: string): void => {
    if (onWarning !== undefined) onWarning(message)
    else process.stderr.write(`[theme] ${message}\n`)
  }
  const loaded: string[] = []
  for (const file of files) {
    const name = basename(file, '.json')
    if (!NAME_RE.test(name)) continue
    try {
      const input = parseCustomThemeJson(readFileSync(join(dir, file), 'utf8'))
      if (!input) {
        warn(`skip invalid custom theme: ${file}`)
        continue
      }
      // 对比度警告（fail-open）：对声明背景 < 3.0 的 token 提示，不阻断注册。
      const issues = validateThemeContrast(
        { ...input.colors, ...input.overrides },
        input.background ?? 'dark',
      )
      if (issues.length > 0) {
        const list = issues.map(i => `${i.token}(${i.value} ×${i.ratio.toFixed(1)})`).join(', ')
        warn(`low contrast in ${file}: ${list}`)
      }
      registerCustomTheme(name, input)
      loaded.push(name)
    } catch {
      warn(`failed to read custom theme: ${file}`)
    }
  }
  return loaded
}

/**
 * 当前生效主题导出为自定义主题模板（/theme export；P1）。
 * 全量 dump truecolor ColorSet + overrides，base 取内置同名或按背景朝向回退；
 * 写盘成功后就地注册（当场 `/theme custom:<name>` 可用），编辑文件后重启生效。
 * @param nameArg - 目标主题裸名（缺省 `exported-<当前名>`）；非法字符净化为 `-`。
 * @param baseDir - 根目录（测试注入）；缺省 `~/.dsh-tui`。
 * @returns 回显消息（成功含路径；失败含原因）。
 */
export function exportCurrentTheme(nameArg?: string, baseDir?: string): string {
  const active = getActiveThemeName()
  const name = (nameArg ?? `exported-${active.replace(/^custom:/, '')}`).replace(/[^A-Za-z0-9_-]/g, '-')
  if (name === '') return '导出失败：主题名净化后为空'
  const theme = getTheme()
  const template = {
    base: Object.hasOwn(THEME_PALETTES, active) ? active : (getActiveThemeBackground() === 'light' ? 'paper' : 'graphite'),
    description: `exported from ${active} @ ${new Date().toISOString().slice(0, 10)}`,
    colors: {
      primary: theme.primary,
      secondary: theme.secondary,
      success: theme.success,
      warning: theme.warning,
      error: theme.error,
      dim: theme.dim,
      pulseQuiet: theme.pulseQuiet,
      pulseActive: theme.pulseActive,
      pulseAlert: theme.pulseAlert,
    },
    overrides: {
      userColor: theme.userColor,
      assistantColor: theme.assistantColor,
      muted: theme.muted,
      systemColor: theme.systemColor,
    },
  }
  const dir = customThemesDir(baseDir)
  const file = join(dir, `${name}.json`)
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, `${JSON.stringify(template, null, 2)}\n`)
  } catch (err) {
    return `导出失败：${err instanceof Error ? err.message : String(err)}`
  }
  // 就地注册（不重启可用）；注册失败只影响当场切换，不影响已写盘的模板。
  const parsed = parseCustomThemeJson(JSON.stringify(template))
  if (parsed) registerCustomTheme(name, parsed)
  return `主题模板已导出: ${file}（可用 /theme custom:${name}；编辑文件后重启生效）`
}
