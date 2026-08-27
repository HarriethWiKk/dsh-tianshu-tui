/**
 * submit-queue — 运行中提交的本地排队（对标 CC 排队消息；↑ 取回队首）。
 *
 * 宿主 followup 通道本身是数组 FIFO（agent inbox 逐轮消费，rc.2/alpha.1 一致），
 * 但没有公开的取回/删除 API——所以排队在 TUI 侧完成：running 期间的 Enter 进
 * 本地队列（输入轨上方立即可见），turn/end 才按序投递 followup（与立即发送的
 * 宿主消费时机等价：都在下一轮边界）；中断不清队（保留用户意图）。中轮即时
 * 纠偏仍走 /steer、Ctrl+T（宿主 alpha.1 的 queue/steer 双模式亦作此区分）。
 */
/** 一条排队中的待发消息。 */
export interface QueuedSubmit {
    text: string;
    images: string[] | undefined;
}
export declare class SubmitQueueController {
    private items;
    /** 入队（保持提交顺序）。 */
    push(text: string, images: string[] | undefined): void;
    /** 当前队列长度。 */
    size(): number;
    /** 只读快照（渲染用）。 */
    peekAll(): readonly QueuedSubmit[];
    /** 取回队首（最旧一条）回输入行。 */
    takeFirst(): QueuedSubmit | undefined;
    /** turn/end 全量取出（按提交顺序投递）。 */
    drain(): QueuedSubmit[];
    /** 切会话清空（调用方负责回显丢弃提示）。 */
    clear(): void;
}
/**
 * 排队展示行：`⏳ N 条排队 · 最旧一条（↑ 取回）`，超宽截断。
 * @param cols - 终端列数。
 * @param items - 只读队列快照。
 */
export declare function formatQueueLine(cols: number, items: readonly QueuedSubmit[]): string;
