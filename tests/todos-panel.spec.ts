import { describe, expect, it } from 'vitest'
import { projectTodosPanel } from '../src/format/todos-panel.js'

/** 宽敞宽度（截断路径单测单独覆盖）。 */
const WIDE = 80

describe('projectTodosPanel 空态与完成态（null 与 [] 语义区分）', () => {
  it('null（会话从未写入）→ 单行空态占位', () => {
    expect(projectTodosPanel(null, { width: WIDE, expanded: false })).toEqual([
      '📋 待办 ·（尚无待办）',
    ])
  })

  it('[]（模型已清空清单）→ 单行完成态，区别于空态', () => {
    expect(projectTodosPanel([], { width: WIDE, expanded: false })).toEqual([
      '📋 待办 · 全部完成 ✓',
    ])
  })
})

describe('projectTodosPanel 默认列表（进行中置顶、封 5 条）', () => {
  it('有进行中/待办 → 计数头（无 · 当前项）+ 进行中置顶的条目', () => {
    const todos = [
      { content: 'a', status: 'completed' as const },
      { content: 'b', status: 'in_progress' as const },
      { content: 'c', status: 'pending' as const },
    ]
    expect(projectTodosPanel(todos, { width: WIDE, expanded: false })).toEqual([
      '📋 待办 ✓1 ⏳1 □1',
      ' ⏳ b',
      ' [ ] c',
      ' [x] a',
    ])
  })

  it('全完成 → 仍只一行计数头，不铺条目', () => {
    const done = [
      { content: 'a', status: 'completed' as const },
      { content: 'b', status: 'completed' as const },
    ]
    expect(projectTodosPanel(done, { width: WIDE, expanded: false })).toEqual([
      '📋 待办 ✓2 ⏳0 □0',
    ])
  })

  it('条目超过 5 → 前 4 条 + 折叠尾行', () => {
    const todos = [
      { content: 'p1', status: 'pending' as const },
      { content: 'p2', status: 'pending' as const },
      { content: 'p3', status: 'pending' as const },
      { content: 'p4', status: 'pending' as const },
      { content: 'p5', status: 'pending' as const },
      { content: 'p6', status: 'pending' as const },
    ]
    const rows = projectTodosPanel(todos, { width: WIDE, expanded: false })
    expect(rows).toEqual([
      '📋 待办 ✓0 ⏳0 □6',
      ' [ ] p1',
      ' [ ] p2',
      ' [ ] p3',
      ' [ ] p4',
      '└ …(+2)',
    ])
  })

  it('恰好 5 条待办 → 全部列出、无折叠行', () => {
    const todos = [
      { content: 'a', status: 'pending' as const },
      { content: 'b', status: 'pending' as const },
      { content: 'c', status: 'pending' as const },
      { content: 'd', status: 'pending' as const },
      { content: 'e', status: 'pending' as const },
    ]
    const rows = projectTodosPanel(todos, { width: WIDE, expanded: false })
    expect(rows).toHaveLength(6)
    expect(rows.at(-1)).toBe(' [ ] e')
  })

  it('超宽条目按终端列数截断（… 收尾）', () => {
    const todos = [{ content: '很'.repeat(60), status: 'in_progress' as const }]
    const rows = projectTodosPanel(todos, { width: 20, expanded: false })
    expect(rows[1]!.endsWith('…')).toBe(true)
  })
})

describe('projectTodosPanel /todos all（不封 5 条、同样排序）', () => {
  it('展开渲染计数头 + 全部条目（进行中置顶）', () => {
    const todos = [
      { content: 'a', status: 'completed' as const },
      { content: 'b', status: 'in_progress' as const },
      { content: 'c', status: 'pending' as const },
    ]
    expect(projectTodosPanel(todos, { width: WIDE, expanded: true })).toEqual([
      '📋 待办 ✓1 ⏳1 □1',
      ' ⏳ b',
      ' [ ] c',
      ' [x] a',
    ])
  })

  it('all 看全表：6 条不折叠', () => {
    const todos = [
      { content: 'a', status: 'pending' as const },
      { content: 'b', status: 'pending' as const },
      { content: 'c', status: 'pending' as const },
      { content: 'd', status: 'pending' as const },
      { content: 'e', status: 'pending' as const },
      { content: 'f', status: 'pending' as const },
    ]
    const rows = projectTodosPanel(todos, { width: WIDE, expanded: true })
    expect(rows).toHaveLength(7)
    expect(rows.at(-1)).toBe(' [ ] f')
  })
})
