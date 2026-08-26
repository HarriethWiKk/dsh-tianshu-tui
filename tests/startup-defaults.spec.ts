/**
 * startup-defaults — 会话应用 vs 启动默认：纯函数契约。
 *
 * - splitDefaultFlag：末尾 default 剥掉并 persist=true
 * - echoSessionOnly / echoSavedDefault：文案必须点名本会话或启动默认
 */
import { describe, expect, it } from 'vitest'
import {
  echoSavedDefault,
  echoSessionOnly,
  effortSelection,
  splitDefaultFlag,
} from '../src/startup-defaults.js'

describe('splitDefaultFlag', () => {
  it('空串：rest 空、不 persist', () => {
    expect(splitDefaultFlag('')).toEqual({ rest: '', persist: false })
    expect(splitDefaultFlag('   ')).toEqual({ rest: '', persist: false })
  })

  it('单独 default：保存当前为默认', () => {
    expect(splitDefaultFlag('default')).toEqual({ rest: '', persist: true })
    expect(splitDefaultFlag('  default  ')).toEqual({ rest: '', persist: true })
  })

  it('末尾 default 剥掉，前面参数保留', () => {
    expect(splitDefaultFlag('paper default')).toEqual({ rest: 'paper', persist: true })
    expect(splitDefaultFlag('openai/gpt-5 high default')).toEqual({ rest: 'openai/gpt-5 high', persist: true })
    expect(splitDefaultFlag('minimal default')).toEqual({ rest: 'minimal', persist: true })
  })

  it('中间或非末尾 default 不当标志', () => {
    expect(splitDefaultFlag('default-theme')).toEqual({ rest: 'default-theme', persist: false })
    expect(splitDefaultFlag('default paper')).toEqual({ rest: 'default paper', persist: false })
  })
})

describe('effortSelection', () => {
  it('auto 清除 reasoningEffort；其它档写入', () => {
    const base = { provider: 'p', model: 'm' }
    expect(effortSelection(base, 'auto')).toEqual({ provider: 'p', model: 'm' })
    expect(effortSelection(base, 'max')).toEqual({ provider: 'p', model: 'm', reasoningEffort: 'max' })
  })
})

describe('echo 文案点名本会话 / 启动默认', () => {
  it('仅本会话：含「仅本会话」且提示如何写默认', () => {
    expect(echoSessionOnly('theme', 'paper')).toContain('仅本会话')
    expect(echoSessionOnly('theme', 'paper')).toContain('/theme default')
    expect(echoSessionOnly('model', 'openai/gpt-5')).toContain('仅本会话')
    expect(echoSessionOnly('model', 'openai/gpt-5')).toContain('/model default')
    expect(echoSessionOnly('effort', 'max')).toContain('仅本会话')
    expect(echoSessionOnly('effort', 'max')).toContain('/effort default')
    expect(echoSessionOnly('density', '紧凑')).toContain('仅本会话')
    expect(echoSessionOnly('density', '紧凑')).toContain('/density default')
    expect(echoSessionOnly('preset', 'minimal')).toContain('仅本会话')
  })

  it('写默认：主题说重启，模型/effort/preset 说新会话', () => {
    expect(echoSavedDefault('theme', 'paper')).toContain('已设为默认主题：paper')
    expect(echoSavedDefault('theme', 'paper')).toContain('重启后仍生效')
    expect(echoSavedDefault('model', 'openai/gpt-5')).toContain('已设为默认模型：openai/gpt-5')
    expect(echoSavedDefault('model', 'openai/gpt-5')).toContain('新会话起始生效')
    expect(echoSavedDefault('effort', 'max')).toContain('已设为默认推理等级：max')
    expect(echoSavedDefault('effort', 'max')).toContain('新会话起始生效')
    expect(echoSavedDefault('preset', 'minimal')).toContain('已设为默认预设：minimal')
    expect(echoSavedDefault('density', '紧凑')).toContain('已设为默认密度：紧凑')
  })
})
