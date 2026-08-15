/**
 * session-brief 适配层测试：梗概 sidecar 存储、输入摘录、路由解析、
 * LLM 生成与 /session list 回填编排。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import {
  EMPTY_BRIEF,
  MAX_BRIEF_CHARS,
  briefsFilePath,
  ensureSessionBriefs,
  extractBriefTranscript,
  normalizeBrief,
  resolveBriefRoute,
  resolveDshHome,
} from '../src/adapter/session-brief.js'
import type { SessionSummary } from '../src/adapter/sessions.js'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'dsh-tui-brief-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

const storeFile = (): string => join(tempDir, 'tui', 'session-briefs.json')
const sid = (n: string): SessionId => `session-brief-${n}` as SessionId

function row(id: SessionId, createdAt = 1): SessionSummary {
  return { id, version: 0, createdAt, cwd: undefined, parentSession: undefined }
}

function userEvent(seq: number, text: string): SessionEvent {
  return {
    seq,
    time: 1000 + seq,
    type: 'user/message',
    data: { content: [{ type: 'text', text }], source: { kind: 'user' } },
  } as unknown as SessionEvent
}

function pluginUserEvent(seq: number, text: string): SessionEvent {
  return {
    seq,
    time: 1000 + seq,
    type: 'user/message',
    data: { content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'test' } },
  } as unknown as SessionEvent
}

function assistantEvent(seq: number, text: string): SessionEvent {
  return {
    seq,
    time: 1000 + seq,
    type: 'assistant/message',
    data: { turn: 1, step: 1, message: { content: [{ type: 'text', text }] } },
  } as unknown as SessionEvent
}

function requestHeaderEvent(seq: number, provider: string, model: string): SessionEvent {
  return {
    seq,
    time: 1000 + seq,
    type: 'request/header',
    data: { header: { config: { provider, model } }, reason: 'initial' },
  } as unknown as SessionEvent
}

/** 组成一段完整文本响应的 chunk 流。 */
function textChunks(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

/** 最小 ctx 替身：reflect.get/get 返回 overrides；sessions 走内存表。 */
function makeCtx(
  overrides: Record<string, unknown> = {},
  sessions: Array<{ id: SessionId; events: SessionEvent[] }> = [],
): Context {
  const byId = new Map(sessions.map(s => [s.id, s]))
  const ctx = {
    reflect: { get: vi.fn((name: string) => overrides[name]) },
    get: vi.fn((name: string) => overrides[name]),
    sessions: {
      list: vi.fn(() => sessions),
      get: vi.fn((id: SessionId) => byId.get(id)),
    },
  } as unknown as Context
  return ctx
}

/** 可断言的 llm 替身：stream 记录 options 并按 chunksProvider 产出。 */
function makeLlm(chunksProvider: () => StreamChunk[]): {
  stream: ReturnType<typeof vi.fn<(options: unknown) => AsyncIterable<StreamChunk>>>
} {
  const stream = vi.fn<(options: unknown) => AsyncIterable<StreamChunk>>(async function* () {
    yield* chunksProvider()
  })
  return { stream }
}

describe('resolveDshHome / briefsFilePath', () => {
  it('DSH_HOME 优先，空白视为未设置，缺省 ~/.dsh', () => {
    expect(resolveDshHome({})).toBe(join(homedir(), '.dsh'))
    expect(resolveDshHome({ DSH_HOME: '  ' })).toBe(join(homedir(), '.dsh'))
    expect(resolveDshHome({ DSH_HOME: '/tmp/dsh-x' })).toBe('/tmp/dsh-x')
  })

  it('briefsFilePath 位于 <home>/tui/session-briefs.json', () => {
    expect(briefsFilePath('/tmp/dsh-x')).toBe('/tmp/dsh-x/tui/session-briefs.json')
  })
})

describe('normalizeBrief', () => {
  it('剥离控制符并折叠空白', () => {
    expect(normalizeBrief(' 一句话\n\r 梗概 \t内容 ')).toBe('一句话 梗概 内容')
  })

  it('剥离两侧引号与 Markdown 强调符', () => {
    expect(normalizeBrief('"**一句话梗概**"')).toBe('一句话梗概')
    expect(normalizeBrief('「一句话梗概」')).toBe('一句话梗概')
  })

  it(`超出 ${MAX_BRIEF_CHARS} 字符以 … 截断`, () => {
    const long = '梗'.repeat(MAX_BRIEF_CHARS + 30)
    const out = normalizeBrief(long)
    expect(Array.from(out).length).toBe(MAX_BRIEF_CHARS)
    expect(out.endsWith('…')).toBe(true)
  })

  it('空白/引号残留为空串', () => {
    expect(normalizeBrief('""')).toBe('')
    expect(normalizeBrief('   ')).toBe('')
  })
})

describe('extractBriefTranscript', () => {
  it('取首条+末条真人用户消息与最后一条助手消息', () => {
    const events = [
      userEvent(1, '第一条问题'),
      assistantEvent(2, '第一次回答'),
      userEvent(3, '第二条问题'),
      assistantEvent(4, '最终回答'),
    ]
    const turns = extractBriefTranscript(events)
    expect(turns).toEqual([
      { role: 'user', text: '第一条问题' },
      { role: 'user', text: '第二条问题' },
      { role: 'assistant', text: '最终回答' },
    ])
  })

  it('跳过合成注入消息与空文本', () => {
    const events = [
      pluginUserEvent(1, '注入的上下文'),
      userEvent(2, '真实问题'),
      assistantEvent(3, '回答'),
    ]
    const turns = extractBriefTranscript(events)
    expect(turns.map(t => t.text)).toEqual(['真实问题', '回答'])
  })

  it('超过字节预算时按顺序舍弃并截断末段', () => {
    const events = [
      userEvent(1, 'x'.repeat(100)),
      userEvent(2, 'y'.repeat(100)),
      assistantEvent(3, 'z'.repeat(100)),
    ]
    const turns = extractBriefTranscript(events, 150)
    // 100x + 50y（截断），z 段被预算挤出。
    expect(turns).toEqual([
      { role: 'user', text: 'x'.repeat(100) },
      { role: 'user', text: 'y'.repeat(50) },
    ])
  })

  it('无真人消息返回空数组', () => {
    expect(extractBriefTranscript([pluginUserEvent(1, '仅注入')])).toEqual([])
    expect(extractBriefTranscript([])).toEqual([])
  })
})

describe('resolveBriefRoute', () => {
  it('deepseek 系默认选择固定为 deepseek-v4-flash', () => {
    const ctx = makeCtx({
      agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-pro' }) },
    })
    expect(resolveBriefRoute(ctx, [])).toEqual({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })
  })

  it('其它开发商沿用默认选择本身', () => {
    const ctx = makeCtx({
      agentDefaultModel: { currentSelection: () => ({ provider: 'openai', model: 'gpt-5' }) },
    })
    expect(resolveBriefRoute(ctx, [])).toEqual({ provider: 'openai', model: 'gpt-5' })
  })

  it('服务缺失时回退会话最新 request/header 路由（deepseek 同样替换 flash）', () => {
    const ctx = makeCtx()
    const events = [
      requestHeaderEvent(1, 'deepseek-official', 'deepseek-v4-pro'),
    ]
    expect(resolveBriefRoute(ctx, events)).toEqual({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })
    const other = [requestHeaderEvent(1, 'openai', 'gpt-5')]
    expect(resolveBriefRoute(ctx, other)).toEqual({ provider: 'openai', model: 'gpt-5' })
  })

  it('currentSelection 抛错时走事件路由回退', () => {
    const ctx = makeCtx({
      agentDefaultModel: { currentSelection: () => { throw new Error('broken') } },
    })
    const events = [requestHeaderEvent(1, 'openai', 'gpt-5')]
    expect(resolveBriefRoute(ctx, events)).toEqual({ provider: 'openai', model: 'gpt-5' })
  })

  it('无任何路由信息时回退 harness 基线 flash', () => {
    expect(resolveBriefRoute(makeCtx(), [])).toEqual({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })
  })
})

describe('ensureSessionBriefs', () => {
  it('缓存命中直接复用，不调 llm', async () => {
    await mkdir(join(tempDir, 'tui'), { recursive: true })
    await writeFile(storeFile(), JSON.stringify({ version: 1, briefs: { [sid('a')]: '已缓存梗概' } }))
    const { stream } = makeLlm(() => { throw new Error('不应被调用') })
    const ctx = makeCtx({ llm: { stream } })
    const map = await ensureSessionBriefs(ctx, [row(sid('a'))], {}, storeFile())
    expect(map.get(sid('a'))).toBe('已缓存梗概')
    expect(stream).not.toHaveBeenCalled()
  })

  it('缺失梗概时生成并落盘；deepseek 默认选择替换为 flash', async () => {
    const { stream } = makeLlm(() => textChunks('生成的一句话梗概'))
    const ctx = makeCtx(
      { llm: { stream }, agentDefaultModel: { currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-pro' }) } },
      [{ id: sid('a'), events: [userEvent(1, '帮我写个测试'), assistantEvent(2, '已写好')] }],
    )
    const onPending = vi.fn()
    const onFailed = vi.fn()
    const map = await ensureSessionBriefs(ctx, [row(sid('a'))], { onPending, onFailed }, storeFile())
    expect(map.get(sid('a'))).toBe('生成的一句话梗概')
    expect(onPending).toHaveBeenCalledWith(sid('a'), 0, 1)
    expect(onFailed).not.toHaveBeenCalled()
    // 路由与输出上限符合约定
    const options = stream.mock.calls[0][0] as { provider: string; model: string; maxTokens: number; system: string }
    expect(options.provider).toBe('deepseek-official')
    expect(options.model).toBe('deepseek-v4-flash')
    expect(options.maxTokens).toBe(128)
    // 梗概 = 研究主题短语（任务标题式），不是「用户做了什么」的叙事。
    expect(options.system).toContain('topic phrase')
    expect(options.system).toContain('Do not narrate who asked')
    // 已落盘：再次调用（llm 换成抛错替身）仍读缓存
    const cached = JSON.parse(await readFile(storeFile(), 'utf8')) as { briefs: Record<string, string> }
    expect(cached.briefs[sid('a')]).toBe('生成的一句话梗概')
    const { stream: boom } = makeLlm(() => { throw new Error('不应被调用') })
    const again = await ensureSessionBriefs(makeCtx({ llm: { stream: boom } }), [row(sid('a'))], {}, storeFile())
    expect(again.get(sid('a'))).toBe('生成的一句话梗概')
    expect(boom).not.toHaveBeenCalled()
  })

  it('其它开发商的默认选择原样透传', async () => {
    const { stream } = makeLlm(() => textChunks('openai 生成的一句话梗概'))
    const ctx = makeCtx(
      { llm: { stream }, agentDefaultModel: { currentSelection: () => ({ provider: 'openai', model: 'gpt-5' }) } },
      [{ id: sid('a'), events: [userEvent(1, '问题')] }],
    )
    const map = await ensureSessionBriefs(ctx, [row(sid('a'))], {}, storeFile())
    expect(map.get(sid('a'))).toBe('openai 生成的一句话梗概')
    const options = stream.mock.calls[0][0] as { provider: string; model: string }
    expect(options).toMatchObject({ provider: 'openai', model: 'gpt-5' })
  })

  it('生成失败记 onFailed、不落盘、不中断其它会话', async () => {
    const { stream } = makeLlm(() => [
      { type: 'finish', reason: { kind: 'error', failure: { message: 'boom', code: 'BOOM' } } },
    ])
    const okLlm = makeLlm(() => textChunks('另一个会话的梗概'))
    const okId = sid('ok')
    const badId = sid('bad')
    const ctx = makeCtx(
      {
        llm: {
          stream: vi.fn((options: { sessionId: SessionId }) => {
            return options.sessionId === badId
              ? stream(options)
              : okLlm.stream(options)
          }),
        },
      },
      [
        { id: badId, events: [userEvent(1, '问题 A')] },
        { id: okId, events: [userEvent(1, '问题 B')] },
      ],
    )
    const onPending = vi.fn()
    const onFailed = vi.fn()
    const map = await ensureSessionBriefs(ctx, [row(badId), row(okId)], { onPending, onFailed }, storeFile())
    expect(map.get(okId)).toBe('另一个会话的梗概')
    expect(map.has(badId)).toBe(false)
    expect(onFailed).toHaveBeenCalledTimes(1)
    expect(onFailed.mock.calls[0][0]).toBe(badId)
    expect(onPending).toHaveBeenCalledTimes(2)
    // 落盘只含成功项
    const cached = JSON.parse(await readFile(storeFile(), 'utf8')) as { briefs: Record<string, string> }
    expect(cached.briefs).toEqual({ [okId]: '另一个会话的梗概' })
  })

  it('无聊天记录的会话直接标「新对话」：不调 llm、不回显进度、不落盘', async () => {
    const { stream } = makeLlm(() => { throw new Error('不应被调用') })
    const ctx = makeCtx(
      { llm: { stream } },
      [{ id: sid('a'), events: [pluginUserEvent(1, '仅注入上下文')] }],
    )
    const onPending = vi.fn()
    const map = await ensureSessionBriefs(ctx, [row(sid('a'))], { onPending }, storeFile())
    expect(map.get(sid('a'))).toBe(EMPTY_BRIEF)
    expect(onPending).not.toHaveBeenCalled()
    expect(stream).not.toHaveBeenCalled()
    // 「新对话」是状态不是内容，不写入 sidecar（文件都不产生）。
    await expect(readFile(storeFile(), 'utf8')).rejects.toThrow()
  })

  it('「新对话」不缓存：会话之后产生记录，下次经 API 生成真实梗概', async () => {
    const firstLlm = makeLlm(() => { throw new Error('不应被调用') })
    const emptyCtx = makeCtx({ llm: { stream: firstLlm.stream } }, [{ id: sid('a'), events: [] }])
    const first = await ensureSessionBriefs(emptyCtx, [row(sid('a'))], {}, storeFile())
    expect(first.get(sid('a'))).toBe(EMPTY_BRIEF)
    // 会话产生聊天记录后再次列举：不再读到「新对话」，而是走 API 生成。
    const { stream } = makeLlm(() => textChunks('后来生成的梗概'))
    const grownCtx = makeCtx(
      { llm: { stream } },
      [{ id: sid('a'), events: [userEvent(1, '后来提出的问题')] }],
    )
    const second = await ensureSessionBriefs(grownCtx, [row(sid('a'))], {}, storeFile())
    expect(second.get(sid('a'))).toBe('后来生成的梗概')
    expect(stream).toHaveBeenCalledTimes(1)
  })

  it('llm 服务缺失时记失败并返回空映射', async () => {
    const ctx = makeCtx({}, [{ id: sid('a'), events: [userEvent(1, '问题')] }])
    const onFailed = vi.fn()
    const map = await ensureSessionBriefs(ctx, [row(sid('a'))], { onFailed }, storeFile())
    expect(map.size).toBe(0)
    expect(onFailed).toHaveBeenCalledTimes(1)
  })
})
