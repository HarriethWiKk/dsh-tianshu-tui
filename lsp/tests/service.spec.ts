/**
 * LspService 集成测试——假 LSP server（PassThrough 流）注入，不真 spawn。
 * 覆盖：诊断拉取 / goto-definition / find-references / 生命周期。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import { createLspService, type LspService } from '../src/service.js'
import { decodeMessages, encodeMessage } from '../src/rpc.js'
import type { LspDiagnostic } from '../src/manager.js'

/** 假 LSP server：按方法分派响应（definition/references/diagnostic）。 */
class FakeLspServer {
  readonly proc = {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    on: vi.fn(),
    kill: vi.fn(),
  } as unknown as ChildProcess
  diagnosticItems: LspDiagnostic[] = []
  definitionResults: Array<{ uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }> = []
  referenceResults: typeof this.definitionResults = []
  private readonly log: string[] = []

  constructor() {
    const stdin = this.proc.stdin as unknown as PassThrough
    const stdout = this.proc.stdout as unknown as PassThrough
    stdin.on('data', (chunk: Buffer) => {
      const { messages } = decodeMessages(chunk)
      for (const msg of messages) {
        if (!('id' in msg) || 'result' in msg || 'error' in msg) continue
        const req = msg as { id: number; method: string }
        this.log.push(req.method)
        if (req.method === 'initialize') {
          stdout.write(encodeMessage({ jsonrpc: '2.0', id: req.id, result: { capabilities: { diagnosticProvider: {}, definitionProvider: true, referencesProvider: true } } }))
        } else if (req.method === 'textDocument/diagnostic') {
          stdout.write(encodeMessage({ jsonrpc: '2.0', id: req.id, result: { items: this.diagnosticItems } }))
        } else if (req.method === 'textDocument/definition') {
          stdout.write(encodeMessage({ jsonrpc: '2.0', id: req.id, result: this.definitionResults }))
        } else if (req.method === 'textDocument/references') {
          stdout.write(encodeMessage({ jsonrpc: '2.0', id: req.id, result: this.referenceResults }))
        } else {
          stdout.write(encodeMessage({ jsonrpc: '2.0', id: req.id, result: null }))
        }
      }
    })
  }

  requestLog(): string[] {
    return [...this.log]
  }
}

function tsError(message: string, line = 2): LspDiagnostic {
  return {
    range: { start: { line: line - 1, character: 3 }, end: { line: line - 1, character: 9 } },
    severity: 1,
    message,
  }
}

function loc(uri: string, line: number): { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } } {
  return { uri, range: { start: { line: line - 1, character: 0 }, end: { line: line - 1, character: 4 } } }
}

describe('LspService', () => {
  const cwd = '/work'
  let server: FakeLspServer
  let service: LspService

  beforeEach(() => {
    server = new FakeLspServer()
    service = createLspService({ cwd, timeoutMs: 200, spawnFor: () => server.proc })
  })

  afterEach(() => {
    service.dispose()
  })

  it('getDiagnostics 拉取文件诊断（懒 spawn 单个 server）', async () => {
    server.diagnosticItems = [tsError('类型不匹配'), tsError('未使用', 9)]
    const diags = await service.getDiagnostics('src/a.ts')
    expect(diags).toHaveLength(2)
    expect(diags[0]).toMatchObject({ severity: 1, message: '类型不匹配' })
    expect(server.requestLog()).toContain('textDocument/diagnostic')
  })

  it('gotoDefinition 返回相对路径位置', async () => {
    server.definitionResults = [loc('/work/src/defs.ts', 42)]
    const locations = await service.gotoDefinition('src/a.ts', 3, 0)
    expect(locations).toEqual([{ uri: 'src/defs.ts', range: { start: { line: 41, character: 0 }, end: { line: 41, character: 4 } } }])
  })

  it('findReferences 返回引用位置', async () => {
    server.referenceResults = [loc('/work/src/use.ts', 7), loc('/work/src/a.ts', 12)]
    const locations = await service.findReferences('src/a.ts', 3, 0)
    expect(locations.map(l => l.uri)).toEqual(['src/use.ts', 'src/a.ts'])
  })

  it('isAvailable：typescript 经 npx 恒可探测（懒启动前即为 true）', () => {
    expect(service.isAvailable()).toBe(true)
  })

  it('dispose kill 已 spawn 的 server；之后调用安全返回空', async () => {
    // 先触发 spawn（懒启动），再 dispose → kill 生效
    await service.getDiagnostics('src/a.ts')
    service.dispose()
    expect(server.proc.kill).toHaveBeenCalled()
    await expect(service.getDiagnostics('src/a.ts')).resolves.toEqual([])
    await expect(service.gotoDefinition('src/a.ts', 1, 0)).resolves.toEqual([])
  })

  it('未 spawn 过的 dispose 是安全 no-op（无进程可 kill）', () => {
    service.dispose()
    expect(server.proc.kill).not.toHaveBeenCalled()
  })

  it('未知扩展名返回空诊断（不 spawn）', async () => {
    const diags = await service.getDiagnostics('notes.xyz')
    expect(diags).toEqual([])
    expect(server.proc.kill).not.toHaveBeenCalled()
  })
})
