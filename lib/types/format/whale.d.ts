/** 像素画宽度（列数）。 */
export declare const WHALE_COLS = 24;
/** 像素画高度（文本行数 = 像素行 / 2）。 */
export declare const WHALE_ROWS: number;
/** 出画最小终端列数（含两侧呼吸空间）。 */
export declare const WHALE_MIN_COLS = 40;
/** 出画最小终端行数（画 8 行 + 品牌/菜单/环境行整块可容纳）。 */
export declare const WHALE_MIN_ROWS = 22;
/** formatWhaleLogo 的渲染输入。 */
export interface FormatWhaleLogoInput {
    /** 终端列数。 */
    width: number;
    /** 终端行数（整块可容纳性门禁）。 */
    rows: number;
    /** 颜色能力等级（缺省 chalk.level）；≥2 走品牌 hex 轨，1 走命名色轨，0 不出画。 */
    colorLevel?: number;
}
/**
 * 欢迎页鲸鱼像素画：返回在 width 内水平居中的 ANSI 行数组（WHALE_ROWS 行）。
 * 降级矩阵（任一不满足返回空数组，调用方回落纯文字品牌区）：
 * - `width ≥ WHALE_MIN_COLS` 且 `rows ≥ WHALE_MIN_ROWS`
 * - `colorLevel ≥ 1`（无色终端画不出品牌色，纯剪影无识别度）
 * - `ambiguousWidthMode() !== 'full'`（legacy conhost 块字符按 2 列渲染）
 * 宽度守恒：任何输出行 displayWidth ≤ width；画不截断，放不下即整体降级。
 * @param input - 终端尺寸与颜色能力等级。
 * @returns 居中 ANSI 行数组；降级时空数组。
 */
export declare function formatWhaleLogo(input: FormatWhaleLogoInput): string[];
