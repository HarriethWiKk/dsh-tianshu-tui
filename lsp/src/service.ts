/**
 * LspService — provide('lsp') 服务体：多语言 LSP 客户端（懒 spawn）封装。
 *
 * 供模型工具面（lsp_goto_definition / lsp_find_references / lsp_diagnostics）
 * 与 TUI 展示桥（LspBridge 的 external source）共用同一 LSP server 集——
 * 装配本插件时整个进程只有一份 LSP 进程，不双份 spawn。
 *
 * 生命周期：随插件 ctx（provide 返回 disposer；插件卸载时 dispose 杀全部
 * server）。cwd 为装配目录（rootUri 与相对路径基准）。
 *
 * @module @huiliyi37/dsh-tui-lsp/service
 */

import { createMultiLspManager, type MultiLspOptions } from './multi-manager.js'
import type { LspDiagnostic } from './manager.js'

/** goto-definition / find-references 返回的位置（uri 为 cwd 相对路径）。 */
export interface LspLocation {
  uri: string
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
}

/** LspService 的最小读面（TUI 侧结构类型适配，不跨包依赖）。 */
export interface LspService {
  /** 拉取单文件诊断（pull 优先 + publishDiagnostics 缓存兜底；超时返回空）。 */
  getDiagnostics(filePath: string, timeoutMs?: number): Promise<LspDiagnostic[]>
  /** 符号定义位置（LSP 0-based 行列入参）。 */
  gotoDefinition(filePath: string, line: number, character: number): Promise<LspLocation[]>
  /** 符号引用位置（LSP 0-based 行列入参）。 */
  findReferences(filePath: string, line: number, character: number): Promise<LspLocation[]>
  /** 文件磁盘变更通知（server 内部状态同步；未打开的文件忽略）。 */
  changeFile(filePath: string): void
  /** 是否至少一个语言 server 可用（typescript 经 npx 恒可探测）。 */
  isAvailable(): boolean
  /** 销毁：kill 全部 server（幂等）。 */
  dispose(): void
}

export interface LspServiceOptions extends MultiLspOptions {
  /** LSP server 的 rootUri 与相对路径基准。 */
  cwd: string
  /** 单次诊断/定位调用超时（毫秒）；缺省 2000。 */
  timeoutMs?: number
}

export function createLspService(options: LspServiceOptions): LspService {
  const manager = createMultiLspManager(options.cwd, {
    ...(options.which === undefined ? {} : { which: options.which }),
    ...(options.spawnFor === undefined ? {} : { spawnFor: options.spawnFor }),
  })
  const defaultTimeoutMs = options.timeoutMs ?? 2_000
  return {
    getDiagnostics(filePath, timeoutMs) {
      return manager.getFileDiagnostics(filePath, timeoutMs ?? defaultTimeoutMs)
    },
    gotoDefinition(filePath, line, character) {
      return manager.gotoDefinition(filePath, line, character)
    },
    findReferences(filePath, line, character) {
      return manager.findReferences(filePath, line, character)
    },
    changeFile(filePath) {
      manager.changeFile(filePath)
    },
    isAvailable() {
      return manager.isReady()
    },
    dispose() {
      manager.dispose()
    },
  }
}
