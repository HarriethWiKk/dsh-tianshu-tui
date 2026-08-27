/**
 * T9 VimInput — 输入行 vim 键位引擎（issue #51）。
 *
 * 键位对标（外部竞品基准，2026-08-27）：
 * - Claude Code interactive-mode 的 Vim 模式表（主基准）：
 *   h j k l Space / w e b W B E / 0 $ ^ / gg G / f F t T ; , /
 *   x X dd D dw de db cc C cw ce cb s S yy Y yw ye yb p P J u . 、
 *   文本对象 iw aw iW aW；数字前缀 count；visual v/V 及同族 motion 与操作。
 * - Gemini CLI vi 基线：Esc 进 NORMAL、基础导航与行首尾（真子集，自动覆盖）。
 *
 * 有意偏差（CC 有、本输入框不做）：>< 缩进、引号/括号文本对象、m 标记、
 * 块选择 Ctrl+V、宏 q、寄存器切换 "。'/' 不做行内搜索而是打开历史搜索 overlay
 * （对齐 CC「/ = 反向历史搜索」注记）。`.` 重放覆盖本引擎产生的全部变更命令；
 * insert 段记录「进入步骤 + 连续键入文本」，出现删除/粘贴等破坏性插入即放弃记录。
 *
 * 架构：纯状态机 + 注入宿主面（VimHost）。引擎只认「缓冲值 + 光标 + 少量突变
 * 原语」；undo 快照由 host.spliceRange 统一记录，`.` 重放闭包复用同一条管线
 * （重放即普通编辑，天然可再撤销）。词类扫描走 code-point 粒度（\w/CJK 均 BMP），
 * 单字符增删与横向移动使用宿主 grapheme 步进（折叠粘贴标记保持原子）。
 */
/** 引擎对宿主的窄依赖面（由 InputLine 实现为内联适配器）。 */
export interface VimHost {
    /** 当前缓冲文本快照。 */
    value(): string;
    cursor(): number;
    /** 纯光标移动（host 负责 sealUndo 与重绘通知）。 */
    moveCursor(pos: number): void;
    /**
     * 区间替换原语：记一条 undo 单元并通知变化。
     * cursorAfter 缺省 = start + replacement.length（钳到新长度）。
     */
    spliceRange(start: number, end: number, replacement: string, kind: 'delete' | 'replace', cursorAfter?: number): void;
    /** 写 yank 寄存器（仅内部剪贴板；不走 OSC52——与 Alt+W 复制语义区分）。 */
    setRegister(text: string): void;
    /** 读 yank 寄存器。 */
    register(): string;
    /** 撤销/重做一次（复用 InputLine 的 fish 式栈）。返回是否有变化。 */
    undoOnce(): boolean;
    redoOnce(): boolean;
    /** grapheme 步进（host 实现含折叠粘贴标记原子语义）。 */
    nextGrapheme(pos: number): number;
    prevGrapheme(pos: number): number;
    /** 进入 visual 并以当前光标为锚点。 */
    beginVisual(linewise: boolean): void;
    /** 结束 visual 落回 normal 或 insert（c/s 类），锚点由 host 折叠。 */
    exitVisual(to: 'normal' | 'insert'): void;
    /**
     * visual 选区（linewise 对齐后的 buffer 偏移）+ 锚点；无选区为 null。
     * anchor 供引擎判断选区端点归属——vim 语义下光标与锚点所在字符都属选区，
     * 消费端需按方向补足含字符窗口。
     */
    selection(): {
        start: number;
        end: number;
        linewise: boolean;
        anchor: number;
    } | null;
    /** o：交换选区两端点（仅 visual 内有意义）。 */
    swapVisualEnds(): void;
    /** 是否处于 linewise visual（V 进入）。 */
    isLinewiseVisual(): boolean;
    /**
     * 进入 insert。prepare 在切模式前执行（o/O 开行、cc 清行等前置 splice 各自记 undo）。
     * 返回后 host 保证 vimMode === 'insert'。
     */
    enterInsert(prepare?: () => void): void;
    /** 切回 normal（`.` 重放插入段收尾调用）。 */
    setModeNormal(): void;
    /** NORMAL 模式 '/'：打开历史搜索 overlay；宿主未接线时为 no-op。 */
    openHistorySearch(): void;
    /** 行边缘/单行草稿的历史兜底（对齐 CC「边缘翻历史」）。返回是否有变化。 */
    historyFallback(direction: 'prev' | 'next'): boolean;
}
/** 单次按键处理结果：handled = 发生了可感知变化（触发重绘）；none = 无动作。 */
export type VimKeyResult = 'handled' | 'none';
export declare class VimInput {
    private readonly host;
    private count;
    private pendingOp;
    private awaitG;
    private awaitFind;
    private awaitReplace;
    /** 文本对象二级等待：操作符后的 i|a 已敲入，等对象字母 w/W。 */
    private awaitObjectOuter;
    /** 操作符等待下的 gg 二段键。 */
    private awaitOperatorG;
    private lastFind;
    private dotSteps;
    private replaying;
    private insertPrefix;
    private insertText;
    private insertOk;
    constructor(host: VimHost);
    /** 运行时关停 vim 键位时复位全部 pending 态（防止半截解析吞后续按键）。 */
    reset(): void;
    handleNormal(name: string, ch: string, ctrl: boolean): VimKeyResult;
    handleVisual(name: string, ch: string, _ctrl: boolean): VimKeyResult;
    /** insert 模式里每次顺序键入回调（累积 `.` 材料）。 */
    captureTyping(ch: string): void;
    /** insert 模式里任何非顺序改动（删除/粘贴/补全）→ `.` 保真失败，放弃记录。 */
    markInsertDirty(): void;
    /** Esc 离开 insert 时封口：前缀步骤 + 文本段落合成一条 `.` 记录。 */
    finalizeInsertRepeat(): void;
    private value;
    private cursor;
    private splitCache;
    private linesCache;
    private lines;
    private lineIndexOf;
    private lineStart;
    private lineEndPos;
    private firstNonBlank;
    private jumpTo;
    private nav;
    private changedIf;
    private lineJump;
    private takeCount;
    /** Esc：清空全部待续解析态（不产生可感知变化）。 */
    private cancelPending;
    private hGraphN;
    private classP;
    /** w/W：下一词簇词首（EOF 夹紧；相对起点无进展则原地）。 */
    private fwdWord;
    private stepNextRaw;
    /** b/B：上一词簇词首（含「从词簇内部跳回簇首」）。 */
    private backWord;
    private rawPrev;
    /** e/E：词尾字符（所在簇尚未尽则当簇尾；已到簇尾则下一非空簇尾）。 */
    private fwdWordEnd;
    private countChain;
    private vChainExtend;
    private dollarMotion;
    /** 行边缘 j/k → 单行草稿翻历史兜底（对齐 CC）。 */
    private edgeNav;
    private moveLineClamped;
    private vMove;
    private historyFallbackResult;
    /**
     * 逻辑行内第 times 次命中解析。
     * cursorPos = 独立跳转落点（t 落目标前一格、T 落后一格）；
     * winStart/winEnd = 操作符删除窗口：f/F 连目标字符一起吞（through），
     * t/T 停在相邻格不吞。找不到返回 null（原地不动）。
     */
    private resolveFind;
    /** 独立跳转路径的 find 解析。 */
    private finishFind;
    /** 操作符挂载的 find：对 [winStart,winEnd) 应用 d/c/y。 */
    private finishOpFind;
    private repeatFind;
    private continueOperator;
    /**
     * 操作符 × 行级终点（dG/y2G/cgg 族）：光标行与目标行取并集后交给既有
     * 行级窗口命令——复用 dd/cc 的 EOF/换行收边逻辑，避免第三套实现。
     */
    private opLinewise;
    private opSpan;
    /** 多步链式区间；cw 特判 == ce（词上单跳改写）。 */
    private chainSpan;
    /** 反向 motion 链（db/3dB）：起点固定光标，终点为链式回退结果。 */
    private chainBack;
    private resolveObject;
    private applySpanCommand;
    private linewiseWindow;
    private linewiseDelete;
    /**
     * cc/S：清空 n 行内容、寄存器行级化、落回行首进 insert。
     * 窗口 = 各行内容与其间换行（末行自身换行/EOF 结构保留）——多行 cc 收敛为
     * 单一空白编辑位，与 vim 行为一致。
     */
    private changeLines;
    private lineStartOfLine;
    private linewiseYank;
    private replaceUnderCursor;
    private toggleCaseChar;
    private transformLine;
    private deleteChars;
    private substituteChars;
    private toLineEndDeleteOrChange;
    private openRelative;
    private joinLines;
    private pasteRegister;
    private recordAndRun;
    private replayDot;
    private enterInsertFrom;
    /**
     * visual 选区消费窗口：charwise 按 vim「两端所在字符都含」补格；
     * linewise 直接用宿主对齐结果。无选区返回 null。
     */
    private selSpan;
    private vExtend;
    private visualCut;
    private visualYank;
    private visualPaste;
    private visualReplaceWith;
    private visualTransform;
    private visualJoin;
}
