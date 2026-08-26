/**
 * os-notify — 后台完成时的系统通知（纯展示侧，失败静默）。
 *
 * 固定 argv（execFile 数组，不走 shell）。SSH / CI / 测试 / DSH_TUI_SKIP_NOTIFY
 * 不发。用户文案经 sanitize + 平台引号转义后再进参数。
 *
 * @module @huiliyi37/dsh-tianshu-tui/os-notify
 */
/** 设为 1/true 时关闭系统通知。 */
export declare const SKIP_NOTIFY_ENV = "DSH_TUI_SKIP_NOTIFY";
export interface NotifyPayload {
    title: string;
    body: string;
}
export interface NotifyPlan {
    bin: string;
    args: string[];
}
export interface SendOsNotifyOptions {
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    execFile?: (bin: string, args: string[]) => Promise<unknown>;
    /** 用户偏好；`notifyOs === false` 时不发（缺省开）。 */
    prefs?: {
        notifyOs?: boolean;
    };
}
/** /config notify 参数：开 / 关 / 切换；空串不解析。 */
export type NotifyOsAction = 'on' | 'off' | 'toggle';
/** 面板终端段：锁定时 notifyOs 为关。 */
export interface ConfigTuiInput {
    notifyOs: boolean;
    notifyLocked: boolean;
    /** 紧凑工具卡；缺省不渲染该行。 */
    compactMode?: boolean;
}
/** 压扁控制字符并截断，避免通知中心/脚本被换行拆开。 */
export declare function sanitizeNotifyText(text: string, max: number): string;
/** AppleScript 双引号字符串（`"` 与 `\` 转义）。 */
export declare function quoteAppleScript(text: string): string;
/** PowerShell 单引号字符串（`'` → `''`）。 */
export declare function quotePowerShell(text: string): string;
/** 用户显式设了 DSH_TUI_SKIP_NOTIFY 时，面板开关不可切。 */
export declare function notifyOsEnvLocked(env?: NodeJS.ProcessEnv): boolean;
/**
 * 是否允许发系统通知。
 * 关闭条件：用户偏好关、DSH_TUI_SKIP_NOTIFY、VITEST、CI、SSH_*。
 */
export declare function shouldNotify(env: NodeJS.ProcessEnv, prefs?: {
    notifyOs?: boolean;
}): boolean;
/**
 * 子代理完成通知门槛：有活跃 workflow run 时静默。
 * workflow 派生的子代理逐条完成会连发刷屏，汇总由 workflow/end 的
 * 「工作流完成」通知统一承担；仅独立委派（无运行中 workflow）即时提醒。
 */
export declare function subagentNotifySuppressed(activeWorkflowRuns: number): boolean;
/** 空参 → null（打开面板）；notify [on|off]；其余 usage。 */
export declare function parseConfigNotifyArg(text: string): NotifyOsAction | 'usage' | null;
/** 就地改 prefs；环境变量锁定时只警告。 */
export declare function applyNotifyOsPref(prefs: {
    notifyOs?: boolean;
}, action: NotifyOsAction, env?: NodeJS.ProcessEnv): {
    echo?: string;
    warn?: string;
};
/** 面板终端段：锁定时显示关。 */
export declare function configTuiFromPrefs(prefs: {
    notifyOs?: boolean;
}, env?: NodeJS.ProcessEnv): ConfigTuiInput;
/**
 * 平台通知命令计划；未知平台或空文案 → null。
 */
export declare function planOsNotify(payload: NotifyPayload, platform: NodeJS.Platform): NotifyPlan | null;
/**
 * 发送系统通知。门闸关闭 / 无计划 / exec 失败 → false，永不抛。
 */
export declare function sendOsNotify(payload: NotifyPayload, opts?: SendOsNotifyOptions): Promise<boolean>;
/** 装配层 fire-and-forget（测试环境因 VITEST 门闸自动空操作）。 */
export declare function notifyOs(payload: NotifyPayload, prefs?: {
    notifyOs?: boolean;
}): void;
