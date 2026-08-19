/**
 * startup-memory.spec.ts — 启动内存预算：import 构建 bundle 后的 RSS 红线。
 *
 * 模式移植自上游 Tianshu-Tui src/__tests__/startup-memory.test.ts：子进程
 * `--max-old-space-size=256` 下 import `lib/index.js`（tsdown 单 bundle + peer
 * 解析链），exit 钩子吐 RSS，断言不超预算。谁在模块顶层 import 重依赖
 * （node-pty/markdown-it 一类）立刻红——这是单 bundle 插件最廉价的永久保险。
 *
 * 基线（2026-08-16 darwin/node24 实测）≈66MB（bundle + cordis peer 链）；
 * 预算 130MB ≈ 2× 余量（容忍 CI 平台/Node 版本差异，只拦数量级回归）。
 * import 失败不豁免：bundle-contract spec 已保证可加载，这里失败同样是回归。
 */
import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const RSS_BUDGET_MB = 130

// 子进程 -e 脚本无 import.meta——bundle 绝对路径在 spec（模块）侧解析后嵌入
const BUNDLE = join(import.meta.dirname, '..', 'lib', 'index.js')

const PROBE = `
process.on('exit', () => console.log('RSS_MB=' + Math.round(process.memoryUsage().rss / 1024 / 1024)))
import(${JSON.stringify(BUNDLE)})
  .then(() => process.exit(0))
  .catch((err) => { console.error('IMPORT_FAIL ' + (err && err.message)); process.exit(0) })
`

describe('启动内存预算（import lib/index.js）', () => {
  it(`RSS ≤ ${RSS_BUDGET_MB}MB（基线 ~66MB，2× 余量）`, async () => {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--max-old-space-size=256', '-e', PROBE],
      { timeout: 60_000, encoding: 'utf-8', windowsHide: true },
    )
    expect(stderr).not.toContain('IMPORT_FAIL')
    const m = /RSS_MB=(\d+)/.exec(stdout)
    expect(m, `stdout 应含 RSS_MB=NN，实际：${stdout}`).not.toBeNull()
    const rss = Number(m![1])
    expect(rss).toBeLessThanOrEqual(RSS_BUDGET_MB)
  }, 90_000)
})
