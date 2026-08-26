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
    /** 当前 agent 预设短名（标准 / PTC / 极简 / 创造）；身份段，不可隐藏。 */
    preset?: string;
    /** 推理努力度（request/header 的 config.reasoningEffort；窄宽时随 model 后 drop）。 */
    effort?: string;
    cacheHitRate?: number;
    contextRatio?: number;
    /**
     * 是否在上下文百分比后画占用条。缺省 true（有 contextRatio 即画）；
     * formatGlanceBar 窄宽会先把此项置 false，再丢整个上下文段。
     */
    contextBar?: boolean;
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
    /** 隐藏段（prefs.glance.hideSegments 透传；隐藏段不参与拼接与溢出丢弃）。 */
    hideSegments?: readonly string[];
}
/** 可隐藏段 key（与 prefs.glance.hideSegments 对齐；model/stalled 永不可隐藏）。 */
export declare const GLANCE_HIDEABLE_KEYS: readonly ['effort', 'cache', 'context', 'tokens', 'elapsed', 'cost'];
/** 上下文占用警告阈值（≥ 此比例前缀 ⚠ 提示近满；与 Claude Code context 高水位对齐）。 */
export declare const CONTEXT_WARN_RATIO = 0.95;
/** 上下文占用条格数（已用 ▓ / 剩余 ░；ascii 为 = / -）。 */
export declare const CONTEXT_BAR_CELLS = 8;
/**
 * 上下文占用条：ratio 为已用比例，空格即剩余预算。
 * @param ratio - 已用 / 窗口；越界夹紧到 [0, 1]。
 * @param ascii - true 时用 `[====----]`，避免 block 字符。
 */
export declare function formatContextBar(ratio: number, ascii?: boolean): string;
/**
 * 状态段组装（纯函数）：身份/状态类段——预设短名 / model / effort / 停滞。
 * 行 1 状态行的右侧段数据源；effort 可隐藏，其余为身份/告警段不可隐藏。
 * @param input - metrics 输入；仅组装已提供的段。
 * @returns 无色段文本列表，按固定顺序。
 */
export declare function glanceStatusSegments(input: FormatGlanceBarInput): string[];
/**
 * 指标段组装（纯函数）：指标类段——缓存% / 上下文%+占用条 / tokens / elapsed / cost / turn。
 * 行 2 指标行的数据源；与 glanceBarSegments 中对应段逐字一致。
 * @param input - metrics 输入；仅组装已提供的段（cost 有值即显示；turn 只在 density full 档）。
 * @returns 无色段文本列表，按固定顺序。
 */
export declare function glanceMetricsSegments(input: FormatGlanceBarInput): string[];
/**
 * 段组装（纯函数；返回 ANSI 段列表，外层按 ` · ` 拼接）。
 * @param input - metrics 输入；仅组装已提供的段（cost 有值即显示；turn 只在 density full 档）。
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
/**
 * 行 2 指标行渲染（分层 footer 的 metrics 行）：仅指标段，渐进 drop 次要段。
 * 上下文段最保底（对齐 kimi-code Line 2 的 context 语义），cache 先于 context 丢；
 * 与 formatGlanceBar 同策略但没有 model 保底——全删空即不渲染（返回空）。
 * @param input - metrics 输入（width ≤ 0 或缺省时不渲染）。
 * @param theme - 当前主题（整行 primary 色，与指标段既有配色一致）。
 * @returns 单行 live 区内容；无可渲染内容返回空数组。
 */
export declare function formatGlanceMetricsLine(input: FormatGlanceBarInput, theme: RivetTheme): LiveRegionLine[];
