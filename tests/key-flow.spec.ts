/**
 * key-flow.spec.ts — /key 供应商密钥配置装配层测试（审查修复：装配层零覆盖）。
 *
 * 覆盖：llm 目录解析（缺席降级 DeepSeek 直开 / 在场构建供应商 picker 条目）、
 * profile apiKeyEnv 优先于派生（openKeyDialogForEntry target.ref）、afterSave
 * 激活步条件挂载与落盘后 mutate、probe 分派（llm-deepseek → 真实探测；
 * 其他 → discoverModels 三分类）、首启引导四守卫（TTY/未配置/run 级守护）。
 * 外部边界（reflect/overlay/picker）注入桩；对话框用真实 KeyDialogController。
 */
import { describe, expect, it, vi } from 'vitest'
import { KeyFlow } from '../src/ui/key-flow.js'
import { KeyDialogController, type KeyDialogCredentials } from '../src/ui/key-dialog.js'
import type { OverlayController } from '../src/engine/overlay-controller.js'
import type { PickerController } from '../src/picker.js'
import type { RivetTheme } from '../src/theme.js'

function fakeTheme(): RivetTheme {
  return {
    primary: '#111111', secondary: '#222222', success: '#333333',
    warning: '#444444', error: '#555555', dim: '#666666', muted: '#777777',
    pulseQuiet: '#888888', pulseActive: '#999999', pulseAlert: '#aaaaaa',
    userColor: '#bbbbbb', assistantColor: '#cccccc', systemColor: '#dddddd',
    brandColor: '#eeeeee', toolColor: () => '#000000', contextColor: () => '#000000',
  }
}

interface OverlayStub {
  activeId(): string | null
  activate(id: string): void
  deactivate(): void
  rerender: ReturnType<typeof vi.fn>
}

function makeOverlay(): OverlayStub {
  let active: string | null = null
  return {
    activeId: () => active,
    activate: (id: string) => { active = id },
    deactivate: () => { active = null },
    rerender: vi.fn(),
  }
}

function makeFlow(opts: {
  reflectGet?: (name: string, optional?: boolean) => unknown
  stdinIsTTY?: () => boolean
  apiKeyReady?: () => boolean
} = {}) {
  const overlay = makeOverlay() as unknown as OverlayController
  const picker = { open: vi.fn() } as unknown as PickerController & { open: ReturnType<typeof vi.fn> }
  const dialog = new KeyDialogController({ getTheme: fakeTheme })
  const reflect = { get: opts.reflectGet ?? vi.fn(() => undefined) }
  const flow = new KeyFlow({
    overlay,
    picker,
    keyDialog: dialog,
    reflect,
    isDisposed: () => false,
    stdinIsTTY: opts.stdinIsTTY ?? (() => true),
    apiKeyReady: opts.apiKeyReady ?? (() => false),
  })
  return { flow, overlay, picker, dialog, reflect }
}

/** 可配置供应商目录（llm seam 返回形状）。 */
const DIRECTORY = [
  { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [] },
  { provider: 'openrouter', displayName: 'openrouter', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openrouter'] },
]

/** 凭据面桩：describe 默认未配置可写；set 记录。 */
function makeCredentials(): KeyDialogCredentials & { set: ReturnType<typeof vi.fn> } {
  return {
    describe: vi.fn(async () => ({ configured: false, writable: true })),
    set: vi.fn(async () => {}),
  } as KeyDialogCredentials & { set: ReturnType<typeof vi.fn> }
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 10))
}

describe('KeyFlow — llm 目录解析与降级', () => {
  it('reflect 无 llm seam（或面缺 listConfigurableProviders）→ 目录空，降级 DeepSeek 直开', async () => {
    const { flow, overlay, picker } = makeFlow()
    await flow.openKeyDialog()
    expect(picker.open).not.toHaveBeenCalled()
    expect(overlay.activeId()).toBe('key-dialog')
  })

  it('目录在场 → 供应商 picker 打开（默认置首 current + 已配置 ✓ 后缀）', async () => {
    const credentials = makeCredentials()
    credentials.describe = vi.fn(async () => ({ configured: true, writable: true }))
    const { flow, overlay, picker } = makeFlow({
      reflectGet: (name) => {
        if (name === 'llm') return { listConfigurableProviders: () => DIRECTORY }
        if (name === 'credentials') return credentials
        return undefined
      },
    })
    await flow.openKeyDialog()
    expect(picker.open).toHaveBeenCalledTimes(1)
    const [title, items] = picker.open.mock.calls[0] as [string, Array<{ label: string; value: string; current?: boolean }>]
    expect(title).toBe('选择供应商（配置 API 密钥）')
    // 默认模型缺省（agentDefaultModel undefined）→ 不置首；已配置 ✓ 后缀
    expect(items.map(i => i.label)).toEqual(['DeepSeek ✓', 'openrouter ✓'])
    expect(overlay.activeId()).toBe('picker')
  })
})

describe('KeyFlow — 供应商参数化 target', () => {
  it('pi-ai 路由 profile 声明 apiKeyEnv → 落盘引用用 profile 值（优先于派生）', async () => {
    const credentials = makeCredentials()
    const settings = {
      describe: () => [
        { ns: 'llm-pi-ai', value: { providers: { openrouter: { apiKeyEnv: 'OPENROUTER_API_KEY' } } } },
      ],
      mutate: vi.fn(async () => {}),
    }
    const { flow, dialog } = makeFlow({
      reflectGet: (name) => {
        if (name === 'llm') return { listConfigurableProviders: () => DIRECTORY, discoverModels: async () => [] }
        if (name === 'credentials') return credentials
        if (name === 'settings') return settings
        return undefined
      },
    })
    const entry = DIRECTORY[1]
    if (entry === undefined) throw new Error('fixture')
    await flow.openKeyDialogForEntry(entry, credentials)
    // 输入 + 提交（probe 桩：openrouter 走 discoverModels → ok 直接落盘）
    dialog.handleKey('unknown', 'k')
    dialog.handleKey('unknown', '1')
    dialog.handleKey('return', '')
    await settle()
    await settle()
    expect(credentials.set).toHaveBeenCalledWith('OPENROUTER_API_KEY', 'k1')
  })

  it('profile 未声明 apiKeyEnv + settings 在场 → afterSave 挂载：保存后 mutate 补写 apiKeyEnv', async () => {
    const credentials = makeCredentials()
    const mutate = vi.fn(async () => {})
    const settings = {
      describe: () => [{ ns: 'llm-pi-ai', value: { providers: { openrouter: {} } } }],
      mutate,
    }
    const { flow, dialog } = makeFlow({
      reflectGet: (name) => {
        if (name === 'llm') return { listConfigurableProviders: () => DIRECTORY, discoverModels: async () => [] }
        if (name === 'credentials') return credentials
        if (name === 'settings') return settings
        return undefined
      },
    })
    const entry = DIRECTORY[1]
    if (entry === undefined) throw new Error('fixture')
    await flow.openKeyDialogForEntry(entry, credentials)
    dialog.handleKey('unknown', 'k')
    dialog.handleKey('return', '')
    await settle()
    await settle()
    expect(credentials.set).toHaveBeenCalled()
    // afterSave：{providers: {openrouter: {apiKeyEnv: 'OPENROUTER_API_KEY'}}}
    expect(mutate).toHaveBeenCalledWith('llm-pi-ai', [{
      op: 'set',
      path: ['providers', 'openrouter', 'apiKeyEnv'],
      value: 'OPENROUTER_API_KEY',
    }])
  })

  it('llm-deepseek 段 → 探测走真实 probeDeepSeekKey（settingsNs 判据，fetch 外部边界打桩）', async () => {
    const credentials = makeCredentials()
    const fetchMock = vi.fn(async (_url: string, init?: { headers?: Record<string, string> }) => {
      // 断言 key 只进 Authorization 头（与 key-dialog.spec 同规则）
      expect(init?.headers?.Authorization).toBe('Bearer k')
      return new Response('{}', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { flow, dialog } = makeFlow({
      reflectGet: (name) => {
        if (name === 'llm') return { listConfigurableProviders: () => DIRECTORY }
        if (name === 'credentials') return credentials
        return undefined
      },
    })
    const entry = DIRECTORY[0]
    if (entry === undefined) throw new Error('fixture')
    await flow.openKeyDialogForEntry(entry, credentials)
    dialog.handleKey('unknown', 'k')
    dialog.handleKey('return', '')
    await settle()
    await settle()
    // probe ok（200）→ 直接落盘；entry 显式传入 → ref 走派生规则
    // （deriveKeyRef('deepseek-official') = DEEPSEEK_OFFICIAL_API_KEY；
    //  无 settings 桩时 profile apiKeyEnv 缺席，落派生——与上游语义一致）
    expect(credentials.set).toHaveBeenCalledWith('DEEPSEEK_OFFICIAL_API_KEY', 'k')
  })

  it('非 llm-deepseek 段 → discoverModels 三分类（AUTH → invalid 拒存）', async () => {
    const credentials = makeCredentials()
    const discoverModels = vi.fn(async () => { throw Object.assign(new Error('auth'), { code: 'AUTH' }) })
    const { flow, dialog } = makeFlow({
      reflectGet: (name) => {
        if (name === 'llm') return { listConfigurableProviders: () => DIRECTORY, discoverModels }
        if (name === 'credentials') return credentials
        return undefined
      },
    })
    const entry = DIRECTORY[1]
    if (entry === undefined) throw new Error('fixture')
    await flow.openKeyDialogForEntry(entry, credentials)
    dialog.handleKey('unknown', 'k')
    dialog.handleKey('return', '')
    await settle()
    await settle()
    expect(discoverModels).toHaveBeenCalledWith('llm-pi-ai', { provider: 'openrouter', apiKey: 'k' })
    expect(credentials.set).not.toHaveBeenCalled()
  })
})

describe('KeyFlow — 首启引导四守卫', () => {
  it('TTY + 未配置 → 自动弹一次；run 级守护：第二次不再弹', async () => {
    const { flow } = makeFlow()
    const spy = vi.spyOn(flow, 'openKeyDialog')
    flow.maybeAutoOpenKeyDialog()
    flow.maybeAutoOpenKeyDialog()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('非 TTY（测试/管道）→ 不弹', async () => {
    const { flow } = makeFlow({ stdinIsTTY: () => false })
    const spy = vi.spyOn(flow, 'openKeyDialog')
    flow.maybeAutoOpenKeyDialog()
    expect(spy).not.toHaveBeenCalled()
  })

  it('API key 已就绪 → 不弹', async () => {
    const { flow } = makeFlow({ apiKeyReady: () => true })
    const spy = vi.spyOn(flow, 'openKeyDialog')
    flow.maybeAutoOpenKeyDialog()
    expect(spy).not.toHaveBeenCalled()
  })
})
