import type { RivetTheme } from '../theme.js';
/**
 * 键位提示段 → 审批卡键位行：首 token 加方括号（'y 允许' → '[y] 允许'）。
 * 段来源是 approval 域动作的 footerHint 投影（actions/projections；footer 同源）。
 * @param segments - 投影提示段（注册序即决策梯度序）。
 */
export declare function approvalKeyHintLine(segments: readonly string[]): string;
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
    /** 键位提示段（action registry 投影；缺省用内置文案）。 */
    keyHintSegments?: readonly string[];
    /** 拒绝反馈输入态（f 键已进入）：键位行下追加反馈提示行。 */
    feedback?: boolean;
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
 * @param input - 列数、工具名、可选原因/diff/键位段/反馈态、是否紧凑。
 * @param theme - 当前主题（轨线与提示用 warning）。
 * @returns ANSI 行数组；columns ≤ 0 返回空数组。
 */
export declare function formatApprovalCard(input: FormatApprovalCardInput, theme: RivetTheme): string[];
