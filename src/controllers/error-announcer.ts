/**
 * error-announcer — agent 错误落底 + 恢复指引 + 错误后回填（自 ui/app.ts 提取）。
 *
 * 三件事：
 * ① glance 完整错误文本以「新错误」出现时落底 scrollback 一次（diff 去重，
 *    附 errorRecoveryHint 指引尾注）——同错误逐帧重读不重复落底；
 * ② 记录最近一条已投递的用户消息（lastSubmitted；回流自 Tianshu Harness
 *    807686a02 的 lastSubmittedText 生命周期：投递时记录、成功 settle 清）；
 * ③ 新错误出现且输入行为空时回填该消息——错误时刻可行动：改一下就能重发，
 *    以 dim 提示行告知「可能未被完整处理」。已有草稿不抢写；一次错误只
 *    回填一次（取走即清，防重入双份）。
 *
 * 与 Tianshu 原版的差异：dsh-tui 无 abort 独立回填路径，故 abort 不清底料
 * （后续错误仍可回填）；slash 命令不记入（调用方只在文本投递路径 record）。
 */

import { errorRecoveryHint, formatWarnWithHint } from '../format/error-recovery.js'
import type { RivetTheme } from '../theme.js'

/** 回填告知行（dim；commit 由装配方着色上下文决定）。 */
export const REFILL_NOTE = '↩ 上一条消息可能未被完整处理——已回填输入框，编辑后回车重发'

export interface ErrorAnnouncerDeps {
  /** 主题（announce 时取，避免构造期依赖未就绪的实例字段）。 */
  getTheme: () => RivetTheme
  /** 落底 scrollback（装配方注入；多行文本由本类拼装后一次交出）。 */
  commit: (text: string) => void
  /** 回填输入行（装配方注入：setValue + 重绘）。 */
  refillInput: (text: string) => void
}

export class ErrorAnnouncer {
  private lastText: string | null = null
  private lastSubmitted: string | null = null
  private readonly deps: ErrorAnnouncerDeps

  constructor(deps: ErrorAnnouncerDeps) {
    this.deps = deps
  }

  /** 文本投递路径调用（slash 命令不记；排队消息在 flush 投递时记）。 */
  recordSubmitted(text: string): void {
    this.lastSubmitted = text
  }

  /** 成功 settle（非中止 turn/end）清底料——成功后错误不回填旧消息。 */
  clearSubmitted(): void {
    this.lastSubmitted = null
  }

  /**
   * renderLive 逐帧调用；仅「新错误文本」动作（重入安全）。
   * @param errorFull - glance 完整错误文本；null = 当前无错误。
   * @param inputEmpty - 输入行是否为空（false 不抢写草稿）。
   */
  announce(errorFull: string | null, inputEmpty: boolean): void {
    if (errorFull === null || errorFull === this.lastText) return
    this.lastText = errorFull
    this.deps.commit(formatWarnWithHint(errorFull, errorRecoveryHint(errorFull), this.deps.getTheme()))
    const last = this.lastSubmitted
    if (inputEmpty && last !== null) {
      this.lastSubmitted = null
      this.deps.commit(REFILL_NOTE)
      this.deps.refillInput(last)
    }
  }

  /** 会话切换/卸载复位：错误去重指针不跨会话（底料随切会话清空语义归调用方）。 */
  reset(): void {
    this.lastText = null
  }
}
