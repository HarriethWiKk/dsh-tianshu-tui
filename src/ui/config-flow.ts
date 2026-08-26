/**
 * config-flow — /config 面板投影装配（从 TuiApp 抽出，守 app.ts 棘轮）。
 *
 * 宿主 settings/permission/credentials 均可缺席；终端段始终带上
 * （系统通知开关不依赖宿主服务）。
 *
 * @module @huiliyi37/dsh-tianshu-tui/ui/config-flow
 */

import type { ConfigPanelProjection } from '../config-panel.js'
import { configTuiFromPrefs } from '../os-notify.js'
import type { TuiPrefs } from '../prefs.js'

/** ctx.reflect 最小面。 */
export interface ConfigFlowReflect {
  get(name: string, optional?: boolean): unknown
}

interface SettingsDescribeFacet {
  describe(options?: { redactSecrets?: boolean }): unknown[]
}

interface PermissionNamesFacet {
  names: readonly string[]
  current(events: readonly unknown[]): string
}

interface CredentialsDescribeFacet {
  describe(ref: string): Promise<{ configured: boolean; source?: string; writable?: boolean }>
}

export interface LoadConfigProjectionInput {
  reflect: ConfigFlowReflect
  prefs: TuiPrefs
  env?: NodeJS.ProcessEnv
  /** describe 返回后若已关闭面板 / 已 dispose → 不填凭据。 */
  shouldAbort?: () => boolean
}

/** 组装 /config 投影；三服务全缺仍返回带 tui 的对象（不再 null）。 */
export async function loadConfigProjection(input: LoadConfigProjectionInput): Promise<ConfigPanelProjection> {
  const settings = input.reflect.get('settings', false) as SettingsDescribeFacet | undefined
  const permission = input.reflect.get('permission', false) as PermissionNamesFacet | undefined
  const credentials = input.reflect.get('credentials', false) as CredentialsDescribeFacet | undefined
  const projection: ConfigPanelProjection = {
    settings: settings === undefined
      ? []
      : settings.describe({ redactSecrets: true }) as ConfigPanelProjection['settings'],
    permission: permission === undefined
      ? null
      : {
          options: permission.names.map(n => ({ value: n, name: n })),
          currentValue: permission.current([]),
        },
    credentials: [],
    tui: configTuiFromPrefs(input.prefs, input.env),
  }
  if (credentials === undefined) return projection
  try {
    const info = await credentials.describe('DEEPSEEK_API_KEY')
    if (input.shouldAbort?.()) return projection
    return {
      ...projection,
      credentials: [{
        ref: 'DEEPSEEK_API_KEY',
        configured: info.configured,
        writable: info.writable !== false,
        ...(info.source === undefined ? {} : { source: info.source }),
      }],
    }
  } catch {
    return projection
  }
}
