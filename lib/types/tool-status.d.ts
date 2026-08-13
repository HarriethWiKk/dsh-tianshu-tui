/**
 * tool-status — 工具卡状态形色双通道辅助。
 *
 * 状态推导优先级：错误 > 待答 > 进行中 > 成功。
 * 颜色映射：success/error/question/running → 主题语义色。
 * 字形：成功 › / 错误 ✗x / 待答 ? / 进行中 ⠋ 或动画帧（ascii 四帧）。
 */
import type { RivetTheme } from './theme.js';
/** 工具卡状态（toolRunStatus 推导结果）。 */
export type ToolRunStatus = 'success' | 'error' | 'running' | 'question';
/** 状态推导输入标志（均缺省 = 成功）。 */
export interface ToolRunFlags {
    isError?: boolean;
    isQuestion?: boolean;
    streaming?: boolean;
}
/**
 * 状态推导：错误 > 待答 > 进行中 > 成功。
 * @param flags - 输入标志。
 * @returns 推导状态。
 */
export declare function toolRunStatus(flags: ToolRunFlags): ToolRunStatus;
/**
 * 状态 → 主题语义色。
 * @param status - 工具卡状态。
 * @param theme - 主题。
 * @returns 语义色值。
 */
export declare function toolStatusColor(status: ToolRunStatus, theme: RivetTheme): string;
/** 字形选项（仅影响 running 态）。 */
export interface ToolStatusGlyphOptions {
    /** 动画帧序号；提供时 running 用动画帧而非静态 glyph。 */
    tick?: number;
    /** 覆盖静态 running glyph（live 卡 ●）。 */
    idleGlyph?: string;
}
/**
 * 状态 → 字形（running 支持动画帧；负 tick 归一化到帧池）。
 * @param status - 工具卡状态。
 * @param ascii - 是否 ASCII 降级轨（错误 x、动画四帧）。
 * @param opts - running 态字形选项。
 * @returns 单字符字形。
 */
export declare function toolStatusGlyph(status: ToolRunStatus, ascii: boolean, opts?: ToolStatusGlyphOptions): string;
