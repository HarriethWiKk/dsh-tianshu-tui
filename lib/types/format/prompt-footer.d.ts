import type { RivetTheme } from '../theme.js';
import type { FooterInfoLevel } from '../prefs.js';
import type { FormatGlanceBarInput } from './glance-bar.js';
/** 提示轮播周期（ms）；对齐 kimi-code footer tips 10s 旋转。 */
export declare const FOOTER_TIP_ROTATE_MS = 10000;
/** 轮播 tip：文本 + 权重（高权重更常出现）。 */
export interface FooterTip {
    text: string;
    weight: number;
}
/**
 * 轮播提示表（纯数据）：基础操作高频（weight 3），新功能/配置类 weight 2，
 * 其余 1。新增命令时在此补一条即可让用户在空闲态可发现。
 */
export declare const FOOTER_TIPS: readonly FooterTip[];
/** 按序号取轮播提示（确定性；index 取模权重序列）。 */
export declare function footerTipForIndex(index: number): string;
/** 当前轮播序号：now 按 FOOTER_TIP_ROTATE_MS 分片。 */
export declare function footerTipIndex(now?: number): number;
/** formatFooterInfo 的渲染输入（行 1 输入 + 档位 + 行 2 指标数据源）。 */
export interface FormatFooterInfoInput extends FormatPromptFooterInput {
    /** 信息密度档位：full 两行 / compact 仅状态行 / off 全关（缺省 full）。 */
    level?: FooterInfoLevel;
    /** 指标段（行 2 数据源）；缺省或空 metrics 不渲染行 2。 */
    metrics?: FormatGlanceBarInput;
}
/**
 * 按档位组装分层 footer：行 1 状态行（mode + 提示 + 状态右段），行 2 指标行。
 * full 两行 / compact 仅行 1 / off 空。对齐 kimi-code footer 的两行分层：
 * 状态（mode/model/API/git）与指标（context/tokens/cost）分置，指标行弱化可整体摘除。
 * @param input - 行 1 输入、档位与行 2 指标数据。
 * @param theme - 当前主题。
 * @returns 0-2 行 ANSI；每行显示宽度 ≤ width。
 */
export declare function formatFooterInfo(input: FormatFooterInfoInput, theme: RivetTheme): string[];
/** formatPromptFooter 的渲染输入。 */
export interface FormatPromptFooterInput {
    width: number;
    /** plan 模式已生效（mode 段渲染 [plan]）。 */
    planActive?: boolean;
    /** plan 切换待请求边界落地（渲染 [plan…]，优先于 planActive）。 */
    planPending?: boolean;
    /** always-approve 生效（mode 段渲染 [auto]）。 */
    alwaysApprove?: boolean;
    /** 审批挂起：快捷键换成审批决策键位（y/p/t/a/n/f/esc），避免仍提示「Enter 发送」。 */
    approvalPending?: boolean;
    /** 检查类面板打开：提示 esc 关闭。 */
    inspectOpen?: boolean;
    /** 审批挂起提示段覆盖（action registry 投影，见 actions/projections）；缺省用内置文案。 */
    approvalHints?: readonly string[];
    /** 检查面板提示段覆盖（同上）；缺省用内置文案。 */
    inspectHints?: readonly string[];
    /** 右侧状态段（token/模型/API 等）；右对齐合并进同一行，放不下从后丢段。 */
    rightSegments?: readonly string[];
    /**
     * 轮播序号（空闲态提示用；缺省按当前时间分片——测试注入固定值保证确定）。
     * 上下文态（审批/检查面板）忽略此参数，始终显示操作提示。
     */
    tipIndex?: number;
}
/**
 * 渲染底部 footer：mode 段 + 快捷键提示段，右侧状态段右对齐合并进同一行。
 * 空闲态提示按 tipIndex 轮播（10s 一片）；审批/检查面板等上下文态固定操作提示。
 * @param input - 宽度、模式徽标、右侧状态段与轮播序号。
 * @param theme - 当前主题（plan/auto 徽标走 warning/error；其余用雾蓝 chrome）。
 * @returns 单行 ANSI；任何宽度下 ≤ width。
 */
export declare function formatPromptFooter(input: FormatPromptFooterInput, theme: RivetTheme): string[];
