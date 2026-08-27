/**
 * insert-remap — vim insert 模式两键序列 → Esc（对标 CC vimInsertModeRemaps）。
 *
 * 纯逻辑零计时器：时间窗由调用方传 now。首字符即时上屏（可见反馈、undo 正常），
 * 命中序列时由调用方回删缓冲字符、作废 `.` 录制（markInsertDirty）并退出 insert。
 * 1 秒窗 + 光标连续性双校验防误删：慢速打字、移动光标后不触发。
 *
 * @module @huiliyi37/dsh-tianshu-tui/insert-remap
 */

/** 序列判定窗口（毫秒；窗口外第二键视为普通输入）。 */
export const REMAP_WINDOW_MS = 1_000

/** insert remap 支持的动作（v1 仅 esc）。 */
export type InsertRemapAction = 'esc'

/**
 * 校验 prefs 原始记录（如 `{"jj":"esc"}`）：值必须 'esc'、键为两字符——
 * 违规项静默忽略（fail-closed，配置错误不炸输入行）。
 */
export function parseInsertRemaps(raw: unknown): Record<string, InsertRemapAction> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, InsertRemapAction> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value !== 'esc') continue
    if ([...key].length !== 2) continue
    out[key] = 'esc'
  }
  return out
}

/** 记录 → 序列列表（app 层传 `remapSequences(prefs.vimInsertRemaps)` 即可）。 */
export function remapSequences(remaps: Record<string, string> | undefined): string[] {
  if (!remaps) return []
  return Object.entries(remaps)
    .filter(([seq, action]) => action === 'esc' && [...seq].length === 2)
    .map(([seq]) => seq)
}

interface PendingFirst {
  ch: string
  /** 缓冲字符插入后的光标位（值内偏移）。 */
  cursor: number
  at: number
}

/** insert 模式两键序列缓冲状态机（每 InputLine 一个；vim 关闭时恒不构造）。 */
export class InsertRemapper {
  private readonly seqs: string[]
  private readonly heads: Set<string>
  private pending: PendingFirst | null = null

  constructor(sequences: string[]) {
    this.seqs = sequences.filter(s => [...s].length === 2)
    this.heads = new Set(this.seqs.map(s => [...s][0] ?? ''))
  }

  /**
   * 字符 ch 已插入后调用（cursorAfter = 插入后的光标位）。
   * 返回数字 = 命中序列：值为缓冲首字符的起始偏移，调用方应回删该字符、
   * markInsertDirty、退出 insert（刚插入的 ch 由调用方一并删除）。
   * 返回 null = 正常输入；ch 为某序列首字符时记为缓冲。
   */
  onChar(ch: string, cursorAfter: number, now: number): number | null {
    const p = this.pending
    this.pending = null
    if (p !== null
      && cursorAfter === p.cursor + ch.length
      && now - p.at <= REMAP_WINDOW_MS
      && this.seqs.includes(p.ch + ch)) {
      return p.cursor - p.ch.length
    }
    if (this.heads.has(ch)) {
      this.pending = { ch, cursor: cursorAfter, at: now }
    }
    return null
  }

  /** 模式切换 / 提交 / 清空时失效缓冲（光标连续性已防误删，此处兜底）。 */
  reset(): void {
    this.pending = null
  }
}
