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
import type { KeyPress } from '../engine/input-handler.js';
import type { ActionContext, ActionPhase, ActionScope, KeyAction, KeyBinding } from './types.js';
/** 双击 Esc 触发 rewind 的确认窗口（ms；对齐 Claude Code Esc+Esc 时间回溯）。 */
export declare const REWIND_DOUBLE_ESC_MS = 1000;
/** 空闲 Ctrl+C 连按退出的确认窗口（ms；「再按 Ctrl+C 退出」提示同源）。 */
export declare const EXIT_WINDOW_MS = 2000;
/** 绑定命中判定：给定字段全部相等（缺省字段不约束——{name:'up'} 不区分 meta）。 */
export declare function matchesBinding(binding: KeyBinding, key: KeyPress): boolean;
/**
 * 同域键位冲突校验：同 context（缺省 global）+ 键位重叠 + 双方均无 when 守卫
 * → 抛错。任一方有 when 视为有意的优先级分流（运行时按注册序消解），放行。
 * @param actions - 待校验动作表。
 * @throws 发现冲突时抛出携带双方 id 的错误。
 */
export declare function validateActionConflicts(actions: readonly KeyAction[]): void;
/** match 过滤条件（缺省不过滤——按注册序扫全表）。 */
export interface MatchOptions {
    /** 只匹配该路由相位（handleKey 各调用点按相位分流）。 */
    phase?: ActionPhase;
    /** 只匹配该作用域（approval 阻塞上下文轮询用）。 */
    context?: ActionScope;
}
/**
 * 动作注册表：登记（含冲突校验）、按键匹配、confirmMs 双击布防。
 * 动作表只读消费（list/get 给投影层）；布防状态随键路由演进。
 */
export declare class ActionRegistry {
    private readonly actions;
    /** confirmMs 布防时间戳（action id → armed at；缺失 = 未布防）。 */
    private readonly confirms;
    constructor(actions?: readonly KeyAction[]);
    /**
     * 登记动作：同 id 重复或引入同域键位冲突即抛错（构造期 fails loud）。
     * @param action - 动作条目。
     */
    register(action: KeyAction): void;
    /** 全部动作（注册序；keymap/footer 投影数据源）。 */
    list(): readonly KeyAction[];
    /** 按 id 取动作（confirmMs 窗口查询与投影锚点用）。 */
    get(id: string): KeyAction | undefined;
    /**
     * 键位匹配：注册序首个「绑定命中且 when 通过」的动作；无命中返回 null。
     * @param key - 按键事件。
     * @param ctx - when 守卫读取的操作面。
     * @param opts - 相位/作用域过滤。
     */
    match(key: KeyPress, ctx: ActionContext, opts?: MatchOptions): KeyAction | null;
    /**
     * 双击布防清扫（每次键路由入口调用）：非某 confirmMs 动作触发键的键到达
     * → 撤防该动作（对齐原「任何非 Ctrl+C 键清 ctrlCPendingSince」语义）。
     * @param key - 本次到达的按键。
     */
    sweepConfirms(key: KeyPress): void;
    /** 布防（首次触发记录时间戳）。 */
    confirmArm(id: string, now: number): void;
    /**
     * 窗口内已布防（窗口取自动作定义的 confirmMs；动作缺失或未声明窗口恒 false）。
     * @returns true = 本次为窗口内第二次触发。
     */
    confirmWithin(id: string, now: number): boolean;
    /** 撤防。 */
    confirmDisarm(id: string): void;
    /** 布防时间戳（「再按 Ctrl+C 退出」提示行数据源）；未布防为 0。 */
    confirmSince(id: string): number;
}
