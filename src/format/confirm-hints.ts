/**
 * 双击布防提示行（format/confirm-hints.ts）— live 区布防反馈。
 *
 * 「再按 Ctrl+C 退出」「再按 Esc 打开 rewind」两条提示同一模式：数据源是
 * action registry 的 confirmMs 布防时间戳（confirmSince），窗口内渲染一行
 * muted 提示、窗口过期撤防自清（组合器副作用——与 taskNotice 渲染后清空同款，
 * 纯函数层不承担可变状态）。TuiApp.renderLive 每帧调用；未布防零行。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/format/confirm-hints
 */

import {
  EXIT_WINDOW_MS,
  REWIND_DOUBLE_ESC_MS,
  type ActionRegistry,
} from '../actions/registry.js'
import { color } from '../engine/ansi.js'
import type { LiveRegionLine } from '../engine/live-engine.js'
import type { RivetTheme } from '../theme.js'

/** 提示表：动作 id + 确认窗口 + 文案（表序即渲染序）。 */
const CONFIRM_HINTS = [
  ['app.interrupt', EXIT_WINDOW_MS, '再按 Ctrl+C 退出 · Ctrl+Q 立即退出'],
  ['session.rewind', REWIND_DOUBLE_ESC_MS, '再按 Esc 打开 rewind'],
] as const

/**
 * 把处于布防窗口内的动作提示行推入 live 行集；过期布防撤防自清。
 * @param actions - 动作注册表（confirmSince 数据源 / confirmDisarm 自清）。
 * @param lines - live 区行集（就地追加）。
 * @param theme - 当前主题（提示行 muted）。
 * @param now - 当前时间戳（注入便于测试）。
 */
export function pushConfirmHints(
  actions: ActionRegistry,
  lines: LiveRegionLine[],
  theme: RivetTheme,
  now = Date.now(),
): void {
  for (const [id, windowMs, text] of CONFIRM_HINTS) {
    const since = actions.confirmSince(id)
    if (since === 0) continue
    if (now - since >= windowMs) {
      actions.confirmDisarm(id)
      continue
    }
    lines.push({ text: color(text, theme.muted) })
  }
}
