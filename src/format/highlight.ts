/**
 * highlight — 搜索命中子串高亮（A2，#55 同族细节）。
 *
 * ANSI 感知：转义序列不参与匹配（查询词不会命中 SGR 码内部），命中位置经
 * plain 投影映射回原始串后原位包裹——/scroll 等含 ANSI 的行原样保留转义。
 * 大小写口径由调用方传（与搜索本身的 smart-case 一致）。
 *
 * @module @huiliyi37/dsh-tianshu-tui/highlight
 */

/** 转义序列正则：CSI 或 OSC（BEL/ST 双终结）。 */
const ESC_RE = /(\x1B\[[0-9;?]*[a-zA-Z]|\x1B\][^\x07\x1B]*(?:\x07|\x1B\\))/

/** smart-case 口径：查询含大写 → 精确匹配（搜索与高亮共用同一判定）。 */
export function isSmartCaseSensitive(query: string): boolean {
  return /[A-Z]/.test(query)
}

export interface HighlightOptions {
  /** true = 精确匹配（smart-case 命中含大写时与搜索口径一致）。 */
  sensitive?: boolean
  /** 命中片段包裹函数（ANSI 着色/加粗）。 */
  wrap: (segment: string) => string
}

/**
 * 在 line 中找出 query 的全部出现并原位包裹。
 * query 为空或无命中时原样返回；line 可含 ANSI（转义段零宽跳过、不参与匹配）。
 */
export function highlightQuery(line: string, query: string, opts: HighlightOptions): string {
  if (query === '') return line
  const sensitive = opts.sensitive === true

  // plain 投影 + 逐字符位置映射（plainToRaw[i] = 第 i 个 plain 字符在 line 中的下标）
  const plainToRaw: number[] = []
  let plain = ''
  let i = 0
  while (i < line.length) {
    if (line[i] === '\x1B') {
      const m = ESC_RE.exec(line.slice(i))
      if (m !== null) {
        i += m[1].length
        continue
      }
    }
    plainToRaw[plain.length] = i
    plain += line[i]
    i += 1
  }

  const hay = sensitive ? plain : plain.toLowerCase()
  const needle = sensitive ? query : query.toLowerCase()
  if (needle === '') return line

  const pieces: string[] = []
  let plainPos = 0
  let rawPos = 0
  while (true) {
    const hit = hay.indexOf(needle, plainPos)
    if (hit === -1) break
    const startRaw = plainToRaw[hit] ?? line.length
    const endPlain = hit + needle.length
    const endRaw = endPlain >= plainToRaw.length ? line.length : plainToRaw[endPlain] ?? line.length
    pieces.push(line.slice(rawPos, startRaw), opts.wrap(line.slice(startRaw, endRaw)))
    rawPos = endRaw
    plainPos = endPlain
  }
  pieces.push(line.slice(rawPos))
  return pieces.join('')
}
