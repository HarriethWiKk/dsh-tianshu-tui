/**
 * /config 设置面板（纯函数层，T3.2）。
 *
 * projectConfigPanel 把终端偏好 + 宿主投影渲染为面板行：
 * - 终端段（可选 tui）：系统通知开关；缺省不渲染（旧投影无此字段）。
 * - 宿主设置段：每个命名空间一行（ns + 值 + secrets 脱敏标记）——值以
 *   unknown 流动，null/undefined 渲染 —，object 紧凑 JSON；secret 槽用 🔒
 *   标记。空数组不渲染该段。
 * - 权限预设选择器：选项名从投影动态取，当前值 ✓、其余 ○；仅 'custom'
 *   保留字——currentValue 为 custom 而选项缺失时补一行。permission 为
 *   null 时不渲染。
 * - 凭据徽章：ref + 已配置/未配置 + source + 可写/只读；writable 为
 *   false 时整行 DIM 置灰。空数组不渲染该段。
 * - 底栏：有 tui 时提示 n 切换 / 环境变量锁定。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/config-panel
 */
import type { ConfigTuiInput } from './os-notify.js';
export type { ConfigTuiInput };
/**
 * 设置命名空间描述符（结构兼容 dsh-settings 的 SettingsDescriptor；纯函数层
 * 只消费 ns/value/secrets，schema/revision/base/user/applies 不参与渲染）。
 */
export interface ConfigSettingsDescriptorInput {
    /** 注册的命名空间（kebab-case）。 */
    ns: string;
    /** 当前解析值；以 unknown 流动（值形状由各命名空间 schema 决定）。 */
    value: unknown;
    /**
     * schema 声明的 secret 槽（结构兼容 RedactedSecret：path/set）——
     * redactSecrets 之后的描述符才携带；有值槽显示已脱敏计数，空槽显示槽位。
     */
    secrets?: {
        path: string[];
        set: boolean;
    }[];
}
/** 权限预设选项（结构兼容 dsh-permission 的 PresetOption）。 */
export interface ConfigPresetOptionInput {
    /** 稳定选项值：预设表键，或保留字 custom。 */
    value: string;
    /** 显示标签。 */
    name: string;
}
/** 权限投影（结构兼容 dsh-permission 的 PermissionSelect）。 */
export interface ConfigPermissionInput {
    /** 可切换预设（当前为 custom 时含 custom 项）；选项名动态取，不硬编码。 */
    options: ConfigPresetOptionInput[];
    /** 生效当前值：预设表键或保留字 custom。 */
    currentValue: string;
}
/** 凭据信息（结构兼容 dsh-credentials 的 CredentialInfo，附 ref 键）。 */
export interface ConfigCredentialInput {
    /** 凭据引用（POSIX 环境变量名形状）。 */
    ref: string;
    /** 当前是否已配置（resolve 有值）。 */
    configured: boolean;
    /** 供应层 id（env/file/project-env/user-env）；未配置时缺省。 */
    source?: string;
    /** 是否可写（set 当前会成功）；false 时整行置灰。 */
    writable: boolean;
}
/** /config 面板投影：终端偏好 + 宿主设置 + 权限预设 + 凭据。 */
export interface ConfigPanelProjection {
    /** 命名空间描述符列表；空数组 → 不渲染宿主设置段。 */
    settings: ConfigSettingsDescriptorInput[];
    /** 权限选择投影；null（未组合权限服务）→ 选择器段不渲染。 */
    permission: ConfigPermissionInput | null;
    /** 凭据信息列表；空数组 → 不渲染凭据段。 */
    credentials: ConfigCredentialInput[];
    /** TUI 本地偏好（系统通知）；缺省不渲染终端段。 */
    tui?: ConfigTuiInput;
}
/** 面板选项。 */
export interface ConfigPanelOptions {
    /** 终端列数（行截断预算，含标题与段标题）。 */
    width: number;
}
/**
 * 投影终端偏好 + 宿主三段为 /config 面板行。
 * 空宿主段不渲染；有 tui 时终端段置顶、底栏提示切换键。
 */
export declare function projectConfigPanel(projection: ConfigPanelProjection, opts: ConfigPanelOptions): string[];
