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

/**
 * 是否允许发系统通知。
 * 关闭条件：DSH_TUI_SKIP_NOTIFY、VITEST、CI、SSH_*。
 */
export function shouldNotify(env: NodeJS.ProcessEnv): boolean {
  if (flag(env, SKIP_NOTIFY_ENV)) return false
  if (flag(env, 'VITEST')) return false
  if (flag(env, 'CI')) return false
  if (nonempty(env, 'SSH_CONNECTION') || nonempty(env, 'SSH_CLIENT') || nonempty(env, 'SSH_TTY')) {
    return false
  }
  return true
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
  if (!shouldNotify(env)) return false
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
export function notifyOs(payload: NotifyPayload): void {
  void sendOsNotify(payload)
}
