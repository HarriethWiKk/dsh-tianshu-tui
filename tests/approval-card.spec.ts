/**
 * 审批卡纯渲染：圆角轨、动态键位行（动作表投影段）、反馈提示行、
 * compact 省略 diff、宽度守恒。
 */
import { describe, expect, it } from 'vitest'
import type { RivetTheme } from '../src/theme.js'
import { displayWidth } from '../src/width.js'
import {
  approvalKeyHintLine,
  formatApprovalCard,
  formatRailsBlock,
} from '../src/format/approval-card.js'

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

describe('approvalKeyHintLine', () => {
  it('提示段首 token 加方括号；无空格段整段加括号', () => {
    expect(approvalKeyHintLine(['y 允许', 'p 此命令不再问', 'esc 取消'])).toBe(
      '[y] 允许 [p] 此命令不再问 [esc] 取消')
    expect(approvalKeyHintLine(['y', 'n 拒绝'])).toBe('[y] [n] 拒绝')
  })
})

describe('formatApprovalCard', () => {
  it('圆角轨 + 允许执行 + 键位；无 diff 标盲批', () => {
    const rows = plain(formatApprovalCard({ columns: 60, toolName: 'bash', reason: 'sandbox' }, fakeTheme()))
    expect(rows[0]).toMatch(/^╭─ 审批 · bash ─+╮$/)
    expect(rows.join('\n')).toContain('允许执行 bash？（sandbox）（diff 不可见）')
    expect(rows.join('\n')).toContain('[y] 允许')
    expect(rows.at(-1)).toMatch(/^╰─+╯$/)
  })

  it('键位行由投影段动态生成：无前缀可提时无 p 段，有则含 [p] 此命令不再问', () => {
    const without = plain(formatApprovalCard({
      columns: 120,
      toolName: 'bash',
      keyHintSegments: ['y 允许', 't 记住此工具', 'a 全放行', 'n 拒绝', 'f 拒绝并说明', 'esc 取消'],
    }, fakeTheme())).join('\n')
    expect(without).not.toContain('[p]')
    expect(without).toContain('[f] 拒绝并说明')

    const withPrefix = plain(formatApprovalCard({
      columns: 120,
      toolName: 'bash',
      keyHintSegments: ['y 允许', 'p 此命令不再问', 't 记住此工具', 'a 全放行', 'n 拒绝', 'f 拒绝并说明', 'esc 取消'],
    }, fakeTheme())).join('\n')
    expect(withPrefix).toContain('[p] 此命令不再问')
  })

  it('反馈输入态：键位行下追加反馈提示行', () => {
    const rows = plain(formatApprovalCard({ columns: 80, toolName: 'bash', feedback: true }, fakeTheme()))
    const text = rows.join('\n')
    expect(text).toContain('📝 说明拒绝原因')
    expect(text.indexOf('📝 说明拒绝原因')).toBeGreaterThan(text.indexOf('[y] 允许'))
  })

  it('有 diff：正文出现在提示与键位之间', () => {
    const rows = plain(formatApprovalCard({
      columns: 60,
      toolName: 'write_file',
      diffLines: ['+ hello', '- world'],
    }, fakeTheme()))
    const text = rows.join('\n')
    expect(text).toContain('+ hello')
    expect(text).not.toContain('diff 不可见')
    expect(text.indexOf('+ hello')).toBeGreaterThan(text.indexOf('允许执行'))
    expect(text.indexOf('[y] 允许')).toBeGreaterThan(text.indexOf('+ hello'))
  })

  it('compact：省略 diff 体，仍保留键位', () => {
    const rows = plain(formatApprovalCard({
      columns: 60,
      toolName: 'write_file',
      diffLines: ['+ hello'],
      compact: true,
    }, fakeTheme()))
    expect(rows.join('\n')).not.toContain('+ hello')
    expect(rows.join('\n')).toContain('[y] 允许')
  })

  it('columns < 4：不画轨', () => {
    const rows = plain(formatApprovalCard({ columns: 3, toolName: 'bash' }, fakeTheme()))
    expect(rows.join('\n')).not.toContain('╭')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('宽度守恒', () => {
    for (const columns of [80, 40, 20, 8, 3]) {
      const lines = formatApprovalCard({
        columns,
        toolName: 'str_replace_editor',
        diffLines: ['+ ' + 'x'.repeat(100)],
      }, fakeTheme())
      for (const line of lines) expect(displayWidth(line)).toBeLessThanOrEqual(Math.max(0, columns))
    }
  })
})

describe('formatRailsBlock', () => {
  it('空标题：顶轨仍铺满 columns', () => {
    const rows = plain(formatRailsBlock(20, '', ['hi'], '#fff'))
    expect(displayWidth(rows[0]!)).toBe(20)
    expect(rows).toHaveLength(3)
  })
})
