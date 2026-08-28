/**
 * submit-queue — 运行中提交的本地排队（对标 CC 排队消息；↑ 取回队首）。
 *
 * 宿主 followup 通道本身是数组 FIFO（agent inbox 逐轮消费，rc.2/alpha.1 一致），
 * 且宿主 inbox 其实有公开的 remove(messageId)/replace(...)（dsh-agent
 * lib/types/inbox.d.ts）与 cancel(cause, { keepInbox })（runtime-types.d.ts）——
 * 排队仍放在 TUI 侧是取舍而非被迫：① ↑ 取回是纯本地操作，不惊动宿主（无需
 * 经 messageId 与宿主 inbox 对账）；② 排队期图片以 data URL 暂存本地，投递时
 * 才走 attachments 持久化管线（提前入宿主会提前持久化）；③ 语义简单——running
 * 期间的 Enter 进本地队列（输入轨上方立即可见），turn/end 按序投递 followup
 * （与立即发送的宿主消费时机等价：都在下一轮边界）；中断不清队（保留用户意图）。
 * 中轮即时纠偏仍走 /steer、Ctrl+T（宿主 alpha.1 的 queue/steer 双模式亦作此
 * 区分）；Ctrl+Enter 插队（cancel-and-send，先打断再发）见文末 cancelAndSendInput。
 */
import type { AgentControls } from '../adapter/send.js';
import type { InputLine } from '../engine/input-line.js';
/** 一条排队中的待发消息。 */
export interface QueuedSubmit {
    text: string;
    images: string[] | undefined;
}
export declare class SubmitQueueController {
    private items;
    /** 入队（保持提交顺序）。 */
    push(text: string, images: string[] | undefined): void;
    /** 当前队列长度。 */
    size(): number;
    /** 只读快照（渲染用）。 */
    peekAll(): readonly QueuedSubmit[];
    /** 取回队首（最旧一条）回输入行。 */
    takeFirst(): QueuedSubmit | undefined;
    /** turn/end 全量取出（按提交顺序投递）。 */
    drain(): QueuedSubmit[];
    /** 切会话清空（调用方负责回显丢弃提示）。 */
    clear(): void;
}
/**
 * 排队展示行：`⏳ N 条排队 · 最旧一条（↑ 取回）`，超宽截断。
 * @param cols - 终端列数。
 * @param items - 只读队列快照。
 */
export declare function formatQueueLine(cols: number, items: readonly QueuedSubmit[]): string;
/** cancelAndSendInput 的依赖面（装配方闭包注入；本模块不 import app）。 */
export interface CancelAndSendDeps {
    /** 输入行（读取当前草稿 + 提交前清空）。 */
    input: Pick<InputLine, 'value' | 'images' | 'setValue' | 'clearImages'>;
    /** live agent 控制面（whenIdle 等打断落定；undefined = 无 live agent 时直接提交）。 */
    controls: Pick<AgentControls, 'whenIdle'> | undefined;
    /** 用户主动打断（app.handleAbort：cancel 带 keepInbox + 流式残文清理 + 回显）。 */
    abort(): void;
    /** 正常提交路径（app.handleSubmit：排队/直发由运行态分流）。 */
    submit(text: string, images?: string[]): void;
    /** 插队等待 whenIdle 落定的超时（毫秒；测试注入短值用）。缺省 30s。 */
    idleTimeoutMs?: number;
}
/**
 * whenIdle 落定等待的超时兜底（毫秒）：agent 卡死（whenIdle 只 resolve 不
 * reject）时插队消息永不发出会静默丢用户输入——超时后把草稿恢复回输入行，
 * 用户可见文本回来即知未发出，可重试。先到者胜：正常 resolve 先到则照常提交，
 * 超时先到则恢复草稿并放弃提交（settled flag 防双重提交/双重恢复）。
 */
export declare const CANCEL_AND_SEND_IDLE_TIMEOUT_MS = 30000;
/**
 * Ctrl+Enter 插队（cancel-and-send）：打断当前回合并把输入行草稿立即发出去。
 * 与 Ctrl+T steer 的区别：steer 不打断在途 step（下一轮边界才被消费），
 * cancel-and-send 先 cancel（keepInbox——宿主 inbox 里未消费的 steer/排队残留
 * 保留），等 whenIdle 落定后再走正常提交路径——此时 agent 已 idle，handleSubmit
 * 直发 followup，本地队列里更老的消息排在其后投递（「插队」语义）。先取草稿
 * 快照再清空输入行（与 steerInput 同款先清后送）；whenIdle 是 quiescence 语义
 * 只 resolve 不 reject——故设超时兜底（见 CANCEL_AND_SEND_IDLE_TIMEOUT_MS）。
 * 空白草稿（动作 when 已挡空串，此处挡纯空白）不插队。
 * @param deps - 装配依赖（输入行 / 控制面 / 打断 / 提交）。
 */
export declare function cancelAndSendInput(deps: CancelAndSendDeps): void;
