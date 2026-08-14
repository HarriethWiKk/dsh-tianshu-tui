/**
 * 启动自更新：npm latest 比已装版本新时，在 profile 目录 pnpm add。
 * CI / 非 npm 安装（github/link/file）跳过，避免测试和开发树误升级。
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  TUI_PACKAGE,
  findProfileDir,
  isNpmVersionSpec,
  planSelfUpdate,
  runSelfUpdate,
  shouldCheckForUpdate,
  updateNoticeText,
} from '../src/self-update.js'

describe('isNpmVersionSpec', () => {
  it('接受 registry 版本与 latest', () => {
    expect(isNpmVersionSpec('0.1.0-rc.6')).toBe(true)
    expect(isNpmVersionSpec('^0.1.0-rc.6')).toBe(true)
    expect(isNpmVersionSpec('latest')).toBe(true)
  })

  it('拒绝 git / 本地 / workspace spec', () => {
    expect(isNpmVersionSpec('github:huiliyi37/dsh-tianshu-tui')).toBe(false)
    expect(isNpmVersionSpec('git+https://github.com/huiliyi37/dsh-tianshu-tui.git')).toBe(false)
    expect(isNpmVersionSpec('link:/tmp/dsh-tui')).toBe(false)
    expect(isNpmVersionSpec('file:../dsh-tui')).toBe(false)
    expect(isNpmVersionSpec('workspace:*')).toBe(false)
  })
})

describe('shouldCheckForUpdate', () => {
  it('默认检查', () => {
    expect(shouldCheckForUpdate({})).toBe(true)
  })

  it('CI / VITEST / 显式跳过 时不检查', () => {
    expect(shouldCheckForUpdate({ CI: 'true' })).toBe(false)
    expect(shouldCheckForUpdate({ VITEST: 'true' })).toBe(false)
    expect(shouldCheckForUpdate({ DSH_TUI_SKIP_UPDATE: '1' })).toBe(false)
  })
})

describe('findProfileDir', () => {
  it('向上找到声明本包依赖的 profile，跳过本包自己的 package.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-tui-upd-'))
    const profile = join(root, 'profiles', 'tui')
    const pkgDir = join(profile, 'node_modules', '.pnpm', `${TUI_PACKAGE}@0.1.0-rc.6`, 'node_modules', TUI_PACKAGE)
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: TUI_PACKAGE, version: '0.1.0-rc.6' }))
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'dsh-profile-tui',
      dependencies: { [TUI_PACKAGE]: '0.1.0-rc.6' },
      dsh: { profile: { bundles: [TUI_PACKAGE] } },
    }))
    expect(findProfileDir(pkgDir)).toBe(profile)
  })

  it('找不到 profile 返回 undefined', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-tui-upd-none-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'unrelated' }))
    expect(findProfileDir(root)).toBeUndefined()
  })
})

describe('planSelfUpdate', () => {
  it('已是 latest → same', () => {
    expect(planSelfUpdate({
      env: {},
      currentVersion: '0.1.0-rc.7',
      profileDir: '/tmp/profile',
      installSpec: '0.1.0-rc.7',
      latest: '0.1.0-rc.7',
    })).toEqual({ action: 'skip', reason: 'same' })
  })

  it('npm 安装且 latest 不同 → update', () => {
    expect(planSelfUpdate({
      env: {},
      currentVersion: '0.1.0-rc.6',
      profileDir: '/tmp/profile',
      installSpec: '0.1.0-rc.6',
      latest: '0.1.0-rc.7',
    })).toEqual({ action: 'update', latest: '0.1.0-rc.7' })
  })

  it('github 安装不改写为 npm 包（避免把开发树降级）', () => {
    expect(planSelfUpdate({
      env: {},
      currentVersion: '0.1.0-rc.6',
      profileDir: '/tmp/profile',
      installSpec: 'github:huiliyi37/dsh-tianshu-tui',
      latest: '0.1.0-rc.7',
    })).toEqual({ action: 'skip', reason: 'not-npm' })
  })
})

describe('runSelfUpdate', () => {
  it('latest 更新时调用 install 并返回 updated', async () => {
    const install = vi.fn(async () => { })
    const result = await runSelfUpdate({
      env: {},
      currentVersion: '0.1.0-rc.6',
      profileDir: '/tmp/profile',
      installSpec: '0.1.0-rc.6',
      fetchLatest: async () => '0.1.0-rc.7',
      install,
    })
    expect(result).toEqual({ kind: 'updated', version: '0.1.0-rc.7' })
    expect(install).toHaveBeenCalledWith('0.1.0-rc.7', '/tmp/profile')
  })

  it('fetch 失败 → failed，不 install', async () => {
    const install = vi.fn(async () => { })
    const result = await runSelfUpdate({
      env: {},
      currentVersion: '0.1.0-rc.6',
      profileDir: '/tmp/profile',
      installSpec: '0.1.0-rc.6',
      fetchLatest: async () => { throw new Error('network') },
      install,
    })
    expect(result.kind).toBe('failed')
    expect(install).not.toHaveBeenCalled()
  })

  it('CI 环境 → noop', async () => {
    const install = vi.fn(async () => { })
    const result = await runSelfUpdate({
      env: { CI: 'true' },
      currentVersion: '0.1.0-rc.6',
      profileDir: '/tmp/profile',
      installSpec: '0.1.0-rc.6',
      fetchLatest: async () => '0.1.0-rc.7',
      install,
    })
    expect(result).toEqual({ kind: 'noop' })
    expect(install).not.toHaveBeenCalled()
  })
})

describe('updateNoticeText', () => {
  it('提示重启后生效', () => {
    expect(updateNoticeText('0.1.0-rc.7')).toBe('插件已更新到 0.1.0-rc.7，请重启 dsh 后生效')
  })
})
