/**
 * C2 项 2：历史搜索 overlay — 全屏 alt-screen 内 smart-case 搜索对话历史。
 *
 * 设计决策（C2 文档）：
 * - 不引入 Worker（DSH 单会话规模小，主线程同步搜索够）
 * - 数据源：transcript.view.messages（adapter 事件投影，消费 text 字段）
 * - smart-case：查询含大写 → 精确匹配；否则大小写不敏感
 * - 输入实时搜索（type 即重算），n/N 循环跳转，Esc 退出
 */
import type { OverlayRenderer } from '../engine/overlay-engine.js';
import type { RivetTheme } from '../theme.js';
/** 搜索数据源的最小形状（adapter/transcript 的 TranscriptMessage.text 满足它）。 */
export interface SearchableMessage {
    text: string;
}
/** 历史搜索 overlay：smart-case 子串搜索对话历史，输入实时重算，n/N 循环跳转（主线程同步搜索，零 I/O）。 */
export declare class HistorySearchOverlay implements OverlayRenderer {
    private query;
    private matches;
    private current;
    private messages;
    private readonly theme;
    constructor(theme?: RivetTheme);
    /**
     * 装配方提供消息快照（transcript.view.messages）；重复设置重算搜索。
     * @param messages - 可搜索的消息快照。
     */
    setMessages(messages: readonly SearchableMessage[]): void;
    /**
     * 输入字符：累积进 query 并实时搜索。
     * @param char - 追加到 query 的可打印字符。
     */
    type(char: string): void;
    /** 退格：删末字符并重算。 */
    backspace(): void;
    /** 清空查询（overlay 关闭时调用）。 */
    clear(): void;
    /** 下一个匹配（循环）。 */
    goNext(): void;
    /** 上一个匹配（循环）。 */
    goPrev(): void;
    /**
     * 当前匹配数。
     * @returns 命中的消息条数。
     */
    matchCount(): number;
    /**
     * 当前匹配的消息索引；无匹配返回 -1。
     * @returns messages 数组下标，或 -1。
     */
    currentIndex(): number;
    private research;
    render(width: number, height: number): string[];
    onActivate(): void;
    onDeactivate(): void;
}
