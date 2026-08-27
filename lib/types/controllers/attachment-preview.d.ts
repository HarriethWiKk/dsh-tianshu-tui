/**
 * attachment-preview — composer 附件缩略图维护（自 ui/app.ts C4 提取）。
 *
 * 附件列表变化时重算最后一张的半块预览。sharp 异步解码毫秒级，完成后回调
 * 触发一次重绘；代际号丢弃迟到结果（快速增删/提交清空后不再挂出过期图片）。
 * 渲染失败置 null——计数行仍在，预览是装饰性增强。
 */
export interface AttachmentPreviewOptions {
    /** 终端列数（每次刷新时取）。 */
    getColumns: () => number;
    /** 主题气泡底色（hex；undefined = 主题无此键）。 */
    getBackground: () => string | undefined;
    /** 预览变化后的重绘回调（异步解码完成时触发一次）。 */
    onChanged: () => void;
}
export declare class AttachmentPreviewController {
    private preview;
    private epoch;
    private readonly opts;
    constructor(opts: AttachmentPreviewOptions);
    /** 当前预览 ANSI 行（无附件/解码失败为空数组——渲染不占位）。 */
    get lines(): readonly string[];
    /**
     * 附件列表变化 → 重算最后一张的半块预览。
     * @param images - 变化后的附件 data URL 列表
     */
    refresh(images: readonly string[]): Promise<void>;
    /** 预览合成底色：本仓主题无气泡底色键（userMsgBg），统一用中性暗色（明暗终端都可读）。 */
    background(): {
        r: number;
        g: number;
        b: number;
    };
}
