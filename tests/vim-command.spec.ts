/**
 * vim-command.spec.ts — issue #51 集成面：/vim 斜杠命令（无参切换 / default 持久化）
 * 与 prefs.vimEnabled 启动恢复链路（宿主显式配置 > prefs > 缺省关）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { WriteStream } from 'node:tty'
import { TuiApp } from '../src/ui/app.js'
import type { SlashCommand } from '../src/commands/registry.js'

vi.mock('../src/os-notify.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  notifyOs: vi.fn(),
  applyNotifyOsPref: vi.fn(),
}))

/** 测试需要的最小 app 面（TuiApp 私有成员经窄接口访问）。 */
interface VimAppAccess {
  slash: { get(name: string): SlashCommand | undefined }
  inputLine: { vimEnabled: boolean; setVimEnabled(next: boolean): void }
  dispose(): Promise<void>
}

function makeStdout(): WriteStream {
  return {
    columns: 100, rows: 30, write: vi.fn(), isTTY: false,
    on: vi.fn(), removeListener: vi.fn(),
  } as unknown as WriteStream
}

function makeStdin(): NodeJS.ReadStream {
  return {
    isTTY: false, on: vi.fn(), removeListener: vi.fn(), removeAllListeners: vi.fn(),
    setRawMode: vi.fn(), resume: vi.fn(), pause: vi.fn(), setEncoding: vi.fn(),
  } as unknown as NodeJS.ReadStream
}

function makeCtx(): Context {
  return {
    on: vi.fn(() => vi.fn(() => true)),
    get: vi.fn(),
    provide: vi.fn(() => () => {}),
    reflect: { get: vi.fn(() => undefined) },
    sessions: { list: vi.fn(() => []) },
  } as unknown as Context
}

function makeApp(opts: Record<string, unknown> = {}): VimAppAccess {
  return new TuiApp({
    ctx: makeCtx(),
    stdout: makeStdout(),
    // InputHandler 构造需要流面；非 TTY 分支不会真实接管输入
    stdin: makeStdin(),
    ...opts,
  }) as unknown as VimAppAccess
}

function runVim(app: VimAppAccess, text = ''): string[] {
  const lines: string[] = []
  const cmd = app.slash.get('vim')
  if (!cmd) throw new Error('/vim 未注册')
  cmd.run({ text, ctx: undefined as never, sessionId: null, echo: (t: string) => { lines.push(t) }, rerender: () => {} })
  return lines
}

describe('issue #51 · /vim 命令与启动持久化', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-vim-'))
  const prefsPath = join(dir, 'prefs.json')

  afterEach(() => {
    try { rmSync(join(dir, 'prefs.json')) } catch { /* ignore */ }
  })

  it('宿主未显式配置时 prefs.vimEnabled=true 生效', async () => {
    writeFileSync(prefsPath, JSON.stringify({ vimEnabled: true }))
    const app = makeApp({ prefsPath })
    expect(app.inputLine.vimEnabled).toBe(true)
    await app.dispose()
  })

  it('宿主显式配置优先于 prefs；两者皆空缺省关', async () => {
    writeFileSync(prefsPath, JSON.stringify({ vimEnabled: true }))
    const hostOff = makeApp({ prefsPath, vimEnabled: false })
    expect(hostOff.inputLine.vimEnabled).toBe(false)
    await hostOff.dispose()

    const defaults = makeApp({ prefsPath: null })
    expect(defaults.inputLine.vimEnabled).toBe(false)
    await defaults.dispose()
  })

  it('/vim 无参运行时切换；default 写回 prefs 重启仍生效', async () => {
    const app = makeApp({ prefsPath })
    expect(app.inputLine.vimEnabled).toBe(false)

    runVim(app)
    expect(app.inputLine.vimEnabled).toBe(true)

    runVim(app, 'off')
    expect(app.inputLine.vimEnabled).toBe(false)

    runVim(app, 'on')
    expect(app.inputLine.vimEnabled).toBe(true)

    runVim(app, 'default')
    expect(JSON.parse(readFileSync(prefsPath, 'utf-8')).vimEnabled).toBe(true)

    runVim(app, 'bogus')
    expect(JSON.parse(readFileSync(prefsPath, 'utf-8')).vimEnabled).toBe(true) // 非法参数不落盘
    await app.dispose()
  })

  it('echo 提示点名开关状态', async () => {
    const app = makeApp({ prefsPath })
    const toggled = runVim(app)
    expect(toggled.join('')).toContain('vim 键位已开启')
    await app.dispose()
  })
})
