/**
 * Adapted for the dsh-tui port seam (Apache License 2.0, section 4(b)):
 * upstream source .rivet/tui-source/tui/format/slash-hint.ts, Copyright
 * 2025-2026 Tianshu Contributors, licensed under the Apache License, Version
 * 2.0 (see LICENSE and NOTICE). Modified: inlined to types only; original
 * slash panel layer removed.
 */
/**
 * Slash 命令提示条目。源出 .rivet/tui-source/tui/format/slash-hint.ts
 * （Apache-2.0 来源，本包内联仅保留类型，避免引入天枢 slash 面板层）。
 */
export interface SlashHintEntry {
    name: string;
    description: string;
    /** 可选参数提示（ghost text）：输入精确匹配「命令名+空格」时在光标后暗色提示。 */
    argsHint?: string;
}
/** 文件补全的 Tab 循环状态：基准文本/光标 + 候选列表 + 当前候选索引。 */
export interface FileCompletionState {
    baseText: string;
    baseCursor: number;
    candidates: string[];
    idx: number;
}
/** MRU 列表长度上限（超出丢弃最旧）。 */
export declare const SLASH_MRU_MAX = 10;
/** slash 命令菜单状态（grok SlashSnapshot 适配：open/query/matches/selected）。 */
export interface SlashMenuState {
    /** 菜单是否打开（输入以 / 开头且有匹配命令）。 */
    open: boolean;
    /** 当前查询（输入去掉 / 前缀的部分）。 */
    query: string;
    /** 匹配命令列表（前缀匹配在前、子串兜底在后，保持注册顺序）。 */
    matches: SlashHintEntry[];
    /** 选中项下标。 */
    selected: number;
}
/**
 * Input state manager — holds the 6 input-related state fields extracted from
 * TuiApp (W-B5). Input event handling (onAnyKey, onSubmit), key routing, slash
 * command processing, and tab completion logic stay in TuiApp; this class only
 * manages the state values.
 */
export declare class InputController {
    /** slash 命令列表（外部注入，提示 + Tab 补全用） */
    slashCommands: SlashHintEntry[];
    /** slash hint 当前选中项索引（输入以 / 开头时，Tab 补全目标） */
    slashSelectedIdx: number;
    /** slash 命令菜单状态（输入变化经 refreshSlash 更新；app.ts 渲染与键路由消费）。 */
    slashMenu: SlashMenuState;
    /** 最近使用命令名（最新在前，上限 SLASH_MRU_MAX；匹配排序 MRU 优先）。 */
    slashMru: string[];
    /** 光标前 @ token 的文件补全状态（Tab 循环）；null = 未在补全中。 */
    fileCompletion: FileCompletionState | null;
    /**
     * 记录一次命令执行（MRU 排序数据源）：去重前移、超上限截断尾部。
     * @param name - 命令名（不含 / 前缀）。
     */
    recordSlashUse(name: string): void;
    /**
     * 输入变化时刷新 slash 菜单：
     * - 完整命令名 + 尾空格（参数模式，如 `/theme `）且命令带 argsHint → 菜单
     *   保持打开显示该命令，输入行 ghost 提示参数占位（app.ts 消费）。
     * - 以 / 开头且有匹配命令 → 打开并保持选择（carry：query 不变时按命令名
     *   找回选中项）；无匹配或非 / 输入 → 关闭。
     * @param value - 输入行当前文本。
     */
    refreshSlash(value: string): void;
    /** 关闭 slash 菜单（保持 matches 供渲染兜底，open 置 false）。 */
    closeSlash(): void;
    /**
     * 移动菜单选择（↑↓；环绕）。
     * @param delta - 步长（-1 / +1）。
     */
    moveSlashSelection(delta: number): void;
    /**
     * 滚动菜单选择（PageUp/Down；两端 clamp 不环绕）。
     * @param delta - 步长（±maxRows 由调用方给定）。
     */
    scrollSlashSelection(delta: number): void;
    /**
     * 匹配：前缀优先 + 子串兜底（均按注册顺序稳定排序）。
     * @param query - 去 / 前缀的查询（空串 = 全量列表）。
     * @returns 匹配条目。
     */
    private suggestMatches;
    /** MRU 排名表：最近使用得分最高（未使用 0 分）。 */
    private mruRank;
    /**
     * query 未变时按命令名找回上一选中项（输入变化不重置选择）。
     * @param prev - 上一菜单状态（open 且 query 相同）。
     * @param matches - 新匹配列表。
     * @returns 选中项下标（找不到回 0）。
     */
    private carrySelection;
    /**
     * Tab 补全驱动（Phase 6.3）：首次 Tab 解析光标前 @ token 的候选并应用
     * 首项；再次 Tab 在候选间循环（唯一候选直接应用且不进入循环）。
     * 无 @ token 或无候选返回 null——Tab 保持原行为，由调用方决定是否消费。
     * @param value - 输入行当前文本。
     * @param cursor - 光标位置（code-unit 偏移）。
     * @param cwd - 补全基目录（git ls-files 执行目录）。
     * @param limit - 候选数量上限（默认 8）。
     * @param timeoutMs - git ls-files 超时（缺省 500ms 产品权衡；测试可放宽）。
     * @returns 要应用到输入行的 { text, cursor }；无可补全返回 null。
     */
    tabComplete(value: string, cursor: number, cwd: string, limit?: number, timeoutMs?: number): {
        text: string;
        cursor: number;
    } | null;
    /** 输入历史（最新在前，submit 时更新 + 持久化） */
    inputHistory: string[];
    /** Ctrl+C double-press window start timestamp (ms), 0 = inactive */
    ctrlCPendingSince: number;
    /** ESC double-press: last ESC timestamp (ms), 0 = inactive */
    lastEscAt: number;
}
