/**
 * shimmer 光带动画 — 单行文本的「高亮带从左到右扫过」效果。
 * 样式源：用户提供的 deep-diving.gif（369×66、45 帧 @25fps ≈1.8s/轮，
 * 蓝色文字 + 光带循环扫过）；消费方为 live 区 reasoning 头行。
 *
 * 纯函数：同一 (text, tick) 恒产出同一 ANSI 串，动画由 app.ts 的 120ms
 * tick 循环驱动（braille spinner 同款模式）。光带定位按显示列计算（CJK
 * 宽字符占 2 列），逐字符把 base 色向 highlight 色插值；相邻同档字符合并
 * 为一段转义，序列段数受量化档数约束。
 *
 * 色深降级：仅当 base/highlight 均为可解析 hex（truecolor/256 色轨主题
 * token）时做逐字符插值——fg() 在 256 色终端自行量化；16 色轨（chalk
 * 命名色 token）降级为静态整行着色，不做逐字符伪动画。
 */
/** 一轮光带扫过的 tick 数（120ms/tick × 15 ≈ 1.8s，对齐 GIF 节奏）。 */
export declare const SHIMMER_PERIOD_TICKS = 15;
/** 光带半宽（显示列）：中心两侧各 band 列内亮度按余弦缓落。 */
export declare const SHIMMER_BAND_COLS = 6;
/**
 * 两个 hex 颜色的线性插值。
 * @param a - 起点色（hex）。
 * @param b - 终点色（hex）。
 * @param t - 插值系数（0 = a，1 = b；范围外截断）。
 * @returns 插值后的 `#rrggbb`；任一输入不可解析时原样返回 `a`。
 */
export declare function mixHex(a: string, b: string, t: number): string;
/**
 * 光带高亮色派生：base 向白色混合 ~65%（GIF 光带的提亮感），不硬编码
 * GIF 原色以保持主题一致性。
 * @param base - 基色（主题语义 token）。
 * @returns 提亮后的 hex；base 不可解析（16 色轨）时原样返回。
 */
export declare function shimmerHighlight(base: string): string;
/** shimmerLine 的渲染输入。 */
export interface ShimmerInput {
    /** 要渲染的单行文本（不含换行）。 */
    text: string;
    /** 动画帧序号（app.ts 120ms tick）。 */
    tick: number;
    /** 基色（hex 或 16 色轨命名色；后者触发静态降级）。 */
    base: string;
    /** 光带高亮色（hex；通常由 {@link shimmerHighlight} 派生）。 */
    highlight: string;
    /** 一轮扫过的 tick 数；缺省 {@link SHIMMER_PERIOD_TICKS}。 */
    periodTicks?: number;
    /** 光带半宽（显示列）；缺省 {@link SHIMMER_BAND_COLS}。 */
    bandCols?: number;
}
/**
 * 渲染一帧 shimmer 行：光带中心随 tick 从文本左侧 band 列外扫到右侧
 * band 列外（进出场与 GIF 的循环「熄灭」帧一致），带内字符按与中心的
 * 显示列距离做余弦衰减插值。
 * @param input - 文本、tick 与颜色参数。
 * @returns 单行 ANSI 串（末尾 RESET）；base/highlight 任一不可解析时
 *   降级为静态 base 色整行。
 */
export declare function shimmerLine(input: ShimmerInput): string;
