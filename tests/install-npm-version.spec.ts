/**
 * install-npm-version.spec.ts — installNpmVersion 的 spawn 调用契约。
 *
 * 回归目标（DEP0190）：Windows 下不得再以 `shell: true` + args 数组调用
 * child_process.spawn——该组合触发 Node 弃用警告，警告经 stderr 被 TUI
 * 渲染进输入框区域（用户报告的上屏乱码根因）。修复后 spawn 应改为
 * `cmd.exe /d /s /c` 显式派发（shell: false，args 作为 argv 传递）。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}))

// 动态 import：确保 child_process mock 生效后再加载被测模块
import { installNpmVersion, detectPackageManager, TUI_PACKAGE } from '../src/self-update.js'

function stubChild() {
  return {
    kill: vi.fn(),
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stdin: { write: vi.fn(), end: vi.fn() },
  }
}

describe('installNpmVersion', () => {
  const origPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!

  beforeEach(() => {
    spawnMock.mockReset()
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { ...origPlatform })
  })

  function platform(win32: boolean): void {
    Object.defineProperty(process, 'platform', { value: win32 ? 'win32' : 'linux', configurable: true })
  }

  it('win32：经 cmd.exe /d /s /c 显式派发，shell 不为 true（DEP0190 回归）', async () => {
    platform(true)
    spawnMock.mockReturnValue(stubChild())
    const child = stubChild()
    spawnMock.mockReturnValue(child)

    const p = installNpmVersion('0.1.2-rc.7', '/tmp/profile')
    // 触发 exit 回调
    const exitHandler = child.on.mock.calls.find(([ev]) => ev === 'exit')?.[1] as (code: number | null) => void
    exitHandler(0)
    await p

    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [command, args, options] = spawnMock.mock.calls[0]!
    expect(command).toBe(process.env.ComSpec ?? 'cmd.exe')
    expect(args).toEqual(['/d', '/c', 'pnpm', 'add', '@huiliyi37/dsh-tianshu-tui@0.1.2-rc.7'])
    expect(options).not.toHaveProperty('shell', true)
  })

  it('win32：spawn 选项含 cwd / stdio / windowsHide，保持原行为面', async () => {
    platform(true)
    const child = stubChild()
    spawnMock.mockReturnValue(child)

    const p = installNpmVersion('0.1.2-rc.7', '/tmp/profile')
    const exitHandler = child.on.mock.calls.find(([ev]) => ev === 'exit')?.[1] as (code: number | null) => void
    exitHandler(0)
    await p

    const [, , options] = spawnMock.mock.calls[0]!
    expect(options).toMatchObject({ cwd: '/tmp/profile', stdio: 'ignore', windowsHide: true })
  })

  it('非 win32：保持 spawn pnpm + args，shell 不为 true', async () => {
    platform(false)
    const child = stubChild()
    spawnMock.mockReturnValue(child)

    const p = installNpmVersion('0.1.2-rc.7', '/tmp/profile')
    const exitHandler = child.on.mock.calls.find(([ev]) => ev === 'exit')?.[1] as (code: number | null) => void
    exitHandler(0)
    await p

    const [command, args, options] = spawnMock.mock.calls[0]!
    expect(command).toBe('pnpm')
    expect(args).toEqual(['add', '@huiliyi37/dsh-tianshu-tui@0.1.2-rc.7'])
    expect(options).not.toHaveProperty('shell', true)
  })

  it('任何平台：spawn 调用都不允许 shell:true 与 args 数组同现（DEP0190 硬约束）', async () => {
    platform(true)
    const child = stubChild()
    spawnMock.mockReturnValue(child)

    const p = installNpmVersion('0.1.2-rc.7', '/tmp/profile')
    const exitHandler = child.on.mock.calls.find(([ev]) => ev === 'exit')?.[1] as (code: number | null) => void
    exitHandler(0)
    await p

    for (const call of spawnMock.mock.calls) {
      const [, args, options] = call
      const shellTrue = options && (options as { shell?: unknown }).shell === true
      expect(shellTrue && Array.isArray(args) && args.length > 0).toBe(false)
    }
  })

  it('exit code 非 0 → reject；超时 → kill + reject', async () => {
    platform(true)
    const child = stubChild()
    spawnMock.mockReturnValue(child)

    const pFail = installNpmVersion('0.1.2-rc.7', '/tmp/profile')
    const exitHandler = child.on.mock.calls.find(([ev]) => ev === 'exit')?.[1] as (code: number | null) => void
    exitHandler(2)
    await expect(pFail).rejects.toThrow(/exited 2/)

    spawnMock.mockClear()
    child.on.mockClear()
    child.kill.mockClear()
    spawnMock.mockReturnValue(child)
    const pTimeout = installNpmVersion('0.1.2-rc.7', '/tmp/profile', 20)
    // 先挂 rejection handler，避免 20ms 定时器触发 reject 后出现 unhandled 窗口
    const assertion = expect(pTimeout).rejects.toThrow(/timed out/)
    await new Promise((r) => setTimeout(r, 60))
    expect(child.kill).toHaveBeenCalled()
    await assertion
  })
})

describe('installNpmVersion — 按锁文件选择包管理器（MEDIUM 2 工程化）', () => {
  const origPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
  const SPEC = `${TUI_PACKAGE}@0.1.2-rc.7`

  function makeProfileWith(lockfile: string, sub?: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-tui-inst-'))
    if (sub !== undefined) mkdirSync(join(dir, sub), { recursive: true })
    writeFileSync(join(dir, sub ?? '', lockfile), '{}')
    return dir
  }

  beforeEach(() => { spawnMock.mockReset() })
  afterEach(() => { Object.defineProperty(process, 'platform', { ...origPlatform }) })
  function platform(win32: boolean): void {
    Object.defineProperty(process, 'platform', { value: win32 ? 'win32' : 'linux', configurable: true })
  }

  function runInstall(profileDir: string): (code: number | null) => void {
    const child = stubChild()
    spawnMock.mockReturnValue(child)
    void installNpmVersion('0.1.2-rc.7', profileDir)
    return child.on.mock.calls.find(([ev]) => ev === 'exit')?.[1] as (code: number | null) => void
  }

  it('package-lock.json + 非 win32 → npm install', async () => {
    platform(false)
    runInstall(makeProfileWith('package-lock.json'))(0)
    const [command, args] = spawnMock.mock.calls[0]!
    expect(command).toBe('npm')
    expect(args).toEqual(['install', SPEC])
  })

  it('yarn.lock + 非 win32 → yarn add', async () => {
    platform(false)
    runInstall(makeProfileWith('yarn.lock'))(0)
    const [command, args] = spawnMock.mock.calls[0]!
    expect(command).toBe('yarn')
    expect(args).toEqual(['add', SPEC])
  })

  it('package-lock.json + win32 → cmd /d /c npm install（DEP0190 约束保持）', async () => {
    platform(true)
    runInstall(makeProfileWith('package-lock.json'))(0)
    const [command, args, options] = spawnMock.mock.calls[0]!
    expect(command).toBe(process.env.ComSpec ?? 'cmd.exe')
    expect(args).toEqual(['/d', '/c', 'npm', 'install', SPEC])
    expect(options).not.toHaveProperty('shell', true)
  })

  it('pnpm-lock.yaml + win32 → cmd /d /c pnpm add', async () => {
    platform(true)
    runInstall(makeProfileWith('pnpm-lock.yaml'))(0)
    const [command, args] = spawnMock.mock.calls[0]!
    expect(command).toBe(process.env.ComSpec ?? 'cmd.exe')
    expect(args).toEqual(['/d', '/c', 'pnpm', 'add', SPEC])
  })
})

describe('detectPackageManager — 按 profile 锁文件探测', () => {
  function makeProfile(files: Array<[string, string]>): string {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-tui-pm-'))
    for (const [rel, content] of files) {
      const full = join(dir, rel)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, content)
    }
    return dir
  }

  it('pnpm-lock.yaml → pnpm', () => {
    expect(detectPackageManager(makeProfile([['pnpm-lock.yaml', 'lockfileVersion: 9']]))).toBe('pnpm')
  })

  it('package-lock.json → npm', () => {
    expect(detectPackageManager(makeProfile([['package-lock.json', '{}']]))).toBe('npm')
  })

  it('yarn.lock → yarn', () => {
    expect(detectPackageManager(makeProfile([['yarn.lock', '# yarn lockfile v1']]))).toBe('yarn')
  })

  it('node_modules/.package-lock.json → npm（npm v7+ 隐藏锁文件）', () => {
    expect(detectPackageManager(makeProfile([['node_modules/.package-lock.json', '{}']]))).toBe('npm')
  })

  it('无锁文件 → 默认 pnpm（历史行为）', () => {
    expect(detectPackageManager(mkdtempSync(join(tmpdir(), 'dsh-tui-pm-empty-')))).toBe('pnpm')
  })

  it('多锁文件并存 → pnpm-lock.yaml 优先', () => {
    const dir = makeProfile([['pnpm-lock.yaml', 'x'], ['package-lock.json', '{}'], ['yarn.lock', 'y']])
    expect(detectPackageManager(dir)).toBe('pnpm')
  })
})
