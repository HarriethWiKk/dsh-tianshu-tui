/**
 * highlight — 搜索命中子串高亮（A2，#55 同族细节）。
 *
 * ANSI 感知：转义序列不参与匹配（查询词不会命中 SGR 码内部），命中位置经
 * plain 投影映射回原始串后原位包裹——/scroll 等含 ANSI 的行原样保留转义。
 * 大小写口径由调用方传（与搜索本身的 smart-case 一致）。
 *
 * @module @huiliyi37/dsh-tianshu-tui/highlight
 */
/** smart-case 口径：查询含大写 → 精确匹配（搜索与高亮共用同一判定）。 */
export declare function isSmartCaseSensitive(query: string): boolean;
export interface HighlightOptions {
    /** true = 精确匹配（smart-case 命中含大写时与搜索口径一致）。 */
    sensitive?: boolean;
    /** 命中片段包裹函数（ANSI 着色/加粗）。 */
    wrap: (segment: string) => string;
}
/**
 * 在 line 中找出 query 的全部出现并原位包裹。
 * query 为空或无命中时原样返回；line 可含 ANSI（转义段零宽跳过、不参与匹配）。
 */
export declare function highlightQuery(line: string, query: string, opts: HighlightOptions): string;
