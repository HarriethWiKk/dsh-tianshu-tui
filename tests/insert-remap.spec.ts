/**
 * insert-remap — vim insert 两键序列 → Esc（jj→Esc 等，对标 CC vimInsertModeRemaps）。
 *
 * 覆盖：prefs 校验、前缀提取、缓冲状态机（时间窗/光标连续性/序列匹配）、
 * InputLine 集成（jj 命中退出 insert 且值干净；jx 正常上屏；光标移动后不触发）。
 */
import { describe, expect, it } from 'vitest'
import {
  InsertRemapper,
  parseInsertRemaps,
  remapSequences,
  REMAP_WINDOW_MS,
} from '../src/engine/insert-remap.js'
import { InputLine } from '../src/engine/input-line.js'

describe('parseInsertRemaps 校验', () => {
  it('{"jj":"esc"} 通过；坏值/非两字符键/非对象静默忽略', () => {
    expect(parseInsertRemaps({ jj: 'esc', jk: 'esc' })).toEqual({ jj: 'esc', jk: 'esc' })
    expect(parseInsertRemaps({ jj: 'copy' })).toEqual({})
    expect(parseInsertRemaps({ j: 'esc' })).toEqual({})
    expect(parseInsertRemaps({ jjj: 'esc' })).toEqual({})
    expect(parseInsertRemaps('jj')).toEqual({})
    expect(parseInsertRemaps(null)).toEqual({})
    expect(parseInsertRemaps(undefined)).toEqual({})
    expect(parseInsertRemaps(['jj'])).toEqual({})
  })
})

describe('remapSequences 提取', () => {
  it('只保留值为 esc 的两字符键；undefined → 空数组', () => {
    expect(remapSequences({ jj: 'esc', jk: 'esc' })).toEqual(['jj', 'jk'])
    expect(remapSequences({ jj: 'esc', kj: 'copy', j: 'esc' })).toEqual(['jj'])
    expect(remapSequences(undefined)).toEqual([])
  })
})

describe('InsertRemapper 状态机', () => {
  it("命中 'jj' → 回删起点 0；窗口外第二键不触发", () => {
    const r = new InsertRemapper(['jj'])
    r.onChar('j', 1, 0)
    expect(r.onChar('j', 2, 500)).toBe(0)
    r.onChar('j', 1, 0)
    expect(r.onChar('j', 2, REMAP_WINDOW_MS + 1)).toBe(null)
  })

  it("光标不连续（移动后）不触发；序列不匹配不触发", () => {
    const r = new InsertRemapper(['jj'])
    r.onChar('j', 1, 0)
    expect(r.onChar('x', 3, 100)).toBe(null) // 光标跳走
    r.onChar('j', 1, 0)
    expect(r.onChar('k', 2, 100)).toBe(null) // 'jk' 不在序列表
    r.onChar('j', 1, 0)
    expect(r.onChar('j', 2, 100)).toBe(0)
  })

  it("'jj'+'jk' 共享缓冲；reset 清缓冲", () => {
    const r = new InsertRemapper(['jj', 'jk'])
    r.onChar('j', 1, 0)
    expect(r.onChar('k', 2, 100)).toBe(0)
    r.onChar('j', 1, 0)
    r.reset()
    expect(r.onChar('j', 2, 100)).toBe(null)
  })
})

describe('InputLine 集成', () => {
  function vimLine(): InputLine {
    const il = new InputLine({ insertRemapSequences: ['jj'] })
    il.setVimEnabled(true)
    return il
  }

  function type(il: InputLine, ch: string): void {
    if (ch === '\x1b') il.handleKey('escape', '', false, false, false)
    else il.handleKey('unknown', ch, false, false, false)
  }

  it("jj → 退出 insert 且两个 j 都不上屏", () => {
    const il = vimLine()
    type(il, 'j')
    type(il, 'j')
    expect(il.vimMode).toBe('normal')
    expect(il.value).toBe('')
  })

  it("jx → 正常上屏 'jx'；退出 insert 后 j 是 motion 不上屏", () => {
    const il = vimLine()
    type(il, 'j')
    type(il, 'x')
    expect(il.value).toBe('jx')
    expect(il.vimMode).toBe('insert')
    type(il, '\x1b')
    type(il, 'j')
    expect(il.value).toBe('jx')
  })

  it("移动光标后第二个 j 正常上屏", () => {
    const il = vimLine()
    type(il, 'j')
    il.handleKey('left', '', false, false, false)
    type(il, 'j')
    expect(il.vimMode).toBe('insert')
    expect(il.value.includes('jj')).toBe(true)
  })

  it("非 vim 构造（无序列）时 jj 是普通字符", () => {
    const il = new InputLine({})
    il.setVimEnabled(true)
    il.handleKey('unknown', 'j', false, false, false)
    il.handleKey('unknown', 'j', false, false, false)
    expect(il.vimMode).toBe('insert')
    expect(il.value).toBe('jj')
  })

  it("提交清空后缓冲失效：再次 jj 仍正常触发退出", () => {
    const il = vimLine()
    type(il, 'j')
    il.handleKey('return', '', false, false, false)
    expect(il.value).toBe('')
    type(il, 'j')
    type(il, 'j')
    expect(il.vimMode).toBe('normal')
    expect(il.value).toBe('')
  })
})
