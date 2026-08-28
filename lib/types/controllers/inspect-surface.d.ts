/**
 * InspectSurfaceController — 检查类 live 面板（/config /skills /status /lsp /tasks）
 * 互斥开闭与键分发。监控类面板不在此列。
 *
 * @module @huiliyi37/dsh-tianshu-tui/controllers/inspect-surface
 */
import { type InspectKeyAction, type InspectPanel, type InspectPanelFlags } from '../ui/inspect-panels.js';
export interface InspectSurfaceOptions {
    hasService: (name: string) => boolean;
    echoWarn: (text: string, hint?: string) => void;
    refreshConfig: () => Promise<void>;
    refreshSkills: () => void;
    ensureLsp: () => void;
    schedule: () => void;
    flush: () => void;
    toggleNotify: () => void;
    toggleDensity: () => void;
    moveSkills: (delta: -1 | 1) => boolean;
}
/** 五项检查面板的显隐与打开副作用。 */
export declare class InspectSurfaceController {
    private readonly opts;
    private state;
    constructor(opts: InspectSurfaceOptions);
    flags(): InspectPanelFlags;
    is(which: InspectPanel): boolean;
    any(): boolean;
    close(): void;
    hide(which: InspectPanel): void;
    toggle(which: InspectPanel): Promise<void>;
    dispatch(act: InspectKeyAction): void;
}
