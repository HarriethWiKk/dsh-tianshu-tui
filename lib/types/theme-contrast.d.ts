/**
 * theme-contrast — 主题色的可读性校验（WCAG 2.x 相对亮度 + 对比度比）。
 *
 * 自定义主题只覆盖前景 token，背景是用户终端自己的——真实背景无法精确知道，
 * 因此用主题声明的 background 档位对应的名义背景近似校验；低于阈值时加载
 * 警告但不阻断（fail-open，保留用户意图，警告给出知情权）。
 *
 * @module @huiliyi37/dsh-tianshu-tui/theme-contrast
 */
/** WCAG AA 大文本阈值（< 3.0 视为低对比）。 */
export declare const CONTRAST_MIN_RATIO = 3;
/**
 * hex 颜色的 WCAG 相对亮度（0 近黑 ~ 1 近白）。
 * @param hex - `#rgb` / `#rrggbb`；无法解析返回 null。
 */
export declare function relativeLuminance(hex: string): number | null;
/**
 * 两色对比度比（1.0 同色 ~ 21.0 黑白）；任一色无法解析返回 null。
 */
export declare function contrastRatio(a: string, b: string): number | null;
/** 单个低对比颜色问题。 */
export interface ContrastIssue {
    /** 语义 token 名（如 primary）。 */
    token: string;
    /** 颜色值（原样）。 */
    value: string;
    /** 与名义背景的对比度。 */
    ratio: number;
}
/**
 * 校验前景色集合对主题声明背景的可读性。自定义主题只覆盖前景 token，真实
 * 终端背景未知，因此用声明档位的名义背景近似；< 3.0（WCAG AA 大文本）判低对比。
 * 非 hex 值（chalk 命名色等）跳过——16 色轨语义由内置主题维护，不在此校验。
 * @param colors - token → 颜色值。
 * @param declaredBg - 主题声明的背景档位（缺省 dark）。
 * @returns 问题列表（保持输入键序；全部可读时为空）。
 */
export declare function validateThemeContrast(colors: Record<string, string>, declaredBg?: 'dark' | 'light'): ContrastIssue[];
