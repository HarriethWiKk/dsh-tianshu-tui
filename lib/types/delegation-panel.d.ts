/**
 * 委派树面板（grok-build tasks_pane 分组行移植，纯函数层）。
 *
 * projectDelegationTree 把 listDescendants 的树条目投影为活区卡：标题行 +
 * 每层一张卡。depth 驱动缩进。状态形与工具卡同一套（进行中 ⠋ / 成功 › /
 * 失败 ✗）；mode 标记（one-shot ▶ / continuable ↻）留在 title。进行中且有
 * 活动时第二行 `⎿` 承载 activity / token / 工具计数；耗时与终态词留在
 * header suffix。空闲或已结束只留标题行。label 缺失回退 id 前 8 位短哈希。
 * diagnostic 条目渲染警示行（不吞异常、不伪造 activity/mode）。空 entries
 * 返回空数组。旧宿主条目无 progress/timing 时由 live-panels 合并投影后再传入。
 *
 * @module @huiliyi37/dsh-tianshu-tui/delegation-panel
 */
import type { RivetTheme } from './theme.js';
/** activity 状态：running 在 store 中存活，inactive 仅存在于持久化。 */
export type DelegationActivity = 'running' | 'inactive';
/** 委派模式：one-shot 一次性执行，continuable 可续会话。 */
export type DelegationMode = 'one-shot' | 'continuable';
/**
 * 委派树条目（结构兼容 dsh-subagent 的 SubagentDescendantListEntry——
 * 纯函数层不跨包依赖）。child 臂携带 activity/hasChildren/mode/label 与
 * 运行态投影（progress/timing）；diagnostic 臂说明候选为何没有 child 行。
 */
export type DelegationTreeEntry = {
    readonly kind: 'child';
    readonly id: string;
    readonly parentId: string;
    readonly depth: number;
    readonly activity: DelegationActivity;
    readonly hasChildren: boolean;
    readonly mode: DelegationMode;
    readonly label?: string;
    readonly progress?: DelegationProgressProjection;
    readonly timing?: DelegationTimingProjection;
} | {
    readonly kind: 'diagnostic';
    readonly id: string;
    readonly parentId: string;
    readonly depth: number;
    readonly reason: 'corrupt' | 'unsupported' | 'unavailable';
};
/** 运行态投影（结构兼容 dsh-subagent 的 SubagentProgressProjection）。 */
export interface DelegationProgressProjection {
    readonly turns: number;
    readonly toolCalls: number;
    readonly tokensUsed: number;
    readonly reasoningTokens?: number;
    readonly lastTool?: string;
    readonly toolInFlight: boolean;
    readonly lastTurnEnd?: 'completed' | 'aborted' | 'blocked' | 'error' | 'max-tokens' | 'interrupted';
    readonly running?: boolean;
}
/** 活跃外部 run（无本地 Session）。 */
export interface ExternalRunEntry {
    readonly id: string;
    readonly provider: string;
    readonly label?: string;
    readonly startedAt?: number;
}
/** 耗时投影（结构兼容 dsh-subagent 的 SubagentTimingProjection）。 */
export interface DelegationTimingProjection {
    readonly settledMs: number;
    readonly active?: {
        since: number;
        through: number;
    };
}
/** 身份投影（旧宿主旁路 Map；合并进条目后不再直接喂给渲染）。 */
export type DelegationIdentityProjection = {
    readonly mode: DelegationMode;
    readonly label?: string;
    readonly seq: number;
};
/** 渲染选项。 */
export interface DelegationPanelOptions {
    width: number;
    now?: number;
    theme?: RivetTheme;
}
/** 投影委派树为面板行。 */
export declare function projectDelegationTree(entries: DelegationTreeEntry[], opts: DelegationPanelOptions): string[];
/** 投影活跃外部 run 为面板行。 */
export declare function projectExternalRunSection(entries: ExternalRunEntry[], opts: DelegationPanelOptions): string[];
