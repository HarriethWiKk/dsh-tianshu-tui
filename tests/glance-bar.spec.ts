/**
 * metrics 一行条（format/glance-bar.ts）— 纯渲染契约测试。
 *
 * - segment 组装：model / 缓存% / 上下文%+占用条 / ◧ tokens / #turn / $cost / elapsed / 停滞
 * - 窄宽 drop 尾部次要段；极窄截断 model 段；任何宽度下不破版。
 * - formatTokenCount 单位压缩（k / M）。
 */

import { describe, expect, it } from 'vitest'
import type { RivetTheme } from '../src/theme.js'
import { displayWidth } from '../src/width.js'
import {
  formatTokenCount,
  formatContextBar,
  glanceBarSegments,
  formatGlanceBar,
  CONTEXT_BAR_CELLS,
  type FormatGlanceBarInput,
} from '../src/format/glance-bar.js'

function fakeTheme(): RivetTheme {
  return {
    primary: '#111111', secondary: '#222222', success: '#333333',
    warning: '#444444', error: '#555555', dim: '#666666', muted: '#777777',
    pulseQuiet: '#888888', pulseActive: '#999999', pulseAlert: '#aaaaaa',
    userColor: '#bbbbbb', assistantColor: '#cccccc', systemColor: '#dddddd',
    brandColor: '#eeeeee', toolColor: () => '#000000', contextColor: () => '#000000',
  }
}

function plain(lines: readonly string[]): string[] {
  return lines.map(l => l.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, ''))
}

function base(over: Partial<FormatGlanceBarInput> = {}): FormatGlanceBarInput {
  return {
    width: 80,
    modelName: 'deepseek-v4',
    cacheHitRate: 0.82,
    contextRatio: 0.42,
    tokens: { used: 12_500, max: 200_000 },
    elapsedMs: 65_000,
    ...over,
  }
}

describe('formatTokenCount', () => {
  it('< 1k 原值；< 1M 取 k；≥ 1M 取 M', () => {
    expect(formatTokenCount(850)).toBe('850')
    expect(formatTokenCount(12_500)).toBe('12.5k')
    expect(formatTokenCount(2_500_000)).toBe('2.50M')
  })

  it('整数 k：1000 的整倍数不带小数', () => {
    expect(formatTokenCount(2_000)).toBe('2k')
    expect(formatTokenCount(100_000)).toBe('100k')
  })
})

describe('glanceBarSegments', () => {
  it('全空 → 空数组', () => {
    expect(glanceBarSegments({})).toEqual([])
  })

  it('compact：model + 缓存 + 上下文 + tokens + 耗时', () => {
    const segs = glanceBarSegments(base())
    const text = plain(segs).join(' · ')
    expect(text).toContain('deepseek-v4')
    expect(text).toContain('缓存 82%')
    expect(text).toContain('上下文 42%')
    expect(text).toContain('12.5k/200k')
    expect(text).toContain('1m 5s')
    expect(text).not.toContain('#')
    expect(text).not.toContain('$')
  })

  it('full：追加 #turn 与 $cost', () => {
    const text = plain(glanceBarSegments(base({ density: 'full', turnCount: 7, cost: 0.42 }))).join(' · ')
    expect(text).toContain('#7')
    expect(text).toContain('$0.42')
  })

  it('cost 有值即显示（不依赖 density full——footer 组装无 density）', () => {
    const text = plain(glanceBarSegments(base({ cost: 0.42 }))).join(' · ')
    expect(text).toContain('$0.42')
    expect(text).not.toContain('#')
  })

  it('上下文 ≥95% → ⚠ 前缀；<95% 无警告', () => {
    expect(plain(glanceBarSegments(base({ contextRatio: 0.94 }))).join(' · ')).toContain('上下文 94%')
    expect(plain(glanceBarSegments(base({ contextRatio: 0.95 }))).join(' · ')).toContain('⚠上下文 95%')
    expect(plain(glanceBarSegments(base({ contextRatio: 1 }))).join(' · ')).toContain('⚠上下文 100%')
  })

  it('stalled：追加停滞标记', () => {
    const text = plain(glanceBarSegments(base({ stalled: true }))).join(' · ')
    expect(text).toContain('停滞')
  })

  it('cache 命中率低：仍渲染缓存段（颜色通道走 dim）', () => {
    const text = plain(glanceBarSegments(base({ cacheHitRate: 0.3 }))).join(' · ')
    expect(text).toContain('缓存 30%')
  })

  it('effort：model 段后追加 effort 段（◎ 前缀紧凑显示）', () => {
    const segs = plain(glanceBarSegments(base({ effort: 'max' }))).join(' · ')
    expect(segs).toContain('◎max')
    expect(segs).not.toContain('effort:')
    expect(segs.indexOf('deepseek-v4')).toBeLessThan(segs.indexOf('◎max'))
  })

  it('effort 缺省：不渲染 effort 段', () => {
    const text = plain(glanceBarSegments(base())).join(' · ')
    expect(text).not.toContain('effort')
  })

  it('tokens 缺省：不渲染 tokens 段', () => {
    const input = base()
    delete input.tokens
    const text = plain(glanceBarSegments(input)).join(' · ')
    expect(text).not.toContain('/')
  })

  it('ascii：tokens 用方括号档', () => {
    const text = plain(glanceBarSegments(base({ ascii: true }))).join(' · ')
    expect(text).toContain('[12.5k/200k]')
  })

  it('上下文段附带占用条（与百分比同段，剩余=空格）', () => {
    const segs = plain(glanceBarSegments(base({ contextRatio: 0.42 })))
    const ctx = segs.find(s => s.includes('上下文'))
    expect(ctx).toBe(`上下文 42% ${formatContextBar(0.42)}`)
    expect(ctx).toContain('▓')
    expect(ctx).toContain('░')
  })

  it('contextBar: false → 只留百分比，不画条', () => {
    const text = plain(glanceBarSegments(base({ contextBar: false }))).join(' · ')
    expect(text).toContain('上下文 42%')
    expect(text).not.toContain('▓')
    expect(text).not.toContain('░')
  })

  it('ascii：上下文条用 [=/-] 档', () => {
    const segs = plain(glanceBarSegments(base({ ascii: true, contextRatio: 0.5 })))
    const ctx = segs.find(s => s.includes('上下文'))
    expect(ctx).toBe(`上下文 50% ${formatContextBar(0.5, true)}`)
    expect(ctx).toContain('[====----]')
  })
})

describe('formatContextBar', () => {
  it('8 格；四舍五入；0% 全空、100% 全满', () => {
    expect(CONTEXT_BAR_CELLS).toBe(8)
    expect(formatContextBar(0)).toBe('░░░░░░░░')
    expect(formatContextBar(0.42)).toBe('▓▓▓░░░░░')
    expect(formatContextBar(1)).toBe('▓▓▓▓▓▓▓▓')
  })

  it('越界 ratio 夹紧到 [0, 1]', () => {
    expect(formatContextBar(-1)).toBe('░░░░░░░░')
    expect(formatContextBar(1.4)).toBe('▓▓▓▓▓▓▓▓')
  })

  it('ascii：[= 已用][- 剩余]', () => {
    expect(formatContextBar(0, true)).toBe('[--------]')
    expect(formatContextBar(0.5, true)).toBe('[====----]')
    expect(formatContextBar(1, true)).toBe('[========]')
  })
})

describe('formatGlanceBar', () => {
  it('空 metrics → 空行数组（live 区不占位）', () => {
    expect(formatGlanceBar({ width: 80 }, fakeTheme())).toEqual([])
  })

  it('完整 compact：单行 LiveRegionLine', () => {
    const [line] = formatGlanceBar(base(), fakeTheme())
    expect(line!.truncated).toBeUndefined()
    expect(plain([line!.text])[0]!).toContain('deepseek-v4')
    expect(displayWidth(line!.text)).toBeLessThanOrEqual(80)
  })

  it('窄宽：drop 尾部段（先掉耗时），仍不破版', () => {
    const [line] = formatGlanceBar(base({ width: 40 }), fakeTheme())
    const text = plain([line!.text])[0]
    expect(displayWidth(text!)).toBeLessThanOrEqual(40)
    expect(text).not.toContain('1m 5s')
  })

  it('极窄：只剩 model 段并截断，不破版', () => {
    const [line] = formatGlanceBar(base({ width: 8 }), fakeTheme())
    expect(displayWidth(line!.text)).toBeLessThanOrEqual(8)
  })

  it('窄于 effort 段：drop effort 保留 model（effort 最贴近 model 的附属段）', () => {
    const [line] = formatGlanceBar(base({ effort: 'max', width: 20 }), fakeTheme())
    const text = plain([line!.text])[0]
    expect(displayWidth(text!)).toBeLessThanOrEqual(20)
    expect(text).toContain('deepseek-v4')
    expect(text).not.toContain('effort')
  })

  it('width ≤ 0：防御返回空数组', () => {
    expect(formatGlanceBar({ width: 0, modelName: 'm' }, fakeTheme())).toEqual([])
  })

  it('width 缺省（undefined）→ 归一为 0 → 空数组', () => {
    expect(formatGlanceBar({ modelName: 'm' }, fakeTheme())).toEqual([])
  })

  it('full + 停滞：宽度恰好只 drop 停滞标记', () => {
    const input = base({ stalled: true, density: 'full', turnCount: 7, cost: 0.42, width: 75 })
    const [line] = formatGlanceBar(input, fakeTheme())
    const text = plain([line!.text])[0]!
    expect(displayWidth(line!.text)).toBeLessThanOrEqual(75)
    expect(text).not.toContain('停滞')
    expect(text).toContain('$0.42')
  })

  it('full：宽度只 drop 到 cost 之后（保留 #turn）', () => {
    // 占用条约占 9 列，阈值随段变宽右移（原 58）。
    const input = base({ density: 'full', turnCount: 7, cost: 0.42, width: 67 })
    const [line] = formatGlanceBar(input, fakeTheme())
    const text = plain([line!.text])[0]!
    expect(displayWidth(line!.text)).toBeLessThanOrEqual(67)
    expect(text).not.toContain('$0.42')
    expect(text).toContain('#7')
  })

  it('full：宽度只 drop 到 turnCount 之后（保留 tokens）', () => {
    const input = base({ density: 'full', turnCount: 7, cost: 0.42, width: 61 })
    const [line] = formatGlanceBar(input, fakeTheme())
    const text = plain([line!.text])[0]!
    expect(displayWidth(line!.text)).toBeLessThanOrEqual(61)
    expect(text).not.toContain('#7')
    expect(text).toContain('◧ 12.5k/200k')
  })

  it('中等窄宽：先摘占用条、保留「上下文 N%」', () => {
    const wide = formatGlanceBar(base({ width: 200 }), fakeTheme())
    const wideText = plain([wide[0]!.text])[0]!
    expect(wideText).toContain(formatContextBar(0.42))
    // model+cache+百分比+条 ≈ 44 列；去掉条 ≈ 35。40 落在两档之间。
    const mid = formatGlanceBar(base({ width: 40 }), fakeTheme())
    const midText = plain([mid[0]!.text])[0]!
    expect(displayWidth(mid[0]!.text)).toBeLessThanOrEqual(40)
    expect(midText).toContain('上下文 42%')
    expect(midText).not.toContain('▓')
    expect(midText).not.toContain('░')
  })
})

describe('hideSegments（prefs.glance.hideSegments 透传）', () => {
  const full = { modelName: 'm1', effort: 'high', cacheHitRate: 0.5, contextRatio: 0.3, tokens: { used: 100, max: 200 }, elapsedMs: 61_000, cost: 0.42, density: 'full' as const, turnCount: 7 }

  it('隐藏段不参与拼接（其余段原样）', () => {
    const segs = glanceBarSegments({ ...full, hideSegments: ['cost', 'cache', 'effort'] })
    expect(segs.join(' ')).not.toContain('$0.42')
    expect(segs.join(' ')).not.toContain('缓存')
    expect(segs.join(' ')).not.toContain('◎high')
    expect(segs.join(' ')).toContain('m1')
    expect(segs.join(' ')).toContain('◧ 100/200')
  })

  it('隐藏 context 时占用条一并消失', () => {
    const segs = glanceBarSegments({ ...full, hideSegments: ['context'] })
    expect(segs.join(' ')).not.toContain('上下文')
    expect(segs.join(' ')).not.toContain('▓')
    expect(segs.join(' ')).not.toContain('░')
  })

  it('model 与 stalled 不受隐藏影响（永不可隐藏）', () => {
    const segs = glanceBarSegments({ ...full, hideSegments: ['model', 'stalled', 'nope'] })
    expect(segs.join(' ')).toContain('m1')
    const segs2 = glanceBarSegments({ ...full, stalled: true, hideSegments: ['stalled'] })
    expect(segs2.join(' ')).toContain('停滞')
  })

  it('formatGlanceBar 全链：隐藏 cost 后极宽也不出现 $ 段', () => {
    const [line] = formatGlanceBar({ ...full, width: 120, hideSegments: ['cost'] }, fakeTheme())
    const text = plain([line!.text])[0]!
    expect(text).not.toContain('$0.42')
    expect(text).toContain('#7')
  })
})
