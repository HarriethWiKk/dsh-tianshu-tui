/**
 * preset-join — 铸 agent 时 join 官方预设面（create mount / resume 按日志 / child composeFrom）。
 */
import { describe, expect, it, vi } from 'vitest'
import { joinCreateOrWarn, joinPreset, joinResume, presetJoinFacet } from '../src/adapter/preset-join.js'
import { resolvePresetId } from '../src/preset-surface.js'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

describe('presetJoinFacet', () => {
  it('无 reflect / 无服务 / 无 mount → undefined', () => {
    expect(presetJoinFacet({})).toBeUndefined()
    expect(presetJoinFacet({ reflect: { get: () => undefined } })).toBeUndefined()
    expect(presetJoinFacet({ reflect: { get: () => ({ recompose: vi.fn() }) } })).toBeUndefined()
  })

  it('有 mount 则返回 facet', () => {
    const mount = vi.fn()
    const facet = presetJoinFacet({ reflect: { get: (name: string) => name === 'agentPresets' ? { mount } : undefined } })
    expect(facet?.mount).toBe(mount)
  })
})

describe('joinPreset', () => {
  it('无 facet → skipped，不调 mount', async () => {
    const result = await joinPreset({ facet: undefined, agentCtx: {}, mode: 'create' })
    expect(result).toEqual({ skipped: true })
  })

  it('create：mount(agentCtx, preferredId)', async () => {
    const mount = vi.fn(async (_ctx: unknown, id?: string) => ({ id: id ?? 'standard' }))
    const agentCtx = { scope: 1 }
    const result = await joinPreset({
      facet: { mount },
      agentCtx,
      mode: 'create',
      preferredId: 'minimal',
    })
    expect(mount).toHaveBeenCalledWith(agentCtx, 'minimal')
    expect(result).toEqual({ skipped: false, id: 'minimal' })
  })

  it('create：preferredId 空则 mount 不传 id（花名册 defaultId）', async () => {
    const mount = vi.fn(async () => ({ id: 'standard' }))
    await joinPreset({ facet: { mount }, agentCtx: {}, mode: 'create', preferredId: '' })
    expect(mount).toHaveBeenCalledWith({}, undefined)
  })

  it('resume：mount 用 resolvePresetId 折出的 id', async () => {
    const events = [
      { type: 'agent-preset/selected', data: { agentPreset: 'ptc' } },
    ] as unknown as SessionEvent[]
    const id = resolvePresetId('standard', events)
    const mount = vi.fn(async () => ({ id: 'ptc' }))
    const result = await joinPreset({ facet: { mount }, agentCtx: { r: 1 }, mode: 'resume', preferredId: id })
    expect(mount).toHaveBeenCalledWith({ r: 1 }, 'ptc')
    expect(result.id).toBe('ptc')
  })

  it('child：父已 join → composeFrom，不 mount', async () => {
    const composeFrom = vi.fn(() => 'standard')
    const mount = vi.fn(async () => ({ id: 'standard' }))
    const result = await joinPreset({
      facet: { mount, composeFrom },
      agentCtx: { child: 1 },
      mode: 'child',
      parentCtx: { parent: 1 },
    })
    expect(composeFrom).toHaveBeenCalledWith({ child: 1 }, { parent: 1 })
    expect(mount).not.toHaveBeenCalled()
    expect(result).toEqual({ skipped: false, id: 'standard' })
  })

  it('child：父未 join → 回退 mount', async () => {
    const composeFrom = vi.fn(() => undefined)
    const mount = vi.fn(async () => ({ id: 'standard' }))
    const result = await joinPreset({
      facet: { mount, composeFrom },
      agentCtx: {},
      mode: 'child',
      parentCtx: { parent: 1 },
    })
    expect(mount).toHaveBeenCalled()
    expect(result.id).toBe('standard')
  })

  it('joinCreateOrWarn：成功回 id；失败 warn 不抛', async () => {
    const mount = vi.fn(async () => ({ id: 'minimal' }))
    const ctx = { reflect: { get: () => ({ mount }) } }
    expect(await joinCreateOrWarn(ctx, {}, 'minimal', vi.fn())).toBe('minimal')
    const warn = vi.fn()
    const bad = { reflect: { get: () => ({ mount: async () => { throw new Error('gone') } }) } }
    expect(await joinCreateOrWarn(bad, {}, 'gone', warn)).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('gone'))
  })

  it('joinResume：转调 mount', async () => {
    const mount = vi.fn(async () => ({ id: 'ptc' }))
    await joinResume({ reflect: { get: () => ({ mount }) } }, { r: 1 }, 'ptc')
    expect(mount).toHaveBeenCalledWith({ r: 1 }, 'ptc')
  })
})
