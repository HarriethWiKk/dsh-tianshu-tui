/**
 * error-announcer — 错误落底去重 + 恢复指引 + 错误后回填（回流 Tianshu 807686a02）。
 */
import { describe, expect, it, vi } from 'vitest'
import { ErrorAnnouncer, REFILL_NOTE } from '../src/controllers/error-announcer.js'
import { getTheme } from '../src/theme.js'

function makeHarness() {
  const committed: string[] = []
  const refilled: string[] = []
  const announcer = new ErrorAnnouncer({
    getTheme: () => getTheme(),
    commit: (text) => { committed.push(text) },
    refillInput: (text) => { refilled.push(text) },
  })
  return { announcer, committed, refilled }
}

describe('ErrorAnnouncer · 落底去重', () => {
  it('同错误逐帧重读只落底一次；null 不动作也不复位去重指针（与原 renderLive 语义一致）', () => {
    const { announcer, committed } = makeHarness()
    announcer.announce('boom 401', true)
    announcer.announce('boom 401', true)
    announcer.announce(null, true)
    announcer.announce('boom 401', true) // null 间隙后同文本——去重指针未复位，不重复落底
    expect(committed.filter(t => t.includes('boom 401'))).toHaveLength(1)
    announcer.announce('different error', true)
    expect(committed.filter(t => t.includes('different error'))).toHaveLength(1)
  })

  it('落底文本带恢复指引尾注（401 → /key）', () => {
    const { announcer, committed } = makeHarness()
    announcer.announce('401 unauthorized', false)
    expect(committed[0]).toContain('401 unauthorized')
    expect(committed[0]).toContain('/key')
  })
})

describe('ErrorAnnouncer · 错误后回填（lastSubmitted 生命周期）', () => {
  it('输入行空：回填最近投递消息 + 告知行；取走即清防双份', () => {
    const { announcer, committed, refilled } = makeHarness()
    announcer.recordSubmitted('帮我改这段')
    announcer.announce('boom timeout', true)
    expect(refilled).toEqual(['帮我改这段'])
    expect(committed.some(t => t.includes(REFILL_NOTE))).toBe(true)
    announcer.announce('another error', true)
    expect(refilled).toHaveLength(1)
  })

  it('输入行有草稿不抢写；底料保留待空输入时使用', () => {
    const { announcer, refilled } = makeHarness()
    announcer.recordSubmitted('draft case')
    announcer.announce('boom', false)
    expect(refilled).toEqual([])
    announcer.announce('boom 2', true)
    expect(refilled).toEqual(['draft case'])
  })

  it('clearSubmitted 后错误不回填旧消息', () => {
    const { announcer, refilled } = makeHarness()
    announcer.recordSubmitted('old turn')
    announcer.clearSubmitted()
    announcer.announce('boom', true)
    expect(refilled).toEqual([])
  })

  it('未记录（如纯 slash 会话）不回填', () => {
    const { announcer, refilled } = makeHarness()
    announcer.announce('boom', true)
    expect(refilled).toEqual([])
  })
})
