import type { RivetTheme } from '../theme.js';
/** 运行中状态行的渲染输入。 */
export interface SubagentRunningInput {
    width: number;
    /** 显示标签（label 或 id 短哈希）。 */
    label: string;
    /** spinner 帧计数（单调递增；缺省 0）。 */
    tick?: number;
    /** ascii 降级（spinner → `*`）。 */
    ascii?: boolean;
}
/** 终态状态行的渲染输入。 */
export interface SubagentDoneInput {
    width: number;
    label: string;
    /** 运行耗时（毫秒）。 */
    elapsedMs: number;
    /** 终止原因（SubagentStopReason；merge-extensible，未知走默认失败态）。 */
    stopReason: string;
}
/**
 * 渲染运行中状态行：`⠋ 子代理 <label>`（live 区动态帧）。
 * @param input - 宽度、标签与帧计数。
 * @param theme - 当前主题（整行 primary）。
 * @returns 单行 ANSI；宽度守恒。
 */
export declare function formatSubagentRunning(input: SubagentRunningInput, theme: RivetTheme): string[];
/**
 * 渲染终态状态行：`✓/◌/✗ 子代理 <label> · <耗时>[ (reason)]`（提交 scrollback）。
 * completed → ✓ success；aborted → ◌ muted；其余（error/max-tokens/refusal/
 * 未知）→ ✗ error 且带 reason 后缀（completed/aborted 无后缀）。
 * @param input - 宽度、标签、耗时与终止原因。
 * @param theme - 当前主题（状态标记着色；label 与耗时 muted）。
 * @returns 单行 ANSI；宽度守恒（label 截断优先于 reason 后缀）。
 */
export declare function formatSubagentDone(input: SubagentDoneInput, theme: RivetTheme): string;
