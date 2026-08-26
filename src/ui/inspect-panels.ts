/**
 * inspect-panels — 检查类 live 面板（/config /skills /status /lsp /tasks）
 * 互斥开闭与键语义。监控类面板（todos/subagents/workflow）不在此列。
 *
 * @module @huiliyi37/dsh-tianshu-tui/ui/inspect-panels
 */

import { displayWidth } from '../width.js'

export type InspectPanel = 'config' | 'skills' | 'status' | 'lsp' | 'tasks'

export interface InspectPanelFlags {
  config: boolean
  skills: boolean
  status: boolean
  lsp: boolean
  tasks: boolean
}

export type InspectKeyAction =
  | { type: 'close' }
  | { type: 'notify' }
  | { type: 'density' }
  | { type: 'skills-move'; delta: -1 | 1 }

/** 打开 which；open=false 时五项全关。 */
export function exclusiveInspect(which: InspectPanel, open: boolean): InspectPanelFlags {
  return {
    config: open && which === 'config',
    skills: open && which === 'skills',
    status: open && which === 'status',
    lsp: open && which === 'lsp',
    tasks: open && which === 'tasks',
  }
}

export function anyInspectOpen(flags: InspectPanelFlags): boolean {
  return flags.config || flags.skills || flags.status || flags.lsp || flags.tasks
}

export function inspectKeyAction(input: {
  name: string
  char: string
  empty: boolean
  vimInsert: boolean
  flags: InspectPanelFlags
}): InspectKeyAction | null {
  if (input.name === 'escape' && anyInspectOpen(input.flags)) return { type: 'close' }
  if (!input.empty || !input.vimInsert) return null
  if (input.flags.config && (input.char === 'n' || input.char === 'N')) return { type: 'notify' }
  if (input.flags.config && (input.char === 'd' || input.char === 'D')) return { type: 'density' }
  if (input.flags.skills) {
    if (input.name === 'up' || input.char === 'k') return { type: 'skills-move', delta: -1 }
    if (input.name === 'down' || input.char === 'j') return { type: 'skills-move', delta: 1 }
  }
  return null
}

/** 检查面板底栏；窄宽截断。 */
export function inspectHint(width: number, extras: readonly string[] = []): string {
  const text = [...extras, 'Esc 关闭'].join(' · ')
  if (width <= 1) return '…'
  let out = ''
  let w = 0
  for (const ch of text) {
    const cw = displayWidth(ch)
    if (w + cw > width - 1) break
    out += ch
    w += cw
  }
  return w < displayWidth(text) ? `${out}…` : out
}
