/**
 * inspect-surface — 检查面板互斥开闭与键分发。
 */
import { describe, expect, it, vi } from 'vitest'
import { InspectSurfaceController } from '../src/controllers/inspect-surface.js'

function makeSurface() {
  const refreshConfig = vi.fn(async () => {})
  const refreshSkills = vi.fn()
  const ensureLsp = vi.fn()
  const echoWarn = vi.fn()
  const schedule = vi.fn()
  const flush = vi.fn()
  const toggleNotify = vi.fn()
  const toggleDensity = vi.fn()
  const moveSkills = vi.fn(() => true)
  const has = new Set<string>()
  const surface = new InspectSurfaceController({
    hasService: name => has.has(name),
    echoWarn,
    refreshConfig,
    refreshSkills,
    ensureLsp,
    schedule,
    flush,
    toggleNotify,
    toggleDensity,
    moveSkills,
  })
  return {
    surface, has, refreshConfig, refreshSkills, ensureLsp, echoWarn,
    schedule, flush, toggleNotify, toggleDensity, moveSkills,
  }
}

describe('InspectSurfaceController', () => {
  it('toggle 打开一项时关掉其余；再 toggle 同一项则全关', async () => {
    const { surface, refreshConfig, schedule } = makeSurface()
    await surface.toggle('config')
    expect(surface.flags()).toEqual({
      config: true, skills: false, status: false, lsp: false, tasks: false,
    })
    expect(refreshConfig).toHaveBeenCalledOnce()
    expect(schedule).toHaveBeenCalledOnce()
    await surface.toggle('config')
    expect(surface.any()).toBe(false)
  })

  it('从 skills 切到 status：只留 status', async () => {
    const { surface, has, echoWarn } = makeSurface()
    has.add('skills')
    await surface.toggle('skills')
    await surface.toggle('status')
    expect(surface.is('skills')).toBe(false)
    expect(surface.is('status')).toBe(true)
    expect(echoWarn).toHaveBeenCalledOnce()
  })

  it('打开 skills/lsp/tasks 走对应副作用', async () => {
    const { surface, refreshSkills, ensureLsp, echoWarn } = makeSurface()
    await surface.toggle('skills')
    expect(refreshSkills).toHaveBeenCalledOnce()
    expect(echoWarn.mock.calls[0]?.[0]).toContain('skills')
    await surface.toggle('lsp')
    expect(ensureLsp).toHaveBeenCalledOnce()
    await surface.toggle('tasks')
    expect(echoWarn.mock.calls.some(c => String(c[0]).includes('任务窗格'))).toBe(true)
  })

  it('dispatch：close / notify / density / skills-move', () => {
    const s = makeSurface()
    s.surface.dispatch({ type: 'close' })
    expect(s.flush).toHaveBeenCalledOnce()
    expect(s.surface.any()).toBe(false)
    s.surface.dispatch({ type: 'notify' })
    expect(s.toggleNotify).toHaveBeenCalledOnce()
    s.surface.dispatch({ type: 'density' })
    expect(s.toggleDensity).toHaveBeenCalledOnce()
    expect(s.flush).toHaveBeenCalledTimes(2)
    s.surface.dispatch({ type: 'skills-move', delta: 1 })
    expect(s.moveSkills).toHaveBeenCalledWith(1)
  })

  it('hide 只关一项；close 全关', async () => {
    const { surface } = makeSurface()
    await surface.toggle('config')
    surface.hide('config')
    expect(surface.is('config')).toBe(false)
    await surface.toggle('lsp')
    surface.close()
    expect(surface.any()).toBe(false)
  })
})
