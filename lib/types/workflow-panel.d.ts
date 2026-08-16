/**
 * workflow-panel — 工作流运行态面板（grok workflows.rs render_list/roster 移植，纯函数层）。
 *
 * projectWorkflow 把多个 run 的运行态视图投影为面板行：
 * - 列表行：状态字形 + badge + objective + meta（phases/agents/elapsed），cancelled 整行 DIM 置灰；
 * - 展开行：opts.expanded 命中的 run 追加 roster（label + phase + 状态）；
 * - 终态汇总：消费 stopReason/agentsStarted（grok 的死字段我们消费），error 消息可选进汇总行。
 * 数据面形状结构兼容 workflow 包 types.ts（WorkflowRunInfo 字段名 id；WorkflowAgentEndInfo
 * 追加 outcome；WorkflowResultInfo 无 value），纯函数层不跨包依赖、无 I/O。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/workflow-panel
 */
/** run 终态原因（结构兼容 workflow 包 WorkflowStopReason）。 */
export type WorkflowStopReasonInput = 'completed' | 'cancelled' | 'error';
/** 单个 agent() 调用的结算方式（结构兼容 workflow 包 WorkflowAgentOutcome）。 */
export type WorkflowAgentOutcomeInput = 'completed' | 'failed' | 'cancelled';
/** run 的 meta 块（结构兼容 workflow 包 WorkflowMeta，纯函数层只消费 name/description/phases）。 */
export interface WorkflowMetaInput {
    name: string;
    description: string;
    phases?: {
        title: string;
    }[];
}
/** run 标识与 meta（结构兼容 workflow 包 WorkflowRunInfo：字段名 id 非 runId）。 */
export interface WorkflowRunInfoInput {
    id: string;
    meta: WorkflowMetaInput;
}
/** 一次 agent() 调用的结算信息（结构兼容 workflow 包 WorkflowAgentEndInfo）。 */
export interface WorkflowAgentEndInfoInput {
    /** 1-based 调用序号。 */
    seq: number;
    /** 显示标签（label 选项或 prompt 片段）。 */
    label: string;
    /** 所属阶段（phase 选项或当前 phase() 标题）。 */
    phase?: string;
    /** 子代理 id（roster 定位用，面板不渲染）。 */
    childId: string;
    /** 结算方式。 */
    outcome: WorkflowAgentOutcomeInput;
}
/** run 终态汇总（结构兼容 workflow 包 WorkflowResultInfo：无 result value）。 */
export interface WorkflowResultInfoInput {
    stopReason: WorkflowStopReasonInput;
    /** 失败消息（stopReason 非 completed 时才有）。 */
    error?: string;
    /** run 全程接受的 agent() 调用数。 */
    agentsStarted: number;
}
/** 单个 run 的运行态视图（面板消费的形状；result 缺省 = 运行中）。 */
export interface WorkflowRunView {
    info: WorkflowRunInfoInput;
    /** 已结算的 agent 调用（roster 数据源）。 */
    agents: WorkflowAgentEndInfoInput[];
    /** 终态汇总；undefined = 尚未结算（列表行按运行中渲染）。 */
    result?: WorkflowResultInfoInput;
    /** 已运行时长（毫秒）；缺省不渲染时间段。 */
    elapsedMs?: number;
    /** 脚本叙述行（workflow/log 回放；缺省/空数组不渲染）。 */
    logs?: string[];
}
/** 面板选项。 */
export interface WorkflowPanelOptions {
    /** 终端列数（行截断预算，含标题）。 */
    width: number;
    /** 展开显示 roster + 终态汇总的 run id 集合；缺省全部折叠。 */
    expanded?: string[];
}
/**
 * 投影多个 run 的运行态视图为面板行（标题 + 列表行 + 展开的 roster/终态汇总）。
 * @param runs - run 视图数组；空数组 → 标题 + 空态占位。
 * @param opts - 面板选项（行宽 + 展开集合）。
 * @returns 面板行数组。
 */
export declare function projectWorkflow(runs: WorkflowRunView[], opts: WorkflowPanelOptions): string[];
