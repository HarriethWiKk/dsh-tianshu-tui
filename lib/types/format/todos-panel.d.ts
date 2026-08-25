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
import type { TaskItem } from './task-panel.js';
/** 面板选项。 */
export interface TodosPanelOptions {
    /** 终端列数（行截断预算）。 */
    width: number;
    /** true = /todos all 看全表；false = 有未完成项时列出最多 5 条。 */
    expanded: boolean;
}
/**
 * 投影保留的待办快照为紧凑面板行。
 * @param todos - 保留的待办全量快照；null（会话从未写入）→ 空态占位行，
 *   空数组（已清空）→ 完成态行。
 * @param opts - 宽度与是否看全表。
 * @returns 面板行（空/全完成恒 1 行；有未完成项 = 计数头 + 条目 + 可选折叠行）。
 */
export declare function projectTodosPanel(todos: TaskItem[] | null, opts: TodosPanelOptions): string[];
