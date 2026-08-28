/**
 * 双击布防提示行（format/confirm-hints.ts）— 契约测试。
 *
 * - 未布防零行；布防窗口内渲染对应提示行（muted 色，表序即渲染序）。
 * - 窗口过期：撤防自清，不渲染（下一帧起提示消失）。
 */

import { describe, expect, it } from 'vitest'
import { ActionRegistry, EXIT_WINDOW_MS, REWIND_DOUBLE_ESC_MS } from '../src/actions/registry.js'
import { createBuiltinActions } from '../src/actions/builtin-actions.js'
import type { LiveRegionLine } from '../src/engine/live-engine.js'
import type { RivetTheme } from '../src/theme.js'
import { pushConfirmHints } from '../src/format/confirm-hints.js'

function fakeTheme(): RivetTheme {
  return {
    primary: '#111111', secondary: '#222222', success: '#333333',
    warning: '#444444', error: '#555555', dim: '#666666', muted: '#777777',
    pulseQuiet: '#888888', pulseActive: '#999999', pulseAlert: '#aaaaaa',
    userColor: '#bbbbbb', assistantColor: '#cccccc', systemColor: '#dddddd',
    brandColor: '#eeeeee', toolColor: () => '#000000', contextColor: () => '#000000',
  }
}

function plain(lines: readonly LiveRegionLine[]): string[] {
  return lines.map(l => l.text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, ''))
}

function makeRegistry(): ActionRegistry {
  return new ActionRegistry(createBuiltinActions({ editorKey: 'ctrl_e' }))
}

describe('pushConfirmHints（双击布防提示行）', () => {
  it('未布防：零行', () => {
    const lines: LiveRegionLine[] = []
    pushConfirmHints(makeRegistry(), lines, fakeTheme(), 10_000)
    expect(lines).toEqual([])
  })

  it('app.interrupt 布防窗口内：渲染「再按 Ctrl+C 退出」', () => {
    const registry = makeRegistry()
    registry.confirmArm('app.interrupt', 1_000)
    const lines: LiveRegionLine[] = []
    pushConfirmHints(registry, lines, fakeTheme(), 1_000 + EXIT_WINDOW_MS - 1)
    expect(plain(lines)).toEqual(['再按 Ctrl+C 退出 · Ctrl+Q 立即退出'])
  })

  it('session.rewind 布防窗口内：渲染「再按 Esc 打开 rewind」', () => {
    const registry = makeRegistry()
    registry.confirmArm('session.rewind', 1_000)
    const lines: LiveRegionLine[] = []
    pushConfirmHints(registry, lines, fakeTheme(), 1_000 + REWIND_DOUBLE_ESC_MS - 1)
    expect(plain(lines)).toEqual(['再按 Esc 打开 rewind'])
  })

  it('两动作同时布防：按表序渲染两行（Ctrl+C 在前）', () => {
    const registry = makeRegistry()
    registry.confirmArm('app.interrupt', 1_000)
    registry.confirmArm('session.rewind', 1_000)
    const lines: LiveRegionLine[] = []
    pushConfirmHints(registry, lines, fakeTheme(), 1_500)
    expect(plain(lines)).toEqual(['再按 Ctrl+C 退出 · Ctrl+Q 立即退出', '再按 Esc 打开 rewind'])
  })

  it('窗口过期：撤防自清不渲染；confirmSince 归零', () => {
    const registry = makeRegistry()
    registry.confirmArm('session.rewind', 1_000)
    const lines: LiveRegionLine[] = []
    pushConfirmHints(registry, lines, fakeTheme(), 1_000 + REWIND_DOUBLE_ESC_MS)
    expect(lines).toEqual([])
    expect(registry.confirmSince('session.rewind')).toBe(0)
  })
})
