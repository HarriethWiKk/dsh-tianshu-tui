/**
 * Render a display LaTeX math fragment to lines, stacking `\frac` vertically.
 * Top-level source newlines become vertical rows (so a `lhs =` line stays above
 * its block); each row stacks fractions via `parseExpr`. Inline math should use
 * `latexToUnicode` instead — fractions there stay single-line.
 * @param src - display 数学的 LaTeX 源（不带 `$$`/`\[` 定界符）。
 * @returns 渲染后的行数组（去除首尾空行）；空输入返回空数组。
 */
export declare function latexToBlock(src: string): string[];
