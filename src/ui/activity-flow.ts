/**
 * activity-flow — 子代理/工作流活动带的纯装配面。
 *
 * 把 TuiApp 缓存 fold 成活动带、完成行摘要、委派树合并与外部 run 读取。
 * 不碰渲染引擎、不订阅事件；缺宿主面（subagentProgress / activeExternalRuns）
 * 时对应段为空，不抛。
 *
 * @module @huiliyi37/dsh-tianshu-tui/ui/activity-flow
 */

import { color } from '../engine/ansi.js'
import {
  foldActivityItems,
  formatActivityBand,
  type ActivityItem,
  type SubagentRunInput,
  type WorkflowRunInput,
  type ActiveTaskInput,
} from '../format/activity-band.js'
import { formatElapsedHuman } from '../format/spinner-status.js'
import { formatSubagentRunning, type SubagentDoneStats } from '../format/subagent-line.js'
import type { RivetTheme } from '../theme.js'
import type {
  DelegationIdentityProjection,
  DelegationProgressProjection,
  DelegationTimingProjection,
  DelegationTreeEntry,
  ExternalRunEntry,
} from '../delegation-panel.js'
import type { WorkflowRunView } from '../workflow-panel.js'

export { childStateFromEntries, mergeDelegationProjections } from '../render/live-panels.js'

/** 委派快照切片（identities/timings 旁路 + 外部 run / now）。 */
export function delegationSnapshotSlice(input: {
  subagentsPanelVisible: boolean
  delegationEntries: DelegationTreeEntry[] | null
  projectionCache: Partial<Record<string, unknown>> | null
  externalRuns: ExternalRunEntry[]
  now: number
}): {
  subagentsPanelVisible: boolean
  delegationEntries: DelegationTreeEntry[] | null
  subagentIdentities: ReadonlyMap<string, DelegationIdentityProjection>
  subagentTimings: ReadonlyMap<string, DelegationTimingProjection>
  externalRuns: ExternalRunEntry[]
  now: number
} {
  return {
    subagentsPanelVisible: input.subagentsPanelVisible,
    delegationEntries: input.delegationEntries,
    subagentIdentities: (input.projectionCache?.subagent as
      ReadonlyMap<string, DelegationIdentityProjection> | undefined) ?? new Map(),
    subagentTimings: (input.projectionCache?.subagentTiming as
      ReadonlyMap<string, DelegationTimingProjection> | undefined) ?? new Map(),
    externalRuns: input.externalRuns,
    now: input.now,
  }
}

/** 运行中 workflow 缓存 → 面板视图。 */
export function runningWorkflowView(
  state: {
    id: string
    meta: WorkflowRunView['info']['meta']
    agents: WorkflowAgentSlot[]
    startedAt: number
    logs: string[]
  },
  now: number,
): WorkflowRunView {
  return {
    info: { id: state.id, meta: state.meta },
    agents: state.agents.map(a => ({
      seq: a.seq,
      label: a.label,
      childId: a.childId ?? '',
      outcome: a.outcome ?? 'completed',
    })),
    elapsedMs: now - state.startedAt,
    ...(state.logs.length === 0 ? {} : { logs: [...state.logs] }),
  }
}

/** 运行中 + 已结算 workflow → 面板视图。 */
export function foldWorkflowViews(
  running: Iterable<Parameters<typeof runningWorkflowView>[0]>,
  completed: Iterable<WorkflowRunView>,
  now: number,
): WorkflowRunView[] {
  const views: WorkflowRunView[] = []
  for (const state of running) views.push(runningWorkflowView(state, now))
  views.push(...completed)
  return views
}

/** workflow/end 折叠为带 result 的视图。 */
export function settleWorkflowView(
  state: Parameters<typeof runningWorkflowView>[0],
  result: { stopReason: string; error?: string },
  now: number,
): WorkflowRunView {
  return {
    ...runningWorkflowView(state, now),
    result: {
      stopReason: result.stopReason as NonNullable<WorkflowRunView['result']>['stopReason'],
      ...(result.error === undefined ? {} : { error: result.error }),
      agentsStarted: state.agents.length,
    },
  }
}

/** workflow 缓存里的 agent 槽。 */
export interface WorkflowAgentSlot {
  seq: number
  label: string
  childId?: string
  outcome?: 'completed' | 'failed' | 'cancelled'
}

/** end 时取走 child 统计（无缓存 → undefined）。 */
export function takeChildStats(
  childProgress: Map<string, DelegationProgressProjection>,
  childId: string,
): SubagentDoneStats | undefined {
  const progress = childProgress.get(childId)
  childProgress.delete(childId)
  return progress === undefined
    ? undefined
    : { toolCalls: progress.toolCalls, tokensUsed: progress.tokensUsed }
}

/** 子会话投影：缓存 progress / 重拉树。无关 key 早退。 */
export function noteForeignProjection(
  input: { sessionId: string; key: string; value: unknown; panelVisible: boolean },
  state: {
    childProgress: Map<string, DelegationProgressProjection>
    subagentRuns: Iterable<{ childId: string }>
    delegationEntries: DelegationTreeEntry[] | null
  },
  refreshTree: () => void,
): boolean {
  if (input.key !== 'subagentProgress' && input.key !== 'subagentTiming') return false
  let isRunningChild = false
  if (input.key === 'subagentProgress') {
    for (const run of state.subagentRuns) {
      if (run.childId === input.sessionId) { isRunningChild = true; break }
    }
  }
  let treeHasChild = false
  if (input.panelVisible && state.delegationEntries !== null) {
    for (const entry of state.delegationEntries) {
      if (entry.kind === 'child' && entry.id === input.sessionId) { treeHasChild = true; break }
    }
  }
  const hit = classifyForeignProjection({
    key: input.key,
    value: input.value,
    panelVisible: input.panelVisible,
    treeHasChild,
    isRunningChild,
  })
  if (hit.cacheProgress !== null) state.childProgress.set(input.sessionId, hit.cacheProgress)
  if (hit.refreshTree) refreshTree()
  return hit.cacheProgress !== null
}

/** 投影总线的 subagentProgress 值结构校验。 */
export function isSubagentProgressValue(value: unknown): value is DelegationProgressProjection {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.toolCalls === 'number'
    && typeof v.tokensUsed === 'number'
    && typeof v.toolInFlight === 'boolean'
}

/** 子会话投影变更：是否缓存 progress、是否重拉委派树。 */
export function classifyForeignProjection(input: {
  key: string
  panelVisible: boolean
  treeHasChild: boolean
  isRunningChild: boolean
  value: unknown
}): { cacheProgress: DelegationProgressProjection | null; refreshTree: boolean } {
  const progress = input.key === 'subagentProgress' && input.isRunningChild
    ? (isSubagentProgressValue(input.value) ? input.value : null)
    : null
  const refreshTree = input.panelVisible
    && (input.key === 'subagentProgress' || input.key === 'subagentTiming')
    && input.treeHasChild
  return { cacheProgress: progress, refreshTree }
}

/** 运行中 subagent 缓存项。 */
export interface CachedSubagentRun {
  label: string
  startedAt: number
  childId: string
}

/** 运行中 workflow 缓存项（fold 所需最小面）。 */
export interface CachedWorkflowRun {
  id: string
  meta: { name: string; description: string }
  phase: string | null
  agents: unknown[]
  startedAt: number
}

/** 三类缓存 → 活动带 items。 */
export function foldActivityFromCaches(input: {
  subagentRuns: Iterable<[string, CachedSubagentRun]>
  childProgress: ReadonlyMap<string, DelegationProgressProjection>
  workflowRuns: Iterable<CachedWorkflowRun>
  tasks: Array<{ id: string; kind: string; label: string; status: string; startedAt: number }>
}): ActivityItem[] {
  const subagentRuns: SubagentRunInput[] = []
  for (const [runId, run] of input.subagentRuns) {
    const progress = input.childProgress.get(run.childId)
    subagentRuns.push({
      runId,
      label: run.label,
      startedAt: run.startedAt,
      ...(progress === undefined ? {} : {
        progress: {
          toolCalls: progress.toolCalls,
          tokensUsed: progress.tokensUsed,
          ...(progress.lastTool === undefined ? {} : { lastTool: progress.lastTool }),
        },
      }),
    })
  }
  const workflowRuns: WorkflowRunInput[] = []
  for (const state of input.workflowRuns) {
    workflowRuns.push({
      id: state.id,
      name: state.meta.name,
      description: state.meta.description,
      phase: state.phase,
      agentCount: state.agents.length,
      startedAt: state.startedAt,
    })
  }
  const tasks: ActiveTaskInput[] = []
  for (const t of input.tasks) {
    if (t.status === 'running' || t.status === 'stopping') {
      tasks.push({ id: t.id, kind: t.kind, label: t.label, startedAt: t.startedAt })
    }
  }
  return foldActivityItems({ subagentRuns, workflowRuns, tasks })
}

/** 活动带或逃生门散行（关带时不 fold）。 */
export function renderActivitySection(input: {
  enabled: boolean
  subagentRuns: Iterable<[string, CachedSubagentRun]>
  childProgress: ReadonlyMap<string, DelegationProgressProjection>
  workflowRuns: Iterable<CachedWorkflowRun>
  tasks: Array<{ id: string; kind: string; label: string; status: string; startedAt: number }>
  width: number
  maxRows: number
  now: number
  tick: number
  theme: RivetTheme
}): string[] {
  if (!input.enabled) {
    const rows: string[] = []
    for (const [, run] of input.subagentRuns) {
      rows.push(...formatSubagentRunning({
        width: input.width,
        label: run.label,
        tick: input.tick,
      }, input.theme))
    }
    return rows
  }
  return formatActivityBand(foldActivityFromCaches({
    subagentRuns: input.subagentRuns,
    childProgress: input.childProgress,
    workflowRuns: input.workflowRuns,
    tasks: input.tasks,
  }), {
    width: input.width,
    maxRows: input.maxRows,
    now: input.now,
    tick: input.tick,
    theme: input.theme,
  })
}

/** workflow 结束摘要（已着色）。 */
export function formatWorkflowSummary(view: WorkflowRunView, theme: RivetTheme): string {
  const reason = view.result?.stopReason
  const mark = reason === 'completed' ? '✓' : reason === 'cancelled' ? '⊘' : '✗'
  const markColor = reason === 'completed' ? theme.success : reason === 'cancelled' ? theme.muted : theme.error
  const description = view.info.meta.description === ''
    ? `[${view.info.meta.name}]`
    : `[${view.info.meta.name}] ${view.info.meta.description}`
  const elapsed = view.elapsedMs === undefined ? '' : ` · ${formatElapsedHuman(view.elapsedMs)}`
  return `${color(mark, markColor)}${color(` ${description} · ${view.agents.length} 个 agent${elapsed}`, theme.muted)}`
}

/** 可选 activeExternalRuns；缺失或抛错 → 空数组。 */
export function readExternalRuns(
  facet: { activeExternalRuns?: () => ExternalRunEntry[] } | undefined,
): ExternalRunEntry[] {
  if (facet?.activeExternalRuns === undefined) return []
  try {
    const rows = facet.activeExternalRuns()
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}
