/**
 * registry — 会话图片注册表契约测试。
 *
 * - 注册/取（缺省最近一张）/描述缓存（命中与未命中）
 * - LRU 容量驱逐（数量 + 字节双预算）
 * - 非法 ref（零字节/零尺寸）跳过；注册即驱逐的超预算项不返回 id
 */

import { describe, expect, it } from 'vitest'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { ImageRegistry, visionCacheKey } from '../src/registry.ts'

function ref(over: Partial<ImageAttachmentRef> = {}): ImageAttachmentRef {
  return {
    attachmentId: `att_${Math.random().toString(36).slice(2)}` as ImageAttachmentRef['attachmentId'],
    mediaType: 'image/png',
    bytes: 1000,
    width: 100,
    height: 100,
    ...over,
  }
}

describe('register / get', () => {
  it('注册顺序分配 img_1..N，get 缺省返回最近一张', () => {
    const r = new ImageRegistry()
    const ids = r.register([ref(), ref()])
    expect(ids).toEqual(['img_1', 'img_2'])
    expect(r.get()?.id).toBe('img_2')
    expect(r.get('img_1')?.id).toBe('img_1')
  })

  it('get 按 id 取；未知 id 返回 undefined', () => {
    const r = new ImageRegistry()
    r.register([ref()])
    expect(r.get('img_99')).toBeUndefined()
  })

  it('非法 ref（零字节/零尺寸）跳过且不占序号', () => {
    const r = new ImageRegistry()
    const ids = r.register([ref({ bytes: 0 }), ref(), ref({ width: 0 })])
    expect(ids).toEqual(['img_1'])
    expect(r.size).toBe(1)
  })
})

describe('description cache', () => {
  it('同键命中返回缓存，未命中 undefined；缓存后可取', () => {
    const r = new ImageRegistry()
    r.register([ref()])
    expect(r.getCachedDescription('img_1', 'q:hello world')).toBeUndefined()
    r.cacheDescription('img_1', 'q:hello world', '答案')
    expect(r.getCachedDescription('img_1', 'q:hello world')).toBe('答案')
  })

  it('被驱逐图片的缓存写入是 no-op', () => {
    const r = new ImageRegistry({ maxImages: 1 })
    r.register([ref()])
    r.register([ref()]) // img_1 被驱逐
    r.cacheDescription('img_1', 'q:x', '不会存')
    expect(r.getCachedDescription('img_1', 'q:x')).toBeUndefined()
  })
})

describe('LRU 驱逐', () => {
  it('数量超限驱逐最旧触达', () => {
    const r = new ImageRegistry({ maxImages: 2 })
    r.register([ref(), ref(), ref()])
    expect(r.size).toBe(2)
    // img_1 被驱逐，img_2/img_3 保留
    expect(r.get('img_1')).toBeUndefined()
    expect(r.get('img_2')?.id).toBe('img_2')
  })

  it('字节超限按 LRU 驱逐直到预算内', () => {
    const r = new ImageRegistry({ maxBytes: 2500 })
    r.register([ref({ bytes: 1000 }), ref({ bytes: 1000 }), ref({ bytes: 1000 })])
    expect(r.size).toBe(2)
    expect(r.get('img_1')).toBeUndefined()
  })

  it('单张超字节预算：注册即驱逐，id 不返回', () => {
    const r = new ImageRegistry({ maxBytes: 500 })
    const ids = r.register([ref({ bytes: 1000 })])
    expect(ids).toEqual([])
    expect(r.size).toBe(0)
    expect(r.get()).toBeUndefined()
  })

  it('get/缓存命中触达刷新 LRU 顺序', () => {
    const r = new ImageRegistry({ maxImages: 2 })
    r.register([ref(), ref()]) // img_1, img_2
    r.get('img_1') // img_1 变最新
    r.register([ref()]) // 驱逐 img_2
    expect(r.get('img_2')).toBeUndefined()
    expect(r.get('img_1')?.id).toBe('img_1')
  })
})

describe('visionCacheKey（缓存键归一化）', () => {
  it('问题键：折叠空白 + 小写', () => {
    expect(visionCacheKey('  逐字念出  报错 那一行 ')).toBe('q:逐字念出 报错 那一行')
    expect(visionCacheKey('ABC Def')).toBe('q:abc def')
  })

  it('无问题：按配置/默认模式归类', () => {
    expect(visionCacheKey(undefined)).toBe('mode:general')
    expect(visionCacheKey(undefined, '自定义 prompt')).toBe('mode:custom')
  })
})
