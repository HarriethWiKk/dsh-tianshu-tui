/**
 * 启动时对照 npm `latest`，把 profile 里的本包升到新版本。
 * 已加载的模块不会热替换——更新落盘后需重启才生效。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/self-update
 */
/** 与 package.json name 对齐；profile 依赖键、npm 包名都用它。 */
export declare const TUI_PACKAGE = "@huiliyi37/dsh-tianshu-tui";
/** 显式关闭启动自更新（测试 / 不想联网）。 */
export declare const SKIP_UPDATE_ENV = "DSH_TUI_SKIP_UPDATE";
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
export declare function fetchNpmLatest(packageName?: string, timeoutMs?: number): Promise<string | null>;
export declare function installNpmVersion(latest: string, profileDir: string, timeoutMs?: number): Promise<void>;
/**
 * 对照 npm latest；需要时在 profile 里安装。失败不抛（启动不能被更新拖死）。
 */
export declare function runSelfUpdate(opts?: RunSelfUpdateOptions): Promise<UpdateResult>;
export declare function updateNoticeText(version: string): string;
