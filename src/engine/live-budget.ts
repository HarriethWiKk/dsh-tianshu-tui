/**
 * live 区动态段预算：Working 行封顶、欢迎首帧只裁不垫、高水位只涨不缩、
 * 空闲 ticker 跳过组装的 key / spinner 判定。纯函数，不碰 stdout。
 */

/** padDynamicRegion 输入行（与 LiveRegionLine 结构兼容）。 */
export interface LiveBudgetLine {
  text: string
}

/** `padDynamicRegion` 的垫/裁开关。缺省垫到 budget；skipPad 只裁不垫。 */
export interface PadDynamicRegionOptions {
  /**
   * 动态段短于 budget 时是否垫空行。`false`：只按 budget 从顶裁，欢迎首帧
   * 不凭空空白，但仍把 Working 行限制在封顶内。
   */
  pad?: boolean
}

/**
 * 溢出裁剪 + 定高垫高：把 `[0, chromeStart)` 限制在恰好 `budget` display rows。
 * `budget <= 0` 且垫行：原样返回。`pad: false`：只裁不垫；budget 0 丢掉动态段。
 */
export function padDynamicRegion<T extends LiveBudgetLine>(
  lines: readonly T[],
  chromeStart: number,
  budget: number,
  rowsForLine: (text: string) => number = () => 1,
  options?: PadDynamicRegionOptions,
): { lines: T[]; chromeStart: number } {
  const pad = options?.pad !== false
  if (budget <= 0 && pad) return { lines: lines.slice() as T[], chromeStart }
  const dynamic = lines.slice(0, chromeStart)
  const chrome = lines.slice(chromeStart)
  const cap = Math.max(0, budget)

  let rows = 0
  for (const line of dynamic) rows += rowsForLine(line.text)

  let dropUntil = 0
  while (rows > cap && dropUntil < dynamic.length) {
    const dropped = dynamic[dropUntil]
    if (dropped === undefined) break
    rows -= rowsForLine(dropped.text)
    dropUntil++
  }
  const kept = dynamic.slice(dropUntil)
  const padCount = pad ? Math.max(0, cap - rows) : 0
  const padding = Array.from({ length: padCount }, () => ({ text: '' }) as T)

  return {
    lines: [...kept, ...padding, ...chrome],
    chromeStart: kept.length + padCount,
  }
}

/** live 区行上限：随终端高度收缩，封顶 28、下限 4。 */
export function liveMaxRowsFor(rows: number): number {
  return Math.max(4, Math.min(28, (rows || 24) - 1))
}

/** Working 行封顶：给 chrome 留位。 */
export function workingRowsCap(terminalRows: number, chromeRows: number): number {
  return Math.max(0, liveMaxRowsFor(terminalRows) - Math.max(0, chromeRows))
}

/**
 * 动态段预算：高水位只涨不缩。skipPad 按 min(动态行, ceiling) 裁且不改高水位。
 */
export function nextDynamicBudget(
  highWater: number,
  dynamicRows: number,
  ceiling: number,
  skipPad: boolean,
  freezeHighWater = false,
): { budget: number; highWater: number } {
  if (skipPad) {
    return { budget: Math.min(Math.max(0, dynamicRows), Math.max(0, ceiling)), highWater }
  }
  if (ceiling <= 0) return { budget: 0, highWater: 0 }
  const budget = Math.min(ceiling, Math.max(highWater, dynamicRows))
  if (freezeHighWater) return { budget, highWater: Math.min(ceiling, highWater) }
  return { budget, highWater: budget }
}

/** live 区同时展示的进行中工具卡数量上限。 */
export const LIVE_TOOL_CARD_MAX = 3

/** snapshot 面 + chrome 面合成一帧 idle key（换行分隔，避免字段粘连）。 */
export function liveIdleKey(parts: { snapshotKey: string; chromeKey: string }): string {
  return `${parts.snapshotKey}\n${parts.chromeKey}`
}

/** 同 key 且无 spinner 才跳过；首帧 prevKey 为空、有转圈、key 变都必须组装。 */
export function shouldSkipIdleAssemble(opts: {
  prevKey: string | null
  nextKey: string
  hasSpinner: boolean
}): boolean {
  return !opts.hasSpinner && opts.prevKey === opts.nextKey
}

/** 任一转圈源为真：ticker 才推进 tick，空闲帧不改 key。 */
export function liveHasSpinner(flags: {
  agentRunning: boolean
  activityRunning: boolean
  pendingTools: boolean
  reasoningLive: boolean
}): boolean {
  return flags.agentRunning || flags.activityRunning || flags.pendingTools || flags.reasoningLive
}

/** 一帧 idle 源（不含 now/tick，避免空闲 ticker 自己把 key 打漂）。 */
export interface LiveIdleSources {
  agentStatus: string
  activity: ReadonlyArray<{
    id: string
    status: string
    lastTool?: string
    toolCalls?: number
    tokensUsed?: number
  }>
  pendingCallIds: readonly string[]
  activityBandEnabled: boolean
  compactMode: boolean
  rows: number
  columns: number
  panelFlags: string
  btwActive: boolean
  taskNotice: string
  gitDirty: number
  apiKeyReady: boolean
  reasoningChars: number
  reasoningExpanded: boolean
  streamPeekChars: number
  inputValue: string
  questionPending: boolean
  approvalPending: boolean
  approvalTool: string
  alwaysApprove: boolean
  newlineMode: boolean
  slashKey: string
}

/** 把当前控制面折成 idle key；flush/batcher 路径不读此结果做跳过。 */
export function assembleIdleKey(src: LiveIdleSources): string {
  return liveIdleKey({
    snapshotKey: [
      src.agentStatus,
      src.activity.map(item =>
        `${item.id}:${item.status}:${item.lastTool ?? ''}:${item.toolCalls ?? 0}:${item.tokensUsed ?? 0}`,
      ).join('|'),
      src.pendingCallIds.join(','),
      src.activityBandEnabled ? '1' : '0',
      src.compactMode ? '1' : '0',
      `${src.rows}x${src.columns}`,
      src.panelFlags,
      src.btwActive ? 'btw' : '',
      src.taskNotice,
      String(src.gitDirty),
      src.apiKeyReady ? '1' : '0',
      String(src.reasoningChars),
      src.reasoningExpanded ? '1' : '0',
      String(src.streamPeekChars),
    ].join('\n'),
    chromeKey: [
      src.inputValue,
      src.questionPending ? '1' : '0',
      src.approvalPending ? '1' : '0',
      src.approvalTool,
      src.alwaysApprove ? '1' : '0',
      src.newlineMode ? '1' : '0',
      src.slashKey,
    ].join('\n'),
  })
}
