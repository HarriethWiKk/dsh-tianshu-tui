/**
 * T9 InputHandler — 统一键盘输入处理（替代 Ink 的 useInput hooks）。
 *
 * 核心功能：
 * - 设置 stdin raw mode，逐字节读取
 * - 解析 UTF-8 字符 + ANSI escape sequences（方向键、功能键等）
 * - 支持多种输入模式：normal / input / overlay / vim
 * - 分发按键事件到注册的处理器
 *
 * 按键类型分类（参考 Node.js readline + Ink 的 keypress 解析）：
 * - 可打印字符（UTF-8）：直接分发
 * - 控制字符（Ctrl+A..Z, Tab, Enter, Escape, Backspace）
 * - ANSI escape sequences（方向键、Home/End、PgUp/PgDn、F1-F12）
 * - 鼠标事件（SGR mouse protocol）— 暂不处理
 */
import type { ReadStream } from 'node:tty';
/** 一次按键事件的解析结果（原始字节 + 语义名称 + 修饰键状态）。 */
export interface KeyPress {
    /** 按键原始字符串 */
    raw: string;
    /** 可打印字符（如 'a', '你'），控制键为 '' */
    char: string;
    /** 按键名称 */
    name: KeyName;
    /** Ctrl 是否按下 */
    ctrl: boolean;
    /** Alt/Meta 是否按下 */
    meta: boolean;
    /** Shift 是否按下 */
    shift: boolean;
}
/** 可识别的按键语义名称；未映射的可打印字符与无法识别的序列为 'unknown'。 */
export type KeyName = 'return' | 'escape' | 'tab' | 'backspace' | 'delete' | 'up' | 'down' | 'left' | 'right' | 'home' | 'end' | 'pageup' | 'pagedown' | 'insert' | 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6' | 'f7' | 'f8' | 'f9' | 'f10' | 'f11' | 'f12' | 'space' | 'ctrl_c' | 'ctrl_d' | 'ctrl_h' | 'ctrl_j' | 'ctrl_z' | 'ctrl_l' | 'ctrl_u' | 'ctrl_a' | 'ctrl_e' | 'ctrl_k' | 'ctrl_w' | 'ctrl_n' | 'ctrl_o' | 'ctrl_p' | 'ctrl_r' | 'ctrl_s' | 'ctrl_t' | 'ctrl_v' | 'ctrl_b' | 'ctrl_f' | 'ctrl_x' | 'ctrl_]' | 'ctrl_minus' | 'ctrl_.' | 'ctrl_y' | 'ctrl_q' | 'shift_tab' | 'unknown';
/** 按键事件处理器。 */
export type KeyHandler = (key: KeyPress) => void;
/** InputHandler 构造参数。 */
export interface InputHandlerOptions {
    stdin: ReadStream;
    /** 初始输入模式 */
    mode?: InputMode;
    /** 单独 ESC 字节的刷新超时（ms）。期间无后续字节则派发 escape。
     *  80ms 平衡低延迟和高延迟 SSH（原 40ms 在 150ms+ RTT 连接上会导致方向键序列被拆包）。
     *  这个值直接决定按 ESC 打断的响应速度，不能为了兼容慢终端而拉长。 */
    escapeTimeoutMs?: number;
    /**
     * 不完整 CSI/SS3 序列的兜底超时（ms）。
     *
     * 与 `escapeTimeoutMs` 分开：buffer 已经是 `\x1B[…` 时就确定不是孤立 ESC 键
     * （用户敲不出这个组合），超时只为兜「终端半途断供导致 buffer 永久滞留」，
     * 不影响任何按键响应速度，故给足余量。此前两者共用 80ms，等于把兜底的宽容度
     * 绑死在 ESC 响应速度上——高负载或 SSH 下 stdin 分包间隔轻易超过 80ms，
     * 正常序列被腰斩后残体会被当成普通字符送进输入框。
     * 500ms 对齐 Node readline 的 `escapeCodeTimeout` 默认值。
     */
    partialSequenceTimeoutMs?: number;
}
/** 输入模式：作为 `mode:keyName` 前缀参与处理器路由（见 onKey）。 */
export type InputMode = 'normal' | 'input' | 'overlay' | 'approval';
/**
 * 统一键盘输入处理器：构造时把 stdin 置为 raw mode 并接管 data 事件，
 * 解析 UTF-8 字符 / ANSI 转义序列 / bracketed paste / CPR 响应后分发给
 * 注册的处理器。用完必须调用 dispose() 恢复终端默认行为。
 */
export declare class InputHandler {
    private stdin;
    private mode;
    private handlers;
    private pasteHandlers;
    /** CPR（cursor position report）处理器：终端对 DSR `\x1B[6n` 的响应
     *  `\x1B[{row};{col}R` 不是按键，单独走这个通道（LiveEngine 自愈用）。 */
    private cprHandlers;
    private escapeTimeoutMs;
    private partialSequenceTimeoutMs;
    private escapeTimer;
    /** 当为 true 时，单独的 ESC 字节立即派发为 escape，不等待超时。
     *  用于 overlay 激活场景，避免 ESC 关闭/退出有 40ms 可感知延迟。 */
    private escapeImmediate;
    private pasteActive;
    private pasteBuffer;
    /**
     * 跨 chunk 不完整代理对缓冲：上游（stdin）可能把同一 UTF-16 代理对的两个
     * code unit 拆到两个 `data` 事件里（高强度输入 + 终端流量控制时偶发）。
     * 若不缓冲，第一段被当成"可打印字符"派发，char 字段就是孤立的
     * high-surrogate `\uD83D`——输入框会显示成豆腐方块，emoji 簇不可用。
     * 这里在 handleData 入口预拼，在派发前剥离尾部 high-surrogate。
     */
    private pendingData;
    /**
     * 跨 chunk 输入字节缓冲。ESC 序列、bracketed paste 起止标记都可能被拆到
     * 多个 `data` 事件里；保留未处理完的尾部，等待后续字节完整后再派发。
     */
    private inputBuffer;
    constructor(options: InputHandlerOptions);
    /**
     * 注册按键处理器。
     * @param event - 按键名（KeyName）、`'*'` 通配、或 `mode:keyName` 模式限定形式
     * @param handler - 命中时调用的处理器
     * @returns 取消注册的函数
     */
    onKey(event: string, handler: KeyHandler): () => void;
    /**
     * 注册所有按键的处理器（通配符）。
     * @param handler - 每个按键事件都会调用的处理器
     * @returns 取消注册的函数
     */
    onAnyKey(handler: KeyHandler): () => void;
    /**
     * 注册 bracketed paste 处理器（一次性收到整段粘贴文本，已规范化换行）。
     * @param handler - 接收整段粘贴文本的处理器
     * @returns 取消注册的函数
     */
    onPaste(handler: (text: string) => void): () => void;
    /**
     * 注册 CPR 处理器（终端光标位置报告，row/col 为 1-based）。
     * @param handler - 接收 row/col 的处理器
     * @returns 取消注册的函数
     */
    onCpr(handler: (row: number, col: number) => void): () => void;
    /**
     * 切换输入模式（影响 `mode:keyName` 形式处理器的路由）。
     * @param mode - 新的输入模式
     */
    setMode(mode: InputMode): void;
    /**
     * 获取当前输入模式。
     * @returns 当前输入模式
     */
    getMode(): InputMode;
    /**
     * 设置单独 ESC 字节是否立即派发。
     * overlay 激活时设为 true，避免 ESC 关闭/退出等待超时。
     * @param immediate - true 立即派发孤立 ESC；false 恢复超时判定
     */
    setEscapeImmediate(immediate: boolean): void;
    /** 关闭 raw mode，恢复终端默认行为。 */
    dispose(): void;
    private handleData;
    /**
     * 从缓冲区起始位置连续派发普通按键，直到遇到不完整序列或缓冲区末尾。
     * 返回实际消费的字节数。
     */
    private dispatchKeys;
    /** 处理跨 chunk 缓冲的输入缓冲区，按 paste → ESC 序列 → 普通字符优先级解析。 */
    private processInputBuffer;
    /** 把按键分发到 name / 通配 / mode 前缀三类处理器。 */
    private dispatch;
    /**
     * 解析 data 首部的一个按键事件 + 实际消费的 code unit 数。
     *
     * 返回 { key: null, consumed: 0 } 表示"等后续字节"（孤 ESC 字节、跨 chunk
     * 的 CSI/SS3 序列）；否则 key 非 null，consumed 告诉调用方已消费的字节数。
     */
    private parseInput;
    private resolveEscapeSequence;
}
