/**
 * spinner 动词池与耗时格式化（format/spinner-status.ts）— 纯函数契约测试。
 *
 * - formatElapsedHuman：<60s 纯秒 / 分+秒 / 负数按 0。
 * - verbForElapsed：elapsed 时间片内取同一词、跨片轮换、取模回绕；
 *   reducedMotion 冻结池首；扩充词库池首恒为「思考中」。
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPINNER_VERBS,
  VERB_ROTATE_MS,
  formatElapsedHuman,
  verbForElapsed,
} from '../src/format/spinner-status.js'

describe('formatElapsedHuman', () => {
  it('<60s：纯秒', () => {
    expect(formatElapsedHuman(0)).toBe('0s')
    expect(formatElapsedHuman(30_000)).toBe('30s')
  })
  it('>=60s：分+秒', () => {
    expect(formatElapsedHuman(90_000)).toBe('1m 30s')
    expect(formatElapsedHuman(3_605_000)).toBe('60m 5s')
  })
  it('负数按 0 处理', () => {
    expect(formatElapsedHuman(-1000)).toBe('0s')
  })
})

describe('verbForElapsed（纯函数词池轮换）', () => {
  it('默认池：elapsed 时间片内取同一词，跨片轮换', () => {
    const v0 = verbForElapsed(0, DEFAULT_SPINNER_VERBS)
    const vSame = verbForElapsed(VERB_ROTATE_MS - 1, DEFAULT_SPINNER_VERBS)
    expect(vSame).toBe(v0)
    const vNext = verbForElapsed(VERB_ROTATE_MS, DEFAULT_SPINNER_VERBS)
    expect(vNext).not.toBe(v0)
  })
  it('一个词的池恒返回该词', () => {
    expect(verbForElapsed(123_456, ['干活中'])).toBe('干活中')
  })
  it('reducedMotion 冻结为池首', () => {
    expect(verbForElapsed(VERB_ROTATE_MS * 3, DEFAULT_SPINNER_VERBS, true)).toBe(DEFAULT_SPINNER_VERBS[0])
  })
  it('verbs 数组首位为 undefined：verbForElapsed 回退默认池首（防御分支）', () => {
    const undefinedFirst = [undefined as unknown as string, 'x']
    expect(verbForElapsed(0, undefinedFirst)).toBe('思考中')
    // pool[idx] undefined → ?? first 回退
    expect(verbForElapsed(VERB_ROTATE_MS, ['a', undefined as unknown as string])).toBe('a')
  })
})

describe('DEFAULT_SPINNER_VERBS（扩充词库）', () => {
  it('池首恒为「思考中」（reducedMotion 冻结词）', () => {
    expect(DEFAULT_SPINNER_VERBS[0]).toBe('思考中')
  })
  it('扩充至 14 词：拟人词全部在池', () => {
    expect(DEFAULT_SPINNER_VERBS).toHaveLength(14)
    for (const v of ['沉思中', '琢磨中', '推敲中', '酝酿中', '腌制中', '翻炒中', '施法中', '缝合中']) {
      expect(DEFAULT_SPINNER_VERBS).toContain(v)
    }
  })
  it('末位词可达且取模回绕到池首', () => {
    const last = DEFAULT_SPINNER_VERBS[DEFAULT_SPINNER_VERBS.length - 1]
    expect(verbForElapsed(VERB_ROTATE_MS * 13, DEFAULT_SPINNER_VERBS)).toBe(last)
    expect(verbForElapsed(VERB_ROTATE_MS * 14, DEFAULT_SPINNER_VERBS)).toBe(DEFAULT_SPINNER_VERBS[0])
  })
})
