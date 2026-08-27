/**
 * memory overlay — 记忆浏览器（P2 交互打磨）。
 *
 * 上下布局（终端宽度限制下左右分栏不友好）：上部为记忆列表（过滤后视口），
 * 下部为选中项完整内容。交互：
 * - ↑↓/j k：移动选中
 * - 可打印字符：进过滤 query（text/tags 子串，大小写不敏感）
 * - Backspace：退过滤
 * - x：删除选中（异步执行 onDelete + refetch 刷新；注意：x/X 已专用于删除，
 *   不进入过滤 query——只有字母数字/符号等非控制字符才进 query。若用户想输入
 *   含 'x' 的过滤词，可用大写 'X' 代替——但 'X' 目前同 x 语义。后续可选：改为
 *   dd 双键确认删除，释放单 x 给过滤。）
 * - Ctrl+N/Ctrl+P：下/上一页（分页，每页 20 条）
 * - Esc/Ctrl+C：关闭（handleKey 返回 'close'，装配方 deactivate）
 *
 * 数据源由装配方注入（TuiApp.openMemoryBrowser 经 memory 服务 list/delete），
 * overlay 本身不碰 I/O——纯状态机 + 渲染（对齐 RewindOverlay 模式）。
 */
import type { OverlayKeyResult, OverlayRenderer } from '../engine/overlay-engine.js';
import type { RivetTheme } from '../theme.js';
/** 记忆浏览器条目（memory 服务 list() 返回形状的最小消费面）。 */
export interface MemoryBrowserItem {
    readonly id: string;
    readonly text: string;
    readonly tags: readonly string[];
    readonly createdAt: number;
    readonly scope: string;
}
/** 装配方提供的数据源回调。 */
export interface MemoryBrowserSources {
    /** 重新拉取全量条目（删除后刷新；无记忆时返回空数组）。 */
    refetch(): Promise<MemoryBrowserItem[]>;
    /** 删除一条记忆（按 id）。 */
    onDelete(id: string): Promise<void>;
    /** 分页拉取（offset 跳过前 N 条，limit 最多返回条数）。 */
    fetchPage(offset: number, limit: number): Promise<MemoryBrowserItem[]>;
}
/** 记忆浏览器 overlay：过滤列表 + 选中项内容，删除/分页经装配方注入的回调（纯状态机 + 渲染，零 I/O）。 */
export declare class MemoryBrowserOverlay implements OverlayRenderer {
    private items;
    private query;
    private selected;
    private sources;
    /** 删除/翻页执行中（渲染占位，防连点）。 */
    private deleting;
    /** 分页：是否还有更多页（setItems 装配方判定；翻页后按实拉条数刷新）。 */
    private hasMore;
    private readonly theme;
    constructor(theme?: RivetTheme);
    /**
     * 装配方提供条目快照 + 数据源回调；重复设置重置状态（回到首页）。
     * @param items - 首页条目快照。
     * @param sources - 删除/刷新/分页回调。
     * @param hasMore - 首页之后是否还有更多条目（Ctrl+N 翻页前提）。
     */
    setItems(items: MemoryBrowserItem[], sources: MemoryBrowserSources, hasMore: boolean): void;
    /** 过滤后的条目（query 为空 = 全量）。 */
    private get filtered();
    /**
     * 键位路由（scroll-pager 范式收敛——Esc/Ctrl+C 关闭判定收进类内）。
     * @param name - 按键名（up/down/backspace/ctrl_n/ctrl_p/escape/ctrl_c 等）。
     * @param char - 可打印字符（j/k 移动，x/X 删除，其余进过滤 query）。
     * @returns close = 请求关闭（Esc/Ctrl+C）；handled = 已消费（含空格等未
     *   映射键——overlay 独占焦点，吞掉不穿透输入行）。
     */
    handleKey(name: string, char: string): OverlayKeyResult;
    /** 删除当前选中项（异步：onDelete + refetch 刷新；失败静默保持列表）。 */
    private deleteSelected;
    /** 下一页（异步拉取，加载中静默）。offset 语义 = 已加载条数（fetchPage
     * 跳过前 N 条）；成功后 hasMore 按实拉条数刷新（满页 = 可能还有）。 */
    private nextPage;
    /** 上一页（Ctrl+P：无条件回到首页——fetchPage(0, limit) 覆盖为首页，幂等）。 */
    private prevPage;
    render(width: number, height: number): string[];
}
