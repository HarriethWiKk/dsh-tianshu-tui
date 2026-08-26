/**
 * /config 设置面板（纯函数层，T3.2）。
 *
 * projectConfigPanel 把终端偏好 + 宿主投影渲染为面板行：
 * - 终端段（可选 tui）：系统通知开关；缺省不渲染（旧投影无此字段）。
 * - 宿主设置段：每个命名空间一行（ns + 值 + secrets 脱敏标记）——值以
 *   unknown 流动，null/undefined 渲染 —，object 紧凑 JSON；secret 槽用 🔒
 *   标记。空数组不渲染该段。
 * - 权限预设选择器：选项名从投影动态取，当前值 ✓、其余 ○；仅 'custom'
 *   保留字——currentValue 为 custom 而选项缺失时补一行。permission 为
 *   null 时不渲染。
 * - 凭据徽章：ref + 已配置/未配置 + source + 可写/只读；writable 为
 *   false 时整行 DIM 置灰。空数组不渲染该段。
 * - 底栏：有 tui 时提示 n 切换 / 环境变量锁定。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/config-panel
 */

import { displayWidth } from './width.js'
import type { ConfigTuiInput } from './os-notify.js'

export type { ConfigTuiInput }

/** 面板标题行。 */
const TITLE = '⚙ 配置'
/** 终端偏好段标题。 */
const TUI_TITLE = '◆ 终端'
/** 宿主设置段标题。 */
const SETTINGS_TITLE = '◆ 宿主设置'
/** 权限预设段标题。 */
const PERMISSION_TITLE = '◆ 权限预设'
/** 凭据段标题。 */
const CREDENTIALS_TITLE = '◆ 凭据'
/** 底栏：可切换。 */
const HINT_TOGGLE = 'n 切换系统通知 · /config 关闭'
/** 底栏：环境变量锁定。 */
const HINT_LOCKED = 'n 环境变量已关闭通知'
/** 置灰（细体/暗色）转义序列：只读凭据行整行包裹。 */
const DIM = '\x1B[2m'
/** SGR 重置转义序列。 */
const RESET = '\x1B[0m'
/** 当前选中选项标记。 */
const CHECK = '✓'
/** 非当前选项标记。 */
const CIRCLE = '○'
/** 已配置徽章。 */
const CONFIGURED = '● 已配置'
/** 未配置徽章。 */
const UNCONFIGURED = '○ 未配置'
/** 权限预设唯一保留字：派生自 knob 组合、不在预设表中的当前值。 */
const CUSTOM = 'custom'

/**
 * 设置命名空间描述符（结构兼容 dsh-settings 的 SettingsDescriptor；纯函数层
 * 只消费 ns/value/secrets，schema/revision/base/user/applies 不参与渲染）。
 */
export interface ConfigSettingsDescriptorInput {
  /** 注册的命名空间（kebab-case）。 */
  ns: string
  /** 当前解析值；以 unknown 流动（值形状由各命名空间 schema 决定）。 */
  value: unknown
  /**
   * schema 声明的 secret 槽（结构兼容 RedactedSecret：path/set）——
   * redactSecrets 之后的描述符才携带；有值槽显示已脱敏计数，空槽显示槽位。
   */
  secrets?: { path: string[]; set: boolean }[]
}

/** 权限预设选项（结构兼容 dsh-permission 的 PresetOption）。 */
export interface ConfigPresetOptionInput {
  /** 稳定选项值：预设表键，或保留字 custom。 */
  value: string
  /** 显示标签。 */
  name: string
}

/** 权限投影（结构兼容 dsh-permission 的 PermissionSelect）。 */
export interface ConfigPermissionInput {
  /** 可切换预设（当前为 custom 时含 custom 项）；选项名动态取，不硬编码。 */
  options: ConfigPresetOptionInput[]
  /** 生效当前值：预设表键或保留字 custom。 */
  currentValue: string
}

/** 凭据信息（结构兼容 dsh-credentials 的 CredentialInfo，附 ref 键）。 */
export interface ConfigCredentialInput {
  /** 凭据引用（POSIX 环境变量名形状）。 */
  ref: string
  /** 当前是否已配置（resolve 有值）。 */
  configured: boolean
  /** 供应层 id（env/file/project-env/user-env）；未配置时缺省。 */
  source?: string
  /** 是否可写（set 当前会成功）；false 时整行置灰。 */
  writable: boolean
}

/** /config 面板投影：终端偏好 + 宿主设置 + 权限预设 + 凭据。 */
export interface ConfigPanelProjection {
  /** 命名空间描述符列表；空数组 → 不渲染宿主设置段。 */
  settings: ConfigSettingsDescriptorInput[]
  /** 权限选择投影；null（未组合权限服务）→ 选择器段不渲染。 */
  permission: ConfigPermissionInput | null
  /** 凭据信息列表；空数组 → 不渲染凭据段。 */
  credentials: ConfigCredentialInput[]
  /** TUI 本地偏好（系统通知）；缺省不渲染终端段。 */
  tui?: ConfigTuiInput
}

/** 面板选项。 */
export interface ConfigPanelOptions {
  /** 终端列数（行截断预算，含标题与段标题）。 */
  width: number
}

/**
 * 投影终端偏好 + 宿主三段为 /config 面板行。
 * 空宿主段不渲染；有 tui 时终端段置顶、底栏提示切换键。
 */
export function projectConfigPanel(projection: ConfigPanelProjection, opts: ConfigPanelOptions): string[] {
  const rows = [truncateByWidth(TITLE, opts.width)]
  if (projection.tui !== undefined) {
    rows.push(...projectTuiSection(projection.tui, opts.width))
  }
  rows.push(...projectSettingsSection(projection.settings, opts.width))
  if (projection.permission !== null) {
    rows.push(...projectPermissionSection(projection.permission, opts.width))
  }
  rows.push(...projectCredentialsSection(projection.credentials, opts.width))
  if (projection.tui !== undefined) {
    const hint = projection.tui.notifyLocked ? HINT_LOCKED : HINT_TOGGLE
    rows.push(truncateByWidth(hint, opts.width))
  }
  return rows
}

/** 终端段：系统通知 ●开 / ○关；锁定时附环境变量名。 */
function projectTuiSection(tui: ConfigTuiInput, width: number): string[] {
  const mark = tui.notifyOs ? '●' : CIRCLE
  const state = tui.notifyLocked ? '关（DSH_TUI_SKIP_NOTIFY）' : tui.notifyOs ? '开' : '关'
  return [
    truncateByWidth(TUI_TITLE, width),
    truncateByWidth(`  ${mark} 系统通知 · ${state}`, width),
  ]
}

/** 宿主设置段：空数组不渲染。 */
function projectSettingsSection(settings: ConfigSettingsDescriptorInput[], width: number): string[] {
  if (settings.length === 0) return []
  const rows = [truncateByWidth(SETTINGS_TITLE, width)]
  for (const desc of settings) {
    rows.push(truncateByWidth(`  ${desc.ns} · ${formatValue(desc.value)}${secretMark(desc.secrets)}`, width))
  }
  return rows
}

/**
 * unknown 值 → 显示文本。string/number/boolean 直出；object/array 紧凑
 * JSON；symbol/function/bigint 顶层值属于数据违约（JSON-shaped 契约不可
 * 达），回退显示类型名防渲染崩溃。
 * @param value - 设置命名空间的当前解析值。
 * @returns 显示文本（null/undefined → —）。
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '—'
  switch (typeof value) {
    case 'string':
      return value
    case 'number':
      return String(value)
    case 'boolean':
      return String(value)
    case 'symbol':
    case 'function':
    case 'bigint':
      // 数据违约兜底：JSON-shaped 契约下不可达，显示类型名防渲染崩溃。
      return typeof value
    default:
      // 只剩 object/array。TS lib 签名 string | undefined，oxlint 类型模型
      // string——断言对齐两方，JSON-shaped 契约保证运行时非 undefined。
      return JSON.stringify(value) as string
  }
}

/**
 * secrets 脱敏标记：无槽/空数组 → 无标记；有已脱敏值 → 计数标记；仅空槽 → 槽位标记。
 * @param secrets - schema 声明的 secret 槽（redactSecrets 后的描述符携带）。
 * @returns 行内脱敏标记后缀（无槽时为空串）。
 */
function secretMark(secrets: ConfigSettingsDescriptorInput['secrets']): string {
  if (secrets === undefined || secrets.length === 0) return ''
  const set = secrets.filter(s => s.set).length
  return set > 0 ? ` 🔒 ${set} 密钥已脱敏` : ' 🔒 密钥槽'
}

/** 权限预设段：段标题 + 每个选项一行（当前 ✓ / 其余 ○）；custom 保留字缺失时补行。 */
function projectPermissionSection(permission: ConfigPermissionInput, width: number): string[] {
  const rows = [truncateByWidth(PERMISSION_TITLE, width)]
  const options = [...permission.options]
  if (permission.currentValue === CUSTOM && !options.some(opt => opt.value === CUSTOM)) {
    options.push({ value: CUSTOM, name: CUSTOM })
  }
  for (const opt of options) {
    const mark = opt.value === permission.currentValue ? CHECK : CIRCLE
    rows.push(truncateByWidth(`  ${mark} ${opt.name}`, width))
  }
  return rows
}

/** 凭据段：空数组不渲染。 */
function projectCredentialsSection(credentials: ConfigCredentialInput[], width: number): string[] {
  if (credentials.length === 0) return []
  const rows = [truncateByWidth(CREDENTIALS_TITLE, width)]
  for (const cred of credentials) {
    rows.push(projectCredentialRow(cred, width))
  }
  return rows
}

/**
 * 单个凭据徽章行：ref + 已配置/未配置 + source + 可写/只读；writable 为
 * false 时整行（截断后）DIM 置灰。
 * @param cred - 凭据信息。
 * @param width - 行截断预算。
 * @returns 徽章行（只读时含 ANSI）。
 */
function projectCredentialRow(cred: ConfigCredentialInput, width: number): string {
  const configured = cred.configured ? CONFIGURED : UNCONFIGURED
  const source = cred.source === undefined ? '' : ` · ${cred.source}`
  const writable = cred.writable ? '可写' : '只读'
  const row = truncateByWidth(`  ${cred.ref} ${configured}${source} · ${writable}`, width)
  return cred.writable ? row : `${DIM}${row}${RESET}`
}

/** 按显示宽度截断字符串（仅发生截断时尾部补 …；极端窄宽退化为 …）。 */
function truncateByWidth(text: string, max: number): string {
  if (max <= 1) return '…'
  let out = ''
  let w = 0
  for (const ch of text) {
    const cw = displayWidth(ch)
    if (w + cw > max - 1) break
    out += ch
    w += cw
  }
  return w < displayWidth(text) ? `${out}…` : out
}
