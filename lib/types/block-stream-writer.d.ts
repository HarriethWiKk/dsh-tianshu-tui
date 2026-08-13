/**
 * 分块策略参数：minChars 起切下限、maxChars 强制切分上限、
 * idleMs 静默冲刷延时、maxBufferSize 缓冲硬上限（超出立即强切）。
 */
export interface BlockStreamConfig {
    minChars: number;
    maxChars: number;
    idleMs: number;
    maxBufferSize: number;
}
/**
 * 把流式文本按语义边界（段落 > 句末 > 空白）聚合成块再回调 onBlock：
 * 达到 maxChars 强制切分，静默 idleMs 后冲刷剩余。缓冲受
 * maxBufferSize 硬上限约束，peek() 可读未发出的活尾。
 */
export declare class BlockStreamWriter {
    private buffer;
    private idleTimer;
    private sending;
    private readonly config;
    private readonly onBlock;
    private hasEmitted;
    constructor(config: Partial<BlockStreamConfig>, onBlock: (text: string) => void);
    /**
     * 追加一段流式文本；达到切分条件时同步发出块。空串为 no-op。
     * @param chunk - 新到的文本片段。
     */
    push(chunk: string): void;
    /** 立即把缓冲余量作为最后一块发出并等待发送完成；空缓冲为 no-op。 */
    flush(): Promise<void>;
    /** Drop buffered text WITHOUT emitting. Used when a stale run never
     *  finalized (e.g. abort, maxTurns exhaustion) and a new run is starting —
     *  flushing here would paint the previous run's leftover text into the
     *  new run's output. */
    discard(): void;
    /**
     * The text received but not yet emitted as a block — i.e. the live tail.
     * Structurally bounded by maxChars/maxBufferSize, so it stays small enough
     * to render in the live region without exceeding the viewport (真凶②).
     * @returns 已接收但尚未成块发出的缓冲文本。
     */
    peek(): string;
    private resetIdleTimer;
    private clearIdleTimer;
    private checkEmit;
    private enforceBufferLimit;
    private findBreakPoint;
    private findSentenceEnd;
    private enqueue;
}
