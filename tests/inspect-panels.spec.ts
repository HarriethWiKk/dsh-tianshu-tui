/**
 * inspect-panels — 检查类 live 面板互斥与键语义。
 */
import { describe, expect, it } from 'vitest'
import {
  anyInspectOpen,
  exclusiveInspect,
  inspectHint,
  inspectKeyAction,
} from '../src/ui/inspect-panels.js'

const allClosed = { config: false, skills: false, status: false, lsp: false, tasks: false }

describe('exclusiveInspect / anyInspectOpen', () => {
  it('打开一项时关掉其余；再 toggle 同一项则全关', () => {
    const opened = exclusiveInspect('config', true)
    expect(opened).toEqual({ config: true, skills: false, status: false, lsp: false, tasks: false })
    expect(anyInspectOpen(opened)).toBe(true)
    expect(exclusiveInspect('config', false)).toEqual(allClosed)
    expect(anyInspectOpen(allClosed)).toBe(false)
  })

  it('从 skills 切到 status：只留 status', () => {
    expect(exclusiveInspect('status', true)).toEqual({
      config: false, skills: false, status: true, lsp: false, tasks: false,
    })
  })
})

describe('inspectKeyAction', () => {
  it('有检查面板时 Esc 关闭（有草稿也关）', () => {
    expect(inspectKeyAction({
      name: 'escape', char: '', empty: false, vimInsert: true,
      flags: { ...allClosed, config: true },
    })).toEqual({ type: 'close' })
  })

  it('无检查面板时 Esc 不吞（留给 rewind）', () => {
    expect(inspectKeyAction({
      name: 'escape', char: '', empty: true, vimInsert: true, flags: allClosed,
    })).toBeNull()
  })

  it('config + 空输入：n 通知、d 密度', () => {
    const flags = { ...allClosed, config: true }
    expect(inspectKeyAction({ name: '', char: 'n', empty: true, vimInsert: true, flags }))
      .toEqual({ type: 'notify' })
    expect(inspectKeyAction({ name: '', char: 'D', empty: true, vimInsert: true, flags }))
      .toEqual({ type: 'density' })
    expect(inspectKeyAction({ name: '', char: 'n', empty: false, vimInsert: true, flags }))
      .toBeNull()
  })

  it('skills + 空输入：↑↓ / j k 移动选中', () => {
    const flags = { ...allClosed, skills: true }
    expect(inspectKeyAction({ name: 'up', char: '', empty: true, vimInsert: true, flags }))
      .toEqual({ type: 'skills-move', delta: -1 })
    expect(inspectKeyAction({ name: 'down', char: 'j', empty: true, vimInsert: true, flags }))
      .toEqual({ type: 'skills-move', delta: 1 })
    expect(inspectKeyAction({ name: '', char: 'k', empty: true, vimInsert: true, flags }))
      .toEqual({ type: 'skills-move', delta: -1 })
  })
})

describe('inspectHint', () => {
  it('默认 Esc 关闭；可附加前缀段', () => {
    expect(inspectHint(80)).toBe('Esc 关闭')
    expect(inspectHint(80, ['↑↓ 详情'])).toBe('↑↓ 详情 · Esc 关闭')
    expect(inspectHint(8, ['↑↓ 详情']).includes('…') || inspectHint(8, ['↑↓ 详情']).length <= 8).toBe(true)
  })
})
