/**
 * T9 StreamRenderer — 流式 Markdown 增量渲染（Claude Code StreamingMarkdown 模型）。
 *
 * 职责：
 * - 接收 BlockStreamWriter 吐出的节流文本块，累积到 pending 缓冲区。
 * - 在「最后一个稳定的顶层 block 边界」切分：空行结束的段落、闭合的 ``` 围栏。
 * - 稳定前缀立即经 formatMarkdown 渲染后 commit 到 scrollback（不可回退）。
 * - 尾部不完整 block 留在 pending，由 live 区以原始文本渲染（display-width
 *   aware tail-cap，避免 CJK 宽字符截断错位）。
 * - 围栏代码块流式期间不解析高亮（防闪烁）：未闭合的 ``` 内容停留在 pending，
 *   闭合后整块作为稳定前缀高亮 commit。
 *
 * 数据流：
 *   onTextDelta → BlockStreamWriter（节流）→ StreamRenderer.push
 *     ├── 稳定 block → formatMarkdown → commit(scrollback)
 *     └── 尾部不完整 block → getLiveTail → LiveEngine 底部重绘
 */
import type { RivetTheme } from '../theme.js';
import type { TuiPerfMonitor } from './perf-monitor.js';
/**
 * 找到文本中最后一个稳定的顶层 block 边界（fence-aware）。
 *
 * 边界定义（均为「该行结尾、含换行符」的 offset）：
 * - 围栏外的空行（段落/列表/标题等 block 在空行处结束）
 * - 闭合的 ``` 围栏行（整个代码块完整，可安全高亮）
 *
 * 围栏内部的空行不算边界（代码块未闭合时不可切分）。
 * 最后一行（可能无尾随换行、仍在增长）永不参与判定。
 *
 * @param text - 累积中的流式 Markdown 文本
 * @returns 切割 offset；0 表示尚无稳定边界
 */
export declare function findStableBoundary(text: string): number;
/** StreamRenderer 构造参数（commit 出口 + 动态环境读取 + 可选观测钩子）。 */
export interface StreamRendererOptions {
    /** 将渲染好的 ANSI 多行文本 commit 到 scrollback */
    commit: (ansi: string) => void;
    /** 终端列数（动态读取，resize 安全） */
    getColumns: () => number;
    /** 主题读取函数（动态，切主题后新 block 立即生效） */
    getTheme: () => RivetTheme;
    /** Explicit stable identity; theme objects are deliberately not serialized. */
    getThemeKey: () => string;
    /** Optional cache instrumentation hook. Oversized segments do not emit events. */
    onCacheResult?: (hit: boolean) => void;
    perfMonitor?: TuiPerfMonitor;
}
/**
 * 流式 Markdown 增量渲染器：累积文本块，在稳定 block 边界切分——
 * 稳定前缀经 formatMarkdown 渲染后 commit 到 scrollback（带 LRU 渲染缓存），
 * 尾部不完整 block 留在 pending 由 live 区以原始文本展示。
 */
export declare class StreamRenderer {
    private static readonly CACHE_MAX_ENTRIES;
    private static readonly CACHE_MAX_TEXT;
    private pending;
    private committedAny;
    private readonly options;
    private readonly stableCache;
    constructor(options: StreamRendererOptions);
    /** 是否已有任何内容 commit 到 scrollback（用于 header 等一次性输出判定） */
    get hasCommitted(): boolean;
    /** 是否持有任何内容（pending 或已 commit） */
    get hasContent(): boolean;
    /** 当前未 commit 的尾部文本 */
    get pendingText(): string;
    /**
     * 累积流式文本块；出现稳定边界时立即渲染并 commit 稳定前缀。
     * @param chunk - 新到达的文本块；空串为 no-op
     * @returns 本次是否同步 commit 了稳定前缀
     */
    push(chunk: string): boolean;
    /**
     * 流结束：把剩余 pending 全部渲染 commit。
     * @returns 本轮是否输出过任何内容
     */
    finalize(): boolean;
    /** 丢弃所有状态（abort 场景） */
    reset(): void;
    /**
     * live 区尾部行：原始文本（不做 markdown 解析，防未闭合围栏闪烁），
     * display-width aware 截断到 maxRows 显示行。
     *
     * `extraTail` 为尚未吐块的最新缓冲（BlockStreamWriter.peek()）——拼在
     * pending 之后一起截断，使最新 token 逐字可见（打字机节奏），无需等 blockWriter
     * 吐块。截断对合并文本整体生效，保证不超视口 / CJK 宽度正确。
     * @param maxRows - 尾部显示行上限
     * @param extraTail - 尚未吐块的最新缓冲（BlockStreamWriter.peek()）
     * @returns 截断后的尾部行数组；无尾部内容时为空数组
     */
    getLiveTailLines(maxRows: number, extraTail?: string): string[];
    private commitText;
}
