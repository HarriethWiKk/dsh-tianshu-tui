/**
 * 快捷键面板（grok-build Ctrl+. 键位清单弹层移植）。
 *
 * 纯函数层：KEYMAP_ENTRIES 是当前实现的完整快捷键表单一事实来源，
 * renderKeymapPanel 把条目渲染为两列对齐行（键位左列 + 动作右列），
 * 窄宽降级为单列紧凑行、超宽截断不破版。TuiApp 把它注册为 overlay
 * 渲染器，Ctrl+. 触发进出。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/format/keymap-panel
 */
/** 快捷键面板条目：键位 + 动作说明。 */
export interface KeymapEntry {
    /** 键位组合（如 'Ctrl+P'）。 */
    keys: string;
    /** 动作说明（如 '命令面板'）。 */
    action: string;
}
/** 当前实现的完整快捷键表（新增键位时在此登记，面板自动跟随）。
 *  与 README 快捷键表同源维护；审批卡的 y/N/a/Ctrl+C 为上下文键位，
 *  由审批卡自带提示承担，不在此列。 */
export declare const KEYMAP_ENTRIES: KeymapEntry[];
/**
 * 渲染快捷键面板为行数组：标题 + 两列对齐条目。
 * 宽度不足时动作列按剩余宽度截断；极端窄宽（连键位列都放不下）降级为
 * 紧凑单列 `键位 动作`（不截断键位，动作截断）。
 * @param width - 终端列数。
 * @returns ANSI 行数组（无着色——overlay 面板由上层统一取色）。
 */
export declare function renderKeymapPanel(width: number): string[];
