/**
 * live 区动态段预算：Working 行封顶、欢迎首帧只裁不垫、高水位只涨不缩、
 * 空闲 ticker 跳过组装的 key / spinner 判定。纯函数，不碰 stdout。
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
/** snapshot 面 + chrome 面合成一帧 idle key（换行分隔，避免字段粘连）。 */
export declare function liveIdleKey(parts: {
    snapshotKey: string;
    chromeKey: string;
}): string;
/** 同 key 且无 spinner 才跳过；首帧 prevKey 为空、有转圈、key 变都必须组装。 */
export declare function shouldSkipIdleAssemble(opts: {
    prevKey: string | null;
    nextKey: string;
    hasSpinner: boolean;
}): boolean;
/** 任一转圈源为真：ticker 才推进 tick，空闲帧不改 key。 */
export declare function liveHasSpinner(flags: {
    agentRunning: boolean;
    activityRunning: boolean;
    pendingTools: boolean;
    reasoningLive: boolean;
}): boolean;
/** 一帧 idle 源（不含 now/tick，避免空闲 ticker 自己把 key 打漂）。 */
export interface LiveIdleSources {
    agentStatus: string;
    activity: ReadonlyArray<{
        id: string;
        status: string;
        lastTool?: string;
        toolCalls?: number;
        tokensUsed?: number;
    }>;
    pendingCallIds: readonly string[];
    activityBandEnabled: boolean;
    compactMode: boolean;
    rows: number;
    columns: number;
    panelFlags: string;
    btwActive: boolean;
    taskNotice: string;
    gitDirty: number;
    apiKeyReady: boolean;
    reasoningChars: number;
    reasoningExpanded: boolean;
    streamPeekChars: number;
    inputValue: string;
    questionPending: boolean;
    approvalPending: boolean;
    approvalTool: string;
    alwaysApprove: boolean;
    newlineMode: boolean;
    slashKey: string;
}
/** 把当前控制面折成 idle key；flush/batcher 路径不读此结果做跳过。 */
export declare function assembleIdleKey(src: LiveIdleSources): string;
