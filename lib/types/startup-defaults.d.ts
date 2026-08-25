/**
 * startup-defaults — 会话应用 vs 启动默认的纯函数面。
 *
 * 选择器 Enter / 带参命令 = 仅本会话；选择器 S / 末尾 default = 写启动默认。
 * 回显必须点名「本会话」或「启动默认」，避免用户分不清。
 *
 * @module @huiliyi37/dsh-tianshu-tui/startup-defaults
 */
/** 启动项种类（回显与 /xxx default 提示共用）。 */
export type StartupKind = 'theme' | 'model' | 'effort' | 'density' | 'preset';
/** 剥末尾 default 标志：`/theme paper default` → rest=paper persist=true。 */
export declare function splitDefaultFlag(text: string): {
    rest: string;
    persist: boolean;
};
/** 仅本会话回显：点名本会话 + 如何写默认。 */
export declare function echoSessionOnly(kind: StartupKind, value: string): string;
/** /effort 选择：auto 清除 reasoningEffort。 */
export declare function effortSelection(base: {
    provider: string;
    model: string;
}, level: string): {
    provider: string;
    model: string;
    reasoningEffort?: string;
};
/** 写启动默认回显：主题说重启，其余说新会话。 */
export declare function echoSavedDefault(kind: StartupKind, value: string): string;
/** newSession / /preset 共用的最小 preset 面（不引入 dsh-agent-presets）。 */
export interface PrefPresetFacet {
    recompose(agentCtx: unknown, id: string): Promise<{
        id: string;
        name?: string;
    }>;
}
/** applyPrefPreset 入参。 */
export interface ApplyPrefPresetInput {
    presetId: string | undefined;
    isBlank: boolean;
    agent: {
        ctx: unknown;
        session: {
            append(type: string, data: {
                agentPreset: string;
            }): void;
        };
    } | null;
    facet: PrefPresetFacet | undefined | null;
}
/** applyPrefPreset 结果：失败不抛，调用方 echo 警告即可。 */
export interface ApplyPrefPresetResult {
    applied: boolean;
    id?: string;
    name?: string;
    error?: string;
}
/**
 * 空白会话上应用 prefs.preset：recompose + 落 agent-preset/selected。
 * 无 id / 无插件 / 非空白 / 无 agent → 静默跳过。
 */
export declare function applyPrefPreset(input: ApplyPrefPresetInput): Promise<ApplyPrefPresetResult>;
