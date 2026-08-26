/**
 * os-notify — 后台完成时的系统通知（纯展示侧，失败静默）。
 *
 * 固定 argv（execFile 数组，不走 shell）。SSH / CI / 测试 / DSH_TUI_SKIP_NOTIFY
 * 不发。用户文案经 sanitize + 平台引号转义后再进参数。
 *
 * @module @huiliyi37/dsh-tianshu-tui/os-notify
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** 设为 1/true 时关闭系统通知。 */
export const SKIP_NOTIFY_ENV = 'DSH_TUI_SKIP_NOTIFY'

export interface NotifyPayload {
  title: string
  body: string
}

export interface NotifyPlan {
  bin: string
  args: string[]
}

export interface SendOsNotifyOptions {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  execFile?: (bin: string, args: string[]) => Promise<unknown>
  /** 用户偏好；`notifyOs === false` 时不发（缺省开）。 */
  prefs?: { notifyOs?: boolean }
}

/** /config notify 参数：开 / 关 / 切换；空串不解析。 */
export type NotifyOsAction = 'on' | 'off' | 'toggle'

/** 面板终端段：锁定时 notifyOs 为关。 */
export interface ConfigTuiInput {
  notifyOs: boolean
  notifyLocked: boolean
}

/** 压扁控制字符并截断，避免通知中心/脚本被换行拆开。 */
export function sanitizeNotifyText(text: string, max: number): string {
  const flat = text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return `${[...flat].slice(0, Math.max(0, max - 1)).join('')}…`
}

/** AppleScript 双引号字符串（`"` 与 `\` 转义）。 */
export function quoteAppleScript(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** PowerShell 单引号字符串（`'` → `''`）。 */
export function quotePowerShell(text: string): string {
  return `'${text.replace(/'/g, "''")}'`
}

function nonempty(env: NodeJS.ProcessEnv, key: string): boolean {
  const v = env[key]
  return v !== undefined && v !== ''
}

function flag(env: NodeJS.ProcessEnv, key: string): boolean {
  const v = env[key]
  return v === '1' || v === 'true'
}

/** 用户显式设了 DSH_TUI_SKIP_NOTIFY 时，面板开关不可切。 */
export function notifyOsEnvLocked(env: NodeJS.ProcessEnv = process.env): boolean {
  return flag(env, SKIP_NOTIFY_ENV)
}

/**
 * 是否允许发系统通知。
 * 关闭条件：用户偏好关、DSH_TUI_SKIP_NOTIFY、VITEST、CI、SSH_*。
 */
export function shouldNotify(env: NodeJS.ProcessEnv, prefs?: { notifyOs?: boolean }): boolean {
  if (prefs?.notifyOs === false) return false
  if (flag(env, SKIP_NOTIFY_ENV)) return false
  if (flag(env, 'VITEST')) return false
  if (flag(env, 'CI')) return false
  if (nonempty(env, 'SSH_CONNECTION') || nonempty(env, 'SSH_CLIENT') || nonempty(env, 'SSH_TTY')) {
    return false
  }
  return true
}

/** 空参 → null（打开面板）；notify [on|off]；其余 usage。 */
export function parseConfigNotifyArg(text: string): NotifyOsAction | 'usage' | null {
  const parts = text.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  if (parts[0] !== 'notify') return 'usage'
  if (parts.length === 1) return 'toggle'
  if (parts[1] === 'on') return 'on'
  if (parts[1] === 'off') return 'off'
  return 'usage'
}

/** 就地改 prefs；环境变量锁定时只警告。 */
export function applyNotifyOsPref(
  prefs: { notifyOs?: boolean },
  action: NotifyOsAction,
  env: NodeJS.ProcessEnv = process.env,
): { echo?: string; warn?: string } {
  if (notifyOsEnvLocked(env)) {
    return { warn: '⚠ 系统通知已被 DSH_TUI_SKIP_NOTIFY 关闭' }
  }
  const next = action === 'toggle' ? prefs.notifyOs === false : action === 'on'
  prefs.notifyOs = next
  return { echo: `系统通知已${next ? '开' : '关'}` }
}

/** 面板终端段：锁定时显示关。 */
export function configTuiFromPrefs(
  prefs: { notifyOs?: boolean },
  env: NodeJS.ProcessEnv = process.env,
): ConfigTuiInput {
  const locked = notifyOsEnvLocked(env)
  return { notifyOs: !locked && prefs.notifyOs !== false, notifyLocked: locked }
}

/**
 * 平台通知命令计划；未知平台或空文案 → null。
 */
export function planOsNotify(payload: NotifyPayload, platform: NodeJS.Platform): NotifyPlan | null {
  const title = sanitizeNotifyText(payload.title, 80)
  const body = sanitizeNotifyText(payload.body, 200)
  if (title === '' && body === '') return null
  if (platform === 'darwin') {
    return {
      bin: 'osascript',
      args: ['-e', `display notification ${quoteAppleScript(body)} with title ${quoteAppleScript(title)}`],
    }
  }
  if (platform === 'linux') {
    return { bin: 'notify-send', args: [title, body] }
  }
  if (platform === 'win32') {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$n = New-Object System.Windows.Forms.NotifyIcon',
      '$n.Icon = [System.Drawing.SystemIcons]::Information',
      '$n.Visible = $true',
      `$n.ShowBalloonTip(4000, ${quotePowerShell(title)}, ${quotePowerShell(body)}, [System.Windows.Forms.ToolTipIcon]::Info)`,
      'Start-Sleep -Milliseconds 400',
    ].join('; ')
    return { bin: 'powershell', args: ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script] }
  }
  return null
}

function defaultExec(bin: string, args: string[]): Promise<unknown> {
  return execFileAsync(bin, args, {
    timeout: 5_000,
    windowsHide: true,
    maxBuffer: 64 * 1024,
  })
}

/**
 * 发送系统通知。门闸关闭 / 无计划 / exec 失败 → false，永不抛。
 */
export async function sendOsNotify(
  payload: NotifyPayload,
  opts: SendOsNotifyOptions = {},
): Promise<boolean> {
  const env = opts.env ?? process.env
  if (!shouldNotify(env, opts.prefs)) return false
  const plan = planOsNotify(payload, opts.platform ?? process.platform)
  if (plan === null) return false
  const run = opts.execFile ?? defaultExec
  try {
    await run(plan.bin, plan.args)
    return true
  } catch {
    return false
  }
}

/** 装配层 fire-and-forget（测试环境因 VITEST 门闸自动空操作）。 */
export function notifyOs(payload: NotifyPayload, prefs?: { notifyOs?: boolean }): void {
  void sendOsNotify(payload, { prefs })
}
