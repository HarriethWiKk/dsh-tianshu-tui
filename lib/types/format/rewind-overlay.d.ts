/**
 * C3 项 3：rewind overlay — 双阶段回退面板（用户检查点 → 回退粒度）。
 *
 * 阶段 1（list）：展示用户检查点（turn/text/seq），↑↓/j k 移动，Enter 选中目标。
 * 阶段 2（mode）：convo（仅截断会话）/ code（仅文件回退）/ both（两者）。
 * 执行回调由装配方提供（TuiApp.rewindSession 接 FileHistory + SessionStore）。
 * list 的 Esc/Ctrl+C 由装配方关闭；mode 的 Esc 回到 list。
 *
 * 数据源：装配方过滤后的用户检查点（TranscriptMessage：seq/turn/text）。
 */
import type { OverlayRenderer } from '../engine/overlay-engine.js';
import type { RivetTheme } from '../theme.js';
import type { TranscriptMessage } from '../adapter/transcript.js';
/** rewind 可回退的消息最小形状（transcript.view.messages 满足它）。 */
export interface RewindableMessage {
    readonly seq: number;
    readonly turn: number;
    /** 消息归属（用户/助手；时间线类型标记）。 */
    readonly kind: 'user' | 'assistant';
    /** Unix epoch 毫秒（相对时间显示）。 */
    readonly time: number;
    readonly text: string;
}
/** 回退粒度（对齐天枢 RewindMode 前 3 种）。 */
export type RewindMode = 'convo' | 'code' | 'both';
/** 回退执行结果（装配方回填，渲染到完成阶段）。 */
export interface RewindResult {
    filesChanged: number;
    /** 截断到的 seq（convo/both 时）。 */
    truncatedTo?: number;
    /** 因快照缺失未能回退的文件数（code/both 时；0 或缺省 = 无缺口）。 */
    filesSkipped?: number;
    /** 执行失败时的错误信息（filesChanged = -1）。 */
    error?: string;
}
/** 装配方在用户确认后执行回退；返回文件变更数。 */
export type RewindExecutor = (mode: RewindMode, atSeq: number) => Promise<RewindResult>;
/** 双阶段回退面板：消息列表选目标 → 粒度选择 → 执行 → 结果展示（纯状态机 + 渲染，零 I/O）。 */
export declare class RewindOverlay implements OverlayRenderer {
    private messages;
    /** 阶段：list → mode → executing → done；null = 未激活。 */
    private phase;
    private selected;
    private mode;
    private result;
    private readonly theme;
    private executor;
    private readonly onSettled;
    constructor(theme?: RivetTheme, options?: {
        onSettled?: () => void;
    });
    /**
     * 装配方提供检查点快照 + 执行回调；重复设置重置状态。
     * @param messages - 用户检查点快照（过滤后的 transcript 行）。
     * @param executor - 用户确认后执行回退的回调。
     */
    setMessages(messages: readonly RewindableMessage[], executor: RewindExecutor): void;
    /**
     * 当前选中的 seq；无消息返回 -1。
     * @returns 选中消息的 seq，或 -1。
     */
    selectedSeq(): number;
    /**
     * done 阶段（结果已显示，装配方应关闭 overlay）。
     * @returns 处于 done 阶段时 true。
     */
    isDone(): boolean;
    /**
     * list 阶段由装配方对 Esc/Ctrl+C 直接关闭；mode 阶段 Esc 先回到 list。
     * @returns 处于 list 阶段时 true。
     */
    isListPhase(): boolean;
    /**
     * 处理按键；返回 true 表示已消费。
     * @param name - 按键名（up/down/return/escape/ctrl_c 等）。
     * @param char - 可打印字符（j/k 移动，1/2/3 选粒度）。
     * @returns 已消费时 true（list 的 Esc/Ctrl+C 由装配方关闭；mode 的 Esc 回到 list）。
     */
    handleKey(name: string, char: string): boolean;
    /** 执行回退（mode 阶段选中后）。 */
    private run;
    render(width: number, height: number): string[];
}
/**
 * 装配方用：从 transcript 视图挑出可回退的用户检查点——真人用户说过的非空
 * `user/message`；插件注入（source.kind = 'plugin'）与空文本行不算。
 * @param messages - transcript 视图消息（adapter/transcript 投影）。
 * @returns 传给 {@link RewindOverlay.setMessages} 的检查点列表。
 */
export declare function collectUserRewindCheckpoints(messages: readonly TranscriptMessage[]): RewindableMessage[];
