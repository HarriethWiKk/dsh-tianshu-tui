import type { RivetTheme } from '../theme.js';
/** formatTopBar 的渲染输入。 */
export interface FormatTopBarInput {
    width: number;
    /** 当前工作目录（显示原文，不折叠）。 */
    cwd: string;
    /** git 分支名（可检测时；缺省不渲染分支段）。 */
    branch?: string;
    /** 未提交改动文件数（>0 时分支段追加 ●N；缺省不渲染）。 */
    dirty?: number;
    /** 模型显示名（provider/model；缺省不渲染）。 */
    modelName?: string;
    /** 当前 agent 预设短名（标准 / PTC / 极简 / 创造；缺省不渲染）。 */
    preset?: string;
    /** legacy 终端：📁 降级为 `~`。 */
    ascii?: boolean;
}
/**
 * 渲染顶部栏单行：段顺序 cwd → model → branch(●N)，超宽丢尾段。
 * @param input - 宽度、cwd、可选分支/未提交数/模型/ascii。
 * @param theme - 当前主题（cwd secondary、分支 brandColor、●N warning）。
 * @returns 单行 ANSI；任何宽度下 ≤ width。
 */
export declare function formatTopBar(input: FormatTopBarInput, theme: RivetTheme): string[];
