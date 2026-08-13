/**
 * 工具家族着色分类 — Phase 7.2。
 *
 * 与 tool-meta.ts 的 `getToolFamily`（read/write/run/find/other，服务于
 * 截断/展开策略与 diff 分支）并存但不重叠：本模块的家族只决定标题着色，
 * 是纯投影的「工具名 → 功能域」映射，不产生、不写回任何事件。
 *
 * 五色家族（任务规格）：文件操作蓝 / shell 黄 / 搜索绿 / 编辑紫 / 网络青。
 * 家族映射到主题的语义 token（而非硬编码 hex）——跨主题与 16 色 fallback
 * 轨都稳定，色相随主题漂移是设计内的（同 makeToolColor 的惯例）。
 */
/** 着色家族：决定工具卡片标题的配色。 */
export type ToolFamily = 'file' | 'shell' | 'search' | 'edit' | 'network' | 'other';
/**
 * 家族着色所需的最小主题契约（结构性类型：RivetTheme 满足它）。
 * toolShell 在 RivetTheme 接口上未声明（属于 ColorSet，运行时经 spread
 * 存在），这里只按需声明，避免为着色扩主题接口。
 */
export interface FamilyTheme {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    dim: string;
    toolShell?: string;
}
/**
 * 工具名 → 着色家族；未知名工具落 `other`。
 * @param toolName - 工具名（模型原样产出）。
 * @returns 着色家族标签。
 */
export declare function getToolColorFamily(toolName: string): ToolFamily;
/**
 * 工具家族的标题配色（ANSI 色值）。
 * @param toolName - 工具名（模型原样产出）。
 * @param theme - 当前主题（RivetTheme 结构满足 FamilyTheme 最小契约）；家族经语义 token 映射，跨主题稳定。
 * @returns 家族色的色值字符串（hex 或 fallback 命名色）。
 */
export declare function toolFamilyColor(toolName: string, theme: FamilyTheme): string;
