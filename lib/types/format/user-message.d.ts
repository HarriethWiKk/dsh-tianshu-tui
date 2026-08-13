/**
 * T9 格式化函数 — 用户消息与转向消息共用「说话人导轨」制式。
 *
 * 源出 .rivet/tui-source/tui/format/user-message.ts（Apache-2.0 来源，见
 * LICENSE/NOTICE/SOURCE-MAP.md）。本文件为 dsh-tui 移植的基础版，无天枢耦合。
 *
 * 渲染结构（导轨制式，marker + 颜色承担说话人识别）：
 * ▌ 消息首行             (markerColor + bold 导轨；regular 中性正文)
 * ▌ 消息后续行           (同一导轨；regular 中性正文)
 * ▌                       (空行只保留导轨)
 *
 * 说话人：
 * - user：marker `❯`/`▌` + userColor（formatUserMessage）
 * - steer：marker `>>`/`➤` + warning（formatSteerMessage，见 steer-message.ts）
 */
import type { RivetTheme } from '../theme.js';
/** formatUserMessage 的渲染输入。 */
export interface FormatUserMessageInput {
    /** 消息文本内容 */
    content: string;
    /** 终端宽度（列数） */
    width: number;
    /** 消息时间戳（Unix epoch ms）；提供且宽度足够时首行附 [HH:MM]。 */
    timestamp?: number;
}
/** 说话人导轨渲染输入（user/steer 共用；marker 与 markerColor 由调用方给出）。 */
export interface FormatRailedMessageInput {
    content: string;
    width: number;
    /** 说话人导轨 marker 字符（ascii 轨由调用方给出 fallback）。 */
    marker: string;
    /** marker 着色（语义 token，如 theme.userColor / theme.warning）。 */
    markerColor: string;
    /** 消息时间戳（Unix epoch ms）；提供且宽度足够时首行附 [HH:MM]。 */
    timestamp?: number;
}
/**
 * 消息时间戳 → `[HH:MM]` 显示段（本地时区）。
 * @param ms - Unix epoch 毫秒。
 * @returns 形如 `[14:32]` 的显示文本。
 */
export declare function formatTimestamp(ms: number): string;
/**
 * 渲染一条「说话人导轨」消息：markerColor+bold 导轨前缀 + 中性正文。
 * 首行与正文同行；后续行维持同一导轨，空行只保留导轨。
 * 正文按 width 折叠（导轨前缀宽度计入每行预算；CJK 宽字符按显示宽度度量）。
 * 提供 timestamp 且正文宽度足够时，首行最后一块后附 `[HH:MM]`（宽度预算
 * 从首行折叠扣除，窄宽隐藏不破版）。
 * @param input - 文本、宽度、marker 与 markerColor。
 * @param theme - 当前主题（正文用 assistantColor 中性色；时间戳用 secondary）。
 * @returns 渲染行数组（每行含导轨前缀）。
 */
export declare function formatRailedMessage(input: FormatRailedMessageInput, theme: RivetTheme): string[];
/**
 * 渲染用户消息为 scrollback 行：userColor `❯`/`▌` 导轨 + 中性正文。
 * @param input - 用户消息文本与宽度。
 * @param theme - 当前主题（marker 用 userColor）。
 * @returns 渲染行数组（每行含导轨前缀）。
 */
export declare function formatUserMessage(input: FormatUserMessageInput, theme: RivetTheme): string[];
