/**
 * DelegationSurfaceController — 子代理委派域的订阅与缓存（T2.1，提取自 ui/app.ts）。
 *
 * 两条数据流：委派树（listDescendants 预取 + subagent/start|end 重拉 → /subagents
 * 面板与活动带）与对话流运行行（runId 缓存 → live 运行行 + end 终态卡）。
 * 本模块不碰渲染与通知：终态数据经 opts.onRunFinished 交还宿主
 * （formatSubagentDone + commitToScrollback + os-notify 在 app 侧）。
 *
 * - attach(sessionId, subscribe)：先释放旧订阅再清全部缓存，随后立即预取一次树。
 * - refresh(sessionId)：externalRuns 同步 + listDescendants 异步预取（失败置空重绘，
 *   否则旧树滞留到 120ms ticker 自愈；与 then 分支对称调度）。
 * - handleForeignProjection(input, opts)：他会话 subagentProgress/Timing 投影的
 *   入口——缓存进度、判定是否刷新树，返回是否需要重绘。
 *
 * @module @huiliyi37/dsh-tianshu-tui/controllers/delegation-surface
 */

import type { SessionId } from '@deepseek-ai/dsh-session'
import { shortSessionLabel } from '../session-label.js'
import {
  noteForeignProjection, readExternalRuns, takeChildStats,
} from '../ui/activity-flow.js'
import type {
  DelegationProgressProjection, DelegationTreeEntry, ExternalRunEntry,
} from '../delegation-panel.js'

/** 委派树 listDescendants 返回项（复用 delegation-panel 的纯数据形状）。 */
type DelegationEntry = DelegationTreeEntry

/** subagents 服务最小面（listDescendants 预取；事件经 ctx.on('subagent/…')）。 */
export interface SubagentsFacet {
  listDescendants(rootSessionId: SessionId, signal?: AbortSignal): Promise<DelegationEntry[]>
  activeExternalRuns?: () => ExternalRunEntry[]
}

/** 对话流 subagent 运行项（start 建、end 移除；label 尽力取委派树缓存）。 */
export interface SubagentRunState {
  label: string
  startedAt: number
  childId: string
}

/** 按事件名收窄 handler 参数的最小订阅面。 */
export interface SubagentSubscribe {
  (event: 'subagent/start', cb: (info: { runId: string; id: string }) => void): () => void
  (event: 'subagent/end', cb: (info: { runId: string; stopReason: string }) => void): () => void
}

export interface DelegationSurfaceOptions {
  /** subagents 服务读取（ctx.reflect.get('subagents')；未装配 → undefined 降级）。 */
  getService: () => SubagentsFacet | undefined
  /** 异步竞态守卫：listDescendants resolve 时 app 已 dispose 则弃写状态。 */
  isDisposed: () => boolean
  /** 状态变化后的批量重绘调度（renderBatcher.schedule）。 */
  schedule: () => void
  /**
   * end 折叠完成后的宿主副作用：stats 已从 childProgress 取走（take-and-clear）。
   * 宿主负责 formatSubagentDone 落 scrollback、通知门槛与重绘。
   */
  onRunFinished: (done: {
    label: string
    elapsedMs: number
    stopReason: string
    stats: ReturnType<typeof takeChildStats>
  }) => void
}

/** 委派树的订阅、双缓存（树 + 运行行）与他 会话投影入口（渲染消费方经只读入口读取）。 */
export class DelegationSurfaceController {
  private treeEntries: DelegationEntry[] | null = null
  private readonly runs = new Map<string, SubagentRunState>()
  private readonly progress = new Map<string, DelegationProgressProjection>()
  private externalRunEntries: ExternalRunEntry[] = []
  private currentDisposer: (() => void) | null = null

  constructor(private readonly opts: DelegationSurfaceOptions) {}

  /** 委派树缓存（null = 服务缺失/尚未预取；面板据此降级空态）。 */
  get entries(): DelegationEntry[] | null {
    return this.treeEntries
  }

  /** 对话流运行中子代理条目（renderActivitySection 消费 runId → run 键值对）。 */
  runningEntries(): IterableIterator<[string, SubagentRunState]> {
    return this.runs.entries()
  }

  /** 子会话进度缓存只读视图（活动带渲染；写入仅经 handleForeignProjection）。 */
  progressView(): ReadonlyMap<string, DelegationProgressProjection> {
    return this.progress
  }

  /** 外部运行条目（delegationSnapshotSlice 消费）。 */
  externalRuns(): ExternalRunEntry[] {
    return this.externalRunEntries
  }

  /**
   * 订阅 start|end 双事件（各两处 handler：树刷新 + 运行行），先释放上一轮
   * 再清全部缓存，并按传入会话立即预取一次树。
   * @returns 本轮订阅的整体 disposer（app.dispose 与下次 attach 前调用）。
   */
  attach(sessionId: SessionId, subscribe: SubagentSubscribe): () => void {
    this.currentDisposer?.()
    this.treeEntries = null
    this.runs.clear()
    this.progress.clear()
    this.externalRunEntries = []
    const disposers = [
      subscribe('subagent/start', () => { this.refresh(sessionId) }),
      subscribe('subagent/end', () => { this.refresh(sessionId) }),
      subscribe('subagent/start', (info) => {
        this.runs.set(info.runId, { label: this.label(info.id), startedAt: Date.now(), childId: info.id })
        this.opts.schedule()
      }),
      subscribe('subagent/end', (info) => {
        const run = this.runs.get(info.runId)
        if (run === undefined) return
        this.runs.delete(info.runId)
        this.opts.onRunFinished({
          label: run.label,
          elapsedMs: Date.now() - run.startedAt,
          stopReason: info.stopReason,
          stats: takeChildStats(this.progress, run.childId),
        })
      }),
    ]
    this.currentDisposer = () => { for (const d of disposers) d() }
    this.refresh(sessionId)
    return this.currentDisposer
  }

  /** 释放当前订阅（不清缓存：dispose 后仍可读终态渲染收尾帧）。 */
  detach(): void {
    this.currentDisposer?.()
    this.currentDisposer = null
  }

  /**
   * 对话流运行行的显示标签：委派树缓存命中 label 用之，否则 id 短哈希兜底。
   */
  label(id: string): string {
    for (const e of this.treeEntries ?? []) {
      if (e.kind === 'child' && e.id === id) return e.label ?? shortSessionLabel(id)
    }
    return shortSessionLabel(id)
  }

  /**
   * 预取委派树（async）：服务缺失置 null 降级；externalRuns 同步刷新。
   * 失败同样置空 + 重绘（否则滞留旧树直到 120ms ticker 自愈）。
   */
  refresh(sessionId: SessionId): void {
    const subagents = this.opts.getService()
    if (subagents === undefined) { this.treeEntries = null; this.externalRunEntries = []; return }
    this.externalRunEntries = readExternalRuns(subagents)
    this.opts.schedule()
    void subagents.listDescendants(sessionId).then((entries) => {
      if (this.opts.isDisposed()) return
      this.treeEntries = entries
      this.opts.schedule()
    }).catch(() => {
      // 非 dispose 原因的失败同样要重绘（置空清面板），否则滞留旧树直到
      // 120ms ticker 自愈；与 then 分支对称调度。
      if (this.opts.isDisposed()) return
      this.treeEntries = null
      this.opts.schedule()
    })
  }

  /**
   * 他会话 subagentProgress/subagentTiming 投影入口：缓存进度、必要时重拉树。
   * @returns 是否发生状态变化（宿主据此决定是否 renderBatcher.schedule）。
   */
  handleForeignProjection(
    input: { sessionId: string; key: string; value: unknown },
    opts: { panelVisible: boolean; rootSessionId: SessionId },
  ): boolean {
    return noteForeignProjection(
      { sessionId: input.sessionId, key: input.key, value: input.value, panelVisible: opts.panelVisible },
      {
        childProgress: this.progress,
        subagentRuns: this.runs.values(),
        delegationEntries: this.treeEntries,
      },
      () => { this.refresh(opts.rootSessionId) },
    )
  }
}
