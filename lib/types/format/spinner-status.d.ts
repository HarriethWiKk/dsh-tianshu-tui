/**
 * spinner 动词池与耗时格式化（format/spinner-status.ts）— 纯函数。
 *
 * 动词池按 elapsed 时间片轮换（纯函数，无全局状态）；reducedMotion 冻结为池首。
 * 消费方：glance 状态行 running 回退（engine/metrics-glance-controller 的
 * deriveGlanceStatus）；formatElapsedHuman 另被 activity/rewind/turn-summary
 * 等多处复用。
 */
/** 动词池轮换时间片（ms）：同一片内取同一词，跨片轮换。 */
export declare const VERB_ROTATE_MS = 4000;
/** 默认动词池（思考/分析/检索…；池首恒为「思考中」——reducedMotion 冻结词）。 */
export declare const DEFAULT_SPINNER_VERBS: readonly string[];
/**
 * 人类可读耗时：<60s 纯秒；否则 分+秒；负数按 0。
 * @param ms - 毫秒耗时。
 * @returns 形如 `42s` 或 `2m 5s` 的文本。
 */
export declare function formatElapsedHuman(ms: number): string;
/**
 * 按 elapsed 时间片取动词（纯函数）；reducedMotion 冻结为池首；空池回退默认池首。
 * @param elapsedMs - 已耗时（毫秒）；同一 VERB_ROTATE_MS 时间片内取同一词。
 * @param verbs - 动词池；空数组回退默认池。
 * @param reduced - 减少动效：恒取池首。
 * @returns 当前时间片的动词。
 */
export declare function verbForElapsed(elapsedMs: number, verbs: readonly string[], reduced?: boolean): string;
