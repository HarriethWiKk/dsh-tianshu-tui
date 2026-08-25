/**
 * 启动时对照 npm `latest`，把 profile 里的本包升到新版本。
 * 已加载的模块不会热替换——更新落盘后需重启才生效。
 *
 * @module @huiliyi37/dsh-tianshu-tui/self-update
 */
/** 与 package.json name 对齐；profile 依赖键、npm 包名都用它。 */
export declare const TUI_PACKAGE = "@huiliyi37/dsh-tianshu-tui";
/** 显式关闭启动自更新（测试 / 不想联网）。 */
export declare const SKIP_UPDATE_ENV = "DSH_TUI_SKIP_UPDATE";
/** 更新检查磁盘缓存 TTL：1h——每次启动都打 registry 没必要，24h 又会让
 *  装好新版本的用户一整天看不到更新提示（上游 updater 同款权衡）。 */
export declare const UPDATE_CACHE_TTL_MS: number;
/** 缓存落在本包 home（与自定义主题根 ~/.dsh-tui 同处，不污染 profile 目录）。 */
export declare function defaultUpdateCachePath(): string;
export type SkipReason = 'env' | 'ci' | 'not-npm' | 'same' | 'no-profile' | 'no-latest';
export type UpdatePlan = {
    action: 'skip';
    reason: SkipReason;
} | {
    action: 'update';
    latest: string;
};
export type UpdateResult = {
    kind: 'updated';
    version: string;
} | {
    kind: 'noop';
} | {
    kind: 'failed';
    error: string;
};
export interface RunSelfUpdateOptions {
    env?: NodeJS.ProcessEnv;
    currentVersion?: string;
    profileDir?: string;
    installSpec?: string;
    startDir?: string;
    fetchLatest?: () => Promise<string | null>;
    install?: (latest: string, profileDir: string) => Promise<void>;
    /** 更新检查缓存路径（缺省 ~/.dsh-tui/update-cache.json）；仅真实网络路径使用。 */
    cachePath?: string;
    /** 时钟注入（缓存新鲜度判定）。 */
    now?: () => number;
}
/** registry / dist-tag / 范围：视为 npm 安装。git 与本地路径不是。 */
export declare function isNpmVersionSpec(spec: string): boolean;
/** CI、vitest、显式开关下不联网。 */
export declare function shouldCheckForUpdate(env: NodeJS.ProcessEnv): boolean;
/**
 * 从本包安装目录向上找 profile（含 `dsh.profile` 或对本包的 dependencies）。
 * 跳过本包自己的 package.json。
 */
export declare function findProfileDir(startDir: string): string | undefined;
/** 读本包 version（向上找 name === TUI_PACKAGE 的 package.json）。 */
export declare function readOwnVersion(startDir: string): string | undefined;
export declare function readInstallSpec(profileDir: string): string | undefined;
export declare function planSelfUpdate(input: {
    env: NodeJS.ProcessEnv;
    currentVersion: string;
    profileDir: string | undefined;
    installSpec: string | undefined;
    latest: string | null;
}): UpdatePlan;
/** registry 基址链：官方源 → 国内镜像（npmmirror，完整 npm REST 镜像）。
 *  #43：registry.npmjs.org 直连不通的网络下，单源 3s 超时让启动检查恒失败。 */
export declare const UPDATE_REGISTRY_FALLBACKS: readonly ['https://registry.npmjs.org', 'https://registry.npmmirror.com'];
/** 自定义 registry 链（逗号分隔多个；优先生效）——私有源/代理场景。 */
export declare const UPDATE_REGISTRY_ENV = "DSH_TUI_UPDATE_REGISTRY";
/** 解析 registry 尝试链：DSH_TUI_UPDATE_REGISTRY 覆盖 > 官方 + npmmirror。 */
export declare function npmRegistryCandidates(env?: NodeJS.ProcessEnv): string[];
/** fetchNpmLatest 的注入面（测试密封）。 */
export interface FetchLatestOptions {
    /** registry 基址链；缺省 npmRegistryCandidates()。 */
    registries?: string[];
    /** fetch 实现；缺省全局 fetch。 */
    fetchImpl?: typeof fetch;
}
/**
 * 逐源查 latest：任一源拿到版本即返回——官方源超时/不可达时回退镜像。
 * 单源失败（超时/网络错/非 200）不中断链；全部源都网络错则抛最后一个错误
 * （保持启动「自更新失败」warning 语义，#43 之前行为）。全部源 200 但无
 * version → null（no-latest 静默跳过）。
 */
export declare function fetchNpmLatest(packageName?: string, timeoutMs?: number, opts?: FetchLatestOptions): Promise<string | null>;
/** 缓存文件形状。 */
export interface UpdateCache {
    /** 写入时刻（Date.now()，毫秒）。 */
    timestamp: number;
    /** 当时查得的 npm latest。 */
    latest: string;
}
/** 读缓存；缺失/损坏/形状不对 → null（容错：缓存坏不挡更新检查）。 */
export declare function readUpdateCache(path: string): UpdateCache | null;
/** 原子写缓存（tmp + rename）；失败静默（缓存只是优化，不是正确性依赖）。 */
export declare function writeUpdateCache(path: string, latest: string, now: number): void;
/** 缓存是否仍新鲜（age < TTL；时钟回拨到写入前视为新鲜）。 */
export declare function isCacheFresh(cache: UpdateCache, now: number, ttlMs?: number): boolean;
/**
 * 带缓存的 latest 获取：新鲜缓存直接用（零联网）；否则打 registry 并回写。
 * 网络失败 → null（不回退旧值：旧值会让离线场景触发注定失败的安装尝试）。
 */
export declare function fetchLatestWithCache(input: {
    cachePath: string;
    now: number;
    /** 网络获取函数（测试注入）；缺省真实 fetchNpmLatest。 */
    fetchNet?: () => Promise<string | null>;
}): Promise<string | null>;
export type PackageManager = 'pnpm' | 'npm' | 'yarn';
/**
 * 按 profile 锁文件探测包管理器（安装历史的确定性证据）：
 * pnpm-lock.yaml → pnpm；package-lock.json → npm；yarn.lock → yarn；
 * node_modules/.package-lock.json（npm v7+ 隐藏锁文件）→ npm；
 * 均无 → 默认 pnpm（历史行为；npm install 会重写 pnpm symlink 布局，更糟）。
 */
export declare function detectPackageManager(profileDir: string): PackageManager;
export interface InstallInvocation {
    /** win32 下为 cmd.exe（/d /c 派发 .cmd）；否则为包管理器可执行名。 */
    command: string;
    args: string[];
    /** 错误消息用的人类可读标签，如 'pnpm add' / 'npm install'。 */
    label: string;
}
/** 包管理器 → 安装调用。win32 经 cmd.exe /d /c 派发（.cmd 不能不经 shell 启动，
 *  DEP0190 约束保持：shell:false + args 数组）。 */
export declare function installCommandFor(pm: PackageManager, latest: string): InstallInvocation;
export declare function installNpmVersion(latest: string, profileDir: string, timeoutMs?: number): Promise<void>;
/**
 * 对照 npm latest；需要时在 profile 里安装。失败不抛（启动不能被更新拖死）。
 */
export declare function runSelfUpdate(opts?: RunSelfUpdateOptions): Promise<UpdateResult>;
export declare function updateNoticeText(version: string): string;
/** 失败提示里的手动更新命令包名（app 侧文案引用）。 */
export declare const updateNoticePackage = "@huiliyi37/dsh-tianshu-tui";
/** 更新后将自动重启（autoRestartOnUpdate）时的提示。 */
export declare function autoRestartNoticeText(version: string): string;
/** /update 检查结果（只查不装——用户看到提示后手动更新）。 */
export type UpdateCheckResult = {
    kind: 'latest';
    latest: string;
    current: string;
} | {
    kind: 'current';
    current: string;
} | {
    kind: 'failed';
    error: string;
};
export interface CheckForUpdateOptions {
    env?: NodeJS.ProcessEnv;
    /** 当前版本（缺省 readOwnVersion(process.cwd())）。 */
    currentVersion?: string;
    /** 更新检查缓存路径（缺省 defaultUpdateCachePath()）。 */
    cachePath?: string;
    now?: number;
    /** 网络获取函数（测试注入）；缺省真实 fetchNpmLatest。 */
    fetchNet?: () => Promise<string | null>;
}
/**
 * 只查不装的更新检查（/update 命令数据源）。绕过 DSH_TUI_SKIP_UPDATE——
 * 用户显式要求检查时不尊重"不想联网"开关；CI/vitest 环境防御性跳过
 * （测试隔离靠 fetchNet 注入，此守卫只兜底误配置）。失败不抛（回显用）。
 */
export declare function checkForUpdate(opts?: CheckForUpdateOptions): Promise<UpdateCheckResult>;
