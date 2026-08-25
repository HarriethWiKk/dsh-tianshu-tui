/**
 * 单行垫底色并补到 width 列（ANSI 安全：超宽截断，行尾 RESET 防底色泄漏）。
 * @param line - 内容行（可含 ANSI 着色）。
 * @param width - 目标列数；≤ 0 时原样返回。
 * @param bgHex - 表面底色（hex，truecolor 轨）。
 * @returns 垫色行（displayWidth ≤ width）。
 */
export declare function withBgFill(line: string, width: number, bgHex: string): string;
/**
 * 多行垫底色（withBgFill 的批量形）。
 * @param lines - 内容行数组。
 * @param width - 目标列数。
 * @param bgHex - 表面底色；undefined 时原样返回（调用方降级）。
 * @returns 垫色行数组。
 */
export declare function withBgFillLines(lines: readonly string[], width: number, bgHex: string | undefined): string[];
