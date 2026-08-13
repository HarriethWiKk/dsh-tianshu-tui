import type { RivetTheme } from '../theme.js';
/** 菜单最大可见行数（超出滚动窗口）。 */
export declare const SLASH_MENU_MAX_ROWS = 8;
/** 菜单项（结构与 engine/input-controller 的 SlashHintEntry 同形）。 */
export interface SlashMenuItem {
    name: string;
    description: string;
    /** 可选参数提示（如 `<name>`）；有值时并入 label 列。 */
    argsHint?: string;
}
/** formatSlashMenu 的渲染输入。 */
export interface FormatSlashMenuInput {
    width: number;
    items: readonly SlashMenuItem[];
    /** 选中项下标（滚动窗口保持其可见）。 */
    selected: number;
    /** 最大可见行数（缺省 SLASH_MENU_MAX_ROWS；≤0 视为缺省）。 */
    maxRows?: number;
    /** ascii 降级（❯ → >）。 */
    ascii?: boolean;
}
/**
 * 渲染 slash 命令下拉菜单行数组。
 * @param input - 宽度、菜单项、选中下标与行数上限。
 * @param theme - 当前主题（选中 label primary+bold、未选中 muted、描述 muted）。
 * @returns ANSI 行数组；items 为空或 width ≤ 0 返回空数组。
 */
export declare function formatSlashMenu(input: FormatSlashMenuInput, theme: RivetTheme): string[];
