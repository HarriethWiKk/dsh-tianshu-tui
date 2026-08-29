/**
 * highlight — 搜索命中子串高亮（A2）。
 * 覆盖：plain 行包裹、大小写口径、多命中、ANSI 行转义保护与位置映射、
 * 空 query/无命中原样返回。
 */
import { describe, expect, it } from 'vitest'
import { highlightQuery } from '../src/format/highlight.js'

const wrap = (s: string): string => `\x1B[7m${s}\x1B[0m`

describe('highlightQuery', () => {
  it('plain 行：命中包裹、大小写不敏感（缺省）', () => {
    expect(highlightQuery('Hello World', 'world', { wrap })).toBe(`Hello \x1B[7mWorld\x1B[0m`)
  })

  it('sensitive=true 时大小写敏感不命中', () => {
    expect(highlightQuery('Hello World', 'world', { sensitive: true, wrap })).toBe('Hello World')
    expect(highlightQuery('Hello World', 'World', { sensitive: true, wrap })).toContain(wrap('World'))
  })

  it('多命中全部包裹；重叠按先到先得', () => {
    expect(highlightQuery('aa', 'a', { wrap })).toBe(`${wrap('a')}${wrap('a')}`)
  })

  it('ANSI 行：转义不参与匹配、命中位置映射正确、转义原样保留', () => {
    const line = '\x1B[31mred\x1B[0m plain'
    const out = highlightQuery(line, 'plain', { wrap })
    expect(out).toBe(`\x1B[31mred\x1B[0m ${wrap('plain')}`)
    // 查询词不会命中转义码内部（'31' 之类）
    expect(highlightQuery(line, '31', { wrap })).toBe(line)
  })

  it('空 query / 无命中原样返回', () => {
    expect(highlightQuery('abc', '', { wrap })).toBe('abc')
    expect(highlightQuery('abc', 'zz', { wrap })).toBe('abc')
  })
})
