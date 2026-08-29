/**
 * C2 项 2：历史搜索 overlay — RED 基线。
 *
 * 覆盖：
 * - type 累积 query + 实时搜索（smart-case：含大写 → 精确，否则不敏感）
 * - goNext/goPrev 循环跳转
 * - backspace 退格重算
 * - 空 query 无匹配
 * - render：搜索栏 + 匹配计数 N/M + key hints
 */

import { describe, expect, it } from 'vitest'
import { HistorySearchOverlay } from '../src/format/history-search-overlay.js'
import { getTheme } from '../src/theme.js'

function msg(_id: number, text: string): { text: string } {
  return { text }
}

const MESSAGES = [
  msg(0, 'Hello World'),
  msg(1, 'the quick brown fox'),
  msg(2, 'HELLO uppercase'),
  msg(3, 'another line'),
  msg(4, 'world end'),
]

describe('HistorySearchOverlay — 搜索状态（C2 项 2）', () => {
  it('type 累积 query 并实时搜索（大小写不敏感）', () => {
    const overlay = new HistorySearchOverlay()
    overlay.setMessages(MESSAGES)
    overlay.type('world')
    expect(overlay.matchCount()).toBe(2) // 0: Hello World, 4: world end
  })

  it('smart-case：查询含大写 → 精确匹配（HELLO 不匹配 hello）', () => {
    const overlay = new HistorySearchOverlay()
    overlay.setMessages(MESSAGES)
    overlay.type('HELLO')
    expect(overlay.matchCount()).toBe(1) // 仅 2: HELLO uppercase
    const idx = overlay.currentIndex()
    expect(idx).toBe(2)
  })

  it('goNext/goPrev 循环跳转', () => {
    const overlay = new HistorySearchOverlay()
    overlay.setMessages(MESSAGES)
    overlay.type('world')
    expect(overlay.currentIndex()).toBe(0)
    overlay.goNext()
    expect(overlay.currentIndex()).toBe(4)
    overlay.goNext() // 循环回第一个
    expect(overlay.currentIndex()).toBe(0)
    overlay.goPrev() // 循环回最后一个
    expect(overlay.currentIndex()).toBe(4)
  })

  it('backspace 退格重算', () => {
    const overlay = new HistorySearchOverlay()
    overlay.setMessages(MESSAGES)
    overlay.type('world')
    overlay.type('x') // 无匹配
    expect(overlay.matchCount()).toBe(0)
    overlay.backspace()
    expect(overlay.matchCount()).toBe(2)
  })

  it('空 query 无匹配', () => {
    const overlay = new HistorySearchOverlay()
    overlay.setMessages(MESSAGES)
    expect(overlay.matchCount()).toBe(0)
    expect(overlay.currentIndex()).toBe(-1)
  })

  it('无匹配时 goNext 不移动', () => {
    const overlay = new HistorySearchOverlay()
    overlay.setMessages(MESSAGES)
    overlay.type('nonexistent')
    overlay.goNext()
    expect(overlay.currentIndex()).toBe(-1)
  })

  it('无匹配时 goPrev 不移动', () => {
    const overlay = new HistorySearchOverlay()
    overlay.setMessages(MESSAGES)
    overlay.type('nonexistent')
    overlay.goPrev()
    expect(overlay.currentIndex()).toBe(-1)
  })
})

describe('HistorySearchOverlay — 渲染（C2 项 2）', () => {
  it('渲染搜索栏（query + 当前/总数计数）与 hints', () => {
    const overlay = new HistorySearchOverlay()
    overlay.setMessages(MESSAGES)
    overlay.type('world')
    const rows = overlay.render(80, 24)
    const text = rows.join('\n')
    expect(text).toContain('world')
    expect(text).toContain('1/2') // 当前第 1 个 / 共 2 个
    expect(text).toContain('n/N')
    expect(text).toContain('Esc')
  })

  it('空 query 渲染提示', () => {
    const overlay = new HistorySearchOverlay()
    overlay.setMessages(MESSAGES)
    const rows = overlay.render(80, 24)
    const text = rows.join('\n')
    expect(text).toContain('输入关键词搜索会话历史')
  })

  it('渲染包含匹配消息内容（当前匹配居中可见；命中词反色高亮 #55-A2）', () => {
    const overlay = new HistorySearchOverlay()
    overlay.setMessages(MESSAGES)
    overlay.type('HELLO')
    const rows = overlay.render(80, 24)
    const text = rows.join('\n')
    expect(text).toContain('\x1B[7mHELLO\x1B[0m') // 命中词反色
    expect(text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')).toContain('HELLO uppercase')
  })

  it('clear 清空查询与匹配', () => {
    const overlay = new HistorySearchOverlay()
    overlay.setMessages(MESSAGES)
    overlay.type('world')
    expect(overlay.matchCount()).toBe(2)
    overlay.clear()
    expect(overlay.matchCount()).toBe(0)
    expect(overlay.currentIndex()).toBe(-1)
  })

  it('onDeactivate 清空状态（overlay 关闭语义）', () => {
    const overlay = new HistorySearchOverlay()
    overlay.setMessages(MESSAGES)
    overlay.type('world')
    overlay.onDeactivate()
    expect(overlay.matchCount()).toBe(0)
    expect(overlay.currentIndex()).toBe(-1)
  })

  it('空 text 消息渲染 (空消息) 占位', () => {
    const overlay = new HistorySearchOverlay()
    overlay.setMessages([{ text: '' }])
    const rows = overlay.render(80, 24)
    expect(rows.join('\n')).toContain('空消息')
  })

  it('显式传入 theme 构造（constructor theme 分支）', () => {
    const overlay = new HistorySearchOverlay(getTheme(1))
    overlay.setMessages(MESSAGES)
    overlay.type('world')
    expect(overlay.matchCount()).toBe(2)
  })

  it('无匹配时 render：搜索栏无计数（counter 空分支）', () => {
    const overlay = new HistorySearchOverlay()
    overlay.setMessages(MESSAGES)
    overlay.type('nonexistent')
    const rows = overlay.render(80, 24)
    const text = rows.join('\n')
    expect(text).toContain('nonexistent')
    expect(text).not.toMatch(/\d+\/\d+/) // 无 N/M 计数
  })

  it('小高度 render：消息区被 bodyHeight 截断', () => {
    const overlay = new HistorySearchOverlay()
    overlay.setMessages(MESSAGES)
    const rows = overlay.render(80, 3) // bodyHeight = 1：搜索栏 + 1 行消息 + hints
    expect(rows.length).toBe(3)
    expect(rows[1]).toContain('Hello World')
  })

  it('空消息集 render：消息区不渲染（for 条件首轮即退出）', () => {
    const overlay = new HistorySearchOverlay()
    overlay.setMessages([])
    const rows = overlay.render(80, 24)
    expect(rows.length).toBe(2) // 搜索栏 + hints
    expect(rows.join('\n')).toContain('输入关键词搜索会话历史')
  })
})

describe('两阶段输入（#55：编辑段 n/N 不再被劫持）', () => {
  function bootOverlay(): { overlay: HistorySearchOverlay; hit: (k: string, c: string) => void } {
    const overlay = new HistorySearchOverlay()
    overlay.setMessages(MESSAGES)
    return { overlay, hit: (name, char) => { overlay.handleKey(name, char) } }
  }

  it('编辑段：n/N/p/P 是普通字符进 query（实时过滤照常）', () => {
    const { overlay, hit } = bootOverlay()
    hit('unknown', 'n')
    // 'n' 进 query 且命中（another line）——被劫持时这里 matchCount 恒 0
    expect(overlay.matchCount()).toBeGreaterThan(0)
    expect(overlay.isJumping()).toBe(false)
  })

  it('Enter 确认（有匹配）进跳转段：n/N 下一个、p/P 上一个', () => {
    const { overlay, hit } = bootOverlay()
    overlay.type('world')
    hit('return', '')
    expect(overlay.isJumping()).toBe(true)
    const first = overlay.currentIndex()
    hit('unknown', 'n')
    expect(overlay.currentIndex()).not.toBe(first)
    hit('unknown', 'p')
    expect(overlay.currentIndex()).toBe(first)
  })

  it('空 query / 无匹配时 Enter 不进跳转段', () => {
    const { overlay, hit } = bootOverlay()
    hit('return', '')
    expect(overlay.isJumping()).toBe(false)
    overlay.type('nonexistent')
    hit('return', '')
    expect(overlay.isJumping()).toBe(false)
  })

  it('跳转段可打印字符回编辑段续输；Enter 回编辑段；backspace 回编辑段并退格', () => {
    const { overlay, hit } = bootOverlay()
    overlay.type('world')
    hit('return', '')
    hit('unknown', '!') // 可打印 → 回编辑段并追加
    expect(overlay.isJumping()).toBe(false)
    expect(overlay.render(80, 24).join('\n')).toContain('world!')
    hit('return', '')
    hit('return', '') // 再确认进跳转，再 Enter → 回编辑
    expect(overlay.isJumping()).toBe(false)
    overlay.type('world')
    hit('return', '')
    hit('backspace', '')
    expect(overlay.isJumping()).toBe(false)
  })

  it('跳转段渲染 [跳转] 徽标；编辑段渲染语义占位', () => {
    const { overlay, hit } = bootOverlay()
    const editRows = overlay.render(80, 24).join('\n')
    expect(editRows).toContain('搜索会话历史') // 空 query 占位显式标注搜索对象
    overlay.type('world')
    hit('return', '')
    expect(overlay.render(80, 24).join('\n')).toContain('[跳转]')
  })

  it('Esc 两段均 close；onDeactivate 清相位（重开回编辑段）', () => {
    const { overlay, hit } = bootOverlay()
    overlay.type('world')
    hit('return', '')
    expect(overlay.handleKey('escape', '')).toBe('close')
    overlay.onDeactivate()
    expect(overlay.isJumping()).toBe(false)
    overlay.setMessages(MESSAGES)
    overlay.type('world')
    expect(overlay.isJumping()).toBe(false)
  })
})
