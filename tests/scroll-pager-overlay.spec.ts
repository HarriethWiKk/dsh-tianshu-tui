/**
 * scroll-pager-overlay — /scroll 分页查看器（scrollback-transcript 消费端）。
 *
 * 覆盖：内容解析与扁平化、滚动钳制、搜索与 n/N 跳转、渲染窗口化与
 * 当前匹配高亮、键位路由（含 Esc 关闭请求）。
 */
import { describe, expect, it } from 'vitest'
import { ScrollPagerOverlay } from '../src/format/scroll-pager-overlay.js'

/** 去 ANSI 后的渲染行。 */
function plain(rows: string[]): string[] {
  return rows.map(l => l.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, ''))
}

/** 构造有稳定角色标记的 transcript 文本（每条消息 3 行）。 */
function sampleContent(): string {
  return [
    '▌ user question',
    '  second line',
    '',
    '› tool ok',
    '  result body',
    '',
    'assistant prose one',
    'assistant prose two',
  ].join('\n')
}

describe('ScrollPagerOverlay · 内容与扁平化', () => {
  it('setContent 解析消息并按逻辑行扁平化', () => {
    const pager = new ScrollPagerOverlay()
    pager.setContent(sampleContent())
    const rows = pager.render(80, 20)
    const p = plain(rows)
    // 搜索栏 + 全部 8 行 + 提示行
    expect(p.some(l => l.includes('▌ user question'))).toBe(true)
    expect(p.some(l => l.includes('assistant prose two'))).toBe(true)
  })

  it('空内容渲染出空态提示不抛错', () => {
    const pager = new ScrollPagerOverlay()
    pager.setContent('  \n  ')
    expect(() => pager.render(80, 10)).not.toThrow()
    expect(pager.matchCount()).toBe(0)
  })
})

describe('ScrollPagerOverlay · 滚动', () => {
  function tallPager(lines = 30): ScrollPagerOverlay {
    const pager = new ScrollPagerOverlay()
    pager.setContent(Array.from({ length: lines }, (_, i) => `line ${i + 1}`).join('\n'))
    return pager
  }

  it('scrollDown 到底钳制；scrollUp 到顶钳制', () => {
    const pager = tallPager()
    pager.render(80, 10) // bodyHeight = 8，maxScroll = 22
    pager.scrollDown(100) // 底部视窗：line 23-30
    expect(plain(pager.render(80, 10)).some(l => l.trimEnd() === '  line 23')).toBe(true)
    pager.scrollUp(100) // 顶部视窗：line 1-8
    const p = plain(pager.render(80, 10))
    expect(p.some(l => l.trimEnd() === '  line 1')).toBe(true)
    expect(p.some(l => l.trimEnd() === '  line 23')).toBe(false)
  })

  it('pageDown/pageUp 按可视高度翻页；g/G 首尾', () => {
    const pager = tallPager()
    pager.render(80, 10)
    pager.pageDown()
    let p = plain(pager.render(80, 10))
    expect(p.some(l => l.includes('line 9'))).toBe(true)
    pager.toBottom()
    p = plain(pager.render(80, 10))
    expect(p.some(l => l.includes('line 30'))).toBe(true)
    pager.toTop()
    p = plain(pager.render(80, 10))
    expect(p.some(l => l.trimEnd() === '  line 1')).toBe(true)
  })
})

describe('ScrollPagerOverlay · 搜索与跳转', () => {
  it('输入即搜索；n/N 循环跳转并滚动到目标', () => {
    const pager = new ScrollPagerOverlay()
    pager.setContent(['▌ q1 alpha', 'x', '› t alpha', 'y', 'beta tail'].join('\n'))
    pager.type('a')
    pager.type('l')
    pager.type('p')
    pager.type('h')
    pager.type('a')
    expect(pager.matchCount()).toBe(2)
    // 首匹配跳到第一条 alpha（视窗顶贴住消息首行）
    let p = plain(pager.render(80, 6))
    expect(p[1]?.includes('▌ q1 alpha')).toBe(true)
    pager.goNext()
    p = plain(pager.render(80, 6))
    expect(p.some(l => l.includes('› t alpha'))).toBe(true)
    // 回绕到第一条
    pager.goNext()
    p = plain(pager.render(80, 6))
    expect(p[1]?.includes('▌ q1 alpha')).toBe(true)
    pager.goPrev()
    p = plain(pager.render(80, 6))
    expect(p.some(l => l.includes('› t alpha'))).toBe(true)
  })

  it('当前匹配消息高亮为 ▸ 前缀', () => {
    const pager = new ScrollPagerOverlay()
    pager.setContent(['▌ hit one', 'filler', 'other', 'hit two here'].join('\n'))
    pager.type('hit')
    const p = plain(pager.render(80, 10))
    expect(p.some(l => l.startsWith('▸ ') && l.includes('▌ hit one'))).toBe(true)
  })

  it('backspace 修正查询；无匹配计数为 0', () => {
    const pager = new ScrollPagerOverlay()
    pager.setContent(['alpha only', 'beta here'].join('\n'))
    pager.type('a')
    pager.type('l')
    expect(pager.matchCount()).toBe(1)
    pager.backspace()
    pager.backspace()
    expect(pager.matchCount()).toBe(0)
  })
})

describe('ScrollPagerOverlay · 键位路由', () => {
  it('Esc/Ctrl+C 返回 close；其余键返回 handled 且生效', () => {
    const pager = new ScrollPagerOverlay()
    pager.setContent(['alpha', 'beta', 'gamma'].join('\n'))
    expect(pager.handleKey('escape', '')).toBe('close')
    expect(pager.handleKey('ctrl_c', '')).toBe('close')
    expect(pager.handleKey('down', '')).toBe('handled')
    expect(plain(pager.render(80, 6)).some(l => l.includes('beta'))).toBe(true)
    expect(pager.handleKey('g', 'g')).toBe('handled')
    expect(pager.handleKey('G', 'G')).toBe('handled')
    expect(pager.handleKey('unknown', 'x')).toBe('handled')
  })

  it('字符键进 query、backspace 退格、n/p 跳匹配', () => {
    const pager = new ScrollPagerOverlay()
    pager.setContent(['▌ hit a', 'mid', '› hit b'].join('\n'))
    pager.handleKey('unknown', 'h')
    pager.handleKey('unknown', 'i')
    pager.handleKey('unknown', 't')
    expect(pager.matchCount()).toBe(2)
    expect(pager.handleKey('backspace', '')).toBe('handled')
    pager.handleKey('unknown', 't')
    expect(pager.matchCount()).toBe(2)
    expect(pager.handleKey('unknown', 'n')).toBe('handled')
  })
})

describe('ScrollPagerOverlay · 关闭清理', () => {
  it('onDeactivate 清搜索态；内容与滚动位置保留', () => {
    const pager = new ScrollPagerOverlay()
    pager.setContent(['alpha', 'beta'].join('\n'))
    pager.type('a')
    pager.scrollDown(1)
    pager.onDeactivate()
    expect(pager.matchCount()).toBe(0)
    const p = plain(pager.render(80, 6))
    expect(p.some(l => l.includes('alpha'))).toBe(true)
  })
})
