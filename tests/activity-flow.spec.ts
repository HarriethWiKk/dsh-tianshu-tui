/**
 * activity-flow — 会话 vs 启动默认之外的活动带装配面。
 */
import { describe, expect, it } from 'vitest'
import { displayWidth } from '../src/width.js'
import type { RivetTheme } from '../src/theme.js'
import {
  childStateFromEntries,
  classifyForeignProjection,
  foldActivityFromCaches,
  formatWorkflowSummary,
  isSubagentProgressValue,
  mergeDelegationProjections,
  noteForeignProjection,
  readExternalRuns,
  renderActivitySection,
} from '../src/ui/activity-flow.js'
import type { DelegationTreeEntry } from '../src/delegation-panel.js'
import type { WorkflowRunView } from '../src/workflow-panel.js'

function fakeTheme(): RivetTheme {
  return {
    primary: '#111111', secondary: '#222222', success: '#333333',
    warning: '#444444', error: '#555555', dim: '#666666', muted: '#777777',
    pulseQuiet: '#888888', pulseActive: '#999999', pulseAlert: '#aaaaaa',
    userColor: '#bbbbbb', assistantColor: '#cccccc', systemColor: '#dddddd',
    brandColor: '#eeeeee', toolColor: () => '#000000', contextColor: () => '#000000',
  }
}

function plain(line: string): string {
  return line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
}

const progress = { turns: 1, toolCalls: 3, tokensUsed: 1200, toolInFlight: true, lastTool: 'read' }

describe('isSubagentProgressValue', () => {
  it('结构齐全才收窄', () => {
    expect(isSubagentProgressValue(progress)).toBe(true)
    expect(isSubagentProgressValue({ toolCalls: 1 })).toBe(false)
    expect(isSubagentProgressValue(null)).toBe(false)
  })
})

describe('classifyForeignProjection', () => {
  it('noteForeignProjection 写入缓存并在命中时重拉树', () => {
    const childProgress = new Map()
    let refreshed = false
    const scheduled = noteForeignProjection(
      { sessionId: 'c1', key: 'subagentProgress', value: progress, panelVisible: true },
      {
        childProgress,
        subagentRuns: [{ childId: 'c1' }],
        delegationEntries: [{
          kind: 'child', id: 'c1', parentId: 'root', depth: 1,
          activity: 'running', hasChildren: false, mode: 'one-shot',
        }],
      },
      () => { refreshed = true },
    )
    expect(scheduled).toBe(true)
    expect(childProgress.get('c1')).toEqual(progress)
    expect(refreshed).toBe(true)
  })

  it('无关 key 早退：不扫树、不缓存', () => {
    const childProgress = new Map()
    let refreshed = false
    expect(noteForeignProjection(
      { sessionId: 'c1', key: 'plan', value: { active: true }, panelVisible: true },
      { childProgress, subagentRuns: [{ childId: 'c1' }], delegationEntries: [] },
      () => { refreshed = true },
    )).toBe(false)
    expect(childProgress.size).toBe(0)
    expect(refreshed).toBe(false)
  })

  it('运行中 child 的 subagentProgress → 缓存', () => {
    const got = classifyForeignProjection({
      key: 'subagentProgress', panelVisible: false, treeHasChild: false,
      isRunningChild: true, value: progress,
    })
    expect(got.cacheProgress).toEqual(progress)
    expect(got.refreshTree).toBe(false)
  })

  it('面板打开且树上有该 child → 重拉树', () => {
    const got = classifyForeignProjection({
      key: 'subagentTiming', panelVisible: true, treeHasChild: true,
      isRunningChild: false, value: { settledMs: 1 },
    })
    expect(got.cacheProgress).toBeNull()
    expect(got.refreshTree).toBe(true)
  })
})

describe('foldActivityFromCaches / renderActivitySection', () => {
  it('fold 带 childProgress 统计', () => {
    const items = foldActivityFromCaches({
      subagentRuns: new Map([['r1', { label: '探索', startedAt: 1000, childId: 'c1' }]]),
      childProgress: new Map([['c1', progress]]),
      workflowRuns: [],
      tasks: [],
    })
    expect(items[0]).toMatchObject({ kind: 'subagent', label: '探索', toolCalls: 3, lastTool: 'read' })
  })

  it('启用活动带渲染入口行；关闭回退散行且不依赖 fold 结果', () => {
    const caches = {
      subagentRuns: new Map([['r1', { label: '探索', startedAt: 1000, childId: 'c1' }]]),
      childProgress: new Map(),
      workflowRuns: [] as const,
      tasks: [],
    }
    const band = renderActivitySection({
      enabled: true, ...caches, width: 80, maxRows: 5, now: 2000, tick: 0, theme: fakeTheme(),
    })
    expect(band.join('\n')).toContain('/subagents')
    const scatter = renderActivitySection({
      enabled: false, ...caches, width: 80, maxRows: 5, now: 2000, tick: 0, theme: fakeTheme(),
    })
    expect(plain(scatter[0] ?? '')).toContain('子代理 探索')
  })
})

describe('formatWorkflowSummary', () => {
  const view: WorkflowRunView = {
    info: { id: 'wf-1', meta: { name: 'pipeline', description: '修类型' } },
    agents: [{ seq: 1, label: 'a', childId: 'c', outcome: 'completed' }],
    result: { stopReason: 'completed', agentsStarted: 1 },
    elapsedMs: 12_000,
  }

  it('完成摘要含 name / agent 数 / 耗时', () => {
    expect(plain(formatWorkflowSummary(view, fakeTheme()))).toBe('✓ [pipeline] 修类型 · 1 个 agent · 12s')
  })
})

describe('mergeDelegationProjections / childState / external', () => {
  const child: DelegationTreeEntry = {
    kind: 'child',
    id: 'c1',
    parentId: 'root',
    depth: 1,
    activity: 'running',
    hasChildren: false,
    mode: 'one-shot',
    label: '主探索',
  }

  it('timing 旁路合并；条目自带 timing 不覆盖', () => {
    const merged = mergeDelegationProjections(
      [child],
      new Map(),
      new Map([['c1', { settledMs: 2300 }]]),
    )
    expect(merged[0]).toMatchObject({ timing: { settledMs: 2300 } })
    const kept = mergeDelegationProjections(
      [{ ...child, timing: { settledMs: 100 } }],
      new Map(),
      new Map([['c1', { settledMs: 2300 }]]),
    )
    expect(kept[0]).toMatchObject({ timing: { settledMs: 100 } })
  })

  it('identity label 覆盖缺省 label', () => {
    const merged = mergeDelegationProjections(
      [{ ...child, label: undefined }],
      new Map([['c1', { mode: 'continuable', label: '投影名', seq: 1 }]]),
      new Map(),
    )
    expect(merged[0]).toMatchObject({ label: '投影名', mode: 'continuable' })
  })

  it('childState 跳过 diagnostic；外部面缺失/抛错 → []', () => {
    const state = childStateFromEntries([
      child,
      { kind: 'diagnostic', id: 'd1', parentId: 'root', depth: 1, reason: 'corrupt' },
    ])
    expect(state?.get('c1')).toEqual({ label: '主探索', running: true })
    expect(state?.has('d1')).toBe(false)
    expect(childStateFromEntries(null)).toBeUndefined()
    expect(readExternalRuns(undefined)).toEqual([])
    expect(readExternalRuns({})).toEqual([])
    expect(readExternalRuns({ activeExternalRuns: () => { throw new Error('x') } })).toEqual([])
    expect(readExternalRuns({ activeExternalRuns: () => [{ id: 'e', provider: 'acp' }] })).toEqual([
      { id: 'e', provider: 'acp' },
    ])
  })

  it('摘要行宽度守恒', () => {
    const line = formatWorkflowSummary({
      info: { id: 'wf', meta: { name: 'n', description: '很长很长的目标描述用来撑宽' } },
      agents: [],
      result: { stopReason: 'error', agentsStarted: 0 },
    }, fakeTheme())
    expect(displayWidth(line)).toBeGreaterThan(0)
  })
})
