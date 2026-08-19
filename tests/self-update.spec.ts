/**
 * 启动自更新：npm latest 比已装版本新时，在 profile 目录 pnpm add。
 * CI / 非 npm 安装（github/link/file）跳过，避免测试和开发树误升级。
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  TUI_PACKAGE,
  UPDATE_CACHE_TTL_MS,
  fetchLatestWithCache,
  fetchNpmLatest,
  findProfileDir,
  isCacheFresh,
  isNpmVersionSpec,
  npmRegistryCandidates,
  planSelfUpdate,
  readUpdateCache,
  runSelfUpdate,
  shouldCheckForUpdate,
  updateNoticeText,
  writeUpdateCache,
  autoRestartNoticeText,
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

  it('autoRestartNoticeText 提示自动重启', () => {
    expect(autoRestartNoticeText('0.1.0-rc.7')).toBe('插件已更新到 0.1.0-rc.7，正在自动重启…')
  })
})

describe('更新检查磁盘缓存（免每启联网）', () => {
  function cacheFile(): string {
    return join(mkdtempSync(join(tmpdir(), 'dsh-update-cache-')), 'update-cache.json')
  }

  it('write/read 往返 + isCacheFresh 新鲜度判定', () => {
    const p = cacheFile()
    const now = 1_700_000_000_000
    writeUpdateCache(p, '0.1.2-rc.11', now)
    const cached = readUpdateCache(p)
    expect(cached).toEqual({ timestamp: now, latest: '0.1.2-rc.11' })
    expect(isCacheFresh(cached!, now + UPDATE_CACHE_TTL_MS - 1)).toBe(true)
    expect(isCacheFresh(cached!, now + UPDATE_CACHE_TTL_MS)).toBe(false)
    expect(isCacheFresh(cached!, now - 5_000), '时钟回拨到写入前视为新鲜').toBe(true)
  })

  it('read 容错：缺失 / 损坏 JSON / 形状不对 → null', () => {
    const dir = dirname(cacheFile())
    expect(readUpdateCache(join(dir, 'missing.json'))).toBeNull()
    const corrupt = join(dir, 'corrupt.json')
    writeFileSync(corrupt, '{not json')
    expect(readUpdateCache(corrupt)).toBeNull()
    const wrongShape = join(dir, 'wrong.json')
    writeFileSync(wrongShape, JSON.stringify({ timestamp: 'x', latest: 1 }))
    expect(readUpdateCache(wrongShape)).toBeNull()
  })

  it('fetchLatestWithCache：新鲜缓存零联网（fetchNet 不被调用）', async () => {
    const p = cacheFile()
    const now = 1_700_000_000_000
    writeUpdateCache(p, '0.1.2-rc.11', now)
    const fetchNet = vi.fn(async () => { throw new Error('不该联网') })
    const latest = await fetchLatestWithCache({ cachePath: p, now: now + 1_000, fetchNet })
    expect(latest).toBe('0.1.2-rc.11')
    expect(fetchNet).not.toHaveBeenCalled()
  })

  it('fetchLatestWithCache：缓存缺失 → 联网并原子回写', async () => {
    const p = cacheFile()
    const now = 1_700_000_000_000
    const latest = await fetchLatestWithCache({ cachePath: p, now, fetchNet: async () => '0.1.2-rc.12' })
    expect(latest).toBe('0.1.2-rc.12')
    expect(readUpdateCache(p)).toEqual({ timestamp: now, latest: '0.1.2-rc.12' })
  })

  it('fetchLatestWithCache：缓存过期 → 重新联网并覆盖旧值', async () => {
    const p = cacheFile()
    const old = 1_700_000_000_000
    writeUpdateCache(p, '0.1.2-rc.11', old)
    const latest = await fetchLatestWithCache({
      cachePath: p,
      now: old + UPDATE_CACHE_TTL_MS + 1,
      fetchNet: async () => '0.1.2-rc.12',
    })
    expect(latest).toBe('0.1.2-rc.12')
    expect(readUpdateCache(p)?.latest).toBe('0.1.2-rc.12')
  })

  it('fetchLatestWithCache：网络失败 → null，不回退旧值也不回写', async () => {
    const p = cacheFile()
    const old = 1_700_000_000_000
    writeUpdateCache(p, '0.1.2-rc.11', old)
    const latest = await fetchLatestWithCache({
      cachePath: p,
      now: old + UPDATE_CACHE_TTL_MS + 1,
      fetchNet: async () => null,
    })
    expect(latest).toBeNull()
    expect(readUpdateCache(p)?.latest, '旧缓存保留（下次仍可判旧鲜度）').toBe('0.1.2-rc.11')
  })

  it('runSelfUpdate 集成：cachePath + now 注入，新鲜缓存生效不联网', async () => {
    const p = cacheFile()
    const now = 1_700_000_000_000
    writeUpdateCache(p, '0.1.2-rc.11', now)
    const install = vi.fn(async () => { })
    const result = await runSelfUpdate({
      env: {},
      currentVersion: '0.1.2-rc.10',
      profileDir: '/tmp/profile',
      installSpec: '0.1.2-rc.10',
      install,
      cachePath: p,
      now: () => now + 60_000, // 缓存仍新鲜 → 真实路径直接用缓存，零联网
    })
    expect(result).toEqual({ kind: 'updated', version: '0.1.2-rc.11' })
    expect(install).toHaveBeenCalledWith('0.1.2-rc.11', '/tmp/profile')
  })
})

describe('registry 镜像回退链（#43：官方源直连超时）', () => {
  it('npmRegistryCandidates：缺省官方 + npmmirror；env 覆盖支持逗号多源', () => {
    expect(npmRegistryCandidates({})).toEqual(['https://registry.npmjs.org', 'https://registry.npmmirror.com'])
    expect(npmRegistryCandidates({ DSH_TUI_UPDATE_REGISTRY: 'https://r.local' })).toEqual(['https://r.local'])
    expect(npmRegistryCandidates({ DSH_TUI_UPDATE_REGISTRY: 'https://a , https://b' })).toEqual(['https://a', 'https://b'])
    expect(npmRegistryCandidates({ DSH_TUI_UPDATE_REGISTRY: '  ' })).toEqual(['https://registry.npmjs.org', 'https://registry.npmmirror.com'])
  })

  it('首源超时 → 回退镜像源拿到版本', async () => {
    const urls: string[] = []
    const fetchImpl = (async (url: string | URL | Request) => {
      urls.push(String(url))
      if (String(url).startsWith('https://registry.npmjs.org')) {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      }
      return new Response(JSON.stringify({ version: '0.1.2-rc.11' }), { status: 200 })
    }) as unknown as typeof fetch
    const v = await fetchNpmLatest(TUI_PACKAGE, 50, { fetchImpl })
    expect(v).toBe('0.1.2-rc.11')
    expect(urls.some(u => u.includes('registry.npmmirror.com'))).toBe(true)
  })

  it('全部源网络错 → 抛最后错误（保持启动 warning 语义）', async () => {
    const fetchImpl = (async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    }) as unknown as typeof fetch
    await expect(fetchNpmLatest(TUI_PACKAGE, 50, { fetchImpl })).rejects.toThrow('aborted')
  })

  it('首源 200 无 version → 继续下一源；全部无 version → null（no-latest 静默）', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      return calls === 1
        ? new Response(JSON.stringify({}), { status: 200 })
        : new Response(JSON.stringify({ version: '1.2.3' }), { status: 200 })
    }) as unknown as typeof fetch
    expect(await fetchNpmLatest(TUI_PACKAGE, 50, { fetchImpl })).toBe('1.2.3')

    const empty = (async () => new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch
    expect(await fetchNpmLatest(TUI_PACKAGE, 50, { fetchImpl: empty })).toBeNull()
  })
})
