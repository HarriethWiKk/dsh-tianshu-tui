/**
 * preset-join — 在 agents.create / resume 的 setup 里加入官方预设面。
 *
 * 不 import dsh-agent-presets：经 reflect.get 读花名册。无服务则跳过
 * （单测 / 未装配宿主）。生产 bundle 会挂上 agent-presets。
 *
 * @module @huiliyi37/dsh-tianshu-tui/adapter/preset-join
 */

/** 官方 agentPresets 花名册的最小 join 面。 */
export interface PresetJoinFacet {
  mount(agentCtx: unknown, id?: string): Promise<{ id: string; name?: string }>
  composeFrom?(agentCtx: unknown, parentCtx: unknown): string | undefined
}

/** 铸 agent 的 join 模式。 */
export type PresetJoinMode = 'create' | 'resume' | 'child'

/** joinPreset 入参。 */
export interface JoinPresetInput {
  facet: PresetJoinFacet | undefined | null
  agentCtx: unknown
  mode: PresetJoinMode
  /** create = prefs；resume = resolvePresetId；空串当缺省。 */
  preferredId?: string
  /** child 的父 agent.ctx。 */
  parentCtx?: unknown
}

/** joinPreset 结果。 */
export interface JoinPresetResult {
  skipped: boolean
  id?: string
}

/** 从 host ctx 取花名册；无 mount 视为未装配。 */
export function presetJoinFacet(ctx: {
  reflect?: { get(name: string, required?: boolean): unknown }
}): PresetJoinFacet | undefined {
  const raw = ctx.reflect?.get('agentPresets', false)
  if (raw == null || typeof raw !== 'object') return undefined
  const facet = raw as Partial<PresetJoinFacet>
  if (typeof facet.mount !== 'function') return undefined
  return facet as PresetJoinFacet
}

/** create/resume 未指定预设时的缺省 id（#48：与 bundle patch 的 config.default 对齐；旧装配/旧 host 忽略该键时由插件侧兜底）。 */
export const DEFAULT_PRESET_ID = 'standard'

function mountId(preferredId: string | undefined, mode: PresetJoinMode): string | undefined {
  if (preferredId !== undefined && preferredId !== '') return preferredId
  // create/resume 缺省 standard（#48：更新后新会话/旧会话恢复不得落入无工具面
  // agent）；child 保持 undefined——继承语义由 composeFrom/宿主决定。
  return mode === 'child' ? undefined : DEFAULT_PRESET_ID
}

/**
 * 按模式加入预设面。无花名册 skipped。
 * create/resume：mount（未指定 id 时缺省 {@link DEFAULT_PRESET_ID}）。
 * child：先 composeFrom，父未 join 再 mount。
 */
export async function joinPreset(input: JoinPresetInput): Promise<JoinPresetResult> {
  const { facet, agentCtx, mode } = input
  if (facet == null) return { skipped: true }
  if (mode === 'child' && input.parentCtx !== undefined && typeof facet.composeFrom === 'function') {
    const inherited = facet.composeFrom(agentCtx, input.parentCtx)
    if (inherited !== undefined && inherited !== '') return { skipped: false, id: inherited }
  }
  const preset = await facet.mount(agentCtx, mountId(input.preferredId, mode))
  return { skipped: false, id: preset.id }
}

/** newSession setup：mount prefs/default；失败回 warn，不阻断铸造。 */
export async function joinCreateOrWarn(
  ctx: { reflect?: { get(name: string, required?: boolean): unknown } },
  agentCtx: unknown,
  preferredId: string | undefined,
  warn: (msg: string) => void,
): Promise<string | undefined> {
  const facet = presetJoinFacet(ctx)
  // #48 fails-loud（2026-08-27）：facet 缺失（profile 装配过期、agent-presets
  // 未挂）时旧实现静默跳过——用户拿到的是无工具面 agent 且无任何提示。
  // 装配缺失必须可见：提示重跑安装命令让 bundle patch 重新生效。
  if (facet === undefined) {
    warn('⚠ agent-presets 未装配：本会话没有工具面。请重跑安装命令更新装配（dsh plugin --profile tui add @huiliyi37/dsh-tianshu-tui）')
    return undefined
  }
  try {
    return (await joinPreset({ facet, agentCtx, mode: 'create', preferredId })).id
  } catch (error) {
    warn(`⚠ 启动默认预设未生效: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

/** resume setup：按日志折出的 id mount。 */
export async function joinResume(
  ctx: { reflect?: { get(name: string, required?: boolean): unknown } },
  agentCtx: unknown,
  preferredId: string | undefined,
): Promise<void> {
  await joinPreset({ facet: presetJoinFacet(ctx), agentCtx, mode: 'resume', preferredId })
}
