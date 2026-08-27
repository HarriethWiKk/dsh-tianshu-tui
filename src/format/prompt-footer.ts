/**
 * 底部 footer（format/prompt-footer.ts）— 纯渲染（C4 概念稿 C 三行底部区）。
 *
 * 输入行下方的模式/快捷键提示行：mode 段（normal + [plan]/[plan…]/[auto]
 * 徽标，与 statusline 徽标词汇一致）在前，快捷键提示在后。窄宽从后往前
 * 丢段（轮播 tip → mode），mode 恒保留。
 * 空闲态提示走 10s 轮播（对齐 kimi-code footer tips）：基础操作高频出现，
 * 新功能/配置命令按权重旋转，让用户持续可发现；审批/检查面板等上下文态
 * 优先显示操作提示不轮播。
 * 右侧状态段（token/模型/API 等）右对齐合并进同一行；放不下从后往前丢右段，
 * 绝不另起 theme.primary 第二行。宽度守恒：任何输入下每行显示宽度 ≤ width。
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
  /** 右侧状态段（token/模型/API 等）；右对齐合并进同一行，放不下从后丢段。 */
  rightSegments?: readonly string[]
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
 * 渲染底部 footer：mode 段 + 快捷键提示段，右侧状态段右对齐合并进同一行。
 * 空闲态提示按 tipIndex 轮播（10s 一片）；审批/检查面板等上下文态固定操作提示。
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
  const hints = input.approvalPending === true
    ? [...(input.approvalHints ?? DEFAULT_APPROVAL_HINTS)]
    : input.inspectOpen === true
      ? [...(input.inspectHints ?? DEFAULT_INSPECT_HINTS)]
      : [footerTipForIndex(input.tipIndex ?? footerTipIndex())]
  // 从后往前丢段直到放得下（mode 恒保留）。
  let segs = hints
  for (;;) {
    const text = [mode, ...segs].join(' · ')
    if (displayWidth(text) <= width) {
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
    if (segs.length === 0) break
    segs = segs.slice(0, -1)
  }
  return [color(mode, modeColor)]
}

/**
 * 左侧 + 右侧状态段合并为一行（右对齐）；右段放不下时从后往前丢。
 * @param leftAnsi - 已着色的左侧文本。
 * @param leftPlain - 左侧纯文本（宽度度量用）。
 * @param right - 右侧状态段（纯文本）。
 * @param width - 目标行宽。
 * @returns 合并后的单行 ANSI。
 */
function mergeRightSegments(
  leftAnsi: string,
  leftPlain: string,
  right: readonly string[],
  width: number,
): string[] {
  let rightSegs = [...right]
  for (;;) {
    if (rightSegs.length === 0) return [leftAnsi]
    const rightPlain = rightSegs.join(' · ')
    const pad = width - displayWidth(leftPlain) - displayWidth(rightPlain)
    if (pad >= 0) {
      const rightAnsi = rightSegs.map(s => color(s, CHROME_INACTIVE_SHIMMER)).join(' · ')
      return [`${leftAnsi}${' '.repeat(pad)}${rightAnsi}`]
    }
    rightSegs = rightSegs.slice(0, -1)
  }
}
