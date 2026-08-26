import type { RivetTheme } from '../theme.js';
/** 审批卡键位行（与 handleKey 的 y/n/a/t/esc 对齐；≤60 列不截断）。 */
export declare const APPROVAL_KEY_HINTS = "[y] \u5141\u8BB8 [n] \u62D2\u7EDD [t] \u8BB0\u4F4F\u6B64\u5DE5\u5177 [a] \u5168\u653E\u884C [esc] \u53D6\u6D88";
/** formatApprovalCard 的渲染输入。 */
export interface FormatApprovalCardInput {
    /** 终端列数（轨线外宽 = columns）。 */
    columns: number;
    /** 待审批工具名。 */
    toolName: string;
    /** 审批原因（展示在提示行）。 */
    reason?: string;
    /** formatPermissionDiff 产出；null/缺省 = 盲批提示。 */
    diffLines?: readonly string[] | null;
    /** 紧凑：不渲染 diff 体，只保留提示 + 键位。 */
    compact?: boolean;
}
/**
 * 圆角轨包裹一块 live 内容（审批卡 / 提问卡共用）。
 * @param columns - 外宽。
 * @param title - 顶轨内嵌标题（纯文本）。
 * @param body - 已着色的内容行。
 * @param borderColor - 轨线颜色。
 * @returns 顶轨 + body + 底轨；columns < 4 时仅 body。
 */
export declare function formatRailsBlock(columns: number, title: string, body: readonly string[], borderColor: string): string[];
/**
 * 渲染审批卡：顶轨「审批 · 工具名」+ 提示/diff + 键位 + 底轨。
 * @param input - 列数、工具名、可选原因/diff、是否紧凑。
 * @param theme - 当前主题（轨线与提示用 warning）。
 * @returns ANSI 行数组；columns ≤ 0 返回空数组。
 */
export declare function formatApprovalCard(input: FormatApprovalCardInput, theme: RivetTheme): string[];
