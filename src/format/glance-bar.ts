/**
 * metrics 一行条（format/glance-bar.ts）— 纯渲染。
 *
 * segment 组装：预设短名 / model / effort / 缓存% / 上下文%+占用条（近满 ⚠）/ ◧ tokens / elapsed / $cost / #turn / 停滞。
 * 窄宽先摘占用条再 drop 尾部次要段；极窄截断 model 段；任何宽度下不破版。
 */
import { color } from '../engine/ansi.js'
import type { LiveRegionLine } from '../engine/live-engine.js'
import type { RivetTheme } from '../theme.js'
import { displayWidth } from '../width.js'
import { formatElapsedHuman } from './spinner-status.js'

/**
 * token 计数紧凑显示：<1000 原样；<1M 用 `k`（非整时留 1 位小数）；否则 `M` 留 2 位。
 * @param n - token 数。
 * @returns 紧凑计数文本。
 */
export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) {
    const v = n / 1000
    return Number.isInteger(v) ? `${v}k` : `${v.toFixed(1)}k`
  }
  return `${(n / 1_000_000).toFixed(2)}M`
}

/** glance bar 的渲染输入；各段均可选，缺省段不渲染。 */
export interface FormatGlanceBarInput {
  width?: number
  modelName?: string
  /** 当前 agent 预设短名（标准 / PTC / 极简 / 创造）；身份段，不可隐藏。 */
  preset?: string
  /** 推理努力度（request/header 的 config.reasoningEffort；窄宽时随 model 后 drop）。 */
  effort?: string
  cacheHitRate?: number
  contextRatio?: number
  /**
   * 是否在上下文百分比后画占用条。缺省 true（有 contextRatio 即画）；
   * formatGlanceBar 窄宽会先把此项置 false，再丢整个上下文段。
   */
  contextBar?: boolean
  tokens?: { used: number; max: number }
  elapsedMs?: number
  density?: 'compact' | 'full'
  turnCount?: number
  cost?: number
  stalled?: boolean
  ascii?: boolean
  /** 隐藏段（prefs.glance.hideSegments 透传；隐藏段不参与拼接与溢出丢弃）。 */
  hideSegments?: readonly string[]
}

/** 可隐藏段 key（与 prefs.glance.hideSegments 对齐；model/stalled 永不可隐藏）。 */
export const GLANCE_HIDEABLE_KEYS = ['effort', 'cache', 'context', 'tokens', 'elapsed', 'cost'] as const

/** 上下文占用警告阈值（≥ 此比例前缀 ⚠ 提示近满；与 Claude Code context 高水位对齐）。 */
export const CONTEXT_WARN_RATIO = 0.95

/** 上下文占用条格数（已用 ▓ / 剩余 ░；ascii 为 = / -）。 */
export const CONTEXT_BAR_CELLS = 8

/**
 * 上下文占用条：ratio 为已用比例，空格即剩余预算。
 * @param ratio - 已用 / 窗口；越界夹紧到 [0, 1]。
 * @param ascii - true 时用 `[====----]`，避免 block 字符。
 */
export function formatContextBar(ratio: number, ascii = false): string {
  const clamped = Math.min(1, Math.max(0, ratio))
  const filled = Math.round(clamped * CONTEXT_BAR_CELLS)
  const empty = CONTEXT_BAR_CELLS - filled
  if (ascii) return `[${'='.repeat(filled)}${'-'.repeat(empty)}]`
  return `${'▓'.repeat(filled)}${'░'.repeat(empty)}`
}

/**
 * 段组装（纯函数；返回 ANSI 段列表，外层按 ` · ` 拼接）。
 * @param input - metrics 输入；仅组装已提供的段（cost 有值即显示；turn 只在 density full 档）。
 * @returns 无色段文本列表，按固定顺序。
 */
export function glanceBarSegments(input: FormatGlanceBarInput): string[] {
  const hidden = new Set(input.hideSegments ?? [])
  const segs: string[] = []
  if (input.preset !== undefined && input.preset !== '') segs.push(input.preset)
  if (input.modelName !== undefined) segs.push(input.modelName)
  if (input.effort !== undefined && !hidden.has('effort')) segs.push(`◎${input.effort}`)
  if (input.cacheHitRate !== undefined && !hidden.has('cache')) segs.push(`缓存 ${Math.round(input.cacheHitRate * 100)}%`)
  if (input.contextRatio !== undefined && !hidden.has('context')) {
    const warn = input.contextRatio >= CONTEXT_WARN_RATIO
    const label = `${warn ? '⚠' : ''}上下文 ${Math.round(input.contextRatio * 100)}%`
    segs.push(input.contextBar === false
      ? label
      : `${label} ${formatContextBar(input.contextRatio, input.ascii === true)}`)
  }
  if (input.tokens !== undefined && !hidden.has('tokens')) {
    const t = `${formatTokenCount(input.tokens.used)}/${formatTokenCount(input.tokens.max)}`
    segs.push(input.ascii ? `[${t}]` : `◧ ${t}`)
  }
  if (input.elapsedMs !== undefined && !hidden.has('elapsed')) segs.push(formatElapsedHuman(input.elapsedMs))
  if (input.cost !== undefined && !hidden.has('cost')) segs.push(`$${input.cost}`)
  if (input.density === 'full') {
    if (input.turnCount !== undefined) segs.push(`#${input.turnCount}`)
  }
  if (input.stalled) segs.push('停滞')
  return segs
}

function truncateTo(text: string, columns: number): string {
  let out = ''
  for (const ch of text) {
    if (displayWidth(out + ch) > columns) break
    out += ch
  }
  return out
}

/**
 * 一行条渲染：渐进 drop 次要段，极窄只剩 model 并截断；空 metrics 不占位。
 * @param input - metrics 输入（width ≤ 0 或缺省时不渲染）。
 * @param theme - 当前主题（整行 primary 色）。
 * @returns 单行 live 区内容；无可渲染内容返回空数组。
 */
export function formatGlanceBar(input: FormatGlanceBarInput, theme: RivetTheme): LiveRegionLine[] {
  // width 缺省视为 0 → 不渲染（与 width <= 0 短路同语义；exactOptionalPropertyTypes 下
  // 可选字段不自动窄化，undefined 需显式归一才能参与后续宽度比较）。
  const width = input.width ?? 0
  if (width <= 0) return []
  let current: FormatGlanceBarInput = { ...input, width }
  for (;;) {
    const segs = glanceBarSegments(current)
    if (segs.length === 0) return []
    const text = segs.join(' · ')
    if (displayWidth(text) <= width) {
      return [{ text: color(text, theme.primary) }]
    }
    const next: FormatGlanceBarInput = { ...current }
    if (next.stalled) next.stalled = false
    else if (next.elapsedMs !== undefined) delete next.elapsedMs
    else if (next.cost !== undefined) delete next.cost
    else if (next.turnCount !== undefined) delete next.turnCount
    else if (next.tokens !== undefined) delete next.tokens
    else if (next.contextBar !== false && next.contextRatio !== undefined) next.contextBar = false
    else if (next.contextRatio !== undefined) delete next.contextRatio
    else if (next.cacheHitRate !== undefined) delete next.cacheHitRate
    else if (next.effort !== undefined) delete next.effort
    else if (next.preset !== undefined) delete next.preset
    else {
      // 只剩 model：截断
      /* v8 ignore next -- modelName undefined 时不产生 model 段，删光后 segs 为空提前返回，?? 右分支不可达 */
      const modelOnly = next.modelName ?? ''
      return [{ text: color(truncateTo(modelOnly, width), theme.primary) }]
    }
    current = next
  }
}
