/**
 * actions/builtin-actions — 内置键位动作表（TuiApp.handleKey 原 if 链的动作化）。
 *
 * 每条动作对应原 handleKey 的一段分支，相位（phase）对齐原分支的相对位置：
 * - early（overlay 委派之前）：空 Enter 工具卡、shift_tab 三态循环、ctrl_n/s/q、
 *   ctrl_p 命令面板、ctrl_. 快捷键面板、ctrl_f 历史搜索。
 * - main（阻塞上下文轮询之后）：esc 三连（打断 > 关 inspect > 双击 rewind 布防）、
 *   ctrl_c（打断/清空/双击退出）、ctrl_o 推理展开、editorKey 外部编辑器、
 *   ctrl_t 转向、ctrl_return 插队（cancel-and-send）、ctrl_v 粘贴。
 * - tail（slash 菜单与 inspect 上下文键之后）：空 Tab 命令菜单、Alt+Backspace
 *   删附件、↑↓ 排队取回/历史透传。
 * approval 域（y/p/t/a/n/f/esc）只经 approval 阻塞上下文轮询，不参与常规 match。
 *
 * run 只经 ActionContext 触达 TuiApp（装配件在 ui/app.ts）；本模块不 import app。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/actions/builtin-actions
 */
import type { KeyName } from '../engine/input-handler.js';
import type { KeyAction } from './types.js';
/** createBuiltinActions 装配选项。 */
export interface BuiltinActionsOptions {
    /** 外部编辑器触发键（TuiAppOptions.editorKey；缺省 ctrl_e）。 */
    editorKey: KeyName;
}
/**
 * 内置动作表（注册序即 match 优先级）。keymap 投影行序由 keymapOrder 承担
 * （10/20/130/160/180/190 留给 keymap-panel 的输入层静态补充行）。
 * @param options - 装配选项（editorKey）。
 * @returns 动作数组（喂 ActionRegistry）。
 */
export declare function createBuiltinActions(options: BuiltinActionsOptions): KeyAction[];
