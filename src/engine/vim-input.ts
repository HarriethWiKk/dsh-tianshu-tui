/**
 * T9 VimInput — 输入行 vim 键位引擎（issue #51）。
 *
 * 键位对标（外部竞品基准，2026-08-27）：
 * - Claude Code interactive-mode 的 Vim 模式表（主基准）：
 *   h j k l Space / w e b W B E / 0 $ ^ / gg G / f F t T ; , /
 *   x X dd D dw de db cc C cw ce cb s S yy Y yw ye yb p P J u . 、
 *   文本对象 iw aw iW aW；数字前缀 count；visual v/V 及同族 motion 与操作。
 * - Gemini CLI vi 基线：Esc 进 NORMAL、基础导航与行首尾（真子集，自动覆盖）。
 *
 * 有意偏差（CC 有、本输入框不做）：>< 缩进、引号/括号文本对象、m 标记、
 * 块选择 Ctrl+V、宏 q、寄存器切换 "。'/' 不做行内搜索而是打开历史搜索 overlay
 * （对齐 CC「/ = 反向历史搜索」注记）。`.` 重放覆盖本引擎产生的全部变更命令；
 * insert 段记录「进入步骤 + 连续键入文本」，出现删除/粘贴等破坏性插入即放弃记录。
 *
 * 架构：纯状态机 + 注入宿主面（VimHost）。引擎只认「缓冲值 + 光标 + 少量突变
 * 原语」；undo 快照由 host.spliceRange 统一记录，`.` 重放闭包复用同一条管线
 * （重放即普通编辑，天然可再撤销）。词类扫描走 code-point 粒度（\w/CJK 均 BMP），
 * 单字符增删与横向移动使用宿主 grapheme 步进（折叠粘贴标记保持原子）。
 */

/** 引擎对宿主的窄依赖面（由 InputLine 实现为内联适配器）。 */
export interface VimHost {
  /** 当前缓冲文本快照。 */
  value(): string
  cursor(): number
  /** 纯光标移动（host 负责 sealUndo 与重绘通知）。 */
  moveCursor(pos: number): void
  /**
   * 区间替换原语：记一条 undo 单元并通知变化。
   * cursorAfter 缺省 = start + replacement.length（钳到新长度）。
   */
  spliceRange(
    start: number,
    end: number,
    replacement: string,
    kind: 'delete' | 'replace',
    cursorAfter?: number,
  ): void
  /** 写 yank 寄存器（仅内部剪贴板；不走 OSC52——与 Alt+W 复制语义区分）。 */
  setRegister(text: string): void
  /** 读 yank 寄存器。 */
  register(): string
  /** 撤销/重做一次（复用 InputLine 的 fish 式栈）。返回是否有变化。 */
  undoOnce(): boolean
  redoOnce(): boolean
  /** grapheme 步进（host 实现含折叠粘贴标记原子语义）。 */
  nextGrapheme(pos: number): number
  prevGrapheme(pos: number): number
  /** 进入 visual 并以当前光标为锚点。 */
  beginVisual(linewise: boolean): void
  /** 结束 visual 落回 normal 或 insert（c/s 类），锚点由 host 折叠。 */
  exitVisual(to: 'normal' | 'insert'): void
  /**
   * visual 选区（linewise 对齐后的 buffer 偏移）+ 锚点；无选区为 null。
   * anchor 供引擎判断选区端点归属——vim 语义下光标与锚点所在字符都属选区，
   * 消费端需按方向补足含字符窗口。
   */
  selection(): { start: number; end: number; linewise: boolean; anchor: number } | null
  /** o：交换选区两端点（仅 visual 内有意义）。 */
  swapVisualEnds(): void
  /** 是否处于 linewise visual（V 进入）。 */
  isLinewiseVisual(): boolean
  /**
   * 进入 insert。prepare 在切模式前执行（o/O 开行、cc 清行等前置 splice 各自记 undo）。
   * 返回后 host 保证 vimMode === 'insert'。
   */
  enterInsert(prepare?: () => void): void
  /** 切回 normal（`.` 重放插入段收尾调用）。 */
  setModeNormal(): void
  /** NORMAL 模式 '/'：打开历史搜索 overlay；宿主未接线时为 no-op。 */
  openHistorySearch(): void
  /** 行边缘/单行草稿的历史兜底（对齐 CC「边缘翻历史」）。返回是否有变化。 */
  historyFallback(direction: 'prev' | 'next'): boolean
}

type DotStep = () => void

/** 单次按键处理结果：handled = 发生了可感知变化（触发重绘）；none = 无动作。 */
export type VimKeyResult = 'handled' | 'none'

type OpKind = 'd' | 'c' | 'y'

/**
 * 词类口径：word = \w + CJK（与 input-line WORD_CHAR_RE 一致——中文 prompt 连续
 * 段视为词而非标点）；big-word 模式把 punct 并入 word（只区分 space/non-space）。
 */
const WORD_CHAR_RE = /^(?:\w|[一-鿿㐀-䶿豈-﫿぀-ヿ가-힯])$/u

type CharClass = 'space' | 'word' | 'punct'

function classOfCp(cp: string, big: boolean): CharClass {
  if (cp === '' || /\s/u.test(cp)) return 'space'
  if (big) return 'word'
  return WORD_CHAR_RE.test(cp) ? 'word' : 'punct'
}

interface FindMotion { readonly m: 'f' | 'F' | 't' | 'T'; readonly ch: string }

export class VimInput {
  private readonly host: VimHost

  // ── pending 解析态 ──────────────────────────────────────────
  private count = 0
  private pendingOp: OpKind | null = null
  private awaitG = false
  private awaitFind: FindMotion['m'] | null = null
  private awaitReplace = false
  /** 文本对象二级等待：操作符后的 i|a 已敲入，等对象字母 w/W。 */
  private awaitObjectOuter: boolean | null = null
  /** 操作符等待下的 gg 二段键。 */
  private awaitOperatorG = false
  private lastFind: FindMotion | null = null

  // ── `.` 重放 ────────────────────────────────────────────────
  private dotSteps: DotStep[] | null = null
  private replaying = false
  private insertPrefix: DotStep[] | null = null
  private insertText = ''
  private insertOk = false

  constructor(host: VimHost) {
    this.host = host
  }

  /** 运行时关停 vim 键位时复位全部 pending 态（防止半截解析吞后续按键）。 */
  reset(): void {
    this.count = 0
    this.pendingOp = null
    this.awaitG = false
    this.awaitFind = null
    this.awaitReplace = false
    this.awaitObjectOuter = null
    this.awaitOperatorG = false
    this.insertPrefix = null
    this.insertOk = false
    this.insertText = ''
    this.dotSteps = null
  }

  // ══ Normal mode ════════════════════════════════════════════

  handleNormal(name: string, ch: string, ctrl: boolean): VimKeyResult {
    if (name === 'escape') return this.cancelPending()

    // ── 待续键消费（优先于新解析）──
    if (this.awaitReplace) {
      this.awaitReplace = false
      if (!isPrintable(ch)) return 'none'
      const n = Math.max(1, this.takeCount())
      return this.recordAndRun([() => { this.replaceUnderCursor(ch, n) }])
    }
    if (this.awaitFind !== null) {
      const m = this.awaitFind
      this.awaitFind = null
      if (!isPrintable(ch)) return 'none'
      const n = Math.max(1, this.takeCount())
      const find: FindMotion = { m, ch }
      this.lastFind = find
      // 操作符挂载态下 find 是它的 motion（df{c}），独立态是纯跳转
      const op = this.pendingOp
      if (op !== null) {
        this.pendingOp = null
        return this.finishOpFind(op, find, n)
      }
      return this.finishFind(find, n)
    }
    if (this.awaitObjectOuter !== null) return this.resolveObject(ch)
    if (this.pendingOp !== null) return this.continueOperator(ch)

    if (this.awaitG) {
      this.awaitG = false
      if (ch !== 'g') return 'none'
      return this.lineJump(Math.max(1, this.takeCount()) - 1)
    }

    // 数字前缀（独立 0 是行首 motion）
    if (/^[1-9]$/.test(ch)) {
      this.count = Math.min(this.count * 10 + Number(ch), 9999)
      return 'none'
    }

    switch (name) {
      case 'left': case 'ctrl_b': return this.nav(() => this.hGraphN(-1))
      case 'right': case 'ctrl_f': return this.nav(() => this.hGraphN(1))
      case 'home': return this.nav(() => this.jumpTo(this.lineStart(this.cursor())))
      case 'end': return this.nav(() => this.jumpTo(this.lineEndPos(this.cursor())))
      case 'up': return this.edgeNav('prev', -1)
      case 'down': return this.edgeNav('next', 1)
      case 'backspace': return this.deleteChars(Math.max(1, this.takeCount()), true)
      case 'delete': return this.deleteChars(Math.max(1, this.takeCount()), false)
      default: break
    }

    // ctrl 组合按「键名」路由而非修饰位——上层派发（InputHandler/宿主）可能丢 flag
    if (name.startsWith('ctrl_')) {
      switch (name) {
        case 'ctrl_r': return this.changedIf(() => { this.host.redoOnce() })
        case 'ctrl_z': case 'ctrl_minus': return this.changedIf(() => { this.host.undoOnce() })
        case 'ctrl_n': return this.historyFallbackResult('next')
        case 'ctrl_p': return this.historyFallbackResult('prev')
        default: return 'none'
      }
    }
    void ctrl

    const key = ch === ' ' ? ' ' : ch
    switch (key) {
      case 'u': return this.changedIf(() => { this.host.undoOnce() })
      case 'U': return this.recordAndRun([() => { this.transformLine(seg => seg.toUpperCase()) }])
      case '~': return this.recordAndRun([() => { this.toggleCaseChar() }])
      case '/':
        this.cancelPending()
        this.host.openHistorySearch()
        return 'none'
      case ' ': case 'l': return this.nav(() => this.hGraphN(1))
      case 'h': return this.nav(() => this.hGraphN(-1))
      case 'j': return this.edgeNav('next', 1)
      case 'k': return this.edgeNav('prev', -1)
      case 'w': return this.countChain(off => this.fwdWord(off, false))
      case 'W': return this.countChain(off => this.fwdWord(off, true))
      case 'b': return this.countChain(off => this.backWord(off, false))
      case 'B': return this.countChain(off => this.backWord(off, true))
      case 'e': return this.countChain(off => this.fwdWordEnd(off, false))
      case 'E': return this.countChain(off => this.fwdWordEnd(off, true))
      case 'f': case 'F': case 't': case 'T':
        this.awaitFind = key as FindMotion['m']
        return 'none'
      case ';': return this.repeatFind(false)
      case ',': return this.repeatFind(true)
      case 'g':
        this.awaitG = true
        return 'none'
      case 'G': {
        const nLine = Math.max(1, this.takeCount())
        if (nLine > 1) return this.lineJump(nLine - 1)
        return this.nav(() => this.jumpTo(this.value().length))
      }
      case '0': return this.nav(() => this.jumpTo(this.lineStart(this.cursor())))
      case '^': return this.nav(() => this.jumpTo(this.firstNonBlank()))
      case '$': return this.dollarMotion()
      case 'i': return this.enterInsertFrom([])
      case 'I': return this.enterInsertFrom([() => { this.jumpTo(this.firstNonBlank()) }])
      case 'a': return this.enterInsertFrom([() => { this.jumpTo(this.host.nextGrapheme(this.cursor())) }])
      case 'A': return this.enterInsertFrom([() => { this.jumpTo(this.lineEndPos(this.cursor())) }])
      case 'o': return this.openRelative(1)
      case 'O': return this.openRelative(-1)
      case 'r':
        this.awaitReplace = true
        return 'none'
      case 'x': return this.deleteChars(Math.max(1, this.takeCount()), false)
      case 'X': return this.deleteChars(Math.max(1, this.takeCount()), true)
      case 'D': return this.toLineEndDeleteOrChange('d')
      case 'C': return this.toLineEndDeleteOrChange('c')
      case 's': return this.substituteChars()
      case 'S': return this.changeLines(this.takeCount())
      case 'd': case 'c': case 'y':
        this.pendingOp = key as OpKind
        return 'none'
      case 'Y': return this.linewiseYank(this.takeCount())
      case 'v':
        this.host.beginVisual(false)
        return 'handled'
      case 'V':
        this.host.beginVisual(true)
        return 'handled'
      case 'J': return this.joinLines(Math.max(1, Math.max(1, this.takeCount()) - 1))
      case 'p': return this.pasteRegister(this.takeCount(), true)
      case 'P': return this.pasteRegister(this.takeCount(), false)
      case '.': return this.replayDot()
      default:
        return 'none'
    }
  }

  // ══ Visual mode ════════════════════════════════════════════

  handleVisual(name: string, ch: string, _ctrl: boolean): VimKeyResult {
    if (name === 'escape') {
      this.host.exitVisual('normal')
      return 'handled'
    }
    if (this.awaitReplace) {
      this.awaitReplace = false
      if (!isPrintable(ch)) return 'none'
      return this.visualReplaceWith(ch)
    }
    if (this.awaitFind !== null) {
      const m = this.awaitFind
      this.awaitFind = null
      if (!isPrintable(ch)) return 'none'
      const n = Math.max(1, this.takeCount())
      const r = this.resolveFind(this.cursor(), { m, ch }, n)
      if (r === null) return 'none'
      return this.nav(() => this.jumpTo(r.cursorPos))
    }
    if (/^[1-9]$/.test(ch)) {
      this.count = Math.min(this.count * 10 + Number(ch), 9999)
      return 'none'
    }
    if (this.awaitG) {
      this.awaitG = false
      if (ch === 'g') return this.vExtend(0)
      return 'none'
    }

    switch (name) {
      case 'left': return this.nav(() => this.vExtend(this.host.prevGrapheme(this.cursor())))
      case 'right': return this.nav(() => this.vExtend(this.host.nextGrapheme(this.cursor())))
      case 'up': return this.vMove(-1)
      case 'down': return this.vMove(1)
      case 'home': return this.nav(() => this.vExtend(0))
      case 'end': return this.nav(() => this.vExtend(this.value().length))
      case 'ctrl_z': case 'ctrl_minus': return this.changedIf(() => { this.host.undoOnce() })
      case 'ctrl_y': return this.changedIf(() => { this.host.redoOnce() })
      default: break
    }

    const key = ch === ' ' ? ' ' : ch
    void _ctrl
    switch (key) {
      case 'h': return this.nav(() => this.vExtend(this.host.prevGrapheme(this.cursor())))
      case ' ': case 'l': return this.nav(() => this.vExtend(this.host.nextGrapheme(this.cursor())))
      case 'j': return this.vMove(1)
      case 'k': return this.vMove(-1)
      case 'w': return this.vChainExtend(off => this.fwdWord(off, false))
      case 'W': return this.vChainExtend(off => this.fwdWord(off, true))
      case 'b': return this.vChainExtend(off => this.backWord(off, false))
      case 'B': return this.vChainExtend(off => this.backWord(off, true))
      case 'e': return this.vChainExtend(off => this.fwdWordEnd(off, false))
      case 'E': return this.vChainExtend(off => this.fwdWordEnd(off, true))
      case '^': return this.nav(() => this.vExtend(this.firstNonBlank()))
      case '$': return this.nav(() => this.vExtend(this.lineEndPos(this.cursor())))
      case '0': return this.nav(() => this.vExtend(this.lineStart(this.cursor())))
      case 'g':
        this.awaitG = true
        return 'none'
      case 'f': case 'F': case 't': case 'T':
        this.awaitFind = key as FindMotion['m']
        return 'none'
      case ';': return this.repeatFind(false)
      case ',': return this.repeatFind(true)
      case 'V': {
        if (!this.host.isLinewiseVisual()) {
          this.host.exitVisual('normal')
          this.host.beginVisual(true)
        }
        return 'handled'
      }
      case 'v': {
        if (this.host.isLinewiseVisual()) {
          this.host.exitVisual('normal')
          this.host.beginVisual(false)
          return 'handled'
        }
        this.host.exitVisual('normal')
        return 'handled'
      }
      case 'o':
        this.host.swapVisualEnds()
        return 'handled'
      case 'd': case 'x': return this.visualCut('normal')
      case 'c': case 's': return this.visualCut('insert')
      case 'y': return this.visualYank(false)
      case 'Y': return this.visualYank(true)
      case 'p': return this.visualPaste()
      case 'U': return this.visualTransform(seg => seg.toUpperCase())
      case 'u': return this.visualTransform(seg => seg.toLowerCase())
      case '~': return this.visualTransform(seg => [...seg].map(flipCaseCp).join(''))
      case 'J': return this.visualJoin()
      case 'r':
        this.awaitReplace = true
        return 'none'
      default:
        return 'none'
    }
  }

  // ══ insert 段跟踪（InputLine 回调）──────────────────────────

  /** insert 模式里每次顺序键入回调（累积 `.` 材料）。 */
  captureTyping(ch: string): void {
    if (this.insertPrefix !== null && this.insertOk) this.insertText += ch
  }

  /** insert 模式里任何非顺序改动（删除/粘贴/补全）→ `.` 保真失败，放弃记录。 */
  markInsertDirty(): void {
    this.insertOk = false
  }

  /** Esc 离开 insert 时封口：前缀步骤 + 文本段落合成一条 `.` 记录。 */
  finalizeInsertRepeat(): void {
    if (this.replaying) return
    const prefix = this.insertPrefix
    this.insertPrefix = null
    if (!this.insertOk || prefix === null) return
    const text = this.insertText
    this.insertText = ''
    if (text === '' && prefix.length === 0) return
    this.dotSteps = [
      ...prefix,
      () => {
        if (text !== '') {
          this.host.spliceRange(this.host.cursor(), this.host.cursor(), text, 'replace')
        }
      },
      () => { this.host.setModeNormal() },
    ]
  }

  // ══ 缓冲派生量 ═════════════════════════════════════════════

  private value(): string { return this.host.value() }
  private cursor(): number { return this.host.cursor() }

  private splitCache: string | null = null
  private linesCache: string[] = []
  private lines(): string[] {
    const v = this.value()
    if (this.splitCache !== v) {
      this.linesCache = v.split('\n')
      this.splitCache = v
    }
    return this.linesCache
  }

  private lineIndexOf(pos: number): number {
    const v = this.value()
    let idx = 0
    let searchFrom = 0
    for (;;) {
      const nl = v.indexOf('\n', searchFrom)
      if (nl === -1 || nl >= pos) break
      idx++
      searchFrom = nl + 1
    }
    return idx
  }
  private lineStart(pos: number): number {
    const v = this.value()
    const prevNl = v.lastIndexOf('\n', Math.max(0, pos - 1))
    return pos === 0 ? 0 : (prevNl === -1 ? 0 : prevNl + 1)
  }
  private lineEndPos(pos: number): number {
    const ln = this.lineIndexOf(pos)
    const seg = this.lines()[ln] ?? ''
    return this.lineStart(pos) + seg.length
  }
  private firstNonBlank(): number {
    const seg = this.lines()[this.lineIndexOf(this.cursor())] ?? ''
    const m = seg.match(/\S/)
    const start = this.lineStart(this.cursor())
    return m === null ? start : start + (m.index ?? 0)
  }

  private jumpTo(pos: number): void {
    this.host.moveCursor(clamp(pos, this.value().length))
  }
  private nav(action: () => void): 'handled' | 'none' {
    action()
    return 'handled'
  }
  private changedIf(action: () => void): 'handled' | 'none' {
    action()
    return 'handled'
  }
  private lineJump(idx: number): 'handled' {
    const clamped = clamp(idx, this.lines().length - 1)
    let offset = 0
    const lines = this.lines()
    for (let i = 0; i < clamped; i++) offset += (lines[i]?.length ?? 0) + 1
    this.jumpTo(offset)
    return 'handled'
  }
  private takeCount(): number {
    const c = this.count
    this.count = 0
    return Math.max(1, c)
  }

  /** Esc：清空全部待续解析态（不产生可感知变化）。 */
  private cancelPending(): 'none' {
    this.count = 0
    this.pendingOp = null
    this.awaitG = false
    this.awaitFind = null
    this.awaitReplace = false
    this.awaitObjectOuter = null
    this.awaitOperatorG = false
    return 'none'
  }

  // ══ motion 核心 ════════════════════════════════════════════

  private hGraphN(steps: number): void {
    let pos = this.cursor()
    for (let i = 0; i < Math.abs(steps); i++) {
      pos = steps > 0 ? this.host.nextGrapheme(pos) : this.host.prevGrapheme(pos)
    }
    this.jumpTo(pos)
  }

  private classP(pos: number, big: boolean): CharClass {
    const v = this.value()
    const cp = v.codePointAt(pos)
    return cp === undefined ? 'space' : classOfCp(String.fromCodePoint(cp), big)
  }

  /** w/W：下一词簇词首（EOF 夹紧；相对起点无进展则原地）。 */
  private fwdWord(from: number, big: boolean): number {
    const v = this.value()
    const len = v.length
    if (from >= len) return from
    const cls = this.classP(from, big)
    let p = this.stepNextRaw(from)
    while (p < len && this.classP(p, big) === cls) p = this.stepNextRaw(p)
    while (p < len && this.classP(p, big) === 'space') p = this.stepNextRaw(p)
    return p
  }
  private stepNextRaw(pos: number): number {
    const v = this.value()
    if (pos >= v.length) return pos
    const cp = v.codePointAt(pos)
    return pos + (cp !== undefined && cp > 0xFFFF ? 2 : 1)
  }

  /** b/B：上一词簇词首（含「从词簇内部跳回簇首」）。 */
  private backWord(from: number, big: boolean): number {
    if (from <= 0) return 0
    const p = this.rawPrev(from)
    if (p <= 0) return 0
    const cls = this.classP(from, big)
    if (cls !== 'space') {
      // 从簇内部跳回簇首
      let head = from
      while (head > 0) {
        const pv = this.rawPrev(head)
        if (this.classP(pv, big) !== cls) break
        head = pv
      }
      if (head < from) return head
      // 已是簇首 → 越过左侧空白取上一非空簇首
      let q = rawPrevPos(this.value(), from)
      while (q > 0 && this.classP(q, big) === 'space') q = rawPrevPos(this.value(), q)
      if (this.classP(q, big) === 'space') return 0
      let head2 = q
      const cls2 = this.classP(q, big)
      while (head2 > 0) {
        const pv = rawPrevPos(this.value(), head2)
        if (this.classP(pv, big) !== cls2) break
        head2 = pv
      }
      return head2
    }
    // 当前在空白簇内：回落到上一个非空白簇首
    let q2 = p
    while (q2 > 0 && this.classP(q2, big) === 'space') q2 = rawPrevPos(this.value(), q2)
    if (this.classP(q2, big) === 'space') return 0
    let head3 = q2
    const cls3 = this.classP(q2, big)
    while (head3 > 0) {
      const pv = rawPrevPos(this.value(), head3)
      if (this.classP(pv, big) !== cls3) break
      head3 = pv
    }
    return head3
  }
  private rawPrev(pos: number): number { return rawPrevPos(this.value(), pos) }

  /** e/E：词尾字符（所在簇尚未尽则当簇尾；已到簇尾则下一非空簇尾）。 */
  private fwdWordEnd(from: number, big: boolean): number {
    const v = this.value()
    const len = v.length
    if (from >= len) return from
    const cls = this.classP(from, big)
    let t = from
    while (true) {
      const nx = this.stepNextRaw(t)
      if (nx >= len || this.classP(nx, big) !== cls) break
      t = nx
    }
    if (t !== from) return t
    let q = this.stepNextRaw(from)
    while (q < len && this.classP(q, big) === 'space') q = this.stepNextRaw(q)
    if (q >= len) return from
    const cls2 = this.classP(q, big)
    let tail = q
    while (true) {
      const nx = this.stepNextRaw(tail)
      if (nx >= len || this.classP(nx, big) !== cls2) break
      tail = nx
    }
    return tail
  }

  private countChain(step: (off: number) => number): 'handled' | 'none' {
    const n = this.takeCount()
    const start = this.cursor()
    let from = start
    for (let i = 0; i < n; i++) {
      const nxt = step(from)
      if (nxt === from) break
      from = nxt
    }
    if (from === start) return 'none'
    return this.nav(() => this.jumpTo(from))
  }
  private vChainExtend(step: (off: number) => number): 'handled' | 'none' {
    const n = this.takeCount()
    let from = this.cursor()
    for (let i = 0; i < n; i++) {
      const nxt = step(from)
      if (nxt === from) break
      from = nxt
    }
    return this.nav(() => { this.jumpTo(from) })
  }

  private dollarMotion(): 'handled' | 'none' {
    let n = this.takeCount()
    let pos = this.lineEndPos(this.cursor())
    const len = this.value().length
    while (--n > 0 && pos < len) pos = this.lineEndPos(Math.min(pos + 1, len))
    return this.nav(() => this.jumpTo(pos))
  }

  /** 行边缘 j/k → 单行草稿翻历史兜底（对齐 CC）。 */
  private edgeNav(fallbackDir: 'prev' | 'next', delta: number): 'handled' | 'none' {
    if (this.moveLineClamped(delta)) return 'handled'
    if (this.lines().length === 1) return this.historyFallbackResult(fallbackDir)
    return 'none'
  }
  private moveLineClamped(delta: number): boolean {
    const v = this.value()
    const pos = this.cursor()
    const before = v.slice(0, pos)
    const col = before.length - (before.lastIndexOf('\n') + 1)
    const lines = this.lines()
    const ln = this.lineIndexOf(pos)
    const target = clamp(ln + delta, lines.length - 1)
    if (target === ln) return false
    let destStart = 0
    for (let i = 0; i < target; i++) destStart += (lines[i]?.length ?? 0) + 1
    const bounds = boundaries(lines[target] ?? '')
    const colIdx = Math.min(col, bounds.length - 2)
    const dest = destStart + (bounds[colIdx] ?? 0)
    if (dest === pos) return false
    this.jumpTo(dest)
    return true
  }
  private vMove(delta: number): 'handled' | 'none' {
    return this.moveLineClamped(delta) ? 'handled' : 'none'
  }
  private historyFallbackResult(dir: 'prev' | 'next'): 'handled' | 'none' {
    return this.host.historyFallback(dir) ? 'handled' : 'none'
  }

  // ══ 字符查找 ═══════════════════════════════════════════════

  /**
   * 逻辑行内第 times 次命中解析。
   * cursorPos = 独立跳转落点（t 落目标前一格、T 落后一格）；
   * winStart/winEnd = 操作符删除窗口：f/F 连目标字符一起吞（through），
   * t/T 停在相邻格不吞。找不到返回 null（原地不动）。
   */
  private resolveFind(from: number, find: FindMotion, times: number): { cursorPos: number; winStart: number; winEnd: number } | null {
    const base = this.lineStart(from)
    const seg = this.lines()[this.lineIndexOf(from)] ?? ''
    const rel = clamp(from - base, seg.length)
    const forward = find.m === 'f' || find.m === 't'
    const hits: number[] = []
    if (forward) {
      let p = seg.indexOf(find.ch, rel + 1)
      while (p !== -1) { hits.push(p); p = seg.indexOf(find.ch, p + 1) }
    } else {
      // 反向族保持「最近优先」的原始序：hits[i] 即第 i+1 次命中
      let p = seg.lastIndexOf(find.ch, rel - 1)
      while (p !== -1) { hits.push(p); p = seg.lastIndexOf(find.ch, p - 1) }
    }
    const nth = hits[Math.min(times - 1, hits.length - 1)]
    if (nth === undefined) return null
    const x = base + nth
    const width = clusterWidth(this.value(), x)
    let cursorPos = x
    if (find.m === 't') cursorPos -= 1
    if (find.m === 'T') cursorPos += width
    if (cursorPos < base || cursorPos > this.lineEndPos(from)) return null
    // 窗口按方向构造：正向 [from, edge)，反向 [edge, from)；through 含目标字符
    const through = find.m === 'f' || find.m === 'F'
    const edgeExclusive = forward
      ? (through ? x + width : x)
      : (through ? x : x + width)
    return {
      cursorPos,
      winStart: Math.min(from, edgeExclusive),
      winEnd: Math.max(from, edgeExclusive),
    }
  }

  /** 独立跳转路径的 find 解析。 */
  private finishFind(find: FindMotion, n: number): VimKeyResult {
    const r = this.resolveFind(this.cursor(), find, n)
    if (r === null) return 'none'
    return this.nav(() => this.jumpTo(r.cursorPos))
  }
  /** 操作符挂载的 find：对 [winStart,winEnd) 应用 d/c/y。 */
  private finishOpFind(op: OpKind, find: FindMotion, n: number): VimKeyResult {
    const r = this.resolveFind(this.cursor(), find, n)
    if (r === null) return 'none'
    if (r.winStart >= r.winEnd) return 'none'
    const text = this.value().slice(r.winStart, r.winEnd)
    if (text === '') return 'none'
    this.host.setRegister(text)
    if (op === 'y') {
      this.host.moveCursor(r.winStart)
      return 'handled'
    }
    this.host.spliceRange(r.winStart, r.winEnd, '', 'delete')
    if (op === 'c') this.host.enterInsert(undefined)
    return 'handled'
  }
  private repeatFind(reverse: boolean): 'handled' | 'none' {
    const lf = this.lastFind
    if (lf === null) return 'none'
    const flipped = reverse ? invertFind(lf) : lf
    const n = Math.max(1, this.takeCount())
    return this.finishFind(flipped, n)
  }

  // ══ 操作符 ═════════════════════════════════════════════════

  private continueOperator(ch: string): 'handled' | 'none' {
    const op = this.pendingOp
    if (op === null) return 'none'
    if (/^[0-9]$/.test(ch)) {
      this.count = Math.min(this.count * 10 + Number(ch), 9999)
      return 'none'
    }
    if (ch === op) {
      this.pendingOp = null
      const n = this.takeCount()
      switch (op) {
        case 'y': return this.linewiseYank(n)
        case 'c': return this.changeLines(n)
        case 'd': return this.linewiseDelete(n)
        default: return 'none'
      }
    }
    if (ch === 'i' || ch === 'a') {
      this.awaitObjectOuter = ch === 'a'
      return 'none'
    }
    if (ch === 'f' || ch === 'F' || ch === 't' || ch === 'T') {
      this.awaitFind = ch as FindMotion['m']
      return 'none'
    }
    if (this.awaitOperatorG) {
      this.awaitOperatorG = false
      if (ch !== 'g') return 'none'
      return this.opLinewise(op, 'top')
    }
    if (ch === 'g') {
      this.awaitOperatorG = true
      return 'none'
    }
    if (ch === 'G') {
      return this.opLinewise(op, 'bottom')
    }
    if (ch === ';' || ch === ',') {
      const lf = this.lastFind
      if (lf === undefined || lf === null) return 'none'
      const flipped = ch === ',' ? invertFind(lf) : lf
      const n = Math.max(1, this.takeCount())
      this.pendingOp = null
      return this.finishOpFind(op, flipped, n)
    }
    this.pendingOp = null
    const span = this.opSpan(op, ch)
    if (span === null) return 'none'
    return this.applySpanCommand(op, span.start, span.end, span.incl)
  }

  /**
   * 操作符 × 行级终点（dG/y2G/cgg 族）：光标行与目标行取并集后交给既有
   * 行级窗口命令——复用 dd/cc 的 EOF/换行收边逻辑，避免第三套实现。
   */
  private opLinewise(op: OpKind, direction: 'top' | 'bottom'): 'handled' | 'none' {
    this.pendingOp = null
    this.awaitOperatorG = false
    const n = Math.max(1, this.count)
    this.count = 0
    const lines = this.lines()
    const fromLn = this.lineIndexOf(this.cursor())
    // 带数字 → 相对偏移；不带数字 → 绝对端点（G=末行、gg=首行）
    const hadCount = this.count > 0
    let toLnRaw: number
    if (!hadCount) toLnRaw = direction === 'top' ? 0 : lines.length - 1
    else toLnRaw = direction === 'top' ? fromLn - (n - 1) : fromLn + (n - 1)
    const toLn = Math.max(0, Math.min(toLnRaw, lines.length - 1))
    const lo = Math.min(fromLn, toLn)
    let dest = 0
    for (let i = 0; i < lo; i++) dest += (lines[i]?.length ?? 0) + 1
    this.jumpTo(dest)
    switch (op) {
      case 'y': return this.linewiseYank(Math.abs(toLn - fromLn) + 1)
      case 'c': return this.changeLines(Math.abs(toLn - fromLn) + 1)
      case 'd': return this.linewiseDelete(Math.abs(toLn - fromLn) + 1)
      default: return 'none'
    }
  }

  private opSpan(op: OpKind, key: string): Span | null {
    const n = Math.max(1, this.count)
    this.count = 0
    switch (key) {
      case 'w': return this.chainSpan(n, off => this.fwdWord(off, false), false, op === 'c')
      case 'W': return this.chainSpan(n, off => this.fwdWord(off, true), false, op === 'c')
      case 'b': return this.chainBack(n, off => this.backWord(off, false))
      case 'B': return this.chainBack(n, off => this.backWord(off, true))
      case 'e': return this.chainSpan(n, off => this.fwdWordEnd(off, false), true, false)
      case 'E': return this.chainSpan(n, off => this.fwdWordEnd(off, true), true, false)
      case 'h': case 'left': {
        let pos = this.cursor()
        for (let i = 0; i < n; i++) {
          const nxt = this.host.prevGrapheme(pos)
          if (nxt === pos) break
          pos = nxt
        }
        return { start: pos, end: this.cursor(), incl: false }
      }
      case 'l': case 'right': {
        let pos = this.cursor()
        for (let i = 0; i < n; i++) {
          const nxt = this.host.nextGrapheme(pos)
          if (nxt === pos) break
          pos = nxt
        }
        return { start: this.cursor(), end: pos, incl: false }
      }
      case '0': return { start: this.cursor(), end: this.lineStart(this.cursor()), incl: false }
      case '^': return { start: this.cursor(), end: this.firstNonBlank(), incl: false }
      case '$': return { start: this.cursor(), end: this.lineEndPos(this.cursor()), incl: false }
      case 'gg': return { start: this.cursor(), end: 0, incl: false }
      case 'G': return { start: this.cursor(), end: this.value().length, incl: false }
      default: return null
    }
  }

  /** 多步链式区间；cw 特判 == ce（词上单跳改写）。 */
  private chainSpan(n: number, step: (off: number) => number, inclusive: boolean, isChangeWord: boolean): Span {
    const start = this.cursor()
    let from = start
    for (let i = 0; i < n; i++) {
      const nxt = step(from)
      if (nxt === from) break
      from = nxt
    }
    if (isChangeWord && n === 1 && !/\s/u.test(this.value()[from - 1] ?? '') && this.classP(start, false) !== 'space' && from === this.fwdWord(start, false)) {
      // cw：落在标点前的场景维持词尾语义（end 含词尾字符）
      const endPos = this.fwdWordEnd(start, false)
      return { start, end: endPos, incl: true }
    }
    return { start, end: from, incl: inclusive }
  }

  /** 反向 motion 链（db/3dB）：起点固定光标，终点为链式回退结果。 */
  private chainBack(n: number, step: (off: number) => number): Span {
    let from = this.cursor()
    for (let i = 0; i < n; i++) {
      const nxt = step(from)
      if (nxt === from) break
      from = nxt
    }
    void n
    return { start: from, end: this.cursor(), incl: false }
  }

  private resolveObject(ch: string): 'handled' | 'none' {
    const outer = this.awaitObjectOuter
    this.awaitObjectOuter = null
    if (outer === null) return 'none'
    if (ch !== 'w' && ch !== 'W') return 'none'
    const op = this.pendingOp
    this.pendingOp = null
    if (op === null) return 'none'
    const span = objectSpan(this.value(), this.cursor(), ch === 'W', outer)
    if (span === null) return 'none'
    return this.applySpanCommand(op, span.start, span.end, false)
  }

  private applySpanCommand(op: OpKind, start: number, end: number, incl: boolean): 'handled' | 'none' {
    const v = this.value()
    const s = clamp(start, v.length)
    const e = clamp(end + (incl ? clusterWidth(v, end) : 0), v.length)
    if (s >= e) return 'none'
    const text = v.slice(s, e)
    if (text === '') return 'none'
    this.host.setRegister(text)
    if (op === 'y') {
      this.host.moveCursor(s)
      return 'handled'
    }
    this.host.spliceRange(s, e, '', 'delete')
    if (op === 'c') this.host.enterInsert(undefined)
    return 'handled'
  }

  // ══ 行级命令（dd/cc/yy/Y/J/o/O/D/C/s/S/r/x/X）══════════════

  private linewiseWindow(nRaw: number): { start: number; endAll: number; cnt: number; ln: number } | null {
    const v = this.value()
    const lines = this.lines()
    const ln = this.lineIndexOf(this.cursor())
    const cnt = Math.max(1, Math.min(Math.max(1, nRaw), lines.length - ln))
    const s = this.lineStart(this.cursor())
    let endAll = s
    for (let i = 0; i < cnt; i++) endAll += (lines[ln + i]?.length ?? 0) + 1
    endAll = Math.min(endAll, v.length)
    return { start: s, endAll, cnt, ln }
  }

  private linewiseDelete(nRaw: number): 'handled' {
    return this.recordAndRun([() => {
      const win = this.linewiseWindow(nRaw)
      if (win === null) return
      const all = this.lines()
      const reg = `${all.slice(win.ln, win.ln + win.cnt).join('\n')}\n`
      this.host.setRegister(reg)
      // 命中 EOF 且前方有换行：窗口左扩一字符吃掉前置换行，避免悬空空行
      const eatsPreceding = win.endAll >= this.value().length && win.start > 0
      const winStart = eatsPreceding ? win.start - 1 : win.start
      this.host.spliceRange(winStart, win.endAll, '', 'delete', winStart)
    }])
  }

  /**
   * cc/S：清空 n 行内容、寄存器行级化、落回行首进 insert。
   * 窗口 = 各行内容与其间换行（末行自身换行/EOF 结构保留）——多行 cc 收敛为
   * 单一空白编辑位，与 vim 行为一致。
   */
  private changeLines(nRaw: number): 'handled' {
    return this.enterInsertFrom([() => {
      const lines = this.lines()
      const ln = this.lineIndexOf(this.cursor())
      const cnt = Math.max(1, Math.min(Math.max(1, nRaw), lines.length - ln))
      this.host.setRegister(`${lines.slice(ln, ln + cnt).join('\n')}\n`)
      const s = this.lineStartOfLine(ln)
      const lastIdx = ln + cnt - 1
      const e = this.lineStartOfLine(lastIdx) + (lines[lastIdx]?.length ?? 0)
      if (e > s) this.host.spliceRange(s, e, '', 'replace', s)
      else this.jumpTo(s)
    }])
  }

  private lineStartOfLine(ln: number): number {
    const lines = this.lines()
    let off = 0
    for (let i = 0; i < Math.min(ln, lines.length); i++) off += (lines[i]?.length ?? 0) + 1
    return off
  }

  private linewiseYank(nRaw: number): 'handled' {
    const win = this.linewiseWindow(nRaw)
    if (win === null) return 'handled'
    const all = this.lines()
    this.host.setRegister(`${all.slice(win.ln, win.ln + win.cnt).join('\n')}\n`)
    return 'handled'
  }

  private replaceUnderCursor(ch: string, count: number): void {
    const covered: Array<[number, number]> = []
    let pos = this.cursor()
    const v = this.value()
    for (let i = 0; i < count && pos < v.length; i++) {
      const nxt = this.host.nextGrapheme(pos)
      const unit = v.slice(pos, nxt)
      if (unit.includes('\n')) break
      covered.push([pos, nxt])
      pos = nxt
    }
    const first = covered[0]
    const last = covered[covered.length - 1]
    if (first === undefined || last === undefined) return
    this.host.spliceRange(first[0], last[1], ch.repeat(covered.length), 'replace', first[0])
  }

  private toggleCaseChar(): void {
    const cur = this.cursor()
    const v = this.value()
    if (cur >= v.length) return
    const nxt = this.host.nextGrapheme(cur)
    const unit = v.slice(cur, nxt)
    if (unit.includes('\n')) return
    this.host.spliceRange(cur, nxt, [...unit].map(flipCaseCp).join(''), 'replace', cur)
  }

  private transformLine(fn: (seg: string) => string): void {
    const s = this.lineStart(this.cursor())
    const e = this.lineEndPos(this.cursor())
    if (s === e) return
    this.host.spliceRange(s, e, fn(this.value().slice(s, e)), 'replace', s)
  }

  private deleteChars(count: number, leftward: boolean): 'handled' {
    return this.recordAndRun([() => {
      const cur = this.cursor()
      let pos = cur
      for (let i = 0; i < count; i++) {
        const nxt = leftward ? this.host.prevGrapheme(pos) : this.host.nextGrapheme(pos)
        if (nxt === pos) break
        pos = nxt
      }
      if (pos === cur) return
      if (leftward) this.host.spliceRange(pos, cur, '', 'delete', pos)
      else this.host.spliceRange(cur, pos, '', 'delete')
    }])
  }

  private substituteChars(): 'handled' {
    const n = this.takeCount()
    return this.enterInsertFrom([() => {
      const v = this.value()
      let pos = this.cursor()
      for (let i = 0; i < n && pos < v.length; i++) pos = this.host.nextGrapheme(pos)
      if (pos > this.cursor()) this.host.spliceRange(this.cursor(), pos, '', 'delete')
    }])
  }

  private toLineEndDeleteOrChange(kind: OpKind): 'handled' {
    const run: DotStep[] = [() => {
      const e = this.lineEndPos(this.cursor())
      const cur = this.cursor()
      if (e <= cur) return
      const v = this.value()
      this.host.setRegister(v.slice(cur, e))
      this.host.spliceRange(cur, e, '', 'delete')
    }]
    if (kind === 'd') return this.recordAndRun(run)
    return this.enterInsertFrom(run)
  }

  private openRelative(dir: 1 | -1): 'handled' {
    return this.enterInsertFrom([() => {
      const v = this.value()
      if (dir === 1) {
        const eol = this.lineEndPos(this.cursor())
        const lastWithoutNl = eol >= v.length
        const insertAt = lastWithoutNl ? v.length : eol + 1
        this.host.spliceRange(insertAt, insertAt, '\n', 'replace', insertAt + (lastWithoutNl ? 1 : 0))
      } else {
        const s = this.lineStart(this.cursor())
        this.host.spliceRange(s, s, '\n', 'replace', s)
      }
    }])
  }

  private joinLines(joins: number): 'handled' {
    return this.recordAndRun([() => {
      for (let round = 0; round < joins; round++) {
        const v = this.value()
        const lines = this.lines()
        const ln = this.lineIndexOf(this.cursor())
        const nextSeg = lines[ln + 1]
        if (nextSeg === undefined) return
        const curSeg = lines[ln] ?? ''
        const e = (this.lineStart(this.cursor())) + curSeg.length
        const stripped = nextSeg.replace(/^[ \t]+/, '')
        const joiner = curSeg === '' || /[ \t]$/.test(curSeg) ? '' : ' '
        const windowEnd = Math.min(e + 1 + nextSeg.length, v.length)
        this.host.spliceRange(e, windowEnd, joiner + stripped, 'replace', e + joiner.length)
      }
    }])
  }

  // ══ 寄存器粘贴 ═════════════════════════════════════════════

  private pasteRegister(count: number, after: boolean): 'handled' | 'none' {
    const reg = this.host.register()
    if (reg === '') return 'none'
    const linewise = reg.endsWith('\n')
    const body = stripTrailingNl(reg)
    const repeatedBody = count > 1 ? body.repeat(count) : body
    return this.recordAndRun([() => {
      const v = this.value()
      const cur = this.cursor()
      if (linewise) {
        if (after) {
          const eol = this.lineEndPos(cur)
          if (eol >= v.length) {
            this.host.spliceRange(v.length, v.length, `\n${repeatedBody}`, 'replace', v.length + 1)
          } else {
            this.host.spliceRange(eol + 1, eol + 1, `${repeatedBody}\n`, 'replace', eol + 1)
          }
        } else {
          const s = this.lineStart(cur)
          this.host.spliceRange(s, s, `${repeatedBody}\n`, 'replace', s)
        }
        return
      }
      const at = after ? this.host.nextGrapheme(cur) : cur
      this.host.spliceRange(at, at, repeatedBody, 'replace', at)
    }])
  }

  // ══ `.` 重放 ═══════════════════════════════════════════════

  private recordAndRun(steps: DotStep[]): 'handled' {
    if (!this.replaying) this.dotSteps = [...steps]
    for (const f of steps) f()
    return 'handled'
  }

  private replayDot(): 'handled' | 'none' {
    const steps = this.dotSteps
    if (steps === null) return 'none'
    this.replaying = true
    try {
      for (const f of steps) f()
    } finally {
      this.replaying = false
    }
    return 'handled'
  }

  private enterInsertFrom(prefix: DotStep[]): 'handled' {
    this.insertPrefix = [...prefix]
    this.insertText = ''
    this.insertOk = true
    this.dotSteps = null
    this.host.enterInsert(prefix.length > 0 ? () => { for (const f of prefix) f() } : undefined)
    return 'handled'
  }

  // ══ visual 辅助 ════════════════════════════════════════════

  /**
   * visual 选区消费窗口：charwise 按 vim「两端所在字符都含」补格；
   * linewise 直接用宿主对齐结果。无选区返回 null。
   */
  private selSpan(): { start: number; end: number; linewise: boolean } | null {
    const sel = this.host.selection()
    if (sel === null) return null
    let lo = Math.min(sel.start, sel.end)
    let hi = Math.max(sel.start, sel.end)
    if (!sel.linewise && sel.anchor !== this.cursor()) {
      // 区间右端是排他位：把该端所在字符纳入（无论其属于光标还是锚点）
      const v = this.value()
      hi = Math.min(v.length, hi + clusterWidth(v, hi))
    }
    return { start: lo, end: hi, linewise: sel.linewise }
  }

  private vExtend(target: number): 'handled' | 'none' {
    const t = clamp(target, this.value().length)
    if (t === this.cursor()) return 'none'
    this.host.moveCursor(t)
    return 'handled'
  }

  private visualCut(to: 'normal' | 'insert'): 'handled' | 'none' {
    const sel = this.selSpan()
    if (sel === null) return 'none'
    const v = this.value()
    const text = v.slice(sel.start, sel.end)
    this.host.setRegister(sel.linewise ? ensureTrailingNl(stripTrailingNl(text)) : text)
    this.host.exitVisual(to)
    if (sel.linewise && to === 'insert') {
      // V 后 c：清空所选各行为内容但留一行编辑位
      const keep = text.endsWith('\n') ? '\n' : ''
      this.host.spliceRange(sel.start, sel.end, keep, 'replace', sel.start)
    } else {
      this.host.spliceRange(sel.start, sel.end, '', 'delete', sel.start)
    }
    return 'handled'
  }

  private visualYank(forceLinewise: boolean): 'handled' | 'none' {
    const sel = this.selSpan()
    if (sel === null) return 'none'
    const text = this.value().slice(sel.start, sel.end)
    const linewise = forceLinewise || sel.linewise
    this.host.setRegister(linewise ? ensureTrailingNl(stripTrailingNl(text)) : text)
    const anchor = linewise ? this.lineStart(sel.start) : sel.start
    this.host.exitVisual('normal')
    this.host.moveCursor(anchor)
    return 'handled'
  }

  private visualPaste(): 'handled' | 'none' {
    const reg = this.host.register()
    if (reg === '') return 'none'
    const sel = this.selSpan()
    if (sel === null) return 'none'
    const linewisePaste = reg.endsWith('\n')
    const body = stripTrailingNl(reg)
    this.host.exitVisual(linewisePaste ? 'normal' : 'normal')
    if (linewisePaste) {
      // V 选区 ↔ 行寄存器：以 body 行组替换选区各行为
      this.host.spliceRange(sel.start, sel.end, sel.linewise ? `${body}\n` : `${body}\n`, 'replace', sel.start)
      return 'handled'
    }
    this.host.spliceRange(sel.start, sel.end, body, 'replace', sel.start)
    return 'handled'
  }

  private visualReplaceWith(ch: string): 'handled' | 'none' {
    const sel = this.selSpan()
    if (sel === null) return 'none'
    const seg = this.value().slice(sel.start, sel.end)
    let out = ''
    let mutated = false
    for (const unit of graphemesOf(seg)) {
      if (unit.includes('\n')) { out += unit; continue }
      out += ch.repeat([...unit].length)
      mutated = true
    }
    if (!mutated) return 'none'
    this.host.exitVisual('normal')
    this.host.spliceRange(sel.start, sel.end, out, 'replace', sel.start)
    return 'handled'
  }

  private visualTransform(fn: (seg: string) => string): 'handled' | 'none' {
    const sel = this.selSpan()
    if (sel === null) return 'none'
    const seg = this.value().slice(sel.start, sel.end)
    this.host.exitVisual('normal')
    this.host.spliceRange(sel.start, sel.end, fn(seg), 'replace', sel.start)
    return 'handled'
  }

  private visualJoin(): 'handled' | 'none' {
    const sel = this.selSpan()
    if (sel === null || !sel.linewise) return 'none'
    const block = this.value().slice(sel.start, sel.end).split('\n').map(l => l.trim()).filter(l => l !== '')
    this.host.exitVisual('normal')
    this.host.spliceRange(sel.start, sel.end, block.join(' '), 'replace', sel.start)
    return 'handled'
  }
}

// ══ 缓冲无关小件 ══════════════════════════════════════════════

interface Span { start: number; end: number; incl: boolean }

function isPrintable(ch: string): boolean {
  return ch.length > 0 && !/[\x00-\x1F\x7F]/.test(ch)
}
function flipCaseCp(cp: string): string {
  return cp === cp.toUpperCase() ? cp.toLowerCase() : cp.toUpperCase()
}
function clamp(pos: number, len: number): number {
  return Math.max(0, Math.min(pos, len))
}
function ensureTrailingNl(s: string): string {
  return s.endsWith('\n') ? s : `${s}\n`
}
function stripTrailingNl(s: string): string {
  return s.endsWith('\n') ? s.slice(0, -1) : s
}
function clusterWidth(v: string, pos: number): number {
  if (pos < 0 || pos >= v.length) return 0
  const cp = v.codePointAt(pos)
  return cp === undefined ? 1 : cp > 0xFFFF ? 2 : 1
}
function rawPrevPos(v: string, pos: number): number {
  if (pos <= 0) return pos
  const cp = v.codePointAt(pos - 1)
  if (cp !== undefined && cp > 0xFFFF && pos >= 2) {
    const lead = v.codePointAt(pos - 2)
    if (lead !== undefined && lead > 0xFFFF) return pos - 2
  }
  return pos - 1
}

/** text-object 词簇解析：iw/iW × aw/aW（光标在空白上时选空白簇）。 */
function objectSpan(v: string, pos: number, big: boolean, outer: boolean): { start: number; end: number } | null {
  const len = v.length
  if (pos >= len) return null
  const clsAt = (p: number): CharClass => {
    const cp = v.codePointAt(p)
    return cp === undefined ? 'space' : classOfCp(String.fromCodePoint(cp), big)
  }
  const stepFwd = (p: number): number => {
    const cp = v.codePointAt(p)
    return Math.min(p + (cp !== undefined && cp > 0xFFFF ? 2 : 1), len)
  }
  let s = pos
  const cls = clsAt(pos)
  while (s > 0 && clsAt(rawPrevPos(v, s)) === cls) s = rawPrevPos(v, s)
  let e = pos
  while (true) {
    const nx = stepFwd(e)
    if (nx >= len || clsAt(nx) !== cls) break
    e = nx
  }
  const endExcl = stepFwd(e)
  if (!outer) return { start: s, end: endExcl }
  // aw/aW：先吸右邻空白，否则吸左邻
  let ws = endExcl
  while (ws < len && clsAt(ws) === 'space') ws = stepFwd(ws)
  if (ws > endExcl) return { start: s, end: ws }
  let ws2 = s
  while (ws2 > 0 && clsAt(rawPrevPos(v, ws2)) === 'space') ws2 = rawPrevPos(v, ws2)
  return { start: ws2, end: endExcl }
}

function invertFind(f: FindMotion): FindMotion {
  const map: Record<string, FindMotion['m']> = { f: 'F', F: 'f', t: 'T', T: 't' }
  const m = map[f.m]
  return m === undefined ? f : { m, ch: f.ch }
}

/** 光标列对齐用的边界数组（含 0 与末尾；多行安全降级按 code-point 切分）。 */
function boundaries(seg: string): number[] {
  try {
    const segger = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    const bounds = [0]
    for (const part of segger.segment(seg)) bounds.push(part.index + part.segment.length)
    return bounds
  } catch {
    const bounds = [0]
    let i = 0
    while (i < seg.length) {
      const cp = seg.codePointAt(i)
      const w = cp === undefined ? 1 : cp > 0xFFFF ? 2 : 1
      bounds.push(i + w)
      i += w
    }
    return bounds
  }
}

function graphemesOf(seg: string): string[] {
  try {
    const segger = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    const out: string[] = []
    for (const part of segger.segment(seg)) out.push(part.segment)
    return out
  } catch {
    const out: string[] = []
    let i = 0
    while (i < seg.length) {
      const cp = seg.codePointAt(i)
      const w = cp === undefined ? 1 : cp > 0xFFFF ? 2 : 1
      out.push(seg.slice(i, i + w))
      i += w
    }
    return out
  }
}
