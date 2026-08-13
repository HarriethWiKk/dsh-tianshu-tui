import type { RivetTheme } from '../theme.js';
/** turn 内的阶段（trail glyph 的判别标签）。 */
export type TurnPhase = 'thinking' | 'streaming' | 'tool' | 'verifying' | 'done';
/** formatTurnSummary 的渲染输入。 */
export interface TurnSummaryInput {
    turnNumber: number;
    segments: readonly TurnPhase[];
    filesRead: number;
    filesModified: number;
    width: number;
    verifiedCount?: number;
    elapsedMs?: number;
    ascii?: boolean;
}
/**
 * turn 结束统计摘要单行渲染：`turn N · trail · 读X 改Y · ✓Z · elapsed`。
 * 窄宽从尾部渐进 drop 次要段，最终仅剩 turn 段时按宽度截断。
 * @param input - turn 序号、阶段轨迹、读改计数与宽度等。
 * @param theme - 当前主题（整行 dim 色）。
 * @returns 单元素 ANSI 行数组，显示宽度 ≤ input.width。
 */
export declare function formatTurnSummary(input: TurnSummaryInput, theme: RivetTheme): string[];
