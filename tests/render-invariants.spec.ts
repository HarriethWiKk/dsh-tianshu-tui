/**
 * render-invariants.spec.ts — 不变量式渲染测试示范（共享 helper 见 tests/helpers/ansi.ts）。
 *
 * 三个技法（上游 format-welcome.test.ts / engine-live.test.ts 模式）：
 * 1. 跨宽度守恒：对代表性宽度档（窄→宽）逐档断言每行 displayWidth ≤ 可用宽——
 *    不依赖具体截断策略，策略改动只要守恒就不碎。
 * 2. 主题推导颜色基准：断言渲染行含 `firstFg(color('x', theme.token))` 采样出的
 *    SGR——「用了主题哪个 token」而非硬编码色值。
 * 3. 相对结构断言：stripSgr 后断言相对位置（首末行、段包含），不锚定行号。
 *
 * 新 format/ 渲染器的测试建议沿用本文件模式，替代逐快照。
 */
import { describe, expect, it } from 'vitest'
import type { RivetTheme } from '../src/theme.js'
import { color } from '../src/engine/ansi.js'
import { formatInputFrame } from '../src/format/input-frame.js'
import { formatSlashMenu } from '../src/format/slash-menu.js'
import { formatGlanceBar } from '../src/format/glance-bar.js'
import { firstFg, linesFitWidth, stripSgr } from './helpers/ansi.js'

const WIDTHS = [20, 48, 80, 120, 200]

function fakeTheme(): RivetTheme {
  return {
    primary: '#111111', secondary: '#222222', success: '#333333',
    warning: '#444444', error: '#555555', dim: '#666666', muted: '#777777',
    pulseQuiet: '#888888', pulseActive: '#999999', pulseAlert: '#aaaaaa',
    userColor: '#bbbbbb', assistantColor: '#cccccc', systemColor: '#dddddd',
    brandColor: '#eeeeee', toolColor: () => '#000000', contextColor: () => '#000000',
  }
}

describe('formatInputFrame 不变量', () => {
  it('跨宽度守恒：任何宽度档下轨线与输入行都 ≤ columns', () => {
    const theme = fakeTheme()
    for (const columns of WIDTHS) {
      const out = formatInputFrame({
        columns,
        lines: ['❯ 你好 world', '❯ 长'.repeat(Math.max(1, Math.floor(columns / 4)))],
        caretLine: 0,
        caretCol: 2,
      }, theme)
      expect(linesFitWidth(out.lines, columns), `columns=${columns}`).toBe(true)
    }
  })

  it('plan 模式轨线用主题 warning token（颜色基准从主题采样，不硬编码）', () => {
    const theme = fakeTheme()
    const warningFg = firstFg(color('x', theme.warning))
    expect(warningFg).not.toBeNull()
    const out = formatInputFrame({ columns: 40, lines: ['❯ x'], caretLine: 0, caretCol: 0, planActive: true }, theme)
    expect(out.lines[0]).toContain(warningFg!)
  })

  it('相对结构：首行顶轨、末行底轨（stripSgr 后 ╭…╮ / ╰…╯）', () => {
    const out = formatInputFrame({ columns: 30, lines: ['❯ x'], caretLine: 0, caretCol: 0 }, fakeTheme())
    const first = stripSgr(out.lines[0] ?? '')
    const last = stripSgr(out.lines[out.lines.length - 1] ?? '')
    expect(first.startsWith('╭') && first.endsWith('╮')).toBe(true)
    expect(last.startsWith('╰') && last.endsWith('╯')).toBe(true)
  })
})

describe('formatGlanceBar 不变量', () => {
  const metrics = {
    modelName: 'deepseek-v4',
    effort: 'high',
    cacheHitRate: 0.5,
    contextRatio: 0.3,
    tokens: { used: 12500, max: 200000 },
    elapsedMs: 61_000,
    cost: 0.42,
  }

  it('跨宽度守恒：渐进 drop 次要段，任何档位单行 ≤ width（极窄截断 model）', () => {
    for (const width of WIDTHS) {
      const lines = formatGlanceBar({ ...metrics, width }, fakeTheme())
      expect(lines.length, `width=${width}`).toBeLessThanOrEqual(1)
      if (lines.length === 1) {
        expect(linesFitWidth([lines[0]!.text], width), `width=${width}`).toBe(true)
      }
    }
  })

  it('model 段最后保留（极窄只剩截断的模型名，不空行）', () => {
    for (const width of WIDTHS) {
      const lines = formatGlanceBar({ ...metrics, width }, fakeTheme())
      const text = stripSgr(lines[0]?.text ?? '')
      expect(text, `width=${width}`).toContain('deepseek')
    }
  })
})

describe('formatSlashMenu 不变量', () => {
  const items = Array.from({ length: 20 }, (_, i) => ({
    name: `command-${i}`,
    description: `描述 ${i} — 中文与 emoji 🎯 混排说明文字`,
  }))

  it('跨宽度守恒：长菜单 + CJK/emoji 描述，任何档位每行 ≤ width', () => {
    for (const width of WIDTHS) {
      const lines = formatSlashMenu({ width, items, selected: 10 }, fakeTheme())
      expect(lines.length).toBeGreaterThan(0)
      expect(linesFitWidth(lines, width), `width=${width}`).toBe(true)
    }
  })

  it('选中行 label 用主题 primary（基准从主题采样）', () => {
    const theme = fakeTheme()
    const primaryFg = firstFg(color('x', theme.primary))
    expect(primaryFg).not.toBeNull()
    const lines = formatSlashMenu({ width: 80, items: items.slice(0, 3), selected: 0 }, theme)
    const selectedLine = lines[0] ?? ''
    expect(selectedLine).toContain(primaryFg!)
  })

  it('滚动窗口：selected 超出 maxRows 时保持可见（相对结构）', () => {
    const lines = formatSlashMenu({ width: 80, items, selected: 15, maxRows: 5 }, fakeTheme())
    const texts = lines.map(l => stripSgr(l))
    expect(texts.some(t => t.includes('command-15'))).toBe(true)
    expect(texts.some(t => t.includes('command-0'))).toBe(false) // 窗口外
  })
})
