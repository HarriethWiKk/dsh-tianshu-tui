/**
 * presenter 卡渲染 — 消费 harness 工具声明的结构化渲染意图
 * （dsh-tools presentation.ts 的 ToolCallView/ToolResultView），把 diff /
 * terminal 卡渲染为 ANSI 行；generic 与其余卡型（search/read/web，二批
 * 结构化）回落 formatToolCard 的文本折叠。
 *
 * 与 formatToolCard 的关系：本模块是「结构化意图优先」的分派层——意图
 * 缺失（工具无 presenter / 桥软降级）时整体回落文本卡；标题行与 body
 * 缩进语汇（formatToolCardHeader / indentToolBody）两者共用。
 *
 * diff 卡不渲染行号 gutter：FileDiff 不携带原始行号（fs 的逐 hunk meta
 * 已剥掉 hunk 起点），伪造 1 起的行号会误导，+/− 前缀是诚实的双通道。
 */
import type { FileDiff, ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools';
import type { RivetTheme } from '../theme.js';
/**
 * 多个 FileDiff 的增删统计（折叠阈值与统计行数据源）。
 * @param diffs - presenter 产出的文件级 diff 列表。
 * @returns 增/删行计数。
 */
export declare function fileDiffStats(diffs: readonly FileDiff[]): {
    adds: number;
    dels: number;
};
/** renderFileDiff 的渲染选项。 */
export interface RenderFileDiffOptions {
    /** 正文行数上限（超限头尾对半 + 隐藏行标记）；缺省不设限。 */
    maxLines?: number;
}
/**
 * 渲染一个结构化 {@link FileDiff} 为着色行数组：`+` 绿 / `-` 红 /
 * 上下文 muted，hunk 间以 dim `⋯` 分隔；新建文件（oldText null）全为
 * 添加行。审批预览（permission-diff.ts）与结算卡共用此渲染。
 * @param diff - 单文件 diff（oldText null = 新建/覆盖，无前像可比）。
 * @param options - 行数上限。
 * @param theme - 当前主题。
 * @returns ANSI 行数组；old/new 相同（无 hunk）时为空数组。
 */
export declare function renderFileDiff(diff: FileDiff, options: RenderFileDiffOptions, theme: RivetTheme): string[];
/** formatToolViewCard 的渲染输入：一次已结算工具调用 + 可选渲染意图。 */
export interface FormatToolViewCardInput {
    /** 工具名（模型原样产出）。 */
    toolName: string;
    /** 原始参数 JSON 字符串（标题启发式与 generic 回落用）。 */
    argumentsRaw: string;
    /** 模型面结果文本（tool-result text 块折叠）。 */
    content: string;
    /** 是否为错误结果。 */
    isError: boolean;
    /** presentCall 意图（标题来源之一）；桥降级时缺省。 */
    callView?: ToolCallView;
    /** presentResult 意图（卡型分派依据）；缺失整体回落文本卡。 */
    resultView?: ToolResultView;
    /** 工具耗时（毫秒）。 */
    elapsedMs?: number;
    /** 完整展开：diff 不折叠为统计行、terminal 不截断输出。 */
    expanded?: boolean;
    /** 紧凑模式（/density）：diff 卡仅标题 + 统计行，terminal 卡仅标题。 */
    compact?: boolean;
}
/**
 * 结算工具卡总入口：按 presentResult 意图分派 diff / terminal 结构化卡；
 * generic 与其余卡型（search/read/web 二批结构化）回落 formatToolCard
 * 文本折叠（generic 的 content 块覆盖模型面文本）。
 * @param input - 调用事实 + 渲染意图（桥产物，可全缺省）。
 * @param theme - 当前主题。
 * @returns ANSI 行数组（标题行 + 卡片体）。
 */
export declare function formatToolViewCard(input: FormatToolViewCardInput, theme: RivetTheme): string[];
