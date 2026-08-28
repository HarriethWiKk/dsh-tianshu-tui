/**
 * CommitEngine scrollback 截断行为——scrollbackMaxLines 的 RingBuffer 封顶。
 *
 * scout 侦察 H 项：cap 应用（Math.max(1, cap) + RingBuffer）零锚点，
 * 此前仅 prefs 解析与构造透传测试。本文件锁定截断契约：
 * - 超出上限后 getContent() 只含最近 N 条（write 与 writeBatch 两条写入路径）
 * - cap=1 边界（及 cap=0 的 Math.max 兜底）
 * - 构造不传 scrollbackMaxLines → 缺省 1000
 */

import { describe, expect, it } from 'vitest'
import type { WriteStream } from 'node:tty'
import { CommitEngine } from '../src/engine/commit-engine.js'

/** 最小 WriteStream 替身：记录全部写入内容；columns 供 writeSeparator 取宽。 */
function fakeStdout(): { stream: WriteStream; out: string } {
  let out = ''
  const stream = {
    write(chunk: string): boolean {
      out += chunk
      return true
    },
    columns: 80,
  } as unknown as WriteStream
  return { stream, out }
}

function engine(cap?: number): CommitEngine {
  const { stream } = fakeStdout()
  const options: ConstructorParameters<typeof CommitEngine>[0] = { stdout: stream }
  if (cap !== undefined) options.scrollbackMaxLines = cap
  return new CommitEngine(options)
}

describe('CommitEngine scrollbackMaxLines 截断', () => {
  it('超出上限后 getContent() 只含最近 N 条（write 路径）', () => {
    const e = engine(3)
    for (const text of ['a', 'b', 'c', 'd', 'e']) e.write({ text })
    expect(e.getContent()).toBe('c\nd\ne')
  })

  it('writeBatch 同样按条数封顶（同一 RingBuffer）', () => {
    const e = engine(2)
    e.writeBatch([{ text: 'a' }, { text: 'b' }, { text: 'c' }])
    expect(e.getContent()).toBe('b\nc')
  })

  it('cap=1 边界：只剩最新一条', () => {
    const e = engine(1)
    e.write({ text: 'first' })
    e.write({ text: 'second' })
    expect(e.getContent()).toBe('second')
  })

  it('cap=0 防御：Math.max(1, cap) 兜底为 1，不抛错', () => {
    const e = engine(0)
    e.write({ text: 'x' })
    e.write({ text: 'y' })
    expect(e.getContent()).toBe('y')
  })

  it('构造不传 scrollbackMaxLines → 缺省 1000', () => {
    const e = engine()
    for (let i = 0; i < 1005; i++) e.write({ text: `l${i}` })
    const lines = e.getContent().split('\n')
    expect(lines).toHaveLength(1000)
    expect(lines[0]).toBe('l5') // 前 5 条被逐出
    expect(lines[999]).toBe('l1004')
  })

  it('getContent 条目以换行连接（单条目内部换行保留）', () => {
    const e = engine(5)
    e.write({ text: 'line1\nline2' })
    e.write({ text: 'tail' })
    expect(e.getContent()).toBe('line1\nline2\ntail')
  })

  it('reset() 清空后从零重新累积', () => {
    const e = engine(2)
    e.write({ text: 'a' })
    e.write({ text: 'b' })
    e.reset()
    e.write({ text: 'c' })
    expect(e.getContent()).toBe('c')
  })
})
