/**
 * agent-scope-service — isolate 服务优先从 agent 面读，host 回退。
 */
import { describe, expect, it, vi } from 'vitest'
import { scopedService, serviceForAgent } from '../src/adapter/agent-scope-service.js'

describe('serviceForAgent', () => {
  it('无 agent 时回退 host reflect', () => {
    const compact = { compactIfNeeded: vi.fn() }
    const ctx = { reflect: { get: vi.fn((name: string) => name === 'compact' ? compact : undefined) } }
    expect(serviceForAgent(ctx, null, 'compact')).toBe(compact)
  })

  it('agent 面 serviceFor 命中则不用 host', () => {
    const isolated = { compactIfNeeded: vi.fn() }
    const host = { compactIfNeeded: vi.fn() }
    const ctx = {
      reflect: {
        get: vi.fn((name: string) => {
          if (name === 'agentPresets') return { serviceFor: () => isolated }
          if (name === 'compact') return host
          return undefined
        }),
      },
    }
    expect(serviceForAgent(ctx, { ctx: {} }, 'compact')).toBe(isolated)
  })

  it('agent 面没有则回退 host', () => {
    const host = { set: vi.fn() }
    const ctx = {
      reflect: {
        get: vi.fn((name: string) => {
          if (name === 'agentPresets') return { serviceFor: () => undefined }
          if (name === 'planMode') return host
          return undefined
        }),
      },
    }
    expect(serviceForAgent(ctx, { ctx: {} }, 'planMode')).toBe(host)
  })

  it('scopedService 按 sessionId 取 agent 再读 isolate', () => {
    const isolated = { set: vi.fn() }
    const agent = { ctx: {} }
    const host = {
      agents: { get: vi.fn((id: string) => id === 's1' ? agent : undefined) },
      reflect: {
        get: vi.fn((name: string) => name === 'agentPresets'
          ? { serviceFor: () => isolated }
          : undefined),
      },
    }
    expect(scopedService(host, 's1', 'planMode')).toBe(isolated)
    expect(scopedService(host, null, 'planMode')).toBeUndefined()
  })
})
