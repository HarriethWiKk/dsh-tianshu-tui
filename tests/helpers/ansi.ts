/**
 * tests/helpers/ansi.ts — 不变量式渲染测试的共享工具。
 *
 * 技法移植自上游 Tianshu-Tui src/tui/__tests__/format-welcome.test.ts：
 * 不写快照文件，断言「相对结构 + 跨宽度守恒 + 主题推导的颜色基准」——
 * 主题重构/色值调整不碎测试。
 */
import { displayWidth } from '../../src/width.js'

/** 剥离 SGR/CSI 转义后的纯文本（结构断言用）。 */
export function stripSgr(text: string): string {
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
}

/**
 * 提取行内首个前景色 SGR 序列（38;2 truecolor / 256 色 / 3x/9x 基本色）。
 * 颜色断言的基准不从快照来，而从 `firstFg(color('x', theme.token))` 采样——
 * 断言「渲染用了主题的哪个 token」，不断言具体色值。
 */
export function firstFg(text: string): string | null {
  return text.match(/\x1B\[(?:38;2;\d+;\d+;\d+|38;5;\d+|3[0-9]|9[0-9])/)?.[0] ?? null
}

/** 全部行在 cols 列内（displayWidth 守恒；跨宽度不变量的核心谓词）。 */
export function linesFitWidth(lines: readonly string[], cols: number, opts?: { ambiguousAsWide?: boolean }): boolean {
  return lines.every(l => displayWidth(l, { ambiguousAsWide: opts?.ambiguousAsWide }) <= cols)
}
