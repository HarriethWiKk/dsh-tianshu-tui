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

import type { RivetTheme } from './theme.js'
import { formatTokenCount } from './format/glance-bar.js'
import { formatLiveCard, liveCardGlyph, truncateToLiveWidth, type LiveCardStatus } from './format/live-card.js'
import { shortSessionLabel } from './session-label.js'

/** activity 状态：running 在 store 中存活，inactive 仅存在于持久化。 */
export type DelegationActivity = 'running' | 'inactive'

/** 委派模式：one-shot 一次性执行，continuable 可续会话。 */
export type DelegationMode = 'one-shot' | 'continuable'

/**
 * 委派树条目（结构兼容 dsh-subagent 的 SubagentDescendantListEntry——
 * 纯函数层不跨包依赖）。child 臂携带 activity/hasChildren/mode/label 与
 * 运行态投影（progress/timing）；diagnostic 臂说明候选为何没有 child 行。
 */
export type DelegationTreeEntry =
  | {
    readonly kind: 'child'
    readonly id: string
    readonly parentId: string
    readonly depth: number
    readonly activity: DelegationActivity
    readonly hasChildren: boolean
    readonly mode: DelegationMode
    readonly label?: string
    readonly progress?: DelegationProgressProjection
    readonly timing?: DelegationTimingProjection
  }
  | {
    readonly kind: 'diagnostic'
    readonly id: string
    readonly parentId: string
    readonly depth: number
    readonly reason: 'corrupt' | 'unsupported' | 'unavailable'
  }

/** 运行态投影（结构兼容 dsh-subagent 的 SubagentProgressProjection）。 */
export interface DelegationProgressProjection {
  readonly turns: number
  readonly toolCalls: number
  readonly tokensUsed: number
  readonly reasoningTokens?: number
  readonly lastTool?: string
  readonly toolInFlight: boolean
  readonly lastTurnEnd?: 'completed' | 'aborted' | 'blocked' | 'error' | 'max-tokens' | 'interrupted'
  readonly running?: boolean
}

/** 活跃外部 run（无本地 Session）。 */
export interface ExternalRunEntry {
  readonly id: string
  readonly provider: string
  readonly label?: string
  readonly startedAt?: number
}

/** 耗时投影（结构兼容 dsh-subagent 的 SubagentTimingProjection）。 */
export interface DelegationTimingProjection {
  readonly settledMs: number
  readonly active?: { since: number; through: number }
}

/** 身份投影（旧宿主旁路 Map；合并进条目后不再直接喂给渲染）。 */
export type DelegationIdentityProjection = {
  readonly mode: DelegationMode
  readonly label?: string
  readonly seq: number
}

/** 渲染选项。 */
export interface DelegationPanelOptions {
  width: number
  now?: number
  theme?: RivetTheme
}

const TITLE = '🌳 委派'

function modeMark(mode: DelegationMode): string {
  return mode === 'continuable' ? '↻' : '▶'
}

function reasonLabel(reason: Extract<DelegationTreeEntry, { kind: 'diagnostic' }>['reason']): string {
  if (reason === 'corrupt') return '损坏'
  if (reason === 'unavailable') return '不可用'
  return '不支持'
}

function shortHash(id: string): string {
  return shortSessionLabel(id)
}

function formatSettled(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

function liveSettled(timing: DelegationTimingProjection, now: number | undefined): number {
  if (timing.active !== undefined && now !== undefined) {
    return timing.settledMs + Math.max(0, now - timing.active.since)
  }
  return timing.settledMs
}

function activityText(progress: DelegationProgressProjection): string {
  if (progress.lastTool === undefined) return ''
  return progress.toolInFlight ? `Running: ${progress.lastTool}` : `Done: ${progress.lastTool}`
}

function tokensText(progress: DelegationProgressProjection): string {
  if (progress.tokensUsed <= 0) return ''
  return `${formatTokenCount(progress.tokensUsed)} tok`
}

function toolsText(progress: DelegationProgressProjection): string {
  if (progress.toolCalls <= 0) return ''
  return `${progress.toolCalls} 工具`
}

function terminalText(progress: DelegationProgressProjection): string {
  switch (progress.lastTurnEnd) {
    case 'completed': return '✓ 已完成'
    case 'aborted': return '◌ 已中断'
    case 'error': return '✗ 出错'
    case 'max-tokens': return '✗ 达上限'
    case 'blocked': return '⏸ 阻塞'
    case 'interrupted': return '◌ 中断'
    default: return ''
  }
}

/** 投影委派树为面板行。 */
export function projectDelegationTree(
  entries: DelegationTreeEntry[],
  opts: DelegationPanelOptions,
): string[] {
  if (entries.length === 0) return []
  const rows = [truncateToLiveWidth(TITLE, opts.width)]
  for (const entry of entries) {
    rows.push(...renderEntry(entry, opts))
  }
  return rows
}

/** 投影活跃外部 run 为面板行。 */
export function projectExternalRunSection(
  entries: ExternalRunEntry[],
  opts: DelegationPanelOptions,
): string[] {
  if (entries.length === 0) return []
  const rows = [truncateToLiveWidth('⤷ 外部子代理', opts.width)]
  for (const entry of entries) {
    const suffixes: string[] = []
    if (entry.startedAt !== undefined && opts.now !== undefined) {
      suffixes.push(formatSettled(Math.max(0, opts.now - entry.startedAt)))
    }
    rows.push(...formatLiveCard({
      glyph: liveCardGlyph('running'),
      title: `${entry.label ?? shortHash(entry.id)} · ${entry.provider}`,
      suffixes,
      width: opts.width,
      ...(opts.theme === undefined ? {} : { theme: opts.theme }),
    }))
  }
  return rows
}

function isErrorTurn(kind: DelegationProgressProjection['lastTurnEnd'] | undefined): boolean {
  return kind === 'error' || kind === 'aborted' || kind === 'interrupted'
}

function renderEntry(entry: DelegationTreeEntry, opts: DelegationPanelOptions): string[] {
  const indent = '  '.repeat(Math.max(0, entry.depth))
  if (entry.kind === 'diagnostic') {
    return [truncateToLiveWidth(`${indent}⚠ ${reasonLabel(entry.reason)} ${shortHash(entry.id)}`, opts.width)]
  }
  const { progress, timing } = entry
  const title = `${modeMark(entry.mode)} ${entry.label ?? shortHash(entry.id)}`
  const finished = entry.activity === 'inactive' || progress?.lastTurnEnd !== undefined
  const inFlight = progress?.running === undefined
    ? progress?.toolInFlight === true
    : progress.running
  const activity = progress === undefined ? '' : activityText(progress)
  const terminal = progress === undefined ? '' : terminalText(progress)

  const status: LiveCardStatus = inFlight
    ? 'running'
    : isErrorTurn(progress?.lastTurnEnd)
      ? 'error'
      : 'success'

  const suffixes: string[] = []
  if (finished && terminal !== '') suffixes.push(terminal)
  if (timing !== undefined) suffixes.push(formatSettled(liveSettled(timing, opts.now)))

  const bodyParts: string[] = []
  if (!finished && progress !== undefined && (inFlight || activity !== '')) {
    if (activity !== '') bodyParts.push(activity)
    const tokens = tokensText(progress)
    if (tokens !== '') bodyParts.push(tokens)
    const tools = toolsText(progress)
    if (tools !== '') bodyParts.push(tools)
  }

  return formatLiveCard({
    glyph: liveCardGlyph(status),
    title,
    suffixes,
    ...(bodyParts.length > 0 ? { body: [bodyParts.join(' · ')] } : {}),
    width: opts.width,
    indent,
    dim: finished,
    ...(opts.theme === undefined ? {} : { theme: opts.theme }),
  })
}
