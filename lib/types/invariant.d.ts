/**
 * Runtime invariant companion for @deepseek-ai/dsh-tianshu-tui.
 *
 * The TUI is a terminal presentation layer: every stream it renders
 * (session/event, approval/request, subagent/*, workflow/*) is owned and
 * asserted by the emitting package, and the runner's own mutable state
 * (transcript view, live region, pending interaction) is process-local UI
 * state asserted behaviorally by package tests and the real-composition
 * suite. No cross-plugin event/data relation is owned here.
 *
 * @module @deepseek-ai/dsh-tianshu-tui/invariant
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "tui-invariant";
/** Service required before the companion can reserve package ownership. */
export declare const inject: string[];
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
