/**
 * architecture-guards.spec.ts — 架构守护：把设计约束变成红绿测试。
 *
 * 模式移植自上游 Tianshu-Tui src/__tests__/architecture-guards.test.ts（含
 * 「守护自检」——上游曾因一个 startsWith('') typo 让扫描器静默失效终生）。
 * 规则针对本仓（纯展示插件）裁剪：
 *
 * 1. stdout 单写层：src/ 全域禁止 process.stdout.write——渲染输出只经注入的
 *    WriteStream（engine/），任何旁路直写都会绕过 write-batcher 与 live 区
 *    行数记账，产生不可重放的输出。
 * 2. 子进程必须 windowsHide: true——Windows 上 spawn 不隐藏会在 conhost 弹出
 *    控制台窗口闪屏（git/剪贴板/图片链均短命子进程）。
 * 3. format/ + render/ 纯函数无 I/O：禁止 import child_process/fs/net/http——
 *    这两个目录的可测性建立在无副作用之上（CONTRIBUTING 代码规范）。
 * 4. 行数棘轮：BASELINE 表内文件只降不升（app.ts C4 拆分守门），表外文件
 *    ≤ REDLINE；幽灵基线（文件已删）直接红，防止基线指向空气。
 *
 * 扫描器是纯函数（虚拟语料输入），自检块用植入违规验证扫描器真的在工作。
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ── 语料收集 ─────────────────────────────────────────────────

interface SourceFile {
  path: string // 仓库相对路径
  lines: string[]
}

const SRC_ROOT = join(import.meta.dirname, '..', 'src')

function collectTsFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) collectTsFiles(full, acc)
    else if (name.endsWith('.ts')) acc.push(full)
  }
  return acc
}

function loadCorpus(root: string): SourceFile[] {
  return collectTsFiles(root).map(full => ({
    path: full.slice(root.length + 1),
    lines: readFileSync(full, 'utf-8').split('\n'),
  }))
}

/** 代码行 = 非注释行（//、*、/* 开头视为注释；字符串里的这类前缀误伤可忽略）。 */
function isCodeLine(line: string): boolean {
  const t = line.trimStart()
  return t !== '' && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
}

// ── 规则 1：stdout 单写层 ─────────────────────────────────────

function findStdoutWrites(corpus: SourceFile[]): Array<{ path: string; line: number }> {
  const hits: Array<{ path: string; line: number }> = []
  for (const f of corpus) {
    f.lines.forEach((line, i) => {
      if (isCodeLine(line) && line.includes('process.stdout.write')) {
        hits.push({ path: f.path, line: i + 1 })
      }
    })
  }
  return hits
}

// ── 规则 2：子进程 windowsHide ────────────────────────────────

const SPAWN_RE = /\b(spawn|spawnSync|execFile|execFileSync|execFileAsync)\s*\(/
const SCAN_WINDOW = 8 // 调用行起向后看 N 行，覆盖跨行 options 对象

function findSpawnsWithoutWindowsHide(corpus: SourceFile[]): Array<{ path: string; line: number }> {
  const hits: Array<{ path: string; line: number }> = []
  for (const f of corpus) {
    f.lines.forEach((line, i) => {
      if (!isCodeLine(line) || !SPAWN_RE.test(line)) return
      const window = f.lines.slice(i, i + SCAN_WINDOW)
      if (!window.some(l => l.includes('windowsHide'))) {
        hits.push({ path: f.path, line: i + 1 })
      }
    })
  }
  return hits
}

// ── 规则 3：format/ + render/ 纯函数无 I/O ────────────────────

const IO_IMPORT_RE = /from\s+['"]node:(child_process|fs|fs\/promises|net|http|https|dgram|dns)['"]/

/** 规则 3：只扫指定目录前缀下的文件。 */
function findIoImportsIn(corpus: SourceFile[], prefixes: string[]): Array<{ path: string; line: number }> {
  const hits: Array<{ path: string; line: number }> = []
  for (const f of corpus) {
    if (!prefixes.some(p => f.path.startsWith(p))) continue
    f.lines.forEach((line, i) => {
      if (isCodeLine(line) && line.trimStart().startsWith('import') && IO_IMPORT_RE.test(line)) {
        hits.push({ path: f.path, line: i + 1 })
      }
    })
  }
  return hits
}

// ── 规则 4：行数棘轮 ─────────────────────────────────────────

/** 只降不升的豁免表（历史单体；C4 拆分推进时更新下限，不许升）。
 *  ui/app.ts 3998 = P1 偏好层/历史持久化接线重置（同期对冲提取 git-status /
 *  exportCurrentTheme / glance-metrics 三件后仍 +31；此后继续只降不升）。
 *  ui/app.ts 4002 = #39 技能展示面提取重置（对冲提取 controllers/skill-surface.ts
 *  约 130 行后仍 +4；此后继续只降不升）。
 *  ui/app.ts 4028 / registry 993 = #40 主题重放（rerenderHistory/renderHistoryRows
 *  + onThemeChanged 装配）重置——aa800bb 落地时未更新基线（多会话 rebase 后
 *  未重跑守护，本批复核修正）；此后继续只降不升。
 *  ui/app.ts 4032 = PR #37/#38 会话短标签统一（shortSessionLabel 模块化）合并
 *  净 +4；此后继续只降不升。
 *  ui/app.ts 4060 = 回流 tianshu d860ff5f8e（剪贴板位图预算管线两路由收敛 +
 *  焦点去抖接线 + attachClipboardImage 助手）净 +28 重置；此后继续只降不升。
 *  ui/app.ts 4077 = 回流 tianshu ba1d1bc942（slash 菜单行计入动态段高水位
 *  记账）净 +17 再重置；此后继续只降不升。
 *  ui/app.ts 4089 = 回流 tianshu bc5cec1359（syncSlashHints：外部插件经
 *  tui.commands 构造后注册的斜杠提示重投影）净 +12 三度重置；此后继续只降不升。
 *  ui/app.ts 4145 = 回流 tianshu 3037e91c71(部分)+a7b8f63392（/todos 紧凑待办
 *  面板：显隐/明细字段 + slash 注册 + 保留快照吸收 + 快照/组合器接线）净 +56
 *  四度重置；此后继续只降不升。
 *  ui/app.ts 4169 / registry 1001 = 回流 tianshu /key 供应商配置（key-dialog/
 *  key-flow 装配提取后 app 仍 +24：构造接线/字段/deps 注入；registry +8：
 *  /key /login 命令 + deps 声明 + BUILTIN_COMMAND_NAMES）五度重置；此后继续
 *  只降不升。
 *  ui/app.ts 4198 = 审查修复（/key 键路由分支 + pasteClipboardIntoKeyDialog +
 *  首启引导挂载）净 +29 六度重置；此后继续只降不升。
 *  ui/app.ts 4280 = 回流 tianshu 6eb1c5bfd3（半块图片预览：commitHalfBlockImages
 *  气泡回退 + refreshAttachmentPreview composer 缩略图 + previewBackground +
 *  onImagesChange 消费 + 输入轨渲染）净 +82 七度重置；此后继续只降不升。 */
const MAX_LINES_BASELINE: Readonly<Record<string, number>> = {
  'ui/app.ts': 4280, // C4 拆分目标：只降不升；2026-08-22 两度重置（d860ff5f8e 剪贴板管线 +28 / ba1d1bc942 slash 高水位记账 +17）；回流 bc5cec1359 syncSlashHints +12、3037e91c71+a7b8f63392 /todos 面板 +56 再两度重置；回流 /key（key-flow 装配提取后仍 +24）五度重置；审查修复（键路由/粘贴/首启）六度重置；回流图片预览（气泡回退/缩略图/渲染）七度重置——回流 UI 接线无再提取面
  'pi/latex-to-unicode.ts': 2076, // 数据表 port，实质不拆
  'engine/input-line.ts': 1561, // 天枢长文本优化整文件同步（146 行：视觉行导航/翻页/逻辑行域/阈值），2026-08-20 重置；回流 tianshu 85c17784a4 imageSummary 空行键位提示 +3，2026-08-22 再重置
  'commands/registry.ts': 1001, // P1 /theme auto|export 988 → #40 onThemeChanged 993 → 回流 /key（/key /login 命令 + deps 声明）1001
}
const MAX_LINES_REDLINE = 750

function lineCount(f: SourceFile): number {
  const n = f.lines.length
  return f.lines[n - 1] === '' ? n - 1 : n
}

function findLineCountViolations(
  corpus: SourceFile[],
  baselineTable: Readonly<Record<string, number>> = MAX_LINES_BASELINE,
): string[] {
  const msgs: string[] = []
  const paths = new Set(corpus.map(f => f.path))
  for (const path of Object.keys(baselineTable)) {
    if (!paths.has(path)) msgs.push(`幽灵基线：${path} 已删除，请从 MAX_LINES_BASELINE 移除`)
  }
  for (const f of corpus) {
    const n = lineCount(f)
    const baseline = baselineTable[f.path]
    if (baseline !== undefined) {
      if (n > baseline) msgs.push(`${f.path} ${n} 行超过基线 ${baseline}（棘轮只降不升）`)
    } else if (n > MAX_LINES_REDLINE) {
      msgs.push(`${f.path} ${n} 行超过红线 ${MAX_LINES_REDLINE}——拆分后加入 MAX_LINES_BASELINE 或收敛`)
    }
  }
  return msgs
}

// ── 语料与规则执行 ───────────────────────────────────────────

const corpus = loadCorpus(SRC_ROOT)

describe('架构守护 · 规则执行', () => {
  it('src 全域无 process.stdout.write（stdout 单写层经注入 WriteStream）', () => {
    expect(findStdoutWrites(corpus)).toEqual([])
  })

  it('所有子进程调用携带 windowsHide: true（Windows 不弹控制台窗口）', () => {
    expect(findSpawnsWithoutWindowsHide(corpus)).toEqual([])
  })

  it('format/ 与 render/ 无 I/O 型 import（纯函数纪律）', () => {
    expect(findIoImportsIn(corpus, ['format/', 'render/'])).toEqual([])
  })

  it(`行数棘轮：表外 ≤ ${MAX_LINES_REDLINE} 行，表内只降不升，无幽灵基线`, () => {
    expect(findLineCountViolations(corpus)).toEqual([])
  })
})

describe('架构守护 · 自检（扫描器必须真的在工作）', () => {
  const fakeCorpus: SourceFile[] = [
    { path: 'engine/fake.ts', lines: ["const x = 1", "process.stdout.write('boom')"] },
    { path: 'engine/fake2.ts', lines: ["// process.stdout.write('commented')", 'spawnSync("git", ["status"])'] },
    { path: 'format/fake.ts', lines: ["import { readFileSync } from 'node:fs'"] },
    { path: 'ui/big.ts', lines: new Array<string>(MAX_LINES_REDLINE + 1).fill('x') },
    { path: 'ui/baseline.ts', lines: new Array<string>(MAX_LINES_BASELINE['ui/app.ts']! + 1).fill('x') },
  ]

  it('stdout 扫描器捕获植入违规且跳过注释行', () => {
    const hits = findStdoutWrites(fakeCorpus)
    expect(hits).toEqual([{ path: 'engine/fake.ts', line: 2 }])
  })

  it('spawn 扫描器捕获缺 windowsHide 的调用', () => {
    const hits = findSpawnsWithoutWindowsHide(fakeCorpus)
    expect(hits).toEqual([{ path: 'engine/fake2.ts', line: 2 }])
  })

  it('I/O import 扫描器按目录前缀过滤', () => {
    const hits = findIoImportsIn(fakeCorpus, ['format/'])
    expect(hits).toEqual([{ path: 'format/fake.ts', line: 1 }])
  })

  it('行数棘轮捕获超线与超基线，并识别幽灵基线', () => {
    const msgs = findLineCountViolations(fakeCorpus, { 'ui/baseline.ts': 10, 'ui/deleted.ts': 5 })
    expect(msgs.some(m => m.includes('ui/big.ts'))).toBe(true)
    expect(msgs.some(m => m.includes('ui/baseline.ts') && m.includes('只降不升'))).toBe(true)
    expect(msgs.some(m => m.includes('幽灵基线'))).toBe(true)
  })

  it('语料非空且规模合理（扫描器没有静默扫到 0 个文件）', () => {
    expect(corpus.length).toBeGreaterThan(100)
    // 与 git ls-files 交叉验证：工作树未提交的新 .ts 也会被扫到
    const gitFiles = execFileSync('git', ['ls-files', '--', 'src/'], { encoding: 'utf-8', windowsHide: true })
      .split('\n')
      .filter(f => f.endsWith('.ts') && f.startsWith('src/'))
    expect(corpus.length).toBeGreaterThanOrEqual(gitFiles.length)
  })
})
