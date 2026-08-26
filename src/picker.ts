/**
 * picker — 交互式选择器 overlay（Issue #31：主题/模型/会话切换用上下键选择）。
 *
 * 纯状态机 + 渲染 + 控制器，与 command-palette 同构（OverlayRenderer 契约）。
 * 打开时注入条目与确认回调；↑/↓ 移动、PageUp/PageDown 翻页、Enter 确认、
 * S 设为默认（可选）、Esc/q 关闭。当前值条目带 ● 标记（current），启动默认
 * 带 ★（isDefault），选中项 ▶ 高亮。
 *
 * 滚动窗口跟随选中（主题/模型/会话选择器均展示全部条目，↑/↓ 浏览）。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/picker
 */

import { color } from './engine/ansi.js'
import type { RivetTheme } from './theme.js'
import { displayWidth } from './width.js'

/** 选择器条目：展示标签 + 提交值 + 当前值标记。 */
export interface PickerItem {
  /** 展示标签（列表行原文，窄宽截断）。 */
  label: string
  /** 提交值（确认回调的入参）。 */
  value: string
  /** 当前生效值（列表行 ● 标记；无匹配条目时忽略）。 */
  current?: boolean
  /** 启动默认值（列表行 ★ 标记；与 current 可并存）。 */
  isDefault?: boolean
  /** 分组头：不可选、不提交；↑↓ 跳过。 */
  header?: boolean
}

/** 分组头不可选。 */
export function isPickerSelectable(item: PickerItem | undefined): item is PickerItem {
  return item !== undefined && item.header !== true
}

/**
 * 从 `from` 起找最近可选项（先下后上）；全是头时退回夹紧后的 from。
 */
export function firstSelectableIndex(items: readonly PickerItem[], from = 0): number {
  if (items.length === 0) return 0
  const start = Math.max(0, Math.min(from, items.length - 1))
  for (let i = start; i < items.length; i++) {
    if (isPickerSelectable(items[i])) return i
  }
  for (let i = start - 1; i >= 0; i--) {
    if (isPickerSelectable(items[i])) return i
  }
  return start
}

/**
 * 按可选项跳 `delta` 步（头不计步）；到顶/底停在最近可选项。
 */
export function nextSelectableIndex(
  items: readonly PickerItem[],
  from: number,
  delta: number,
): number {
  if (items.length === 0) return 0
  if (delta === 0) return firstSelectableIndex(items, from)
  const step = delta > 0 ? 1 : -1
  const hops = Math.abs(delta)
  let i = Math.max(0, Math.min(from, items.length - 1))
  let moved = 0
  while (moved < hops) {
    const next = i + step
    if (next < 0 || next >= items.length) break
    i = next
    if (isPickerSelectable(items[i])) moved++
  }
  return isPickerSelectable(items[i]) ? i : firstSelectableIndex(items, i)
}

/** 确认回调：选中条目 → 调用方执行动作。 */
export type PickerCommit = (item: PickerItem) => void

/** 预览回调：选中变化时以新选中条目调用（实时预览，如主题切换）。 */
export type PickerPreview = (item: PickerItem) => void

/** 取消回调：选择器被关闭（Esc/q，非确认路径）时调用（还原预览等）。 */
export type PickerCancel = () => void

/** open 的可选钩子。 */
export interface PickerHooks {
  /** 选中变化时调用（实时预览，如主题切换）。 */
  onPreview?: PickerPreview
  /** Esc/q 关闭时调用（还原预览）。 */
  onCancel?: PickerCancel
  /** S 设为默认：应用并写入启动默认（确认路径，不走 onCancel）。 */
  onSaveDefault?: PickerCommit
}

/** renderPicker 可选提示：有 onSaveDefault 时换底栏。 */
export interface PickerRenderOpts {
  /** true = Enter 应用（本会话）· S 设为默认；缺省 = Enter 确认。 */
  saveDefault?: boolean
}

/** 选择器状态：开合 + 选中下标 + 标题。 */
export interface PickerState {
  open: boolean
  /** 选中项下标（指向 items；越界时渲染夹紧）。 */
  selected: number
  /** 面板标题行。 */
  title: string
}

/** 状态机输入事件（move 的 count = 条目数，由调用方计算）。 */
export type PickerEvent =
  | { type: 'open'; title: string }
  | { type: 'close' }
  | { type: 'move'; delta: number; count: number }

/** 初始状态（关闭、选中 0、空标题）。 */
export function emptyPickerState(): PickerState {
  return { open: false, selected: 0, title: '' }
}

/**
 * 折叠一个事件进入选择器状态（纯函数）：open 重置选中、move 在 [0, count-1]
 * 内夹紧（0 条时选中归 0）。
 * @param state - 当前状态。
 * @param event - 输入事件。
 * @returns 新状态。
 */
export function applyPickerEvent(state: PickerState, event: PickerEvent): PickerState {
  switch (event.type) {
    case 'open':
      return { ...state, open: true, selected: 0, title: event.title }
    case 'close':
      return { ...state, open: false }
    case 'move': {
      const maxIndex = Math.max(0, event.count - 1)
      const next = state.selected + event.delta
      return { ...state, selected: Math.max(0, Math.min(next, maxIndex)) }
    }
  }
}

/**
 * overlay 渲染：标题 + 条目（选中 ▶ 高亮、当前 ● 标记、宽度截断）+ 底部
 * 键位提示；滚动窗口跟随选中。
 * @param state - 选择器状态（取 title/selected）。
 * @param items - 全部条目。
 * @param width - 可用显示宽度（条目按此截断）。
 * @param height - 可用行数（头尾各占一行，其余给条目窗口）。
 * @param theme - 主题（取语义色）。
 * @returns 渲染行数组（含 ANSI）。
 */
export function renderPicker(
  state: PickerState,
  items: readonly PickerItem[],
  width: number,
  height: number,
  theme: RivetTheme,
  opts?: PickerRenderOpts,
): string[] {
  const lines: string[] = [color(state.title, theme.brandColor, { bold: true })]
  if (items.length === 0) {
    lines.push(color('（无选项）', theme.muted))
  } else {
    const bodyHeight = Math.max(1, height - 2)
    const sel = Math.max(0, Math.min(state.selected, items.length - 1))
    const start = Math.max(0, sel - bodyHeight + 1)
    const window = items.slice(start, start + bodyHeight)
    for (let i = 0; i < window.length; i++) {
      const item = window[i]
      /* v8 ignore next 1 -- unreachable: window 来自 items.slice()，元素恒非 undefined */
      if (item === undefined) continue
      if (item.header === true) {
        lines.push(color(truncate(item.label, width), theme.muted))
        continue
      }
      const isSel = start + i === sel
      const marker = `${item.current === true ? ' ●' : ''}${item.isDefault === true ? ' ★' : ''}`
      const text = `${isSel ? '▶ ' : '  '}${item.label}${marker}`
      const clipped = truncate(text, width)
      lines.push(isSel ? color(clipped, theme.primary, { bold: true }) : color(clipped, theme.dim))
    }
  }
  const footer = opts?.saveDefault === true
    ? '↑↓ 选择 · Enter 应用（本会话） · S 设为默认 · Esc 关闭'
    : '↑↓ 选择 · Enter 确认 · Esc 关闭'
  lines.push(color(footer, theme.muted))
  return lines
}

function truncate(text: string, width: number): string {
  let out = ''
  for (const ch of text) {
    if (displayWidth(out + ch) > width) break
    out += ch
  }
  return out
}

/** PickerController 构造选项。 */
export interface PickerOptions {
  /** 主题读取函数（动态，切主题后 overlay 立即生效）。 */
  getTheme: () => RivetTheme
}

/**
 * 选择器控制器：open/close/move/commit，实现 OverlayRenderer 契约。
 * 条目与确认回调在 open 时注入（每次打开重建）。
 */
export class PickerController {
  private state: PickerState = emptyPickerState()
  private items: PickerItem[] = []
  private onCommit: PickerCommit | null = null
  private onPreview: PickerPreview | null = null
  private onCancel: PickerCancel | null = null
  private onSaveDefault: PickerCommit | null = null
  private readonly getTheme: () => RivetTheme

  constructor(opts: PickerOptions) {
    this.getTheme = opts.getTheme
  }

  /** 选择器是否打开。 */
  isOpen(): boolean {
    return this.state.open
  }

  /**
   * 打开选择器：注入条目、确认回调与可选预览/取消回调，选中可指定（缺省 0）。
   * @param title - 面板标题。
   * @param items - 条目列表。
   * @param commit - 确认回调（Enter 时以选中条目调用）。
   * @param selectedIndex - 初始选中下标（缺省 0）。
   * @param hooks - 可选：onPreview（选中变化时调用，实时预览）；
   *   onCancel（Esc/q 关闭时调用，还原预览）；
   *   onSaveDefault（S 设为默认，确认路径不走 onCancel）。
   */
  open(
    title: string,
    items: readonly PickerItem[],
    commit: PickerCommit,
    selectedIndex?: number,
    hooks?: PickerHooks,
  ): void {
    this.items = [...items]
    this.onCommit = commit
    this.onPreview = hooks?.onPreview ?? null
    this.onCancel = hooks?.onCancel ?? null
    this.onSaveDefault = hooks?.onSaveDefault ?? null
    this.state = applyPickerEvent(this.state, { type: 'open', title })
    const target = firstSelectableIndex(this.items, selectedIndex ?? 0)
    if (target !== this.state.selected) {
      this.state = { ...this.state, selected: target }
    }
  }

  /** 关闭选择器（Esc/q 路径；触发 onCancel 还原预览；保留条目，下次 open 重建）。 */
  close(): void {
    const cancel = this.onCancel
    this.onCancel = null
    this.onCommit = null
    this.onPreview = null
    this.onSaveDefault = null
    this.state = applyPickerEvent(this.state, { type: 'close' })
    if (cancel !== null) cancel()
  }

  /**
   * 移动选中项（夹紧在条目范围内）；选中变化时触发 onPreview（实时预览）。
   * @param delta - 移动量（负上正下）。
   */
  move(delta: number): void {
    const next = nextSelectableIndex(this.items, this.state.selected, delta)
    this.state = { ...this.state, selected: next }
    const item = this.selected
    if (item !== undefined && this.onPreview !== null) this.onPreview(item)
  }

  /** 当前选中条目（越界返回 undefined）。 */
  get selected(): PickerItem | undefined {
    return this.items[this.state.selected]
  }

  /** 当前条目数。 */
  get count(): number {
    return this.items.length
  }

  /**
   * 确认当前选中项：以选中条目调用注入的确认回调并关闭；无选中或未注入
   * 回调时不动作。确认路径不触发 onCancel（预览已由确认落定，无需还原）。
   */
  commit(): void {
    const item = this.selected
    if (!isPickerSelectable(item)) return
    const cb = this.onCommit
    this.onCancel = null
    this.onCommit = null
    this.onPreview = null
    this.onSaveDefault = null
    this.state = applyPickerEvent(this.state, { type: 'close' })
    if (cb !== null) cb(item)
  }

  /** 是否注入了 S 设为默认钩子（键路由据此决定是否消费 s/S）。 */
  canSaveDefault(): boolean {
    return this.onSaveDefault !== null
  }

  /**
   * 设为启动默认：以选中条目调用 onSaveDefault 并关闭；无钩子或无选中时
   * 不动作（选择器保持打开）。确认路径不触发 onCancel。
   */
  saveDefault(): void {
    if (this.onSaveDefault === null) return
    const item = this.selected
    if (!isPickerSelectable(item)) return
    const cb = this.onSaveDefault
    this.onCancel = null
    this.onCommit = null
    this.onPreview = null
    this.onSaveDefault = null
    this.state = applyPickerEvent(this.state, { type: 'close' })
    cb(item)
  }

  /**
   * OverlayRenderer 契约：render(width, height) → string[]。
   * @param width - 可用显示宽度。
   * @param height - 可用行数。
   * @returns 渲染行数组（含 ANSI）。
   */
  render(width: number, height: number): string[] {
    return renderPicker(this.state, this.items, width, height, this.getTheme(), {
      saveDefault: this.onSaveDefault !== null,
    })
  }
}
