/**
 * Smooth braille spinner frame for a monotonically increasing tick index (S16).
 * @param tick - 单调递增的帧计数（负值也安全，双取模回卷）。
 * @returns 当前帧的盲文字符。
 */
export declare function brailleSpinnerFrame(tick: number): string;
/**
 * Rotating circle spinner frame for a monotonically increasing tick index.
 * @param tick - 单调递增的帧计数（负值也安全，双取模回卷）。
 * @returns 当前帧的月相圆圈字符。
 */
export declare function circleSpinnerFrame(tick: number): string;
