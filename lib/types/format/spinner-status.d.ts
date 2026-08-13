import type { LiveRegionLine } from '../engine/live-engine.js';
import type { RivetTheme } from '../theme.js';
/** 动词池轮换时间片（ms）：同一片内取同一词，跨片轮换。 */
export declare const VERB_ROTATE_MS = 4000;
/** 默认动词池（思考/分析/检索…）。 */
export declare const DEFAULT_SPINNER_VERBS: readonly string[];
/** spinner 相位；idle 不渲染，其余相位渲染单行状态。 */
export type SpinnerPhase = 'idle' | 'thinking' | 'streaming' | 'waiting' | 'analyzing';
/** formatSpinnerStatus 的渲染输入。 */
export interface SpinnerStatusInput {
    /** 帧序号（渲染节拍）。 */
    tick: number;
    /** 当前相位。 */
    phase: SpinnerPhase;
    /** 本轮已耗时（ms）。 */
    elapsedMs: number;
    /** 停滞：整行转警告。 */
    stalled?: boolean;
    /** 减少动效：frame 静态化、动词冻结池首。 */
    reducedMotion?: boolean;
    /** ascii 帧（`-`/`\`/`|`/`/`）。 */
    ascii?: boolean;
    /** 动词池覆盖；空数组回退默认池。 */
    verbs?: string[];
    /** 等待审批中：如实显示而非冒充模型活动。 */
    approvalWait?: {
        toolName: string;
        waitMs: number;
    };
}
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
/**
 * 动态 spinner 状态行；idle 返回 null（不占位）。
 * approvalWait 优先：显示「等待审批 <tool> · Ns」（warning 色）而非冒充模型活动。
 * @param input - 帧序号、相位、耗时与动效/审批等选项。
 * @param theme - 当前主题（停滞/审批转 warning，其余 pulseActive）。
 * @returns 单行 live 区状态；idle 相位返回 null。
 */
export declare function formatSpinnerStatus(input: SpinnerStatusInput, theme: RivetTheme): LiveRegionLine[] | null;
