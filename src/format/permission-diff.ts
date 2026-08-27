/**
 * 审批 diff 预览（C2 项 1）— 反 grok 之道：grok 审批 modal 不放 diff，
 * DSH 的痛点是盲批（信任断点），在 y/N 提示上方渲染内联 diff 建立信任。
 *
 * 数据通路：approval/request 携带 callId → transcript 查找 tool 调用 →
 * 原始参数 JSON → 此处解析 → 复用 renderFileDiff 渲染（与结算工具卡同一
 * FileDiff 渲染：所批即所见，审批预览与落底卡片同型）。
 *
 * 决策分层（阶段 2）新增 bash 类工具通路：命令行预览 + 危险模式标注
 * （只展示警示不拦截），以及「此命令前缀不再问」（p 键）的前缀提取
 * （command 首 token）。提取函数与渲染分离，供 app 侧注入 controller。
 */

import type { RivetTheme } from '../theme.js'
import type { TranscriptToolCall, TranscriptView } from '../adapter/transcript.js'
import type { PendingApprovalRequest } from '../controllers/approval-controller.js'
import { color } from '../engine/ansi.js'
import { truncateToDisplayWidth } from '../width.js'
import { fileDiffStats, renderFileDiff } from './tool-view-card.js'

/** 审批场景内容行硬上限（审批期间键锁只 y/N/Esc，diff 必须无翻页全可见）。 */
export const APPROVAL_DIFF_MAX_LINES = 12

/** write 预览最多显示的内容行数（新文件无 old，无 diff 可看）。 */
export const WRITE_PREVIEW_LINES = 4

/** formatPermissionDiff 的输入：待审批工具调用的名与原始参数。 */
export interface PermissionDiffInput {
  /** 工具名（transcript tool.name）。 */
  toolName: string
  /** 原始参数 JSON 字符串（transcript tool.arguments）。 */
  arguments: string
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

// ── bash 类工具：命令提取 / 前缀 / 危险模式（决策分层阶段 2） ──────────

/** bash 类工具名（command 参数为 shell 命令串；已核 dsh-tool-bash 实为 'bash'）。 */
const SHELL_TOOL_NAMES: ReadonlySet<string> = new Set(['bash'])

/** 是否 bash 类工具（p 键前缀与命令预览只对这类工具启用）。 */
export function isShellTool(toolName: string): boolean {
  return SHELL_TOOL_NAMES.has(toolName)
}

/**
 * 原始参数 JSON → command 字段（非 bash 类工具/解析失败/非串/空串 → null）。
 * @param toolName - 工具名（transcript tool.name）。
 * @param argumentsJson - 原始参数 JSON 字符串。
 */
export function extractShellCommand(toolName: string, argumentsJson: string): string | null {
  if (!isShellTool(toolName)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(argumentsJson)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const command = asString((parsed as Record<string, unknown>).command)
  if (command === null || command.trim() === '') return null
  return command
}

/** shell 命令 → 首 token 前缀（`npm test` → `npm`；`git status` → `git`；空串 → null）。 */
export function commandPrefixOf(command: string): string | null {
  const first = command.trim().split(/\s+/)[0]
  return first === undefined || first === '' ? null : first
}

/**
 * 审批请求 → transcript 里的工具调用（callId 关联；无 callId/找不到 → undefined）。
 * @param req - 待决审批请求。
 * @param view - 当前会话 transcript 投影（未 attach 时 undefined）。
 */
export function findApprovalToolCall(
  req: PendingApprovalRequest,
  view: TranscriptView | undefined,
): TranscriptToolCall | undefined {
  const callId = req.callId
  if (callId === undefined) return undefined
  return view?.tools.findLast(t => t.callId === callId)
}

/**
 * 审批请求 → 命令前缀（controller 短路/p 键守卫注入用）：callId 查 transcript →
 * command 首 token；非 bash 类/查不到/解析失败 → null。
 */
export function commandPrefixForRequest(
  req: PendingApprovalRequest,
  view: TranscriptView | undefined,
): string | null {
  const toolCall = findApprovalToolCall(req, view)
  if (toolCall === undefined) return null
  const command = extractShellCommand(toolCall.name, toolCall.arguments)
  return command === null ? null : commandPrefixOf(command)
}

/** 危险命令模式（审批卡标注用——只展示警示，不拦截）。 */
const DANGER_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /\brm\s+(?:-\w+\s+)*-\w*[rR]\w*/, label: 'rm 递归删除' },
  { pattern: /\b(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/, label: '远程脚本管道执行' },
  { pattern: /\(\s*\)\s*\{\s*:\|:&\s*\}/, label: 'fork 炸弹' },
  { pattern: /\bmkfs(?:\.\w+)?\b/, label: '文件系统格式化' },
  { pattern: /\bdd\b[^|&;]*\bof=\/dev\//, label: 'dd 覆写块设备' },
]

/**
 * 标注命令中的危险模式（命中标签数组，无命中空数组）。展示层警示，不改变审批语义。
 * @param command - shell 命令串。
 */
export function detectDangerPatterns(command: string): string[] {
  return DANGER_PATTERNS.filter(d => d.pattern.test(command)).map(d => d.label)
}

/** bash 类预览：`$ 命令首行` + 危险模式标注行（有多行命令时省略微标）。 */
function formatCommandPreview(command: string, theme: RivetTheme): string[] {
  const trimmed = command.trim()
  const firstLine = trimmed.split('\n')[0] ?? ''
  const more = trimmed.includes('\n') ? ' …' : ''
  const lines = [color(`$ ${truncateToDisplayWidth(firstLine, 72)}${more}`, theme.warning)]
  const dangers = detectDangerPatterns(command)
  if (dangers.length > 0) {
    lines.push(color(`⚠ 危险模式：${dangers.join(' · ')}`, theme.error))
  }
  return lines
}

/**
 * 从编辑类工具参数提取 old/new 文本对。
 * str_replace_editor 的 str_replace 用 old_str/new_str；edit_file 用
 * old_string/new_string（宿主侧工具，兼容提取）。
 */
function extractReplacePair(
  args: Record<string, unknown>,
): { path: string | null; oldText: string | null; newText: string | null } {
  return {
    path: asString(args.path),
    oldText: asString(args.old_str) ?? asString(args.old_string),
    newText: asString(args.new_str) ?? asString(args.new_string),
  }
}

/** write 类预览：path + 前 N 行内容（create/write_file）。 */
function formatWritePreview(
  path: string,
  content: string,
  theme: RivetTheme,
): string[] {
  const head = content.split('\n').slice(0, WRITE_PREVIEW_LINES)
  const lines = [`${path} 新文件内容预览:`]
  for (const line of head) lines.push(`  ${line}`)
  if (content.split('\n').length > WRITE_PREVIEW_LINES) {
    // muted 缺失是真实边界（spec 显式构造缺 muted 的 theme 验证省略号分支）
    const muted = theme.muted as string | undefined
    lines.push(muted === undefined ? '  …' : `  …（共 ${content.split('\n').length} 行）`)
  }
  return lines
}

/** old/new 替换对 → 路径统计头 + renderFileDiff 行（结算卡同一渲染）。 */
function formatReplaceDiff(
  path: string,
  oldText: string,
  newText: string,
  theme: RivetTheme,
): string[] {
  const diff = { path, oldText, newText }
  const { adds, dels } = fileDiffStats([diff])
  return [
    color(`${path} (+${adds} −${dels})`, theme.warning),
    ...renderFileDiff(diff, { maxLines: APPROVAL_DIFF_MAX_LINES }, theme),
  ]
}

/**
 * 格式化审批 diff 为 ANSI 行数组；非编辑/非 bash 类工具或参数不可解析返回 null。
 * - str_replace_editor str_replace / edit_file：old/new → renderFileDiff
 *   （±3 context，与结算工具卡共用渲染——所批即所见）
 * - str_replace_editor create / write_file：path + 前 4 行预览（无 old）
 * - bash 类工具：`$ 命令首行` 预览 + 危险模式标注（只展示警示不拦截）
 * - 其他工具：null（无替换/命令语义不渲染）
 * @param input - 待审批工具调用的名与原始参数 JSON。
 * @param theme - 当前主题（diff 染色透传 renderFileDiff）。
 * @returns diff/预览的 ANSI 行数组；不可渲染时 null（调用方不占位）。
 */
export function formatPermissionDiff(
  input: PermissionDiffInput,
  theme: RivetTheme,
): string[] | null {
  // bash 类工具先行：命令预览无 diff 语义，不走通用 JSON 解析分支。
  if (isShellTool(input.toolName)) {
    const command = extractShellCommand(input.toolName, input.arguments)
    return command === null ? null : formatCommandPreview(command, theme)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(input.arguments)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const args = parsed as Record<string, unknown>

  if (input.toolName === 'str_replace_editor') {
    if (args.command === 'str_replace') {
      const { path, oldText, newText } = extractReplacePair(args)
      if (path === null || oldText === null || newText === null) {
        return null
      }
      if (oldText === newText) return null
      return formatReplaceDiff(path, oldText, newText, theme)
    }
    if (args.command === 'create') {
      const path = asString(args.path)
      const content = asString(args.file_text)
      if (path === null || content === null) return null
      return formatWritePreview(path, content, theme)
    }
    return null
  }

  if (input.toolName === 'write_file') {
    const path = asString(args.path)
    const content = asString(args.content) ?? asString(args.file_text)
    if (path === null || content === null) return null
    return formatWritePreview(path, content, theme)
  }

  if (input.toolName === 'edit_file') {
    const { path, oldText, newText } = extractReplacePair(args)
    if (path === null || oldText === null || newText === null) return null
    if (oldText === newText) return null
    return formatReplaceDiff(path, oldText, newText, theme)
  }

  return null
}
