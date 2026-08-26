/**
 * WorkflowSurfaceController — workflow 事件域的订阅与状态缓存（T2.2，提取自 ui/app.ts）。
 *
 * 六事件（start/phase/log/agent-start/agent-end/end）→ 运行态缓存；end 折叠为
 * WorkflowRunView 进终态缓存。本模块不碰渲染与通知：终态汇总经 opts.onCompleted
 * 回调交还宿主（formatWorkflowSummary + commitToScrollback + os-notify 在 app 侧）。
 *
 * - attach(host)：先释放旧订阅再清运行态（跨会话运行，重挂载即重新收集；
 *   终态缓存跨会话保留——已完成汇总不因切会话丢失）。
 * - schedule()：phase/log/agent-* 改动状态后的批量重绘（renderBatcher.schedule）。
 * - flushLive()：start 的立即刷新（运行行即刻进 live 区）。
 * - onCompleted(view, name)：workflow/end 的宿主副作用出口。
 *
 * @module @huiliyi37/dsh-tianshu-tui/controllers/workflow-surface
 */

import { settleWorkflowView } from '../ui/activity-flow.js'
import type { WorkflowRunView } from '../workflow-panel.js'

/** T2.2：workflow/start|phase|log|agent-start|agent-end|end 事件 payload 的最小 wire 形状。 */
export interface WorkflowRunInfoWire {
  readonly id: string
  /** run 的 meta 块（workflow/start 携带；可选——旧形状事件无 meta 时回退 id）。 */
  readonly meta?: WorkflowMetaWire
}
interface WorkflowMetaWire {
  readonly name: string
  readonly description?: string
  readonly phases?: { title: string }[]
}
/** 规范化后的 run meta（创建时 name/description 必有值；与 WorkflowMetaInput 形状一致）。 */
export interface WorkflowMetaNormalized {
  readonly name: string
  readonly description: string
  readonly phases?: { title: string }[]
}
interface WorkflowAgentWire {
  readonly seq: number
  readonly label: string
  readonly phase?: string
  readonly childId?: string
}
interface WorkflowAgentEndWire extends WorkflowAgentWire {
  readonly outcome: 'completed' | 'failed' | 'cancelled'
}
interface WorkflowResultWire {
  readonly stopReason: string
  readonly error?: string
}

/** 单个 run 保留的最近叙述行上限（workflow/log drop-oldest 防刷屏）。 */
export const WORKFLOW_LOG_CAP = 20

/** T2.2：运行中 workflow 缓存项（key = payload.id；随 start 建、end 移除）。 */
export interface WorkflowRunState {
  readonly id: string
  /** run 的 meta 块（start 事件携带，创建时规范化——name 缺省回退 id，description 缺省空串）。 */
  readonly meta: WorkflowMetaNormalized
  /** run 开始时间（start 事件落地；elapsedMs 数据源）。 */
  readonly startedAt: number
  /** 最近一次 workflow/phase 标题；无 phase 事件时为 null。 */
  phase: string | null
  /** 已建立的 agent() 调用（agent-start 追加，agent-end 标记 outcome）。 */
  agents: { seq: number; label: string; childId?: string; outcome?: 'completed' | 'failed' | 'cancelled' }[]
  /** 脚本叙述行（workflow/log；cap 20 drop-oldest 防刷屏）。 */
  logs: string[]
}

/** 六个 workflow 事件 → handler 参数的最小订阅面（宿主 ctx.on 结构兼容即可）。 */
export interface WorkflowEventMap {
  'workflow/start': [info: WorkflowRunInfoWire]
  'workflow/phase': [info: WorkflowRunInfoWire, title: string]
  'workflow/log': [info: WorkflowRunInfoWire, message: string]
  'workflow/agent-start': [info: WorkflowRunInfoWire, agent: WorkflowAgentWire]
  'workflow/agent-end': [info: WorkflowRunInfoWire, agent: WorkflowAgentEndWire]
  'workflow/end': [info: WorkflowRunInfoWire, result: WorkflowResultWire]
}

export type WorkflowEventName = keyof WorkflowEventMap

/**
 * 最小订阅面：按事件名收窄 handler 参数的重载订阅函数。
 * 宿主侧以 `(event, cb) => ctx.on(event, cb)` 一行适配。
 */
export interface WorkflowSubscribe {
  (event: 'workflow/start', cb: (info: WorkflowRunInfoWire) => void): () => void
  (event: 'workflow/phase', cb: (info: WorkflowRunInfoWire, title: string) => void): () => void
  (event: 'workflow/log', cb: (info: WorkflowRunInfoWire, message: string) => void): () => void
  (event: 'workflow/agent-start', cb: (info: WorkflowRunInfoWire, agent: WorkflowAgentWire) => void): () => void
  (event: 'workflow/agent-end', cb: (info: WorkflowRunInfoWire, agent: WorkflowAgentEndWire) => void): () => void
  (event: 'workflow/end', cb: (info: WorkflowRunInfoWire, result: WorkflowResultWire) => void): () => void
}

export interface WorkflowSurfaceOptions {
  /**
   * workflow/end 折叠完成后的宿主副作用：落 scrollback 汇总 + 系统通知 +
   * live 区刷新。仅在 run 命中运行态缓存时回调（未知 id 静默忽略）。
   */
  onCompleted: (view: WorkflowRunView, name: string) => void
  /** 批量重绘调度（phase/log/agent-start/agent-end 改动状态后）。 */
  schedule: () => void
  /** start 事件的立即刷新：运行行即刻进 live 区，不等批量合并。 */
  flushLive: () => void
}

/** workflow 事件的订阅、运行/终态双缓存与视图折叠（渲染消费方经只读入口读取）。 */
export class WorkflowSurfaceController {
  private readonly running = new Map<string, WorkflowRunState>()
  private readonly completed = new Map<string, WorkflowRunView>()
  private currentDisposer: (() => void) | null = null

  constructor(private readonly opts: WorkflowSurfaceOptions) {}

  /** 运行中 run 数（子代理完成通知门槛据此静默）。 */
  get runningCount(): number {
    return this.running.size
  }

  /** 运行中缓存视图（foldWorkflowViews / renderActivitySection 消费）。 */
  runningViews(): IterableIterator<WorkflowRunState> {
    return this.running.values()
  }

  /** 已折叠终态视图（/workflow 面板渲染运行中 + 已完成）。 */
  completedViews(): IterableIterator<WorkflowRunView> {
    return this.completed.values()
  }

  /**
   * 订阅六事件：先释放上一轮订阅再清运行态缓存（语义与提取前一致：
   * 重挂载即重新收集进行中的 run；终态缓存不清理）。
   * @param subscribe - 按事件名收窄 handler 的订阅函数（app 侧 `(e, cb) => ctx.on(e, cb)`）。
   * @returns 本轮订阅的整体 disposer（app.dispose 与下次 attach 前调用）。
   */
  attach(subscribe: WorkflowSubscribe): () => void {
    this.currentDisposer?.()
    this.running.clear()
    const disposers = [
      subscribe('workflow/start', (info) => {
        // meta 创建时规范化：旧形状事件无 meta 时 name 回退 id、description 空串，
        // 消费点直接透传不再判空。
        const meta = info.meta
        this.running.set(info.id, {
          id: info.id,
          meta: {
            name: meta?.name ?? info.id,
            description: meta?.description ?? '',
            ...meta?.phases === undefined ? {} : { phases: meta.phases },
          },
          startedAt: Date.now(),
          phase: null,
          agents: [],
          logs: [],
        })
        this.opts.flushLive()
      }),
      subscribe('workflow/phase', (info, title) => {
        const run = this.running.get(info.id)
        if (run !== undefined) { run.phase = title; this.opts.schedule() }
      }),
      subscribe('workflow/log', (info, message) => {
        const run = this.running.get(info.id)
        if (run !== undefined) {
          // cap 20 drop-oldest：脚本刷屏只保留最近叙述，面板不被淹没。
          run.logs.push(message)
          if (run.logs.length > WORKFLOW_LOG_CAP) run.logs.splice(0, run.logs.length - WORKFLOW_LOG_CAP)
          this.opts.schedule()
        }
      }),
      subscribe('workflow/agent-start', (info, agent) => {
        const run = this.running.get(info.id)
        if (run !== undefined) { run.agents.push({ seq: agent.seq, label: agent.label, childId: agent.childId ?? '' }); this.opts.schedule() }
      }),
      subscribe('workflow/agent-end', (info, agent) => {
        const run = this.running.get(info.id)
        const slot = run?.agents.find(a => a.seq === agent.seq)
        if (slot !== undefined) { slot.outcome = agent.outcome; this.opts.schedule() }
      }),
      subscribe('workflow/end', (info, result) => {
        const run = this.running.get(info.id)
        if (run !== undefined) {
          // 终态折叠为 WorkflowRunView（stopReason/agentsStarted 进 meta；grok 死字段我们消费）
          const view = settleWorkflowView(run, result, Date.now())
          this.running.delete(info.id)
          this.completed.set(info.id, view)
          this.opts.onCompleted(view, run.meta.name)
        }
      }),
    ]
    this.currentDisposer = () => { for (const d of disposers) d() }
    return this.currentDisposer
  }

  /** 释放当前订阅（不清缓存：dispose 后仍可读终态视图渲染收尾帧）。 */
  detach(): void {
    this.currentDisposer?.()
    this.currentDisposer = null
  }
}
