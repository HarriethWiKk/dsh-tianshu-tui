import type { RivetTheme } from '../theme.js';
/** formatSeparator 的渲染输入。 */
export interface SeparatorInput {
    /** 目标总显示宽度（≤ 0 返回空数组）。 */
    width: number;
    /** 居中标签；缺省为纯规则线。 */
    label?: string;
    /** ascii 模式：用 `-` 而非 box-drawing。 */
    ascii?: boolean;
    /** dotted 档：点线（`·`）。 */
    style?: 'solid' | 'dotted';
}
/**
 * 分隔线单行渲染：无 label 铺满规则线；有 label 居中、两侧补线；
 * label 超宽逐字截断加 `…`，任何输入下不破版。
 * @param input - 宽度、可选 label 与线型/ascii 选项。
 * @param theme - 当前主题（整行 dim 色）。
 * @returns 单元素 ANSI 行数组；width ≤ 0 返回空数组。
 */
export declare function formatSeparator(input: SeparatorInput, theme: RivetTheme): string[];
