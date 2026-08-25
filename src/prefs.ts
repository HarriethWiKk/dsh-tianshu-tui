/**
 * 本地偏好持久化层 — ~/.dsh-tui/prefs.json（theme/density/preset/常驻面板/glance 段）。
 *
 * 设计约束：
 * - 容错优先：损坏/缺失/未知 key 静默降级为空偏好（缺省 = 现行为），绝不阻塞启动。
 * - 原子写：tmp + rename（同 update-cache 模式），写失败 best-effort 静默。
 * - 测试密封门：VITEST 环境默认不落真实 home（沿 self-update 的 env 判定先例）；
 *   显式传 path（测试 tmp 目录）时才启用读写。
 *
 * @module @huiliyi37/dsh-tianshu-tui/prefs
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** glance 可隐藏段（model/stalled 为身份/告警段，永不可隐藏）。 */
export const GLANCE_HIDEABLE_SEGMENTS = ['effort', 'cache', 'context', 'tokens', 'elapsed', 'cost'] as const
export type GlanceHideableSegment = (typeof GLANCE_HIDEABLE_SEGMENTS)[number]

/** 常驻监控面板（可持久化显隐；config/skills 等模态面板不持久化）。 */
export const PERSISTED_PANELS = ['subagents', 'workflow'] as const
export type PersistedPanel = (typeof PERSISTED_PANELS)[number]

/** 偏好文件形状（全部可选；未知 key 读取时丢弃，前向兼容）。 */
export interface TuiPrefs {
  /** 主题名（内置名 | custom:<name> | 'auto'）。 */
  theme?: string
  /** 紧凑工具卡渲染（/density）。 */
  compactMode?: boolean
  /** 常驻监控面板启动显隐。 */
  panels?: Partial<Record<PersistedPanel, boolean>>
  /** glance/footer 隐藏段。 */
  glance?: { hideSegments?: GlanceHideableSegment[] }
  /** 新会话默认 agent 预设 id（/preset … default）。 */
  preset?: string
}

/** 缺省偏好（= 现行为）。 */
export const DEFAULT_PREFS: Readonly<TuiPrefs> = {}

export function defaultPrefsPath(): string {
  return join(homedir(), '.dsh-tui', 'prefs.json')
}

function isHideableSegment(v: unknown): v is GlanceHideableSegment {
  return typeof v === 'string' && (GLANCE_HIDEABLE_SEGMENTS as readonly string[]).includes(v)
}

/** 解析偏好文本：非法 JSON / 非对象 / 字段形状不对 → 逐项丢弃，永不抛。 */
export function parsePrefs(text: string): TuiPrefs {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return {}
  }
  if (typeof raw !== 'object' || raw === null) return {}
  const obj = raw as Record<string, unknown>
  const prefs: TuiPrefs = {}
  if (typeof obj.theme === 'string' && obj.theme !== '') prefs.theme = obj.theme
  if (typeof obj.preset === 'string' && obj.preset !== '') prefs.preset = obj.preset
  if (typeof obj.compactMode === 'boolean') prefs.compactMode = obj.compactMode
  if (typeof obj.panels === 'object' && obj.panels !== null) {
    const p = obj.panels as Record<string, unknown>
    const panels: Partial<Record<PersistedPanel, boolean>> = {}
    for (const k of PERSISTED_PANELS) {
      if (typeof p[k] === 'boolean') panels[k] = p[k] as boolean
    }
    if (Object.keys(panels).length > 0) prefs.panels = panels
  }
  if (typeof obj.glance === 'object' && obj.glance !== null) {
    const g = obj.glance as Record<string, unknown>
    if (Array.isArray(g.hideSegments)) {
      const segs = g.hideSegments.filter(isHideableSegment)
      if (segs.length > 0) prefs.glance = { hideSegments: segs }
    }
  }
  return prefs
}

/** 读偏好；缺失/损坏 → 空偏好。 */
export function readPrefs(path: string): TuiPrefs {
  try {
    return parsePrefs(readFileSync(path, 'utf-8'))
  } catch {
    return {}
  }
}

/** 原子写偏好（tmp + rename）；失败静默（偏好是优化不是正确性依赖）。 */
export function writePrefs(path: string, prefs: TuiPrefs): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    const tmp = `${path}.${process.pid}.tmp`
    writeFileSync(tmp, `${JSON.stringify(prefs, null, 2)}\n`)
    renameSync(tmp, path)
  } catch {
    // best-effort：磁盘不可写时保持会话态（不持久化但功能不受影响）
  }
}

/**
 * 测试密封门：VITEST 下默认不读写真实 home——显式 path（测试 tmp）优先，
 * 其次 env 未设 VITEST（生产），否则 null（禁用）。
 * 调用方以 `resolvePrefsPath(explicit)` 归一：undefined+VITEST → null。
 */
export function prefsEnabled(explicitPath: string | null | undefined): string | null {
  if (explicitPath !== undefined) return explicitPath
  const env = process.env
  if (env.VITEST === 'true' || env.VITEST === '1') return null
  return defaultPrefsPath()
}
