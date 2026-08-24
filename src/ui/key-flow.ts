/**
 * key-flow — /key 供应商密钥配置的装配层（提取自上游 tianshu-public
 * TuiApp 的 openKeyDialog 系列，2026-08 回流）。上游这些方法是 TuiApp
 * 实例私有方法；本仓按棘轮约束（ui/app.ts 只降不升）提取为独立模块，
 * TuiApp 仅保留 deps 注入与 overlay 注册。
 *
 * 分层：key-wizard（纯函数目录/引用决策）→ key-dialog（状态机+渲染）→
 * 本模块（装配：reflect 现取 llm/credentials/settings seam、供应商 picker
 * 链式开窗、探测分派、保存后 profile 激活、首启引导）。
 *
 * @module dsh-tui/key-flow
 */

import type { OverlayController } from '../engine/overlay-controller.js'
import type { PickerController } from '../picker.js'
import {
  DEEPSEEK_KEY_TARGET,
  KeyDialogController,
  probeDeepSeekKey,
  type KeyDialogCredentials,
  type KeyDialogTarget,
} from './key-dialog.js'
import { buildProviderItems, resolveKeyRef, type WizardProviderEntry } from './key-wizard.js'

/** ctx.reflect 的最小面（结构兼容 cordis reflect；key-flow 只消费 get）。 */
export interface KeyFlowReflect {
  get(name: string, optional?: boolean): unknown
}

/** settings 服务最小面（describe/mutate；缺席时向导只存 key 不做 profile 激活）。 */
export interface KeyWizardSettingsFacet {
  describe(options?: { redactSecrets?: boolean }): Array<{ ns: string; value: unknown }>
  mutate(ns: string, ops: Array<{ op: string; path: readonly string[]; value: unknown }>): Promise<void>
}

/** key-flow 装配依赖（全部由 TuiApp 注入；null = 服务缺席，走降级路径）。 */
export interface KeyFlowDeps {
  overlay: OverlayController | null
  picker: PickerController | null
  keyDialog: KeyDialogController | null
  reflect: KeyFlowReflect
  isDisposed: () => boolean
  /** 首启引导：标准输入是否 TTY（非 TTY 不弹交互对话框）。 */
  stdinIsTTY: () => boolean
  /** 首启引导：当前 API key 就绪标志（欢迎行已刷新）。 */
  apiKeyReady: () => boolean
  /** 首启引导开关：false 时 maybeAutoOpenKeyDialog 恒不弹（测试替身/宿主显式禁用）。 */
  autoPrompt?: boolean
  /** agent-default-model 面（缺省无默认供应商）。 */
  agentDefaultModel?: { currentSelection?: () => { provider: string } }
  /** /config 凭据字段编辑入口 miss 时的回调（上游 finishConfigReturn）。 */
  onConfigEntryMissing?: () => void
}

/**
 * /key 供应商密钥配置装配控制器。方法语义与上游 TuiApp 同名方法一致：
 * - openKeyDialog：llm 配置目录可用时先开供应商 picker（默认供应商 ● 置首、
 *   已配置 ✓ 后缀），选中后链到参数化的 key 对话框；目录缺席降级 DeepSeek 直开。
 * - openCredentialFromConfig：/config 凭据字段编辑入口（向导后段）。
 * - maybeAutoOpenKeyDialog：首启引导（TTY 缺 key 自动弹一次，run 级守护）。
 */
export class KeyFlow {
  /** 首启引导守护：本 run 已自动弹过一次 key 对话框（restore 等后续流程不再重复弹）。 */
  private keyPromptShown = false
  private readonly deps: KeyFlowDeps

  constructor(deps: KeyFlowDeps) {
    this.deps = deps
  }

  /**
   * /key：供应商密钥配置向导。llm 配置目录可用时先开供应商 picker（默认
   * 供应商 ● 置首、已配置 ✓ 后缀），选中后链到参数化的 key 对话框（掩码
   * 输入 + 探测 + 落盘）；目录缺席（无 llm seam/测试装配）降级为 DeepSeek
   * 直开。凭据服务经 reflect.get 现取（缺席时对话框给降级指引）。
   */
  async openKeyDialog(): Promise<void> {
    const { overlay, keyDialog, picker } = this.deps
    if (this.deps.isDisposed()) return
    if (overlay === null || keyDialog === null) return
    // 已在打开/已打开时不重进：同 id activate 会先调本对话框 onDeactivate，
    // 把 open() 刚置真的开旗标打回 false（对话框 visually 打开但键控失效）。
    if (overlay.activeId() === 'key-dialog') return
    const credentials = this.deps.reflect.get('credentials', false) as KeyDialogCredentials | undefined
    const directory = this.keyWizardDirectory()
    if (picker === null || directory.length === 0) {
      await this.openKeyDialogForEntry(undefined, credentials)
      return
    }
    // 状态 join：各条目的落盘引用 + credentials.describe（configured）。
    const sections = this.readResolvedSettingsSections()
    const configured = new Map<string, boolean>()
    for (const entry of directory) {
      const ref = resolveKeyRef(entry.provider, this.profileApiKeyEnv(sections, entry))
      if (credentials === undefined) break
      const isConfigured = await credentials.describe(ref)
        .then(info => info.configured, () => false)
      if (this.deps.isDisposed()) return
      configured.set(entry.provider, isConfigured)
    }
    const defaultProvider = this.defaultModelProvider()
    picker.open('选择供应商（配置 API 密钥）', buildProviderItems(directory, configured, defaultProvider), (item) => {
      const entry = directory.find(candidate => candidate.provider === item.value)
      if (entry === undefined) return
      // picker 的 commit 回调先于随后的 overlay.deactivate：链式开窗必须排到
      // picker 失活之后（微任务），否则 activate 会被紧跟的 deactivate 打掉。
      queueMicrotask(() => { void this.openKeyDialogForEntry(entry, credentials) })
    }, 0)
    overlay.activate('picker')
  }

  /**
   * 打开参数化 key 对话框；entry 缺省即 DeepSeek 缺省目标（首启引导与降级）。
   * pi-ai 路由的 profile 未声明 apiKeyEnv 时挂 afterSave：保存后补写
   * `{providers: {<route>: {apiKeyEnv}}}`——路由即刻注册，/model 立即可选
   * （与 web 模型页的写入形状一致）；settings 缺席则只存 key 不激活。
   * @param entry - 目录条目；undefined = DeepSeek 缺省目标。
   * @param credentials - 凭据服务最小面；undefined = 服务缺席（对话框降级指引）。
   */
  async openKeyDialogForEntry(
    entry: WizardProviderEntry | undefined,
    credentials: KeyDialogCredentials | undefined,
  ): Promise<void> {
    const { overlay, keyDialog } = this.deps
    if (this.deps.isDisposed()) return
    if (overlay === null || keyDialog === null) return
    if (overlay.activeId() === 'key-dialog') return
    const sections = this.readResolvedSettingsSections()
    const namedEnv = entry === undefined ? undefined : this.profileApiKeyEnv(sections, entry)
    const target: KeyDialogTarget = entry === undefined
      ? DEEPSEEK_KEY_TARGET
      : {
        provider: entry.provider,
        displayName: entry.displayName,
        ref: resolveKeyRef(entry.provider, namedEnv),
        probe: this.keyProbeFor(entry),
        ...namedEnv === undefined
          && entry.settingsPath.length > 0
          && this.settingsMutationFacet() !== undefined
          ? { afterSave: () => this.activateRouteProfile(entry) }
          : {},
      }
    await keyDialog.open(credentials, target)
    if (this.deps.isDisposed()) return
    overlay.activate('key-dialog')
  }

  /**
   * 凭据字段编辑：从 /config 进该供应商的 /key 对话框（向导后段）。
   * 目录中找不到该供应商（目录已变更）时走 onConfigEntryMissing 回调。
   * @param provider - 供应商路由 id。
   */
  async openCredentialFromConfig(provider: string): Promise<void> {
    const entry = this.keyWizardDirectory().find(candidate => candidate.provider === provider)
    const credentials = this.deps.reflect.get('credentials', false) as KeyDialogCredentials | undefined
    if (entry === undefined) {
      this.deps.onConfigEntryMissing?.()
      return
    }
    await this.openKeyDialogForEntry(entry, credentials)
  }

  /**
   * 首启引导：交互终端（TTY）缺 API key 时自动打开一次设置对话框（Esc 可跳过）。
   * 挂载点在欢迎渲染/会话就绪之后（attach 尾；apiKeyReady 已由
   * prepareWelcome 刷新）；keyPromptShown 做 run 级守护，
   * restore/重进等后续流程不再重复弹；非 TTY（测试/管道）不弹交互对话框。
   */
  maybeAutoOpenKeyDialog(): void {
    if (this.deps.autoPrompt === false) return
    if (this.deps.isDisposed() || this.keyPromptShown || this.deps.apiKeyReady()) return
    if (!this.deps.stdinIsTTY()) return
    this.keyPromptShown = true
    void this.openKeyDialog()
  }

  /** llm 配置目录（llm seam 缺席或面不含该法时为空数组——降级 DeepSeek 直开）。 */
  keyWizardDirectory(): WizardProviderEntry[] {
    const llm = this.deps.reflect.get('llm', false) as
      | {
        listConfigurableProviders?: () => Array<{
          provider: string
          displayName: string
          settingsNs: string
          settingsPath: readonly string[]
        }>
      }
      | undefined
    if (llm === undefined || typeof llm.listConfigurableProviders !== 'function') return []
    return llm.listConfigurableProviders()
      .filter(entry => entry.provider.length > 0)
      .map(entry => ({
        provider: entry.provider,
        displayName: entry.displayName,
        settingsNs: entry.settingsNs,
        settingsPath: entry.settingsPath,
      }))
  }

  /** settings 服务最小面（describe/mutate；缺席时向导只存 key 不做 profile 激活）。 */
  settingsMutationFacet(): KeyWizardSettingsFacet | undefined {
    return this.deps.reflect.get('settings', false) as KeyWizardSettingsFacet | undefined
  }

  /** 读取 settings 各命名空间的已解析值（ns 对象原样保留供 mutate 回传）。 */
  readResolvedSettingsSections(): Map<string, unknown> {
    const sections = new Map<string, unknown>()
    const settings = this.settingsMutationFacet()
    if (settings === undefined) return sections
    try {
      for (const descriptor of settings.describe()) {
        sections.set(String(descriptor.ns), descriptor.value)
      }
    } catch {
      // 面不匹配/读取失败：引用解析退回派生规则（最早的可用事实）。
    }
    return sections
  }

  /**
   * 目录条目在已解析 settings 段里的 `apiKeyEnv`（组合层下发的 openrouter
   * profile 就带着 OPENROUTER_API_KEY）；llm-deepseek 段经 schema 缺省解析
   * 为 DEEPSEEK_API_KEY。无 profile/未声明返回 undefined（落派生规则）。
   */
  profileApiKeyEnv(sections: ReadonlyMap<string, unknown>, entry: WizardProviderEntry): string | undefined {
    const section = sections.get(entry.settingsNs)
    if (section === null || typeof section !== 'object') return undefined
    let profile: unknown = section
    for (const key of entry.settingsPath) {
      if (profile === null || typeof profile !== 'object') return undefined
      profile = (profile as Record<string, unknown>)[key]
    }
    const named = profile === null || typeof profile !== 'object'
      ? undefined
      : (profile as Record<string, unknown>).apiKeyEnv
    return typeof named === 'string' && named.length > 0 ? named : undefined
  }

  /**
   * 供应商探测实现：llm-deepseek 段用既有官方端点探测；其余走 llm 发现探针
   * （带草稿 key 即真鉴权：2xx → ok，AUTH/INVALID_CREDENTIAL → invalid，
   * 其余含网络错 → unknown）。llm seam 缺席按 unknown（无法证伪，可强存）。
   */
  private keyProbeFor(entry: WizardProviderEntry): (key: string) => Promise<'ok' | 'invalid' | 'unknown'> {
    if (entry.settingsNs === 'llm-deepseek') return probeDeepSeekKey
    return async (key) => {
      const llm = this.deps.reflect.get('llm', false) as
        | { discoverModels?: (ns: string, request: { provider?: string; apiKey?: string }) => Promise<unknown> }
        | undefined
      if (llm === undefined || typeof llm.discoverModels !== 'function') return 'unknown'
      try {
        await llm.discoverModels(entry.settingsNs, { provider: entry.provider, apiKey: key })
        return 'ok'
      } catch (error) {
        const code = (error as { code?: unknown }).code
        return code === 'AUTH' || code === 'INVALID_CREDENTIAL' ? 'invalid' : 'unknown'
      }
    }
  }

  /** 保存 key 后激活路由：写入最小 profile（settingsPath 非空 = pi-ai 路由）。 */
  private async activateRouteProfile(entry: WizardProviderEntry): Promise<void> {
    const settings = this.settingsMutationFacet()
    if (settings === undefined) return
    await settings.mutate(entry.settingsNs, [{
      op: 'set',
      path: [...entry.settingsPath, 'apiKeyEnv'],
      value: resolveKeyRef(entry.provider, undefined),
    }])
  }

  /** 当前默认模型所在的供应商路由（agent-default-model 缺席时无默认）。 */
  private defaultModelProvider(): string | undefined {
    try {
      return this.deps.agentDefaultModel?.currentSelection?.().provider
    } catch {
      return undefined
    }
  }
}
