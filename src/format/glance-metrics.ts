/**
 * glance metrics 投影 — app 缓存字段 → formatGlanceBar 输入（C4：自 ui/app.ts 提取）。
 *
 * 纯函数纪律：时间注入（now 参数）；诚实降级——适配器未报 cache 字段不显示
 * 0%、定价表未命中不猜价。
 *
 * @module @huiliyi37/dsh-tianshu-tui/format/glance-metrics
 */

import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { FormatGlanceBarInput } from './glance-bar.js'
import { estimateCost } from './pricing.js'

/** buildGlanceMetrics 的 usage 数据源（llm 的 TokenUsage DISJOINT 计数）。 */
export type GlanceUsage = TokenUsage

/** buildGlanceMetrics 的数据源（app 侧缓存字段的窄投影）。 */
export interface GlanceMetricsSources {
  transcript: { turn: number; firstInTurnTime?: number } | undefined
  modelName: string | null
  effort: string | null
  usage: GlanceUsage | null
  contextWindow: number | null
  columns: number
}

/**
 * 组装 metrics 一行条输入；transcript/modelName 缺失返回 null（不渲染）。
 * @param sources - app 缓存字段投影。
 * @param now - 当前时刻（默认 Date.now()；注入可测）。
 */
export function buildGlanceMetrics(sources: GlanceMetricsSources, now: number = Date.now()): FormatGlanceBarInput | null {
  if (sources.transcript === undefined) return null
  if (sources.modelName === null) return null
  const input: FormatGlanceBarInput = {
    width: sources.columns,
    modelName: sources.modelName,
  }
  if (sources.effort !== null) input.effort = sources.effort
  const usage = sources.usage
  if (usage !== null) {
    // billed input = 未缓存输入 + 缓存读 + 缓存写（llm/types.ts DISJOINT 契约）；
    // 缓存命中率只在适配器报了 cache 字段时显示（未报不显示 0%——诚实降级）。
    const billed = usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
    if (billed > 0) {
      if (usage.cacheReadTokens !== undefined || usage.cacheWriteTokens !== undefined) {
        input.cacheHitRate = (usage.cacheReadTokens ?? 0) / billed
      }
      if (sources.contextWindow !== null && sources.contextWindow > 0) {
        input.contextRatio = Math.min(1, billed / sources.contextWindow)
        input.tokens = { used: billed, max: sources.contextWindow }
      }
    }
    // 成本估算：定价表命中才显示（未知模型不猜价，与缓存% 诚实降级同款）。
    const cost = estimateCost(sources.modelName, usage)
    if (cost !== undefined) input.cost = cost
  }
  if (sources.transcript.turn >= 0) {
    input.turnCount = sources.transcript.turn + 1
    // transcript 折叠时维护的当前 turn 首条消息时间（O(1)，替代逐帧线性扫描）。
    if (sources.transcript.firstInTurnTime !== undefined) {
      input.elapsedMs = now - sources.transcript.firstInTurnTime
    }
  }
  return input
}
