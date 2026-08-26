/**
 * MetricsGlanceController — 底部 glance 数据收集与刷新节流（Phase 5.3 数据基础）。
 *
 * 把 ui/app.ts 原先内联在 renderLive 里的状态行回退派生与错误行格式化收敛为
 * 纯函数（deriveGlanceStatus / deriveGlanceError / deriveGlance），控制器把它们
 * 包进「窗口内合并、窗口末重算」的节流。数据全部来自既有 LiveAgentState 与
 * statusLine 投影，不发明事件类型。
 *
 * 节流语义：
 * - 首次 refresh 恒同步重算（构造后立即可读，不依赖时钟）。
 * - 窗口内（throttleMs，默认 16ms 一帧）重复 refresh 合并到窗口末重算一次；
 *   窗口外 refresh 同步重算。重收集成本被节流封顶，状态行/错误行新鲜度 ≤ 一帧。
 * - 数据实际变化时经 onChange 推送（未变化不推送，避免重绘风暴）。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/engine/metrics-glance-controller
 */
import type { LiveAgentState } from '../adapter/live.js';
/** 底部 glance 一行数据（纯文本，无 ANSI——着色留在装配层）。 */
export interface GlanceLine {
    /**
     * 状态行文本：WorkflowStatusLine.current 优先，否则 agent 状态派生；
     * 空闲态 null（不占位——grok minimal 布局：空闲不渲染状态行，屏占让给内容）。
     */
    status: string | null;
    /** 错误行文本（glyph + 截断首行）；无错误 null。 */
    error: string | null;
    /**
     * 完整错误文本（多行、不截断）；无错误 null。glance 行空间受限只显首行，
     * 完整详情由装配层在新错误出现时落底 scrollback（diff 去重）——#49 类
     * 多行载荷（malformed SSE payload: <detail>）不再只剩一个光秃秃的冒号。
     */
    errorFull: string | null;
}
/** MetricsGlanceController 构造参数（数据源 getter + 节流窗口 + 变化回调）。 */
export interface MetricsGlanceControllerOptions {
    /** 状态行文本源（WorkflowStatusLine.current）；null = 无投影。 */
    getStatusText: () => string | null;
    /** live agent 状态源；undefined = 未挂载。 */
    getLiveState: () => LiveAgentState | undefined;
    /** 终端列数（错误首行截断度量）。 */
    getColumns: () => number;
    /** 刷新节流窗口（毫秒）；窗口内重复 refresh 合并到窗口末重算。默认 16（一帧）。 */
    throttleMs?: number;
    /** 数据实际变化时回调（节流后触发）。 */
    onChange?: (data: GlanceLine) => void;
}
/**
 * 状态行派生：工作流投影优先，否则 agent 状态回退（复刻 TuiApp 旧装配）。
 * 空闲态返回 null（不渲染不占位）：空闲提示已由 footer 承载，状态行只在
 * 「有事发生」（运行中/已停止/投影文本）时出现。
 * @param statusText - WorkflowStatusLine.current；null = 无投影。
 * @param live - live agent 状态；undefined = 未挂载。
 * @returns 状态行纯文本；空闲 null。
 */
export declare function deriveGlanceStatus(statusText: string | null, live: LiveAgentState | undefined): string | null;
/**
 * 错误行派生：glyph（ascii 降级）+ 首行截断至 cols-2（复刻 TuiApp 旧装配）。
 * @param live - live agent 状态；无 lastError 或未挂载时返回 null。
 * @param columns - 终端列数。
 * @returns 错误行纯文本；无错误 null。
 */
export declare function deriveGlanceError(live: LiveAgentState | undefined, columns: number): string | null;
/**
 * 完整错误文本派生（多行、不截断）：scrollback 落底数据源。Error 实例取
 * message，其余 String 化——与 {@link deriveGlanceError} 同一归一口径。
 * @param live - live agent 状态；无 lastError 或未挂载时返回 null。
 * @returns 完整错误文本；无错误 null。
 */
export declare function deriveGlanceErrorFull(live: LiveAgentState | undefined): string | null;
/**
 * 整帧 glance 派生（状态行 + 错误行 + 完整错误文本一次计算）。
 * @param statusText - WorkflowStatusLine.current；null = 无投影
 * @param live - live agent 状态；undefined = 未挂载
 * @param columns - 终端列数（错误首行截断度量）
 * @returns 状态行 + 错误行数据
 */
export declare function deriveGlance(statusText: string | null, live: LiveAgentState | undefined, columns: number): GlanceLine;
/**
 * 底部 glance 数据收集 + 刷新节流控制器。
 * renderLive 每帧调用 refresh() 后读 current()：窗口内读缓存（零重收集），
 * 窗口外同步重算——收集成本与渲染节奏解耦。
 */
export declare class MetricsGlanceController {
    private cache;
    private computed;
    private lastComputeAt;
    private timer;
    private readonly throttleMs;
    private readonly options;
    constructor(options: MetricsGlanceControllerOptions);
    /**
     * 当前缓存的 glance 数据（renderLive 每帧读取；新鲜度 ≤ 节流窗口）。
     * @returns 最近一次重算的 glance 数据
     */
    current(): GlanceLine;
    /**
     * 请求刷新。首次恒同步重算；此后窗口内合并到窗口末、窗口外同步重算。
     * 数据实际变化时经 onChange 推送。
     */
    refresh(): void;
    /** 清空待执行定时器（幂等）。 */
    dispose(): void;
    private compute;
}
