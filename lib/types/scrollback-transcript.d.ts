/**
 * Scrollback transcript parser — turns CommitEngine text into message-level units
 * for the `/scroll` (pager) overlay search and expansion.
 *
 * 预留：/scroll overlay 未接线——parseScrollbackTranscript 当前无消费端，仅登记 API。
 *
 * 解析策略（保守启发式）：
 * - 按行扫描，识别消息起始标记。
 * - 用户消息：行首（去 ANSI 后）为 `▌` 或 `❯`。
 * - 工具结果：行首（去 ANSI 后）为工具卡 bullet 之一（`›` 成功 / `✗` 失败 /
 *   `⠋` 进行中 / `?` 待答 / `●` live 卡）。
 * - 其余连续行归为一个 assistant/system 块。
 * - 截断检测：交给 truncation-marker.ts 的共享正则（同时认中文与历史英文标记）。
 */
/** 消息角色（首行标记推断；无标记的连续行归 assistant）。 */
export type TranscriptRole = 'user' | 'assistant' | 'tool' | 'system';
/** 解析出的消息级单元（行号区间 + 摘要 + 搜索用纯文本）。 */
export interface TranscriptMessage {
    /** 消息在 scrollback 中的起始行索引 */
    startLine: number;
    /** 消息在 scrollback 中的结束行索引（不含） */
    endLine: number;
    role: TranscriptRole;
    /** 首行去 ANSI 后的摘要 */
    summary: string;
    /** 完整 ANSI 行 */
    lines: string[];
    /** 是否包含被截断的工具输出 */
    isTruncated: boolean;
    /** 去 ANSI 后的原始内容，用于搜索 */
    rawContent: string;
}
/**
 * 解析 scrollback 内容为消息列表。
 * @param content - CommitEngine 累积的 scrollback 全文（可含 ANSI）。
 * @returns 消息列表（空白内容返回空数组）。
 */
export declare function parseScrollbackTranscript(content: string): TranscriptMessage[];
/**
 * 在消息列表中搜索 query（大小写不敏感）。
 * @param messages - 消息列表。
 * @param query - 查询串（trim 后为空返回空数组）。
 * @returns 匹配的消息索引数组（升序）。
 */
export declare function searchTranscript(messages: readonly TranscriptMessage[], query: string): number[];
/**
 * 找到下一个匹配索引，循环（末尾之后绕回首个匹配）。
 * @param messages - 消息列表。
 * @param current - 当前消息索引。
 * @param query - 查询串。
 * @returns 下一个匹配索引；无匹配返回 current。
 */
export declare function findNextMatch(messages: readonly TranscriptMessage[], current: number, query: string): number;
/**
 * 找到上一个匹配索引，循环（开头之前绕回最后匹配）。
 * @param messages - 消息列表。
 * @param current - 当前消息索引。
 * @param query - 查询串。
 * @returns 上一个匹配索引；无匹配返回 current。
 */
export declare function findPrevMatch(messages: readonly TranscriptMessage[], current: number, query: string): number;
/**
 * 估算某条消息在 overlay 中占多少显示行（粗略，折行按显示宽度向上取整）。
 * @param message - 消息。
 * @param columns - 终端列数（<1 按 1 处理）。
 * @returns 估算显示行数（每逻辑行至少 1 行）。
 */
export declare function estimateMessageRows(message: TranscriptMessage, columns: number): number;
/**
 * 计算从第一条消息到指定消息起始处的累计显示行数。
 * @param messages - 消息列表。
 * @param targetIndex - 目标消息索引（不含自身；越界时累计到列表末尾）。
 * @param columns - 终端列数。
 * @returns 累计显示行数。
 */
export declare function cumulativeRowsToMessage(messages: readonly TranscriptMessage[], targetIndex: number, columns: number): number;
