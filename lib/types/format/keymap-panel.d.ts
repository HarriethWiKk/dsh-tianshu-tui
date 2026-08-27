/**
 * 快捷键面板（grok-build Ctrl+. 键位清单弹层移植）。
 *
 * 纯函数层：keymapEntries 由 action registry（actions/builtin-actions）投影
 * 生成 + 输入层静态补充行（Enter 提交、Ctrl+U 等 InputLine 内部键位不经
 * registry 路由）归并，kitty 键盘增强才可达的键位按终端能力（env）过滤——
 * 键位提示单一事实来源是动作表。renderKeymapPanel 把条目渲染为两列对齐行
 * （键位左列 + 动作右列），窄宽降级为单列紧凑行、超宽截断不破版。TuiApp 把
 * 它注册为 overlay 渲染器，Ctrl+. 触发进出。
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
/**
 * 当前实现的完整快捷键表（新增键位时在 actions/builtin-actions 登记，面板自动跟随）。
 * 与 README 快捷键表同源维护；审批卡的 y/N/a/Ctrl+C 为上下文键位（context:
 * 'approval'，由审批卡自带提示承担），不在此列。kitty 键盘增强才可达的键位
 * （requiresKittyKeyboard，如 Ctrl+Enter）按终端能力过滤——不支持的终端行隐身。
 * 渲染期现取（不作模块级缓存）：终端能力读 env，显式注入便于测试确定性。
 * @param env - 环境变量（测试注入用，缺省 process.env）。
 * @returns 归并排序后的 keymap 条目。
 */
export declare function keymapEntries(env?: NodeJS.ProcessEnv): KeymapEntry[];
/**
 * 渲染快捷键面板为行数组：标题 + 两列对齐条目。
 * 宽度不足时动作列按剩余宽度截断；极端窄宽（连键位列都放不下）降级为
 * 紧凑单列 `键位 动作`（不截断键位，动作截断）。
 * @param width - 终端列数。
 * @param env - 环境变量（终端能力行过滤用，缺省 process.env）。
 * @returns ANSI 行数组（无着色——overlay 面板由上层统一取色）。
 */
export declare function renderKeymapPanel(width: number, env?: NodeJS.ProcessEnv): string[];
