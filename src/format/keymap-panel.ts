/**
 * 快捷键面板（grok-build Ctrl+. 键位清单弹层移植）。
 *
 * 纯函数层：keymapEntries 由 action registry（actions/builtin-actions）投影
 * 生成 + 输入层静态补充行（Enter 提交、Ctrl+U 等 InputLine 内部键位不经
 * registry 路由）归并，kitty 键盘增强才可达的键位按终端能力（env）过滤——
 * 键位提示单一事实来源是动作表。renderKeymapPanel 把条目渲染为两列对齐行
 * （键位左列 + 动作右列），窄宽降级为单列紧凑行、超宽截断不破版。TuiApp 把
 * 它注册为 overlay 渲染器，Ctrl+. 触发进出。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/format/keymap-panel
 */

import { createBuiltinActions } from '../actions/builtin-actions.js'
import { projectKeymapEntries, type ProjectedKeymapEntry } from '../actions/projections.js'
import { supportsKittyKeyboard } from '../term-caps.js'
import { displayWidth } from '../width.js'

/** 快捷键面板条目：键位 + 动作说明。 */
export interface KeymapEntry {
  /** 键位组合（如 'Ctrl+P'）。 */
  keys: string
  /** 动作说明（如 '命令面板'）。 */
  action: string
}

/**
 * 输入层静态补充行（InputLine/slash 菜单内部键位，不经 action registry 路由；
 * order 与动作表的 keymapOrder 归并对齐原表序）。
 */
const INPUT_LAYER_ROWS: readonly (ProjectedKeymapEntry & { order: number })[] = [
  { order: 10, keys: 'Enter', action: '发送' },
  { order: 20, keys: 'Shift+Enter', action: '换行（或 \\+Enter 续行）' },
  { order: 130, keys: 'Ctrl+U', action: '删除到行首' },
  { order: 160, keys: 'Tab', action: '@-路径补全 / 接受 slash 选中项' },
  { order: 180, keys: 'PageUp/PageDown', action: 'slash 菜单翻页' },
  { order: 190, keys: 'Alt+W', action: '复制选区到系统剪贴板（OSC52）' },
]

/**
 * 当前实现的完整快捷键表（新增键位时在 actions/builtin-actions 登记，面板自动跟随）。
 * 与 README 快捷键表同源维护；审批卡的 y/N/a/Ctrl+C 为上下文键位（context:
 * 'approval'，由审批卡自带提示承担），不在此列。kitty 键盘增强才可达的键位
 * （requiresKittyKeyboard，如 Ctrl+Enter）按终端能力过滤——不支持的终端行隐身。
 * 渲染期现取（不作模块级缓存）：终端能力读 env，显式注入便于测试确定性。
 * @param env - 环境变量（测试注入用，缺省 process.env）。
 * @returns 归并排序后的 keymap 条目。
 */
export function keymapEntries(env: NodeJS.ProcessEnv = process.env): KeymapEntry[] {
  return projectKeymapEntries(
    // editorKey 取缺省 ctrl_e 投影（与改动前的静态表一致）。
    createBuiltinActions({ editorKey: 'ctrl_e' }),
    INPUT_LAYER_ROWS,
    { kittyKeyboard: supportsKittyKeyboard(env) },
  )
}

/** 键位列宽：最长键位 + 2 列间隔。 */
function keyColumnWidth(entries: readonly KeymapEntry[]): number {
  let max = 0
  for (const entry of entries) {
    const w = displayWidth(entry.keys)
    if (w > max) max = w
  }
  return max + 2
}

/**
 * 渲染快捷键面板为行数组：标题 + 两列对齐条目。
 * 宽度不足时动作列按剩余宽度截断；极端窄宽（连键位列都放不下）降级为
 * 紧凑单列 `键位 动作`（不截断键位，动作截断）。
 * @param width - 终端列数。
 * @param env - 环境变量（终端能力行过滤用，缺省 process.env）。
 * @returns ANSI 行数组（无着色——overlay 面板由上层统一取色）。
 */
export function renderKeymapPanel(width: number, env: NodeJS.ProcessEnv = process.env): string[] {
  const entries = keymapEntries(env)
  const title = '快捷键'
  const rows: string[] = [title, '']
  if (width < 12) return rows
  const keyCol = keyColumnWidth(entries)
  // 键位列外还有 1 列前导空格：动作预算要再减 1，否则截断绑定宽度时
  // 整行显示宽度超出 1 列（窄宽破版——length 度量测不出，见 spec 的 width 断言）。
  const actionBudget = Math.max(1, width - keyCol - 1)
  for (const entry of entries) {
    if (keyCol >= width) {
      // 极端窄宽：紧凑单列，键位不截断、动作截断
      const compact = ` ${entry.keys} ${entry.action}`
      rows.push(compact.slice(0, width))
      continue
    }
    const padded = ` ${entry.keys}${' '.repeat(keyCol - displayWidth(entry.keys))}`
    const action = displayWidth(entry.action) > actionBudget
      ? truncateByWidth(entry.action, actionBudget)
      : entry.action
    rows.push(`${padded}${action}`)
  }
  return rows
}

/** 按显示宽度截断字符串（尾部补 …）。 */
function truncateByWidth(text: string, max: number): string {
  let out = ''
  let w = 0
  for (const ch of text) {
    const cw = displayWidth(ch)
    if (w + cw > max - 1) break
    out += ch
    w += cw
  }
  return `${out}…`
}
