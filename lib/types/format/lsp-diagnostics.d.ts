/**
 * lsp-diagnostics — LSP 诊断的展示纯函数（工具卡徽标 + /lsp 面板段）。
 *
 * 纯函数层：输入诊断视图数组/分组视图，输出 ANSI 行；无 I/O、无时钟。
 * severity 映射与 LSP 语义一致：1 Error / 2 Warning / 3 Info / 4 Hint，
 * 语义色名（error/warning/info）由接线层映射主题色（同 tool-status 模式）。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/format/lsp-diagnostics
 */
import type { LspDiagnosticView } from '../lsp/lsp-bridge.js';
import type { RivetTheme } from '../theme.js';
/** 单文件诊断徽标（工具卡标题行注入；无诊断返回 null 不渲染）。 */
export declare function lspBadgeText(diags: readonly LspDiagnosticView[] | undefined): string | null;
/** severity → 语义色名（接线层映射主题色）。 */
export declare function lspSeverityColorName(severity: LspDiagnosticView['severity']): 'error' | 'warning' | 'info';
/** 面板按文件分组视图（每组含该文件全部诊断）。 */
export interface LspFileGroup {
    /** cwd 相对路径（工具卡同口径）。 */
    file: string;
    /** 该文件诊断（行序）。 */
    diags: readonly LspDiagnosticView[];
}
/**
 * 按文件分组（保持输入顺序，不跨文件重排）。
 * @param entries - 全量诊断视图（可能来自多个文件）。
 * @returns 文件分组列表；空输入返回 []。
 */
export declare function groupLspDiagnostics(entries: readonly LspDiagnosticView[]): LspFileGroup[];
/** 单条诊断行：`line:col · message`（severity 着色）。 */
export declare function lspDiagnosticLine(diag: LspDiagnosticView, theme: RivetTheme): string;
/**
 * /lsp 面板段行序列：每组「文件头行 + 诊断行」；空输入 → 空态行。
 * @param groups - 按文件分组的诊断。
 * @param theme - 主题（着色）。
 * @param available - 是否至少一个语言 server 可用（区分空态文案）。
 * @returns 面板行（ANSI 文本；组合器按需包装）。
 */
export declare function projectLspPanel(groups: readonly LspFileGroup[], theme: RivetTheme, available: boolean): string[];
