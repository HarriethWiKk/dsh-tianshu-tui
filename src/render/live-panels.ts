/**
 * live-panels — renderLive 的 8 面板段纯函数（Wave 2 提取）。
 *
 * renderLive 每帧把 TuiApp 读取的字段子集组装为 LiveSnapshot（render/
 * live-snapshot.ts），交给本模块的 8 个纯函数（(snapshot) => string[]）
 * 渲染面板行；组合器负责 { text } 包装与 theme 着色、非面板段（提问/审批/
 * 流利度/流式尾巴/工具卡/输入行）直渲染。面板是纯函数：同一 snapshot 恒返回
 * 同一行序列，无 I/O、无时钟、无副作用——taskNotice 的「渲染后清空」副作用
 * 由组合器承担。
 *
 * 每个面板复用既有 project* 纯函数（format/task-panel、format/todos-panel、
 * status-panel、delegation-panel、workflow-panel、config-panel、skill-panel、
 * format/lsp-diagnostics、format/glance-bar），本模块只做「snapshot → 既有面
 * 板函数输入」的适配与顺序编排，不重复实现渲染逻辑。依赖方向保持 app.ts →
 * render/ 单向。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/render/live-panels
 */

import type { LiveSnapshot } from './live-snapshot.js'
import { projectTaskPanel } from '../format/task-panel.js'
import { projectTodosPanel } from '../format/todos-panel.js'
import { projectStatusPanel } from '../status-panel.js'
import {
  projectDelegationTree,
  projectExternalRunSection,
  type DelegationIdentityProjection,
  type DelegationTimingProjection,
  type DelegationTreeEntry,
} from '../delegation-panel.js'
import { projectWorkflow, type WorkflowChildState, type WorkflowRunView } from '../workflow-panel.js'
import { shortSessionLabel } from '../session-label.js'
import { projectConfigPanel } from '../config-panel.js'
import { inspectHint } from '../ui/inspect-panels.js'
import { projectSkillPanel } from '../skill-panel.js'
import { projectLspPanel, groupLspDiagnostics } from '../format/lsp-diagnostics.js'
import { formatLiveCard, liveCardGlyph, type LiveCardStatus } from '../format/live-card.js'

/** 后台任务快照 → 活区卡状态形（running ⠋ / completed › / 其余 ✗）。 */
function taskSnapshotStatus(status: 'running' | 'stopping' | 'completed' | 'killed' | 'failed'): LiveCardStatus {
  if (status === 'running') return 'running'
  if (status === 'completed') return 'success'
  return 'error'
}

/**
 * 渲染 glance 段：状态行 + 错误行。
 * 状态/错误行为纯文本（组合器按需着色）。metrics 行自 C4 概念稿 C 起移出
 * glance 面板——由 renderLive 在输入行下方常驻渲染（三行底部区），避免
 * 顶部/底部双份。
 * @param snapshot - 当前帧快照。
 * @returns 面板行数组（状态行恒存在；错误行按数据追加）。
 */
export function renderGlancePanel(snapshot: LiveSnapshot): string[] {
  const rows: string[] = []
  if (snapshot.glanceStatus !== null) rows.push(snapshot.glanceStatus)
  if (snapshot.glanceError !== null) rows.push(snapshot.glanceError)
  return rows
}

/**
 * 渲染任务面板：任务窗格（projectTaskPanel） + 后台任务区（taskSnapshots
 * 逐行）。面板隐藏 → 空数组；taskItems 为 null（服务缺失/未写入）→ 窗格不
 * 渲染，后台任务区独立渲染（与 renderLive 现状同语义）。
 * @param snapshot - 当前帧快照。
 * @returns 面板行数组（窗格行在前，后台任务区行在后）。
 */
export function renderTasksPanel(snapshot: LiveSnapshot): string[] {
  if (!snapshot.taskPanelVisible) return []
  const rows: string[] = []
  rows.push(...projectTaskPanel(snapshot.taskItems, snapshot.cols))
  for (const t of snapshot.taskSnapshots) {
    // 后台任务快照走活区卡（天枢 f636eb0e 卡片语言统一）：running ⠋ +
    // 可选 ⎿ detail；completed ›（终态后退 muted）；其余状态（stopping/
    // killed/failed）✗。
    const running = t.status === 'running'
    const detail = t.detail
    rows.push(...formatLiveCard({
      glyph: liveCardGlyph(taskSnapshotStatus(t.status)),
      title: t.label,
      ...(running || detail === undefined ? {} : { suffixes: [detail] }),
      ...(running && detail !== undefined ? { body: [detail] } : {}),
      width: snapshot.cols,
      dim: !running,
      theme: snapshot.theme,
    }))
  }
  if (rows.length > 0) rows.push(inspectHint(snapshot.cols))
  return rows
}

/**
 * 渲染 /config 设置面板（终端通知 + 宿主设置/权限/凭据）。面板隐藏或
 * 投影为 null（尚未刷新）→ 空数组。settings 契约是数组；违约形状（非数组，
 * 如单对象）归一为 descriptor 数组再渲染，避免 for...of 对非迭代对象抛错。
 * @param snapshot - 当前帧快照。
 * @returns 面板行数组。
 */
export function renderConfigPanel(snapshot: LiveSnapshot): string[] {
  if (!snapshot.configPanelVisible) return []
  if (snapshot.configProjection === null) return []
  const projection = snapshot.configProjection
  const settings = Array.isArray(projection.settings)
    ? projection.settings
    : Object.entries(projection.settings as unknown as Record<string, unknown>)
      .map(([ns, value]) => ({ ns, value }))
  // permission 契约是 null（未组合权限服务）；违约 undefined 归一为 null，
  // 避免 projectPermissionSection 对 undefined 解构 options 抛错。
  return projectConfigPanel(
    { ...projection, settings, permission: projection.permission ?? null },
    { width: snapshot.cols },
  )
}

/**
 * 渲染 todos 紧凑待办面板（/todos）：有未完成项时列出条目（进行中置顶，
 * 默认最多 5 条）；全完成仍一行。面板隐藏 → 空数组。数据源是保留快照
 * （turn/start 清空不回退——黏滞语义在 app.ts，本函数保持纯呈现）。
 * @param snapshot - 当前帧快照。
 * @returns 面板行数组。
 */
export function renderTodosPanel(snapshot: LiveSnapshot): string[] {
  if (!snapshot.todosPanelVisible) return []
  return projectTodosPanel(snapshot.todosItems, {
    width: snapshot.cols,
    expanded: snapshot.todosExpanded,
  })
}

/**
 * 渲染 /skills 技能面板（标题 + 列表行 + 命中的选中详情行）。面板隐藏 →
 * 空数组；空列表渲染标题 + 空态占位（由 projectSkillPanel 承担）。
 * @param snapshot - 当前帧快照。
 * @returns 面板行数组。
 */
export function renderSkillsPanel(snapshot: LiveSnapshot): string[] {
  if (!snapshot.skillsPanelVisible) return []
  const rows = projectSkillPanel(snapshot.skillItems, {
    width: snapshot.cols,
    ...(snapshot.skillSelected === undefined ? {} : { selected: snapshot.skillSelected }),
  })
  if (snapshot.skillItems.length > 0) rows.push(inspectHint(snapshot.cols, ['↑↓ 详情']))
  else rows.push(inspectHint(snapshot.cols))
  return rows
}

/**
 * 渲染 /subagents 委派树面板（标题 + 每层委派一行）。面板隐藏或 entries 为
 * null（服务缺失/未预取）→ 空数组（降级不渲染）。
 * @param snapshot - 当前帧快照。
 * @returns 面板行数组。
 */
export function renderDelegationPanel(snapshot: LiveSnapshot): string[] {
  if (!snapshot.subagentsPanelVisible) return []
  if (snapshot.delegationEntries === null) return []
  const opts = {
    width: snapshot.cols,
    ...(snapshot.now === undefined ? {} : { now: snapshot.now }),
    theme: snapshot.theme,
  }
  const rows = projectDelegationTree(
    mergeDelegationProjections(
      snapshot.delegationEntries,
      snapshot.subagentIdentities,
      snapshot.subagentTimings,
    ),
    opts,
  )
  rows.push(...projectExternalRunSection(snapshot.externalRuns, opts))
  return rows
}

/** 旧宿主旁路 Map 合并进条目；条目自带 progress/timing 不覆盖。 */
export function mergeDelegationProjections(
  entries: DelegationTreeEntry[],
  identities: ReadonlyMap<string, DelegationIdentityProjection>,
  timings: ReadonlyMap<string, DelegationTimingProjection>,
): DelegationTreeEntry[] {
  return entries.map((entry) => {
    if (entry.kind !== 'child') return entry
    const identity = identities.get(entry.id)
    const timing = entry.timing ?? timings.get(entry.id)
    const label = identity?.label ?? entry.label
    return {
      ...entry,
      mode: identity?.mode ?? entry.mode,
      ...(label === undefined ? {} : { label }),
      ...(timing === undefined ? {} : { timing }),
    }
  })
}

/** 委派树 → workflow roster childState。 */
export function childStateFromEntries(
  entries: DelegationTreeEntry[] | null,
): ReadonlyMap<string, WorkflowChildState> | undefined {
  if (entries === null) return undefined
  const map = new Map<string, WorkflowChildState>()
  for (const entry of entries) {
    if (entry.kind === 'child') {
      map.set(entry.id, {
        label: entry.label ?? shortSessionLabel(entry.id),
        running: entry.activity === 'running',
      })
    }
  }
  return map
}

/**
 * 渲染 /workflow 运行态面板（列表行 + 展开的叙述/roster + 终态汇总）。面板隐藏 → 空数组。
 * projectWorkflow 只消费 meta.name；本适配层把 run id 注入列表行
 * （meta.description 追加 "(id)" 后缀；name 已是 id 时不重复），使 run 标识
 * 在面板可见且不破坏 [name] 徽标形态。
 * 展开集合：运行中 run（result 未结算）自动展开——叙述行与 roster 是运行期
 * 唯一可见面，折叠会让 workflow/log 消费无处呈现。
 * @param snapshot - 当前帧快照。
 * @returns 面板行数组。
 */
export function renderWorkflowPanel(snapshot: LiveSnapshot): string[] {
  if (!snapshot.workflowPanelVisible) return []
  const runs = snapshot.workflowRuns.map(withVisibleRunId)
  return projectWorkflow(runs, {
    width: snapshot.cols,
    expanded: runs.filter(run => run.result === undefined).map(run => run.info.id),
    childState: childStateFromEntries(snapshot.delegationEntries),
  })
}

/** 使 run id 在列表行可见：meta.description 追加 "(id)" 后缀（name 已是 id 时不重复）。 */
function withVisibleRunId(run: WorkflowRunView): WorkflowRunView {
  if (run.info.meta.name === run.info.id) return run
  const idSuffix = `(${run.info.id})`
  const description = run.info.meta.description === ''
    ? idSuffix
    : `${run.info.meta.description} ${idSuffix}`
  return { ...run, info: { ...run.info, meta: { ...run.info.meta, description } } }
}

/**
 * 渲染 /status 状态面板（目标段 + 任务段 + 计划段 + 会话汇总段）。面板隐藏 →
 * 空数组。todos 为 null 时任务段渲染「（无任务）」占位（区别于 goal/plan 为
 * null 时对应段不渲染的语义——todos null = 已清空/未写入，面板打开即展示
 * 任务区）。会话段数据源是 TUI 本地 summary-state fold（不依赖宿主投影总线，
 * turns 为 0 时该段不渲染）。
 * @param snapshot - 当前帧快照。
 * @returns 面板行数组。
 */
export function renderStatusPanel(snapshot: LiveSnapshot): string[] {
  if (!snapshot.statusPanelVisible) return []
  const rows = projectStatusPanel(snapshot.goal, snapshot.todos ?? [], snapshot.plan,
    { width: snapshot.cols, sessionTotals: snapshot.sessionTotals })
  rows.push(inspectHint(snapshot.cols))
  return rows
}

/**
 * 渲染 /lsp 诊断面板（按文件分组的诊断列表；severity 着色）。面板隐藏 →
 * 空数组。空诊断列表渲染空态行（区分「无诊断」与「server 未安装」）。
 * @param snapshot - 当前帧快照。
 * @returns 面板行数组。
 */
export function renderLspPanel(snapshot: LiveSnapshot): string[] {
  if (!snapshot.lspPanelVisible) return []
  const rows = projectLspPanel(groupLspDiagnostics(snapshot.lspDiagnostics), snapshot.theme, snapshot.lspAvailable)
  rows.push(inspectHint(snapshot.cols))
  return rows
}
