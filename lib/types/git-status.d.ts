/**
 * git 仓库状态探测 — top bar 分支段与 footer ●N 的数据源（C4：自 ui/app.ts 提取）。
 *
 * 全部静默降级：非仓库 / git 缺失 / 命令失败 → 各自的「无值」形态，
 * 绝不因 git 探测阻塞或打扰 TUI。execFileSync 可注入（测试密封）。
 *
 * @module @huiliyi37/dsh-tianshu-tui/git-status
 */
/** execFileSync 替身形状（测试注入；缺省真实子进程）。 */
export type GitExecFn = (args: string[]) => string;
/** 检测 cwd 是否为 git 仓库（静默，失败返回 false）。 */
export declare function isGitRepo(exec?: GitExecFn): boolean;
/**
 * 读取当前 git 分支（C4 概念稿 A top bar；attach 时一次，静默）。
 * detached HEAD 或非仓库返回 undefined（不渲染分支段）。
 */
export declare function gitBranch(exec?: GitExecFn): string | undefined;
/**
 * git 未提交改动文件数（`git status --short` 非空行计数；footer ●N 数据源）。
 * 非仓库/命令失败返回 0（静默降级，同 gitBranch）。
 */
export declare function gitDirtyCount(exec?: GitExecFn): number;
