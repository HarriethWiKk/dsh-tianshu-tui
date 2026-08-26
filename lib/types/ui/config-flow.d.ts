/**
 * config-flow — /config 面板投影装配（从 TuiApp 抽出，守 app.ts 棘轮）。
 *
 * 宿主 settings/permission/credentials 均可缺席；终端段始终带上
 * （系统通知开关不依赖宿主服务）。
 *
 * @module @huiliyi37/dsh-tianshu-tui/ui/config-flow
 */
import type { ConfigPanelProjection } from '../config-panel.js';
import type { TuiPrefs } from '../prefs.js';
/** ctx.reflect 最小面。 */
export interface ConfigFlowReflect {
    get(name: string, optional?: boolean): unknown;
}
export interface LoadConfigProjectionInput {
    reflect: ConfigFlowReflect;
    prefs: TuiPrefs;
    env?: NodeJS.ProcessEnv;
    /** describe 返回后若已关闭面板 / 已 dispose → 不填凭据。 */
    shouldAbort?: () => boolean;
}
/** 组装 /config 投影；三服务全缺仍返回带 tui 的对象（不再 null）。 */
export declare function loadConfigProjection(input: LoadConfigProjectionInput): Promise<ConfigPanelProjection>;
