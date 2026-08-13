/**
 * Session management surface: listing, lookup, forking, history loading, and
 * teardown flushing. The session log is the authoritative fact source — this
 * module only READS logs and the live store; it never appends events and never
 * disposes agents (a handle's teardown belongs to its holder).
 *
 * @module @deepseek-ai/dsh-tianshu-tui/adapter/sessions
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Session, SessionEvent, SessionForkSource, SessionId } from '@deepseek-ai/dsh-session';
/** One session row for the TUI session list. */
export interface SessionSummary {
    /** Session identity (shared with its agent, when live). */
    readonly id: SessionId;
    /** On-disk format version from the durable header. */
    readonly version: number;
    /** Non-negative safe-integer Unix epoch milliseconds of creation. */
    readonly createdAt: number;
    /** Working directory the session was bound to, when recorded. */
    readonly cwd: string | undefined;
    /** The session this one was forked from, when known. */
    readonly parentSession: SessionId | undefined;
}
/**
 * List known sessions, newest first. Persisted sessions come from
 * `ctx.sessionPersistence` (metadata-only listing) when that service is
 * configured; otherwise the live in-memory store's headers are used.
 * @param ctx - any context exposing `ctx.sessions` and optionally
 *   `ctx.sessionPersistence`.
 * @returns one summary per known session, ordered by `createdAt` descending.
 */
export declare function listSessions(ctx: Context): Promise<SessionSummary[]>;
/**
 * Resolve the live session object for an id.
 * @param ctx - any context exposing `ctx.sessions`.
 * @param id - the session id to look up.
 * @returns the live session, or `undefined` when not in the live store.
 */
export declare function getSession(ctx: Context, id: SessionId): Session | undefined;
/**
 * Fork a live session at an optional boundary, creating a live child session.
 * @param ctx - any context exposing `ctx.sessions`.
 * @param source - the fork source: a live session or its store id.
 * @param boundary - optional contiguous boundary seq; defaults to a safe point.
 * @param childSessionId - optional child identity; the store generates one when absent.
 * @returns the created live child session.
 */
export declare function forkSession(ctx: Context, source: SessionForkSource, boundary?: number, childSessionId?: SessionId): Session;
/**
 * Load a session's event log for display. A live session's in-process log is
 * authoritative (it includes events not yet flushed); a persisted-only session
 * is loaded through `ctx.sessionPersistence.inspect` when available.
 * @param ctx - any context exposing `ctx.sessions` and optionally
 *   `ctx.sessionPersistence`.
 * @param id - the session whose log is requested.
 * @returns the immutable event log, or an empty array when the session is unknown.
 */
export declare function loadHistory(ctx: Context, id: SessionId): Promise<readonly SessionEvent[]>;
/**
 * Flush every live session to durable storage — the teardown checkpoint.
 * Each flush dispatches the awaited `session/flush` durability barrier through
 * `ctx.sessions.flush`; persistence plugins drain their buffers there.
 * @param ctx - any context exposing `ctx.sessions`.
 * @returns after every live session's flush has settled; the first listener
 *   failure propagates.
 */
export declare function flushAll(ctx: Context): Promise<void>;
