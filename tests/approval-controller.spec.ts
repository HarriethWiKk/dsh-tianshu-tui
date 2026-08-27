/**
 * ApprovalController — 待审批状态机契约测试（Wave 1 TDD：RED → GREEN）。
 *
 * 从 ui/app.ts 提取的 pendingApproval + alwaysApprove：
 * - handle()：alwaysApprove 且当前会话 → 短路 allowed-once（不挂起不消费）；
 *   非当前会话或已在挂起 → 委托 next()（waterfall 语义）；当前会话无挂起 →
 *   挂起存 resolve，返回用户决定 promise。
 * - settle()：resolve outcome + 清挂起 + 复位 feedbackMode；无挂起 no-op。
 * - peek()：返回 { req, since, feedbackMode } 快照（renderLive 消费）；无挂起 null。
 * - setAlwaysApprove / alwaysApprove getter：C3 项 4 三态循环读写。
 * - 决策分层（阶段 2）：allowedPrefixes 前缀短路（getCommandPrefix 注入、
 *   handle 时缓存）、approveWithPrefix/approveWithTool 复合、clearSessionGrants
 *   双清空、feedbackMode 反馈输入态（复刻 question-controller）。
 */

import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session'
import {
  ApprovalController,
  type ApprovalControllerOptions,
  type ApprovalOutcome,
  type PendingApprovalRequest,
} from '../src/controllers/approval-controller.js'

/** 构造审批请求（sessionId 可覆盖）。 */
function approvalReq(sessionId: SessionId, toolName = 'bash'): PendingApprovalRequest {
  return { agent: { session: { id: sessionId } }, toolName, reason: 'sandbox' }
}

function boot(sessionId: SessionId, options: Partial<ApprovalControllerOptions> = {}) {
  const getCurrentSessionId = vi.fn(() => sessionId)
  const onChanged = vi.fn()
  const ctl = new ApprovalController({ getCurrentSessionId, onChanged, ...options })
  return { ctl, getCurrentSessionId, onChanged }
}

describe('ApprovalController', () => {
  it('handle 当前会话：挂起 → isPending true、peek 返回 req/since、onChanged 触发', async () => {
    const sid = 'approval-1' as SessionId
    const { ctl, onChanged } = boot(sid)

    const outcome = ctl.handle(approvalReq(sid), () => Promise.resolve('unavailable'))

    expect(ctl.isPending).toBe(true)
    const peek = ctl.peek()
    expect(peek?.req.toolName).toBe('bash')
    expect(typeof peek?.since).toBe('number')
    expect(onChanged).toHaveBeenCalledTimes(1)

    ctl.settle('allowed-once')
    await expect(outcome).resolves.toBe('allowed-once')
    expect(ctl.isPending).toBe(false)
  })

  it('任务4a：allowTool 后该工具短路 allowed-once（不挂起），其他工具仍逐卡审批', async () => {
    const sid = 'approval-4a' as SessionId
    const { ctl } = boot(sid)

    ctl.allowTool('bash')
    expect(ctl.isToolAllowed('bash')).toBe(true)

    const whitelisted = ctl.handle(approvalReq(sid, 'bash'), () => Promise.resolve('unavailable'))
    await expect(whitelisted).resolves.toBe('allowed-once')
    expect(ctl.isPending).toBe(false) // 短路：不挂起、不出卡

    const outcome = ctl.handle(approvalReq(sid, 'edit'), () => Promise.resolve('unavailable'))
    expect(ctl.isPending).toBe(true) // 未加白名单的工具照常挂起
    ctl.settle('rejected')
    await expect(outcome).resolves.toBe('rejected')
  })

  it('任务4a：clearSessionGrants 复位——白名单语义限于单个会话', async () => {
    const sid = 'approval-4a-reset' as SessionId
    const { ctl } = boot(sid)

    ctl.allowTool('bash')
    ctl.clearSessionGrants()
    expect(ctl.isToolAllowed('bash')).toBe(false)

    const outcome = ctl.handle(approvalReq(sid, 'bash'), () => Promise.resolve('unavailable'))
    expect(ctl.isPending).toBe(true)
    ctl.settle('allowed-once')
    await expect(outcome).resolves.toBe('allowed-once')
  })

  it('决策分层：allowCommandPrefix 后同前缀短路 allowed-once（不挂起），其他前缀仍逐卡审批', async () => {
    const sid = 'approval-p1' as SessionId
    // getCommandPrefix 注入：按 toolName 模拟提取（bash → npm，edit → null）。
    const getCommandPrefix = vi.fn((req: PendingApprovalRequest) => req.toolName === 'bash' ? 'npm' : null)
    const { ctl } = boot(sid, { getCommandPrefix })

    ctl.allowCommandPrefix('npm')
    expect(ctl.isPrefixAllowed('npm')).toBe(true)

    const whitelisted = ctl.handle(approvalReq(sid, 'bash'), () => Promise.resolve('unavailable'))
    await expect(whitelisted).resolves.toBe('allowed-once')
    expect(ctl.isPending).toBe(false) // 短路：不挂起、不出卡
    expect(getCommandPrefix).toHaveBeenCalled()
  })

  it('决策分层：前缀未加白/提取 null → 照常挂起；挂起时前缀缓存进 pendingCommandPrefix', async () => {
    const sid = 'approval-p2' as SessionId
    const getCommandPrefix = vi.fn((req: PendingApprovalRequest) => req.toolName === 'bash' ? 'git' : null)
    const { ctl } = boot(sid, { getCommandPrefix })

    const outcome = ctl.handle(approvalReq(sid, 'bash'), () => Promise.resolve('unavailable'))
    expect(ctl.isPending).toBe(true)
    expect(ctl.pendingCommandPrefix).toBe('git') // 挂起时一次性提取缓存
    ctl.settle('allowed-once')
    await expect(outcome).resolves.toBe('allowed-once')
    expect(ctl.pendingCommandPrefix).toBeNull() // 结算后无挂起 → null

    // 提取失败（非 bash 类 → null）：永不命中前缀白名单
    const edit = ctl.handle(approvalReq(sid, 'edit'), () => Promise.resolve('unavailable'))
    expect(ctl.isPending).toBe(true)
    expect(ctl.pendingCommandPrefix).toBeNull()
    ctl.settle('rejected')
    await expect(edit).resolves.toBe('rejected')
  })

  it('决策分层：前缀白名单仅当前会话——非当前会话委托 next() 不短路', async () => {
    const sid = 'approval-p3' as SessionId
    const { ctl } = boot(sid, { getCommandPrefix: () => 'npm' })
    ctl.allowCommandPrefix('npm')

    const next = vi.fn<() => Promise<ApprovalOutcome>>(async () => 'unavailable')
    const result = await ctl.handle(approvalReq('remote-session' as SessionId), next)

    expect(result).toBe('unavailable')
    expect(next).toHaveBeenCalledTimes(1)
    expect(ctl.isPending).toBe(false)
  })

  it('决策分层：approveWithPrefix 复合——前缀入白并结算当前请求；无前缀 false 不结算', async () => {
    const sid = 'approval-p4' as SessionId
    const { ctl } = boot(sid, { getCommandPrefix: () => 'npm' })

    const outcome = ctl.handle(approvalReq(sid), () => Promise.resolve('unavailable'))
    expect(ctl.approveWithPrefix()).toBe(true)
    await expect(outcome).resolves.toBe('allowed-once')
    expect(ctl.isPrefixAllowed('npm')).toBe(true)

    // 无挂起 → false（不结算、不抛）
    expect(ctl.approveWithPrefix()).toBe(false)

    // 有挂起但提取 null → false 不结算（请求仍挂起，可正常 y/n）
    const { ctl: ctl2 } = boot(sid, { getCommandPrefix: () => null })
    const pending2 = ctl2.handle(approvalReq(sid), () => Promise.resolve('unavailable'))
    expect(ctl2.approveWithPrefix()).toBe(false)
    expect(ctl2.isPending).toBe(true)
    ctl2.settle('rejected')
    await expect(pending2).resolves.toBe('rejected')
  })

  it('approveWithTool 复合——工具入白并结算当前请求；无挂起 false', async () => {
    const sid = 'approval-t1' as SessionId
    const { ctl } = boot(sid)

    expect(ctl.approveWithTool()).toBe(false) // 无挂起

    const outcome = ctl.handle(approvalReq(sid, 'bash'), () => Promise.resolve('unavailable'))
    expect(ctl.approveWithTool()).toBe(true)
    await expect(outcome).resolves.toBe('allowed-once')
    expect(ctl.isToolAllowed('bash')).toBe(true)
  })

  it('决策分层：clearSessionGrants 同时清空前缀白名单', async () => {
    const sid = 'approval-p5' as SessionId
    const { ctl } = boot(sid, { getCommandPrefix: () => 'npm' })

    ctl.allowCommandPrefix('npm')
    ctl.clearSessionGrants()
    expect(ctl.isPrefixAllowed('npm')).toBe(false)

    const outcome = ctl.handle(approvalReq(sid), () => Promise.resolve('unavailable'))
    expect(ctl.isPending).toBe(true)
    ctl.settle('allowed-once')
    await expect(outcome).resolves.toBe('allowed-once')
  })

  it('决策分层：feedbackMode 进出与 settle 复位；peek 快照携带 feedbackMode', async () => {
    const sid = 'approval-f1' as SessionId
    const { ctl } = boot(sid)

    expect(ctl.feedbackMode).toBe(false)
    const outcome = ctl.handle(approvalReq(sid), () => Promise.resolve('unavailable'))
    expect(ctl.peek()?.feedbackMode).toBe(false)

    ctl.setFeedbackMode(true) // f 键进入反馈输入态
    expect(ctl.feedbackMode).toBe(true)
    expect(ctl.peek()?.feedbackMode).toBe(true)
    expect(ctl.isPending).toBe(true) // 反馈态不结算

    ctl.settle('rejected') // Enter 提交（steer 旁路由 app 侧组装）
    await expect(outcome).resolves.toBe('rejected')
    expect(ctl.feedbackMode).toBe(false) // 结算复位
  })

  it('settle：resolve outcome + 清挂起 + onChanged；无挂起 no-op', () => {
    const sid = 'approval-2' as SessionId
    const { ctl, onChanged } = boot(sid)

    const outcome = ctl.handle(approvalReq(sid), () => Promise.resolve('unavailable'))
    onChanged.mockClear()
    ctl.settle('rejected')
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(ctl.isPending).toBe(false)
    void outcome

    // 无挂起 settle no-op（不抛、不触发回调）
    onChanged.mockClear()
    expect(() =>{  ctl.settle('cancelled') }).not.toThrow()
    expect(onChanged).not.toHaveBeenCalled()
    expect(ctl.peek()).toBeNull()
  })

  it('alwaysApprove 且当前会话：短路 allowed-once，不挂起不消费、不触发 onChanged', async () => {
    const sid = 'approval-3' as SessionId
    const { ctl, onChanged } = boot(sid)
    ctl.setAlwaysApprove(true)
    expect(ctl.alwaysApprove).toBe(true)

    const next = vi.fn<() => Promise<ApprovalOutcome>>(async () => 'unavailable')
    const result = await ctl.handle(approvalReq(sid), next)

    expect(result).toBe('allowed-once')
    expect(next).not.toHaveBeenCalled()
    expect(ctl.isPending).toBe(false)
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('非当前会话：委托 next()（不挂起）', async () => {
    const sid = 'approval-4' as SessionId
    const { ctl, onChanged } = boot(sid)

    const next = vi.fn<() => Promise<ApprovalOutcome>>(async () => 'unavailable')
    const result = await ctl.handle(approvalReq('other-session' as SessionId), next)

    expect(result).toBe('unavailable')
    expect(next).toHaveBeenCalledTimes(1)
    expect(ctl.isPending).toBe(false)
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('已挂起中又来新请求：委托 next()（fail-closed，一次只呈现一个确认）', async () => {
    const sid = 'approval-5' as SessionId
    const { ctl, onChanged } = boot(sid)

    const first = ctl.handle(approvalReq(sid), () => Promise.resolve('unavailable'))
    const next = vi.fn<() => Promise<ApprovalOutcome>>(async () => 'cancelled')
    const second = await ctl.handle(approvalReq(sid, 'write'), next)

    expect(second).toBe('cancelled')
    expect(next).toHaveBeenCalledTimes(1)
    // 首个挂起未被消费
    expect(ctl.isPending).toBe(true)
    expect(onChanged).toHaveBeenCalledTimes(1)

    ctl.settle('allowed-once')
    await expect(first).resolves.toBe('allowed-once')
  })

  it('alwaysApprove 非当前会话：仍委托 next()（apiproxy 等链上 answerer 不截胡）', async () => {
    const sid = 'approval-6' as SessionId
    const { ctl } = boot(sid)
    ctl.setAlwaysApprove(true)

    const next = vi.fn<() => Promise<ApprovalOutcome>>(async () => 'unavailable')
    const result = await ctl.handle(approvalReq('remote-session' as SessionId), next)

    expect(result).toBe('unavailable')
    expect(next).toHaveBeenCalledTimes(1)
    expect(ctl.isPending).toBe(false)
  })

  it('挂起后 signal abort：自动结算 cancelled，清挂起并触发重绘（asker 拿 cancelled 而卡片不滞留）', async () => {
    const sid = 'approval-7' as SessionId
    const { ctl, onChanged } = boot(sid)
    const ac = new AbortController()

    const outcome = ctl.handle(
      { ...approvalReq(sid), signal: ac.signal },
      () => Promise.resolve('unavailable'),
    )

    expect(ctl.isPending).toBe(true)
    onChanged.mockClear()
    ac.abort()

    await expect(outcome).resolves.toBe('cancelled')
    expect(ctl.isPending).toBe(false)
    // abort 结算必须触发 onChanged——渲染侧依赖它移除滞留卡片
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('已 aborted 的 signal：handle 不挂起、不委托，直接 cancelled', async () => {
    const sid = 'approval-8' as SessionId
    const { ctl, onChanged } = boot(sid)
    const ac = new AbortController()
    ac.abort()

    const next = vi.fn<() => Promise<ApprovalOutcome>>(async () => 'unavailable')
    const result = await ctl.handle({ ...approvalReq(sid), signal: ac.signal }, next)

    expect(result).toBe('cancelled')
    expect(next).not.toHaveBeenCalled()
    expect(ctl.isPending).toBe(false)
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('用户先结算后 signal abort：结果不被覆盖（once 监听，无二次回调）', async () => {
    const sid = 'approval-9' as SessionId
    const { ctl, onChanged } = boot(sid)
    const ac = new AbortController()

    const outcome = ctl.handle(
      { ...approvalReq(sid), signal: ac.signal },
      () => Promise.resolve('unavailable'),
    )
    ctl.settle('allowed-once')
    onChanged.mockClear()

    ac.abort()

    await expect(outcome).resolves.toBe('allowed-once')
    expect(ctl.isPending).toBe(false)
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('挂起超过 timeoutMs：自动结算 cancelled（fail-closed，卡片不无限挂起）', async () => {
    vi.useFakeTimers()
    try {
      const sid = 'approval-timeout-1' as SessionId
      const { ctl, onChanged } = boot(sid, { timeoutMs: 5_000 })

      const outcome = ctl.handle(approvalReq(sid), () => Promise.resolve('unavailable'))

      expect(ctl.isPending).toBe(true)
      onChanged.mockClear()

      // 未到超时：仍挂起，不结算
      vi.advanceTimersByTime(4_999)
      expect(ctl.isPending).toBe(true)
      expect(onChanged).not.toHaveBeenCalled()

      // 越过超时：自动结算 cancelled，清挂起并触发重绘（渲染侧移除滞留卡片）
      vi.advanceTimersByTime(1)
      await expect(outcome).resolves.toBe('cancelled')
      expect(ctl.isPending).toBe(false)
      expect(onChanged).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('用户先结算后超时：结果不被覆盖（timer 已清除，无二次结算）', async () => {
    vi.useFakeTimers()
    try {
      const sid = 'approval-timeout-2' as SessionId
      const { ctl, onChanged } = boot(sid, { timeoutMs: 5_000 })

      const outcome = ctl.handle(approvalReq(sid), () => Promise.resolve('unavailable'))
      ctl.settle('allowed-once')
      onChanged.mockClear()

      vi.advanceTimersByTime(5_000)

      await expect(outcome).resolves.toBe('allowed-once')
      expect(ctl.isPending).toBe(false)
      expect(onChanged).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('signal abort 结算后超时：不二次结算', async () => {
    vi.useFakeTimers()
    try {
      const sid = 'approval-timeout-3' as SessionId
      const ac = new AbortController()
      const { ctl, onChanged } = boot(sid, { timeoutMs: 5_000 })

      const outcome = ctl.handle(
        { ...approvalReq(sid), signal: ac.signal },
        () => Promise.resolve('unavailable'),
      )
      ac.abort()
      onChanged.mockClear()

      vi.advanceTimersByTime(5_000)

      await expect(outcome).resolves.toBe('cancelled')
      expect(ctl.isPending).toBe(false)
      expect(onChanged).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
