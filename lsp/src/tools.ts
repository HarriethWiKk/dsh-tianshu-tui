/**
 * LSP 模型工具面——三个只读工具（defineTool 注册于 ctx.tools）：
 * lsp_goto_definition / lsp_find_references / lsp_diagnostics。
 *
 * 全部经 LspService 走同一 LSP server 集（懒 spawn、2s 默认超时静默）。
 * presentCall 提供 generic 卡片标题（TUI 工具卡经 resolveToolViews 自动消费，
 * 无需 TUI 侧接线）。execute 参数严格校验（defineTool 的 schema 校验 +
 * 显式前置检查）。
 *
 * @module @huiliyi37/dsh-tui-lsp/tools
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { LspService } from './service.js'

/** 工具参数解析：file_path/line/column；非法返回错误消息（execute 抛错前哨）。 */
type Params = { filePath: string; line: number; column: number }

function resolvePositionParams(input: Record<string, unknown>): Params | string {
  const filePath = input.file_path
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    return 'Missing required parameter: file_path'
  }
  const line = input.line
  if (typeof line !== 'number' || line < 1) {
    return 'Missing or invalid parameter: line (must be >= 1)'
  }
  const column = input.column
  if (typeof column !== 'number' || column < 0) {
    return 'Missing or invalid parameter: column (must be >= 0)'
  }
  return { filePath: filePath.trim(), line, column }
}

/** 位置列表 → 文本行（`path:line:col`；LSP 0-based 行 → 1-based 显示）。 */
function formatLocations(locations: readonly { uri: string; range: { start: { line: number; character: number } } }[]): string {
  return locations
    .map(loc => `${loc.uri}:${loc.range.start.line + 1}:${loc.range.start.character}`)
    .join('\n')
}

/** severity 数字 → 文本（诊断工具输出可读性）。 */
function severityText(severity: 1 | 2 | 3 | 4): string {
  switch (severity) {
    case 1: return 'error'
    case 2: return 'warning'
    case 3: return 'info'
    default: return 'hint'
  }
}

export function createGotoDefinitionTool(service: LspService) {
  return defineTool({
    name: 'lsp_goto_definition',
    description: '跳转到给定文件位置符号的定义。返回定义的文件路径、行号和列号。用于理解函数、类、变量或类型的定义位置。',
    parameters: {
      file_path: { type: 'string', required: true, description: '包含该符号的源文件路径（相对 cwd 或绝对路径）' },
      line: { type: 'number', required: true, description: '符号所在行号（从 1 开始）' },
      column: { type: 'number', required: true, description: '符号所在列号（从 0 开始）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          locations: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value: { locations: string[] }) => {
        const body = value.locations.length === 0
          ? '未找到定义'
          : value.locations.join('\n')
        return [{ type: 'text', text: body }]
      },
    },
    async execute(args) {
      const resolved = resolvePositionParams(args as Record<string, unknown>)
      if (typeof resolved === 'string') throw new Error(resolved)
      const locations = await service.gotoDefinition(resolved.filePath, resolved.line, resolved.column)
      return { locations: formatLocations(locations).split('\n').filter(Boolean) }
    },
    presentCall: (args: { file_path?: unknown }) => ({
      card: 'generic',
      title: 'LSP goto-definition',
      kind: 'other',
      ...(typeof args.file_path === 'string' ? { rawInput: args.file_path } : {}),
    }),
    isConcurrencySafe: () => true,
  })
}

export function createFindReferencesTool(service: LspService) {
  return defineTool({
    name: 'lsp_find_references',
    description: '查找给定文件位置符号的全部引用位置。返回引用文件路径、行号和列号。用于评估改动影响面。',
    parameters: {
      file_path: { type: 'string', required: true, description: '包含该符号的源文件路径（相对 cwd 或绝对路径）' },
      line: { type: 'number', required: true, description: '符号所在行号（从 1 开始）' },
      column: { type: 'number', required: true, description: '符号所在列号（从 0 开始）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          locations: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value: { locations: string[] }) => {
        const body = value.locations.length === 0
          ? '未找到引用'
          : value.locations.join('\n')
        return [{ type: 'text', text: body }]
      },
    },
    async execute(args) {
      const resolved = resolvePositionParams(args as Record<string, unknown>)
      if (typeof resolved === 'string') throw new Error(resolved)
      const locations = await service.findReferences(resolved.filePath, resolved.line, resolved.column)
      return { locations: formatLocations(locations).split('\n').filter(Boolean) }
    },
    presentCall: (args: { file_path?: unknown }) => ({
      card: 'generic',
      title: 'LSP references',
      kind: 'other',
      ...(typeof args.file_path === 'string' ? { rawInput: args.file_path } : {}),
    }),
    isConcurrencySafe: () => true,
  })
}

export function createDiagnosticsTool(service: LspService) {
  return defineTool({
    name: 'lsp_diagnostics',
    description: '获取单个文件的 LSP 诊断（错误/警告/提示，含行列范围与消息）。用于编辑后自查、定位编译错误。',
    parameters: {
      file_path: { type: 'string', required: true, description: '源文件路径（相对 cwd 或绝对路径）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          diagnostics: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                severity: { type: 'string', required: true },
                line: { type: 'number', required: true },
                column: { type: 'number', required: true },
                message: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value: { diagnostics: Array<{ severity: string; line: number; column: number; message: string }> }) => {
        const body = value.diagnostics.length === 0
          ? '无诊断'
          : value.diagnostics
            .map(d => `${d.severity} ${d.line}:${d.column} ${d.message}`)
            .join('\n')
        return [{ type: 'text', text: body }]
      },
    },
    async execute(args) {
      const filePath = args as { file_path?: unknown }
      if (typeof filePath.file_path !== 'string' || filePath.file_path.trim() === '') {
        throw new Error('Missing required parameter: file_path')
      }
      const diags = await service.getDiagnostics(filePath.file_path.trim())
      return {
        diagnostics: diags.map(d => ({
          severity: severityText(d.severity),
          line: d.range.start.line + 1,
          column: d.range.start.character,
          message: d.message,
        })),
      }
    },
    presentCall: (args: { file_path?: unknown }) => ({
      card: 'generic',
      title: 'LSP diagnostics',
      kind: 'other',
      ...(typeof args.file_path === 'string' ? { rawInput: args.file_path } : {}),
    }),
    isConcurrencySafe: () => true,
  })
}
