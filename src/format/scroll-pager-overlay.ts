/**
 * /scroll 分页查看器 overlay — scrollback-transcript 解析器的消费端。
 *
 * 全屏 alt-screen 内按消息单元浏览 CommitEngine 已提交的 scrollback 全文：
 * ↑↓/PgUp/PgDn/Ctrl+U/Ctrl+D 滚动、g/G 首尾、输入实时子串搜索、n/N 循环跳转、
 * Esc 退出。渲染按逻辑行窗口化（超宽行截断到终端宽度），ANSI 原样保留。
 * 键位路由收敛在本类 handleKey，装配方（TuiApp）只做 activate/deactivate。
 */

import type { OverlayKeyResult, OverlayRenderer } from '../engine/overlay-engine.js'
import { color } from '../engine/ansi.js'
import type { RivetTheme } from '../theme.js'
import { getTheme } from '../theme.js'
import { truncateToDisplayWidth } from '../width.js'
import {
  findNextMatch,
  findPrevMatch,
  parseScrollbackTranscript,
  searchTranscript,
  type TranscriptMessage,
} from '../scrollback-transcript.js'
import { ANSI } from '../engine/ansi.js'
import { highlightQuery, isSmartCaseSensitive } from './highlight.js'

/** handleKey 结果：close = 请求关闭 overlay；handled = 已消费（统一词表 OverlayKeyResult）。 */
export type PagerKeyResult = OverlayKeyResult

export class ScrollPagerOverlay implements OverlayRenderer {
  private messages: TranscriptMessage[] = []
  /** 扁平化后的逻辑行（ANSI 原样）与每行所属消息索引。 */
  private rows: string[] = []
  private rowMessage: number[] = []
  /** 每条消息的首行行号（跳转落点）。 */
  private messageStartRow: number[] = []
  private scrollRow = 0
  private query = ''
  private matches: number[] = []
  private current = 0
  /** render 时缓存的可视行数，PgUp/PgDn 与 clamp 用；首帧前取保守缺省。 */
  private bodyHeight = 20
  private readonly theme: RivetTheme

  constructor(theme?: RivetTheme) {
    this.theme = theme ?? getTheme()
  }

  /**
   * 装配方提供 scrollback 全文快照（CommitEngine.getContent()）；重复设置重解析。
   */
  setContent(content: string): void {
    this.messages = parseScrollbackTranscript(content)
    this.rows = []
    this.rowMessage = []
    this.messageStartRow = []
    for (let mi = 0; mi < this.messages.length; mi++) {
      const message = this.messages[mi]
      if (message === undefined) continue
      this.messageStartRow.push(this.rows.length)
      for (const line of message.lines) {
        this.rows.push(line)
        this.rowMessage.push(mi)
      }
    }
    this.research()
    this.clampScroll()
  }

  type(char: string): void {
    this.query += char
    this.research()
  }

  backspace(): void {
    this.query = this.query.slice(0, -1)
    this.research()
  }

  /** 清空搜索态（overlay 关闭时调用）；内容与滚动位置保留。 */
  clear(): void {
    this.query = ''
    this.matches = []
    this.current = 0
  }

  matchCount(): number {
    return this.matches.length
  }

  scrollUp(n = 1): void {
    this.scrollRow = Math.max(0, this.scrollRow - n)
  }

  scrollDown(n = 1): void {
    this.scrollRow = Math.min(this.maxScroll(), this.scrollRow + n)
  }

  pageUp(): void {
    this.scrollUp(this.bodyHeight)
  }

  pageDown(): void {
    this.scrollDown(this.bodyHeight)
  }

  toTop(): void {
    this.scrollRow = 0
  }

  toBottom(): void {
    this.scrollRow = this.maxScroll()
  }

  goNext(): void {
    if (this.matches.length === 0) return
    // 锚点用当前匹配而非视窗顶行——目标消息被 clamp 挤到视窗中部时顶行
    // 仍停在上一条，按顶行算会让「下一个」永远落在自身。
    const from = this.matches[this.current] ?? this.anchorMessage()
    this.jumpTo(findNextMatch(this.messages, from, this.query))
  }

  goPrev(): void {
    if (this.matches.length === 0) return
    const from = this.matches[this.current] ?? this.anchorMessage()
    this.jumpTo(findPrevMatch(this.messages, from, this.query))
  }

  /**
   * 键位路由：返回 'close' 请求关闭，其余一律视为已消费。
   * 可打印字符进 query；n/N、p/P 循环跳匹配；↑↓/jk 行滚、PgUp/PgDn/Ctrl+U/Ctrl+D
   * 页滚；g/G（Home/End）首尾。
   */
  handleKey(name: string, char: string): PagerKeyResult {
    if (name === 'escape' || name === 'ctrl_c') return 'close'
    if (name === 'backspace') {
      this.backspace()
      return 'handled'
    }
    if (char === 'n' || char === 'N') {
      this.goNext()
      return 'handled'
    }
    if (char === 'p' || char === 'P') {
      this.goPrev()
      return 'handled'
    }
    switch (name) {
      case 'up': case 'k': this.scrollUp(); return 'handled'
      case 'down': case 'j': this.scrollDown(); return 'handled'
      case 'pageup': this.pageUp(); return 'handled'
      case 'pagedown': this.pageDown(); return 'handled'
      case 'home': this.toTop(); return 'handled'
      case 'end': this.toBottom(); return 'handled'
      default: break
    }
    if (name === 'ctrl_u') {
      this.pageUp()
      return 'handled'
    }
    if (name === 'ctrl_d') {
      this.pageDown()
      return 'handled'
    }
    if (char === 'g') {
      this.toTop()
      return 'handled'
    }
    if (char === 'G') {
      this.toBottom()
      return 'handled'
    }
    if (char !== '') {
      this.type(char)
      return 'handled'
    }
    return 'handled'
  }

  render(width: number, height: number): string[] {
    const theme = this.theme
    this.bodyHeight = Math.max(1, height - 2)
    this.clampScroll()
    const rows: string[] = []
    const counter = this.matches.length > 0 ? `  ${this.current + 1}/${this.matches.length}` : ''
    const queryText = this.query === '' ? '搜索或滚动（Esc 退出）' : this.query
    const position = `${this.scrollRow + 1}-${Math.min(this.rows.length, this.scrollRow + this.bodyHeight)}/${this.rows.length}`
    rows.push(color(`/scroll ${queryText}${this.query === '' ? '' : '▌'}${counter}  ↕${position}`, theme.secondary))
    const currentMatch = this.matches.length > 0 ? this.matches[this.current] : undefined
    for (let r = this.scrollRow; r < Math.min(this.rows.length, this.scrollRow + this.bodyHeight); r++) {
      const line = this.rows[r]
      if (line === undefined) continue
      const mi = this.rowMessage[r]
      const isCurrent = currentMatch !== undefined && mi === currentMatch
      const isMatchRow = this.matches.includes(mi)
      let text = truncateToDisplayWidth(line, Math.max(10, width - 2))
      // A2：匹配消息行内高亮查询词（ANSI 感知——行内原有转义原样保留）
      if (isMatchRow && this.query !== '') {
        text = highlightQuery(text, this.query, {
          sensitive: isSmartCaseSensitive(this.query),
          wrap: s => `${ANSI.REVERSE}${s}${ANSI.RESET}`,
        })
      }
      rows.push(isCurrent ? color(`▸ ${text}`, theme.success) : `  ${text}`)
    }
    rows.push(color('↑↓/PgUp/PgDn 滚动 · n/N 匹配跳转 · g/G 首尾 · Esc 退出', theme.muted))
    return rows
  }

  onActivate(): void {
    // 内容快照由装配方在激活时 setContent
  }

  onDeactivate(): void {
    this.clear()
  }

  // ── 内部 ────────────────────────────────────────────────────

  private maxScroll(): number {
    return Math.max(0, this.rows.length - this.bodyHeight)
  }

  private clampScroll(): void {
    this.scrollRow = Math.min(Math.max(0, this.scrollRow), this.maxScroll())
  }

  /** 当前视窗顶行所在的消息索引（空内容为 0）。 */
  private anchorMessage(): number {
    return this.rowMessage[this.scrollRow] ?? 0
  }

  /** 跳到匹配消息（视窗顶行贴住消息首行），current 对齐到 matches 中的位置。 */
  private jumpTo(messageIndex: number): void {
    if (this.matches.length === 0) return
    const pos = this.matches.indexOf(messageIndex)
    this.current = pos >= 0 ? pos : this.current
    const start = this.messageStartRow[messageIndex]
    if (start !== undefined) {
      this.scrollRow = start
      this.clampScroll()
    }
  }

  private research(): void {
    this.matches = searchTranscript(this.messages, this.query)
    this.current = 0
    const first = this.matches[0]
    if (first !== undefined) {
      const start = this.messageStartRow[first]
      if (start !== undefined) {
        this.scrollRow = start
        this.clampScroll()
      }
    }
  }
}
