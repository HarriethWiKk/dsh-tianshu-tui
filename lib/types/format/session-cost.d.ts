/**
 * session-cost — 会话成本汇总(纯函数;Claude Code /cost 形态)。
 *
 * 数据源:assistant/message 事件的 usage(TokenUsage,每次请求计量)按模型
 * 分桶累计;模型 key 取最近一次 request/header 的 config.model(wire id)。
 * 成本估算复用 pricing.ts(未知模型不猜价);token 计数复用 formatTokenCount。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/session-cost
 */
import type { TokenUsage } from '@deepseek-ai/dsh-llm';
/** 单模型的累计用量桶(字段兼容 TokenUsage 形状,可直接喂 estimateCost)。 */
export interface SessionCostBucket {
    /** wire 模型 id(未知时为 'unknown')。 */
    model: string;
    inputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    reasoningTokens: number;
}
/** 空桶(缺省值)。 */
export declare function emptyBucket(model: string): SessionCostBucket;
/**
 * 累加一次请求计量进桶(纯函数;usage 的缓存字段缺省按 0)。
 * @param bucket - 现有桶(undefined → 以 usage 建桶)。
 * @param usage - 本次请求的 TokenUsage。
 * @returns 新桶。
 */
export declare function accumulateUsage(bucket: SessionCostBucket | undefined, usage: TokenUsage, model?: string): SessionCostBucket;
/**
 * 渲染会话成本报告行:标题 + 每模型明细(输入/缓存读/写/输出/推理/$)+ 合计。
 * 空桶列表 → 占位提示行。
 * @param buckets - 各模型累计桶(顺序 = 传入序,建议按首次出现序)。
 * @returns 报告行数组(纯文本,无 ANSI)。
 */
export declare function formatSessionCostReport(buckets: readonly SessionCostBucket[]): string[];
