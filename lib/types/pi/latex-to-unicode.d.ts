/**
 * Inject terminal true-color capability for ANSI color rendering.
 * Call once at startup from the host's terminal-capability detector.
 * @param enabled - 终端已检测到 24 位真彩色支持时为 true（启用 ansi-16m 路径）。
 */
export declare function setMathColorTrueColor(enabled: boolean): void;
/**
 * Convert a bare LaTeX math fragment (no surrounding `$`/`\(` delimiters) to its
 * best-effort Unicode rendering. Unknown commands degrade to their bare name;
 * `\\` becomes a newline. Always returns a string (never throws).
 * @param src - 不带定界符的 LaTeX 数学片段。
 * @returns 尽力而为的 Unicode 渲染结果；空串或非字符串输入原样返回。
 */
export declare function latexToUnicode(src: string): string;
/**
 * True when `env` is a math environment safe to auto-render without `$`/`\[`
 * delimiters. The trailing `*` of starred variants (`align*`, `equation*`) is
 * ignored; text-mode environments (`tabular`, `itemize`, …) return false.
 * @param env - `\begin{…}` 中的环境名（可带尾部 `*`）。
 * @returns 属于可裸渲染数学环境时为 true。
 */
export declare function isBareMathEnvironment(env: string): boolean;
/**
 * Scan prose for math spans — `$$…$$`, `\[…\]` (display) and `$…$`, `\(…\)`
 * (inline) — and replace each with its Unicode rendering, leaving everything
 * else verbatim. Newlines inside a span collapse to spaces so the result stays
 * single-line-safe.
 *
 * Inline `$…$` uses pandoc's anti-currency heuristics: the opener must not be
 * followed by whitespace, the closer must not be preceded by whitespace nor
 * followed by a digit, and `\$` is treated as a literal dollar — so "$5 and
 * $10" is left untouched.
 * @param text - 可能含数学 span 的原始 prose 文本。
 * @returns 数学 span 就地替换为 Unicode 渲染后的文本；其余内容原样保留。
 */
export declare function renderMathInText(text: string): string;
/**
 * Index of the `$` that closes an inline math span opened at `open` (the index
 * of the opening `$`), or -1 when the run is not inline math. Applies pandoc's
 * anti-currency heuristics: the opener must not be followed by whitespace, the
 * closer must not be preceded by whitespace nor followed by a digit, `\$` is a
 * literal dollar, and the span may not span a newline. Shared by
 * `renderMathInText` and the markdown math tokenizer so the rule has one home.
 * @param text - 被扫描的完整文本。
 * @param open - 开头 `$` 在 `text` 中的索引。
 * @returns 闭合 `$` 的索引；不构成行内数学 span 时返回 -1。
 */
export declare function inlineMathSpanEnd(text: string, open: number): number;
