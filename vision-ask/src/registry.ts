/**
 * Session-scoped image registry — the vision co-pilot's short-term visual memory.
 *
 * When a user attaches images, their durable attachment references are
 * registered here under short ids (img_1, …). The `ask_image` tool then lets
 * the main model re-query a retained image any number of times without the
 * user re-sending it.
 *
 * Hard boundaries (prefix-cache + privacy discipline):
 *  - NEVER enters the session log or on-disk persistence. The registry holds
 *    only durable `ImageAttachmentRef`s (opaque ids — the bytes stay with the
 *    attachment service); per-image description text is cached in memory for
 *    the session's lifetime.
 *  - Capacity-bounded (count + total bytes) with LRU eviction so a long
 *    session full of screenshots can't grow unbounded.
 *  - Per-image description cache keyed by mode/question so repeated asks about
 *    the same image from the same angle cost zero extra vision calls.
 *
 * Ported from opencode-tui's agent/image-registry.ts (Apache-2.0 upstream);
 * adapted to the dsh public baseline: entries store `ImageAttachmentRef`
 * (the baseline's image blocks carry attachment references, not data URLs),
 * so byte accounting uses the ref's recorded encoded length.
 */

import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'

/** A registered image: durable reference + short id + description cache. */
export interface RegisteredImage {
  id: string
  /** Durable attachment reference owned by the attachment service. */
  ref: ImageAttachmentRef
  /** Description cache: key = normalized question/mode, value = vision answer. */
  descriptions: Map<string, string>
  /** Monotonic touch counter for LRU. */
  lastUsed: number
}

export interface ImageRegistryOptions {
  /** Max retained images. Oldest-touched evicted first. Default 8. */
  maxImages?: number
  /** Max total retained bytes (encoded lengths from the refs). Default 24 MiB. */
  maxBytes?: number
}

const DEFAULT_MAX_IMAGES = 8
const DEFAULT_MAX_BYTES = 24 * 1024 * 1024

export class ImageRegistry {
  private readonly images = new Map<string, RegisteredImage>()
  private readonly maxImages: number
  private readonly maxBytes: number
  private seq = 0
  private clock = 0

  constructor(opts: ImageRegistryOptions = {}) {
    this.maxImages = opts.maxImages ?? DEFAULT_MAX_IMAGES
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  }

  /**
   * Register one or more attachment references. Malformed entries (zero bytes
   * or zero dimensions) are skipped — the attachment service already validated
   * them at the save boundary, so this is defense in depth.
   * @param refs - durable image references, registered in input order.
   * @returns the ids assigned to the accepted images, in input order.
   */
  register(refs: readonly ImageAttachmentRef[]): string[] {
    const ids: string[] = []
    for (const ref of refs) {
      if (ref.bytes <= 0 || ref.width <= 0 || ref.height <= 0) continue
      const id = `img_${++this.seq}`
      this.images.set(id, {
        id,
        ref,
        descriptions: new Map(),
        lastUsed: ++this.clock,
      })
      ids.push(id)
    }
    this.evictIfNeeded()
    // 只返回活下来的 id：一张超出字节预算的图会在同一轮被驱逐，返回它的 id 等于
    // 递给调用方一个查不到的引用（提示里写着 img_9，ask_image 却说没有这张图）。
    return ids.filter(id => this.images.has(id))
  }

  /**
   * Fetch a retained image by id, or the most-recently-registered when id is
   * omitted. Touches LRU. Returns undefined when nothing matches.
   * @param id - optional `img_<n>` id; omission selects the most recent image.
   */
  get(id?: string): RegisteredImage | undefined {
    const img = id ? this.images.get(id) : this.mostRecent()
    if (img) img.lastUsed = ++this.clock
    return img
  }

  /**
   * Cached description for (id, key), if present. Touches LRU on hit.
   * @param id - the registered image id.
   * @param key - the normalized question/mode cache key.
   */
  getCachedDescription(id: string, key: string): string | undefined {
    const img = this.images.get(id)
    if (!img) return undefined
    const hit = img.descriptions.get(key)
    if (hit !== undefined) img.lastUsed = ++this.clock
    return hit
  }

  /**
   * Store a description for (id, key). No-op if the image was evicted.
   * @param id - the registered image id.
   * @param key - the normalized question/mode cache key.
   * @param text - the vision model's answer.
   */
  cacheDescription(id: string, key: string, text: string): void {
    this.images.get(id)?.descriptions.set(key, text)
  }

  /** Registered images, newest first (for UI / tool hints). */
  list(): RegisteredImage[] {
    return [...this.images.values()].sort((a, b) => b.lastUsed - a.lastUsed)
  }

  /** Number of currently retained images. */
  get size(): number {
    return this.images.size
  }

  clear(): void {
    this.images.clear()
  }

  /** Highest `lastUsed` wins. No tie-break needed: the clock advances on every
   *  register/touch, so two entries can never share a value. */
  private mostRecent(): RegisteredImage | undefined {
    let best: RegisteredImage | undefined
    for (const img of this.images.values()) {
      if (!best || img.lastUsed > best.lastUsed) best = img
    }
    return best
  }

  private evictIfNeeded(): void {
    // Evict oldest-touched until within both count and byte budgets.
    const byLru = (): RegisteredImage[] => [...this.images.values()].sort((a, b) => a.lastUsed - b.lastUsed)
    while (this.images.size > this.maxImages) {
      const victim = byLru()[0]
      if (!victim) break
      this.images.delete(victim.id)
    }
    let total = 0
    for (const img of this.images.values()) total += img.ref.bytes
    while (total > this.maxBytes && this.images.size > 0) {
      const victim = byLru()[0]
      if (!victim) break
      total -= victim.ref.bytes
      this.images.delete(victim.id)
    }
  }
}

/**
 * 归一化一次视觉查询为缓存键：定向问题 → 折叠空白 + 小写的问题文本；
 * 无问题（首次描述）→ 按选中的描述模式（general/ocr）归类。
 * 同图同角度重复问命中缓存零调用。不做语义哈希/嵌入（只做字符串归一化，
 * 避免不稳定字节）。移植自 opencode-tui vision-service.ts 的 visionCacheKey。
 * @param question - 用户/模型对图片提出的具体问题（可省略）
 * @param configuredPrompt - 显式配置的描述 prompt（可省略）
 * @param accompanyingText - 随图文本（prompt 未配置时参与模式判定，可省略）
 * @returns 稳定缓存键
 */
export function visionCacheKey(question?: string, configuredPrompt?: string, accompanyingText?: string): string {
  const q = question?.trim()
  if (q) return `q:${q.replace(/\s+/g, ' ').toLowerCase()}`
  // 无问题时按描述模式归类：显式 prompt 视为 general（不可归类为 UI 精确模式）。
  return configuredPrompt && configuredPrompt.trim() ? 'mode:custom' : 'mode:general'
}
