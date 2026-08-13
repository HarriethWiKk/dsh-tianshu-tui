/**
 * 格式化函数 — diff 输出（基础版，直移 .rivet/tui-source/tui/format/diff.ts）。
 *
 * 源出 .rivet/tui-source/tui/format/diff.ts（Apache-2.0 来源，见
 * LICENSE/NOTICE/SOURCE-MAP.md）。本文件与源保持一致（本地依赖
 * hidden-lines.ts 已存在），未做裁剪。
 */
import type { RivetTheme } from '../theme.js';
/** formatDiff 的渲染输入。 */
export interface FormatDiffInput {
    /** diff 文本内容 */
    content: string;
    /** 最大显示行数 */
    maxLines?: number;
}
/** diff 统计信息（adds/dels 不含文件头，hunks 为 @@ 头数量） */
export interface DiffStats {
    adds: number;
    dels: number;
    hunks: number;
}
/**
 * 从 diff 文本提取统计：添加行数、删除行数、hunk 数。
 * @param content - unified diff 文本（+++/--- 文件头不计入增删）。
 * @returns adds/dels/hunks 计数。
 */
export declare function computeDiffStats(content: string): DiffStats;
/**
 * 启发式检测文本是否为 unified diff 内容。
 * 前 20 行内计 diff 信号（diff --git / 文件头 / hunk 头）；有 hunk 头且
 * 存在 +/- 行即判真，否则要求信号 ≥ 2。
 * @param text - 待检测文本。
 * @returns 判定为 diff 内容时 true。
 */
export declare function isDiffContent(text: string): boolean;
/**
 * 格式化 diff 为 ANSI 行数组。
 *
 * 颜色映射：
 * - 添加行 (+): theme.success (绿)
 * - 删除行 (-): theme.error (红)
 * - hunk header (@@): theme.secondary
 * - 文件头 (---/+++): theme.warning
 * - 上下文行: theme.muted
 * - meta (diff --git 等): theme.dim
 * @param input - diff 文本与可选行数上限（超限时头尾各留一半 + 隐藏标记）。
 * @param theme - 当前主题。
 * @returns ANSI 行数组：`diff: +N −M` 摘要头 + 染色内容行（有 hunk 时附行号 gutter）。
 */
export declare function formatDiff(input: FormatDiffInput, theme: RivetTheme): string[];
/**
 * 单行 diff 分类 → 主题色。供 formatCodeBlock 渲染内嵌 diff 段复用，
 * 与 formatDiff 的行分类着色保持一致（+ 绿 − 红 @@ 次色 头 warning）。
 * @param line - 单行 diff 文本。
 * @param theme - 当前主题。
 * @returns 该行对应主题色。
 */
export declare function diffLineColor(line: string, theme: RivetTheme): string;
