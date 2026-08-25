/**
 * startup-pickers — /model /theme /effort 选择器：Enter 本会话、S 写默认。
 *
 * @module @huiliyi37/dsh-tianshu-tui/ui/startup-pickers
 */
import { PickerController } from '../picker.js';
export interface OverlayActivate {
    activate(id: string): void;
    deactivate(): void;
}
export interface ModelPickerLlm {
    listProviders(): Array<{
        id: string;
        name: string;
    }>;
    listModels(provider: string): Promise<Array<{
        id: string;
        name: string;
    }>>;
}
export interface ModelPickerHost {
    overlay: OverlayActivate | null;
    picker: PickerController | null;
    echoWarn(text: string): void;
    commit(text: string): void;
    current?: {
        provider: string;
        model: string;
    };
    savedKey?: string | null;
    llm?: ModelPickerLlm;
    applySession(selection: {
        provider: string;
        model: string;
    }): boolean;
    applyDefault(selection: {
        provider: string;
        model: string;
    }): void;
}
export interface ThemePickerHost {
    overlay: OverlayActivate | null;
    picker: PickerController | null;
    savedTheme?: string;
    applyDefault(name: string): void;
    rerenderHistory(): void;
    flushLiveRender(): void;
    commit(text: string): void;
}
export interface EffortPickerHost {
    overlay: OverlayActivate | null;
    picker: PickerController | null;
    currentEffort?: string;
    savedEffort?: string;
    apply(level: string, persist: boolean): void;
}
/** 打开模型选择器：Enter 热切本会话，S 写宿主默认。 */
export declare function openModelPicker(host: ModelPickerHost): Promise<void>;
/** 打开主题选择器：预览即生效；Enter 不落盘，S 写 prefs。 */
export declare function openThemePicker(host: ThemePickerHost): void;
/** 打开推理等级选择器。 */
export declare function openEffortPicker(host: EffortPickerHost): void;
