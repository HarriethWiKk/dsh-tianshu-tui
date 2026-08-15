/**
 * T9 LiveEngine — 管理终端底部动态区域（live region）的增量重绘。
 *
 * 核心机制：
 * - 在渲染 live region 之前，用 `cursor save` 保存滚动位置。
 * - 渲染时：上移到 live region 起始行 → 逐行擦除 + 重写 → 恢复光标。
 * - live region 永远只占底部 N 行（通常 5-20 行），远小于终端高度。
 * - streaming 内容由 BlockStreamWriter 控制，超出的部分已经 commit 到 scrollback。
 *
 * **Display-row awareness**: 所有行数追踪使用 visual display rows（wrapping-aware），
 * 而非 logical line count。一个 200 字符的行在 80 列终端占 3 display rows。
 * cursorUp / erase / lastDisplayRows 全部基于 display rows，防止 wrap 行导致
 * cursor 定位偏差 → ghost 行 / 重复渲染。
 *
 * 与 Ink 的区别：
 * - Ink 在 live region >= terminal rows 时执行 `\x1B[2J` 全屏清屏，
 *   LiveEngine 永远不会触发全屏清屏——live region 被严格限制在底部。
 */
import type { WriteStream } from 'node:tty';
/** live region 的一行（单逻辑行契约；嵌入换行会被 normalizeLines 兜底展开）。 */
export interface LiveRegionLine {
    /** 该行的 ANSI 格式化文本（包含颜色码） */
    text: string;
    /** 可选：截断指示符 */
    truncated?: boolean;
    /**
     * 可选：输入框软件光标（█）左侧的 0-based cell 列（2026-07-23 IME 锚定）。
     * 终端 IME 候选窗锚定【硬件光标】而非自绘 █——帧末把硬件光标搬到该行该列，
     * 组词串才会出现在输入框内（kimi-code pi-tui 同款机制，结构字段替代其零宽
     * APC marker：不污染文本、不干扰 displayWidth 行数计量）。normalize/rowBudget
     * 均 {...l} 透传该字段。
     */
    caretCol?: number;
}
/** LiveEngine 构造参数。 */
export interface LiveEngineOptions {
    stdout: WriteStream;
    /** 预留行数（输入行等需要始终可见的行） */
    reservedRows?: number;
    /** 最大 live region 行数（安全上限，防止意外超屏） */
    maxRows?: number;
    /**
     * CPR 探针请求回调（通常写 `\x1B[6n` 到 stdout）。响应经 stdin 回到
     * InputHandler，再喂给 {@link LiveEngine.noteCpr}。提供后启用外来写入检测。
     */
    onProbeRequest?: () => void;
    /** 检测到 live region 被外来写入污染（光标偏离驻停点）时回调——调用方应重渲染。 */
    onPolluted?: () => void;
}
/**
 * 溢出裁剪 + 定高垫高：把 `[0, chromeStart)` 的动态段（spinner / thinking /
 * streaming tail / 工具卡片）限制在恰好 `budget` display rows。
 *
 * 规则：
 * - `budget <= 0`：原样返回（欢迎首帧不垫，避免凭空空白）。
 * - 动态段 > budget：从**顶部**截掉最旧行（approval / 提问等关键内容位于动态段
 *   尾部，天然优先保留）。
 * - 动态段 < budget：在动态内容与 chrome 之间垫空行，使动态段恰好占 budget。
 *   内容贴上、输入框贴下；live overlay 高度稳定，避免回缩留下输入框重影与
 *   屏底黑洞。
 *
 * @param lines - live region 全部行（动态段在前，chrome 在后）
 * @param chromeStart - chrome 段起始下标（`[0, chromeStart)` 为动态段）
 * @param budget - 动态段目标高度（display rows）；≤0 时原样返回
 * @param rowsForLine - 单行 display rows 度量（wrapping-aware）；默认每行 1 row
 * @returns 裁剪/垫高后的行数组与新的 chromeStart
 */
export declare function padDynamicRegion(lines: readonly LiveRegionLine[], chromeStart: number, budget: number, rowsForLine?: (text: string) => number): {
    lines: LiveRegionLine[];
    chromeStart: number;
};
/**
 * live 区行上限：固定 28 在小终端上会让全量重写的 cursorUp 回顶量超出屏幕 →
 * 错位/残影，故上限随终端高度收缩；下限 4 保输入框 chrome 最低可用。
 */
export declare function liveMaxRowsFor(rows: number): number;
/**
 * 动态段预算：高水位只涨不缩（回缩 = 输入框上跳 + 旧轨线残留）。
 * skipPad（欢迎首帧）时预算 0 且不改高水位；ceiling 随终端缩小。
 * freezeHighWater（Ctrl+O 展开推理）本帧可加高 overlay，但不把峰值写入高水位。
 * @param highWater - 上一帧高水位（display rows）。
 * @param dynamicRows - 本帧动态段 display rows。
 * @param ceiling - 动态段上限。
 * @param skipPad - 欢迎首帧：预算 0 且不改高水位。
 * @param freezeHighWater - 本帧加高不写入高水位；缺省 false。
 * @returns 本帧预算与更新后的高水位。
 */
export declare function nextDynamicBudget(highWater: number, dynamicRows: number, ceiling: number, skipPad: boolean, freezeHighWater?: boolean): {
    budget: number;
    highWater: number;
};
/**
 * live 区同时展示的进行中工具卡数量上限，超出折叠成 `…(+N)` 一行。
 * 只有最新一张展开输出末尾，其余仅标题行。
 */
export declare const LIVE_TOOL_CARD_MAX = 3;
/**
 * 终端底部动态区域（live region）的增量重绘引擎。
 * 行数追踪全部基于 wrapping-aware display rows；渲染后光标常驻区域末行
 * （cursor-resident 协议），并以 CPR 探针自愈外来写入污染。
 */
export declare class LiveEngine {
    private stdout;
    private maxRows;
    /** 上一帧渲染的 display rows（wrapping-aware）。用于计算上移量。 */
    private lastDisplayRows;
    /** lineCache 渲染时的终端宽度。resize 检测：宽度变了说明屏上内容已被 reflow。 */
    private lastColumns;
    /** 是否已执行过首次渲染（用于判断是否需要 save cursor） */
    private hasRendered;
    /** live region 行缓存：每行的原始文本（不含 ANSI）用于 diff */
    private lineCache;
    /**
     * ambiguous 宽度模式缓存。`ambiguousWideEnabled()` 每次读 `process.env` 并做
     * 字符串比较，而一帧渲染里 rowsForLine 被调数十次（countDisplayRows / canDiff /
     * buildDiff / reconcileWidth），重复读 env 是无谓开销。该值在一次进程中基本不变，
     * 惰性读取一次后缓存即可。
     */
    private ambiguousWideCache;
    private onProbeRequest?;
    private onPolluted?;
    /** 最近一次确认的驻停位置（CPR 响应，1-based）。null = 未建立基线。 */
    private cprBaseline;
    /** 已发出探针但未收到响应（带超时自愈，防终端不应答导致探针停摆）。 */
    private cprProbePending;
    private lastCprProbeMs;
    /** 污染标记：下一帧 render 跳过 H2 短路/diff，走恢复重铺。 */
    private polluted;
    /** 最近一次探针响应的光标行（恢复路径的爬升上限——绝不爬出视口顶）。 */
    private cprReportRow;
    private parkedRowsUp;
    private parkedCol;
    /** 发 CPR 探针那一刻的驻停记账——响应按它折算区域末行，防 caret 移动误判污染。 */
    private probeParked;
    private readonly hardwareCursorVisible;
    /** 探针最小间隔：渲染每帧都可能触发，防探针风暴。 */
    private static readonly CPR_PROBE_MIN_INTERVAL_MS;
    /** 探针响应超时：超过即允许重发（兼容不应答 DSR 的环境）。 */
    private static readonly CPR_PROBE_TIMEOUT_MS;
    /** ambiguous 宽度模式（缓存 process.env 读取）。 */
    private ambiguousWide;
    constructor(options: LiveEngineOptions);
    /**
     * 暂停 CPR 污染检测，并禁止 render/clear 写 stdout。
     * overlay（picker/pager 等）激活期间光标在 alt screen，CPR 响应的位置不代表
     * 主屏 live region；若照常比对会误判污染并触发 renderLive 把主屏帧写进 alt
     * screen（picker 残影泄漏回主会话的根因）。即便上层漏跳过 renderLive，引擎
     * 层也不得改写 alt screen，且不得把主屏 lastDisplayRows 清零（否则退出后
     * 会当空区再 append 一份 live 区）。
     * 调用方应在 overlay 激活时 suppress，退出时 resume（并作废基线等下一帧重建）。
     */
    private probeSuppressed;
    /** overlay 激活：暂停探针发送与污染判定，render/clear 不再写屏。 */
    suppressProbe(): void;
    /** overlay 退出：恢复检测；基线作废，下一帧/探针重新建立，避免跨 alt screen 误判。 */
    resumeProbe(): void;
    /**
     * 请求发一次 CPR 探针（受节流与 pending 去重；无 onProbeRequest 时 no-op）。
     * 调用点：render 结束（帧后驻停基线）+ 空闲期定时器（检出 idle 污染）。
     * overlay 激活期间不发（见 suppressProbe）。
     */
    requestProbe(): void;
    /**
     * 喂入一条 CPR 响应（row/col 1-based，来自 InputHandler 的 onCpr）。
     * 首个响应建立驻停基线；后续响应与基线比对——偏离说明光标被外来写入移动，
     * 标记污染并回调 onPolluted（由调用方触发重渲染走恢复路径）。
     * @param row - 光标行（1-based）
     * @param col - 光标列（1-based）
     */
    noteCpr(row: number, col: number): void;
    /**
     * 更新 live region 行上限（终端 resize 时调用）。
     * maxRows 若大于终端高度，全量重写的 cursorUp 回顶量会超出屏幕导致错位，
     * 因此调用方应传入高度感知的值（如 `min(28, rows - 1)`）。
     * @param n - 新行上限；非正/非整数值被钳到 ≥1 的整数
     */
    setMaxRows(n: number): void;
    /** 单个 logical line 占用的 display rows（wrapping-aware）。 */
    private rowsForLine;
    /** 一组 LiveRegionLine 占用的总 display rows。 */
    private countDisplayRows;
    /**
     * 输入行归一化（2026-07-21 输入框重影修复）。
     *
     * LiveRegionLine 的契约是「单逻辑行」，但上游内容偶发携带嵌入换行——已证实的
     * 泄漏链：worker 多行 summary（review 门 evidence 用 `\n` 拼接）→
     * `progressLine: summary.slice(0, 80)` → FleetRegistry.activity → 舰队面板活动行。
     * 带 `\n` 的行在屏上占多个显示行，而 rowsForLine 基于 displayWidth
     * （string-width 剥控制符，`\n` 计 0 宽）按 1 行计 → lastDisplayRows 低于屏上
     * 实际行数 → 下一帧 cursorUp 回顶不足 → 旧帧顶部（输入框头行+边框）残留进
     * scrollback，正是「输入框重影叠屏」的形态。
     *
     * 处理：`\n` 展开为独立行；`\r`/`\t` 替换为空格（同样是 string-width 计 0 宽
     * 但终端会移动光标/跳列的字符）。内容侧净化（progressSnippet）是第一道防线，
     * 这里是引擎层兜底——任何未来新增的内容路径都不能再破坏行数追踪。
     */
    private normalizeLines;
    /**
     * resize 协调：终端宽度变化时，已绘制的 live region 内容会被终端按新宽 reflow，
     * 其占用的 display rows 随之改变。但 `lastDisplayRows` 是上一帧在**旧宽度**下数的，
     * 若直接用于 `moveToTop`，cursorUp 量与屏上实际行数不符 → 回顶欠/过 → 旧帧顶部
     * 残留进 scrollback（多份不同宽度的 chrome/面板叠屏，见 resize 回归测试）。
     *
     * 修复：检测到宽度变化时，按**当前宽度**从 `lineCache` 重算 `lastDisplayRows`，
     * 使其与终端 reflow 后的屏上行数一致，再做相对回顶。
     */
    private reconcileWidth;
    /**
     * 渲染 live region（cursor-resident 协议，对标 aider mdstream / ink createIncremental）。
     *
     * 核心不变量：
     * - 渲染后光标**常驻 live region 最后一行末尾**（尾行不写 `\n`）。
     *   这避免了在终端底部因尾行换行触发滚屏 → 杜绝"贴底每帧滚动"的卡顿。
     * - 增量重绘用**相对光标移动**（cursorUp/cursorDown）回到区域顶，不使用
     *   SAVE/RESTORE 绝对光标——内容滚动后绝对坐标会失效错位。
     * - **行级 diff**：结构未变（行数 + 单显示行）时只重写变化的行，跳过未变行（少闪）。
     * - 整帧用 CSI 2026 同步输出包裹，原子刷新防撕裂。
     *
     * @param lines - 要显示的行（含 ANSI 格式化）
     * @param opts - reservedTail：超预算截断时恒保留的尾部行数（chrome 保护）
     */
    render(lines: readonly LiveRegionLine[], opts?: {
        reservedTail?: number;
    }): void;
    /** 从 bounded 行里找 caret 标记行，算驻停点（距末行 display rows + 0-based 列）。 */
    private computeParking;
    /** 帧末驻停序列：末行尾 → caret 坐标（默认驻停但保持隐藏；env 仅控制可见性）。 */
    private buildParkSeq;
    /** 更新驻停记账（须在 requestProbe 前调用——探针按它折算响应坐标）。 */
    private setParked;
    /** H2 路径专用：行未变、caret 变了 → 只发重定位序列（不重绘任何文字）。 */
    private reparkIfChanged;
    /**
     * 行预算：内容超过 maxRows 时，**优先保留尾部 chrome**（GlanceBar + 输入框 + 提示），
     * 截断的是中段 dynamic（streaming tail / 工具输出）的较早部分。
     *
     * **预算按 display rows 计量**（非行数）：窄窗口下长正文/长输入折行后，
     * 行数 ≤ maxRows 也可能整帧超出终端高度——全量重写越过屏幕底部触发滚动，
     * 回顶量与屏上实际布局错位，旧帧正文残留并叠印在 chrome 之下
     * （小窗口打字时正文"泄露"到输入框底下的根因）。不变量：整帧恒 ≤ maxRows
     * display rows（= min(28, rows-1)），重写永不越底。
     *
     * - 全帧 display rows ≤ maxRows：全部保留。
     * - 未指定 reservedTail：按预算保留前若干行。
     * - 指定 reservedTail：尾部 N 行恒保留；剩余预算从 dynamic 段尾部回填。
     *   若 chrome 本身已超 maxRows，仍全部显示——宁可超行，也不能让输入框消失。
     */
    private applyRowBudget;
    /** Append 路径：行间 `\n`，尾行不带 `\n`（光标常驻最后一行末尾）。 */
    private buildAppend;
    /** 相对光标回到 live region 顶部显示行（光标当前在最后一个显示行）。 */
    private moveToTop;
    /**
     * 全量重写：回顶 → 擦到屏幕末（覆盖旧的所有显示行，含 wrap）→ 重写全部行。
     * 尾行不带 `\n`，光标停在最后一行末尾。
     */
    private buildFullRewrite;
    /**
     * 行级 diff（结构未变 + 每行 wrap 高度未变时调用，见 canDiff）：
     * 回顶后逐行处理——变化行清除其全部显示行后重写；未变行只按显示行数 cursorDown 跳过。
     * 不写任何 `\n`（cursorDown 在底行会被 clamp，不触发滚屏）。
     *
     * 光标步进不变量：每次迭代开始时光标位于「逻辑行 i 的首个显示行」，
     * 处理结束时（cursorDown 之前）位于「逻辑行 i 的最后一个显示行」，
     * 再 cursorDown(1) 进入下一逻辑行首行。变化行与未变行两条分支都满足该不变量。
     */
    private buildDiff;
    /**
     * 清空 live region（擦除但不回滚 scrollback）。
     * 用于流式输出完成、切换到新 turn 时。
     *
     * 光标常驻协议下，光标在最后一个显示行——回顶后擦到屏幕末，光标停在
     * 区域起始处。后续 append/commit 从这里开始写，干净无空白带。
     */
    clear(): void;
    /**
     * 擦除 live region 并把光标停在其起始行——为向 scrollback commit 内容腾位。
     *
     * 正确的 mid-stream commit 协议：
     *   live.clearForCommit() → commit.write(...) → live.render(...)
     *
     * cursor-resident 协议下与 clear() 行为一致（光标都回到区域起始处）。
     */
    clearForCommit(): void;
    /**
     * 渲染单行动态文本（如 streaming 行、thinking 指示器）。
     * 简化版：擦除上一帧内容 → 写入新内容。
     * @param text - 该行的 ANSI 格式化文本
     */
    renderLine(text: string): void;
    /** 重置渲染状态（用于 rewind 等需要全量重绘的场景） */
    reset(): void;
}
