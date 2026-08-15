/**
 * Session brief — `/session list` 每行的会话主题梗概。
 *
 * 梗概是「研究的问题/主题本身」的任务标题式短语（如「评估某模型的识别准确率」
 * 「实现某插件的自动连接」），而不是「用户做了什么」的叙事。
 *
 * 职责与边界：
 * - 梗概是 TUI 私有展示层缓存：存放在 `$DSH_HOME/tui/session-briefs.json`
 *   （sidecar 文件，按 session id 索引），**不写回 session log、不发明事件类型**，
 *   符合 registry 的 dsh 纪律。
 * - 生成走既有 llm 服务的一次辅助调用（`purpose: 'session-title'`，DeepSeek
 *   适配器据此关闭 thinking，输出预算留给可见文本）。模型路由策略：
 *   deepseek 系 provider → 固定 `deepseek-v4-flash`（梗概是廉价辅助调用）；
 *   其它开发商 → 沿用用户当前默认模型（`agent-default-model.currentSelection`）。
 *   agent-default-model 服务缺失时回退到会话自身最新的 `request/header` 路由，
 *   再无则回退 harness 基线的 `deepseek-official/deepseek-v4-flash`。
 * - 历史会话（旧版本产生、无梗概）与新建会话统一按「缺则补」处理：首次
 *   `/session list` 时生成并落盘，之后读缓存，不再调 API。
 * - 没有任何聊天记录的会话不调 API：梗概直接展示「新对话」（状态，不落盘）。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/adapter/session-brief
 */
import type { Context } from '@deepseek-ai/cordis';
import type { SessionId, SessionEvent } from '@deepseek-ai/dsh-session';
import { type SessionSummary } from './sessions.js';
/** 梗概提示词输入摘录的一轮：真人用户消息或最后一条助手消息。 */
export interface BriefTranscriptTurn {
    readonly role: 'user' | 'assistant';
    readonly text: string;
}
/** 摘录输入的总字节预算（含 JSON 框架外的估算余量）。 */
export declare const MAX_INPUT_BYTES = 6000;
/** 辅助调用输出 token 上限（一句话梗概足够）。 */
export declare const MAX_OUTPUT_TOKENS = 128;
/** 端到端超时（与 session-title-llm 同档）。 */
export declare const BRIEF_TIMEOUT_MS = 60000;
/** 超时错误码（展示与诊断用）。 */
export declare const BRIEF_TIMEOUT_CODE = "SESSION_BRIEF_TIMEOUT";
/** 梗概文本长度上限（字符，超出以 … 截断）。 */
export declare const MAX_BRIEF_CHARS = 120;
/** 无聊天记录的会话直接展示的占位梗概（状态而非内容，不落盘、不调 API）。 */
export declare const EMPTY_BRIEF = "\u65B0\u5BF9\u8BDD";
/**
 * 解析 dsh home：`$DSH_HOME`（非空白）优先，否则 `~/.dsh`。
 * 与 dsh-home-paths 的优先级一致（configured > $DSH_HOME > ~/.dsh）；
 * 「configured 路径」是宿主进程内的显式覆盖，插件侧不可见，按环境变量/
 * 默认值处理即可——sidecar 与 sessions 目录同根，两者解析一致。
 * @param env - 环境变量映射（测试可注入）。
 * @returns dsh home 绝对路径。
 */
export declare function resolveDshHome(env?: NodeJS.ProcessEnv): string;
/**
 * 梗概 sidecar 文件路径。
 * @param home - dsh home；缺省由 {@link resolveDshHome} 解析。
 */
export declare function briefsFilePath(home?: string): string;
/**
 * 从会话事件摘录梗概输入：首条 + 末条真人用户消息，以及最后一条助手文本。
 * 合成注入（agent.inject 的 context 消息，source.kind !== 'user'）不入梗概；
 * 总字节数受 `maxBytes` 约束，超出的片段按顺序舍弃、最后一段截断。
 * @param events - 会话事件日志。
 * @param maxBytes - 输出摘录的总字节预算。
 * @returns 摘录轮次；无真人消息时为 []（调用方跳过生成）。
 */
export declare function extractBriefTranscript(events: readonly SessionEvent[], maxBytes?: number): BriefTranscriptTurn[];
/**
 * 解析梗概调用的 provider/model 路由。
 * - 用户默认选择为 deepseek 系 provider → 固定 `deepseek-v4-flash`；
 * - 其它开发商 → 沿用默认选择本身（不对其它厂商强塞 deepseek 模型名）；
 * - agent-default-model 服务缺失 → 回退会话自身最新的 `request/header` 路由；
 * - 再无 → harness 基线 `deepseek-official/deepseek-v4-flash`。
 * @param ctx - 服务上下文。
 * @param events - 目标会话事件（路由回退用）。
 */
export declare function resolveBriefRoute(ctx: Context, events: readonly SessionEvent[]): {
    provider: string;
    model: string;
};
/**
 * 规范化模型输出：去终端控制符、折叠空白、剥离两侧引号/强调符，
 * 超出 {@link MAX_BRIEF_CHARS} 以 … 截断。空文本返回 ''。
 * @param raw - 模型原始输出。
 */
export declare function normalizeBrief(raw: string): string;
/** 批量生成进度钩子。 */
export interface BriefGenerationHooks {
    /** 每个待生成会话开始前回调；completed 为已处理数，total 为待生成总数。 */
    onPending?(id: SessionId, completed: number, total: number): void;
    /** 单个会话生成失败时回调（不中断整体）。 */
    onFailed?(id: SessionId, error: unknown): void;
}
/**
 * 保证 `rows` 中每个会话都有梗概：缓存命中直接复用；缺失则生成并落盘
 * （历史会话回填与新会话首次展示统一走这条路径）；无任何聊天记录的会话
 * 直接标 {@link EMPTY_BRIEF}（不调 API、不落盘、不回显进度）。串行执行，
 * 回显顺序与行序一致；单个失败跳过并记 `onFailed`，下次 `/session list` 重试。
 * @param ctx - 服务上下文（llm / agentDefaultModel / sessions / sessionPersistence）。
 * @param rows - 待展示的会话行（`listSessions` 产出，新→旧）。
 * @param hooks - 进度钩子（可选）。
 * @param storeFile - sidecar 文件路径（测试注入；缺省用 dsh home 下的固定位置）。
 * @returns session id → 梗概（成功生成/缓存/「新对话」项；生成失败项不在其中）。
 */
export declare function ensureSessionBriefs(ctx: Context, rows: readonly SessionSummary[], hooks?: BriefGenerationHooks, storeFile?: string): Promise<Map<string, string>>;
