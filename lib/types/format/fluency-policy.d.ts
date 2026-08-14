/**
 * fluency-policy — 流利度策略（9d 移植，ActivityPhase 适配本包 5 值）。
 *
 * 从信号（phase/silentMs/outputRate/resultLength/contextPressure/isError/
 * isApproval/consecutiveRoutine）推出渲染策略：visibility（normal/quiet/
 * inspect/stress）、foldRoutine、coalesceMs、stale 提示。
 *
 * 移植自 .rivet/tui-source/tui/fluency-policy.ts（Apache-2.0；SOURCE-MAP.md）。
 * 差异：本包 ActivityPhase 为 idle/tool/waiting/thinking/streaming 五值，
 * 源的 analyzing/mcp/compacting/preflight 档位及其分支已删除。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/format/fluency-policy
 */
import type { ActivityPhase } from '../activity-status.js';
/** 渲染可见度档位：normal 常规 / quiet 折叠例行 / inspect 醒目呈现 / stress 高压聚合。 */
export type FluencyVisibility = 'normal' | 'quiet' | 'inspect' | 'stress';
/** 策略输入信号：活动相位、静默时长、输出速率与错误/审批标记等。 */
export interface FluencySignals {
    phase: ActivityPhase;
    silentMs: number;
    outputRate: number;
    resultLength: number;
    contextPressure: number;
    isError: boolean;
    isApproval: boolean;
    consecutiveRoutine: number;
    /** 是否有请求在途。缺省按 true 处理（兼容旧信号源）；false 时静默提示不触发——
     *  回合结束后 agent 已 idle，silentMs 仍在增长，继续提示会把已完成的回复
     *  谎报成 "Waiting for response"。 */
    inFlight?: boolean;
}
/** 策略输出：可见度、是否折叠例行事件、聚合窗口与可选停滞提示。 */
export interface FluencyPolicy {
    visibility: FluencyVisibility;
    foldRoutine: boolean;
    coalesceMs: number;
    staleMessage?: string;
    staleLevel?: 'info' | 'warn' | 'action';
}
/** 按阶段分档的等待提示。到 action 档会明确告诉用户可以 Ctrl+C——长等待里
 *  「还活着吗 / 我能做什么」是唯一真正要回答的两个问题。
 *
 *  由 TuiApp.renderLive 的 spinner 区直接消费。
 * @param phase - 当前活动相位（决定分档阈值与文案）。
 * @param silentMs - 静默时长（毫秒）。
 * @returns 达到 info/warn/action 档时返回提示与级别；未达 info 档返回 null。 */
export declare function getPhaseStaleMessage(phase: ActivityPhase, silentMs: number): {
    message: string;
    level: 'info' | 'warn' | 'action';
} | null;
/**
 * 从信号推出渲染策略。优先级：错误/审批（恒 inspect）> 高上下文压力
 * （stress + 聚合）> 长静默（inspect + stale 提示）> 大结果/高输出速率
 * （inspect + 折叠）> 连续例行（quiet）> normal。
 * @param signals - 当前信号快照。
 * @returns 命中的首个策略档位。
 */
export declare function computeFluencyPolicy(signals: FluencySignals): FluencyPolicy;
/** 连续例行事件计数器：非例行事件即清零，连续 ≥4 次触发折叠。 */
export declare class RoutineCounter {
    private _count;
    /** 当前连续例行事件计数。 */
    get count(): number;
    /**
     * 记录一个事件：例行则累加，非例行则清零。
     * @param isRoutine - 该事件是否例行。
     */
    record(isRoutine: boolean): void;
    /** 清零计数。 */
    reset(): void;
    /** 是否应折叠例行事件（连续 ≥4 次）。 */
    get shouldFold(): boolean;
}
