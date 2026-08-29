/**
 * InputLine ghost 预览（阶段 2 slash 菜单补全预览）— 渲染契约测试。
 *
 * - setGhost + displayLines：光标在末尾时 ghost 以 dim 样式显示在 █ 后
 * - 光标不在末尾 / 空值 / 有选区 → 不显示 ghost
 * - wrap 路径（maxWidth）：ghost 插入光标行并按剩余空间截断
 * - setGhost(null) 清除；幂等无副作用
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { InputLine } from '../src/engine/input-line.js'
import { ANSI } from '../src/engine/ansi.js'
import { displayWidth } from '../src/width.js'

function plain(line: string): string {
  return line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
}

describe('InputLine ghost 预览', () => {
  it('光标在末尾：ghost 以 dim 样式显示在 █ 后', () => {
    const il = new InputLine({ value: '/th' })
    il.setGhost('eme')
    const [line = ''] = il.displayLines()
    expect(line).toContain('\x1B[2meme\x1B[22m') // dim
    expect(plain(line)).toBe('❯ /th█eme')
  })

  it('setGhost(null) 清除 ghost', () => {
    const il = new InputLine({ value: '/th' })
    il.setGhost('eme')
    il.setGhost(null)
    const [line = ''] = il.displayLines()
    expect(line).not.toContain('eme')
    expect(plain(line)).toBe('❯ /th█')
  })

  it('光标不在末尾：不显示 ghost', () => {
    const il = new InputLine({ value: '/theme' })
    il.setValue('/theme', 2) // 光标移到 /t 后
    il.setGhost('eme')
    const [line = ''] = il.displayLines()
    expect(line).not.toContain('\x1B[2m')
  })

  it('空值：不显示 ghost（占位符路径）', () => {
    const il = new InputLine({ placeholder: '询问' })
    il.setGhost('xx')
    const [line = ''] = il.displayLines()
    expect(line).not.toContain('xx')
  })

  it('有选区：不显示 ghost（选区行含 ANSI 高亮，插入会错位）', () => {
    const il = new InputLine({ value: 'abcd' })
    il.setGhost('XX')
    il.handleKey('home', '', false, false, true) // shift+home 全选
    const [line = ''] = il.displayLines()
    expect(line).not.toContain('XX')
  })

  it('wrap 路径（maxWidth）：ghost 插入光标行（wrap 行不含自绘 █）', () => {
    const il = new InputLine({ value: '/th' })
    il.setGhost('eme')
    const lines = il.displayLines({ maxWidth: 20 })
    const line = lines[0] ?? ''
    expect(plain(line)).toBe('❯ /th█eme')
  })

  it('wrap 路径：ghost 超出剩余空间时截断，行宽守恒', () => {
    const il = new InputLine({ value: '/th' })
    il.setGhost('eme-very-long-ghost-text')
    const lines = il.displayLines({ maxWidth: 7 })
    const line = lines[0] ?? ''
    // prefix(2) + /th(3) + █(1) = 6 → 剩余 1 列给 ghost
    expect(plain(line)).toBe('❯ /th█e')
  })

  it('setGhost 不触发 onChange（纯渲染状态）', () => {
    let changes = 0
    const il = new InputLine({ value: 'x', onChange: () => { changes++ } })
    il.setGhost('gh')
    il.setGhost(null)
    expect(changes).toBe(0)
  })
})

describe('#50 反色光标（字符原位反色，不占格不推移）', () => {
  it('行中光标：字符反色、无占位块，帧文本与无光标帧逐字一致（ASCII）', () => {
    const il = new InputLine({ value: 'abc' })
    il.setValue('abc', 1) // 光标在 a|b 之间
    const [line = ''] = il.displayLines()
    expect(line).toContain(`${ANSI.REVERSE}b${ANSI.RESET}`)
    expect(line).not.toContain('█')
    expect(plain(line)).toBe('❯ abc')
  })

  it('行中光标：CJK 宽度守恒——反色格宽度 = 原字符宽度（2 cell）', () => {
    const il = new InputLine({ value: '中文' })
    il.setValue('中文', 1) // 中|文 之间
    const [line = ''] = il.displayLines()
    expect(line).toContain(`${ANSI.REVERSE}文${ANSI.RESET}`)
    // 旧实现插入 1 cell █ 时帧宽为 2+4+1；反色光标帧宽必须与纯文本一致
    expect(displayWidth(plain(line))).toBe(displayWidth('❯ 中文'))
  })

  it('行尾光标：保留块 █（其后无字符，不产生推移）', () => {
    const il = new InputLine({ value: 'abc' })
    il.setValue('abc', 3)
    const [line = ''] = il.displayLines()
    expect(plain(line)).toBe('❯ abc█')
  })

  it('选区覆盖光标格：单层 REVERSE 不嵌套（内层 RESET 会拆散选区高亮）', () => {
    const il = new InputLine({ value: 'abc' })
    il.setValue('abc', 1)
    il.handleKey('right', '', false, false, true) // shift+right 选中 b，光标在 b|c
    const [line = ''] = il.displayLines()
    expect(line).not.toContain('█')
    expect(plain(line)).toBe('❯ abc')
    expect(line.split(ANSI.REVERSE).length - 1).toBe(1)
  })

  it('wrap 路径行中光标：同样反色不插块，wrap 宽度不受光标影响', () => {
    const il = new InputLine({ value: 'abcdefgh' })
    il.setValue('abcdefgh', 3)
    const lines = il.displayLines({ maxWidth: 10 })
    const joined = lines.join('\n')
    expect(joined).toContain(`${ANSI.REVERSE}d${ANSI.RESET}`)
    expect(joined).not.toContain('█')
    expect(plain(joined)).toBe('❯ abcdefgh')
  })

  it('多行非 wrap 路径：光标行反色，非光标行不受影响', () => {
    const il = new InputLine({ value: 'ab\ncd' })
    il.setValue('ab\ncd', 3) // 次行 c|d（光标行前缀恒为 ❯ ）
    const lines = il.displayLines()
    expect(plain(lines[0] ?? '')).toBe('  ab')
    expect(lines[1]).toContain(`${ANSI.REVERSE}c${ANSI.RESET}`)
    expect(plain(lines[1] ?? '')).toBe('❯ cd')
  })
})

describe('多行 ↑↓ 导航 grapheme 列保持（CJK/emoji 不拆簇）', () => {
  // 回归：列号曾以 code-unit 计——跨行移动时落在代理对/ZWJ 簇中间，
  // 光标错乱且后续插入拆碎 emoji（上游 dfe8b6f41 同款修复 + 测试）。

  it('Up 保留 grapheme 列：光标落在完整 ZWJ emoji 簇之后', () => {
    const family = '👨‍👩‍👧' // ZWJ 簇：8 code units / 1 grapheme
    const il = new InputLine({ value: `${family}x\nz` })
    il.setValue(il.value, il.value.length) // 光标停在末行行尾（grapheme 列 1）

    il.handleKey('up', '', false, false)

    // 期望光标 = family.length（簇整体之后），而非簇中间的 code-unit 位置
    expect(il.cursor).toBe(family.length)
    il.handleKey('unknown', 'Q', false, false)
    expect(il.value).toBe(`${family}Qx\nz`)
  })

  it('Down 保留 grapheme 列：光标落在完整代理对之后', () => {
    const il = new InputLine({ value: 'z\n😀x' }) // 😀 = 2 code units / 1 grapheme
    il.setValue(il.value, 1) // 首行 grapheme 列 1

    il.handleKey('down', '', false, false)

    // z\n(2) + 😀(2 units) = 4；code-unit 直取会得到 3（代理对中间）
    expect(il.cursor).toBe(4)
    il.handleKey('unknown', 'Q', false, false)
    expect(il.value).toBe('z\n😀Qx')
  })

  it('CJK 混排跨行：列号按 grapheme 计保持到第 N 个字之后', () => {
    const il = new InputLine({ value: '你好世界\nab' })
    il.setValue(il.value, 7) // 末行行尾（grapheme 列 2）

    il.handleKey('up', '', false, false)
    expect(il.cursor).toBe(2) // 第 2 个 CJK 字之后（每字 1 code unit）

    il.handleKey('down', '', false, false)
    expect(il.cursor).toBe(7) // 回到末行同列
  })

  it('col 超出目标行 grapheme 数时贴到行尾（不越界）', () => {
    const il = new InputLine({ value: 'abcdefgh\nx' })
    il.setValue(il.value, 8) // 首行行尾（grapheme 列 8）

    il.handleKey('down', '', false, false)
    expect(il.cursor).toBe(il.value.length) // 末行行尾
  })
})


describe('acceptGhost 引擎侧 undo 语义（append 进 undo 栈）', () => {
  // scout 侦察 E 项：append 经 setValue → recordUndo('replace')，接受 ghost
  // 后 Ctrl+Z 必须回到接受前文本（accept 是离散动作，独立 undo 单元）。
  it('append（accept ghost 路径）后 Ctrl+Z 回到接受前文本', () => {
    const il = new InputLine({ value: 'hel' })
    il.setValue('hel', 3)
    il.append('lo')
    expect(il.value).toBe('hello')
    il.handleKey('ctrl_z', '', true, false, false)
    expect(il.value).toBe('hel')
  })

  it('append 后 Ctrl+Z 再 Ctrl+Y 恢复接受后文本', () => {
    const il = new InputLine({ value: 'hel' })
    il.setValue('hel', 3)
    il.append('lo')
    il.handleKey('ctrl_z', '', true, false, false)
    expect(il.value).toBe('hel')
    il.handleKey('ctrl_y', '', true, false, false)
    expect(il.value).toBe('hello')
  })

  it('accept ghost 独立成 undo 单元（不并入之前的连续 word 输入）', () => {
    const il = new InputLine({ value: 'hel' })
    il.setValue('hel', 3)
    il.handleKey('h', 'h', false, false, false) // 连续 word 输入 → 'helh'
    expect(il.value).toBe('helh')
    il.append('lo') // accept ghost → 'helhlo'
    expect(il.value).toBe('helhlo')
    il.handleKey('ctrl_z', '', true, false, false)
    expect(il.value).toBe('helh') // 只撤销 ghost，保留 h 输入
    il.handleKey('ctrl_z', '', true, false, false)
    expect(il.value).toBe('hel') // 再撤销 h 输入
  })
})

describe('#55 vim 光标形态（insert 竖线 / normal 反色块）', () => {
  const prevAscii = process.env.RIVET_ASCII_UI
  beforeAll(() => { process.env.RIVET_ASCII_UI = '0' }) // 锁 Unicode 档：断言 ▏
  afterAll(() => {
    if (prevAscii === undefined) delete process.env.RIVET_ASCII_UI
    else process.env.RIVET_ASCII_UI = prevAscii
  })

  function vimLine(value: string, cursor: number): InputLine {
    const il = new InputLine({ value })
    il.setValue(value, cursor)
    il.setVimEnabled(true)
    return il
  }

  it('vim insert 行中：竖线插在光标前、字符原样不吞', () => {
    const il = vimLine('abc', 1)
    const [line = ''] = il.displayLines()
    expect(plain(line)).toBe('❯ a▏bc')
  })

  it('vim insert 行尾：竖线替代块 █', () => {
    const il = vimLine('abc', 3)
    const [line = ''] = il.displayLines()
    expect(plain(line)).toBe('❯ abc▏')
  })

  it('vim normal：保持反色原字符（色块语义与 #50 一致）', () => {
    const il = vimLine('abc', 1)
    il.handleKey('escape', '', false, false, false) // → normal，光标左移一字符（vim 语义）
    const [line = ''] = il.displayLines()
    expect(line).toContain(ANSI.REVERSE)
    expect(plain(line)).not.toContain('▏')
  })

  it('空值 vim insert：占位行用竖线', () => {
    const il = new InputLine({ placeholder: '说点什么…' })
    il.setVimEnabled(true)
    const [line = ''] = il.displayLines()
    expect(plain(line)).toBe('❯ ▏说点什么…')
  })

  it('ASCII 档：竖线退化为 |', () => {
    process.env.RIVET_ASCII_UI = '1'
    try {
      const il = vimLine('abc', 1)
      const [line = ''] = il.displayLines()
      expect(plain(line)).toBe('❯ a|bc')
    } finally {
      process.env.RIVET_ASCII_UI = '0'
    }
  })

  it('非 vim：维持 #50 原样（无竖线）', () => {
    const il = new InputLine({ value: 'abc' })
    il.setValue('abc', 1)
    const [line = ''] = il.displayLines()
    expect(plain(line)).not.toContain('▏')
    expect(line).toContain(`${ANSI.REVERSE}b${ANSI.RESET}`)
  })
})
