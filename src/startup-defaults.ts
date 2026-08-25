/**
 * startup-defaults — 会话应用 vs 启动默认的纯函数面。
 *
 * 选择器 Enter / 带参命令 = 仅本会话；选择器 S / 末尾 default = 写启动默认。
 * 回显必须点名「本会话」或「启动默认」，避免用户分不清。
 *
 * @module @huiliyi37/dsh-tianshu-tui/startup-defaults
 */

/** 启动项种类（回显与 /xxx default 提示共用）。 */
export type StartupKind = 'theme' | 'model' | 'effort' | 'density' | 'preset'

/** 剥末尾 default 标志：`/theme paper default` → rest=paper persist=true。 */
export function splitDefaultFlag(text: string): { rest: string; persist: boolean } {
  const trimmed = text.trim()
  if (trimmed === '') return { rest: '', persist: false }
  if (trimmed === 'default') return { rest: '', persist: true }
  if (trimmed.endsWith(' default')) {
    return { rest: trimmed.slice(0, -' default'.length).trim(), persist: true }
  }
  return { rest: trimmed, persist: false }
}

const SESSION_HINT: Record<StartupKind, string> = {
  theme: '/theme default',
  model: '/model default',
  effort: '/effort default',
  density: '/density default',
  preset: '/preset default',
}

const SESSION_VERB: Record<StartupKind, (value: string) => string> = {
  theme: value => `主题已切换: ${value}`,
  model: value => `模型已切换: ${value}`,
  effort: value => `推理等级已设为 ${value}`,
  density: value => `已切换为${value}`,
  preset: value => `已切换为 ${value}`,
}

const DEFAULT_LABEL: Record<StartupKind, string> = {
  theme: '主题',
  model: '模型',
  effort: '推理等级',
  density: '密度',
  preset: '预设',
}

/** 仅本会话回显：点名本会话 + 如何写默认。 */
export function echoSessionOnly(kind: StartupKind, value: string): string {
  const hint = kind === 'density' || kind === 'preset'
    ? SESSION_HINT[kind]
    : `选择器按 S 或 ${SESSION_HINT[kind]}`
  return `${SESSION_VERB[kind](value)}（仅本会话）。${hint} 可设为启动默认`
}

/** /effort 选择：auto 清除 reasoningEffort。 */
export function effortSelection(
  base: { provider: string; model: string },
  level: string,
): { provider: string; model: string; reasoningEffort?: string } {
  return level === 'auto'
    ? { provider: base.provider, model: base.model }
    : { provider: base.provider, model: base.model, reasoningEffort: level }
}

/** 写启动默认回显：主题说重启，其余说新会话。 */
export function echoSavedDefault(kind: StartupKind, value: string): string {
  const when = kind === 'theme' || kind === 'density' ? '重启后仍生效' : '新会话起始生效'
  return `已设为默认${DEFAULT_LABEL[kind]}：${value}（${when}）`
}

/** newSession / /preset 共用的最小 preset 面（不引入 dsh-agent-presets）。 */
export interface PrefPresetFacet {
  recompose(agentCtx: unknown, id: string): Promise<{ id: string; name?: string }>
}

/** applyPrefPreset 入参。 */
export interface ApplyPrefPresetInput {
  presetId: string | undefined
  isBlank: boolean
  agent: { ctx: unknown; session: { append(type: string, data: { agentPreset: string }): void } } | null
  facet: PrefPresetFacet | undefined | null
}

/** applyPrefPreset 结果：失败不抛，调用方 echo 警告即可。 */
export interface ApplyPrefPresetResult {
  applied: boolean
  id?: string
  name?: string
  error?: string
}

/**
 * 空白会话上应用 prefs.preset：recompose + 落 agent-preset/selected。
 * 无 id / 无插件 / 非空白 / 无 agent → 静默跳过。
 */
export async function applyPrefPreset(input: ApplyPrefPresetInput): Promise<ApplyPrefPresetResult> {
  const { presetId, isBlank, agent, facet } = input
  if (presetId === undefined || presetId === '' || !isBlank || agent === null || facet == null) {
    return { applied: false }
  }
  try {
    const preset = await facet.recompose(agent.ctx, presetId)
    agent.session.append('agent-preset/selected', { agentPreset: preset.id })
    return { applied: true, id: preset.id, ...(preset.name === undefined ? {} : { name: preset.name }) }
  } catch (error) {
    return { applied: false, error: error instanceof Error ? error.message : String(error) }
  }
}
