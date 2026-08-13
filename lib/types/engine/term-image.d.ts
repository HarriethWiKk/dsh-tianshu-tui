/**
 * 终端内联图片渲染 — 把 data URL 图片准备/编码为 kitty / iTerm2 图形协议序列。
 *
 * 协议事实（与 detectImageProtocol 配套）：
 * - kitty APC：`\x1B_G<control>;<base64 payload>\x1B\\`，仅支持 RGB/RGBA/PNG 载荷
 *   （f=100 = PNG），非 PNG 需先转码。base64 必须按 ≤4096 字节分块，除末块外
 *   长度须为 4 的倍数，用 m=1/0 标记。q=2 抑制终端响应，避免污染 stdin 解析。
 *   同时给 c（列）和 r（行）时终端把图片缩放进该单元格矩形（保持宽高比），
 *   放置后光标下移 r 行、停在图片右缘列——几何有界、位置确定，这是 live 区
 *   锚点安全的前提；调用方随后输出 `\r` 回到行首。
 * - iTerm2 OSC 1337：`\x1B]1337;File=inline=1;width=N;height=M:<base64>\x07`，
 *   直接支持 png/jpeg/gif/webp，宽高以单元格计，preserveAspectRatio=1 下
 *   图片适配进宽高超框，绘制后光标停在图片末行右缘；调用方随后输出 `\r\n`
 *   把光标移到图片下方行首。
 * 两种序列都会被不支持的终端静默忽略，因此检测失误的最坏结果是图片不显示。
 *
 * 安全边界：data URL 载荷在编码前必须通过严格 base64 校验（RFC 4648 字母表 +
 * 合法 padding + 非空 + 长度 4 对齐），否则载荷里的 BEL/ESC/ST 可以提前终止
 * OSC/APC 序列并向终端注入任意控制序列。
 */
import type { ImageProtocol } from './ansi.js';
/**
 * 解析并校验 data URL → { mime, b64 }。
 * 拒绝：非 data URL、非白名单 MIME、空载荷、含控制字符/非法字符的载荷、
 * 非法 padding、长度非 4 对齐、解码后超过 MAX_IMAGE_BYTES。
 * @param dataUrl - `data:<mime>;base64,<payload>` 形式的字符串
 * @returns 小写 MIME 与已校验的 base64 载荷；任一校验失败返回 null
 */
export declare function parseImageDataUrl(dataUrl: string): {
    mime: string;
    b64: string;
} | null;
/** 已备图片：编码所需的全部材料。kitty 路径保证是 PNG 且带像素尺寸。 */
export interface PreparedTermImage {
    b64: string;
    pixelWidth?: number;
    pixelHeight?: number;
}
/**
 * data URL → 已备图片（慢速部分：校验 + 必要的 PNG 转码）。
 * 在 commit 前异步完成；编码（快速、与终端尺寸相关）留到写入时进行，
 * 使转码期间的终端 resize 不会用过期宽度编码。
 * 返回 null 表示无法准备，调用方保持文本占位。
 * @param dataUrl - 图片 data URL（经 parseImageDataUrl 校验）
 * @param protocol - 目标终端图形协议（kitty 需 PNG，必要时转码）
 * @returns 已备图片材料；校验或转码失败返回 null
 */
export declare function prepareTermImage(dataUrl: string, protocol: Exclude<ImageProtocol, 'none'>): Promise<PreparedTermImage | null>;
/**
 * iTerm2 OSC 1337 内联图片序列。宽高以单元格计，图片按比例适配进超框。
 * @param b64 - 图片 base64 载荷（png/jpeg/gif/webp，须已通过校验）
 * @param cols - 超框宽度（单元格列数）
 * @param maxRows - 超框高度（单元格行数）
 * @returns OSC 1337 转义序列（末尾不含换行）
 */
export declare function encodeIterm2Image(b64: string, cols: number, maxRows: number): string;
/**
 * kitty APC 图形序列（f=100 PNG，分块直传，c×r 有界单元格矩形）。
 * @param b64Png - PNG 图片的 base64 载荷（协议只接受 PNG 容器）
 * @param cols - 放置矩形宽度（单元格列数）
 * @param rows - 放置矩形高度（单元格行数）
 * @returns 分块拼接的 APC 序列；空载荷返回 ''
 */
export declare function encodeKittyImage(b64Png: string, cols: number, rows: number): string;
/**
 * 已备图片 → 终端图形序列。cols/maxRows 应在写入当刻取最新终端尺寸。
 * kitty 用像素尺寸把 r 收紧到实际需要行数（受 maxRows 封顶），
 * 拿不到尺寸时退回 maxRows（宁可留白，几何必须有界）。
 * 序列末尾不含换行，由调用方控制光标。
 * @param image - prepareTermImage 产出的已备图片
 * @param protocol - 目标终端图形协议
 * @param cols - 可用宽度（单元格列数，下限 10）
 * @param maxRows - 高度上限（单元格行数，下限 1）
 * @returns 终端图形序列；kitty 空载荷时为 ''
 */
export declare function encodeTermImage(image: PreparedTermImage, protocol: Exclude<ImageProtocol, 'none'>, cols: number, maxRows: number): string | null;
/**
 * 测试钩子：替换 prepare 实现（null 恢复真实实现）。
 * @param fn - 替代的 prepare 实现；null 恢复真实实现
 */
export declare function setTermImagePreparer(fn: typeof prepareTermImage | null): void;
/**
 * app 层统一入口：走注入点后的 prepare。
 * @param dataUrl - 图片 data URL
 * @param protocol - 目标终端图形协议
 * @returns 已备图片材料；无法准备时为 null
 */
export declare function prepareTermImageForCommit(dataUrl: string, protocol: Exclude<ImageProtocol, 'none'>): Promise<PreparedTermImage | null>;
