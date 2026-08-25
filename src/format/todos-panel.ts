/**
 * todos 紧凑待办面板（/todos）。
 *
 * 纯函数层：projectTodosPanel 把保留的 todos 投影快照折叠为输入轨上方的
 * 待办行——与 /status 的完整 checklist、/tasks 窗格同源不同呈现。
 * 有进行中/待办时默认列出条目（进行中置顶，最多 5 条）；全完成或空仍一行。
 * /todos all 同样排序、不封 5 条。输入 null = 会话从未写入（空态占位）；
 * 空数组 = 模型已清空清单（完成态）。turn/start 把投影清成 null 的黏滞
 * 语义由 app 层承担，本模块只面对折叠后的输入。
 *
 * @module @huiliyi37/dsh-tianshu-tui/format/todos-panel
 */

import { truncateToLiveWidth } from './live-card.js'
import type { TaskItem } from './task-panel.js'

/** 面板选项。 */
export interface TodosPanelOptions {
  /** 终端列数（行截断预算）。 */
  width: number
  /** true = /todos all 看全表；false = 有未完成项时列出最多 5 条。 */
  expanded: boolean
}

/** 面板标题前缀。 */
const TITLE = '📋 待办'
/** 默认态条目上限（超出留折叠尾行）。 */
const DEFAULT_ITEM_CAP = 5
const STATUS_RANK: Record<TaskItem['status'], number> = {
  in_progress: 0,
  pending: 1,
  completed: 2,
}

/** 状态 → 明细行标记（对齐 /tasks checkbox 语汇）。 */
function statusMark(status: TaskItem['status']): string {
  if (status === 'completed') return '[x]'
  if (status === 'in_progress') return '⏳'
  return '[ ]'
}

/** 计数头：标题 + 三态计数（条目已列出时不再重复当前项）。 */
function countHeader(todos: TaskItem[], width: number): string {
  const counts = { completed: 0, in_progress: 0, pending: 0 }
  for (const todo of todos) counts[todo.status]++
  return truncateToLiveWidth(
    `${TITLE} ✓${counts.completed} ⏳${counts.in_progress} □${counts.pending}`,
    width,
  )
}

function sortedTodos(todos: TaskItem[]): TaskItem[] {
  return [...todos].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])
}

function hasOpenWork(todos: TaskItem[]): boolean {
  for (const todo of todos) {
    if (todo.status === 'in_progress' || todo.status === 'pending') return true
  }
  return false
}

function appendItems(rows: string[], items: TaskItem[], width: number): void {
  for (const todo of items) {
    rows.push(truncateToLiveWidth(` ${statusMark(todo.status)} ${todo.content}`, width))
  }
}

/**
 * 投影保留的待办快照为紧凑面板行。
 * @param todos - 保留的待办全量快照；null（会话从未写入）→ 空态占位行，
 *   空数组（已清空）→ 完成态行。
 * @param opts - 宽度与是否看全表。
 * @returns 面板行（空/全完成恒 1 行；有未完成项 = 计数头 + 条目 + 可选折叠行）。
 */
export function projectTodosPanel(todos: TaskItem[] | null, opts: TodosPanelOptions): string[] {
  const width = Math.max(1, opts.width)
  if (todos === null) return [truncateToLiveWidth(`${TITLE} ·（尚无待办）`, width)]
  if (todos.length === 0) return [truncateToLiveWidth(`${TITLE} · 全部完成 ✓`, width)]
  const rows = [countHeader(todos, width)]
  if (!opts.expanded && !hasOpenWork(todos)) return rows
  const ranked = sortedTodos(todos)
  if (opts.expanded || ranked.length <= DEFAULT_ITEM_CAP) {
    appendItems(rows, ranked, width)
    return rows
  }
  appendItems(rows, ranked.slice(0, DEFAULT_ITEM_CAP - 1), width)
  rows.push(`└ …(+${ranked.length - (DEFAULT_ITEM_CAP - 1)})`)
  return rows
}
