/**
 * 底部 footer（format/prompt-footer.ts）— 纯渲染契约测试（C4 概念稿 C 三行底部区）。
 *
 * - 模式 badge 段（normal / [plan] / [plan…] / [auto]）在前，快捷键提示在后。
 * - 窄宽从后往前丢段（ctrl+p → / 命令 → mode），mode 恒保留。
 * - 宽度守恒：任何输入下每行显示宽度 ≤ width。
 */

import { describe, expect, it } from 'vitest'
import type { RivetTheme } from '../src/theme.js'
import { displayWidth } from '../src/width.js'
import { formatPromptFooter, formatFooterInfo, footerTipForIndex, footerTipIndex, FOOTER_TIP_ROTATE_MS, type FormatPromptFooterInput, type FormatFooterInfoInput } from '../src/format/prompt-footer.js'

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

function base(over: Partial<FormatPromptFooterInput> = {}): FormatPromptFooterInput {
  // tipIndex 0 固定为第一条轮播提示（'/ 命令 · ctrl+p 面板'）——测试确定性。
  return { width: 100, tipIndex: 0, ...over }
}

describe('formatPromptFooter', () => {
  it('默认：normal + 快捷键提示（/ 命令 ctrl+p，不含 Enter 发送）', () => {
    const [line = ''] = plain(formatPromptFooter(base(), fakeTheme()))
    expect(line).toContain('normal')
    expect(line).not.toContain('Enter 发送')
    expect(line).toContain('/ 命令')
    expect(line).toContain('ctrl+p')
  })

  it('planActive：mode 段含 [plan]', () => {
    const [line = ''] = plain(formatPromptFooter(base({ planActive: true }), fakeTheme()))
    expect(line).toContain('normal [plan]')
  })

  it('planPending：mode 段含 [plan…]（优先于 planActive）', () => {
    const [line = ''] = plain(formatPromptFooter(base({ planActive: true, planPending: true }), fakeTheme()))
    expect(line).toContain('[plan…]')
    expect(line).not.toContain('[plan] ·')
  })

  it('approvalPending：快捷键换成审批决策键位（y/p/t/a/n/f/esc）', () => {
    const [line = ''] = plain(formatPromptFooter(base({ approvalPending: true, width: 120 }), fakeTheme()))
    expect(line).toContain('y 允许')
    expect(line).toContain('n 拒绝')
    expect(line).toContain('a 全放行')
    expect(line).toContain('f 拒绝并说明')
    expect(line).not.toContain('Enter 发送')
  })

  it('宽度守恒：任意宽度下每行显示宽度 ≤ width', () => {
    for (const width of [100, 80, 60, 40, 20]) {
      const lines = formatPromptFooter(base({ width }), fakeTheme())
      for (const line of lines) {
        expect(displayWidth(line)).toBeLessThanOrEqual(width)
      }
    }
  })

  it('窄宽丢段：mode 恒保留，轮播提示整条丢弃', () => {
    // width 12：mode 段（normal=6）放得下，轮播提示整条丢弃
    const [line = ''] = plain(formatPromptFooter(base({ width: 12 }), fakeTheme()))
    expect(line).toContain('normal')
    expect(line).not.toContain('ctrl+p')
    // width 20：'/ 命令 · ctrl+p 面板' 14 列放不下（6+3+14=23>20）→ 丢弃
    const [mid = ''] = plain(formatPromptFooter(base({ width: 20 }), fakeTheme()))
    expect(mid).toContain('normal')
    expect(mid).not.toContain('ctrl+p')
    // 短提示（'shift+tab 模式循环' 18 列）放得下：6+3+18=27
    const shortIdx = Array.from({ length: 30 }, (_, i) => i).find(i => footerTipForIndex(i).includes('shift+tab'))
    if (shortIdx !== undefined) {
      const [short = ''] = plain(formatPromptFooter(base({ width: 27, tipIndex: shortIdx }), fakeTheme()))
      expect(short).toContain('shift+tab')
    }
  })

  it('极窄（mode 段也放不下）：退化为 mode 单段（mode 恒保留）', () => {
    const [line = ''] = plain(formatPromptFooter(base({ width: 5 }), fakeTheme()))
    expect(line).toBe('normal')
  })

  it('宽终端：右侧状态段右对齐合并进同一行', () => {
    const [line = ''] = plain(formatPromptFooter(base({
      width: 100,
      rightSegments: ['12.3k', 'deepseek-chat', 'API ✓'],
    }), fakeTheme()))
    expect(line).toContain('normal')
    expect(line).toContain('deepseek-chat')
    expect(line).toContain('API ✓')
    // 左侧在前、右侧在后（右对齐）
    expect(line.indexOf('normal')).toBeLessThan(line.indexOf('deepseek-chat'))
    expect(displayWidth(line)).toBe(100)
  })

  it('右侧段放不下：从后往前丢段，末尾段先丢', () => {
    // 左段 'normal · / 命令 · ctrl+p 面板' 29 列；width 46 → 右段可用 17 列，
    // 'AA · BB · CC · DD'（17 列）恰好放下，EE 起全部丢弃
    const [narrow = ''] = plain(formatPromptFooter(base({
      width: 46,
      rightSegments: ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH', 'II', 'JJ', 'KK'],
    }), fakeTheme()))
    expect(narrow).toContain('normal')
    expect(narrow).toContain('AA')
    expect(narrow).toContain('DD')
    expect(narrow).not.toContain('EE')
    expect(narrow).not.toContain('KK')
  })

  it('任意宽度：右侧段合并进同一行，不另起第二行', () => {
    const lines = formatPromptFooter(base({
      width: 79,
      rightSegments: ['deepseek-chat', 'effort:high'],
    }), fakeTheme())
    expect(lines).toHaveLength(1)
    const [line = ''] = plain(lines)
    expect(line).toContain('normal')
    expect(line).toContain('deepseek-chat')
    expect(displayWidth(lines[0] ?? '')).toBe(79)
  })

  it('窄宽仍从右丢段，左侧与右侧同处一行', () => {
    // width 38 → 左 29 + 右全 12 超出 → 恰丢 CC 留 AA·BB（任意宽度仍同行合并）
    const lines = formatPromptFooter(base({
      width: 38,
      rightSegments: ['AA', 'BB', 'CC'],
    }), fakeTheme())
    expect(lines).toHaveLength(1)
    const [line = ''] = plain(lines)
    expect(line).toContain('normal')
    expect(line).toContain('AA')
    expect(line).not.toContain('CC')
  })

  it('右侧段恰好填满：pad=0 仍合并，不丢末段', () => {
    // 新 hint 集下左侧满档 29 列；width 41 → 右段 12 列恰好 pad=0 合并。
    const [line = ''] = plain(formatPromptFooter(base({
      width: 41,
      rightSegments: ['xxxxxxxxxxxx'],
    }), fakeTheme()))
    expect(line).toContain('normal')
    expect(line).toContain('xxxxxxxxxxxx')
    expect(displayWidth(formatPromptFooter(base({
      width: 41,
      rightSegments: ['xxxxxxxxxxxx'],
    }), fakeTheme())[0] ?? '')).toBe(41)
  })

  it('inspectOpen：快捷键换成 esc 关闭', () => {
    const [line = ''] = plain(formatPromptFooter(base({ inspectOpen: true }), fakeTheme()))
    expect(line).toContain('esc 关闭')
    expect(line).toContain('/ 命令')
    expect(line).not.toContain('ctrl+p')
  })

  it('空右侧段：与缺省行为一致', () => {
    const [line = ''] = plain(formatPromptFooter(base({ width: 100, rightSegments: [] }), fakeTheme()))
    expect(line).toContain('normal')
    expect(line).toContain('/ 命令')
  })

  it('雾蓝 chrome：mode 用 inactiveShimmer，提示用 subtle', () => {
    const [line = ''] = formatPromptFooter(base(), fakeTheme())
    expect(line).toContain('\x1B[38;2;170;178;194m')
    expect(line).toContain('\x1B[38;2;94;102;115m')
    expect(line).not.toContain('\x1B[38;2;17;17;17m')
  })
})

describe('formatFooterInfo（分层 footer：行 1 状态行 + 行 2 指标行）', () => {
  const metrics = {
    cacheHitRate: 0.82,
    contextRatio: 0.42,
    tokens: { used: 12_500, max: 200_000 },
    elapsedMs: 65_000,
    cost: 0.42,
    turnCount: 7,
    density: 'full' as const,
  }

  function infoBase(over: Partial<FormatFooterInfoInput> = {}): FormatFooterInfoInput {
    return { width: 100, ...over }
  }

  it('full：两行——行 1 状态（mode + 右段），行 2 指标（上下文/tokens/cost）', () => {
    const lines = plain(formatFooterInfo(infoBase({ rightSegments: ['PTC', 'deepseek-v4', 'API ✓'], metrics }), fakeTheme()))
    expect(lines.length).toBe(2)
    expect(lines[0]).toContain('normal')
    expect(lines[0]).toContain('PTC')
    expect(lines[0]).toContain('deepseek-v4')
    expect(lines[0]).toContain('API ✓')
    expect(lines[1]).toContain('上下文 42%')
    expect(lines[1]).toContain('#7')
    expect(lines[1]).toContain('$0.42')
    expect(lines[1]).not.toContain('PTC')
    expect(lines[1]).not.toContain('deepseek-v4')
  })

  it('compact：仅行 1 状态行，无指标行', () => {
    const lines = plain(formatFooterInfo(infoBase({ level: 'compact', rightSegments: ['PTC', 'API ✓'], metrics }), fakeTheme()))
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('normal')
    expect(lines[0]).toContain('PTC')
    expect(lines[0]).toContain('API ✓')
    expect(lines[0]).not.toContain('上下文')
  })

  it('off：空（输入轨下方无 footer）', () => {
    expect(formatFooterInfo(infoBase({ level: 'off', rightSegments: ['API ✓'], metrics }), fakeTheme())).toEqual([])
  })

  it('metrics 缺省或空时不渲染行 2（等效 compact）', () => {
    expect(formatFooterInfo(infoBase({ rightSegments: ['API ✓'] }), fakeTheme()).length).toBe(1)
  })

  it('任何档位下行宽 ≤ width', () => {
    for (const level of ['full', 'compact', 'off'] as const) {
      for (const line of formatFooterInfo(infoBase({ level, rightSegments: ['PTC', 'deepseek-v4', 'API ✓', '●3'], metrics }), fakeTheme())) {
        expect(displayWidth(plain([line])[0]!)).toBeLessThanOrEqual(100)
      }
    }
  })
})

describe('footer 提示轮播（10s 一片，kimi-code tips 语义）', () => {
  it('footerTipForIndex 确定性且权重展开（高权重条目出现更多次）', () => {
    // 权重展开：/ 命令 · ctrl+p 面板 weight 3 → 序列中占 3 个槽
    expect(footerTipForIndex(0)).toBe('/ 命令 · ctrl+p 面板')
    expect(footerTipForIndex(1)).toBe('/ 命令 · ctrl+p 面板')
    expect(footerTipForIndex(2)).toBe('/ 命令 · ctrl+p 面板')
    // 循环取模：回到序列首
    const n = Array.from({ length: 40 }, (_, i) => i).filter(i => footerTipForIndex(i) === '/ 命令 · ctrl+p 面板').length
    expect(n).toBeGreaterThanOrEqual(6) // 40 槽中至少 6 次（w3/14 ≈ 8.6 次，容差）
  })

  it('footerTipIndex 按 10s 分片，同一片内稳定', () => {
    const t0 = 1_700_000_000_000
    expect(footerTipIndex(t0)).toBe(footerTipIndex(t0 + 9_999))
    expect(footerTipIndex(t0 + 10_000)).toBe(footerTipIndex(t0) + 1)
    expect(FOOTER_TIP_ROTATE_MS).toBe(10_000)
  })

  it('空闲态提示随 tipIndex 轮播（不同序号不同文本）', () => {
    const seq = Array.from({ length: 30 }, (_, i) => i)
    const texts = new Set(seq.map(i => plain(formatPromptFooter(base({ tipIndex: i }), fakeTheme()))[0]!))
    expect(texts.size).toBeGreaterThan(3) // 轮播表多条被取到
  })

  it('上下文态优先：approvalPending / inspectOpen 忽略 tipIndex 不轮播', () => {
    for (const i of [0, 5, 9]) {
      const [approval = ''] = plain(formatPromptFooter(base({ tipIndex: i, approvalPending: true }), fakeTheme()))
      expect(approval).toContain('y 允许')
      expect(approval).toContain('n 拒绝')
      const [inspect = ''] = plain(formatPromptFooter(base({ tipIndex: i, inspectOpen: true }), fakeTheme()))
      expect(inspect).toContain('esc 关闭')
      expect(inspect).toContain('/ 命令')
    }
  })

  it('缺省 tipIndex 走当前时间分片（可发现性：新功能 tip 会周期性出现）', () => {
    // 采样 14 个连续时间片（每个 10s）：覆盖权重展开序列的全部槽位
    const samples = new Set<string>()
    for (let i = 0; i < 14; i++) {
      const [line = ''] = plain(formatPromptFooter(base({ tipIndex: footerTipIndex(i * FOOTER_TIP_ROTATE_MS) }), fakeTheme()))
      samples.add(line)
    }
    expect(samples.size).toBeGreaterThan(8)
  })
})
