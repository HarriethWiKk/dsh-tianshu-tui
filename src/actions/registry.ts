/**
 * actions/registry — 动作注册表：match + 同域键位冲突校验 + confirmMs 双击布防。
 *
 * - match：注册序返回首个「绑定命中且 when 通过」的动作（同键多动作靠 when
 *   与注册序分流，如 Esc 的打断/关面板/双击 rewind 三连）。
 * - 冲突校验（对标 Codex validate_conflicts）：同 context + 键位重叠 +
 *   双方均无 when 守卫 → 登记即抛错（无守卫的同键重复必是笔误）。
 * - confirmMs 布防：双击确认窗口的布防时间戳集中在此（原 app.ts 的
 *   ctrlCPendingSince / escRewindPendingSince 两个散字段）；sweepConfirms
 *   在每次键路由入口清扫——非触发键到达即撤防（对齐原「非同键打断」语义）。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/actions/registry
 */

import type { KeyPress } from '../engine/input-handler.js'
import type {
  ActionContext,
  ActionPhase,
  ActionScope,
  KeyAction,
  KeyBinding,
} from './types.js'

/** 双击 Esc 触发 rewind 的确认窗口（ms；对齐 Claude Code Esc+Esc 时间回溯）。 */
export const REWIND_DOUBLE_ESC_MS = 1000

/** 空闲 Ctrl+C 连按退出的确认窗口（ms；「再按 Ctrl+C 退出」提示同源）。 */
export const EXIT_WINDOW_MS = 2000

/** 绑定命中判定：给定字段全部相等（缺省字段不约束——{name:'up'} 不区分 meta）。 */
export function matchesBinding(binding: KeyBinding, key: KeyPress): boolean {
  if (binding.name !== undefined && key.name !== binding.name) return false
  if (binding.char !== undefined && key.char !== binding.char) return false
  if (binding.meta !== undefined && key.meta !== binding.meta) return false
  return true
}

/**
 * 两绑定是否可能命中同一个键：name/char/meta 双方都指定的字段须一致；
 * 一方指定 name 另一方指定 char 的交叉情形，仅当 name 为 'unknown'（可打印
 * 字符的到达名）时才可能同键命中——具体控制名（ctrl_n 等）到达时 char 恒为
 * ''，与 char 绑定不可能同键到达。
 */
function bindingsOverlap(a: KeyBinding, b: KeyBinding): boolean {
  if (a.name !== undefined && b.name !== undefined && a.name !== b.name) return false
  if (a.char !== undefined && b.char !== undefined && a.char !== b.char) return false
  if (a.meta !== undefined && b.meta !== undefined && a.meta !== b.meta) return false
  if (a.name !== undefined && b.char !== undefined && a.name !== 'unknown') return false
  if (b.name !== undefined && a.char !== undefined && b.name !== 'unknown') return false
  return true
}

/**
 * 同域键位冲突校验：同 context（缺省 global）+ 键位重叠 + 双方均无 when 守卫
 * → 抛错。任一方有 when 视为有意的优先级分流（运行时按注册序消解），放行。
 * @param actions - 待校验动作表。
 * @throws 发现冲突时抛出携带双方 id 的错误。
 */
export function validateActionConflicts(actions: readonly KeyAction[]): void {
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i]
    /* v8 ignore next -- 下标恒在界内；noUncheckedIndexedAccess 防御 */
    if (a === undefined) continue
    for (let j = i + 1; j < actions.length; j++) {
      const b = actions[j]
      /* v8 ignore next -- 同上 */
      if (b === undefined) continue
      if ((a.context ?? 'global') !== (b.context ?? 'global')) continue
      if (a.when !== undefined || b.when !== undefined) continue
      const overlap = a.keys.some(ka => b.keys.some(kb => bindingsOverlap(ka, kb)))
      if (overlap) {
        throw new Error(`action 键位冲突: ${a.id} 与 ${b.id}（同域同键且均无 when 守卫）`)
      }
    }
  }
}

/** match 过滤条件（缺省不过滤——按注册序扫全表）。 */
export interface MatchOptions {
  /** 只匹配该路由相位（handleKey 各调用点按相位分流）。 */
  phase?: ActionPhase
  /** 只匹配该作用域（approval 阻塞上下文轮询用）。 */
  context?: ActionScope
}

/**
 * 动作注册表：登记（含冲突校验）、按键匹配、confirmMs 双击布防。
 * 动作表只读消费（list/get 给投影层）；布防状态随键路由演进。
 */
export class ActionRegistry {
  private readonly actions: KeyAction[] = []
  /** confirmMs 布防时间戳（action id → armed at；缺失 = 未布防）。 */
  private readonly confirms = new Map<string, number>()

  constructor(actions: readonly KeyAction[] = []) {
    for (const action of actions) this.register(action)
  }

  /**
   * 登记动作：同 id 重复或引入同域键位冲突即抛错（构造期 fails loud）。
   * @param action - 动作条目。
   */
  register(action: KeyAction): void {
    if (this.actions.some(a => a.id === action.id)) {
      throw new Error(`action id 重复: ${action.id}`)
    }
    validateActionConflicts([...this.actions, action])
    this.actions.push(action)
  }

  /** 全部动作（注册序；keymap/footer 投影数据源）。 */
  list(): readonly KeyAction[] {
    return this.actions
  }

  /** 按 id 取动作（confirmMs 窗口查询与投影锚点用）。 */
  get(id: string): KeyAction | undefined {
    return this.actions.find(a => a.id === id)
  }

  /**
   * 键位匹配：注册序首个「绑定命中且 when 通过」的动作；无命中返回 null。
   * @param key - 按键事件。
   * @param ctx - when 守卫读取的操作面。
   * @param opts - 相位/作用域过滤。
   */
  match(key: KeyPress, ctx: ActionContext, opts?: MatchOptions): KeyAction | null {
    for (const action of this.actions) {
      if (opts?.phase !== undefined && (action.phase ?? 'main') !== opts.phase) continue
      if (opts?.context !== undefined && (action.context ?? 'global') !== opts.context) continue
      if (!action.keys.some(binding => matchesBinding(binding, key))) continue
      if (action.when !== undefined && !action.when(ctx)) continue
      return action
    }
    return null
  }

  /**
   * 双击布防清扫（每次键路由入口调用）：非某 confirmMs 动作触发键的键到达
   * → 撤防该动作（对齐原「任何非 Ctrl+C 键清 ctrlCPendingSince」语义）。
   * @param key - 本次到达的按键。
   */
  sweepConfirms(key: KeyPress): void {
    for (const action of this.actions) {
      if (action.confirmMs === undefined) continue
      if (!action.keys.some(binding => matchesBinding(binding, key))) {
        this.confirms.delete(action.id)
      }
    }
  }

  /** 布防（首次触发记录时间戳）。 */
  confirmArm(id: string, now: number): void {
    this.confirms.set(id, now)
  }

  /**
   * 窗口内已布防（窗口取自动作定义的 confirmMs；动作缺失或未声明窗口恒 false）。
   * @returns true = 本次为窗口内第二次触发。
   */
  confirmWithin(id: string, now: number): boolean {
    const since = this.confirms.get(id)
    const windowMs = this.get(id)?.confirmMs
    if (since === undefined || windowMs === undefined) return false
    return now - since < windowMs
  }

  /** 撤防。 */
  confirmDisarm(id: string): void {
    this.confirms.delete(id)
  }

  /** 布防时间戳（「再按 Ctrl+C 退出」提示行数据源）；未布防为 0。 */
  confirmSince(id: string): number {
    return this.confirms.get(id) ?? 0
  }
}
