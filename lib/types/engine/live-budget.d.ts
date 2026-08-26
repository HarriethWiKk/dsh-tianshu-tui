/**
 * live 区动态段预算：Working 行封顶、欢迎首帧只裁不垫、高水位只涨不缩。
 * 纯函数，不碰 stdout。
 */
/** padDynamicRegion 输入行（与 LiveRegionLine 结构兼容）。 */
export interface LiveBudgetLine {
    text: string;
}
/** `padDynamicRegion` 的垫/裁开关。缺省垫到 budget；skipPad 只裁不垫。 */
export interface PadDynamicRegionOptions {
    /**
     * 动态段短于 budget 时是否垫空行。`false`：只按 budget 从顶裁，欢迎首帧
     * 不凭空空白，但仍把 Working 行限制在封顶内。
     */
    pad?: boolean;
}
/**
 * 溢出裁剪 + 定高垫高：把 `[0, chromeStart)` 限制在恰好 `budget` display rows。
 * `budget <= 0` 且垫行：原样返回。`pad: false`：只裁不垫；budget 0 丢掉动态段。
 */
export declare function padDynamicRegion<T extends LiveBudgetLine>(lines: readonly T[], chromeStart: number, budget: number, rowsForLine?: (text: string) => number, options?: PadDynamicRegionOptions): {
    lines: T[];
    chromeStart: number;
};
/** live 区行上限：随终端高度收缩，封顶 28、下限 4。 */
export declare function liveMaxRowsFor(rows: number): number;
/** Working 行封顶：给 chrome 留位。 */
export declare function workingRowsCap(terminalRows: number, chromeRows: number): number;
/**
 * 动态段预算：高水位只涨不缩。skipPad 按 min(动态行, ceiling) 裁且不改高水位。
 */
export declare function nextDynamicBudget(highWater: number, dynamicRows: number, ceiling: number, skipPad: boolean, freezeHighWater?: boolean): {
    budget: number;
    highWater: number;
};
/** live 区同时展示的进行中工具卡数量上限。 */
export declare const LIVE_TOOL_CARD_MAX = 3;
