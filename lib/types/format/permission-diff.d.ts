/**
 * 审批 diff 预览（C2 项 1）— 反 grok 之道：grok 审批 modal 不放 diff，
 * DSH 的痛点是盲批（信任断点），在 y/N 提示上方渲染内联 diff 建立信任。
 *
 * 数据通路：approval/request 携带 callId → transcript 查找 tool 调用 →
 * 原始参数 JSON → 此处解析 → 复用 renderFileDiff 渲染（与结算工具卡同一
 * FileDiff 渲染：所批即所见，审批预览与落底卡片同型）。
 */
import type { RivetTheme } from '../theme.js';
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
/**
 * 格式化审批 diff 为 ANSI 行数组；非编辑工具或参数不可解析返回 null。
 * - str_replace_editor str_replace / edit_file：old/new → renderFileDiff
 *   （±3 context，与结算工具卡共用渲染——所批即所见）
 * - str_replace_editor create / write_file：path + 前 4 行预览（无 old）
 * - 其他命令/工具：null（无替换语义不渲染）
 * @param input - 待审批工具调用的名与原始参数 JSON。
 * @param theme - 当前主题（diff 染色透传 renderFileDiff）。
 * @returns diff/预览的 ANSI 行数组；不可渲染时 null（调用方不占位）。
 */
export declare function formatPermissionDiff(input: PermissionDiffInput, theme: RivetTheme): string[] | null;
