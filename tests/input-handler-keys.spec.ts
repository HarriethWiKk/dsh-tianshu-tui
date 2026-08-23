import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { InputHandler } from '../src/engine/input-handler.js'

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
