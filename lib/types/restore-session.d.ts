/**
 * restore-session — 可恢复会话投影（纯函数）。
 *
 * 输入 adapter/sessions.ts 的 SessionSummary[] → 可恢复会话视图。
 * 不接管启动流程、不读 ctx——读取由装配层调 listSessions 后喂入。
 */
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { SessionSummary } from './adapter/sessions.js';
/** 可恢复会话视图行（live = 当前进程内仍活跃）。 */
export interface RestorableSession {
    id: SessionId;
    createdAt: number;
    cwd: string | undefined;
    parentSession: SessionId | undefined;
    /** Agent preset id（创建值 + 切换值 fold；未记录时 undefined）。 */
    agentPreset: string | undefined;
    live: boolean;
}
/** 投影/格式化选项。 */
export interface RestorableOptions {
    /** 当前时间戳（缺省 Date.now()）。 */
    now?: number;
    /** 活跃会话 id 集合（live 标注）。 */
    liveIds?: ReadonlySet<SessionId>;
    /** 展示行数上限；超出部分折叠为「… 还有 N 个会话」提示行（缺省或 ≤0 不限制）。 */
    maxRows?: number;
}
/**
 * SessionSummary → 可恢复会话视图（顺序保持；liveIds 命中者标 live）。
 * @param sessions - 会话摘要列表（adapter/sessions.ts 输出）。
 * @param opts - 投影选项（取 liveIds）。
 * @returns 可恢复会话视图行。
 */
export declare function projectRestorableSessions(sessions: readonly SessionSummary[], opts?: RestorableOptions): RestorableSession[];
/**
 * 相对时间：<60s 刚刚 / <1h N 分钟前 / <24h N 小时前 / <7d N 天前 / ≥7d 日期。
 * @param createdAt - 会话创建时间戳（毫秒）。
 * @param now - 当前时间戳（毫秒）。
 * @returns 相对时间文本（≥7 天为 `YYYY-MM-DD`）。
 */
export declare function formatSessionAge(createdAt: number, now: number): string;
/**
 * 展示行：live ● / persisted ○ + 相对年龄 + cwd basename + 短 id + fork 短父 id
 * + agent preset（未记录不显示）；空列表占位提示。maxRows 限高时超出部分
 * 折叠为一行提示（「… 还有 N 个会话」）。
 * @param rows - 可恢复会话视图行。
 * @param opts - 格式化选项（取 now 与 maxRows）。
 * @returns 每会话一行的展示文本。
 */
export declare function formatRestorableSessions(rows: readonly RestorableSession[], opts?: RestorableOptions): string[];
