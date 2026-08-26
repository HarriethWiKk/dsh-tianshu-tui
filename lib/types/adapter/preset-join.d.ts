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
    mount(agentCtx: unknown, id?: string): Promise<{
        id: string;
        name?: string;
    }>;
    composeFrom?(agentCtx: unknown, parentCtx: unknown): string | undefined;
}
/** 铸 agent 的 join 模式。 */
export type PresetJoinMode = 'create' | 'resume' | 'child';
/** joinPreset 入参。 */
export interface JoinPresetInput {
    facet: PresetJoinFacet | undefined | null;
    agentCtx: unknown;
    mode: PresetJoinMode;
    /** create = prefs；resume = resolvePresetId；空串当缺省。 */
    preferredId?: string;
    /** child 的父 agent.ctx。 */
    parentCtx?: unknown;
}
/** joinPreset 结果。 */
export interface JoinPresetResult {
    skipped: boolean;
    id?: string;
}
/** 从 host ctx 取花名册；无 mount 视为未装配。 */
export declare function presetJoinFacet(ctx: {
    reflect?: {
        get(name: string, required?: boolean): unknown;
    };
}): PresetJoinFacet | undefined;
/**
 * 按模式加入预设面。无花名册 skipped。
 * create/resume：mount。child：先 composeFrom，父未 join 再 mount。
 */
export declare function joinPreset(input: JoinPresetInput): Promise<JoinPresetResult>;
/** newSession setup：mount prefs/default；失败回 warn，不阻断铸造。 */
export declare function joinCreateOrWarn(ctx: {
    reflect?: {
        get(name: string, required?: boolean): unknown;
    };
}, agentCtx: unknown, preferredId: string | undefined, warn: (msg: string) => void): Promise<string | undefined>;
/** resume setup：按日志折出的 id mount。 */
export declare function joinResume(ctx: {
    reflect?: {
        get(name: string, required?: boolean): unknown;
    };
}, agentCtx: unknown, preferredId: string | undefined): Promise<void>;
