/**
 * glance metrics 投影 — app 缓存字段 → formatGlanceBar 输入（C4：自 ui/app.ts 提取）。
 *
 * 纯函数纪律：时间注入（now 参数）；诚实降级——适配器未报 cache 字段不显示
 * 0%、定价表未命中不猜价。
 *
 * @module @huiliyi37/dsh-tianshu-tui/format/glance-metrics
 */
import type { TokenUsage } from '@deepseek-ai/dsh-llm';
import type { FormatGlanceBarInput } from './glance-bar.js';
/** buildGlanceMetrics 的 usage 数据源（llm 的 TokenUsage DISJOINT 计数）。 */
export type GlanceUsage = TokenUsage;
/** buildGlanceMetrics 的数据源（app 侧缓存字段的窄投影）。 */
export interface GlanceMetricsSources {
    transcript: {
        turn: number;
        firstInTurnTime?: number;
    } | undefined;
    modelName: string | null;
    /** 当前预设短名；缺省不渲染该段。 */
    preset?: string | null;
    effort: string | null;
    usage: GlanceUsage | null;
    contextWindow: number | null;
    columns: number;
}
/**
 * 组装 metrics 一行条输入；transcript/modelName 缺失返回 null（不渲染）。
 * @param sources - app 缓存字段投影。
 * @param now - 当前时刻（默认 Date.now()；注入可测）。
 */
export declare function buildGlanceMetrics(sources: GlanceMetricsSources, now?: number): FormatGlanceBarInput | null;
