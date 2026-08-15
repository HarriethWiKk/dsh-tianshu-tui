/**
 * 显示宽度度量 — 解决 string-width 的窄宽假设与终端实际渲染的错位。
 *
 * 背景：`string-width` 把 East-Asian **Ambiguous** 字符（如 `—` `…` `↑↓` `·`）
 * 一律按 1 列计；但很多终端（尤其 CJK 环境/字体）把这些符号按 2 列渲染。
 * LiveEngine 据 string-width 估算每行占几个显示行（`rowsForLine`），低估后
 * 相对光标回顶量不足 → 旧帧顶部泄漏进 scrollback（输入框重影/重叠）。
 *
 * 关键陷阱：Unicode 把 **box-drawing / block**（U+2500–U+259F，如 `─ │ ╭ █`）
 * 也归为 ambiguous，但 xterm 系终端普遍按 **1 列** 渲染它们。若把所有 ambiguous
 * 当宽，会把输入框边框算成双宽 → over-erase 反噬 scrollback。因此 wide 模式只对
 * **非 box/block 的 ambiguous 符号** 叠加 +1 宽度增量。
 *
 * 但 Windows legacy conhost（GBK 中文字体）连框线字符也按 **2 列** 渲染——
 * wide 档在那里仍会低估边框行宽度 → 折行 → 回顶欠擦。为此增设 **full 档**：
 * box/block 一并 +1。三档语义：
 * - narrow：= string-width（默认，xterm 系）
 * - wide：非 box/block 的 ambiguous +1（CJK xterm 终端）
 * - full：所有 ambiguous 含 box/block +1（legacy CJK conhost，自动探测默认）
 *
 * 度量建立在 `string-width` 之上（继承其对 emoji/ZWJ/组合符/控制符的正确处理），
 * narrow 模式与 string-width 完全一致（零回归）。
 */
/** ambiguous 字符宽度档位（三档语义见模块头注释）。 */
export type AmbiguousWidthMode = 'narrow' | 'wide' | 'full';
/**
 * 宽度模式：env `RIVET_AMBIGUOUS_WIDTH` 显式值优先（narrow/wide/full），
 * 未设时按终端探测——legacy CJK conhost（GBK 字体连框线都按 2 列渲染）
 * 默认 full，其余平台默认 narrow（与历史行为一致）。
 * @returns 生效的宽度档位（探测结果进程内缓存）。
 */
export declare function ambiguousWidthMode(): AmbiguousWidthMode;
/**
 * 兼容旧布尔口径：wide 或 full 均视为启用（消费方只区分「是否加宽」）。
 * @returns 是否启用 ambiguous 加宽。
 */
export declare function ambiguousWideEnabled(): boolean;
/** 测试钩子：重置探测缓存。 */
export declare function resetWidthModeCache(): void;
/** 宽度度量选项（displayWidth / wrapToDisplayWidth / truncateToDisplayWidth 共用）。 */
export interface DisplayWidthOptions {
    /** 把非 box/block 的 ambiguous 符号按 2 列计。缺省跟随全局档位
     *  ambiguousWideEnabled()——与 LiveEngine.rowsForLine 的度量口径一致，
     *  避免折叠点与行数估算错位。 */
    ambiguousAsWide?: boolean;
}
/**
 * 按显示宽度断行（ANSI 安全：转义序列原样保留、不计宽；不吞字符）。
 * 已在预算内的整段返回单行。每行从当前字符重新累积宽度——调用方若需
 * 每行带固定前缀（如说话人导轨），应把前缀宽度计入 max 或逐行拼装。
 * @param text - 待断行文本（可含 ANSI）。
 * @param max - 每行最大显示宽度。
 * @param opts - 宽度度量选项（透传 displayWidth）。
 * @returns 断行结果（不包含换行符的行数组）。
 */
export declare function wrapToDisplayWidth(text: string, max: number, opts?: DisplayWidthOptions): string[];
/**
 * 文本的显示宽度（已忽略 ANSI 转义）。
 * @param text - 待度量文本（可含 ANSI）。
 * @param opts - 宽度度量选项。
 * @returns 显示宽度（列数）。
 */
export declare function displayWidth(text: string, opts?: DisplayWidthOptions): number;
/**
 * 按显示宽度截断（ANSI 安全：转义序列原样保留、不计宽；截断发生时补一个 RESET
 * 防止颜色泄漏到后续行）。已在预算内则原样返回。
 * @param text - 待截断文本（可含 ANSI）。
 * @param max - 最大显示宽度（<=0 返回空串）。
 * @param opts - 宽度度量选项。
 * @returns 截断结果（含 ANSI 时补 RESET，OSC 8 链接被切开时先补闭合）。
 */
export declare function truncateToDisplayWidth(text: string, max: number, opts?: DisplayWidthOptions): string;
