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
/** 终态统计段（child 投影缓存快照；缺失/零值段省略——不伪造）。 */
export interface SubagentDoneStats {
    /** 工具调用总数（>0 才渲染）。 */
    toolCalls?: number;
    /** 最新 token 数（>0 才渲染）。 */
    tokensUsed?: number;
}
/** 终态状态行的渲染输入。 */
export interface SubagentDoneInput {
    width: number;
    label: string;
    /** 运行耗时（毫秒）。 */
    elapsedMs: number;
    /** 终止原因（SubagentStopReason；merge-extensible，未知走默认失败态）。 */
    stopReason: string;
    /** 可选统计段（CC 对标 `Done (N tools · tokens · elapsed)`；缺省仅耗时）。 */
    stats?: SubagentDoneStats;
}
/**
 * 渲染运行中状态行：`⠋ 子代理 <label>`（live 区动态帧；活动带逃生门回退）。
 * @param input - 宽度、标签与帧计数。
 * @param theme - 当前主题（整行 primary）。
 * @returns 单行 ANSI；宽度守恒。
 */
export declare function formatSubagentRunning(input: SubagentRunningInput, theme: RivetTheme): string[];
/**
 * 渲染终态状态行：`✓/◌/✗ {label} · {N 工具} · {X tok} · {耗时}[ (reason)]`
 * （提交 scrollback）。completed → ✓ success；aborted → ◌ muted；其余
 * （error/max-tokens/refusal/未知）→ ✗ error 且带 reason 后缀（completed/
 * aborted 无后缀）。统计段零值/缺失省略；窄宽时尾部（reason → 耗时 → 统计
 * 段 → label）先被截断。
 * @param input - 宽度、标签、耗时、终止原因与可选统计段。
 * @param theme - 当前主题（状态标记着色；其余 muted）。
 * @returns 单行 ANSI；宽度守恒（label 截断优先于 reason 后缀）。
 */
export declare function formatSubagentDone(input: SubagentDoneInput, theme: RivetTheme): string;
