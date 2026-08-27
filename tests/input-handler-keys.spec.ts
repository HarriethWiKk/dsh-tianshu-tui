import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { InputHandler, type KeyPress } from '../src/engine/input-handler.js'

describe('Alt+控制字符（ESC + 控制码组合）', () => {
  function makeStdin(): NodeJS.ReadStream & Record<string, unknown> {
    const stdin = new EventEmitter() as unknown as NodeJS.ReadStream & Record<string, unknown>
    stdin.isTTY = false
    stdin.setRawMode = vi.fn()
    stdin.resume = vi.fn()
    stdin.setEncoding = vi.fn()
    stdin.pause = vi.fn()
    return stdin
  }

  it('ESC+DEL → meta+backspace（原先落 unknown，按名路由收不到）', async () => {
    const stdin = makeStdin()
    const handler = new InputHandler({ stdin, mode: 'input' })
    const keys: Array<{ name: string; meta: boolean }> = []
    handler.onAnyKey((key) => { keys.push({ name: key.name, meta: key.meta }) })
    stdin.emit('data', '\x1b\x7f')
    await new Promise(resolve => setTimeout(resolve, 100)) // 越过孤 ESC 超时窗（同 chunk 应立即解析）
    expect(keys).toEqual([{ name: 'backspace', meta: true }])
  })

  it('Alt+可打印字符不受影响：ESC+f → unknown + meta + shift=false', async () => {
    const stdin = makeStdin()
    const handler = new InputHandler({ stdin, mode: 'input' })
    const keys: Array<{ name: string; char: string; meta: boolean; shift: boolean }> = []
    handler.onAnyKey((key) => { keys.push({ name: key.name, char: key.char, meta: key.meta, shift: key.shift }) })
    stdin.emit('data', '\x1bf')
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(keys).toEqual([{ name: 'unknown', char: 'f', meta: true, shift: false }])
  })
})

describe('Kitty CSI u 修饰 Enter 解码', () => {
  function makeStdin(): NodeJS.ReadStream & Record<string, unknown> {
    const stdin = new EventEmitter() as unknown as NodeJS.ReadStream & Record<string, unknown>
    stdin.isTTY = false
    stdin.setRawMode = vi.fn()
    stdin.resume = vi.fn()
    stdin.setEncoding = vi.fn()
    stdin.pause = vi.fn()
    return stdin
  }

  function collect(stdin: NodeJS.ReadStream): Array<Pick<KeyPress, 'name' | 'ctrl' | 'meta' | 'shift'>> {
    const keys: Array<Pick<KeyPress, 'name' | 'ctrl' | 'meta' | 'shift'>> = []
    new InputHandler({ stdin, mode: 'input' }).onAnyKey((key) => {
      keys.push({ name: key.name, ctrl: key.ctrl, meta: key.meta, shift: key.shift })
    })
    return keys
  }

  it('CSI 13;5u（Ctrl+Enter）→ ctrl_return', async () => {
    const stdin = makeStdin()
    const keys = collect(stdin)
    stdin.emit('data', '\x1B[13;5u')
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(keys).toEqual([{ name: 'ctrl_return', ctrl: true, meta: false, shift: false }])
  })

  it('其他修饰 Enter 不变：13;2u → return+shift；13;3u → return+meta；13;1u/13u → return', async () => {
    const stdin = makeStdin()
    const keys = collect(stdin)
    stdin.emit('data', '\x1B[13;2u')
    stdin.emit('data', '\x1B[13;3u')
    stdin.emit('data', '\x1B[13;1u')
    stdin.emit('data', '\x1B[13u')
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(keys).toEqual([
      { name: 'return', ctrl: false, meta: false, shift: true },
      { name: 'return', ctrl: false, meta: true, shift: false },
      { name: 'return', ctrl: false, meta: false, shift: false },
      { name: 'return', ctrl: false, meta: false, shift: false },
    ])
  })

  it('release 事件（13;5:3u）只消费不派发', async () => {
    const stdin = makeStdin()
    const keys = collect(stdin)
    stdin.emit('data', '\x1B[13;5:3u')
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(keys).toEqual([])
  })
})
