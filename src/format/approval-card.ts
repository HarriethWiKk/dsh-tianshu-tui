/**
 * 审批卡（format/approval-card.ts）— 纯渲染。
 *
 * 形态对齐输入轨：上下圆角横线、左右不封。标题嵌在顶轨，diff 体在中间，
 * 底行是键位提示。键位行由动作表投影段动态生成（approvalKeyHintLine：
 * 'y 允许' → '[y] 允许'，p 段仅在前缀可提时出现）；f 键反馈输入态时
 * 键位行下追加反馈提示行。小窗口 compact 只保留提示行（diff 仍由
 * formatPermissionDiff 产出，调用方决定是否传入）。
 */
import { color } from '../engine/ansi.js'
import { boxCharsFor } from '../box-chars.js'
import type { RivetTheme } from '../theme.js'
import { displayWidth, truncateToDisplayWidth } from '../width.js'

/**
 * 键位提示段 → 审批卡键位行：首 token 加方括号（'y 允许' → '[y] 允许'）。
 * 段来源是 approval 域动作的 footerHint 投影（actions/projections；footer 同源）。
 * @param segments - 投影提示段（注册序即决策梯度序）。
 */
export function approvalKeyHintLine(segments: readonly string[]): string {
  return segments.map((seg) => {
    const space = seg.indexOf(' ')
    return space === -1 ? `[${seg}]` : `[${seg.slice(0, space)}] ${seg.slice(space + 1)}`
  }).join(' ')
}

/** 键位行缺省提示段（调用方未投影动作表时的兜底；与 approval 域动作 footerHint 同源对齐）。 */
const DEFAULT_KEY_HINT_SEGMENTS: readonly string[] =
  ['y 允许', 't 记住此工具', 'a 全放行', 'n 拒绝', 'f 拒绝并说明', 'esc 取消']

/** formatApprovalCard 的渲染输入。 */
export interface FormatApprovalCardInput {
  /** 终端列数（轨线外宽 = columns）。 */
  columns: number
  /** 待审批工具名。 */
  toolName: string
  /** 审批原因（展示在提示行）。 */
  reason?: string
  /** formatPermissionDiff 产出；null/缺省 = 盲批提示。 */
  diffLines?: readonly string[] | null
  /** 紧凑：不渲染 diff 体，只保留提示 + 键位。 */
  compact?: boolean
  /** 键位提示段（action registry 投影；缺省用内置文案）。 */
  keyHintSegments?: readonly string[]
  /** 拒绝反馈输入态（f 键已进入）：键位行下追加反馈提示行。 */
  feedback?: boolean
}

/**
 * 圆角轨包裹一块 live 内容（审批卡 / 提问卡共用）。
 * @param columns - 外宽。
 * @param title - 顶轨内嵌标题（纯文本）。
 * @param body - 已着色的内容行。
 * @param borderColor - 轨线颜色。
 * @returns 顶轨 + body + 底轨；columns < 4 时仅 body。
 */
export function formatRailsBlock(
  columns: number,
  title: string,
  body: readonly string[],
  borderColor: string,
): string[] {
  if (columns < 4) {
    const cap = Math.max(1, columns)
    return body.map(line => truncateToDisplayWidth(line, cap))
  }
  const chars = boxCharsFor('thin')
  const inner = Math.max(0, columns - 2)
  const maxLabel = Math.max(1, inner - 3)
  const label = title === '' ? '' : ` ${truncateToDisplayWidth(title, maxLabel)} `
  const fill = Math.max(0, inner - 1 - displayWidth(label))
  const top = color(`${chars.tl}${chars.h}${label}${chars.h.repeat(fill)}${chars.tr}`, borderColor)
  const bottom = color(`${chars.bl}${chars.h.repeat(inner)}${chars.br}`, borderColor)
  const content = body.map(line => truncateToDisplayWidth(line, columns))
  return [top, ...content, bottom]
}

/**
 * 渲染审批卡：顶轨「审批 · 工具名」+ 提示/diff + 键位 + 底轨。
 * @param input - 列数、工具名、可选原因/diff/键位段/反馈态、是否紧凑。
 * @param theme - 当前主题（轨线与提示用 warning）。
 * @returns ANSI 行数组；columns ≤ 0 返回空数组。
 */
export function formatApprovalCard(input: FormatApprovalCardInput, theme: RivetTheme): string[] {
  if (input.columns <= 0) return []
  const why = input.reason === undefined || input.reason === '' ? '' : `（${input.reason}）`
  const diff = input.diffLines
  const hasDiff = diff !== undefined && diff !== null && diff.length > 0
  const blind = hasDiff ? '' : '（diff 不可见）'
  const prompt = color(`⚠ 允许执行 ${input.toolName}？${why}${blind}`, theme.warning)
  const hints = color(approvalKeyHintLine(input.keyHintSegments ?? DEFAULT_KEY_HINT_SEGMENTS), theme.muted)
  const body: string[] = [prompt]
  if (hasDiff && input.compact !== true) {
    for (const line of diff) body.push(line)
  }
  body.push(hints)
  if (input.feedback === true) {
    body.push(color('📝 说明拒绝原因（Enter 提交反馈 / Esc 返回选项）', theme.muted))
  }
  return formatRailsBlock(
    input.columns,
    `审批 · ${input.toolName}`,
    body,
    theme.warning,
  )
}
