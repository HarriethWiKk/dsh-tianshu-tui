/**
 * LspBridge — TUI 侧本地语言服务桥（展示层缓存 + 懒生命周期）。
 *
 * 职责：把「agent 触碰文件」翻译成一次异步诊断拉取，并把结果缓存为
 * 渲染层可同步读取的视图。与既有平台桥同构（clipboard-image / external-editor
 * 的本地进程交互先例）：不进会话事件、不发明事件类型、不注册任何 prompt/
 * 工具/上下文面——诊断是 TUI 私有展示状态，随 TuiApp dispose 全部销毁。
 *
 * 触发策略：
 * - 懒启动：首个匹配扩展名的文件才 spawn 对应语言 server（multi-manager 路由）；
 * - per-file in-flight 合并 + 5s 新鲜度冷却（高频工具步进不刷屏）；
 * - 扩展名无 server / server 未安装 → 一次标记 unsupported（渲染层回显 ⚠）；
 * - 拉取超时（timeoutMs，缺省 2000ms）静默返回空，下次 touch 重拉。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/lsp/lsp-bridge
 */

import { isAbsolute, resolve as resolvePath, relative as relativePath } from 'node:path'
import { createMultiLspManager, type MultiLspOptions } from './multi-manager.js'
import type { LspDiagnostic } from './manager.js'
import { serverForFile, defaultWhich, type LspServerDef, type WhichFn } from './server-registry.js'

/** 展示层诊断视图（LSP 0-based → 1-based 行列；file 为 cwd 相对路径）。 */
export interface LspDiagnosticView {
  /** cwd 相对路径（相对解析失败时原样绝对路径）。 */
  file: string
  /** 1-based 行号。 */
  line: number
  /** 1-based 列号。 */
  character: number
  /** LSP severity：1 Error / 2 Warning / 3 Info / 4 Hint。 */
  severity: 1 | 2 | 3 | 4
  message: string
}

export interface LspBridgeOptions extends MultiLspOptions {
  /** LSP server 的 rootUri 与相对路径基准（会话 cwd）。 */
  cwd: string
  /** 单次诊断拉取超时（毫秒）；缺省 2000。 */
  timeoutMs?: number
}

/** 同文件重拉冷却（毫秒）：高频工具步进不刷屏。 */
const FRESH_MS = 5_000

export interface LspBridge {
  /** 通知桥「agent 触碰了该文件」：异步拉诊断并入缓存；不阻塞调用方。 */
  touchFile(path: string): void
  /** 同步读缓存：该文件诊断（undefined = 无缓存/未拉取；[] = 已拉取无诊断）。 */
  diagnosticsFor(path: string): readonly LspDiagnosticView[] | undefined
  /** 全量诊断视图（/lsp 面板数据源；按文件遍历缓存折叠）。 */
  entries(): readonly LspDiagnosticView[]
  /** 该文件是否确定无诊断来源（扩展名不支持或 server 未安装）。 */
  unsupported(path: string): boolean
  /** 是否至少有一个语言 server 可用（面板空态区分「无诊断」与「未安装」）。 */
  isAvailable(): boolean
  /** 注册诊断缓存变化回调（TuiApp 触发 renderLive）。 */
  onUpdate(cb: () => void): void
  /** 销毁：kill 全部 server、清缓存与回调。 */
  dispose(): void
}

/** 绝对化路径（相对路径以 cwd 为基准）。 */
function absFromCwd(path: string, cwd: string): string {
  return isAbsolute(path) ? path : resolvePath(cwd, path)
}

/** cwd 相对展示路径（Windows 反斜杠归一；相对解析失败回退绝对路径）。 */
function relDisplay(path: string, cwd: string): string {
  const rel = relativePath(cwd, path)
  const out = rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : path
  return out.split('\\').join('/')
}

/** LSP 诊断 → 展示视图（行列 0-based → 1-based）。 */
function toView(diag: LspDiagnostic, file: string): LspDiagnosticView {
  return {
    file,
    line: diag.range.start.line + 1,
    character: diag.range.start.character + 1,
    severity: diag.severity,
    message: diag.message,
  }
}

export function createLspBridge(options: LspBridgeOptions): LspBridge {
  const cwd = options.cwd
  const timeoutMs = options.timeoutMs ?? 2_000
  const which: WhichFn = options.which ?? defaultWhich
  const manager = createMultiLspManager(cwd, {
    ...(options.which === undefined ? {} : { which: options.which }),
    ...(options.spawnFor === undefined ? {} : { spawnFor: options.spawnFor }),
  })
  /** 展示视图缓存：absPath → { diags, at }（含空数组：已拉取无诊断）。 */
  const cache = new Map<string, { diags: readonly LspDiagnosticView[]; at: number }>()
  /** in-flight 合并集。 */
  const inflight = new Set<string>()
  /** 确定无诊断来源的路径（扩展名不支持 / server 未安装）。 */
  const unsupportedPaths = new Set<string>()
  /** dispose 后所有操作失效（不再 spawn / 拉取）。 */
  let disposed = false
  let update: (() => void) | null = null

  const pull = (abs: string, display: string): void => {
    void (async () => {
      try {
        const diags = await manager.getFileDiagnostics(abs, timeoutMs)
        cache.set(abs, { diags: diags.map(d => toView(d, display)), at: Date.now() })
      } catch {
        // 拉取异常按无诊断处理（不缓存），下次 touch 重试。
      } finally {
        inflight.delete(abs)
        update?.()
      }
    })()
  }

  return {
    touchFile(path: string): void {
      if (disposed) return
      const abs = absFromCwd(path, cwd)
      if (inflight.has(abs)) return
      const cached = cache.get(abs)
      if (cached !== undefined && Date.now() - cached.at < FRESH_MS) return
      if (unsupportedPaths.has(abs)) return
      // 扩展名不支持 / server 未安装：一次标记，渲染层回显 ⚠。
      const def: LspServerDef | null = serverForFile(abs, which)
      if (def === null) {
        unsupportedPaths.add(abs)
        update?.()
        return
      }
      inflight.add(abs)
      pull(abs, relDisplay(abs, cwd))
    },
    diagnosticsFor(path: string): readonly LspDiagnosticView[] | undefined {
      return cache.get(absFromCwd(path, cwd))?.diags
    },
    entries(): readonly LspDiagnosticView[] {
      const out: LspDiagnosticView[] = []
      for (const { diags } of cache.values()) out.push(...diags)
      return out
    },
    unsupported(path: string): boolean {
      return unsupportedPaths.has(absFromCwd(path, cwd))
    },
    isAvailable(): boolean {
      return manager.isReady()
    },
    onUpdate(cb: () => void): void {
      update = cb
    },
    dispose(): void {
      disposed = true
      manager.dispose()
      cache.clear()
      unsupportedPaths.clear()
      inflight.clear()
      update = null
    },
  }
}
