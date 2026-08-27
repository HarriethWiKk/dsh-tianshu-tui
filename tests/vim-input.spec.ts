/**
 * vim-input.spec.ts — issue #51 vi/vim 编辑键位（对标 Claude Code interactive-mode
 * Vim 键位表 + Gemini CLI vi 基线）。覆盖：模式切换、motions、count、operators、
 * 文本对象、字符查找与 ;/, 重放、寄存器 p/P（含行级）、`.` 重放、undo/redo、
 * visual 模式（端点含字符语义）、'/' 历史搜索钩子、折叠粘贴原子性、开关复位。
 */
import { describe, expect, it } from 'vitest'
import { InputLine } from '../src/engine/input-line.js'
import { BUILTIN_COMMAND_NAMES } from '../src/commands/registry.js'
import { parsePrefs } from '../src/prefs.js'

/** 打字序列工具：`hi<esc>` → 逐键 handleKey。 */
function typeKeys(il: InputLine, seq: string): void {
  for (const ch of seq) {
    if (ch === '\x1b') il.handleKey('escape', '', false, false, false)
    else if (ch === '\r') il.handleKey('return', '', false, false, false)
    else il.handleKey(ch === ' ' ? 'space' : 'unknown', ch, false, false, false)
  }
}

function named(il: InputLine, name: string): void {
  il.handleKey(name, '', false, false, false)
}

function makeVim(value = ''): InputLine {
  const il = new InputLine({})
  il.setVimEnabled(true)
  // 注意：InputLine 构造默认光标在末尾；vim 用例统一从 0 起步（需要别的起点时再显式 setValue）
  if (value !== '') il.setValue(value, 0)
  return il
}

describe('vim · 模式切换', () => {
  it('默认 insert；Esc 进 normal，h/x 键位生效', () => {
    const il = new InputLine({})
    expect(il.vimMode).toBe('insert')
    il.setVimEnabled(true)
    typeKeys(il, 'hi')
    expect(il.value).toBe('hi')
    expect(il.cursor).toBe(2)
    typeKeys(il, '\x1b') // → normal
    expect(il.vimMode).toBe('normal')
    typeKeys(il, 'x') // 删光标下字符 'i'……光标在末尾时 x 无动作
    expect(il.value).toBe('hi')
    typeKeys(il, 'h') // h 左移到 'i'
    expect(il.cursor).toBe(1)
    typeKeys(il, 'x')
    expect(il.value).toBe('h')
  })

  it('normal 下 Enter 直接提交', () => {
    const submitted: string[] = []
    const il = new InputLine({ value: 'draft', onSubmit: (v) => { submitted.push(v) } })
    il.setVimEnabled(true)
    typeKeys(il, '\x1b\r')
    expect(submitted).toEqual(['draft'])
    expect(il.value).toBe('')
  })

  it('停用即复位 insert；停用前吞掉的半截 count 不复活', () => {
    const il = makeVim()
    typeKeys(il, '\x1b3') // 3 被当数字前缀消费，不进缓冲
    expect(il.value).toBe('')
    il.setVimEnabled(false)
    typeKeys(il, 'ab')
    expect(il.value).toBe('ab')
    expect(il.vimMode).toBe('insert')
  })

  it('连续 Esc 无害且不产生假动作', () => {
    const il = makeVim('abc')
    typeKeys(il, '\x1b')
    const before = `${il.value}@${il.cursor}`
    typeKeys(il, '\x1b\x1b\x1b')
    expect(`${il.value}@${il.cursor}`).toBe(before)
  })
})

describe('vim · motions', () => {
  it('l/w/b/e 词内与词间步进（ASCII）', () => {
    const il = makeVim()
    //        012345678901
    il.setValue('foo.bar baz', 3) // 光标在 '.'
    typeKeys(il, '\x1bl') // → bar 的 b
    expect(il.value[il.cursor]).toBe('b')
    typeKeys(il, 'w') // baz 词首
    expect(il.cursor).toBe(8)
    typeKeys(il, 'b') // 回 '.' 簇头
    expect(il.cursor).toBe(4)
    typeKeys(il, 'e') // '.' 已是自身簇尾 → 下一非空簇(bar)尾 r
    expect(il.cursor).toBe(6)
    expect(il.value[il.cursor]).toBe('r')
  })

  it('w/b 按中文连续段成词', () => {
    const il = makeVim()
    il.setValue('写代码 排查', 0)
    typeKeys(il, '\x1bw')
    expect(il.value.slice(il.cursor, il.cursor + 2)).toBe('排查')
    typeKeys(il, 'b')
    expect(il.cursor).toBe(0)
  })

  it('W/B/E 大词只按空白切分', () => {
    const il = makeVim()
    il.setValue('a-b cd', 0)
    typeKeys(il, '\x1bW')
    expect(il.cursor).toBe(4)
    typeKeys(il, 'B')
    expect(il.cursor).toBe(0)
    typeKeys(il, 'E')
    expect(il.cursor).toBe(2)
    expect(il.value[il.cursor]).toBe('b')
  })

  it('0 $ ^ gg G 行内与全缓冲定位', () => {
    const il = makeVim()
    //   '  ab' len4 + \n=5 起 'cdefgh'(6) → 总长 11，行尾 pos=11
    il.setValue('  ab\ncdefgh', 5)
    typeKeys(il, '\x1b0')
    expect(il.cursor).toBe(5)
    typeKeys(il, '$')
    expect(il.cursor).toBe(11)
    typeKeys(il, '^') // 行首列 0 即第一个非空白
    expect(il.cursor).toBe(5)
    typeKeys(il, 'gg')
    expect(il.cursor).toBe(0)
    typeKeys(il, 'G')
    expect(il.cursor).toBe(11)
  })

  it('多行 j/k 保持 grapheme 列并夹边', () => {
    const il = makeVim()
    il.setValue('abc\nxyzw', 1)
    typeKeys(il, '\x1bj')
    expect(il.value[il.cursor]).toBe('y')
    typeKeys(il, 'k')
    expect(il.value[il.cursor]).toBe('b')
    typeKeys(il, 'jjj') // 已在最下行：继续 j 不动
    expect(il.value[il.cursor]).toBe('y')
  })

  it('单行草稿 j/k 走历史兜底（对齐 CC 边缘翻历史）', () => {
    const hist = makeVim()
    hist.setHistory(['older'])
    typeKeys(hist, '\x1bk')
    expect(hist.value).toBe('older')
    typeKeys(hist, 'j')
    expect(hist.value).toBe('')
  })

  it('方向键/Home/End 在 normal 态可用', () => {
    const il = makeVim()
    il.setValue('ab', 1)
    typeKeys(il, '\x1b')
    named(il, 'left')
    expect(il.cursor).toBe(0)
    named(il, 'right')
    expect(il.cursor).toBe(1)
    named(il, 'home')
    expect(il.cursor).toBe(0)
    named(il, 'end')
    expect(il.cursor).toBe(2)
  })
})

describe('vim · 数字前缀与 undo/redo', () => {
  it('3w 链式推进；2fo 第二次命中；独立 0 是行首 motion', () => {
    const w = makeVim('one two three four five')
    typeKeys(w, '\x1b3w')
    expect(w.cursor).toBe(14)
    const f = makeVim('xoxoxox')
    typeKeys(f, '\x1b2fo')
    expect(f.cursor).toBe(3)
    const z = makeVim('abcd')
    typeKeys(z, '\x1bl0')
    expect(z.cursor).toBe(0)
  })

  it('2dd 与 u / Ctrl+R 往返', () => {
    const il = makeVim()
    il.setValue('l1\nl2\nl3', 0)
    typeKeys(il, '\x1b2dd') /* eslint-disable-next-line no-console */
    if (il.value !== 'l3') throw new Error(`probe 2dd: ${JSON.stringify(il.value)} mode=${il.vimMode}`)
    expect(il.value).toBe('l3')
    typeKeys(il, 'u')
    expect(il.value).toBe('l1\nl2\nl3')
    named(il, 'ctrl_r')
    expect(il.value).toBe('l3')
  })
})

describe('vim · operators（d/c/y × motion）', () => {
  it('dw/de/db 三向删词', () => {
    const dw = makeVim('foo bar')
    typeKeys(dw, '\x1bdw')
    expect(dw.value).toBe('bar')
    const de = makeVim('foo bar')
    typeKeys(de, '\x1bde')
    expect(de.value).toBe(' bar')
    const db = makeVim('foo bar')
    db.setValue('foo bar', 4)
    typeKeys(db, '\x1bdb')
    expect(db.value).toBe('bar') // 吞掉前词与间隔空格
    const dB = makeVim('a-b cd')
    dB.setValue('a-b cd', 4)
    typeKeys(dB, '\x1bdB')
    expect(dB.value).toBe('cd')
  })

  it('yw 寄存器 + P 前插', () => {
    const il = makeVim('alpha beta')
    typeKeys(il, '\x1bywP')
    expect(il.value).toBe('alpha alpha beta')
  })

  it('yiw 之后 NORMAL p 在光标后插入寄存器内容', () => {
    const il = makeVim('one')
    typeKeys(il, '\x1byiw$p')
    expect(il.value).toBe('oneone')
  })

  it('D/C 行尾删除/改写；C 落 insert', () => {
    const d = makeVim()
    d.setValue('keep me', 2)
    typeKeys(d, '\x1bD')
    expect(d.value).toBe('ke')
    expect(d.vimMode).toBe('normal')
    const c = makeVim()
    c.setValue('keep me', 2)
    typeKeys(c, '\x1bC!')
    expect(c.value).toBe('ke!')
    expect(c.vimMode).toBe('insert')
  })

  it('s 替换单字符进 insert；S 清整行；cc 清多行收敛为单编辑位', () => {
    const s = makeVim('abc')
    typeKeys(s, '\x1bsZ\x1b')
    expect(s.value).toBe('Zbc')
    const S = makeVim()
    S.setValue('old line', 3)
    typeKeys(S, '\x1bSnew\x1b')
    expect(S.value).toBe('new')
    const cc = makeVim()
    cc.setValue('aa\nbb\ncc', 4)
    typeKeys(cc, '\x1bccZZ\x1b')
    expect(cc.value).toBe('aa\nZZ\ncc')
  })

  it('o/O 上下开行；J 以单空格合并下行', () => {
    const o = makeVim('top')
    typeKeys(o, '\x1boBOT\x1b')
    expect(o.value).toBe('top\nBOT')
    const O = makeVim('bot')
    typeKeys(O, '\x1bOTOP\x1b')
    expect(O.value).toBe('TOP\nbot')
    const j = makeVim('a\n   b')
    typeKeys(j, '\x1bJ')
    expect(j.value).toBe('a b')
  })

  it('x/X/r 的计数版；r 不跨换行', () => {
    const x = makeVim('abcdef')
    typeKeys(x, '\x1b3x')
    expect(x.value).toBe('def')
    const X = makeVim()
    X.setValue('abcdef', 3)
    typeKeys(X, '\x1b2X')
    expect(X.value).toBe('adef')
    const r = makeVim('aaaa')
    typeKeys(r, '\x1b2rb')
    expect(r.value).toBe('bbaa')
    const rn = makeVim('a\nb')
    typeKeys(rn, '\x1brz')
    expect(rn.value).toBe('z\nb')
  })

  it('diw/daw/ciw 文本对象（区别右邻空白归属）', () => {
    const diw = makeVim('aa bb')
    diw.setValue('aa bb', 3)
    typeKeys(diw, '\x1bdiw')
    expect(diw.value).toBe('aa ')
    const daw = makeVim('aa bb')
    daw.setValue('aa bb', 3)
    typeKeys(daw, '\x1bdaw')
    expect(daw.value).toBe('aa')
    const ciw = makeVim('say hi')
    ciw.setValue('say hi', 4)
    typeKeys(ciw, '\x1bciwhello\x1b')
    expect(ciw.value).toBe('say hello')
  })

  it('d$ 删到行尾；dgG/d$-族行级到顶/到底', () => {
    const d$ = makeVim('ab cd')
    d$.setValue('ab cd', 3)
    typeKeys(d$, '\x1bd$')
    expect(d$.value).toBe('ab ')
    const dG = makeVim()
    dG.setValue('head\ntail', 0)
    typeKeys(dG, '\x1bdG')
    expect(dG.value).toBe('')
    const three = makeVim()
    three.setValue('a\nb\nc', 2)
    typeKeys(three, '\x1bdgg')
    expect(three.value).toBe('c') // 从光标行删到首行（含两端）
    const yG = makeVim()
    yG.setValue('aa\nbb', 0)
    typeKeys(yG, '\x1byGp')
    // yG 行级取两行；p 在当前行（首行）下方整体重贴
    expect(yG.value.split('\n')).toEqual(['aa', 'aa', 'bb', 'bb'])
  })
})

describe('vim · 字符查找与 ;/, 重放', () => {
  it('f/t 独立跳转（t 落目标前一格）；;/, 重放与反向', () => {
    //        0123456789
    const f = makeVim()
    f.setValue('-a-a-a-', 0)
    typeKeys(f, '\x1bfa') // 命中 1、3、5
    expect(f.cursor).toBe(1)
    typeKeys(f, ';')
    expect(f.cursor).toBe(3)
    typeKeys(f, ';')
    expect(f.cursor).toBe(5)
    typeKeys(f, ',')
    expect(f.cursor).toBe(3)
    typeKeys(f, ';') // 第 4 次重放仍取最后一个可用命中（超量 clamp）
    expect(f.cursor).toBe(5)
    const t = makeVim()
    t.setValue('-a-b-', 0)
    typeKeys(t, '\x1btb') // t 落最近 b 的前一格（位置 3-1）
    expect(t.cursor).toBe(2)
    const miss = makeVim('abc')
    typeKeys(miss, '\x1bfz')
    expect(miss.cursor).toBe(0)
  })

  it('df 吞目标字符、dt 留目标字符；dF/dT 反向对称', () => {
    const df = makeVim('key=value')
    typeKeys(df, '\x1bdf=')
    expect(df.value).toBe('value')
    const dt = makeVim('key=value')
    typeKeys(dt, '\x1bdt=')
    expect(dt.value).toBe('=value')
    const dF = makeVim()
    dF.setValue('a:b:c', 4)
    typeKeys(dF, '\x1bdF:')
    expect(dF.value).toBe('a:bc') // 光标紧邻目标：仅吞冒号自身
    const dFfar = makeVim()
    dFfar.setValue('AB:mid:C', 5)
    typeKeys(dFfar, '\x1bdF:')
    expect(dFfar.value).toBe('ABd:C') // 连同中间字符一起删

    const dT = makeVim()
    dT.setValue('a:XYC', 4) // 光标压在 C 上
    typeKeys(dT, '\x1bdT:')
    expect(dT.value).toBe('a:C') // 不吞 ':' 与光标字符，吃掉其间 XY
  })
})

describe('vim · `.` 重放', () => {
  it('纯变更命令可重复（x/dd/r 变体）', () => {
    const x = makeVim('aaaa bb')
    typeKeys(x, '\x1bx.')
    expect(x.value).toBe('aa bb')
    const dd = makeVim('l1\nl2\nl3')
    typeKeys(dd, '\x1bdd.') // dd 清一行，`.` 再清一行
    expect(dd.value).toBe('l3')
    const r = makeVim('zzqq ww')
    typeKeys(r, '\x1bra.')
    expect(r.value).toBe('azqq ww')
  })

  it('插入段一体复现：o 开行 + 键入文本重放两份', () => {
    const il = makeVim('head')
    typeKeys(il, '\x1bo tail\x1b.')
    expect(il.value.split('\n')).toEqual(['head', ' tail', ' tail'])
    // 若上方失败且实际为 ['head',' tail','']，说明 insert 段文本未被 '.' 复播（引擎缺陷）
  })

  it('insert 内出现删除则放弃保真：. 不复活残文', () => {
    const il = makeVim()
    typeKeys(il, '\x1biBC') // 进 insert 打字 BC
    named(il, 'backspace') // 非顺序改动 → 保真失败
    typeKeys(il, 'D\x1b.') // 继续键入 D 后离开；. 应为空操作
    expect(il.value).toBe('BD')
  })
})

describe('vim · visual 模式', () => {
  it('v+e 选区含两端字符，d 入内部寄存器（不走 OSC52）', () => {
    const il = makeVim('hello world')
    typeKeys(il, '\x1bve') // 锚点0、光标落到词尾 o；端点含字符语义覆盖整词
    typeKeys(il, 'd')
    expect(il.value).toBe(' world')
    expect(il.takeClipboardOut()).toBeNull()
  })

  it('visual c 改写选区并落 insert', () => {
    const il = makeVim()
    il.setValue('XY Z', 0)
    typeKeys(il, '\x1bvlcAB\x1b')
    expect(il.value).toBe('AB Z')
  })

  it('V 行选择 d 剪整行；p 行级粘回下方', () => {
    const il = makeVim()
    il.setValue('a1\nb2\nc3', 0)
    typeKeys(il, '\x1bVjd')
    expect(il.value).toBe('c3')
    const two = makeVim()
    two.setValue('a1\nb2', 0)
    typeKeys(two, '\x1byyjp')
    expect(two.value).toBe('a1\nb2\na1')
  })

  it('~ u U 对选区做大小写变换（含落点字符）；r- 批量替换', () => {
    // 选区两端字符都属选区：ve 落到词尾字符 c，其右侧不越界
    const tl = makeVim()
    tl.setValue('aBc x', 0)
    typeKeys(tl, '\x1bve~')
    expect(tl.value).toBe('AbC x')
    const lo = makeVim()
    lo.setValue('ABC X', 0)
    typeKeys(lo, '\x1bveu')
    expect(lo.value).toBe('abc X')
    const up = makeVim()
    up.setValue('abc X', 0)
    typeKeys(up, '\x1bveU')
    expect(up.value).toBe('ABC X')
    const rr = makeVim('abcd efgh')
    typeKeys(rr, '\x1bver-')
    expect(rr.value).toBe('---- efgh')
  })

  it('o 交换端点后光标跳选区另一侧', () => {
    const il = makeVim()
    il.setValue('abcdef', 0)
    typeKeys(il, '\x1bvllo')
    expect(il.cursor).toBe(0)
    expect(il.vimMode).toBe('visual')
  })

  it('v 再按退出 visual 回 normal', () => {
    const il = makeVim('xyz')
    typeKeys(il, '\x1bvv')
    expect(il.vimMode).toBe('normal')
  })
})

describe("vim · '/' 历史搜索钩子", () => {
  it("NORMAL '/' 触发宿主回调一次且不改值；insert 态 '/' 是普通字符", () => {
    let calls = 0
    const il = new InputLine({ onOpenHistorySearch: () => { calls++ } })
    il.setVimEnabled(true)
    typeKeys(il, '/')
    expect(calls).toBe(0) // insert 态正常键入
    expect(il.value).toBe('/')
    typeKeys(il, '\x1b/')
    expect(calls).toBe(1)
    expect(il.value).toBe('/')
  })
})

describe('vim · 折叠粘贴标记跨模式原子性', () => {
  it('标记整体是一个 grapheme 单元：normal X 一口气吃掉', () => {
    const il = new InputLine({})
    il.setVimEnabled(true)
    const long = Array.from({ length: 120 }, (_, i) => `line${i}`).join('\n')
    il.insertText(long)
    expect(il.value.startsWith('[paste #1 +')).toBe(true)
    const markerLen = il.value.length
    typeKeys(il, '\x1bX')
    expect(markerLen).toBeGreaterThan(15)
    expect(il.value.length).toBe(0)
  })
})

describe('vim · 配置面', () => {
  it('BUILTIN_COMMAND_NAMES 含 vim（前缀解析/提示锚定）', () => {
    expect(BUILTIN_COMMAND_NAMES).toContain('vim')
  })

  it('prefs 解析接受布尔 vimEnabled、拒绝形状不符', () => {
    expect(parsePrefs(JSON.stringify({ vimEnabled: true })).vimEnabled).toBe(true)
    expect(parsePrefs(JSON.stringify({ vimEnabled: 'yes' })).vimEnabled).toBeUndefined()
  })
})
