/**
 * think 推理渲染 — 对标 Claude Code 的思考通道两态：
 * - live 流式期：shimmer 头行（deep-diving.gif 光带样式）+ 尾 N 行暗色推理；
 * - 段结束落底：静态头行 + 推理全文（暗色斜体）。推理是模型的草稿流，
 *   不走 markdown 管线，保持原文样貌。
 *
 * 段边界与提交时机归 app.ts（首个 text-delta / tool/call / assistant/message
 * 是推理段的结束点）；本模块是纯渲染函数。
 */
import type { RivetTheme } from '../theme.js';
/** live 推理尾巴显示的行数（流式期只看得到最近的思路）。 */
export declare const REASONING_TAIL_LINES = 3;
/** formatReasoningLive 的渲染输入。 */
export interface FormatReasoningLiveInput {
    /** 已累积的推理文本（reasoning-delta 折叠）。 */
    text: string;
    /** 推理段已进行时长（毫秒）；<1s 或未知不显示。 */
    elapsedMs?: number;
    /** 动画帧序号（shimmer 头行驱动）。 */
    tick: number;
    /** 终端列数（尾巴行截断度量）。 */
    columns: number;
    /** 紧凑模式：仅头行，省略推理尾巴。 */
    compact?: boolean;
    /** 展开模式：渲染推理全文（不截尾），供手动展开查看。 */
    expanded?: boolean;
}
/**
 * live 区流式推理段：shimmer 头行 +（非展开时）尾 {@link REASONING_TAIL_LINES}
 * 行暗色推理文本（超宽截断加省略号）；展开时渲染全部推理行。
 * @param input - 推理文本、tick、耗时与终端列数。
 * @param theme - 当前主题（头行基色取 primary；16 色轨自动静态降级）。
 * @returns ANSI 行数组：头行 +（非紧凑时）尾巴/全文行。
 */
export declare function formatReasoningLive(input: FormatReasoningLiveInput, theme: RivetTheme): string[];
/** formatReasoningBlock 的渲染输入。 */
export interface FormatReasoningBlockInput {
    /** 推理全文。 */
    text: string;
    /** 推理段总耗时（毫秒）；未知不显示。 */
    elapsedMs?: number;
    /** 紧凑模式：仅头行，正文跳过（与 /density 紧凑语义一致）。 */
    compact?: boolean;
    /** 展开模式：正文全文渲染（折叠缺省仅头行；展开查看全文）。 */
    expanded?: boolean;
}
/**
 * 结算推理块（scrollback 落底形态）：静态头行（shimmer 冻结为 dim，与
 * GIF 循环的「熄灭」帧一致）。默认折叠——只落头行（含隐藏行数提示），
 * 正文经 expanded 展开渲染（对标竞品：思考默认收起，按需查看全文）。
 * @param input - 推理全文、总耗时与折叠/展开/紧凑开关。
 * @param theme - 当前主题。
 * @returns ANSI 行数组：头行 +（expanded 且非 compact 时）全文行；空文本仅头行。
 */
export declare function formatReasoningBlock(input: FormatReasoningBlockInput, theme: RivetTheme): string[];
