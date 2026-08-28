import type { RivetTheme } from '../theme.js';
/**
 * 识别 agent 错误文本，返回恢复操作指引（echoWarn hint 尾注的数据源）。
 * @param message - 错误全文（大小写不敏感；鉴权/超长/超时三族 + 兜底）。
 * @returns 一行可操作的恢复指引。
 */
export declare function errorRecoveryHint(message: string): string;
/**
 * 警告行 + 可选恢复指引尾随行的着色组装（echoWarn 与 renderLive 错误落底共用）：
 * 警告走 warning 色，尾随行 dim 色 `  ↳ <hint>`（缩进对齐既有「  · 」多行指引风格）。
 * @param text - 警告正文（可多行）。
 * @param hint - 恢复指引；undefined 时只有警告行。
 * @param theme - 取 warning/dim 两色。
 * @returns 着色后的 1-2 行 ANSI 文本。
 */
export declare function formatWarnWithHint(text: string, hint: string | undefined, theme: Pick<RivetTheme, 'warning' | 'dim'>): string;
