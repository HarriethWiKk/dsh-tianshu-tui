/**
 * inspect-panels — 检查类 live 面板（/config /skills /status /lsp /tasks）
 * 互斥开闭与键语义。监控类面板（todos/subagents/workflow）不在此列。
 *
 * @module @huiliyi37/dsh-tianshu-tui/ui/inspect-panels
 */
export type InspectPanel = 'config' | 'skills' | 'status' | 'lsp' | 'tasks';
export interface InspectPanelFlags {
    config: boolean;
    skills: boolean;
    status: boolean;
    lsp: boolean;
    tasks: boolean;
}
export type InspectKeyAction = {
    type: 'close';
} | {
    type: 'notify';
} | {
    type: 'density';
} | {
    type: 'skills-move';
    delta: -1 | 1;
};
/** 打开 which；open=false 时五项全关。 */
export declare function exclusiveInspect(which: InspectPanel, open: boolean): InspectPanelFlags;
export declare function anyInspectOpen(flags: InspectPanelFlags): boolean;
export declare function inspectKeyAction(input: {
    name: string;
    char: string;
    empty: boolean;
    vimInsert: boolean;
    flags: InspectPanelFlags;
}): InspectKeyAction | null;
/** 检查面板底栏；窄宽截断。 */
export declare function inspectHint(width: number, extras?: readonly string[]): string;
