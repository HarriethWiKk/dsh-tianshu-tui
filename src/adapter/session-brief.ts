/**
 * Session brief — `/session list` 每行的会话主题梗概。
 *
 * 梗概是「研究的问题/主题本身」的任务标题式短语（如「评估某模型的识别准确率」
 * 「实现某插件的自动连接」），而不是「用户做了什么」的叙事。
 *
 * 职责与边界：
 * - 梗概是 TUI 私有展示层缓存：存放在 `$DSH_HOME/tui/session-briefs.json`
 *   （sidecar 文件，按 session id 索引），**不写回 session log、不发明事件类型**，
 *   符合 registry 的 dsh 纪律。
 * - 生成走既有 llm 服务的一次辅助调用（`purpose: 'session-title'`，DeepSeek
 *   适配器据此关闭 thinking，输出预算留给可见文本）。模型路由策略：
 *   deepseek 系 provider → 固定 `deepseek-v4-flash`（梗概是廉价辅助调用）；
 *   其它开发商 → 沿用用户当前默认模型（`agent-default-model.currentSelection`）。
 *   agent-default-model 服务缺失时回退到会话自身最新的 `request/header` 路由，
 *   再无则回退 harness 基线的 `deepseek-official/deepseek-v4-flash`。
 * - 历史会话（旧版本产生、无梗概）与新建会话统一按「缺则补」处理：首次
 *   `/session list` 时生成并落盘，之后读缓存，不再调 API。
 * - 没有任何聊天记录的会话不调 API：梗概直接展示「新对话」（状态，不落盘）。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/adapter/session-brief
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionId, SessionEvent } from '@deepseek-ai/dsh-session'
import type { ContentBlock, GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { loadHistory, type SessionSummary } from './sessions.js'

/** agent-default-model 的最小读面（与 registry.ts 的 ModelFacet 同构）。 */
interface DefaultModelFacet {
  currentSelection(): { provider: string; model: string; reasoningEffort?: string }
}

/** llm 服务的最小调用面（只消费 stream；类型由 dsh-llm 提供）。 */
interface LlmFacet {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

/** 梗概提示词输入摘录的一轮：真人用户消息或最后一条助手消息。 */
export interface BriefTranscriptTurn {
  readonly role: 'user' | 'assistant'
  readonly text: string
}

/** 摘录输入的总字节预算（含 JSON 框架外的估算余量）。 */
export const MAX_INPUT_BYTES = 6000
/** 辅助调用输出 token 上限（一句话梗概足够）。 */
export const MAX_OUTPUT_TOKENS = 128
/** 端到端超时（与 session-title-llm 同档）。 */
export const BRIEF_TIMEOUT_MS = 60_000
/** 超时错误码（展示与诊断用）。 */
export const BRIEF_TIMEOUT_CODE = 'SESSION_BRIEF_TIMEOUT'
/** 梗概文本长度上限（字符，超出以 … 截断）。 */
export const MAX_BRIEF_CHARS = 120
/** 无聊天记录的会话直接展示的占位梗概（状态而非内容，不落盘、不调 API）。 */
export const EMPTY_BRIEF = '新对话'
/** deepseek 系 provider 的梗概固定模型。 */
const BRIEF_MODEL = 'deepseek-v4-flash'
/** 无任何可用路由时的 harness 基线兜底。 */
const DEFAULT_ROUTE = { provider: 'deepseek-official', model: BRIEF_MODEL }
/** 梗概 sidecar 文件在 dsh home 下的位置。 */
const STORE_DIR = 'tui'
const STORE_FILE = 'session-briefs.json'

/**
 * 解析 dsh home：`$DSH_HOME`（非空白）优先，否则 `~/.dsh`。
 * 与 dsh-home-paths 的优先级一致（configured > $DSH_HOME > ~/.dsh）；
 * 「configured 路径」是宿主进程内的显式覆盖，插件侧不可见，按环境变量/
 * 默认值处理即可——sidecar 与 sessions 目录同根，两者解析一致。
 * @param env - 环境变量映射（测试可注入）。
 * @returns dsh home 绝对路径。
 */
export function resolveDshHome(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.DSH_HOME?.trim()
  return explicit !== undefined && explicit !== '' ? explicit : join(homedir(), '.dsh')
}

/**
 * 梗概 sidecar 文件路径。
 * @param home - dsh home；缺省由 {@link resolveDshHome} 解析。
 */
export function briefsFilePath(home: string = resolveDshHome()): string {
  return join(home, STORE_DIR, STORE_FILE)
}

/** sidecar 文件内容（带版本号的信封，未来可演进）。 */
interface BriefStoreFile {
  readonly version: 1
  readonly briefs: Record<string, string>
}

/** 读取 sidecar；缺失/损坏均容忍为空（梗概只是缓存，可重新生成）。 */
async function readBriefs(file: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(file, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return {}
    const briefs = (parsed as { briefs?: unknown }).briefs
    if (briefs === null || typeof briefs !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [id, brief] of Object.entries(briefs as Record<string, unknown>)) {
      if (typeof brief === 'string' && brief !== '') out[id] = brief
    }
    return out
  } catch {
    return {}
  }
}

/** 原子写 sidecar：临时文件 + rename，避免中断留下半截 JSON。 */
async function writeBriefs(file: string, briefs: Record<string, string>): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const payload: BriefStoreFile = { version: 1, briefs }
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8')
  await rename(tmp, file)
}

/** 拼接消息中的全部文本块。 */
function textOf(content: readonly ContentBlock[]): string {
  return content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
}

/** 按 UTF-8 字节上限截断（不劈开码点）。 */
function truncateByBytes(text: string, max: number): string {
  if (max <= 0) return ''
  if (Buffer.byteLength(text, 'utf8') <= max) return text
  let out = ''
  for (const ch of text) {
    if (Buffer.byteLength(out + ch, 'utf8') > max) break
    out += ch
  }
  return out
}

/**
 * 从会话事件摘录梗概输入：首条 + 末条真人用户消息，以及最后一条助手文本。
 * 合成注入（agent.inject 的 context 消息，source.kind !== 'user'）不入梗概；
 * 总字节数受 `maxBytes` 约束，超出的片段按顺序舍弃、最后一段截断。
 * @param events - 会话事件日志。
 * @param maxBytes - 输出摘录的总字节预算。
 * @returns 摘录轮次；无真人消息时为 []（调用方跳过生成）。
 */
export function extractBriefTranscript(
  events: readonly SessionEvent[],
  maxBytes: number = MAX_INPUT_BYTES,
): BriefTranscriptTurn[] {
  const userTexts: string[] = []
  const assistantTexts: string[] = []
  for (const event of events) {
    if (event.type === 'user/message') {
      // 只取真人提示；?. 防御旧日志缺 source 的退化数据。
      if (event.data.source?.kind !== 'user') continue
      const text = textOf(event.data.content)
      if (text !== '') userTexts.push(text)
    } else if (event.type === 'assistant/message') {
      const text = textOf(event.data.message.content)
      if (text !== '') assistantTexts.push(text)
    }
  }
  const candidates: BriefTranscriptTurn[] = []
  const firstUser = userTexts[0]
  const lastUser = userTexts[userTexts.length - 1]
  if (firstUser !== undefined) candidates.push({ role: 'user', text: firstUser })
  if (userTexts.length > 1 && lastUser !== undefined) candidates.push({ role: 'user', text: lastUser })
  const lastAssistant = assistantTexts[assistantTexts.length - 1]
  if (lastAssistant !== undefined) candidates.push({ role: 'assistant', text: lastAssistant })
  const turns: BriefTranscriptTurn[] = []
  let used = 0
  for (const candidate of candidates) {
    if (used >= maxBytes) break
    const text = truncateByBytes(candidate.text, maxBytes - used)
    if (text === '') continue
    turns.push({ role: candidate.role, text })
    used += Buffer.byteLength(text, 'utf8')
  }
  return turns
}

/** 经 reflect.get 读取可选服务（Cordis 4：属性访问未注册服务会抛 without inject）。 */
function readService<T>(ctx: Context, name: string): T | undefined {
  const value = ctx.reflect !== undefined
    ? ctx.reflect.get(name, false)
    : ctx.get(name)
  return value as T | undefined
}

/**
 * 解析梗概调用的 provider/model 路由。
 * - 用户默认选择为 deepseek 系 provider → 固定 `deepseek-v4-flash`；
 * - 其它开发商 → 沿用默认选择本身（不对其它厂商强塞 deepseek 模型名）；
 * - agent-default-model 服务缺失 → 回退会话自身最新的 `request/header` 路由；
 * - 再无 → harness 基线 `deepseek-official/deepseek-v4-flash`。
 * @param ctx - 服务上下文。
 * @param events - 目标会话事件（路由回退用）。
 */
export function resolveBriefRoute(
  ctx: Context,
  events: readonly SessionEvent[],
): { provider: string; model: string } {
  const defaultModel = readService<DefaultModelFacet>(ctx, 'agentDefaultModel')
  if (defaultModel !== undefined) {
    try {
      const selection = defaultModel.currentSelection()
      if (selection.provider !== '' && selection.model !== '') {
        return selection.provider.toLowerCase().includes('deepseek')
          ? { provider: selection.provider, model: BRIEF_MODEL }
          : { provider: selection.provider, model: selection.model }
      }
    } catch {
      // 服务异常时按未配置处理，走事件路由回退。
    }
  }
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event?.type !== 'request/header') continue
    const config = event.data.header.config
    if (config.provider === '' || config.model === '') continue
    return config.provider.toLowerCase().includes('deepseek')
      ? { provider: config.provider, model: BRIEF_MODEL }
      : { provider: config.provider, model: config.model }
  }
  return DEFAULT_ROUTE
}

/**
 * 规范化模型输出：去终端控制符、折叠空白、剥离两侧引号/强调符，
 * 超出 {@link MAX_BRIEF_CHARS} 以 … 截断。空文本返回 ''。
 * @param raw - 模型原始输出。
 */
export function normalizeBrief(raw: string): string {
  let text = raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  text = text.replace(/^["'“”‘’「」『』`*_-]+/, '').replace(/["'“”‘’「」『』`*_-]+$/, '')
  text = text.trim()
  if (text === '') return ''
  const chars = Array.from(text)
  if (chars.length > MAX_BRIEF_CHARS) return chars.slice(0, MAX_BRIEF_CHARS - 1).join('') + '…'
  return text
}

/**
 * 一次辅助 LLM 调用：输入摘录 → 会话主题梗概（任务标题式短语）。
 * 失败（超时/模型错误/非文本输出）向上抛，由编排层记失败。
 */
async function generateBrief(
  ctx: Context,
  id: SessionId,
  route: { provider: string; model: string },
  turns: readonly BriefTranscriptTurn[],
): Promise<string> {
  const llm = readService<LlmFacet>(ctx, 'llm')
  if (llm === undefined) throw new Error('llm 服务不可用，无法生成会话梗概')
  // 梗概 = 会话研究的问题/主题本身（任务标题式短语），不是「用户做了什么」的
  // 叙事——示例风格：「评估某模型的识别准确率」「实现某插件的自动连接」「某库
  // 升级与发布的关系」。动词开头（实现/修复/评估…）可接受，动作的施事者不可出现。
  const system = [
    'Summarize what this AI coding-assistant session is about as ONE concise topic phrase: the problem, subject, or goal the session works on, styled like a task title (e.g. "评估某模型的识别准确率", "实现某插件的自动连接", "某版本发布与推送的关系").',
    'Return only that topic phrase in plain text, in the language of the messages. No quotes, no Markdown, no prefixes, no terminal control codes. Do not narrate who asked or what was done.',
  ].join('\n')
  const framed = `Summarize the research topic of this session from the transcript excerpt (JSON array of user turns and the final assistant turn):\n${JSON.stringify(turns)}`
  const messages = [createUserMessage({
    content: [{ type: 'text', text: framed }],
    source: { kind: 'plugin', plugin: 'dsh-tianshu-tui' },
  })]
  // 调用方（/session list 命令）无取消路径，只挂超时。
  const signal = AbortSignal.any([AbortSignal.timeout(BRIEF_TIMEOUT_MS)])
  const options: GenerateOptions = {
    provider: route.provider,
    model: route.model,
    messages,
    system,
    maxTokens: MAX_OUTPUT_TOKENS,
    sessionId: id,
    // 辅助调用的既有 purpose 词汇：DeepSeek 适配器据此关闭 thinking，
    // 把输出预算留给主题梗概。
    purpose: 'session-title',
    signal,
  }
  const assembler = new BlockAssembler()
  try {
    for await (const chunk of llm.stream(options)) {
      signal.throwIfAborted()
      assembler.push(chunk)
    }
  } catch (error) {
    if (signal.aborted) {
      const timeout = new Error('会话梗概生成超时') as Error & { code?: string }
      timeout.code = BRIEF_TIMEOUT_CODE
      throw timeout
    }
    throw error
  }
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    const failure = new Error(`会话梗概生成失败: ${finish.failure.message}`) as Error & { code?: string }
    failure.code = finish.failure.code
    throw failure
  }
  if (finish.kind === 'max-tokens') throw new Error('会话梗概生成失败: 输出达到 token 上限')
  if (finish.kind === 'tool-calls') throw new Error('会话梗概生成失败: 模型意外请求了工具')
  /* v8 ignore next -- finish.kind 恒为 'stop'；merge-extensible 词汇的未知值防御 */
  if ((finish.kind as string) !== 'stop') {
    throw new Error(`会话梗概生成失败: 未知结束原因 ${String(finish.kind)}`)
  }
  const brief = normalizeBrief(
    assembler.blocks().filter(block => block.type === 'text').map(block => block.text).join(' '),
  )
  if (brief === '') throw new Error('会话梗概生成失败: 模型未产出文本')
  return brief
}

/** 批量生成进度钩子。 */
export interface BriefGenerationHooks {
  /** 每个待生成会话开始前回调；completed 为已处理数，total 为待生成总数。 */
  onPending?(id: SessionId, completed: number, total: number): void
  /** 单个会话生成失败时回调（不中断整体）。 */
  onFailed?(id: SessionId, error: unknown): void
}

/**
 * 保证 `rows` 中每个会话都有梗概：缓存命中直接复用；缺失则生成并落盘
 * （历史会话回填与新会话首次展示统一走这条路径）；无任何聊天记录的会话
 * 直接标 {@link EMPTY_BRIEF}（不调 API、不落盘、不回显进度）。串行执行，
 * 回显顺序与行序一致；单个失败跳过并记 `onFailed`，下次 `/session list` 重试。
 * @param ctx - 服务上下文（llm / agentDefaultModel / sessions / sessionPersistence）。
 * @param rows - 待展示的会话行（`listSessions` 产出，新→旧）。
 * @param hooks - 进度钩子（可选）。
 * @param storeFile - sidecar 文件路径（测试注入；缺省用 dsh home 下的固定位置）。
 * @returns session id → 梗概（成功生成/缓存/「新对话」项；生成失败项不在其中）。
 */
export async function ensureSessionBriefs(
  ctx: Context,
  rows: readonly SessionSummary[],
  hooks: BriefGenerationHooks = {},
  storeFile: string = briefsFilePath(),
): Promise<Map<string, string>> {
  const store = await readBriefs(storeFile)
  const result = new Map<string, string>()
  for (const row of rows) {
    const cached = store[row.id]
    if (cached !== undefined) result.set(row.id, cached)
  }
  // 先为缺失项加载事件日志并分拣：有真人消息的进入生成队列；
  // 无任何聊天记录的直接标「新对话」——不调 API、不回显进度、也不落盘
  // （它是状态不是内容；落盘会让会话后续产生记录后仍读到过期的「新对话」）。
  const prepared: Array<{
    row: SessionSummary
    events: readonly SessionEvent[]
    turns: BriefTranscriptTurn[]
  }> = []
  const emptyIds: SessionId[] = []
  for (const row of rows) {
    if (store[row.id] !== undefined) continue
    const events = await loadHistory(ctx, row.id)
    const turns = extractBriefTranscript(events)
    if (turns.length > 0) prepared.push({ row, events, turns })
    else emptyIds.push(row.id)
  }
  for (const id of emptyIds) result.set(id, EMPTY_BRIEF)
  for (let i = 0; i < prepared.length; i++) {
    const entry = prepared[i]
    /* v8 ignore next -- push 后的下标恒有值；noUncheckedIndexedAccess 收窄防御 */
    if (entry === undefined) continue
    hooks.onPending?.(entry.row.id, i, prepared.length)
    try {
      const route = resolveBriefRoute(ctx, entry.events)
      const brief = await generateBrief(ctx, entry.row.id, route, entry.turns)
      // 逐会话读-改-写：中断/失败时已完成的会话仍保留。
      const fresh = await readBriefs(storeFile)
      fresh[entry.row.id] = brief
      await writeBriefs(storeFile, fresh)
      result.set(entry.row.id, brief)
    } catch (error) {
      hooks.onFailed?.(entry.row.id, error)
    }
  }
  return result
}
