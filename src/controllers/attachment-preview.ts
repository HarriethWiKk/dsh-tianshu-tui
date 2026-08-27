/**
 * attachment-preview — composer 附件缩略图维护（自 ui/app.ts C4 提取）。
 *
 * 附件列表变化时重算最后一张的半块预览。sharp 异步解码毫秒级，完成后回调
 * 触发一次重绘；代际号丢弃迟到结果（快速增删/提交清空后不再挂出过期图片）。
 * 渲染失败置 null——计数行仍在，预览是装饰性增强。
 */

import {
  hexToRgb,
  NEUTRAL_PREVIEW_BACKGROUND,
  PREVIEW_MAX_COLS,
  PREVIEW_MAX_ROWS,
  renderHalfBlockPreview,
} from '../engine/image-preview.js'

export interface AttachmentPreviewOptions {
  /** 终端列数（每次刷新时取）。 */
  getColumns: () => number
  /** 主题气泡底色（hex；undefined = 主题无此键）。 */
  getBackground: () => string | undefined
  /** 预览变化后的重绘回调（异步解码完成时触发一次）。 */
  onChanged: () => void
}

export class AttachmentPreviewController {
  private preview: { dataUrl: string; lines: string[] } | null = null
  private epoch = 0
  private readonly opts: AttachmentPreviewOptions

  constructor(opts: AttachmentPreviewOptions) {
    this.opts = opts
  }

  /** 当前预览 ANSI 行（无附件/解码失败为空数组——渲染不占位）。 */
  get lines(): readonly string[] {
    return this.preview?.lines ?? []
  }

  /**
   * 附件列表变化 → 重算最后一张的半块预览。
   * @param images - 变化后的附件 data URL 列表
   */
  async refresh(images: readonly string[]): Promise<void> {
    const last = images[images.length - 1]
    if (last === undefined) {
      this.preview = null
      return
    }
    if (this.preview?.dataUrl === last) return
    const epoch = ++this.epoch
    const cols = Math.max(8, Math.min(PREVIEW_MAX_COLS, this.opts.getColumns() - 6))
    const preview = await renderHalfBlockPreview(last, {
      maxCols: cols,
      maxRows: PREVIEW_MAX_ROWS,
      background: this.background(),
    })
    if (epoch !== this.epoch) return
    this.preview = preview === null ? null : { dataUrl: last, lines: preview.lines }
    this.opts.onChanged()
  }

  /** 预览合成底色：本仓主题无气泡底色键（userMsgBg），统一用中性暗色（明暗终端都可读）。 */
  background(): { r: number; g: number; b: number } {
    const bg = this.opts.getBackground()
    if (bg === undefined) return NEUTRAL_PREVIEW_BACKGROUND
    return hexToRgb(bg) ?? NEUTRAL_PREVIEW_BACKGROUND
  }
}
