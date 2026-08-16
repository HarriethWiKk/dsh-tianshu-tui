/**
 * session-tabs — 会话 Tab 栏(纯渲染;Claude Code 桌面版并行会话的 TUI 形态)。
 *
 * 单行契约:短 id tab 列表,当前会话 ● + 高亮;窄宽从旧到新丢 tab,
 * 超限折叠为 `+N`;任何宽度下显示宽度 ≤ width。
 * 数据源:调用方传入(attach/newSession/switchSession 后经 listSessions 缓存)。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/session-tabs
 */
import type { LiveRegionLine } from '../engine/live-engine.js';
import type { RivetTheme } from '../theme.js';
/** 一个会话 tab。 */
export interface SessionTab {
    /** 会话 id(完整;渲染用 label)。 */
    id: string;
    /** 展示标签(调用方截短,如 `s-3a2f`)。 */
    label: string;
    /** 当前会话标记(● + 高亮)。 */
    current?: boolean;
}
/**
 * 渲染会话 tab 栏单行:`[label] [label●] …`;当前 tab ● 高亮(primary bold),
 * 其余 dim;放不下时从旧到新丢 tab,最后保留 `+N` 折叠段(最旧优先丢,
 * 当前 tab 恒保留——丢任何 tab 前先丢非当前)。
 * @param tabs - 会话 tab 列表(顺序 = 新旧顺序,末位最新)。
 * @param width - 可用显示宽度。
 * @param theme - 当前主题。
 * @returns 单行 live 内容;tabs 为空返回空数组。
 */
export declare function formatSessionTabs(tabs: readonly SessionTab[], width: number, theme: RivetTheme): LiveRegionLine[];
