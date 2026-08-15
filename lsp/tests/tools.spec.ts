/**
 * LSP 模型工具面测试——三个工具的 execute / 参数校验 / presentCall。
 * 服务用假实现（不 spawn）。
 */

import { describe, expect, it, vi } from 'vitest'
import type { LspDiagnostic } from '../src/manager.js'
import type { LspService } from '../src/service.js'
import {
  createDiagnosticsTool,
  createFindReferencesTool,
  createGotoDefinitionTool,
} from '../src/tools.js'

/** 假服务：可编程结果。 */
function fakeService(overrides: Partial<LspService> = {}): LspService {
  return {
    getDiagnostics: vi.fn(async () => [] as LspDiagnostic[]),
    gotoDefinition: vi.fn(async () => []),
    findReferences: vi.fn(async () => []),
    changeFile: vi.fn(),
    isAvailable: vi.fn(() => true),
    dispose: vi.fn(),
    ...overrides,
  }
}

describe('lsp_goto_definition', () => {
  it('execute 返回格式化位置（1-based 行）', async () => {
    const service = fakeService({
      gotoDefinition: vi.fn(async () => [
        { uri: 'src/defs.ts', range: { start: { line: 41, character: 0 }, end: { line: 41, character: 4 } } },
      ]),
    })
    const tool = createGotoDefinitionTool(service)
    const result = await tool.execute({ file_path: 'src/a.ts', line: 3, column: 0 }, {} as never)
    expect(result).toEqual({ locations: ['src/defs.ts:42:0'] })
    expect(service.gotoDefinition).toHaveBeenCalledWith('src/a.ts', 3, 0)
  })

  it('未找到定义 → 空 locations', async () => {
    const tool = createGotoDefinitionTool(fakeService())
    const result = await tool.execute({ file_path: 'src/a.ts', line: 1, column: 0 }, {} as never)
    expect(result).toEqual({ locations: [] })
  })

  it('参数非法 → 抛错（line < 1）', async () => {
    const tool = createGotoDefinitionTool(fakeService())
    await expect(tool.execute({ file_path: 'src/a.ts', line: 0, column: 0 }, {} as never)).rejects.toThrow('line')
  })

  it('presentCall 提供 generic 卡片标题', () => {
    const tool = createGotoDefinitionTool(fakeService())
    const call = tool.presentCall?.({ file_path: 'src/a.ts', line: 1, column: 0 })
    expect(call).toMatchObject({ card: 'generic', title: 'LSP goto-definition', rawInput: 'src/a.ts' })
  })
})

describe('lsp_find_references', () => {
  it('execute 返回全部引用位置', async () => {
    const service = fakeService({
      findReferences: vi.fn(async () => [
        { uri: 'src/use.ts', range: { start: { line: 6, character: 2 }, end: { line: 6, character: 6 } } },
        { uri: 'src/a.ts', range: { start: { line: 11, character: 0 }, end: { line: 11, character: 4 } } },
      ]),
    })
    const tool = createFindReferencesTool(service)
    const result = await tool.execute({ file_path: 'src/a.ts', line: 3, column: 0 }, {} as never)
    expect(result).toEqual({ locations: ['src/use.ts:7:2', 'src/a.ts:12:0'] })
  })

  it('presentCall 标题', () => {
    const tool = createFindReferencesTool(fakeService())
    expect(tool.presentCall?.({ file_path: 'x.ts', line: 1, column: 0 })).toMatchObject({ title: 'LSP references' })
  })
})

describe('lsp_diagnostics', () => {
  it('execute 返回 severity 文本 + 1-based 行列', async () => {
    const service = fakeService({
      getDiagnostics: vi.fn(async () => [
        { range: { start: { line: 1, character: 3 }, end: { line: 1, character: 9 } }, severity: 1 as const, message: '类型不匹配' },
        { range: { start: { line: 8, character: 0 }, end: { line: 8, character: 5 } }, severity: 2 as const, message: '未使用变量' },
      ]),
    })
    const tool = createDiagnosticsTool(service)
    const result = await tool.execute({ file_path: 'src/a.ts' }, {} as never)
    expect(result).toEqual({
      diagnostics: [
        { severity: 'error', line: 2, column: 3, message: '类型不匹配' },
        { severity: 'warning', line: 9, column: 0, message: '未使用变量' },
      ],
    })
  })

  it('无诊断 → 空数组', async () => {
    const tool = createDiagnosticsTool(fakeService())
    const result = await tool.execute({ file_path: 'src/clean.ts' }, {} as never)
    expect(result).toEqual({ diagnostics: [] })
  })

  it('缺 file_path → 抛错', async () => {
    const tool = createDiagnosticsTool(fakeService())
    await expect(tool.execute({}, {} as never)).rejects.toThrow('file_path')
  })

  it('presentCall 标题', () => {
    const tool = createDiagnosticsTool(fakeService())
    expect(tool.presentCall?.({ file_path: 'x.ts' })).toMatchObject({ title: 'LSP diagnostics' })
  })
})
