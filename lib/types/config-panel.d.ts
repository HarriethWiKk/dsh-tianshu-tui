/**
 * /config 设置面板（纯函数层，T3.2）。
 *
 * projectConfigPanel 把 settings 描述符、权限预设选择、凭据信息三段投影渲染
 * 为面板行：
 * - 设置段：每个命名空间一行（ns + 值 + secrets 脱敏标记）——值以 unknown
 *   流动（SettingsValue 类型不存在），null/undefined 渲染 —，object 紧凑
 *   JSON；schema 声明的 secret 槽用 🔒 标记（有值的显示已脱敏计数，空槽
 *   显示槽位）。
 * - 权限预设选择器：选项名从投影动态取（不硬编码预设表），当前值打勾 ✓、
 *   其余 ○；仅 'custom' 一个保留字——currentValue 为 custom 而选项缺失时
 *   补一行。
 * - 凭据徽章：每行一个凭据（ref + 已配置/未配置徽章 + source + 可写/只读），
 *   writable 为 false 时整行 DIM 置灰。
 * 数据面形状结构兼容 dsh-settings 的 SettingsDescriptor（ns/value/secrets）、
 * dsh-permission 的 PermissionSelect（options/currentValue）与 dsh-credentials
 * 的 CredentialInfo（configured/source/writable）——纯函数层不跨包依赖、无
 * I/O 无服务访问。permission 为 null（未组合权限服务）时选择器段不渲染。
 * TuiApp 消费三个投影快照，/config 命令切换显隐，行渲染进 live 区（接线由
 * 其他维度独占）。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/config-panel
 */
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
/** /config 面板投影：设置段 + 权限预设选择器 + 凭据徽章。 */
export interface ConfigPanelProjection {
    /** 命名空间描述符列表；空数组 → 设置段渲染占位。 */
    settings: ConfigSettingsDescriptorInput[];
    /** 权限选择投影；null（未组合权限服务）→ 选择器段不渲染。 */
    permission: ConfigPermissionInput | null;
    /** 凭据信息列表；空数组 → 凭据段渲染占位。 */
    credentials: ConfigCredentialInput[];
}
/** 面板选项。 */
export interface ConfigPanelOptions {
    /** 终端列数（行截断预算，含标题与段标题）。 */
    width: number;
}
/**
 * 投影 settings/permission/credentials 三块为 /config 面板行。
 * @param projection - 面板投影（设置描述符 + 权限选择 + 凭据信息）。
 * @param opts - 渲染选项（含行截断宽度预算）。
 * @returns 面板行数组（标题 + 设置段 + 权限预设段（permission 非 null 时）+ 凭据段）。
 */
export declare function projectConfigPanel(projection: ConfigPanelProjection, opts: ConfigPanelOptions): string[];
