/**
 * @huiliyi37/dsh-tui-lsp — LSP 模型工具面插件（dsh harness 伴生包）。
 *
 * 提供：
 * - `ctx.tools.register` 三个只读工具：lsp_goto_definition /
 *   lsp_find_references / lsp_diagnostics（模型可用）；
 * - `ctx.provide('lsp')` 服务：多语言 LSP 客户端（懒 spawn）——TUI 展示桥
 *   探测到该服务时消费它（single server set，不双份 spawn；未装配本插件时
 *   TUI 回落内置桥）。
 *
 * LSP 客户端移植自天枢 Tianshu src/lsp/（Apache-2.0；SOURCE-MAP 登记）。
 * 工具执行无任何写副作用；服务生命周期随插件 ctx（卸载时 kill 全部 server）。
 *
 * @module @huiliyi37/dsh-tui-lsp
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createLspService } from './service.ts'
import {
  createDiagnosticsTool,
  createFindReferencesTool,
  createGotoDefinitionTool,
} from './tools.ts'

/** Stable Cordis plugin name（装配进 tui profile 的 cordis.patch.yml）。 */
export const name = 'tui-lsp'

/** tools 服务用于注册模型工具面。 */
export const inject = ['tools']

/** 插件配置（schemastery 校验后的已解析形状）。 */
export interface Config {
  /** 主开关；false 时不注册工具也不 provide 服务（缺省 true）。 */
  enabled: boolean
  /** 单次诊断/定位调用超时（毫秒；缺省 2000）。 */
  timeoutMs: number
  /** LSP server rootUri 基准（缺省 process.cwd()）。 */
  cwd: string
}

/** Schemastery 校验/默认值落定（vision-ask 同款模式）。 */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  timeoutMs: z.number().step(1).min(1).default(2000),
  cwd: z.string(),
})

/**
 * 挂载插件：provide('lsp') 服务 + 注册三个模型工具。
 * @param ctx - 插件上下文（tools 服务必选注入）。
 * @param config - schemastery 校验后的已解析配置。
 */
export function apply(ctx: Context, config: Config): void {
  if (!config.enabled) return
  const timeoutMs = config.timeoutMs
  const cwd = config.cwd ?? process.cwd()
  const service = createLspService({ cwd, timeoutMs })
  // 服务注册随插件 ctx 生命周期：卸载时 dispose（kill 全部 LSP server）。
  // 使用方（TUI 桥 / 工具）在服务存活期间持有引用；服务体在 dispose 后
  // 所有调用安全返回空（multi-manager 幂等）。
  ctx.provide('lsp', service)
  ctx.tools.register(createGotoDefinitionTool(service))
  ctx.tools.register(createFindReferencesTool(service))
  ctx.tools.register(createDiagnosticsTool(service))
  // 插件卸载（effect cleanup）：LSP 进程随服务 dispose 回收。
  ctx.effect(() => () => {
    service.dispose()
  })
}
