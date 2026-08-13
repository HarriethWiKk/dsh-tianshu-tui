/**
 * 工具卡片渲染（基础版）— Claude Code 风格折叠卡片。
 *
 * 源出 .rivet/tui-source/tui/format/tool-card.ts（Apache-2.0 来源，见
 * LICENSE/NOTICE/SOURCE-MAP.md）。本文件为 dsh-tui 移植的基础版：
 * 保留 header/bullet 状态形色、diff 检测分支、read 族头尾预览、截断提示
 * 与 live 进行中卡片；去掉天枢特有的 browser_debug 分级着色、委派任务
 * 流式预览与星域映射（见反目标：不做 worker/星域面板）。
 *
 * 渲染结构：
 *   › Run(npm test) (1.2s)
 *     ⎿  前 4 行输出
 *        … +25 行
 *
 * - 状态形色双通道：› 成功绿 / ✗ 失败红 / ⠋ 进行中 dim / ? 待答黄
 */
import type { RivetTheme } from '../theme.js';
import { isDelegationTool } from './tool-meta.js';
import { type ToolGroup } from './tool-group.js';
/** formatToolCard 的渲染输入：一次工具调用的结果卡片（含流式中间态）。 */
export interface FormatToolCardInput {
    /** 工具名称 */
    toolName: string;
    /** 工具输出内容 */
    content: string;
    /** 是否为错误输出 */
    isError?: boolean;
    /** 缩进深度（工具调用链树形连接线） */
    depth?: number;
    /** 原始文件路径（用于显示文件名） */
    rawPath?: string;
    /** 折叠时显示的输出行数上限 */
    maxLines?: number;
    /** 工具耗时（毫秒），可选 */
    elapsedMs?: number;
    /** 是否正在流式输出中 */
    streaming?: boolean;
    /** 工具输入参数（用于标题参数摘要） */
    toolInput?: Record<string, unknown>;
    /** 完整展开（ctrl+o），不截断 */
    expanded?: boolean;
}
/**
 * 按工具家族给不同默认展开高度。
 * @param toolName - 工具名（家族判定经 getToolFamily）。
 * @returns 折叠态默认显示的输出行数上限。
 */
export declare function getDefaultMaxLines(toolName: string): number;
/**
 * 标题动词：family verb 首字母大写（Run/Read/Patch/Write/Search/Find…）。
 * @param toolName - 工具名（家族判定经 getToolFamily）。
 * @returns 首字母大写的标题动词。
 */
export declare function toolTitleVerb(toolName: string): string;
/**
 * 标题行文本（无色）：`Run(npm test)` 或 `Read(foo.ts)`。
 * @param toolName - 工具名（决定标题动词）。
 * @param toolInput - 工具输入参数（经 toolArgSummary 摘录主参数）。
 * @param rawPath - 原始文件路径；无参数摘要时回退取其 basename。
 * @returns 有参数摘要时 `Verb(arg)`，否则仅动词。
 */
export declare function toolCardTitle(toolName: string, toolInput?: Record<string, unknown>, rawPath?: string): string;
/**
 * 缩进工具卡 body 行：第一行 `⎿  `（dim 着色），后续行对齐缩进。
 * formatToolCard 与 presenter 卡（tool-view-card.ts）共用的卡片体语汇。
 * @param bodyLines - 已着色的 body 行。
 * @param indent - 卡片整体缩进前缀（工具链树形层级）。
 * @param theme - 当前主题。
 * @returns 缩进后的行数组。
 */
export declare function indentToolBody(bodyLines: readonly string[], indent: string, theme: RivetTheme): string[];
/** formatToolCardHeader 的输入：标题行的状态与文本。 */
export interface ToolCardHeaderInput {
    /** 工具名（家族着色与待答问判定）。 */
    toolName: string;
    /** 标题文本（无色；通常为 toolCardTitle 产出或 presenter title）。 */
    title: string;
    /** 是否为错误结果（✗ 红）。 */
    isError?: boolean;
    /** 是否流式进行中（⠋ dim + 尾随 …）。 */
    streaming?: boolean;
    /** 耗时（毫秒；streaming 时不显示）。 */
    elapsedMs?: number;
    /** 卡片整体缩进前缀。 */
    indent?: string;
    /** 标题行尾徽标（调用方已着色；terminal 卡 exit pill 等）。 */
    badge?: string;
}
/**
 * 工具卡标题行：`› Verb(arg) (1.2s)` 形态，bullet 形色双通道（16 色终端
 * 与红绿色觉障碍下「成功/失败」不能只靠颜色）。
 * @param input - 标题文本与状态。
 * @param theme - 当前主题（状态形色与家族着色取语义 token）。
 * @returns 单行 ANSI 标题。
 */
export declare function formatToolCardHeader(input: ToolCardHeaderInput, theme: RivetTheme): string;
/**
 * 格式化工具卡片为 ANSI 行数组（Claude Code ●/⎿ 结构）。
 * @param input - 工具名、输出内容与折叠/展开等渲染选项。
 * @param theme - 当前主题（状态形色与家族着色取语义 token）。
 * @returns ANSI 行数组：标题行 + 按截断策略折叠的 body 行。
 */
export declare function formatToolCard(input: FormatToolCardInput, theme: RivetTheme): string[];
/**
 * 判断该工具结果在折叠渲染下是否被截断（供 ctrl+o 展开记录用）。
 * @param input - 工具名、输出内容与可选行数上限（与 formatToolCard 同一截断口径）。
 * @returns 折叠渲染会隐藏内容时 true；ask_user_question 恒 false（永不截断）。
 */
export declare function isToolCardTruncated(input: Pick<FormatToolCardInput, 'toolName' | 'content' | 'maxLines'>): boolean;
/** formatToolCardLive 的渲染输入：进行中工具的标题与流式输出 tail。 */
export interface FormatToolCardLiveInput {
    /** 工具名称。 */
    toolName: string;
    /** 标题覆盖（presentCall 意图产出）；缺省 toolCardTitle 启发式。 */
    title?: string;
    /** 工具输入参数（标题摘要） */
    toolInput?: Record<string, unknown>;
    /** 已累积的流式输出 */
    outputTail?: string;
    /** 预切分的 tail 行（可选）：live 区每帧渲染时按累加器引用缓存切分结果。 */
    outputTailLines?: string[];
    /** 已运行时长（毫秒） */
    elapsedMs?: number;
    /** 末尾输出显示行数 */
    tailLines?: number;
    /** 终端列数 */
    columns: number;
    /** 动画帧序号；提供时用 spinner 替代静态 bullet */
    tick?: number;
    /** 紧凑模式（grok-build /compact-mode）：仅渲染标题单行，省略输出 tail。 */
    compact?: boolean;
}
/**
 * live 区进行中工具的渲染：dim `●` 标题行 + 末 N 行输出（⎿ 缩进）。
 * @param input - 工具名、流式输出 tail、耗时与终端列数等。
 * @param theme - 当前主题。
 * @returns ANSI 行数组：标题行 + tailLines 行（compact 模式仅标题行）。
 */
export declare function formatToolCardLive(input: FormatToolCardLiveInput, theme: RivetTheme): string[];
/**
 * 委派工具是否在流式期展示任务预览（基础版恒 false——见反目标）。
 * @param _toolName - 工具名（基础版不消费，保留签名对齐天枢源）。
 * @returns 恒 false。
 */
export declare function isDelegationPreviewActive(_toolName: string): boolean;
/** formatToolGroup 的渲染输入：并行工具组与展开态。 */
export interface FormatToolGroupInput {
    /** 按 (turn, step) 聚合后的工具组（tool-group.ts 的 fold 产物）。 */
    group: ToolGroup;
    /** 展开态：逐工具渲染完整卡片；折叠态：计数摘要 + 工具名清单。 */
    expanded: boolean;
    /** 当前主题。 */
    theme: RivetTheme;
    /** 终端列数（透传给子卡片宽度度量；可选）。 */
    columns?: number;
}
/**
 * 渲染并行工具组为 ANSI 行数组。
 * 折叠态：`▶ 摘要` + 工具名清单；展开态：`▼ 摘要` + 逐个 formatToolCard
 * （进行中 entry 保留流式标记）。
 * @param input - 工具组、展开态与主题。
 * @returns ANSI 行数组：摘要头 + 折叠清单或逐工具完整卡片。
 */
export declare function formatToolGroup(input: FormatToolGroupInput): string[];
export { isDelegationTool };
