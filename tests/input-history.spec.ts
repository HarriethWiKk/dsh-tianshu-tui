/**
 * input-history — 输入历史持久化契约。
 *
 * 去重策略（对本仓内存态语义的持久化）/ 队列串行合并 / 容错 / 上限。
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MAX_INPUT_HISTORY,
  appendInputHistory,
  inputHistoryEnabled,
  loadInputHistory,
  nextHistoryAfterSubmit,
} from '../src/input-history.js'

function tmpHistory(): string {
  return join(mkdtempSync(join(tmpdir(), 'dsh-input-history-')), 'input-history.json')
}

describe('nextHistoryAfterSubmit', () => {
  it('新条目置顶 + trim', () => {
    expect(nextHistoryAfterSubmit(['b', 'c'], '  a  ')).toEqual(['a', 'b', 'c'])
  })

  it('重复提交浮到头部（全列表去重）', () => {
    expect(nextHistoryAfterSubmit(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c'])
  })

  it('空串/纯空白 no-op（返回副本）', () => {
    const h = ['a']
    expect(nextHistoryAfterSubmit(h, '   ')).toEqual(['a'])
  })

  it('超过上限丢最旧（FIFO 限长）', () => {
    const base = Array.from({ length: MAX_INPUT_HISTORY }, (_, i) => `old-${i}`)
    const next = nextHistoryAfterSubmit(base, 'new')
    expect(next.length).toBe(MAX_INPUT_HISTORY)
    expect(next[0]).toBe('new')
    expect(next[1]).toBe('old-0')
    expect(next[next.length - 1]).toBe(`old-${MAX_INPUT_HISTORY - 2}`)
  })
})

describe('loadInputHistory 容错', () => {
  it('缺失 → 空数组', () => {
    expect(loadInputHistory(join(tmpHistory(), 'nope.json'))).toEqual([])
  })

  it('损坏 JSON / 非数组 / 混入非字符串 → 过滤或空', () => {
    const p = tmpHistory()
    writeFileSync(p, '{broken')
    expect(loadInputHistory(p)).toEqual([])
    writeFileSync(p, '["ok", 42, null, "fine"]')
    expect(loadInputHistory(p)).toEqual(['ok', 'fine'])
  })
})

describe('appendInputHistory 队列合并', () => {
  it('单条追加落盘', async () => {
    const p = tmpHistory()
    await appendInputHistory(p, 'hello')
    expect(loadInputHistory(p)).toEqual(['hello'])
  })

  it('快速连续追加不丢条目（进程内串行队列 + 重读合并）', async () => {
    const p = tmpHistory()
    await Promise.all([
      appendInputHistory(p, 'one'),
      appendInputHistory(p, 'two'),
      appendInputHistory(p, 'three'),
    ])
    const loaded = loadInputHistory(p)
    expect(loaded.length).toBe(3)
    // 完成序不定（队列时序），但三条俱在
    expect(loaded).toEqual(expect.arrayContaining(['one', 'two', 'three']))
  })

  it('重复条目跨追加去重（文件为准）', async () => {
    const p = tmpHistory()
    await appendInputHistory(p, 'same')
    await appendInputHistory(p, 'other')
    await appendInputHistory(p, 'same')
    const loaded = loadInputHistory(p)
    expect(loaded.filter(x => x === 'same')).toHaveLength(1)
    expect(loaded[0]).toBe('same')
  })

  it('外部写入的条目不丢（每次重读合并）', async () => {
    const p = tmpHistory()
    await appendInputHistory(p, 'mine')
    // 模拟另一进程写入
    writeFileSync(p, JSON.stringify(['theirs', 'mine']))
    await appendInputHistory(p, 'again')
    const loaded = loadInputHistory(p)
    expect(loaded).toEqual(expect.arrayContaining(['theirs', 'mine', 'again']))
  })
})

describe('inputHistoryEnabled 密封门', () => {
  it('显式 path 优先；VITEST 下未指定 → null', () => {
    expect(inputHistoryEnabled('/tmp/h.json')).toBe('/tmp/h.json')
    expect(inputHistoryEnabled(null)).toBeNull()
    expect(process.env.VITEST).toBeTruthy()
    expect(inputHistoryEnabled(undefined)).toBeNull()
  })
})
