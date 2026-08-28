/**
 * 输入历史持久化 — ~/.dsh-tui/input-history.json（上游 Tianshu history.ts 模式移植）。
 *
 * 语义（对本仓内存态的持久化版，去重更强）：
 * - trim 后空串 no-op；对全列表去重（重复提交浮到头部）；上限 MAX_INPUT_HISTORY。
 * - 追加 = 进程内串行队列 + 每次重读合并再原子写：快速连续提交不丢条目；
 *   多进程并发按 last-writer-wins（原子写保证文件永不损坏，仅可能互相覆盖）。
 * - 容错：损坏/缺失 → 空历史；写失败静默（历史是优化不是正确性依赖）。
 * - 隐私注记（docs/configuration.md）：文件内容为用户输入原文，删文件即清空。
 *
 * @module @huiliyi37/dsh-tianshu-tui/input-history
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const MAX_INPUT_HISTORY = 1000

export function defaultInputHistoryPath(): string {
  return join(homedir(), '.dsh-tui', 'input-history.json')
}

/** 读历史；缺失/损坏/非字符串数组 → 空历史。 */
export function loadInputHistory(path: string): string[] {
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    if (!Array.isArray(raw)) return []
    return raw.filter((v): v is string => typeof v === 'string').slice(0, MAX_INPUT_HISTORY)
  } catch {
    return []
  }
}

/** 原子写历史。 */
function saveInputHistory(path: string, history: readonly string[]): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    const tmp = `${path}.${process.pid}.tmp`
    writeFileSync(tmp, `${JSON.stringify(history, null, 2)}\n`)
    renameSync(tmp, path)
  } catch {
    // best-effort：磁盘不可写时保持内存态（不持久化但功能不受影响）
  }
}

/** 提交后的下一份历史（纯函数）：trim、空串 no-op、全列表去重、限长。 */
export function nextHistoryAfterSubmit(history: readonly string[], entry: string): string[] {
  const trimmed = entry.trim()
  if (trimmed === '') return [...history]
  return [trimmed, ...history.filter(h => h !== trimmed)].slice(0, MAX_INPUT_HISTORY)
}

/**
 * fish 式历史建议（ghost）：最近一条以 value 为前缀的历史条目的剩余部分。
 * 历史按最近在前排列，首个匹配即最近条目；等长（无剩余）与剩余部分含换行
 * 的条目跳过（ghost 只渲染在光标行尾，多行建议无意义）。空 value → null。
 */
export function historyGhostSuffix(history: readonly string[], value: string): string | null {
  if (value === '') return null
  for (const entry of history) {
    if (entry.length <= value.length || !entry.startsWith(value)) continue
    if (entry.includes('\n', value.length)) continue
    return entry.slice(value.length)
  }
  return null
}

// 进程内追加串行队列：上次写完成（或失败）后才进行下一次 读-合并-写。
let appendQueue: Promise<void> = Promise.resolve()

/**
 * 追加一条输入历史（异步，不阻塞调用方——提交路径延迟敏感）。
 * 每次都重读文件再合并：多会话/多进程下的最新文件状态优先，本进程新条目置顶。
 */
export function appendInputHistory(path: string, entry: string): Promise<void> {
  const pending = appendQueue.then(() => {
    saveInputHistory(path, nextHistoryAfterSubmit(loadInputHistory(path), entry))
  })
  // 失败不堵塞后续追加，但把异常保留给本次调用方
  appendQueue = pending.catch(() => {})
  return pending
}

/** 测试密封门（同 prefs.ts）：VITEST 下默认 null，显式 path 优先。 */
export function inputHistoryEnabled(explicitPath: string | null | undefined): string | null {
  if (explicitPath !== undefined) return explicitPath
  const env = process.env
  if (env.VITEST === 'true' || env.VITEST === '1') return null
  return defaultInputHistoryPath()
}
