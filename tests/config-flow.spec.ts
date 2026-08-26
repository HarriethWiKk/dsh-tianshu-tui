/**
 * config-flow — /config 投影装配与通知开关（不碰真实 home）。
 */
import { describe, expect, it, vi } from 'vitest'
import { loadConfigProjection } from '../src/ui/config-flow.js'

describe('loadConfigProjection', () => {
  it('三服务全缺仍返回终端段（不再 null）', async () => {
    const p = await loadConfigProjection({
      reflect: { get: () => undefined },
      prefs: {},
      env: { PATH: '/bin' },
    })
    expect(p.settings).toEqual([])
    expect(p.permission).toBeNull()
    expect(p.credentials).toEqual([])
    expect(p.tui).toEqual({ notifyOs: true, notifyLocked: false, compactMode: false })
  })

  it('compactMode 写入终端段', async () => {
    const p = await loadConfigProjection({
      reflect: { get: () => undefined },
      prefs: {},
      env: { PATH: '/bin' },
      compactMode: true,
    })
    expect(p.tui?.compactMode).toBe(true)
  })

  it('settings/permission 投影 + prefs 关通知', async () => {
    const p = await loadConfigProjection({
      reflect: {
        get: (name: string) => {
          if (name === 'settings') return { describe: () => [{ ns: 'model', value: 'deepseek' }] }
          if (name === 'permission') return { names: ['ask'], current: () => 'ask' }
          return undefined
        },
      },
      prefs: { notifyOs: false },
      env: { PATH: '/bin' },
    })
    expect(p.settings).toEqual([{ ns: 'model', value: 'deepseek' }])
    expect(p.permission).toEqual({
      options: [{ value: 'ask', name: 'ask' }],
      currentValue: 'ask',
    })
    expect(p.tui?.notifyOs).toBe(false)
  })

  it('credentials.describe 填凭据；中途 abort 保持空凭据', async () => {
    const describe = vi.fn(async () => ({ configured: true, source: 'env', writable: true }))
    const filled = await loadConfigProjection({
      reflect: { get: (name: string) => name === 'credentials' ? { describe } : undefined },
      prefs: {},
      env: { PATH: '/bin' },
    })
    expect(filled.credentials).toEqual([
      { ref: 'DEEPSEEK_API_KEY', configured: true, writable: true, source: 'env' },
    ])

    const aborted = await loadConfigProjection({
      reflect: { get: (name: string) => name === 'credentials' ? { describe } : undefined },
      prefs: {},
      env: { PATH: '/bin' },
      shouldAbort: () => true,
    })
    expect(aborted.credentials).toEqual([])
  })

  it('credentials describe 抛错 → 空凭据不崩溃', async () => {
    const p = await loadConfigProjection({
      reflect: {
        get: (name: string) => name === 'credentials'
          ? { describe: async () => { throw new Error('boom') } }
          : undefined,
      },
      prefs: {},
      env: { PATH: '/bin' },
    })
    expect(p.credentials).toEqual([])
    expect(p.tui).toBeDefined()
  })
})
