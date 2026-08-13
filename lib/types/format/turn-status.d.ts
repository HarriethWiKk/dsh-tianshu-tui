import type { RivetTheme } from '../theme.js';
/** formatTurnStatus 的渲染输入。 */
export interface FormatTurnStatusInput {
    /** statusline 文本（阶段 · 工具名 + 徽标）；null/空 → 不渲染。 */
    statusText: string | null;
    /** spinner 帧计数（120ms ticker 驱动；负值安全）。 */
    tick: number;
    /** agent 是否运行中：true → braille spinner；false → pulsing ◆。 */
    active: boolean;
    /** legacy 终端：spinner 降级 `*`、等待降级 `-`。 */
    ascii?: boolean;
    /** 终端列数；缺省不限制（调用方恒传）。 */
    width?: number;
}
/**
 * 渲染状态行：spinner（或 ◆）+ statusText。
 * @param input - statusline 文本、tick、运行态、可选 ascii/width。
 * @param theme - 当前主题（整行 primary 色）。
 * @returns 单行 ANSI；无可渲染内容返回空数组。
 */
export declare function formatTurnStatus(input: FormatTurnStatusInput, theme: RivetTheme): string[];
