/**
 * key-contexts 阻塞上下文——任务 F：审批/提问挂起时 ghost 抑制。
 *
 * 挂起（approval/question 激活）期间输入行被独占，未匹配键一律吞掉
 * （→ 不触发 acceptGhost）；若 ghost 预览仍显示会误导。断言挂起吞键路径
 * 清除 ghost（deps.inputLine.setGhost(null)），匹配键/反馈态不误清。
 * 夹具风格对齐 tests/action-registry.spec.ts（stub inputLine + 控制器）。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  createApprovalKeyContext,
  createQuestionKeyContext,
} from '../src/actions/key-contexts.js'
import { ActionRegistry } from '../src/actions/registry.js'
import { createBuiltinActions } from '../src/actions/builtin-actions.js'
import type { ActionContext } from '../src/actions/types.js'
import type { KeyName, KeyPress } from '../src/engine/input-handler.js'
import { QuestionController } from '../src/controllers/question-controller.js'

function key(name: KeyName, char = '', mods: Partial<KeyPress> = {}): KeyPress {
  return { raw: '', char, name, ctrl: false, meta: false, shift: false, ...mods }
}

/** approval 挂起上下文夹具：选项态（feedbackMode false）+ 带 setGhost 的输入行 stub。 */
function makeApprovalCtx(feedbackMode = false) {
  const registry = new ActionRegistry(createBuiltinActions({ editorKey: 'ctrl_e' }))
  const settleApproval = vi.fn()
  const ctx = { approvalPending: () => true, settleApproval } as unknown as ActionContext
  const setGhost = vi.fn()
  const inputLine = { value: '', setValue: vi.fn(), handleKey: vi.fn(), setGhost }
  const context = createApprovalKeyContext({
    approval: { isPending: true, feedbackMode, setFeedbackMode: vi.fn() },
    registry,
    ctx,
    inputLine,
    submitFeedback: vi.fn(),
    flushLive: vi.fn(),
  })
  return { context, setGhost, settleApproval, inputLine }
}

describe('阻塞上下文挂起吞键清 ghost（任务 F）', () => {
  it('approval 挂起未匹配键：吞掉并清 ghost（setGhost(null)），不结算', () => {
    const { context, setGhost, settleApproval } = makeApprovalCtx()
    expect(context.handleKey(key('unknown', 'z'))).toBe(true) // 未匹配 → 吞
    expect(setGhost).toHaveBeenCalledTimes(1)
    expect(setGhost).toHaveBeenCalledWith(null)
    expect(settleApproval).not.toHaveBeenCalled()
  })

  it('approval 挂起匹配键（y）：结算 allowed-once，不清 ghost', () => {
    const { context, setGhost, settleApproval } = makeApprovalCtx()
    expect(context.handleKey(key('unknown', 'y'))).toBe(true)
    expect(settleApproval).toHaveBeenCalledWith('allowed-once')
    expect(setGhost).not.toHaveBeenCalled()
  })

  it('approval 反馈态：字符键进输入行（不吞、不清 ghost）', () => {
    const { context, setGhost, inputLine } = makeApprovalCtx(true)
    expect(context.handleKey(key('unknown', 'y'))).toBe(true)
    expect(inputLine.handleKey).toHaveBeenCalledTimes(1)
    expect(setGhost).not.toHaveBeenCalled()
  })

  it('question 挂起未匹配键：吞掉并清 ghost（setGhost(null)），不结算', async () => {
    const question = new QuestionController({ onEscapeImmediate: vi.fn() })
    const askPromise = question.ask({
      questions: [{ id: 'q1', header: 'h', question: '?', options: [{ label: '甲' }, { label: '乙' }] }],
    })
    askPromise.then(() => {}, () => {}) // 不结算则保持 pending，防未处理 rejection
    const setGhost = vi.fn()
    const inputLine = { value: '', setValue: vi.fn(), handleKey: vi.fn(), setGhost }
    const context = createQuestionKeyContext({
      question,
      inputLine,
      settle: a => { question.settle(a) },
      cancel: () => { question.cancel() },
      flushLive: vi.fn(),
    })
    expect(context.handleKey(key('unknown', 'x'))).toBe(true) // 未匹配 → 吞
    expect(setGhost).toHaveBeenCalledTimes(1)
    expect(setGhost).toHaveBeenCalledWith(null)
    expect(question.isPending).toBe(true)
  })

  it('question 挂起数字键：结算对应选项，不清 ghost', async () => {
    const question = new QuestionController({ onEscapeImmediate: vi.fn() })
    const settled: unknown[] = []
    const askPromise = question.ask({
      questions: [{ id: 'q1', header: 'h', question: '?', options: [{ label: '甲' }, { label: '乙' }] }],
    })
    askPromise.then(v => settled.push(v), () => settled.push('cancelled'))
    const setGhost = vi.fn()
    const inputLine = { value: '', setValue: vi.fn(), handleKey: vi.fn(), setGhost }
    const context = createQuestionKeyContext({
      question,
      inputLine,
      settle: a => { question.settle(a) },
      cancel: () => { question.cancel() },
      flushLive: vi.fn(),
    })
    expect(context.handleKey(key('unknown', '2'))).toBe(true)
    await askPromise
    expect(settled[0]).toEqual({ answers: [{ id: 'q1', selected: ['乙'] }] })
    expect(question.isPending).toBe(false)
    expect(setGhost).not.toHaveBeenCalled()
  })
})
