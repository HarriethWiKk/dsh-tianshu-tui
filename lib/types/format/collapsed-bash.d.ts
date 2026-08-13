import type { LiveRegionLine } from '../engine/live-engine.js';
import type { RivetTheme } from '../theme.js';
/** 可折叠命令的长度上限（trim 后字符数；超长命令不折叠）。 */
export declare const MAX_COLLAPSIBLE_COMMAND_LEN = 80;
/** 折叠组内一条 bash 命令：命令文本 + 完成态与结果。 */
export interface CollapsedBashEntry {
    id: string;
    command: string;
    completed: boolean;
    startMs: number;
    content?: string;
    isError?: boolean;
}
/** 连续可折叠 bash 命令的聚合组（startMs 取组内首条起点）。 */
export interface CollapsedBashGroup {
    entries: CollapsedBashEntry[];
    startMs: number;
}
/** formatCollapsedBashGroup（scrollback 版）的渲染选项。 */
export interface CollapsedBashGroupOptions {
    group: CollapsedBashGroup;
    theme: RivetTheme;
    elapsedMs?: number;
    columns?: number;
    expanded?: boolean;
}
/** formatCollapsedBashGroupLive（live 区版）的渲染选项。 */
export interface CollapsedBashGroupLiveOptions {
    group: CollapsedBashGroup;
    theme: RivetTheme;
    elapsedMs?: number;
    columns?: number;
}
/**
 * 折叠判定：短且非变更型命令可折叠；空/超长/变更模式不可折叠。
 * @param command - bash 命令文本（trim 后判定）。
 * @returns 可折叠时 true（宁可漏折叠不误折叠）。
 */
export declare function isCollapsibleBashCommand(command: string): boolean;
/**
 * 从组实时派生统计（failed 只计已完成且出错的 entry）。
 * @param group - 目标折叠组。
 * @returns total/completed/pending/failed 计数。
 */
export declare function computeBashGroupStats(group: CollapsedBashGroup): {
    total: number;
    completed: number;
    pending: number;
    failed: number;
};
/**
 * 折叠摘要文本（非 live）：无 completed → …（active 追加 pending 计数）；否则 Ran N shell commands。
 * @param group - 目标折叠组。
 * @param active - 组内仍有进行中命令（无 completed 时追加 pending 计数）。
 * @returns 摘要文本（无色）；有失败时附 `, N failed`。
 */
export declare function buildBashSummaryText(group: CollapsedBashGroup, active?: boolean): string;
/**
 * live 摘要：有 pending → Running N shell command；全完成 → Ran N shell command。
 * @param group - 目标折叠组。
 * @returns 摘要文本（无色）。
 */
export declare function buildBashLiveSummaryText(group: CollapsedBashGroup): string;
/**
 * 折叠组渲染（scrollback 版）：摘要行 + 逐 entry 树形连接符；
 * >3 条且未展开时走紧凑命令列表。
 * @param opts - 折叠组、主题、耗时、列数与展开态。
 * @returns ANSI 行数组。
 */
export declare function formatCollapsedBashGroup(opts: CollapsedBashGroupOptions): string[];
/**
 * live 区折叠组：进行体摘要 + 最近完成 entry 尾部 2 行预览。
 * @param opts - 折叠组、主题、耗时与列数。
 * @returns live 区行数组（超宽行按列数截断）。
 */
export declare function formatCollapsedBashGroupLive(opts: CollapsedBashGroupLiveOptions): LiveRegionLine[];
