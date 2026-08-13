/**
 * 系统图像工具共享执行器 — 平台感知的候选命令构造与 fallback 执行、临时目录管理，
 * 供 image-attach（缩放）与 term-image（格式转换）两条路径共用，
 * 避免两套超时/清理策略漂移。
 *
 * 候选顺序按平台区分（见 toPngCandidates / resizeCandidates）：
 * - darwin/linux：sips（macOS 内置，Linux 上不存在会自然失败进 fallback）
 *   → ImageMagick v7（magick）→ v6（convert）。
 * - win32：magick → PowerShell + System.Drawing 兜底。不含 sips（不存在），
 *   也不含 convert——避免撞名系统工具 C:\Windows\System32\convert.exe
 *   （FAT→NTFS 转换）；PowerShell 为 Windows 自带，覆盖未装 ImageMagick 的场景。
 *   注意 System.Drawing 不支持 WebP（无 WebP 编解码器）——win32 未装 ImageMagick
 *   时 WebP 转换必然失败：所有候选跑完返回 null，调用方退回文本占位。失败
 *   不再是静默的：全部候选失败且 RIVET_DEBUG 非空时向 stderr 打一行调试输出
 *   （见 runImageTool 末尾）。
 *
 * 临时目录约定：每次转换一个 `rivet-imgtool-*` 独立目录，finally 中删除；
 * 进程崩溃/SIGKILL 残留由下一次转换时的惰性清扫兜底（mtime 超过 1 小时即删）。
 */
/** 转换临时目录的名称前缀（惰性清扫按此前缀识别残留目录）。 */
export declare const IMAGE_TEMP_DIR_PREFIX = "rivet-imgtool-";
/** 一条候选命令：可执行名 + 参数列表（不经 shell，无需引号转义）。 */
export interface ImageToolCommand {
    bin: string;
    args: string[];
}
/**
 * 「任意格式 → PNG」转换候选命令（首个成功即采用）。
 * darwin/linux：sips → magick → convert；win32：magick → PowerShell
 * （convert 会撞名系统工具 convert.exe，sips 不存在，均排除）。
 * @param inPath - 输入图片路径（任意受支持格式）
 * @param outPath - PNG 输出路径
 * @param platform - 目标平台（默认 process.platform，可注入用于测试）
 * @returns 按优先级排列的候选命令列表
 */
export declare function toPngCandidates(inPath: string, outPath: string, platform?: NodeJS.Platform): ImageToolCommand[];
/**
 * 「等比缩放到长边 ≤ maxEdge 并输出 PNG」候选命令（首个成功即采用）。
 * darwin/linux：sips → magick → convert；win32：magick → PowerShell。
 * @param inPath - 输入图片路径
 * @param outPath - PNG 输出路径
 * @param maxEdge - 长边像素上限（仅超限时缩小，保持宽高比）
 * @param platform - 目标平台（默认 process.platform，可注入用于测试）
 * @returns 按优先级排列的候选命令列表
 */
export declare function resizeCandidates(inPath: string, outPath: string, maxEdge: number, platform?: NodeJS.Platform): ImageToolCommand[];
/**
 * 「等比缩放到长边 ≤ maxEdge 并以 JPEG 质量 quality 输出」候选命令（首个成功即采用）。
 * 用于发送管线的降级压缩链（image-attach）：PNG 源第一级保透明输出 PNG，
 * 其余格式及降级档一律转 JPEG——同时完成「provider 支持格式」转码
 * （BMP/TIFF 等不在 provider 白名单内）。`>` 修饰符 / sips -Z 保证只缩不放。
 * @param inPath - 输入图片路径
 * @param outPath - JPEG 输出路径
 * @param maxEdge - 长边像素上限（仅超限时缩小，保持宽高比）
 * @param quality - JPEG 质量 0-100（sips formatOptions / magick -quality）
 * @param platform - 目标平台（默认 process.platform，可注入用于测试）
 * @returns 按优先级排列的候选命令列表
 */
export declare function resizeJpegCandidates(inPath: string, outPath: string, maxEdge: number, quality: number, platform?: NodeJS.Platform): ImageToolCommand[];
/**
 * PNG 完整性校验：signature（8 字节）+ 首个 chunk 是长度 13 的 IHDR
 * （宽高均为正整数）+ 文件末尾 12 字节为完整 IEND chunk。
 * 防「工具 exit 0 但只写出签名/截断 PNG」被当成可渲染图片。
 * @param buf - 待校验的文件内容
 * @returns 通过完整性校验时为 true
 */
export declare function isCompletePng(buf: Buffer): boolean;
/**
 * 依序尝试候选命令，首个产出有效 PNG 的候选返回其内容 Buffer；全部失败返回 null。
 *
 * 候选级隔离：每个候选把「执行 + 读回 + 校验」作为一体化尝试——先删除
 * outputPath（不存在则忽略），再 execFile 要求 exit 0，readFile 读回后以
 * isCompletePng 校验完整性（签名 + IHDR + IEND，截断 PNG 不算数）。
 * 先删残片是为了避免前一候选留下的非空输出被后一候选
 * （exit 0 但没写文件）误判为自己的产出。
 *
 * 全部失败时若 RIVET_DEBUG 非空，向 stderr 打一行带原因的调试输出
 * （哪个工具、什么错误），避免静默降级不可观测。
 *
 * 注意：硬编码 PNG 校验的前提是两个调用方（toPngCandidates / resizeCandidates）
 * 的产出都是 PNG；未来若接入其他输出格式需放宽此校验。
 * @param candidates - 依序尝试的候选命令
 * @param outputPath - 各候选约定写出的 PNG 路径（每次尝试前先删残片）
 * @param timeoutMs - 单个候选的执行超时（默认 15000ms）
 * @returns 首个有效 PNG 的内容；全部候选失败返回 null
 */
export declare function runImageTool(candidates: ImageToolCommand[], outputPath: string, timeoutMs?: number): Promise<Buffer | null>;
/**
 * 创建本次转换的独立临时目录，并顺手触发惰性清扫（fire-and-forget）。
 * @returns 新建临时目录的绝对路径
 */
export declare function makeImageTempDir(): Promise<string>;
/**
 * 删除转换临时目录；失败静默。
 * @param dir - makeImageTempDir 返回的目录路径
 */
export declare function removeImageTempDir(dir: string): Promise<void>;
/**
 * 清扫超过 1 小时的残留临时目录（进程中断的兜底回收）。
 * @param now - 判定陈旧的基准时间戳（默认 Date.now()，可注入用于测试）
 */
export declare function sweepStaleImageTempDirs(now?: number): Promise<void>;
