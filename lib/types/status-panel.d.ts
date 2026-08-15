/**
 * /status 状态面板（grok-build goal_detail 面板移植，纯函数层）。
 *
 * projectStatusPanel 把 goal/todos/plan 三个投影快照渲染为面板行：
 * 目标段（状态标签 + objective + 轮次 + 阻塞原因）、任务段（复用
 * task-panel 三态行）、计划模式段（active/pending 徽标）。null 快照 =
 * 从未写入（该段不渲染）；空数组 = 已清空（任务段渲染占位）。TuiApp 消费
 * sessionProjections 的 goal/todos/plan 单元，/status 命令切换显隐，行
 * 渲染进 live 区（接线在 ui/app.ts 与 registry.ts，由其他维度独占）。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/status-panel
 */
import { type TaskItem } from './format/task-panel.js';
/** goal 投影单元的状态阶段（与 goal 包 wire 形状一致）。 */
export type GoalPhase = 'active' | 'paused' | 'blocked' | 'complete';
/** goal 投影单元的 wire 形状（结构兼容 goal 包 GoalProjection，纯函数层不跨包依赖）。 */
export interface GoalProjectionInput {
    goal: {
        objective: string;
        phase: GoalPhase;
        /** blocked 时的阻塞原因（可选）。 */
        blockedReason?: {
            code: string;
            message: string;
        };
        maxGoalRounds: number;
    };
    roundsStarted: number;
}
/** plan 投影单元的 wire 形状（结构兼容 plan-mode 包 { active, pending? }）。 */
export interface PlanProjectionInput {
    active: boolean;
    /** 用户轮内选择尚未落实（pending 仅此时为 true）。 */
    pending?: boolean;
}
/** status_label 三元组：状态 → (文本, 颜色, 阶段)。颜色为语义色名，接线层映射主题色。 */
export interface GoalStatusLabel {
    text: string;
    color: 'green' | 'yellow' | 'red' | 'blue';
    stage: GoalPhase;
}
/** 会话级汇总段输入（summary-state 模型的展示投影）。 */
export interface SessionTotalsInput {
    /** 已完成轮数（turn/end 累计）。 */
    turns: number;
    /** 已完成轮的工具调用总数。 */
    toolCalls: number;
    /** 已完成轮的工具耗时合计（真实毫秒）。 */
    elapsedMs: number;
}
/**
 * 状态 → (文本, 颜色, 阶段) 三元组映射（grok-build status_label 模式）。
 * @param phase - goal 投影单元的状态阶段。
 * @returns 状态文本、语义色名与阶段标识。
 */
export declare function goalStatusLabel(phase: GoalPhase): GoalStatusLabel;
/**
 * 投影 goal/todos/plan 快照为 /status 面板行。
 * @param goal - goal 投影快照；null（从未写入）→ 目标段不渲染。
 * @param todos - 任务快照；null → 任务段不渲染，空数组 → 渲染占位。
 * @param plan - plan 投影快照；null → 计划段不渲染。
 * @param opts - 渲染选项（含行截断宽度预算与可选会话汇总段）。
 * @returns 面板行数组（段按目标/任务/计划/会话顺序拼接）。
 */
export declare function projectStatusPanel(goal: GoalProjectionInput | null, todos: TaskItem[] | null, plan: PlanProjectionInput | null, opts: {
    width: number;
    sessionTotals?: SessionTotalsInput | null;
}): string[];
