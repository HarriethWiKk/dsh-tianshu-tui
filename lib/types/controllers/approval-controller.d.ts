/**
 * ApprovalController — 待审批挂起状态机（Wave 1 从 ui/app.ts 提取）。
 *
 * 持有 pendingApproval 挂起态（req + resolve 句柄）与 alwaysApprove 短路标志。
 * handle() 是 approval/request 订阅的 answerer 入口，语义与 user-approval
 * waterfall 对齐：
 * - alwaysApprove 且当前会话 → 短路放行 allowed-once（不挂起、不消费）。
 * - 非当前会话或已有挂起 → 委托 next()（fail-closed：TUI 一次只呈现一个确认，
 *   apiproxy 等链上 answerer 处理远端转发）。
 * - 当前会话无挂起 → 挂起，返回等用户 y/N 的 promise。
 *
 * 会话归属经 getCurrentSessionId() getter 注入（app.ts 持有 activeSessionId），
 * 渲染经 peek() 快照消费；不 import app.ts、不碰渲染。
 *
 * 超时由 controller 内建承担（ApprovalPeek.since 仅为信息性字段，渲染侧
 * 不负责超时判定）：挂起超过 timeoutMs 无人应答 → fail-closed 自动结算
 * cancelled，卡片不会无限挂起。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/controllers/approval-controller
 */
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { CallId } from '@deepseek-ai/dsh-llm';
/** 审批 answerer 的本地请求形状（与 user-approval 词汇对齐；字段子集——TUI 只需展示所需）。 */
export interface PendingApprovalRequest {
    agent: {
        session: {
            id: SessionId;
        };
    };
    toolName: string;
    reason?: string;
    /** C2 项 1：关联的精确工具调用（user-approval 运行时携带，用于审批 diff 查找）。 */
    callId?: CallId;
    /**
     * 请求撤销信号（user-approval `ApprovalRequest.signal` 透传）：abort 时挂起
     * 自动结算为 cancelled——asker 侧已把 abort 竞速为 cancelled，卡片必须同步
     * 消失，否则用户按 y 见卡片消失实际被拒且无提示（UI/outcome 不一致）。
     */
    signal?: AbortSignal;
}
/** 用户决定（与 user-approval ApprovalOutcome 对齐）。 */
export type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable';
/** 挂起态快照（renderLive 消费；无挂起时 peek() 返回 null）。 */
export interface ApprovalPeek {
    /** 待决审批请求。 */
    req: PendingApprovalRequest;
    /** 挂起时间戳（ms；信息性字段——超时判定由 controller 内建 timeoutMs 承担，渲染侧不读）。 */
    since: number;
}
/** 审批挂起默认超时（ms）：挂起超过即 fail-closed 自动结算 cancelled（可经 options.timeoutMs 覆盖）。 */
export declare const DEFAULT_APPROVAL_TIMEOUT_MS = 60000;
/** ApprovalController 的依赖注入（当前会话读取、状态变化回调）。 */
export interface ApprovalControllerOptions {
    /** 当前会话 id 读取函数（app.ts 注入 activeSessionId；null = 尚未 attach）。 */
    getCurrentSessionId: () => SessionId | null;
    /** 状态实际变化（挂起/结算）后回调（app 侧触发重绘）。 */
    onChanged?: () => void;
    /** 挂起超时毫秒数（超过即自动结算 cancelled，fail-closed；缺省 DEFAULT_APPROVAL_TIMEOUT_MS）。 */
    timeoutMs?: number;
}
/**
 * 待审批挂起状态机：handle() 按短路放行 / next() 委托 / 挂起三选一，
 * settle() 结算用户决定，peek() 给 renderLive 出快照（见模块注释语义）。
 * 挂起超过 timeoutMs 无人应答时自动结算 cancelled（fail-closed）。
 */
export declare class ApprovalController {
    private pending;
    private alwaysApproveFlag;
    private readonly getCurrentSessionId;
    private readonly onChanged;
    private readonly timeoutMs;
    constructor(options: ApprovalControllerOptions);
    /** 是否有挂起的审批（handleKey 分支入口判断）。 */
    get isPending(): boolean;
    /** C3 项 4：always-approve 模式激活标志（三态循环读写；退出/切会话时 app 侧复位）。 */
    get alwaysApprove(): boolean;
    /**
     * 设置 always-approve 模式（C3 项 4 三态循环；statusLine 徽标由 app 侧同步）。
     * @param flag - true 时当前会话的审批请求短路放行。
     */
    setAlwaysApprove(flag: boolean): void;
    /**
     * 审批 answerer 入口：短路放行 / 委托 next() / 挂起，三选一。
     * @param req - 待决审批请求（approval/request 事件 payload）。
     * @param next - waterfall 委托（不处理时调用；链上其他 answerer 兜底）。
     * @returns 用户决定（allowed-once/rejected/cancelled）或 next() 结果。
     */
    handle(req: PendingApprovalRequest, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome>;
    /**
     * 结算挂起的审批请求（用户按键 y/N/Ctrl+C；会话卸载时 cancel 为 cancelled；
     * 请求 signal abort 时自动结算为 cancelled；挂起超过 timeoutMs 时自动结算为 cancelled）。
     * @param outcome - 用户决定。
     */
    settle(outcome: ApprovalOutcome): void;
    /**
     * 当前挂起态快照（renderLive 审批段消费）。
     * @returns { req, since }；无挂起 null。
     */
    peek(): ApprovalPeek | null;
}
