/**
 * 审批 diff 预览（C2 项 1）— 反 grok 之道：grok 审批 modal 不放 diff，
 * DSH 的痛点是盲批（信任断点），在 y/N 提示上方渲染内联 diff 建立信任。
 *
 * 数据通路：approval/request 携带 callId → transcript 查找 tool 调用 →
 * 原始参数 JSON → 此处解析 → 复用 renderFileDiff 渲染（与结算工具卡同一
 * FileDiff 渲染：所批即所见，审批预览与落底卡片同型）。
 *
 * 决策分层（阶段 2）新增 bash 类工具通路：命令行预览 + 危险模式标注
 * （只展示警示不拦截），以及「此命令前缀不再问」（p 键）的前缀提取
 * （command 首 token）。提取函数与渲染分离，供 app 侧注入 controller。
 */
import type { RivetTheme } from '../theme.js';
import type { TranscriptToolCall, TranscriptView } from '../adapter/transcript.js';
import type { PendingApprovalRequest } from '../controllers/approval-controller.js';
/** 审批场景内容行硬上限（审批期间键锁只 y/N/Esc，diff 必须无翻页全可见）。 */
export declare const APPROVAL_DIFF_MAX_LINES = 12;
/** write 预览最多显示的内容行数（新文件无 old，无 diff 可看）。 */
export declare const WRITE_PREVIEW_LINES = 4;
/** formatPermissionDiff 的输入：待审批工具调用的名与原始参数。 */
export interface PermissionDiffInput {
    /** 工具名（transcript tool.name）。 */
    toolName: string;
    /** 原始参数 JSON 字符串（transcript tool.arguments）。 */
    arguments: string;
}
/** 是否 bash 类工具（p 键前缀与命令预览只对这类工具启用）。 */
export declare function isShellTool(toolName: string): boolean;
/**
 * 原始参数 JSON → command 字段（非 bash 类工具/解析失败/非串/空串 → null）。
 * @param toolName - 工具名（transcript tool.name）。
 * @param argumentsJson - 原始参数 JSON 字符串。
 */
export declare function extractShellCommand(toolName: string, argumentsJson: string): string | null;
/** shell 命令 → 首 token 前缀（`npm test` → `npm`；`git status` → `git`；空串 → null）。 */
export declare function commandPrefixOf(command: string): string | null;
/**
 * 审批请求 → transcript 里的工具调用（callId 关联；无 callId/找不到 → undefined）。
 * @param req - 待决审批请求。
 * @param view - 当前会话 transcript 投影（未 attach 时 undefined）。
 */
export declare function findApprovalToolCall(req: PendingApprovalRequest, view: TranscriptView | undefined): TranscriptToolCall | undefined;
/**
 * 审批请求 → 命令前缀（controller 短路/p 键守卫注入用）：callId 查 transcript →
 * command 首 token；非 bash 类/查不到/解析失败 → null。
 */
export declare function commandPrefixForRequest(req: PendingApprovalRequest, view: TranscriptView | undefined): string | null;
/**
 * 标注命令中的危险模式（命中标签数组，无命中空数组）。展示层警示，不改变审批语义。
 * @param command - shell 命令串。
 */
export declare function detectDangerPatterns(command: string): string[];
/**
 * 格式化审批 diff 为 ANSI 行数组；非编辑/非 bash 类工具或参数不可解析返回 null。
 * - str_replace_editor str_replace / edit_file：old/new → renderFileDiff
 *   （±3 context，与结算工具卡共用渲染——所批即所见）
 * - str_replace_editor create / write_file：path + 前 4 行预览（无 old）
 * - bash 类工具：`$ 命令首行` 预览 + 危险模式标注（只展示警示不拦截）
 * - 其他工具：null（无替换/命令语义不渲染）
 * @param input - 待审批工具调用的名与原始参数 JSON。
 * @param theme - 当前主题（diff 染色透传 renderFileDiff）。
 * @returns diff/预览的 ANSI 行数组；不可渲染时 null（调用方不占位）。
 */
export declare function formatPermissionDiff(input: PermissionDiffInput, theme: RivetTheme): string[] | null;
