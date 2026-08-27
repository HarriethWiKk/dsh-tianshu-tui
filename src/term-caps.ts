/**
 * 终端能力探测 — Windows legacy conhost（经典控制台）识别与降级开关。
 *
 * 背景：PowerShell/cmd 直启的经典 conhost（非 Windows Terminal）配中文点阵
 * 字体时，East-Asian Ambiguous 字符与 GBK 框线字符均按 2 列渲染，且大量
 * Unicode 字形（✶ ◐ ╭ ❯…）缺失显示为 tofu。LiveEngine 的相对光标回顶依赖
 * 逐行宽度估算，估算与实际渲染错位 → 回顶欠擦 → 旧帧逐帧堆叠进 scrollback。
 * 本模块提供判定信号，width.ts / 字形降级据此选择保守档。
 */

import chalk from 'chalk'

/**
 * 是否运行在 Windows legacy conhost（经典控制台）。
 * 启发式（supports-hyperlinks 等库同款）：win32 且无任何现代终端标记——
 * Windows Terminal 设 WT_SESSION、VS Code 设 TERM_PROGRAM、ConEmu 设
 * ConEmuANSI、mintty/Git Bash 设 TERM。全无 → 经典 conhost。
 * @param env - 环境变量（测试注入用，缺省 process.env）。
 * @param platform - 平台标识（测试注入用，缺省 process.platform）。
 * @returns 是否为经典 conhost。
 */
export function isLegacyWindowsConsole(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== 'win32') return false
  if (env.WT_SESSION || env.TERM_PROGRAM || env.ConEmuANSI) return false
  if (env.TERM) return false
  return true
}

/** 已知支持 OSC52 系统剪贴板写入的终端程序（TERM_PROGRAM 白名单）。 */
const OSC52_TERM_PROGRAMS = new Set(['iTerm.app', 'WezTerm', 'kitty', 'Hyper', 'vscode'])

/**
 * 是否支持 OSC52（写系统剪贴板）。
 * 启发式：TERM_PROGRAM 白名单命中 → 支持；Apple Terminal 显式排除
 * （macOS Terminal.app 不写 OSC52，即使 TERM 是 xterm 兼容）；VTE 系
 * （gnome-terminal 等设 VTE_VERSION）与 GNU screen（设 STY）不支持；
 * 内核 VT（TERM=linux）无剪贴板概念。其余按 TERM 兼容性
 * （xterm/screen/tmux 系大多支持）。
 * @param env - 环境变量（测试注入用，缺省 process.env）。
 * @returns 是否支持 OSC52。
 */
export function supportsOsc52(env: NodeJS.ProcessEnv = process.env): boolean {
  const prog = env.TERM_PROGRAM
  if (prog === 'Apple_Terminal') return false
  if (prog !== undefined && OSC52_TERM_PROGRAMS.has(prog)) return true
  // VTE 系（gnome-terminal 等）不写 OSC52 剪贴板；GNU screen 默认不转发；
  // 内核 VT 无剪贴板——均按不支持处理，避免复制静默失败（P1-1 反例）。
  if (env.VTE_VERSION !== undefined) return false
  if (env.STY !== undefined) return false
  const term = env.TERM ?? ''
  if (term === 'linux') return false
  return /(^|-)xterm|screen|tmux/i.test(term)
}

/**
 * locale 是否 CJK（zh/ja/ko 前缀）。env 显式值与 Intl（OS locale）任一命中即
 * 判定 CJK——与上游 Tianshu-Tui 语义一致。仅 env 优先会把「中文 Windows 配
 * 英文 LANG」（MSYS 直跑 bash.exe 常见）错判为 non-CJK，导致 legacy conhost
 * 宽度档位误选、逐行宽度估算错位。
 * @param env - 环境变量（测试注入用，缺省 process.env）。
 * @returns 是否为 CJK locale。
 */
export function isCjkLocale(env: NodeJS.ProcessEnv = process.env): boolean {
  const candidates = [env.LC_ALL ?? '', env.LC_CTYPE ?? '', env.LANG ?? '']
  try {
    candidates.push(new Intl.DateTimeFormat().resolvedOptions().locale ?? '')
  } catch { /* ICU 缺失（WSL/Alpine 精简版）时仅用 env */ }
  return candidates.some(l => /^(zh|ja|ko)/i.test(l.trim()))
}

let legacyCjkCache: boolean | null = null

/**
 * legacy conhost 且 CJK 环境（宽度 full 档的触发条件）。进程内缓存一次。
 * @returns 是否命中 legacy CJK conhost。
 */
export function isLegacyCjkConsole(): boolean {
  if (legacyCjkCache === null) {
    legacyCjkCache = isLegacyWindowsConsole() && isCjkLocale()
  }
  return legacyCjkCache
}

let asciiGlyphCache: boolean | null = null

/**
 * 是否使用 ASCII 安全字形（spinner/thinking/工具卡的月相、星形等装饰字形）。
 * 原有门槛 chalk.level<3 保留；legacy conhost 无条件降级（字形缺失 + 宽度
 * 不可预测，与颜色能力无关）。env `RIVET_ASCII_UI=0/1` 显式覆盖。
 * @param env - 环境变量（测试注入用，缺省 process.env）。
 * @returns 是否降级为 ASCII 字形。
 */
export function useAsciiGlyphs(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.RIVET_ASCII_UI === '1') return true
  if (env.RIVET_ASCII_UI === '0') return false
  if (asciiGlyphCache === null) {
    /* v8 ignore next -- 测试进程非 TTY，chalk.level<3 恒短路；右侧为高色深终端专属场景 */
    asciiGlyphCache = chalk.level < 3 || isLegacyWindowsConsole()
  }
  return asciiGlyphCache
}

let asciiBorderCache: boolean | null = null

/**
 * 是否使用 ASCII 边框（输入框 chrome）。与字形开关分离：低色深终端
 * （tmux/screen 的 chalk.level 2）渲染 Unicode 框线完全正常，边框降级只在
 * 框线宽度不可预测的 legacy conhost 触发。env `RIVET_ASCII_UI=0/1` 显式覆盖。
 * @param env - 环境变量（测试注入用，缺省 process.env）。
 * @returns 是否降级为 ASCII 边框。
 */
export function useAsciiBorders(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.RIVET_ASCII_UI === '1') return true
  if (env.RIVET_ASCII_UI === '0') return false
  if (asciiBorderCache === null) {
    asciiBorderCache = isLegacyWindowsConsole()
  }
  return asciiBorderCache
}

/** 测试钩子：重置探测缓存。 */
export function resetTermCapsCache(): void {
  legacyCjkCache = null
  asciiGlyphCache = null
  asciiBorderCache = null
}

/**
 * 终端是否支持 kitty 键盘增强协议（progressive enhancement：应用推送 flag 后
 * 终端才以 CSI u 上报修饰键——Ctrl+Enter 的 CSI 13;5u 只有推送 flag 1 后可达）。
 * 启发式白名单：kitty（TERM 前缀 / KITTY_WINDOW_ID / TERM_PROGRAM）、ghostty、
 * foot、contour 原生支持应用推送；WezTerm 默认忽略推送（需用户开启
 * enable_kitty_keyboard，env 不可知）故不入列——其已开启用户走
 * RIVET_KITTY_KEYBOARD=1 显式覆盖。tmux/screen（TMUX/STY）透传取决于版本与
 * extended-keys 配置，保守排除。env `RIVET_KITTY_KEYBOARD=0/1` 显式覆盖。
 * 判定只决定「推送与否 + keymap 行显隐」：不支持的终端忽略推送序列、永不回
 * CSI u，ctrl_return 天然静默（无错误输入路由）。
 * @param env - 环境变量（测试注入用，缺省 process.env）。
 * @returns 是否支持 kitty 键盘增强推送。
 */
export function supportsKittyKeyboard(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.RIVET_KITTY_KEYBOARD === '1') return true
  if (env.RIVET_KITTY_KEYBOARD === '0') return false
  if (env.TMUX !== undefined || env.STY !== undefined) return false
  if (env.KITTY_WINDOW_ID !== undefined) return true
  const prog = env.TERM_PROGRAM ?? ''
  if (prog === 'kitty' || prog === 'ghostty') return true
  const term = env.TERM ?? ''
  return /^xterm-kitty|^xterm-ghostty|^foot|^contour/.test(term)
}

/**
 * kitty 键盘增强推送序列（flag 1 = 消歧义位：Ctrl/Alt+Enter 等以 CSI u 上报，
 * 普通可打印键与无修饰 Enter/Tab/Backspace 保持传统字节）。不支持的终端返回
 * ''（序列本就会被忽略，但零写出更干净）；与 dispose 的 pop 同源判定。
 * @param env - 环境变量（测试注入用，缺省 process.env）。
 * @returns 推送序列或不支持时的空串。
 */
export function kittyKeyboardPushSeq(env: NodeJS.ProcessEnv = process.env): string {
  return supportsKittyKeyboard(env) ? '\x1B[>1u' : ''
}

/**
 * kitty 键盘增强弹出序列（退出时恢复终端键盘编码；与 push 成对）。
 * @param env - 环境变量（测试注入用，缺省 process.env）。
 * @returns 弹出序列或不支持时的空串。
 */
export function kittyKeyboardPopSeq(env: NodeJS.ProcessEnv = process.env): string {
  return supportsKittyKeyboard(env) ? '\x1B[<u' : ''
}
