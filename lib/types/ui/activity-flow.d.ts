/**
 * activity-flow — 子代理/工作流活动带的纯装配面。
 *
 * 把 TuiApp 缓存 fold 成活动带、完成行摘要、委派树合并与外部 run 读取。
 * 不碰渲染引擎、不订阅事件；缺宿主面（subagentProgress / activeExternalRuns）
 * 时对应段为空，不抛。
 *
 * @module @huiliyi37/dsh-tianshu-tui/ui/activity-flow
 */
import { type ActivityItem } from '../format/activity-band.js';
import { type SubagentDoneStats } from '../format/subagent-line.js';
import type { RivetTheme } from '../theme.js';
import type { DelegationIdentityProjection, DelegationProgressProjection, DelegationTimingProjection, DelegationTreeEntry, ExternalRunEntry } from '../delegation-panel.js';
import type { WorkflowRunView } from '../workflow-panel.js';
export { childStateFromEntries, mergeDelegationProjections } from '../render/live-panels.js';
/** 委派快照切片（identities/timings 旁路 + 外部 run / now）。 */
export declare function delegationSnapshotSlice(input: {
    subagentsPanelVisible: boolean;
    delegationEntries: DelegationTreeEntry[] | null;
    projectionCache: Partial<Record<string, unknown>> | null;
    externalRuns: ExternalRunEntry[];
    now: number;
}): {
    subagentsPanelVisible: boolean;
    delegationEntries: DelegationTreeEntry[] | null;
    subagentIdentities: ReadonlyMap<string, DelegationIdentityProjection>;
    subagentTimings: ReadonlyMap<string, DelegationTimingProjection>;
    externalRuns: ExternalRunEntry[];
    now: number;
};
/** 运行中 workflow 缓存 → 面板视图。 */
export declare function runningWorkflowView(state: {
    id: string;
    meta: WorkflowRunView['info']['meta'];
    agents: WorkflowAgentSlot[];
    startedAt: number;
    logs: string[];
}, now: number): WorkflowRunView;
/** 运行中 + 已结算 workflow → 面板视图。 */
export declare function foldWorkflowViews(running: Iterable<Parameters<typeof runningWorkflowView>[0]>, completed: Iterable<WorkflowRunView>, now: number): WorkflowRunView[];
/** workflow/end 折叠为带 result 的视图。 */
export declare function settleWorkflowView(state: Parameters<typeof runningWorkflowView>[0], result: {
    stopReason: string;
    error?: string;
}, now: number): WorkflowRunView;
/** workflow 缓存里的 agent 槽。 */
export interface WorkflowAgentSlot {
    seq: number;
    label: string;
    childId?: string;
    outcome?: 'completed' | 'failed' | 'cancelled';
}
/** end 时取走 child 统计（无缓存 → undefined）。 */
export declare function takeChildStats(childProgress: Map<string, DelegationProgressProjection>, childId: string): SubagentDoneStats | undefined;
/** 子会话投影：缓存 progress / 重拉树。无关 key 早退。 */
export declare function noteForeignProjection(input: {
    sessionId: string;
    key: string;
    value: unknown;
    panelVisible: boolean;
}, state: {
    childProgress: Map<string, DelegationProgressProjection>;
    subagentRuns: Iterable<{
        childId: string;
    }>;
    delegationEntries: DelegationTreeEntry[] | null;
}, refreshTree: () => void): boolean;
/** 投影总线的 subagentProgress 值结构校验。 */
export declare function isSubagentProgressValue(value: unknown): value is DelegationProgressProjection;
/** 子会话投影变更：是否缓存 progress、是否重拉委派树。 */
export declare function classifyForeignProjection(input: {
    key: string;
    panelVisible: boolean;
    treeHasChild: boolean;
    isRunningChild: boolean;
    value: unknown;
}): {
    cacheProgress: DelegationProgressProjection | null;
    refreshTree: boolean;
};
/** 运行中 subagent 缓存项。 */
export interface CachedSubagentRun {
    label: string;
    startedAt: number;
    childId: string;
}
/** 运行中 workflow 缓存项（fold 所需最小面）。 */
export interface CachedWorkflowRun {
    id: string;
    meta: {
        name: string;
        description: string;
    };
    phase: string | null;
    agents: unknown[];
    startedAt: number;
}
/** 三类缓存 → 活动带 items。 */
export declare function foldActivityFromCaches(input: {
    subagentRuns: Iterable<[string, CachedSubagentRun]>;
    childProgress: ReadonlyMap<string, DelegationProgressProjection>;
    workflowRuns: Iterable<CachedWorkflowRun>;
    tasks: Array<{
        id: string;
        kind: string;
        label: string;
        status: string;
        startedAt: number;
    }>;
}): ActivityItem[];
/** 活动带或逃生门散行（关带时不 fold）。 */
export declare function renderActivitySection(input: {
    enabled: boolean;
    subagentRuns: Iterable<[string, CachedSubagentRun]>;
    childProgress: ReadonlyMap<string, DelegationProgressProjection>;
    workflowRuns: Iterable<CachedWorkflowRun>;
    tasks: Array<{
        id: string;
        kind: string;
        label: string;
        status: string;
        startedAt: number;
    }>;
    width: number;
    maxRows: number;
    now: number;
    tick: number;
    theme: RivetTheme;
}): string[];
/** workflow 结束摘要（已着色）。 */
export declare function formatWorkflowSummary(view: WorkflowRunView, theme: RivetTheme): string;
/** 可选 activeExternalRuns；缺失或抛错 → 空数组。 */
export declare function readExternalRuns(facet: {
    activeExternalRuns?: () => ExternalRunEntry[];
} | undefined): ExternalRunEntry[];
