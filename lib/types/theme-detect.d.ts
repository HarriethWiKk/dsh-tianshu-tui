/**
 * 终端背景明暗检测 — `theme: "auto"` 支撑。
 *
 * 检测链（先到先得）：
 * 1. OSC 11 查询终端背景色（`ESC ] 11 ; ? BEL`）——现代终端（iTerm2/kitty/
 *    WezTerm/Windows Terminal/Ghostty…）会回 `ESC ] 11 ; rgb:RRRR/GGGG/BBBB`，
 *    按感知亮度判明暗。500ms 超时。
 * 2. COLORFGBG 环境变量兜底（rxvt 系约定 `<fg>;<bg>`，bg 7/15 视为亮）。
 * 3. 全部失败 → 'dark'（终端世界的保守默认）。
 *
 * 内部按需临时开 raw mode 并 resume 读响应，结束后把 raw mode 与暂停/流动
 * 状态恢复为进入时的原状——TUI 已接管 stdin 时也可安全调用。
 * 非 TTY（管道/CI）直接走 env 兜底。
 */
export type TerminalBackground = 'dark' | 'light';
/**
 * 解析 OSC 11 响应中的 rgb 载荷 → 感知亮度 [0,1]。无法解析返回 null。
 * @param response - 终端回包原文（含 `rgb:RRRR/GGGG/BBBB` 片段）。
 * @returns BT.601 感知亮度；无 rgb 载荷返回 null。
 */
export declare function parseOsc11Luminance(response: string): number | null;
/**
 * COLORFGBG 兜底解析（如 "15;0" / "0;15" / "12;8"）。无法判断返回 null。
 * @param env - COLORFGBG 环境变量值（取末段为 bg 索引）。
 * @returns 明暗判定；缺失或非数字 bg 返回 null。
 */
export declare function parseColorFgBg(env: string | undefined): TerminalBackground | null;
/** detectTerminalBackground 选项（流/env 注入均为测试用）。 */
export interface DetectBackgroundOptions {
    /** OSC 11 响应等待上限（毫秒）。默认 500。 */
    timeoutMs?: number;
    /** 注入的 stdin/stdout（测试用）。默认 process 全局流。 */
    stdin?: NodeJS.ReadStream;
    stdout?: NodeJS.WriteStream;
    env?: NodeJS.ProcessEnv;
}
/**
 * 检测终端背景明暗。见模块头注释的检测链。
 * 任何异常（raw mode 失败、流关闭…）都吞掉并落到兜底，绝不让主题检测拦死启动。
 * @param opts - 超时与流/env 注入选项。
 * @returns 明暗判定（检测链全部失败落 'dark'）。
 */
export declare function detectTerminalBackground(opts?: DetectBackgroundOptions): Promise<TerminalBackground>;
/**
 * auto 主题的默认落点：dark → graphite，light → paper。
 * @param background - 终端背景明暗。
 * @returns 对应主题名。
 */
export declare function autoThemeFor(background: TerminalBackground): 'graphite' | 'paper';
