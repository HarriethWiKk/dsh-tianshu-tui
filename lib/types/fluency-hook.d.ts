/**
 * fluency-hook — 流利度追踪器（9d 移植）。
 *
 * FluencyTracker 消费工具事件流（tool/call、tool/result、agent 阶段、
 * turn 边界），维护连续 routine 计数 / 输出速率 / 静默时长等信号，
 * getPolicy() 折叠为渲染策略（见 format/fluency-policy.ts）。
 *
 * 移植自 .rivet/tui-source/tui/fluency-hook.ts（Apache-2.0；SOURCE-MAP.md）。
 * 差异：ActivityPhase 适配本包五值；contextPressure 由装配层喂入
 * （0..1，TUI 无 token 数据源时保持 0）。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/fluency-hook
 */
import { type FluencyPolicy } from './format/fluency-policy.js';
import type { ActivityPhase } from './activity-status.js';
/** 一次工具结果事件的追踪输入：工具名、是否出错、结果文本长度。 */
export interface ToolResultEvent {
    name: string;
    isError: boolean;
    resultLength: number;
}
/**
 * 流利度追踪器：消费工具/阶段/回合事件，维护连续 routine 计数、
 * 输出速率、静默时长等信号，供 getPolicy() 折叠为渲染策略。
 */
export declare class FluencyTracker {
    private routine;
    private lastEventAt;
    private contextPressure;
    private lastIsError;
    private lastIsApproval;
    private phase;
    private outputRate;
    private resultLength;
    /**
     * 判定一次工具调用是否算 routine（只读检索类且未出错）。
     * @param name - 工具名。
     * @param isError - 该次调用是否出错；出错一律不算 routine。
     * @returns 属于 routine 工具集且未出错时为 true。
     */
    isRoutineTool(name: string, isError: boolean): boolean;
    /**
     * 记录一次工具结果：更新 routine 计数、输出速率与错误/审批标记，阶段切到 tool。
     * @param event - 工具结果事件。
     */
    recordToolResult(event: ToolResultEvent): void;
    /** 记录一次审批交互：置审批标记并清零连续 routine 计数。 */
    recordApproval(): void;
    /**
     * 由装配层喂入上下文压力信号（TUI 无 token 数据源时保持 0）。
     * @param pressure - 上下文压力，0..1。
     */
    setContextPressure(pressure: number): void;
    /**
     * 切换当前活动阶段并重置静默计时起点。
     * @param phase - 新的活动阶段。
     */
    setPhase(phase: ActivityPhase): void;
    /**
     * 回填已静默的时长（把静默计时起点拨回 silentMs 毫秒前）。
     * @param silentMs - 已静默的毫秒数。
     */
    updateSilence(silentMs: number): void;
    /** 回合结束：清空全部信号并回到 idle 阶段。 */
    onTurnComplete(): void;
    /**
     * 把当前信号快照折叠为渲染策略。
     * @returns 由 computeFluencyPolicy 计算的当前流利度策略。
     */
    getPolicy(): FluencyPolicy;
}
