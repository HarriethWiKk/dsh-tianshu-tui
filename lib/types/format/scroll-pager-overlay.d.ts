/**
 * /scroll 分页查看器 overlay — scrollback-transcript 解析器的消费端。
 *
 * 全屏 alt-screen 内按消息单元浏览 CommitEngine 已提交的 scrollback 全文：
 * ↑↓/PgUp/PgDn/Ctrl+U/Ctrl+D 滚动、g/G 首尾、输入实时子串搜索、n/N 循环跳转、
 * Esc 退出。渲染按逻辑行窗口化（超宽行截断到终端宽度），ANSI 原样保留。
 * 键位路由收敛在本类 handleKey，装配方（TuiApp）只做 activate/deactivate。
 */
import type { OverlayKeyResult, OverlayRenderer } from '../engine/overlay-engine.js';
import type { RivetTheme } from '../theme.js';
/** handleKey 结果：close = 请求关闭 overlay；handled = 已消费（统一词表 OverlayKeyResult）。 */
export type PagerKeyResult = OverlayKeyResult;
export declare class ScrollPagerOverlay implements OverlayRenderer {
    private messages;
    /** 扁平化后的逻辑行（ANSI 原样）与每行所属消息索引。 */
    private rows;
    private rowMessage;
    /** 每条消息的首行行号（跳转落点）。 */
    private messageStartRow;
    private scrollRow;
    private query;
    private matches;
    private current;
    /** render 时缓存的可视行数，PgUp/PgDn 与 clamp 用；首帧前取保守缺省。 */
    private bodyHeight;
    private readonly theme;
    constructor(theme?: RivetTheme);
    /**
     * 装配方提供 scrollback 全文快照（CommitEngine.getContent()）；重复设置重解析。
     */
    setContent(content: string): void;
    type(char: string): void;
    backspace(): void;
    /** 清空搜索态（overlay 关闭时调用）；内容与滚动位置保留。 */
    clear(): void;
    matchCount(): number;
    scrollUp(n?: number): void;
    scrollDown(n?: number): void;
    pageUp(): void;
    pageDown(): void;
    toTop(): void;
    toBottom(): void;
    goNext(): void;
    goPrev(): void;
    /**
     * 键位路由：返回 'close' 请求关闭，其余一律视为已消费。
     * 可打印字符进 query；n/N、p/P 循环跳匹配；↑↓/jk 行滚、PgUp/PgDn/Ctrl+U/Ctrl+D
     * 页滚；g/G（Home/End）首尾。
     */
    handleKey(name: string, char: string): PagerKeyResult;
    render(width: number, height: number): string[];
    onActivate(): void;
    onDeactivate(): void;
    private maxScroll;
    private clampScroll;
    /** 当前视窗顶行所在的消息索引（空内容为 0）。 */
    private anchorMessage;
    /** 跳到匹配消息（视窗顶行贴住消息首行），current 对齐到 matches 中的位置。 */
    private jumpTo;
    private research;
}
