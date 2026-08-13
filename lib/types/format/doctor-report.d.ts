import type { RivetTheme } from '../theme.js';
/** 单条诊断检查结果。 */
export interface DoctorCheck {
    name: string;
    status: 'ok' | 'warn' | 'info';
    value: string;
    fixId?: number;
}
/** 可修复项的修复指引。 */
export interface DoctorFix {
    id: number;
    title: string;
    guidance: string;
}
/**
 * 收集终端诊断报告。
 * @param cols 终端列数
 * @param rows 终端行数
 * @param background 终端背景色
 * @param env 环境变量（默认 process.env）
 * @returns 检查结果列表（可修复项带 fixId）。
 */
export declare function collectDoctorReport(cols: number, rows: number, background: string, env?: NodeJS.ProcessEnv): DoctorCheck[];
/** 可修复项清单（与 DoctorCheck.fixId 对应）。 */
export declare const DOCTOR_FIXES: DoctorFix[];
/**
 * 渲染诊断报告为终端行。
 * @param checks - collectDoctorReport 的检查结果。
 * @param theme - 当前主题（状态图标与文字分色）。
 * @returns ANSI 行数组：标题 + 逐项检查 + 可修复项汇总（如有）。
 */
export declare function renderDoctorReport(checks: DoctorCheck[], theme: RivetTheme): string[];
/**
 * 获取修复指引文本。
 * @param fixId - 修复项 id（DoctorCheck.fixId）。
 * @returns 标题 + 指引文本；未知 id 返回 null。
 */
export declare function getDoctorFixGuidance(fixId: number): string | null;
