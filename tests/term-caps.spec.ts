/**
 * term-caps.spec.ts — 终端能力探测（P1-1-3 OSC52 支持启发式 + kitty 键盘增强）。
 *
 * supportsOsc52：白名单 TERM_PROGRAM 优先；Apple Terminal 显式排除
 * （macOS Terminal.app 不写 OSC52）；其余按 TERM 兼容性启发式。
 * supportsKittyKeyboard：kitty 键盘增强推送白名单（Ctrl+Enter 等 CSI u 键位
 * 可达性判定；keymap 投影过滤与启动推送同源）。
 */
import { describe, expect, it } from 'vitest'
import {
  kittyKeyboardPopSeq,
  kittyKeyboardPushSeq,
  supportsKittyKeyboard,
  supportsOsc52,
} from '../src/term-caps.js'

describe('supportsOsc52', () => {
  it('Apple Terminal 不支持（即使 TERM 是 xterm 兼容）', () => {
    expect(supportsOsc52({ TERM_PROGRAM: 'Apple_Terminal', TERM: 'xterm-256color' })).toBe(false)
  })

  it('已知支持 OSC52 的终端程序白名单', () => {
    for (const prog of ['iTerm.app', 'WezTerm', 'kitty', 'Hyper', 'vscode']) {
      expect(supportsOsc52({ TERM_PROGRAM: prog, TERM: 'xterm-256color' })).toBe(true)
    }
  })

  it('无 TERM_PROGRAM 时按 TERM 启发式（xterm/screen/tmux 兼容）', () => {
    expect(supportsOsc52({ TERM: 'xterm-256color' })).toBe(true)
    expect(supportsOsc52({ TERM: 'screen-256color' })).toBe(true)
    expect(supportsOsc52({ TERM: 'tmux-256color' })).toBe(true)
  })

  it('VTE 系终端（gnome-terminal 等，TERM=xterm 兼容）不支持', () => {
    expect(supportsOsc52({ TERM: 'xterm-256color', VTE_VERSION: '6800' })).toBe(false)
  })

  it('GNU screen（STY 会话变量）不支持', () => {
    expect(supportsOsc52({ TERM: 'screen-256color', STY: '1234.pts-0.tty' })).toBe(false)
  })

  it('内核 VT（TERM=linux）不支持', () => {
    expect(supportsOsc52({ TERM: 'linux' })).toBe(false)
  })

  it('未知/受限终端按不支持处理（dumb、空 env）', () => {
    expect(supportsOsc52({ TERM: 'dumb' })).toBe(false)
    expect(supportsOsc52({})).toBe(false)
  })
})

/**
 * supportsKittyKeyboard：kitty 键盘增强推送白名单——kitty/ghostty/foot/contour
 * 原生支持；WezTerm 默认忽略推送（需 enable_kitty_keyboard）不入列；tmux/screen
 * 保守排除；RIVET_KITTY_KEYBOARD=0/1 显式覆盖。push/pop 序列与判定同源。
 */
describe('supportsKittyKeyboard', () => {
  it('白名单终端命中（kitty/ghostty/foot/contour）', () => {
    expect(supportsKittyKeyboard({ TERM: 'xterm-kitty' })).toBe(true)
    expect(supportsKittyKeyboard({ TERM_PROGRAM: 'kitty', TERM: 'xterm-256color' })).toBe(true)
    expect(supportsKittyKeyboard({ KITTY_WINDOW_ID: '1', TERM: 'xterm-256color' })).toBe(true)
    expect(supportsKittyKeyboard({ TERM_PROGRAM: 'ghostty', TERM: 'xterm-ghostty' })).toBe(true)
    expect(supportsKittyKeyboard({ TERM: 'foot' })).toBe(true)
    expect(supportsKittyKeyboard({ TERM: 'contour' })).toBe(true)
  })

  it('WezTerm 不在推送白名单（默认忽略 kitty 键盘推送，需用户显式开启）', () => {
    expect(supportsKittyKeyboard({ TERM_PROGRAM: 'WezTerm', TERM: 'xterm-256color' })).toBe(false)
  })

  it('tmux/screen 内保守排除（透传取决于版本与 extended-keys）', () => {
    expect(supportsKittyKeyboard({ TERM: 'xterm-kitty', TMUX: '/tmp/tmux-1000/default,1,0' })).toBe(false)
    expect(supportsKittyKeyboard({ TERM: 'foot', STY: '1234.pts-0.tty' })).toBe(false)
  })

  it('未知终端按不支持处理（xterm/dumb/空 env）', () => {
    expect(supportsKittyKeyboard({ TERM: 'xterm-256color' })).toBe(false)
    expect(supportsKittyKeyboard({ TERM: 'dumb' })).toBe(false)
    expect(supportsKittyKeyboard({})).toBe(false)
  })

  it('RIVET_KITTY_KEYBOARD=0/1 显式覆盖启发式', () => {
    expect(supportsKittyKeyboard({ TERM: 'xterm-kitty', RIVET_KITTY_KEYBOARD: '0' })).toBe(false)
    expect(supportsKittyKeyboard({ TERM_PROGRAM: 'WezTerm', RIVET_KITTY_KEYBOARD: '1' })).toBe(true)
  })
})

describe('kittyKeyboardPushSeq / kittyKeyboardPopSeq', () => {
  it('支持时推送 flag 1（CSI > 1 u）、退出弹出（CSI < u）；不支持时零写出', () => {
    expect(kittyKeyboardPushSeq({ TERM: 'xterm-kitty' })).toBe('\x1B[>1u')
    expect(kittyKeyboardPopSeq({ TERM: 'xterm-kitty' })).toBe('\x1B[<u')
    expect(kittyKeyboardPushSeq({})).toBe('')
    expect(kittyKeyboardPopSeq({})).toBe('')
  })
})
