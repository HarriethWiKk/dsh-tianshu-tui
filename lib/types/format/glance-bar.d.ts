import type { LiveRegionLine } from '../engine/live-engine.js';
import type { RivetTheme } from '../theme.js';
/**
 * token 计数紧凑显示：<1000 原样；<1M 用 `k`（非整时留 1 位小数）；否则 `M` 留 2 位。
 * @param n - token 数。
 * @returns 紧凑计数文本。
 */
export declare function formatTokenCount(n: number): string;
/** glance bar 的渲染输入；各段均可选，缺省段不渲染。 */
export interface FormatGlanceBarInput {
    width?: number;
    modelName?: string;
    /** 推理努力度（request/header 的 config.reasoningEffort；窄宽时随 model 后 drop）。 */
    effort?: string;
    cacheHitRate?: number;
    contextRatio?: number;
    tokens?: {
        used: number;
        max: number;
    };
    elapsedMs?: number;
    density?: 'compact' | 'full';
    turnCount?: number;
    cost?: number;
    stalled?: boolean;
    ascii?: boolean;
}
/**
 * 段组装（纯函数；返回 ANSI 段列表，外层按 ` · ` 拼接）。
 * @param input - metrics 输入；仅组装已提供的段（turn/cost 只在 density full 档）。
 * @returns 无色段文本列表，按固定顺序。
 */
export declare function glanceBarSegments(input: FormatGlanceBarInput): string[];
/**
 * 一行条渲染：渐进 drop 次要段，极窄只剩 model 并截断；空 metrics 不占位。
 * @param input - metrics 输入（width ≤ 0 或缺省时不渲染）。
 * @param theme - 当前主题（整行 primary 色）。
 * @returns 单行 live 区内容；无可渲染内容返回空数组。
 */
export declare function formatGlanceBar(input: FormatGlanceBarInput, theme: RivetTheme): LiveRegionLine[];
