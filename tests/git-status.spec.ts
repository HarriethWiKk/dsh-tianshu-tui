/**
 * git-status — 提取后的 git 探测契约（exec 注入，不落真实子进程）。
 *
 * 行为等价自 ui/app.ts 原内联三函数：静默降级 + detached/空分支语义 + ●N 计数。
 */
import { describe, expect, it } from 'vitest'
import { gitBranch, gitDirtyCount, isGitRepo } from '../src/git-status.js'

describe('isGitRepo', () => {
  it('exit 0 → true；抛错 → false', () => {
    expect(isGitRepo(() => 'true')).toBe(true)
    expect(isGitRepo(() => { throw new Error('not a repo') })).toBe(false)
  })
})

describe('gitBranch', () => {
  it('正常输出分支名（trim）', () => {
    expect(gitBranch(() => '  main\n')).toBe('main')
  })

  it('detached HEAD / 空输出 / 失败 → undefined', () => {
    expect(gitBranch(() => 'HEAD')).toBeUndefined()
    expect(gitBranch(() => '  \n')).toBeUndefined()
    expect(gitBranch(() => { throw new Error('no git') })).toBeUndefined()
  })
})

describe('gitDirtyCount', () => {
  it('非空行计数（空行/空白行不计）', () => {
    const out = ' M src/a.ts\n?? b.txt\n\n   \nA  c.ts\n'
    expect(gitDirtyCount(() => out)).toBe(3)
  })

  it('干净树 → 0；失败 → 0', () => {
    expect(gitDirtyCount(() => '')).toBe(0)
    expect(gitDirtyCount(() => { throw new Error('x') })).toBe(0)
  })

  it('真实子进程路径在本仓（git 仓库）可用：isGitRepo true', () => {
    // 缺省 exec 走真实 git——本仓是 git 仓库，探针应成功（跨平台稳：不依赖分支状态）
    expect(isGitRepo()).toBe(true)
  })
})
