/**
 * T9 InputLine — 纯 TypeScript 类，替代 base-text-input.tsx / input.tsx。
 *
 * 管理输入文本缓冲区、光标位置、历史、Vim 模式。
 * 零 React/Ink 依赖。通过回调通知外部变化。
 *
 * 核心能力：
 * - 字符输入 + 多字节 UTF-8 支持
 * - 光标移动（左右/home/end/词级）
 * - 删除（backspace/delete/词级删除）
 * - 历史导航（上下键）
 * - 行内编辑（Ctrl+A/E/U/K/W）
 * - Vim 模式（Normal/Insert）
 * - Tab 补全接口
 * - 粘贴支持
 */
export type InputLineEvent = {
    type: 'change';
    value: string;
    cursor: number;
} | {
    type: 'submit';
    value: string;
    images?: string[];
} | {
    type: 'tab';
} | {
    type: 'history';
    direction: 'prev' | 'next';
};
/** InputLine 构造参数（初始状态 + 变化/提交/补全回调）。 */
export interface InputLineOptions {
    /** 初始文本值 */
    value?: string;
    /** 占位符文本（当 value 为空时显示） */
    placeholder?: string;
    /** 历史记录（最新的在前） */
    history?: string[];
    /** 是否启用 Vim 模式 */
    vimEnabled?: boolean;
    /** 回调 */
    onChange?: (value: string, cursor: number) => void;
    onSubmit?: (value: string, images?: string[]) => void;
    /**
     * Tab 补全回调（Phase 6.3 接入点）：Tab 键命中时先调用，返回 true 表示
     * 已消费（补全应用）；返回 false 表示未处理，InputLine 照常发出 'tab' 事件。
     */
    onTabComplete?: () => boolean;
    /** 最大输入长度 */
    maxLength?: number;
    /** 初始图片附件 data URL 列表 */
    images?: string[];
    /** 图片附件变化回调 */
    onImagesChange?: (images: string[]) => void;
    /**
     * vim NORMAL 模式 '/' 的宿主钩子：打开历史搜索 overlay（issue #51 对齐 CC）。
     * 未注入时 '/' 在 normal 态为 no-op。
     */
    onOpenHistorySearch?: () => void;
}
/**
 * 输入框可视行上限：长草稿不占满整屏。
 * @param rows - 终端行数。
 * @returns 至少 3、至多 16，约 `rows / 3`。
 */
export declare function inputViewportMaxLines(rows: number): number;
/** displayLines / displayLinesWithCaret 的视窗裁剪参数。 */
export interface InputLineDisplayOptions {
    /** Maximum display rows to return. When exceeded, keep the cursor line visible. */
    maxLines?: number;
    /** Maximum display columns per line. When the cursor line exceeds this width,
     *  a horizontal viewport centered on the cursor is shown instead of truncating
     *  from the start (which hides the text the user is actively typing at the end). */
    maxWidth?: number;
}
/** Vim 键位模式（vimEnabled 时生效；insert 为非 vim 行为的默认态）。 */
export type VimMode = 'normal' | 'insert' | 'visual';
/**
 * 纯 TypeScript 输入行状态机：管理文本缓冲区、光标、历史、选区、undo/redo、
 * 图片附件与 Vim 模式，零 React/Ink 依赖。按键经 handleKey 进入，
 * 状态变化通过构造时注入的回调通知外部。
 */
export declare class InputLine {
    private _value;
    private _cursor;
    private _placeholder;
    private _history;
    private _historyIdx;
    private _vimEnabled;
    private _vimMode;
    private _maxLength;
    /** 手工换行：Enter 插入 \\n 而不是提交（粘贴流结束的 return 仍提交）。 */
    private _newlineMode;
    /** 最近一次 displayLines 的折行宽度；↑↓/PgUp 按视觉行移动。 */
    private _wrapWidth;
    /** 最近一次 displayLines 的可视行上限；PageUp/Down 按此翻页。 */
    private _maxDisplayLines;
    /** 图片附件 data URL 列表 */
    private _images;
    /** Grapheme 边界缓存（按 value 失效）。光标移动不改 value，命中缓存省去 O(n) 分段。 */
    private _graphemeCache;
    private onChangeCallback?;
    private onSubmitCallback?;
    private onTabCompleteCallback?;
    private onImagesChangeCallback?;
    private onOpenHistorySearchCallback?;
    /** vim 键位引擎（issue #51）：normal/visual 按键与 `.` 重放状态都收敛在这里。 */
    private _vim;
    /** undo 栈（改前快照）。submit 后清空——上一条输入的文本不得被下一条撤销复活。 */
    private _undoStack;
    /** 栈内快照滞留的总字符数（配合 UNDO_TOTAL_CHARS_MAX 防护内存长尾）。 */
    private _undoChars;
    /** redo 栈（undo 目标态快照）。任何新编辑（recordUndo）清空——redo 分支失效。 */
    private _redoStack;
    private _redoChars;
    /** 当前未封口单元 kind（仅 insert-word 参与合并）。 */
    private _undoOpen;
    /** 合并继续时光标应处的位置（插入点右缘）；不符即封口。 */
    private _undoExpectCursor;
    /** 翻历史前的在输草稿（P1-2 shell 式往返恢复）。 */
    private _draft;
    /** 折叠粘贴原文旁路：标记序号 → 原文。提交时展开还原（expandPastes）。 */
    private _pastes;
    private _pasteSeq;
    /** 非 bracketed paste 终端的粘贴流累积：内联 return 的行内容（不含换行），
     *  流结束（普通 return）时按 \n 合并为一次提交。bracketed paste 整段经
     *  onPaste 到达、不触发累积；Vim normal 的 return 同样走合并（一致性）。 */
    private _inlinePasteLines;
    /** 粘贴流合并提交：累积行 + 当前行并为一次多行提交；无累积行则原样提交。 */
    private submitFlushingPasteLines;
    /** 选区锚点（shift+方向键设定）；null = 无选区。选区 = [min(anchor,cursor), max)。 */
    private _selAnchor;
    /** vim visual linewise 标记（V 进入时为 true，v 进入/退出 visual 时复位）。 */
    private _visualLineWise;
    /** 内部剪贴板（Alt+Y yank / vim p）；系统剪贴板经 OSC52（_clipboardOut → app drain）。 */
    private _clipboard;
    /** 待 app 写出 OSC52 的剪贴文本（takeClipboardOut 取走后清空）。 */
    private _clipboardOut;
    /** ghost 预览文本（slash 菜单选中命令的补全剩余/参数占位）；null = 不显示。 */
    private _ghost;
    constructor(options?: InputLineOptions);
    /** 当前文本值。 */
    get value(): string;
    /** 光标位置（buffer code-unit 偏移）。 */
    get cursor(): number;
    /** 当前 Vim 模式（vimEnabled 为 false 时恒为 insert）。 */
    get vimMode(): VimMode;
    /** Vim 键位是否启用。 */
    get vimEnabled(): boolean;
    /** 占位符文本（value 为空时显示）。 */
    get placeholder(): string;
    /**
     * 运行时替换空输入占位提示（如 Ctrl+C 连按退出的临时提示）。
     * @param value - 新占位符文本。
     */
    setPlaceholder(value: string): void;
    /** 手工换行模式：Enter 插入换行；粘贴流（非 bracketed paste）结束时并入草稿不提交。 */
    get newlineMode(): boolean;
    /**
     * 开关手工换行模式。
     * @param enabled - true 时普通 Enter 插入 \\n。
     */
    setNewlineMode(enabled: boolean): void;
    /** 图片附件 data URL 列表（防御性拷贝）。 */
    get images(): string[];
    /**
     * 启用/停用 vim 键位。停用或启用时都复位到 insert 模式，避免残留 normal 态吞字符；
     * 引擎 pending 解析态一并清空（半截 count/操作符不得跨开关滞留）。
     * @param enabled - 是否启用 vim 键位
     */
    setVimEnabled(enabled: boolean): void;
    /** visual 模式是否为 linewise（V 进入；charwise v 为 false）。渲染 `-- VISUAL LINE --` 用。 */
    get visualLineWise(): boolean;
    /**
     * 多行渲染：返回输入框的显示行数组。
     * - 空值时显示 placeholder（首行）
     * - 光标行以 `❯ ` 前缀标识（高亮行），其余行缩进对齐
     * - 光标位置以 `█` 标记
     * - 当 maxWidth 给出时，长逻辑行按显示宽度软换行，避免前文被水平视窗遮盖。
     *   maxLines 仍按光标所在视觉行裁剪，保证正在编辑的位置始终可见。
     * @param options - 视窗裁剪参数（maxLines/maxWidth）
     * @returns 输入框显示行数组
     */
    displayLines(options?: InputLineDisplayOptions): string[];
    /**
     * displayLines + 光标 cell 坐标（2026-07-23 IME 硬件光标归位）。
     *
     * 返回的 caret 是「光标格左缘」位置（#50 反色光标：行中为反色原字符格，行尾为块 █）：line 为返回数组下标，
     * col 为 0-based cell 数（含 `❯ ` 前缀，按 ambiguousAsWide 口径度量，
     * 与 renderInputRow/rowsForLine 同尺）。调用方把硬件光标搬到该行该列，
     * 终端 IME 候选窗即锚定在输入框内（自绘光标终端不可见）。
     * @param options - 视窗裁剪参数（maxLines/maxWidth）
     * @returns 显示行数组 + 光标 cell 坐标（line 为数组下标，col 为 0-based cell）
     */
    displayLinesWithCaret(options?: InputLineDisplayOptions): {
        lines: string[];
        caret: {
            line: number;
            col: number;
        };
    };
    /**
     * 设置 ghost 预览文本（显示在光标后、dim 色；不影响值/光标/宽度计算）。
     * 幂等：相同文本不触发重渲染状态变化。
     * @param text - ghost 文本；null 关闭。
     */
    setGhost(text: string | null): void;
    /**
     * 设置值（外部更新用）。覆盖式写入（粘贴/补全/审批填充等）记为独立 undo 单元。
     * @param value - 新文本值（超过 maxLength 截断）
     * @param cursor - 新光标位置（钳到值长度内）；缺省置于末尾
     */
    setValue(value: string, cursor?: number): void;
    /**
     * 追加文本到末尾，光标移到追加内容之后。
     * @param text - 要追加的文本
     */
    append(text: string): void;
    /**
     * 在光标处插入文本（用于 bracketed paste），光标移动到插入内容之后。
     * 命中折叠阈值的长粘贴收纳为原子标记 `[paste #N +M lines]`（原文旁路存储）。
     * @param text - 要插入的文本；空串为 no-op
     */
    insertText(text: string): void;
    /**
     * 提交前把折叠粘贴标记还原为原文（用户手输的同名标记无原文则原样保留）。
     * @param text - 可能含粘贴标记的文本
     * @returns 标记展开后的文本
     */
    expandPastes(text: string): string;
    /**
     * 添加图片附件（data URL）。
     * @param dataUrl - 图片 data URL
     */
    addImage(dataUrl: string): void;
    /**
     * 移除指定索引的图片附件；越界索引为 no-op。
     * @param index - 要移除的附件下标
     */
    removeImage(index: number): void;
    /** 清空图片附件。 */
    clearImages(): void;
    /**
     * 图片占位摘要，用于 ANSI 渲染。
     * @param maxWidth - 摘要最大宽度；超宽时截断加省略号
     * @returns 摘要行数组；无附件时为空数组
     */
    imageSummary(maxWidth?: number): string[];
    /**
     * 设置历史记录（最新的在前，供上下键导航）。
     * @param history - 历史条目列表
     */
    setHistory(history: string[]): void;
    /** 选区范围（start<end，buffer code-unit 偏移）；无选区或锚点=光标时 null。
     *  vim visual linewise（V）时对齐整行：start=起始行行首，end=结束行行尾——
     *  删除/复制/高亮自动行级化。 */
    get selectionRange(): {
        start: number;
        end: number;
    } | null;
    /**
     * 取走待 OSC52 写出的剪贴文本（app 渲染循环 drain），取走后清空。
     * @returns 待写出的剪贴文本；无待写内容时为 null
     */
    takeClipboardOut(): string | null;
    private collapseSelection;
    /** Shift+←/→/Home/End：锚定（首次）并移动光标扩展选区。 */
    private extendSelection;
    /** Backspace/Delete（有选区）：删除选区（独立 undo 单元）。 */
    private deleteSelection;
    /** Ctrl+K（有选区）：剪切选区 → 内部剪贴板 + OSC52 drain。 */
    private cutSelection;
    /** Alt+W：复制选区 → 内部剪贴板 + OSC52 drain（不删除，复制后折叠选区）。 */
    private copySelection;
    /** Alt+Y：yank 内部剪贴板（直插不走粘贴折叠；setValue 记 undo）。 */
    private yankClipboard;
    /**
     * 处理按键：按全局键 → 选区 → vim 模式 → insert 模式的优先级路由。
     * @param name - 按键语义名称（InputHandler 的 KeyName）
     * @param char - 可打印字符；控制键为 ''
     * @param ctrl - Ctrl 是否按下
     * @param meta - Alt/Meta 是否按下
     * @param shift - Shift 是否按下
     * @param inline - 该 return 后同一输入缓冲还有后续字节（非 bracketed paste
     *   终端的粘贴流行分隔；见 InputHandler KeyPress.inline）。
     * @returns 产生的事件（change/submit/tab/history）；按键未引起变化时为 null
     */
    handleKey(name: string, char: string, ctrl: boolean, meta: boolean, shift?: boolean, inline?: boolean): InputLineEvent | null;
    /**
     * 改值前记录 undo 单元（改前快照）。仅 insert-word 在光标连续时合并
     * （不新增单元）；其余 kind 每次独立成元。kind 切换即自然封口。
     */
    private recordUndo;
    /** 纯光标移动/模式切换：封口袋前单元（不产生新单元）。 */
    private sealUndo;
    /** fish 式撤销：弹出最近单元恢复 {value, cursor}。Ctrl+- / Ctrl+Z。 */
    private undo;
    /** 重做：恢复最近一次 undo 前的状态。Ctrl+Y。 */
    private redo;
    /**
     * 提交后重置缓冲：清空文本、归零光标、复位历史游标、清空图片附件。
     * 不触发 onChangeCallback —— submit 路径自己负责后续渲染，
     * 避免在 submit 回调里又触发一次 change 渲染造成竞态。
     */
    private clearAfterSubmit;
    private insertChar;
    private backspace;
    private deleteForward;
    private deleteToStart;
    private deleteToEnd;
    private deleteWordBack;
    private deleteWordForward;
    private moveLeft;
    private moveRight;
    /** insert 模式里的非顺序改动（删除/粘贴/补全/历史跳转）→ `.` 放弃保真记录。 */
    private noteVimInsertEdit;
    /** 光标左侧最近的 grapheme 边界。 */
    private prevGrapheme;
    /** 光标右侧最近的 grapheme 边界。 */
    private nextGrapheme;
    /** 任意位置起左移一步的 grapheme 边界（vim 引擎宿主面用）。 */
    private prevGraphemeAt;
    /** 任意位置起右移一步的 grapheme 边界。 */
    private nextGraphemeAt;
    /** 当前 value 的 grapheme 边界（按 value 缓存，纯光标移动命中缓存）。
     *  折叠粘贴标记为原子单位：标记内部的边界被剔除，光标/删除整体越过。 */
    private graphemeBounds;
    private moveHome;
    private moveEnd;
    private moveWordLeft;
    private moveWordRight;
    /** 当前光标的（行,列），列以 grapheme 计（CJK/emoji/组合簇不被拆开）。 */
    private getLineCol;
    /** 由（行,grapheme 列）还原 code-unit 偏移，col 超出行长则贴到行尾。 */
    private posFromLineCol;
    /** 逻辑行 `line` 内 code-unit 偏移 → 整段 buffer 偏移。 */
    private absolutePos;
    /**
     * 按显示宽度把一行切成视觉行起点（不含自绘 █）。
     * @param logical - 一条逻辑行（不含换行符）。
     * @param maxContentWidth - 去掉 `❯ ` 前缀后的内容列数。
     */
    private visualRowStarts;
    /** 全部逻辑行展开后的视觉行（start/end 为该逻辑行内偏移）。 */
    private collectVisualRows;
    /**
     * 在软折行与逻辑行之间移动。单视觉行且无换行时交给历史上翻。
     * @param delta - 负上正下；越界夹到两端（不翻历史）。
     */
    private tryMoveVisual;
    /** Up：有折行或多行时上移视觉行，否则取上一条历史。 */
    private moveUpOrHistory;
    /** Down：有折行或多行时下移视觉行，否则取下一条历史。 */
    private moveDownOrHistory;
    /** PageUp/PageDown：按最近一次视窗行数翻页；单行短草稿不翻历史。 */
    private movePage;
    private historyPrev;
    private historyNext;
    private ensureVim;
    private prevWordStart;
    private nextWordEnd;
}
