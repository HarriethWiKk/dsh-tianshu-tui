/**
 * 发布契约：github: / npm 安装读的是 lib/*.js，不是 src。
 * harness 仓根包 @deepseek-ai/dsh-root 不发布；bundle 一旦 import 它，真实安装必炸
 * （https://github.com/huiliyi37/dsh-tianshu-tui/issues/1）。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const UNPUBLISHED_ROOT = '@deepseek-ai/dsh-root'
const BUNDLES = ['lib/index.js', 'lib/invariant.js'] as const

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function gitIgnored(rel: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', rel], { cwd: ROOT })
    return true
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 1) {
      return false
    }
    throw error
  }
}

function importSpecifiers(code: string): string[] {
  const specifiers: string[] = []
  const fromRe = /\bfrom\s+["']([^"']+)["']/g
  const sideRe = /^import\s+["']([^"']+)["']/gm
  for (const re of [fromRe, sideRe]) {
    for (const match of code.matchAll(re)) {
      const spec = match[1]
      if (spec !== undefined) specifiers.push(spec)
    }
  }
  return specifiers
}

describe('published bundle contract', () => {
  const pkg = JSON.parse(readRepo('package.json')) as {
    peerDependencies: Record<string, string>
    dependencies: Record<string, string>
  }
  const allowedDeepseek = new Set(Object.keys(pkg.peerDependencies))
  const allowedRuntime = new Set(Object.keys(pkg.dependencies))

  for (const rel of BUNDLES) {
    it(`${rel} is tracked so github: installs do not rebuild inside the harness workspace`, () => {
      expect(gitIgnored(rel), `${rel} is gitignored; github clones will have no entry`).toBe(false)
    })

    it(`${rel} never imports unpublished ${UNPUBLISHED_ROOT}`, () => {
      const code = readRepo(rel)
      expect(code).not.toContain(UNPUBLISHED_ROOT)
      expect(importSpecifiers(code)).not.toContain(UNPUBLISHED_ROOT)
    })

    it(`${rel} only imports published peers, runtime deps, or node builtins`, () => {
      const unexpected = importSpecifiers(readRepo(rel)).filter((spec) => {
        if (spec.startsWith('node:')) return false
        if (allowedRuntime.has(spec)) return false
        if (spec.startsWith('@deepseek-ai/')) return !allowedDeepseek.has(spec)
        return true
      })
      expect(unexpected).toEqual([])
    })
  }
})
