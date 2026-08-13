/**
 * TUI 渲染性能监控：按采样点计时（p50/p99/max）+ 事件循环延迟直方图 + 缓存命中率。
 * 未启用（--debug-perf / RIVET_DEBUG_TELEMETRY=1 之外）时所有操作为 no-op 零开销。
 */
/** 计时采样点名称（渲染管线的四个热点阶段）。 */
export type TuiPerfSample = 'renderLive' | 'delta' | 'formatMarkdown' | 'flush';
/** 单个采样点的耗时统计（毫秒，保留两位小数）。 */
export interface PerfStats {
    count: number;
    p50Ms: number;
    p99Ms: number;
    maxMs: number;
}
/** 事件循环延迟统计（毫秒）。 */
export interface LoopLagStats {
    p99Ms: number;
    maxMs: number;
}
/** 事件循环延迟直方图抽象（Node monitorEventLoopDelay 的最小接口，测试可注入替身）。 */
export interface EventLoopHistogram {
    readonly max: number;
    enable(): void;
    disable(): void;
    reset(): void;
    percentile(percentile: number): number;
}
/** summary() 产出的完整性能快照（可直接序列化进诊断日志）。 */
export interface TuiPerfSummary {
    kind: 'perf-summary';
    samples: Record<TuiPerfSample, PerfStats>;
    cache: {
        hits: number;
        misses: number;
    };
    loopLag: LoopLagStats;
}
interface TuiPerfMonitorOptions {
    enabled: boolean;
    now?: () => number;
    createHistogram?: () => EventLoopHistogram;
}
/**
 * 判断性能监控是否应启用：`--debug-perf` 命令行开关或 `RIVET_DEBUG_TELEMETRY=1`。
 * @param args - 命令行参数（默认 process.argv.slice(2)，可注入用于测试）
 * @param env - 环境变量集合（默认 process.env，可注入用于测试）
 * @returns 应启用监控时为 true
 */
export declare function isTuiPerfEnabled(args?: readonly string[], env?: Readonly<Record<string, string | undefined>>): boolean;
/**
 * TUI 性能监控器。enabled=false 时不分配采样存储、不开直方图，
 * 所有记录方法直通返回；enabled=true 时每个采样点保留最近 4096 条样本。
 * 用完调用 stop() 关闭事件循环直方图。
 */
export declare class TuiPerfMonitor {
    /** 监控是否启用（构造时确定，不可变）。 */
    readonly enabled: boolean;
    private readonly now;
    private readonly histogram?;
    private readonly samples?;
    private readonly counts?;
    private readonly maxima?;
    private cacheHits;
    private cacheMisses;
    private lastLoopLag;
    private lastLoopLagAt;
    private stopped;
    constructor(options: TuiPerfMonitorOptions);
    /**
     * 计时执行一个同步操作并记录耗时（操作抛错时仍记录，异常原样上抛）。
     * @param name - 采样点名称
     * @param operation - 被计时的同步操作
     * @returns operation 的返回值
     */
    measure<T>(name: TuiPerfSample, operation: () => T): T;
    /**
     * 记录一次外部测得的耗时（负值钳为 0；超出保留上限时逐出最旧样本）。
     * @param name - 采样点名称
     * @param durationMs - 耗时（毫秒）
     */
    record(name: TuiPerfSample, durationMs: number): void;
    /**
     * 记录一次缓存命中/未命中。
     * @param hit - true 计命中，false 计未命中
     */
    recordCache(hit: boolean): void;
    /**
     * 读取事件循环延迟统计（带最小采样间隔的缓存；采样后重置直方图窗口）。
     * @param minIntervalMs - 两次真实采样的最小间隔（默认 1000ms），间隔内返回缓存值
     * @returns 最近窗口的延迟统计；未启用时为上次缓存（初始全 0）
     */
    getLoopLagWindow(minIntervalMs?: number): LoopLagStats;
    /**
     * 汇总全部采样点的统计快照（p50/p99 基于保留样本，count/max 为全程累计）。
     * @returns 性能快照；未启用监控时为 undefined
     */
    summary(): TuiPerfSummary | undefined;
    /** 关闭事件循环直方图（幂等；未启用监控时为 no-op）。 */
    stop(): void;
    private sampleLoopLag;
}
export {};
