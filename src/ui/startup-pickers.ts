/**
 * startup-pickers — /model /theme /effort 选择器：Enter 本会话、S 写默认。
 *
 * @module @huiliyi37/dsh-tianshu-tui/ui/startup-pickers
 */

import { parseRouteKey } from '../engine/route-key.js'
import { PickerController, type PickerItem } from '../picker.js'
import { echoSavedDefault, echoSessionOnly } from '../startup-defaults.js'
import { getActiveThemeName, listCustomThemes, setTheme, THEME_NAMES } from '../theme.js'

export interface OverlayActivate {
  activate(id: string): void
  deactivate(): void
}

export interface ModelPickerLlm {
  listProviders(): Array<{ id: string; name: string }>
  listModels(provider: string): Promise<Array<{ id: string; name: string }>>
}

export interface ModelPickerHost {
  overlay: OverlayActivate | null
  picker: PickerController | null
  echoWarn(text: string, hint?: string): void
  commit(text: string): void
  current?: { provider: string; model: string }
  savedKey?: string | null
  llm?: ModelPickerLlm
  applySession(selection: { provider: string; model: string }): boolean
  applyDefault(selection: { provider: string; model: string }): void
}

export interface ThemePickerHost {
  overlay: OverlayActivate | null
  picker: PickerController | null
  savedTheme?: string
  applyDefault(name: string): void
  rerenderHistory(): void
  flushLiveRender(): void
  commit(text: string): void
}

export interface EffortPickerHost {
  overlay: OverlayActivate | null
  picker: PickerController | null
  currentEffort?: string
  savedEffort?: string
  apply(level: string, persist: boolean): void
}

/** 打开模型选择器：Enter 热切本会话，S 写宿主默认。 */
export async function openModelPicker(host: ModelPickerHost): Promise<void> {
  const { overlay, picker } = host
  if (overlay === null || picker === null) return
  if (host.llm === undefined) {
    host.echoWarn('⚠ llm 服务不可用（未装配 llm 插件），模型选择器不可用', '/key 配置')
    return
  }
  const currentKey = host.current === undefined ? null : `${host.current.provider}/${host.current.model}`
  const savedKey = host.savedKey ?? null
  const items: PickerItem[] = []
  let selectedIndex = 0
  for (const provider of host.llm.listProviders()) {
    const models = await host.llm.listModels(provider.id).catch(() => [])
    for (const model of models) {
      const key = `${provider.id}/${model.id}`
      const item: PickerItem = {
        label: key === currentKey ? `${key}（当前）` : key,
        value: key,
        current: key === currentKey,
        isDefault: key === savedKey,
      }
      if (key === currentKey) selectedIndex = items.length
      items.push(item)
    }
  }
  if (items.length === 0) {
    host.echoWarn('⚠ 无可用模型（llm 目录为空），模型选择器不可用', '/key 配置')
    return
  }
  const apply = (item: PickerItem, persist: boolean): void => {
    const selection = parseRouteKey(item.value)
    if (selection === undefined) return
    if (persist) host.applyDefault(selection)
    const hot = host.applySession(selection)
    const label = `${selection.provider}/${selection.model}`
    host.commit(persist
      ? (hot ? echoSavedDefault('model', label) : `${echoSavedDefault('model', label)}（当前会话不可热切）`)
      : (hot ? echoSessionOnly('model', label) : `模型已切换: ${label}（当前会话不可热切）。选择器按 S 或 /model default 可设为启动默认`))
  }
  picker.open('选择模型', items, (item) => { apply(item, false) }, selectedIndex, {
    onSaveDefault: (item) => { apply(item, true) },
  })
  overlay.activate('picker')
}

/** 打开主题选择器：预览即生效；Enter 不落盘，S 写 prefs。 */
export function openThemePicker(host: ThemePickerHost): void {
  const { overlay, picker } = host
  if (overlay === null || picker === null) return
  const prev = getActiveThemeName()
  const allNames = [...THEME_NAMES, ...listCustomThemes().map(n => `custom:${n}`)]
  const items: PickerItem[] = allNames.map(name => ({
    label: name === prev ? `${name}（当前）` : name,
    value: name,
    current: name === prev,
    isDefault: name === host.savedTheme,
  }))
  const selectedIndex = Math.max(0, allNames.indexOf(prev))
  const finish = (name: string, persist: boolean): void => {
    if (persist) host.applyDefault(name)
    else setTheme(name)
    overlay.deactivate()
    host.rerenderHistory()
    host.commit(persist ? echoSavedDefault('theme', name) : echoSessionOnly('theme', name))
    host.flushLiveRender()
  }
  picker.open('选择主题', items, (item) => { finish(item.value, false) }, selectedIndex, {
    onPreview: (item) => { setTheme(item.value) },
    onCancel: () => { setTheme(prev) },
    onSaveDefault: (item) => { finish(item.value, true) },
  })
  overlay.activate('picker')
}

const EFFORT_ITEMS = ['off', 'high', 'max', 'auto'] as const

/** 打开推理等级选择器。 */
export function openEffortPicker(host: EffortPickerHost): void {
  const { overlay, picker } = host
  if (overlay === null || picker === null) return
  const current = host.currentEffort ?? 'auto'
  const saved = host.savedEffort ?? 'auto'
  const items: PickerItem[] = EFFORT_ITEMS.map(level => ({
    label: level === current ? `${level}（当前）` : level,
    value: level,
    current: level === current,
    isDefault: level === saved,
  }))
  const selectedIndex = Math.max(0, EFFORT_ITEMS.indexOf(current as typeof EFFORT_ITEMS[number]))
  picker.open('选择推理等级', items, (item) => { host.apply(item.value, false) }, selectedIndex, {
    onSaveDefault: (item) => { host.apply(item.value, true) },
  })
  overlay.activate('picker')
}
