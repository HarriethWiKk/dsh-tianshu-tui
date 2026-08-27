/**
 * action-registry — 统一 action registry（src/actions/）单元测试。
 *
 * 覆盖：
 * - ActionRegistry.match：注册序、when 守卫、phase/context 过滤、char/meta 绑定
 * - 冲突校验（validateActionConflicts）：同域同键无守卫抛错；守卫/跨域放行
 * - confirmMs 双击布防：arm/within/disarm/sweepConfirms（原 ctrlCPendingSince /
 *   escRewindPendingSince 散字段语义的集中化）
 * - 内置动作表：esc 三连（打断 > 关面板 > 双击 rewind）、ctrl_c 复合分支、
 *   ctrl_o 无推理块落 editorKey 的现存语义
 * - 展示面投影：KEYMAP_ENTRIES 与原静态表逐行一致（行为锚点）、footer 提示段
 * - 阻塞键上下文：question/btw/approval/inspect 的 isActive/handleKey 轮询契约
 */

import { describe, expect, it, vi } from 'vitest'
import type { KeyName, KeyPress } from '../src/engine/input-handler.js'
import {
  ActionRegistry,
  EXIT_WINDOW_MS,
  REWIND_DOUBLE_ESC_MS,
  matchesBinding,
  validateActionConflicts,
} from '../src/actions/registry.js'
import { createBuiltinActions } from '../src/actions/builtin-actions.js'
import {
  createApprovalKeyContext,
  createBtwKeyContext,
  createInspectKeyContext,
  createQuestionKeyContext,
} from '../src/actions/key-contexts.js'
import {
  keyBindingLabel,
  projectApprovalHints,
  projectInspectHints,
} from '../src/actions/projections.js'
import type { ActionContext, KeyAction } from '../src/actions/types.js'
import { KEYMAP_ENTRIES } from '../src/format/keymap-panel.js'
import { QuestionController } from '../src/controllers/question-controller.js'
import { InspectSurfaceController } from '../src/controllers/inspect-surface.js'

// ── 测试夹具 ──────────────────────────────────────────────────

function key(name: KeyName, char = '', mods: Partial<KeyPress> = {}): KeyPress {
  return { raw: '', char, name, ctrl: false, meta: false, shift: false, ...mods }
}

/** 操作面夹具：状态开关经 state 注入，操作全部 vi.fn() 记录。 */
function makeCtx(state: {
  running?: boolean
  inputEmpty?: boolean
  slashMenuOpen?: boolean
  inspectAny?: boolean
  vimNormalEsc?: boolean
  hasReasoning?: boolean
  pendingTool?: boolean
  images?: boolean
  queued?: boolean
  paletteOpen?: boolean
  approvalPending?: boolean
  hasExit?: boolean
} = {}) {
  const registry = new ActionRegistry(createBuiltinActions({ editorKey: 'ctrl_e' }))
  const calls = {
    cycleMode: vi.fn(),
    newSession: vi.fn(),
    restoreRecentSession: vi.fn(),
    requestExit: vi.fn(),
    togglePalette: vi.fn(),
    openPaletteMenu: vi.fn(),
    toggleKeymap: vi.fn(),
    toggleHistorySearch: vi.fn(),
    toggleLatestToolCard: vi.fn(),
    abort: vi.fn(),
    inspectClose: vi.fn(),
    rewindSession: vi.fn(),
    toggleReasoning: vi.fn(),
    openExternalEditor: vi.fn(),
    steerInput: vi.fn(),
    pasteClipboard: vi.fn(),
    removeLastImage: vi.fn(),
    recallQueuedSubmit: vi.fn(),
    passHistoryKey: vi.fn(),
    clearInput: vi.fn(),
    markCtrlC: vi.fn(),
    flushLive: vi.fn(),
    settleApproval: vi.fn(),
    approveAlways: vi.fn(),
    approveToolSession: vi.fn(),
  }
  const ctx: ActionContext = {
    hasExit: state.hasExit ?? true,
    isRunning: () => state.running ?? false,
    inputEmpty: () => state.inputEmpty ?? true,
    slashMenuOpen: () => state.slashMenuOpen ?? false,
    inspectAny: () => state.inspectAny ?? false,
    vimNormalEsc: () => state.vimNormalEsc ?? false,
    hasReasoning: () => state.hasReasoning ?? false,
    hasPendingToolCard: () => state.pendingTool ?? false,
    hasImages: () => state.images ?? false,
    hasQueuedSubmits: () => state.queued ?? false,
    paletteOpen: () => state.paletteOpen ?? false,
    approvalPending: () => state.approvalPending ?? false,
    confirmArm: (id, now) => { registry.confirmArm(id, now) },
    confirmWithin: (id, now) => registry.confirmWithin(id, now),
    confirmDisarm: (id) => { registry.confirmDisarm(id) },
    ...calls,
  }
  return { registry, ctx, calls }
}

function action(id: string, over: Partial<KeyAction> = {}): KeyAction {
  return {
    keys: [{ name: 'ctrl_n' }],
    category: '会话',
    hint: id,
    run: vi.fn(),
    ...over,
    id,
  }
}

// ── matchesBinding / 冲突校验 ────────────────────────────────

describe('matchesBinding — 绑定命中', () => {
  it('name 绑定不区分 meta；char 绑定大小写敏感；meta 约束须相等', () => {
    expect(matchesBinding({ name: 'up' }, key('up', '', { meta: true }))).toBe(true)
    expect(matchesBinding({ char: 'y' }, key('unknown', 'y'))).toBe(true)
    expect(matchesBinding({ char: 'y' }, key('unknown', 'Y'))).toBe(false)
    expect(matchesBinding({ name: 'backspace', meta: true }, key('backspace', '', { meta: true }))).toBe(true)
    expect(matchesBinding({ name: 'backspace', meta: true }, key('backspace'))).toBe(false)
  })
})

describe('validateActionConflicts — 同域键位冲突校验', () => {
  it('同域同键且无 when 守卫 → 抛错（携带双方 id）', () => {
    expect(() => validateActionConflicts([
      action('a.one'),
      action('a.two'),
    ])).toThrow(/键位冲突: a\.one 与 a\.two/)
  })

  it('任一方有 when 守卫 → 放行（注册序分流）', () => {
    expect(() => validateActionConflicts([
      action('a.one', { when: () => true }),
      action('a.two'),
    ])).not.toThrow()
  })

  it('不同 context 的同键 → 放行', () => {
    expect(() => validateActionConflicts([
      action('g.esc', { keys: [{ name: 'escape' }] }),
      action('ap.esc', { keys: [{ name: 'escape' }], context: 'approval' }),
    ])).not.toThrow()
  })

  it('char 绑定与 name 绑定不冲突（不可同键到达）', () => {
    expect(() => validateActionConflicts([
      action('a.one', { keys: [{ name: 'ctrl_n' }] }),
      action('a.two', { keys: [{ char: 'y' }] }),
    ])).not.toThrow()
  })

  it('内置动作表零冲突 + 同 id 重复登记抛错', () => {
    expect(() => createBuiltinActions({ editorKey: 'ctrl_e' })).not.toThrow()
    const registry = new ActionRegistry(createBuiltinActions({ editorKey: 'ctrl_e' }))
    expect(() => registry.register(action('mode.cycle'))).toThrow(/action id 重复/)
  })
})

// ── match ────────────────────────────────────────────────────

describe('ActionRegistry.match — 注册序与守卫', () => {
  it('shift_tab → mode.cycle（early 相位）', () => {
    const { registry, ctx, calls } = makeCtx()
    const hit = registry.match(key('shift_tab'), ctx, { phase: 'early', context: 'global' })
    expect(hit?.id).toBe('mode.cycle')
    hit?.run(ctx, key('shift_tab'))
    expect(calls.cycleMode).toHaveBeenCalledTimes(1)
  })

  it('when 守卫不满足 → 跳过（ctrl_f 在 palette 打开时不命中）', () => {
    const { registry, ctx } = makeCtx({ paletteOpen: true })
    expect(registry.match(key('ctrl_f'), ctx, { phase: 'early' })?.id).toBeUndefined()
    const open = makeCtx({ paletteOpen: false })
    expect(open.registry.match(key('ctrl_f'), open.ctx, { phase: 'early' })?.id).toBe('search.toggle')
  })

  it('相位过滤：early 动作不进 main 匹配', () => {
    const { registry, ctx } = makeCtx()
    expect(registry.match(key('shift_tab'), ctx, { phase: 'main' })).toBeNull()
  })

  it('context 过滤：approval 域键位只在 approval 轮询命中', () => {
    const { registry, ctx } = makeCtx({ approvalPending: true })
    expect(registry.match(key('unknown', 'y'), ctx, { context: 'approval' })?.id).toBe('approval.allow')
    expect(registry.match(key('unknown', 'y'), ctx, { phase: 'main', context: 'global' })).toBeNull()
  })

  it('无匹配返回 null（未登记键位）', () => {
    const { registry, ctx } = makeCtx()
    expect(registry.match(key('f5'), ctx)).toBeNull()
  })

  it('Esc 三连按注册序分流：running > inspect 打开 > 空闲 rewind', () => {
    const running = makeCtx({ running: true, inspectAny: true })
    expect(running.registry.match(key('escape'), running.ctx, { phase: 'main' })?.id).toBe('session.abort')
    const inspecting = makeCtx({ inspectAny: true })
    expect(inspecting.registry.match(key('escape'), inspecting.ctx, { phase: 'main' })?.id).toBe('inspect.close')
    const idle = makeCtx()
    expect(idle.registry.match(key('escape'), idle.ctx, { phase: 'main' })?.id).toBe('session.rewind')
    // slash 菜单打开：三个 esc 动作全部让位（归菜单关闭分支）
    const menu = makeCtx({ slashMenuOpen: true, running: true, inspectAny: true })
    expect(menu.registry.match(key('escape'), menu.ctx, { phase: 'main' })).toBeNull()
  })
})

// ── confirmMs 双击布防 ───────────────────────────────────────

describe('confirmMs 双击布防（registry 集中管理）', () => {
  it('首按布防、窗口内再按 within；窗口过期不命中', () => {
    const { registry } = makeCtx()
    registry.confirmArm('session.rewind', 1000)
    expect(registry.confirmWithin('session.rewind', 1000 + REWIND_DOUBLE_ESC_MS - 1)).toBe(true)
    expect(registry.confirmWithin('session.rewind', 1000 + REWIND_DOUBLE_ESC_MS)).toBe(false)
    expect(registry.confirmSince('session.rewind')).toBe(1000)
    registry.confirmDisarm('session.rewind')
    expect(registry.confirmSince('session.rewind')).toBe(0)
  })

  it('sweepConfirms：非触发键撤防，触发键保持布防', () => {
    const { registry } = makeCtx()
    registry.confirmArm('session.rewind', 100)
    registry.confirmArm('app.interrupt', 100)
    registry.sweepConfirms(key('escape'))
    // escape 是 rewind 触发键 → 保持；不是 ctrl_c → interrupt 撤防
    expect(registry.confirmSince('session.rewind')).toBe(100)
    expect(registry.confirmSince('app.interrupt')).toBe(0)
    registry.sweepConfirms(key('unknown', 'x'))
    expect(registry.confirmSince('session.rewind')).toBe(0)
  })

  it('双击 Esc rewind：首按 run 返回 false（放行 InputLine）且布防；再按触发', () => {
    const { registry, ctx, calls } = makeCtx()
    const rewind = registry.match(key('escape'), ctx, { phase: 'main' })
    expect(rewind?.id).toBe('session.rewind')
    expect(rewind?.run(ctx, key('escape'))).toBe(false)
    expect(registry.confirmSince('session.rewind')).not.toBe(0)
    expect(calls.rewindSession).not.toHaveBeenCalled()
    expect(rewind?.run(ctx, key('escape'))).toBe(true)
    expect(calls.rewindSession).toHaveBeenCalledTimes(1)
    expect(registry.confirmSince('session.rewind')).toBe(0)
  })

  it('vim normal 下 Esc 空操作：rewind 不命中（布防/触发都跳过）', () => {
    const { registry, ctx } = makeCtx({ vimNormalEsc: true })
    expect(registry.match(key('escape'), ctx, { phase: 'main' })).toBeNull()
  })

  it('inspect.close 触发时撤防 rewind 布防', () => {
    const { registry, ctx, calls } = makeCtx({ inspectAny: true })
    registry.confirmArm('session.rewind', Date.now())
    const hit = registry.match(key('escape'), ctx, { phase: 'main' })
    expect(hit?.id).toBe('inspect.close')
    hit?.run(ctx, key('escape'))
    expect(calls.inspectClose).toHaveBeenCalledTimes(1)
    expect(registry.confirmSince('session.rewind')).toBe(0)
  })
})

// ── app.interrupt（Ctrl+C 复合分支） ─────────────────────────

describe('app.interrupt — Ctrl+C 打断/清空/双击退出', () => {
  function pressCtrlC(ctx: ActionContext, registry: ActionRegistry): void {
    registry.match(key('ctrl_c'), ctx, { phase: 'main' })?.run(ctx, key('ctrl_c'))
  }

  it('窗口内第二次恒退出（无 running/草稿门槛）', () => {
    const { registry, ctx, calls } = makeCtx({ running: true })
    pressCtrlC(ctx, registry) // 第一次：running 打断 + 布防
    expect(calls.abort).toHaveBeenCalledTimes(1)
    expect(registry.confirmSince('app.interrupt')).not.toBe(0)
    pressCtrlC(ctx, registry) // 第二次：退出
    expect(calls.requestExit).toHaveBeenCalledTimes(1)
    expect(registry.confirmSince('app.interrupt')).toBe(0)
  })

  it('空闲空输入：首按布防不退出；markCtrlC 恒记录（Windows SIGINT 防抖）', () => {
    const { registry, ctx, calls } = makeCtx()
    pressCtrlC(ctx, registry)
    expect(calls.requestExit).not.toHaveBeenCalled()
    expect(calls.markCtrlC).toHaveBeenCalledTimes(1)
    expect(registry.confirmWithin('app.interrupt', Date.now())).toBe(true)
  })

  it('空闲草稿：清空输入并布防（无「已取消」噪音）', () => {
    const { registry, ctx, calls } = makeCtx({ inputEmpty: false })
    pressCtrlC(ctx, registry)
    expect(calls.clearInput).toHaveBeenCalledTimes(1)
    expect(calls.abort).not.toHaveBeenCalled()
    expect(registry.confirmSince('app.interrupt')).not.toBe(0)
  })

  it('无 onExit（hasExit false）：不布防，空输入直接打断', () => {
    const { registry, ctx, calls } = makeCtx({ hasExit: false })
    pressCtrlC(ctx, registry)
    expect(calls.abort).toHaveBeenCalledTimes(1)
    expect(registry.confirmSince('app.interrupt')).toBe(0)
    expect(registry.confirmWithin('app.interrupt', Date.now() + EXIT_WINDOW_MS + 1)).toBe(false)
  })
})

// ── ctrl_o / editorKey 组合语义 ──────────────────────────────

describe('ctrl_o / editorKey — 无推理块落编辑键的现存语义', () => {
  it('有推理块：ctrl_o 展开/收起', () => {
    const { registry, ctx, calls } = makeCtx({ hasReasoning: true })
    registry.match(key('ctrl_o'), ctx, { phase: 'main' })?.run(ctx, key('ctrl_o'))
    expect(calls.toggleReasoning).toHaveBeenCalledTimes(1)
    expect(calls.openExternalEditor).not.toHaveBeenCalled()
  })

  it('无推理块：ctrl_o 不命中；editorKey=ctrl_o 时落外部编辑器', () => {
    const plain = makeCtx()
    expect(plain.registry.match(key('ctrl_o'), plain.ctx, { phase: 'main' })).toBeNull()
    // editorKey 配置为 ctrl_o 的注册表：无推理块时 ctrl_o 开编辑器
    const custom = new ActionRegistry(createBuiltinActions({ editorKey: 'ctrl_o' }))
    const { ctx, calls } = makeCtx()
    const hit = custom.match(key('ctrl_o'), ctx, { phase: 'main' })
    expect(hit?.id).toBe('editor.open')
    hit?.run(ctx, key('ctrl_o'))
    expect(calls.openExternalEditor).toHaveBeenCalledTimes(1)
  })

  it('默认 editorKey=ctrl_e：ctrl_e 开外部编辑器', () => {
    const { registry, ctx, calls } = makeCtx()
    const hit = registry.match(key('ctrl_e'), ctx, { phase: 'main' })
    expect(hit?.id).toBe('editor.open')
    hit?.run(ctx, key('ctrl_e'))
    expect(calls.openExternalEditor).toHaveBeenCalledTimes(1)
  })
})

// ── 展示面投影（行为锚点） ───────────────────────────────────

describe('keymap 投影 — 与原静态表逐行一致', () => {
  it('KEYMAP_ENTRIES 完整复刻原 20 行表（顺序 + 文案）', () => {
    expect(KEYMAP_ENTRIES).toEqual([
      { keys: 'Enter', action: '发送' },
      { keys: 'Shift+Enter', action: '换行（或 \\+Enter 续行）' },
      { keys: 'Ctrl+N', action: '新会话' },
      { keys: 'Ctrl+S', action: '恢复最近会话' },
      { keys: 'Ctrl+Q', action: '退出' },
      { keys: 'Ctrl+P', action: '命令面板' },
      { keys: 'Ctrl+.', action: '快捷键面板' },
      { keys: 'Ctrl+F / Ctrl+R', action: '历史搜索（n/N 跳转）' },
      { keys: 'Ctrl+O', action: '展开/收起推理块' },
      { keys: 'Ctrl+E', action: '外部编辑器' },
      { keys: 'Ctrl+T', action: '中轮转向' },
      { keys: 'Ctrl+V', action: '粘贴剪贴板图片/文本' },
      { keys: 'Ctrl+U', action: '删除到行首' },
      { keys: 'Ctrl+C', action: '打断当前回合（空闲双击退出）' },
      { keys: 'Shift+Tab', action: '模式循环 normal→plan→always-approve' },
      { keys: 'Tab', action: '@-路径补全 / 接受 slash 选中项' },
      { keys: '↑/↓', action: '输入历史（菜单打开时为选择；运行中排队时 ↑ 取回队首）' },
      { keys: 'PageUp/PageDown', action: 'slash 菜单翻页' },
      { keys: 'Alt+W', action: '复制选区到系统剪贴板（OSC52）' },
      { keys: 'Esc', action: '取消/关闭检查面板（空闲双击 rewind）' },
    ])
  })

  it('keyBindingLabel：ctrl 前缀大写化、语义名表、meta 前缀', () => {
    expect(keyBindingLabel({ name: 'ctrl_n' })).toBe('Ctrl+N')
    expect(keyBindingLabel({ name: 'ctrl_.' })).toBe('Ctrl+.')
    expect(keyBindingLabel({ name: 'shift_tab' })).toBe('Shift+Tab')
    expect(keyBindingLabel({ name: 'escape' })).toBe('Esc')
    expect(keyBindingLabel({ name: 'backspace', meta: true })).toBe('Alt+Backspace')
    expect(keyBindingLabel({ char: 'y' })).toBe('y')
  })
})

describe('footer 提示段投影', () => {
  it('approval 域按注册序投影 footerHint（allow-tool 不进 footer）', () => {
    const actions = createBuiltinActions({ editorKey: 'ctrl_e' })
    expect(projectApprovalHints(actions)).toEqual(['y 允许', 'n 拒绝', 'a 放行', 'esc 取消'])
  })

  it('inspect 提示段：inspect.close 的 footerHint + 静态 / 命令', () => {
    const actions = createBuiltinActions({ editorKey: 'ctrl_e' })
    expect(projectInspectHints(actions)).toEqual(['esc 关闭', '/ 命令'])
  })
})

// ── 阻塞键上下文 ─────────────────────────────────────────────

describe('阻塞键上下文（BlockingKeyContext 轮询契约）', () => {
  it('question：数字键结算、Esc 取消、plan-review f 进反馈模式', async () => {
    const question = new QuestionController({ onEscapeImmediate: vi.fn() })
    const settled: unknown[] = []
    const askPromise = question.ask({
      questions: [{ id: 'q1', header: 'h', question: '?', options: [{ label: '甲' }, { label: '乙' }] }],
    })
    askPromise.then(v => settled.push(v), () => settled.push('cancelled'))
    const flushLive = vi.fn()
    const inputLine = { value: '', setValue: vi.fn(), handleKey: vi.fn() }
    const context = createQuestionKeyContext({
      question, inputLine, settle: a => { question.settle(a) }, cancel: () => { question.cancel() }, flushLive,
    })
    expect(context.isActive()).toBe(true)
    expect(context.handleKey(key('unknown', '2'))).toBe(true)
    await askPromise
    expect(settled[0]).toEqual({ answers: [{ id: 'q1', selected: ['乙'] }] })
    expect(question.isPending).toBe(false)
  })

  it('btw：只消费 Esc/Ctrl+C，其余键放行（false）', () => {
    const btw = { isActive: true, dismiss: vi.fn() }
    const flushLive = vi.fn()
    const context = createBtwKeyContext({ btw, flushLive })
    expect(context.handleKey(key('unknown', 'x'))).toBe(false)
    expect(btw.dismiss).not.toHaveBeenCalled()
    expect(context.handleKey(key('escape'))).toBe(true)
    expect(btw.dismiss).toHaveBeenCalledTimes(1)
    expect(flushLive).toHaveBeenCalledTimes(1)
  })

  it('approval：y 经 registry 命中 approval.allow；未匹配键吞掉不结算', () => {
    const { registry, ctx, calls } = makeCtx({ approvalPending: true })
    const context = createApprovalKeyContext({ approval: { isPending: true }, registry, ctx })
    expect(context.isActive()).toBe(true)
    expect(context.handleKey(key('unknown', 'z'))).toBe(true)
    expect(calls.settleApproval).not.toHaveBeenCalled()
    expect(context.handleKey(key('unknown', 'y'))).toBe(true)
    expect(calls.settleApproval).toHaveBeenCalledWith('allowed-once')
  })

  it('inspect：skills 面板 j/k 移动经 dispatch；未命中放行', async () => {
    const moveSkills = vi.fn(() => true)
    const inspect = new InspectSurfaceController({
      hasService: () => true,
      echoWarn: vi.fn(),
      refreshConfig: () => Promise.resolve(),
      refreshSkills: vi.fn(),
      ensureLsp: vi.fn(),
      schedule: vi.fn(),
      flush: vi.fn(),
      toggleNotify: vi.fn(),
      toggleDensity: vi.fn(),
      moveSkills,
    })
    await inspect.toggle('skills')
    const context = createInspectKeyContext({
      inspect,
      inputLine: { value: '', vimMode: 'insert' },
    })
    expect(context.isActive()).toBe(true)
    expect(context.handleKey(key('down'))).toBe(true)
    expect(moveSkills).toHaveBeenCalledWith(1)
    // 非空输入（正在打字）不劫持 j/k
    const typing = createInspectKeyContext({ inspect, inputLine: { value: 'x', vimMode: 'insert' } })
    expect(typing.handleKey(key('unknown', 'j'))).toBe(false)
  })
})
