/**
 * agent 错误 → 恢复指引尾注（format/error-recovery.ts）——纯函数，可单测。
 *
 * 模式识别表（顺序即优先级，先命中先返回）：
 * - 401 / unauthorized / 鉴权                          → /key 重新配置
 * - context overflow / context length / too long / 长度 → /compact 压缩上下文
 * - timeout / timed out / 网络 / ECONN（ECONNREFUSED 等）→ ↑ 收回重发
 * - 兜底                                                → Esc 打断 · ↑ 重发 · /session 换会话
 */
import { color } from '../engine/ansi.js'
import type { RivetTheme } from '../theme.js'

/**
 * 识别 agent 错误文本，返回恢复操作指引（echoWarn hint 尾注的数据源）。
 * @param message - 错误全文（大小写不敏感；鉴权/超长/超时三族 + 兜底）。
 * @returns 一行可操作的恢复指引。
 */
export function errorRecoveryHint(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('401') || m.includes('unauthorized') || m.includes('鉴权')) return '/key 重新配置'
  if (m.includes('context overflow') || m.includes('context length') || m.includes('too long') || m.includes('长度')) return '/compact 压缩上下文'
  if (m.includes('timeout') || m.includes('timed out') || m.includes('网络') || m.includes('econn')) return '↑ 收回重发'
  return 'Esc 打断 · ↑ 重发 · /session 换会话'
}

/**
 * 警告行 + 可选恢复指引尾随行的着色组装（echoWarn 与 renderLive 错误落底共用）：
 * 警告走 warning 色，尾随行 dim 色 `  ↳ <hint>`（缩进对齐既有「  · 」多行指引风格）。
 * @param text - 警告正文（可多行）。
 * @param hint - 恢复指引；undefined 时只有警告行。
 * @param theme - 取 warning/dim 两色。
 * @returns 着色后的 1-2 行 ANSI 文本。
 */
export function formatWarnWithHint(text: string, hint: string | undefined, theme: Pick<RivetTheme, 'warning' | 'dim'>): string {
  const head = color(text, theme.warning)
  return hint === undefined ? head : `${head}\n${color(`  ↳ ${hint}`, theme.dim)}`
}
