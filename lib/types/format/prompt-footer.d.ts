import type { RivetTheme } from '../theme.js';
/** formatPromptFooter 的渲染输入。 */
export interface FormatPromptFooterInput {
    width: number;
    /** plan 模式已生效（mode 段渲染 [plan]）。 */
    planActive?: boolean;
    /** plan 切换待请求边界落地（渲染 [plan…]，优先于 planActive）。 */
    planPending?: boolean;
    /** always-approve 生效（mode 段渲染 [auto]）。 */
    alwaysApprove?: boolean;
    /** 审批挂起：快捷键换成 y/n/a/esc，避免仍提示「Enter 发送」。 */
    approvalPending?: boolean;
    /** 右侧状态段（token/模型/API 等）；右对齐合并进同一行，放不下从后丢段。 */
    rightSegments?: readonly string[];
}
/**
 * 渲染底部 footer：mode 段 + 快捷键提示段，右侧状态段右对齐合并进同一行。
 * @param input - 宽度、模式徽标与右侧状态段。
 * @param theme - 当前主题（plan/auto 徽标走 warning/error；其余用雾蓝 chrome）。
 * @returns 单行 ANSI；任何宽度下 ≤ width。
 */
export declare function formatPromptFooter(input: FormatPromptFooterInput, theme: RivetTheme): string[];
