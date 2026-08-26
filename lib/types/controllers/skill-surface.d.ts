/**
 * SkillSurfaceController — #39 用户技能调用展示面（从 ui/app.ts 提取）。
 *
 * 持有技能快照（ctx.skills.list 经 reflect 读取；服务缺失/reject → 空数组）
 * 与 userInvocable 过滤，把「注册表命令 + userInvocable 技能」合并投影为
 * slash 菜单数据源（InputController.slashCommands），并记录技能手势 MRU。
 *
 * 纯展示层边界（ADAPTER.md）：不注册任何注入面——技能调用由 host 的
 * tool-skill agent/pre-step 手势完成（消息中 `/name` token → 注入 skill 体），
 * 本控制器只负责让技能在输入面可见、提交路由不被误判为未知命令。
 *
 * 副作用注入（不 import app.ts、不碰渲染）：
 * - getService(name)：可选服务读取（ctx.reflect.get，skills 缺失 → undefined）。
 * - listCommandHints()：注册表命令的提示条目现取（slash.list().map(toSlashHint)）。
 * - setSlashEntries(entries)：合并投影写回（inputController.slashCommands 赋值）。
 * - scheduleRender()：快照刷新后的重绘调度（renderBatcher.schedule）。
 * - isDisposed()：异步 resolve 竞态守卫（app.dispose 后不再写状态）。
 * - recordSlashUse(name)：技能手势 MRU 记录（inputController.recordSlashUse）。
 * - onEvent(event, cb)：宿主事件订阅（ctx.on；attach 订阅 / dispose 解绑）。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/controllers/skill-surface
 */
import type { SlashHintEntry } from '../engine/input-controller.js';
import type { PaletteEntry } from '../command-palette.js';
import type { SkillSummaryInput } from '../skill-panel.js';
/** SkillSurfaceController 的副作用注入（不 import app.ts、不碰渲染）。 */
export interface SkillSurfaceOptions {
    /** 可选服务读取（ctx.reflect.get；skills 未装配 → undefined → 空快照）。 */
    getService: (name: string) => unknown;
    /** 注册表命令的提示条目现取（slash.list().map(toSlashHint)）。 */
    listCommandHints: () => SlashHintEntry[];
    /** 合并投影写回（inputController.slashCommands 赋值）。 */
    setSlashEntries: (entries: SlashHintEntry[]) => void;
    /** 快照刷新后的重绘调度（renderBatcher.schedule）。 */
    scheduleRender: () => void;
    /** dispose 竞态守卫（dispose 后 resolve/reject 不再写状态）。 */
    isDisposed: () => boolean;
    /** 技能手势 MRU 记录（inputController.recordSlashUse）。 */
    recordSlashUse: (name: string) => void;
    /** 宿主事件订阅（ctx.on）；attach 订阅 / dispose 解绑。 */
    onEvent: (event: string, cb: () => void) => () => void;
    /**
     * 会话 cwd 现取（TuiApp.sessionCwd，读 session.header.cwd）。
     * #44：skills.list({ cwd }) 让宿主 dsh-skill-filesystem 的 roots(cwd)
     * 扫描项目级技能根（.dsh/skills、.agents/skills）——cwd 缺省时宿主整段
     * 跳过项目根，项目技能在 /skills 面板与 slash 菜单完全不可见。
     * 缺省（未注入）维持无参 list（用户根 + bundled）。
     */
    getSessionCwd?: () => string | undefined;
}
/** #39：userInvocable 技能 → InputController 提示条目的投影（🧭 标记区分技能与命令）。 */
export declare function toSkillHint(skill: {
    name: string;
    description: string;
}): SlashHintEntry;
/** #39：userInvocable 技能 → 命令面板条目（PaletteEntry 形状兼容，🧭 标记，归「技能」组）。 */
export declare function toSkillEntry(skill: {
    name: string;
    description: string;
}): PaletteEntry;
/**
 * 技能展示面状态机：快照缓存 + userInvocable 过滤 + slash 菜单投影 + 手势 MRU。
 * 生命周期：构造（空快照）→ refresh()（attach / skills/change / /skills 面板）→
 * app.dispose 后不再写状态（isDisposed 守卫）。
 */
export declare class SkillSurfaceController {
    private items;
    private readonly getService;
    private readonly listCommandHints;
    private readonly getSessionCwd;
    private readonly setSlashEntries;
    private readonly scheduleRender;
    private readonly isDisposed;
    private readonly recordSlashUse;
    private readonly onEvent;
    /** skills/change 订阅 disposer（attach 订阅 / dispose 解绑；重复 attach 先解绑旧 disposer）。 */
    private eventDisposer;
    /** /skills 面板选中下标（↑↓ 详情；刷新后钳制）。 */
    private selectedIndex;
    constructor(options: SkillSurfaceOptions);
    /** attach 接线：订阅 skills/change（目录变更 → 刷新）+ 首刷一次（技能在
     *  首次输入前就绪，不再只有 /skills 命令触发）。 */
    attach(): void;
    /** dispose 解绑订阅（防止 dispose 后事件回调泄漏）。 */
    dispose(): void;
    /**
     * 刷新技能快照（ctx.skills.list；服务缺失/list reject → 空数组）。
     * resolve 后同步重新投影 slash 菜单条目（#39），并调度重绘。
     */
    refresh(): void;
    /** 当前选中技能名（空列表 → undefined）。 */
    selectedName(): string | undefined;
    /** 移动选中；越界钳制。返回是否变化。 */
    moveSelected(delta: number): boolean;
    private clampSelected;
    /** 全部技能快照（/skills 浏览面板数据源；空数组 = 无技能或未加载）。 */
    all(): SkillSummaryInput[];
    /** userInvocable 技能（slash 菜单/命令面板数据源过滤）。
     *  本地最小谓词（invocation.userInvocable），不运行时 import dsh-skill。 */
    userInvocable(): SkillSummaryInput[];
    /** userInvocable 技能 → 命令面板条目（PaletteEntry 形状兼容，🧭 标记）。 */
    paletteEntries(): PaletteEntry[];
    /** 重新投影 slash 提示数据源 = 注册表命令 + userInvocable 技能（🧭 标记）。
     *  调用点：构造、技能快照刷新后、命令注册后。 */
    refreshEntries(): void;
    /** 技能手势 MRU：输入以 / 开头且首 token 命中 userInvocable 技能时记录
     *  （slash 菜单下次打开技能条目排前）。命令优先语义不变——命令名在
     *  runSlash 侧记录；同名/同前缀冲突时命令通道先行，不落到此处。 */
    recordGesture(input: string): void;
}
