/**
 * /export 会话导出渲染（纯函数，Cordis-free）：session events → Markdown 文本。
 * 数据源是会话日志（权威事件流）——导出完整内容（无折叠/截断的渲染视图缺陷）；
 * 工具结果超长按 5000 字符截断并附标记。同输入恒同输出（可测）。
 * @module @deepseek-ai/dsh-tianshu-tui/format/export
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session';
/** 导出元信息（头块）。 */
export interface SessionExportMeta {
    /** 会话 id。 */
    sessionId: string;
    /** 工作区路径（可选）。 */
    cwd?: string;
}
/**
 * 把会话事件渲染为可分享的 Markdown 转录。
 * @param events - 会话事件日志（权威数据源）。
 * @param meta - 导出头信息。
 * @returns 完整 Markdown 文本。
 */
export declare function renderSessionExport(events: readonly SessionEvent[], meta: SessionExportMeta): string;
