import type { LiveRegionLine } from '../engine/live-engine.js';
import type { RivetTheme } from '../theme.js';
/** 活动事件类别（决定词池与着色）。 */
export type ActivityKind = 'tool_use' | 'tool_result' | 'thinking' | 'lifecycle' | 'text';
/** 活动标签渲染输入。 */
export interface ActivityLabelInput {
    kind: ActivityKind;
    /** 单调递增序号（词池轮换下标）。 */
    seq: number;
    /** tool_use/lifecycle 的补充细节。 */
    detail?: string;
    /** ascii 模式：glyph 用 `>`。 */
    ascii?: boolean;
}
/**
 * 词池短语（纯函数，无全局状态）。
 * @param input - 类别、轮换序号与可选 detail（tool_use 截 40 字符，lifecycle 直用）。
 * @returns 当前 seq 对应的短语文本。
 */
export declare function activityPhrase(input: Omit<ActivityLabelInput, 'ascii'>): string;
/**
 * 活动标签行（glyph + 短语，单行）。
 * @param input - 类别、轮换序号、detail 与 ascii 模式。
 * @param theme - 当前主题（工具类事件用 toolColor('shell')，其余 pulseActive）。
 * @returns 单行 live 区内容。
 */
export declare function formatActivityLabel(input: ActivityLabelInput, theme: RivetTheme): LiveRegionLine[];
