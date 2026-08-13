/** 定容环形缓冲：满后 push 覆盖最旧项；items/drain 按插入序出队。 */
export interface RingBuffer<T> {
    push(item: T): void;
    items(): T[];
    clear(): void;
    drain(n: number): T[];
    readonly size: number;
}
/**
 * 创建定容环形缓冲。
 * @param cap - 容量上限（满后覆盖最旧项）。
 * @returns 新的 RingBuffer 实例。
 */
export declare function createRingBuffer<T>(cap: number): RingBuffer<T>;
