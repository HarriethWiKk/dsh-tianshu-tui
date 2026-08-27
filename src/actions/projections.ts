/**
 * actions/projections — 展示面投影：keymap 条目 / footer 提示段从动作表生成。
 *
 * 键位提示的三份事实源收敛为动作表后的消费端：
 * - projectKeymapEntries：global 域 + keymapOrder 非缺省 + 非 keymapHidden 的
 *   动作投影为 keymap 行，与输入层静态补充行（Enter 提交、Ctrl+U 等 InputLine
 *   内部键位——不经 action registry 路由）按 order 归并。
 * - projectApprovalHints / projectInspectHints：footer 上下文提示段
 *   （approval 域动作按注册序取 footerHint）。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/actions/projections
 */

import type { ActionContext, KeyAction, KeyBinding } from './types.js'

/** 键位列展示名（keymap 用）：语义名 → 惯用写法。 */
const KEY_LABELS: Partial<Record<string, string>> = {
  return: 'Enter',
  escape: 'Esc',
  tab: 'Tab',
  backspace: 'Backspace',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  shift_tab: 'Shift+Tab',
  space: 'Space',
}

/**
 * 单绑定展示名：ctrl_n → Ctrl+N、ctrl_. → Ctrl+.、up → ↑；char 绑定取字符本身；
 * meta 约束加 Alt+ 前缀。
 * @param binding - 键位绑定。
 * @returns keymap 键位列文本。
 */
export function keyBindingLabel(binding: KeyBinding): string {
  let base: string
  if (binding.name !== undefined) {
    const known = KEY_LABELS[binding.name as string]
    if (known !== undefined) base = known
    else if (binding.name.startsWith('ctrl_')) base = `Ctrl+${binding.name.slice(5).toUpperCase()}`
    else base = binding.name
  } else {
    base = binding.char ?? '?'
  }
  return binding.meta === true ? `Alt+${base}` : base
}

/** 动作键位列缺省展示：多绑定以 / 连接（↑/↓）。 */
export function keyBindingsLabel(keys: readonly KeyBinding[]): string {
  return keys.map(keyBindingLabel).join('/')
}

/** keymap 投影行（与 format/keymap-panel 的 KeymapEntry 同构）。 */
export interface ProjectedKeymapEntry {
  /** 键位列（如 'Ctrl+P'）。 */
  keys: string
  /** 动作说明列。 */
  action: string
}

/**
 * keymap 面板条目投影：动作表（global 域、keymapOrder 非缺省、非 keymapHidden）
 * 与输入层静态补充行按 order 归并排序。
 * @param actions - 动作表（registry.list()）。
 * @param extra - 输入层静态补充行（带 order 对齐原表序）。
 * @returns 归并排序后的 keymap 条目。
 */
export function projectKeymapEntries(
  actions: readonly KeyAction[],
  extra: readonly (ProjectedKeymapEntry & { order: number })[] = [],
): ProjectedKeymapEntry[] {
  const rows: Array<ProjectedKeymapEntry & { order: number }> = [...extra]
  for (const action of actions) {
    if (action.keymapHidden === true || action.keymapOrder === undefined) continue
    if ((action.context ?? 'global') !== 'global') continue
    rows.push({
      order: action.keymapOrder,
      keys: action.keysLabel ?? keyBindingsLabel(action.keys),
      action: action.hint,
    })
  }
  rows.sort((a, b) => a.order - b.order)
  return rows.map(({ keys, action }) => ({ keys, action }))
}

/**
 * footer 审批挂起提示段：approval 域动作按注册序投影 footerHint（无 footerHint
 * 的动作不进 footer）。传入 ctx 时按各动作 when 守卫过滤——p 键「此命令不再问」
 * 仅在前缀可提（bash 类工具）的挂起上出现；审批卡键位行也消费本投影（同源）。
 * @param actions - 动作表（registry.list()）。
 * @param ctx - 动作执行上下文（缺省不过滤 when，投影静态全集）。
 * @returns 提示段文本数组。
 */
export function projectApprovalHints(actions: readonly KeyAction[], ctx?: ActionContext): string[] {
  const hints: string[] = []
  for (const action of actions) {
    if (action.context !== 'approval' || action.footerHint === undefined) continue
    if (ctx !== undefined && action.when !== undefined && !action.when(ctx)) continue
    hints.push(action.footerHint)
  }
  return hints
}

/**
 * footer 检查面板提示段：inspect.close 动作的 footerHint + 静态「/ 命令」尾段
 * （/ 斜杠命令不是键位动作，提示文本不入动作表）。
 * @param actions - 动作表（registry.list()）。
 * @returns 提示段文本数组。
 */
export function projectInspectHints(actions: readonly KeyAction[]): string[] {
  const close = actions.find(a => a.id === 'inspect.close')?.footerHint ?? 'esc 关闭'
  return [close, '/ 命令']
}
