/**
 * 多行文本在给定宽度下占的显示行总数（折行感知；空行也计 1 行）。
 * @param text - 待度量文本（按 `\n` 分行）。
 * @param width - 终端宽度（<=0 时每逻辑行按 1 行计）。
 * @returns 显示行总数。
 */
export declare function displayRowsForText(text: string, width: number): number;
/**
 * Cap the live tail to the last `maxRows` DISPLAY rows (wrapping-aware).
 *
 * The live (redrawn) region must never exceed the viewport, or Ink's relative
 * cursor-up erase clamps at the viewport top and the terminal scrolls/duplicates
 * every frame (真凶②). The bound must be in DISPLAY rows, not logical lines or
 * chars (R6): a line wider than the terminal wraps to multiple rows.
 *
 * This only trims the redrawn live region. Committed content already lives in
 * native scrollback (full, scrollable, searchable) — nothing here hides it.
 *
 * @param text - live 区全文（按 `\n` 分行）。
 * @param width - 终端宽度（折行成本按此计算）。
 * @param maxRows - 显示行上限（<=0 返回空串）。
 * @returns 裁到上限内的尾部文本；发生裁剪时首行加省略号前缀。
 */
export declare function capLiveTail(text: string, width: number, maxRows: number): string;
/**
 * Like capLiveTail, but markdown-fence-aware for the LIVE streaming tail.
 *
 * The live view renders the tail through the markdown block parser, which pairs
 * ``` fences greedily (1st = open, 2nd = close, …). A raw tail slice can begin
 * INSIDE a code block — then the tail's first ``` is really the block's CLOSER,
 * but the parser reads it as an OPENER and boxes the following PROSE in a stray
 * "code" frame (real code ends up outside the box; the offset is the tell). It
 * flickers as the window slides each delta → "occasional code box around prose".
 *
 * Fix: count fences in the dropped head (everything above the visible tail). If
 * odd, the tail starts inside a code block, so prepend a synthetic ``` opener
 * that pairs with the inherited closer and realigns every fence after it. We
 * reserve one row for that opener so the result still fits maxRows.
 *
 * Operates on the FULL accumulated text (not a pre-slice) so the fence count is
 * correct; it only walks the trailing maxRows worth of lines for the visible
 * region, so cost stays bounded regardless of total reply length.
 *
 * @param fullText - 累积的完整流式文本（不能是预切片，否则围栏计数会错）。
 * @param width - 终端宽度。
 * @param maxRows - 显示行上限（<=0 返回空串；需补合成开栏时为其保留一行）。
 * @returns 裁剪后的尾部文本，必要时前置合成 ``` 开栏。
 */
export declare function capLiveTailMarkdownSafe(fullText: string, width: number, maxRows: number): string;
