/**
 * TUI image attachment loader — turns an on-disk image path into a base64 data URL
 * suitable for the vision model pipeline.
 *
 * Terminals can only bracketed-paste text, so users paste an image file path; this
 * module reads the file, validates the format, and adaptively compresses it so the
 * payload stays under the server cap while the resolution stays as high as possible.
 *
 * 自适应压缩（对齐 opencode-tui desktop 的 compressImageSafe 语义，Node 侧以系统
 * 工具实现）：只在超限时压缩；压缩是三级渐进，每级从原图重新编码（不链式再压，
 * 避免累积失真）：
 *   1. 长边 ≤ maxEdge（默认 1568）：PNG 源保透明输出 PNG，其余格式转 JPEG 0.82
 *      （同时完成 provider 白名单转码，BMP/TIFF 等不再原样外发）；
 *   2. 仍超限 → JPEG 0.55 同分辨率；
 *   3. 仍超限 → 长边 ≤ 1024 + JPEG 0.55。
 * 所有档位只缩不放（sips -Z / magick `>` 语义），小图原样发送。
 * 压缩成功后可零工具解析出实际宽高（PNG IHDR / JPEG SOF），供气泡展示。
 */
import { type ImageToolCommand } from './image-tool.js';
/** Provider cap: 3.5 MB decoded per image。对齐宿主 attachment-local 单图准入
 *  默认（rc.8 由 5MB 收紧至 3.5MB，含 base64 膨胀后仍在 5MB 路由检查内）——
 *  本地预算高于准入会让原样放行的图被附件存储拒绝。 */
export declare const MAX_IMAGE_BYTES: number;
/** Long-edge clamp. 1568px keeps token cost bounded while staying legible. */
export declare const MAX_EDGE = 1568;
/** Max number of images per prompt (matches desktop Composer). */
export declare const MAX_IMAGES = 4;
/** JPEG quality for the first compression tier. */
export declare const JPEG_QUALITY = 82;
/** Fallback JPEG quality when the first tier's output still exceeds the cap. */
export declare const FALLBACK_QUALITY = 55;
/** Fallback long edge when quality reduction alone is not enough. */
export declare const FALLBACK_EDGE = 1024;
/** 已加载图片附件：data URL + MIME + 文件名，供 vision 消息管线消费。 */
export interface ImageAttachment {
    /** data:image/...;base64,... */
    dataUrl: string;
    mime: string;
    name: string;
    /** 发送图的实际宽（压缩路径解析自输出头部）；原样发送（未压缩）时为 undefined。 */
    width?: number;
    /** 发送图的实际高（压缩路径解析自输出头部）；原样发送（未压缩）时为 undefined。 */
    height?: number;
}
/** loadImageAttachment 的上限覆盖（缺省用 MAX_IMAGE_BYTES / MAX_EDGE）。 */
export interface LoadImageOptions {
    maxBytes?: number;
    maxEdge?: number;
}
/** 图像工具执行器契约（测试注入与真实实现共用）。 */
export interface ImageToolRunner {
    /** 依序尝试候选命令，返回首个产出内容；全部失败返回 null。 */
    (candidates: ImageToolCommand[], outputPath: string): Promise<Buffer | null>;
}
/** 注入/清除测试 runner（null 恢复真实 runImageTool）。 */
export declare function setImageToolRunner(runner: ImageToolRunner | null): void;
/**
 * 从图片头部解析宽高（零工具调用）：PNG 读 IHDR（偏移 16/20，big-endian），
 * JPEG 扫描 SOF0/1/2 段标记（排除 DHT/DAC/JPG 干扰标记）。解析失败返回 null
 * （不阻塞发送——宽高只是展示信息）。
 * @param buf - 图片内容（至少包含头部）
 * @param mime - 图片 MIME（决定解析分支）
 * @returns 宽高；无法解析返回 null
 */
export declare function probeImageSize(buf: Buffer, mime: string): {
    width: number;
    height: number;
} | null;
/**
 * 仅按 magic bytes 识别 MIME；不识别即返回 null。
 * 不做扩展名 fallback——真实图片（png/jpeg/webp/gif/tiff/bmp）都有可靠 magic，
 * 任意内容改名 .png 不应进入转码流程。保留 filePath 参数仅为兼容既有调用签名。
 * @param buf - 文件内容（至少前 12 字节参与识别）
 * @param _filePath - 未使用；仅为兼容既有调用签名保留
 * @returns 识别出的 MIME；无法识别返回 null
 */
export declare function detectImageMime(buf: Buffer, _filePath: string): string | null;
/**
 * 按文件扩展名判断文本是否像受支持的图片路径（仅粗筛，真实格式以 magic bytes 为准）。
 * @param text - 待判断的路径文本（首尾空白会被忽略）
 * @returns 扩展名命中受支持图片格式时为 true
 */
export declare function looksLikeImagePath(text: string): boolean;
/**
 * Load an image from disk and return it as a base64 data URL.
 *
 * - Validates format by magic bytes (no extension fallback).
 * - Rejects unsupported formats.
 * - If the decoded file exceeds maxBytes, adaptively compresses it: 1568px
 *   (PNG keeps transparency) → JPEG 0.55 → 1024px + 0.55, never upscaling.
 * @param absolutePath - 图片文件的绝对路径
 * @param options - maxBytes/maxEdge 上限覆盖
 * @returns 图片附件（data URL + MIME + 文件名 + 压缩后的宽高）；格式不支持抛错
 * @throws 无可用图像工具，或压缩后仍超限（错误信息区分两种原因）
 */
export declare function loadImageAttachment(absolutePath: string, options?: LoadImageOptions): Promise<ImageAttachment>;
/**
 * 剪贴板位图的附件化入口：与文件路径走同一条预算管线。
 *
 * 修复的缺口：剪贴板路径原先直接拼 dataUrl，不做过限压缩——超限大图能挂上
 * （📎 有显示）却在提交时被 normalizeSubmitImages 静默丢弃。此处把位图落临时
 * 文件后复用 {@link loadImageAttachment} 的全部语义（magic 校验、原样直发、
 * 三级自适应压缩），两条入口不再分叉。
 * @param buf - 剪贴板位图字节。
 * @param name - 附件名（显示与诊断用，如 `clipboard.png`）。
 * @param options - maxBytes/maxEdge 上限覆盖。
 * @returns 图片附件（超限时为压缩后的 data URL）。
 * @throws 格式不支持、无可用图像工具，或压缩后仍超限（错误信息区分原因）。
 */
export declare function loadClipboardImageAttachment(buf: Buffer, name: string, options?: LoadImageOptions): Promise<ImageAttachment>;
