/**
 * 底部 footer（format/prompt-footer.ts）— 纯渲染（C4 概念稿 C 三行底部区）。
 *
 * 输入行下方的模式/快捷键提示行：mode 段（normal + [plan]/[plan…]/[auto]
 * 徽标，与 statusline 徽标词汇一致）在前，快捷键提示在后，mode 恒保留。
 * 窄宽显式分级降级（对齐 glance-bar 行 2 的 drop 链）：审批态先走
 * 「长文案→短文案」中间档（p 此命令不再问→p 不再问 等），再按固定位次
 * 整段丢（esc→f→n→a→p→t，y 保底恒留）；空闲/检查态保持「从后整段丢」。
 * 空闲态提示走 10s 轮播（对齐 kimi-code footer tips）：基础操作高频出现，
 * 新功能/配置命令按权重旋转，让用户持续可发现；审批/检查面板等上下文态
 * 优先显示操作提示不轮播。
 * 右侧状态段（token/模型/API 等）右对齐合并进同一行；放不下按 priority
 * 丢段（数值大者先丢，缺省=数组下标即从后丢），绝不另起 theme.primary
 * 第二行。宽度守恒：任何输入下每行显示宽度 ≤ width。
 */
import { color } from '../engine/ansi.js'
import { CHROME_INACTIVE_SHIMMER, CHROME_SUBTLE } from './chrome-colors.js'
import type { RivetTheme } from '../theme.js'
import { displayWidth } from '../width.js'
import type { FooterInfoLevel } from '../prefs.js'
import type { FormatGlanceBarInput } from './glance-bar.js'
import { formatGlanceMetricsLine } from './glance-bar.js'

/** 提示轮播周期（ms）；对齐 kimi-code footer tips 10s 旋转。 */
export const FOOTER_TIP_ROTATE_MS = 10_000

/** 轮播 tip：文本 + 权重（高权重更常出现）。 */
export interface FooterTip {
  text: string
  weight: number
}

/**
 * 轮播提示表（纯数据）：基础操作高频（weight 3），新功能/配置类 weight 2，
 * 其余 1。新增命令时在此补一条即可让用户在空闲态可发现。
 */
export const FOOTER_TIPS: readonly FooterTip[] = [
  { text: '/ 命令 · ctrl+p 面板', weight: 3 },
  { text: '/info 输入区信息密度', weight: 2 },
  { text: '/density 紧凑渲染', weight: 2 },
  { text: 'shift+tab 模式循环', weight: 1 },
  { text: '/glance 隐藏 metrics 段', weight: 1 },
  { text: '/preset 切换 agent 面', weight: 1 },
  { text: '/theme 换主题', weight: 1 },
  { text: 'ctrl+o 展开推理', weight: 1 },
  { text: 'ctrl+n 新会话 · ctrl+s 恢复', weight: 1 },
  { text: '/help 全部命令', weight: 1 },
]

/** 权重展开序列（index 取模即得轮播序；展开缓存避免每次重算）。 */
const TIP_SEQUENCE: readonly string[] = (() => {
  const seq: string[] = []
  for (const t of FOOTER_TIPS) {
    for (let i = 0; i < t.weight; i++) seq.push(t.text)
  }
  return seq
})()

/** 按序号取轮播提示（确定性；index 取模权重序列）。 */
export function footerTipForIndex(index: number): string {
  if (TIP_SEQUENCE.length === 0) return ''
  return TIP_SEQUENCE[((index % TIP_SEQUENCE.length) + TIP_SEQUENCE.length) % TIP_SEQUENCE.length]!
}

/** 当前轮播序号：now 按 FOOTER_TIP_ROTATE_MS 分片。 */
export function footerTipIndex(now: number = Date.now()): number {
  return Math.floor(now / FOOTER_TIP_ROTATE_MS)
}

/** formatFooterInfo 的渲染输入（行 1 输入 + 档位 + 行 2 指标数据源）。 */
export interface FormatFooterInfoInput extends FormatPromptFooterInput {
  /** 信息密度档位：full 两行 / compact 仅状态行 / off 全关（缺省 full）。 */
  level?: FooterInfoLevel
  /** 指标段（行 2 数据源）；缺省或空 metrics 不渲染行 2。 */
  metrics?: FormatGlanceBarInput
}

/**
 * 按档位组装分层 footer：行 1 状态行（mode + 提示 + 状态右段），行 2 指标行。
 * full 两行 / compact 仅行 1 / off 空。对齐 kimi-code footer 的两行分层：
 * 状态（mode/model/API/git）与指标（context/tokens/cost）分置，指标行弱化可整体摘除。
 * @param input - 行 1 输入、档位与行 2 指标数据。
 * @param theme - 当前主题。
 * @returns 0-2 行 ANSI；每行显示宽度 ≤ width。
 */
export function formatFooterInfo(input: FormatFooterInfoInput, theme: RivetTheme): string[] {
  const level = input.level ?? 'full'
  if (level === 'off') return []
  const lines = formatPromptFooter(input, theme)
  if (level === 'compact' || input.metrics === undefined) return lines
  const metricLines = formatGlanceMetricsLine({ ...input.metrics, width: input.width }, theme)
  if (metricLines.length === 0) return lines
  return [...lines, metricLines[0].text]
}

/**
 * 右侧状态段（行 1 右对齐区）：纯文本或带丢段优先级的段对象。
 * priority 数值**大**的先丢；缺省取数组下标（靠后者先丢——与旧字符串
 * 数组「从后丢」语义一致，字符串元素因此无需迁移）。次要的段（如 git ●N）
 * 给大 priority，重要段给小 priority 或用字符串靠前排。
 */
export interface FooterRightSegment {
  text: string
  /** 丢段优先级：数值大者先丢；缺省 = 数组下标。 */
  priority?: number
}

/** formatPromptFooter 的渲染输入。 */
export interface FormatPromptFooterInput {
  width: number
  /** plan 模式已生效（mode 段渲染 [plan]）。 */
  planActive?: boolean
  /** plan 切换待请求边界落地（渲染 [plan…]，优先于 planActive）。 */
  planPending?: boolean
  /** always-approve 生效（mode 段渲染 [auto]）。 */
  alwaysApprove?: boolean
  /** 审批挂起：快捷键换成审批决策键位（y/p/t/a/n/f/esc），避免仍提示「Enter 发送」。 */
  approvalPending?: boolean
  /** 检查类面板打开：提示 esc 关闭。 */
  inspectOpen?: boolean
  /** 审批挂起提示段覆盖（action registry 投影，见 actions/projections）；缺省用内置文案。 */
  approvalHints?: readonly string[]
  /** 检查面板提示段覆盖（同上）；缺省用内置文案。 */
  inspectHints?: readonly string[]
  /** 右侧状态段（token/模型/API 等）；右对齐合并进同一行，放不下按 priority 丢段。 */
  rightSegments?: readonly (string | FooterRightSegment)[]
  /**
   * 轮播序号（空闲态提示用；缺省按当前时间分片——测试注入固定值保证确定）。
   * 上下文态（审批/检查面板）忽略此参数，始终显示操作提示。
   */
  tipIndex?: number
}

/** 审批挂起提示段缺省文案（与 actions/builtin-actions 的 approval 域 footerHint 同源对齐）。 */
const DEFAULT_APPROVAL_HINTS: readonly string[] =
  ['y 允许', 'p 此命令不再问', 't 记住此工具', 'a 全放行', 'n 拒绝', 'f 拒绝并说明', 'esc 取消']

/** 检查面板提示段缺省文案（inspect.close 动作 footerHint + 静态「/ 命令」尾段）。 */
const DEFAULT_INSPECT_HINTS: readonly string[] = ['esc 关闭', '/ 命令']

/**
 * 审批提示段「长文案→短文案」中间档（显式分级的第一级）：key 为段首键位
 * token。y/n/esc 文案已最短不收缩；未登记的自定义段原样保留。
 */
const APPROVAL_HINT_SHORT: Readonly<Record<string, string>> = {
  p: 'p 不再问',
  t: 't 记住',
  a: 'a 放行',
  f: 'f 拒绝说明',
}

/**
 * 审批提示段整段丢弃位次（中间档仍超宽后启用）：数值小者先丢，
 * 即 esc→f→n→a→p→t；未登记的自定义段位次 6（核心决策键之后）；y 段
 * 恒留（不入丢段序）。
 */
const APPROVAL_DROP_RANK: Readonly<Record<string, number>> = {
  esc: 0, f: 1, n: 2, a: 3, p: 4, t: 5,
}

/** 提示段首键位 token（首个空白前；'y 允许'→'y'、'esc 取消'→'esc'）。 */
function hintKey(seg: string): string {
  return seg.split(/\s/, 1)[0] ?? seg
}

/**
 * 审批态降级梯队：全长文案 → 全短文案（中间档）→ 按 APPROVAL_DROP_RANK
 * 逐段丢（短文案形态；同位次靠后者先丢，y 段永不入队）。
 * @param hints - 审批提示段（缺省文案或 action registry 投影）。
 * @returns 逐级候选段集，渲染方取第一个放得下的梯队。
 */
function approvalHintTiers(hints: readonly string[]): string[][] {
  const short = hints.map(s => APPROVAL_HINT_SHORT[hintKey(s)] ?? s)
  const tiers: string[][] = [[...hints]]
  if (short.some((s, i) => s !== hints[i])) tiers.push([...short])
  const dropOrder = hints
    .map((seg, index) => ({ index, rank: hintKey(seg) === 'y' ? Number.POSITIVE_INFINITY : (APPROVAL_DROP_RANK[hintKey(seg)] ?? 6) }))
    .filter(e => Number.isFinite(e.rank))
    .sort((a, b) => a.rank - b.rank || b.index - a.index)
  let rest = short.map((text, index) => ({ text, index }))
  for (const { index } of dropOrder) {
    rest = rest.filter(e => e.index !== index)
    tiers.push(rest.map(e => e.text))
  }
  return tiers
}

/**
 * 空闲/检查态降级梯队：从后整段丢（现状语义——tip/inspect 段先丢，mode 保底）。
 * @param hints - 轮播 tip 单段或检查面板提示段。
 * @returns 逐级候选段集（逐次少一个尾段）。
 */
function suffixTiers(hints: readonly string[]): string[][] {
  const tiers: string[][] = []
  for (let n = hints.length; n >= 1; n--) tiers.push(hints.slice(0, n))
  return tiers
}

/**
 * 渲染底部 footer：mode 段 + 快捷键提示段，右侧状态段右对齐合并进同一行。
 * 空闲态提示按 tipIndex 轮播（10s 一片）；审批/检查面板等上下文态固定操作提示。
 * 左段超宽走显式分级降级（审批态：中间档 → 位次丢段；空闲/检查态：从后丢）。
 * @param input - 宽度、模式徽标、右侧状态段与轮播序号。
 * @param theme - 当前主题（plan/auto 徽标走 warning/error；其余用雾蓝 chrome）。
 * @returns 单行 ANSI；任何宽度下 ≤ width。
 */
export function formatPromptFooter(input: FormatPromptFooterInput, theme: RivetTheme): string[] {
  const { width, planActive, planPending, alwaysApprove } = input
  const badge = planPending === true ? ' [plan…]' : planActive === true ? ' [plan]' : ''
  const auto = alwaysApprove === true ? ' [auto]' : ''
  const mode = `normal${badge}${auto}`
  const modeColor = planPending === true || planActive === true
    ? theme.warning
    : alwaysApprove === true ? theme.error : CHROME_INACTIVE_SHIMMER
  const tiers = input.approvalPending === true
    ? approvalHintTiers(input.approvalHints ?? DEFAULT_APPROVAL_HINTS)
    : suffixTiers(input.inspectOpen === true
        ? (input.inspectHints ?? DEFAULT_INSPECT_HINTS)
        : [footerTipForIndex(input.tipIndex ?? footerTipIndex())])
  // 取第一个放得下的梯队；全部放不下时退化为 mode 单段（mode 恒保留）。
  for (const segs of tiers) {
    const text = [mode, ...segs].join(' · ')
    if (displayWidth(text) > width) continue
    const parts = [color(mode, modeColor)]
    for (const s of segs) {
      parts.push(color(s, CHROME_SUBTLE))
    }
    const leftAnsi = parts.join(' · ')
    const right = input.rightSegments
    if (right !== undefined && right.length > 0) {
      return mergeRightSegments(leftAnsi, text, right, width)
    }
    return [leftAnsi]
  }
  return [color(mode, modeColor)]
}

/**
 * 左侧 + 右侧状态段合并为一行（右对齐）；右段放不下时按 priority 丢段
 * （数值大者先丢，并列时靠后者先丢；保活段仍按数组序展示）。
 * @param leftAnsi - 已着色的左侧文本。
 * @param leftPlain - 左侧纯文本（宽度度量用）。
 * @param right - 右侧状态段（字符串或 { text, priority } 段对象）。
 * @param width - 目标行宽。
 * @returns 合并后的单行 ANSI。
 */
function mergeRightSegments(
  leftAnsi: string,
  leftPlain: string,
  right: readonly (string | FooterRightSegment)[],
  width: number,
): string[] {
  // 归一化：字符串段 / 缺省 priority 取数组下标（靠后者先丢，兼容旧语义）。
  const segs = right.map((s, i) => typeof s === 'string'
    ? { text: s, priority: i }
    : { text: s.text, priority: s.priority ?? i })
  // 丢段序：priority 降序（大者先丢）；同 priority 靠后者先丢。
  const dropOrder = segs
    .map((_, index) => index)
    .sort((a, b) => (segs[b]?.priority ?? 0) - (segs[a]?.priority ?? 0) || b - a)
  const alive = segs.map(() => true)
  for (const drop of dropOrder) {
    const cur = segs.filter((_, i) => alive[i] === true)
    if (cur.length === 0) return [leftAnsi]
    const rightPlain = cur.map(s => s.text).join(' · ')
    const pad = width - displayWidth(leftPlain) - displayWidth(rightPlain)
    if (pad >= 0) {
      const rightAnsi = cur.map(s => color(s.text, CHROME_INACTIVE_SHIMMER)).join(' · ')
      return [`${leftAnsi}${' '.repeat(pad)}${rightAnsi}`]
    }
    alive[drop] = false
  }
  return [leftAnsi]
}
