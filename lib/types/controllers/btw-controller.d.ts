/**
 * BtwController — /btw 侧问状态机（P1 提取，对齐 Question/Approval controller 模式）。
 *
 * 语义：用户可在主 agent 运行中途提出一个独立问题。btw 走本地 Cordis 旁路——
 * 从当前会话 fork 一个「最后完整 turn」的事件前缀（seed）创建临时 btw agent
 * （独立 session，不赋值 ownedHandle、不经过 switchSession），单轮问答后销毁。
 * 答案经 session/event 流收集（text-delta → turn/end 定稿），渲染快照经 peek()
 * 由 renderLive 消费；Esc 由 app 侧 handleKey 仲裁后调 dismiss()。
 *
 * 关键约束（与主对话流的隔离）：
 * - seed 只含完整 turn：fork 语义禁止 ending inside open turn（SessionStore.fork
 *   的 OPEN_TURN 检查同构）——主 agent 运行中（open turn）侧问不污染主上下文。
 * - 不持 ownedHandle：btw agent 是 registry 级旁路（switchSession 兜底分支同款），
 *   dispose 由本控制器在收尾时显式执行（dismiss/超时/完成）。
 * - 事件订阅按 btw session id 过滤，不干扰主会话的 streamFeed。
 *
 * 状态机：idle → loading → done | error →（dismiss）idle。
 * - done：答案定稿后等待 Esc 折叠（app 经 onAnswer 写 scrollback）。
 * - error：超时/失败后仍可 Esc 关闭。
 * - loading 时 Esc：取消并销毁 btw agent（无答案可写）。
 * 重叠保护：ask 期间再次 ask 静默忽略（一次只跑一个侧问）。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/controllers/btw-controller
 */
import type { Context } from '@deepseek-ai/cordis';
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session';
/** btw 挂起态快照（renderLive 消费；无挂起时 peek() 返回 null）。 */
export interface BtwPeek {
    /** loading：等待答案；done：答案定稿待折叠；error：超时/失败。 */
    status: 'loading' | 'done' | 'error';
    /** 侧问原文（用户输入，不经 @mention 展开）。 */
    question: string;
    /** done 时的答案全文（text-delta 拼接；可为空串）。 */
    answer?: string;
    /** error 时的失败信息。 */
    error?: string;
}
/** BtwController 的依赖注入（服务上下文、活跃会话读取、状态回调、超时）。 */
export interface BtwControllerOptions {
    /** 服务上下文（agents.create / sessions.get / on 消费）。 */
    ctx: Context;
    /** 当前活跃会话 id 读取（app 注入；null = 无会话，/btw 不可用）。 */
    activeSessionId: () => SessionId | null;
    /** 状态实际变化（发起/完成/失败/关闭）后回调（app 侧触发重绘）。 */
    onChanged?: () => void;
    /** 答案折叠回调（Esc 关闭 done 态时调用；app 写 scrollback 持久化）。 */
    onAnswer?: (entry: {
        question: string;
        answer: string;
    }) => void;
    /** 等待超时毫秒数（loading 超过即 error；缺省 30_000）。 */
    timeoutMs?: number;
}
/**
 * 从会话事件日志计算 btw 的 fork seed：最后一个 turn/end 之前的完整前缀。
 * fork 语义要求 seed 是 balanced completed-turn prefix（SessionStore.fork 的
 * OPEN_TURN 检查同构）——主 agent 运行中（open turn）时截到上一个完整 turn，
 * 无任何完整 turn 时为空 seed（btw 从零上下文开始）。
 * @param events - 源会话事件日志（seq 连续从 0 开始，数组下标即 seq）。
 * @returns 完整 turn 前缀（可直接作 agents.create 的 seed）。
 */
export declare function completedTurnSeed(events: readonly SessionEvent[]): readonly SessionEvent[];
/**
 * /btw 侧问状态机：fork 完整 turn 前缀创建临时 btw agent，单轮问答后销毁；
 * 状态流 idle → loading → done|error →（dismiss）idle（见模块注释约束）。
 */
export declare class BtwController {
    private state;
    /** 当前 btw agent 的 owned handle（本控制器持有，收尾时 dispose）。 */
    private handle;
    /** btw session 事件订阅 disposer（随收尾释放）。 */
    private feed;
    /** loading 超时定时器（finish/fail/dismiss 时清除）。 */
    private timer;
    private readonly ctx;
    private readonly activeSessionId;
    private readonly onChanged;
    private readonly onAnswer;
    private readonly timeoutMs;
    constructor(options: BtwControllerOptions);
    /** 是否有挂起的侧问（handleKey Esc 分支入口判断）。 */
    get isActive(): boolean;
    /**
     * 当前挂起态快照（renderLive btw 段消费）。
     * @returns 挂起态；无挂起侧问为 null。
     */
    peek(): BtwPeek | null;
    /**
     * 发起一次侧问：fork 完整 turn 前缀 → agents.create（btw session，不持
     * ownedHandle）→ 订阅答案流 → followup 单轮。已有挂起时静默忽略（一次一个）。
     * @param question - 侧问文本（已 trim；空文本由命令层拦截）。
     * @throws 无活跃会话/会话不存在/创建失败（命令分发层回显失败）。
     */
    ask(question: string): Promise<void>;
    /**
     * 关闭挂起的侧问（Esc/Ctrl+C）。done 态把答案折叠进 scrollback（onAnswer
     * 回调）；loading 态取消并销毁 btw agent；error 态直接清除。
     */
    dismiss(): void;
    /**
     * 总清理（app dispose 时）：未决侧问（loading/error）直接销毁 btw agent，
     * done 态不折叠（答案未确认，丢弃——退出即弃，与 always-approve 同生命周期）。
     */
    dispose(): void;
    /** 答案定稿（turn/end 触发）：释放订阅与 agent（turn 已结束，dispose 安全）。 */
    private finish;
    /** 失败（超时）：销毁 btw agent，置 error 态（Esc 关闭）。 */
    private fail;
    /** 释放订阅 + dispose btw agent handle（幂等：收尾后再次调用 no-op）。 */
    private teardown;
}
