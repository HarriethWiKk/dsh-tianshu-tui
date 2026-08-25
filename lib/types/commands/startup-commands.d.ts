/**
 * startup-commands — /theme /model /effort /preset：会话应用 vs 启动默认。
 *
 * 带参无 default = 仅本会话；末尾 default / 选择器 S = 写启动默认。
 *
 * @module @huiliyi37/dsh-tianshu-tui/commands/startup-commands
 */
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SlashCommand } from './registry.js';
/** /model 的 effort 白名单（llm 三档：off / high / max）。 */
export declare const EFFORT_LEVELS: readonly ['off', 'high', 'max'];
/** 四条启动项命令需要的 deps 子集。 */
export interface StartupCommandDeps {
    switchLiveModel(selection: {
        provider: string;
        model: string;
        reasoningEffort?: string;
    }): boolean;
    openModelPicker(): void;
    openThemePicker(): void;
    openEffortPicker(): void;
    onThemeApplied(name: string): void;
    onThemeChanged?(): void;
    applyThemeAuto(persist?: boolean): void;
    exportTheme(name?: string): string;
    currentAgent(): Agent | null;
    isBlankSession(): boolean;
    persistPresetDefault(id: string): void;
    currentDefaultPreset(): string | undefined;
}
export declare function createThemeCommand(deps: StartupCommandDeps): SlashCommand;
export declare function createModelCommand(deps: StartupCommandDeps): SlashCommand;
export declare function createEffortCommand(deps: StartupCommandDeps): SlashCommand;
export declare function createPresetCommand(deps: StartupCommandDeps): SlashCommand;
