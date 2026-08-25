/**
 * 半块字符图片预览 — 把 data URL 图片降采样为 `▀`（上色前景 + 下色背景）
 * 的真彩 ANSI 文本行。任意终端可用：不依赖 kitty/iTerm2 图形协议，是纯文本，
 * 因此 live 区重绘天然擦除（无图形协议的残影治理问题），也是无协议终端上
 * 用户气泡图片的回退渲染路径（见 app.commitUserPrompt）。
 * 回流自 tianshu-public（上游 src/engine/image-preview.ts）。
 *
 * 像素解码走 sharp（懒加载）：原生模块缺失或解码失败返回 null，调用方降级
 * 为纯文本占位——预览是装饰性能力，不构成发送路径的前置条件。
 */
/** composer 缩略图宽度上限（列）；实际取 min(本值, 终端宽-6)。 */
export declare const PREVIEW_MAX_COLS = 30;
/** composer 缩略图高度上限（字符行）。 */
export declare const PREVIEW_MAX_ROWS = 10;
/** 无协议终端气泡回退的高度上限（字符行）——每行都是真实 scrollback 行，收紧。 */
export declare const FALLBACK_MAX_ROWS = 16;
/** 主题未给气泡底色时的透明像素合成底色（中性暗色，明暗终端都可读）。 */
export declare const NEUTRAL_PREVIEW_BACKGROUND: {
    r: number;
    g: number;
    b: number;
};
/**
 * `#rrggbb` → RGB；用于把主题 truecolor 底色喂给预览合成。
 * @param hex - 六位十六进制颜色字符串（带 # 前缀）
 * @returns RGB 分量；格式不符返回 null
 */
export declare function hexToRgb(hex: string): {
    r: number;
    g: number;
    b: number;
} | null;
/** 已渲染的半块预览。 */
export interface HalfBlockPreview {
    /** ANSI 真彩文本行（每行以 reset 结尾，无换行符）。 */
    lines: string[];
    /** 网格列数（▀ 字符数/行）。 */
    cols: number;
    /** 网格行数（lines.length）。 */
    rows: number;
}
/**
 * data URL → 半块字符预览。网格按图片宽高比适配进 maxCols×maxRows 超框
 * （cell 按 2:1 估计），正常情况不裁切；极端纵横比被上限截断时按剩余高度
 * 反推列数（fit 语义，cover 兜底取整误差）。
 * @param dataUrl - 图片 data URL（经 parseImageDataUrl 同规则校验）
 * @param opts - maxCols/maxRows 网格上限；background 透明像素合成底色（RGB）
 * @returns 渲染结果；校验失败、sharp 不可用或解码失败返回 null
 */
export declare function renderHalfBlockPreview(dataUrl: string, opts: {
    maxCols: number;
    maxRows: number;
    background: {
        r: number;
        g: number;
        b: number;
    };
}): Promise<HalfBlockPreview | null>;
