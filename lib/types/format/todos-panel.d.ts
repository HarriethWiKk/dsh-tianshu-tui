/**
 * todos 紧凑待办面板（/todos）。
 *
 * 纯函数层：projectTodosPanel 把保留的 todos 投影快照折叠为紧凑卡行——与
 * /status 的完整 checklist 任务段、/tasks 的 checkbox 窗格同源不同呈现：
 * 一行摘要（三态计数 + 当前进行项）或封顶明细（超出部分折叠尾行）。
 * 输入 null = 会话从未写入待办（渲染空态占位）；空数组 = 模型已清空清单
 * （渲染完成态）。turn/start 把投影清成 null 的黏滞语义由 app 层承担
 * （保留快照只吸收非空投影值），本模块只面对折叠后的输入。
 *
 * @module @huiliyi37/dsh-tianshu-tui/format/todos-panel
 */
import type { TaskItem } from './task-panel.js';
/** 面板选项。 */
export interface TodosPanelOptions {
    /** 终端列数（行截断预算）。 */
    width: number;
    /** true 渲染逐条明细（maxRows 封顶 + 折叠尾行）；false 只渲染一行摘要卡。 */
    expanded: boolean;
    /** 明细态最大行数（含摘要行）；缺省 6。 */
    maxRows?: number;
}
/**
 * 投影保留的待办快照为紧凑面板行。
 * @param todos - 保留的待办全量快照；null（会话从未写入）→ 空态占位行，
 *   空数组（已清空）→ 完成态行。
 * @param opts - 宽度、明细展开与行数上限。
 * @returns 面板行数组（摘要态恒 1 行；明细态 = 摘要行 + 封顶条目行 + 可选折叠尾行）。
 */
export declare function projectTodosPanel(todos: TaskItem[] | null, opts: TodosPanelOptions): string[];
