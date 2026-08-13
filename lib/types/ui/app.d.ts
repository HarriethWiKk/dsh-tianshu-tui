/**
 * TuiApp — 会话界面主装配（中等 MVP）。
 *
 * 装配关系（渲染核心 + 适配层 + 本装配）：
 * - CommitEngine：scrollback 转录区（不可回退的已提交行）
 * - LiveEngine：底部 live 区（输入行 + 状态行 + 流式尾巴）
 * - InputHandler：raw-mode 键盘事件 → 键路由
 * - InputLine：输入缓冲区/光标/历史
 * - BlockStreamWriter + StreamRenderer：assistant 流式块 → markdown 提交
 * - adapter.transcript：会话事件日志 → TranscriptView 投影
 * - adapter.send：提交/取消 → AgentControls
 * - adapter.sessions：会话列表/新建/切换/退出 flush
 * - adapter.live：agent 实时状态（status/inbox/error）
 *
 * 反目标（不做）：设置/权限审批/主题定制/插件管理、slash 命令全集、
 * worker/星域面板。本装配只覆盖目标 1-6。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/ui
 */
import type { ReadStream, WriteStream } from 'node:tty';
import type { Context } from '@deepseek-ai/cordis';
import { SessionId } from '@deepseek-ai/dsh-session';
import { type ModelSelection } from '@deepseek-ai/dsh-agent';
import { type KeyName } from '../engine/input-handler.js';
import { type SessionSummary } from '../adapter/sessions.js';
/** TuiApp 构造选项。 */
export interface TuiAppOptions {
    ctx: Context;
    stdout: WriteStream;
    stdin: ReadStream;
    /** 启动时切入的会话 id；缺省优先恢复最近会话（live store 为空才新建）。 */
    initialSessionId?: SessionId;
    /** 主题名；'auto' 走系统终端配色探测，缺省 'auto'。 */
    theme?: string;
    /** 输入行为空时 Ctrl+C 的退出回调（raw-mode 下 Ctrl+C 是数据字节非 SIGINT）。 */
    onExit?: () => void;
    /** 外部编辑器触发键（KeyName）；缺省 'ctrl_e'（ctrl+o 已恢复为推理展开，Phase 6.4）。 */
    editorKey?: KeyName;
    /** 外部编辑器命令；缺省 $VISUAL/$EDITOR/平台缺省（测试注入点）。 */
    editorCommand?: string;
    /** 是否启用 Vim 键位（Phase 6.5）；缺省 false。 */
    vimEnabled?: boolean;
    /**
     * 主控模型的识图能力与视觉桥状态（图片附件的用户气泡提示数据源；
     * 由装配方按 agent 配置注入——TUI 是纯表现层，不自行查询模型能力）。
     */
    vision?: {
        /** 主控模型是否原生支持识图（图片直发）。 */
        supportsVision?: boolean;
        /** 是否配置了独立识图桥模型（主控不识图时经桥转文字描述）。 */
        bridgeEnabled?: boolean;
        /** 识图桥来源（configured=显式配置 / auto=自动选用）。 */
        bridgeSource?: 'configured' | 'auto' | 'none';
    };
}
/**
 * 解析 slash 命令（最小唯一前缀匹配，委托 registry 解析核心）。
 * 兼容导出（steer.spec.ts 消费）；TuiApp 内部走实例注册表（含扩展命令）。
 * @param input - 输入行提交的原始文本（已 trim）。
 * @returns 匹配的命令名与剥离后的参数文本；未匹配返回 null。
 */
export declare function parseSlashCommand(input: string): {
    kind: string;
    text: string;
} | null;
/**
 * 会话界面主装配。生命周期：构造 → attach()（接管终端）→ dispose()（恢复终端）。
 * attach 前不写终端；dispose 后终端恢复 raw-mode 前状态。
 */
export declare class TuiApp {
    private readonly ctx;
    private readonly stdout;
    private readonly stdin;
    private readonly commit;
    private readonly live;
    private readonly input;
    private readonly inputLine;
    private readonly resize;
    private readonly blockWriter;
    private readonly streamRenderer;
    /** 渲染性能监测（--debug-perf / RIVET_DEBUG_TELEMETRY=1 时激活；默认零开销）。 */
    private readonly perfMonitor;
    /** 输入状态控制器（slash 提示 / Tab 补全数据源，W-B5 提取的输入状态）。 */
    private readonly inputController;
    /** Slash 命令注册表：内置命令 + 'tui.commands' 服务面（外部插件可扩展）。 */
    private readonly slash;
    /** Ctrl+P 命令面板（overlay 渲染经 OverlayController 进出 alt screen）。 */
    private palette;
    /** API key 就绪标志（footer 右侧段；attach 时经 credentials.describe 刷新）。 */
    private apiKeyReady;
    private overlay;
    /** C3 项 3：rewind overlay（/rewind 双阶段回退面板）。 */
    private rewindOverlay;
    /** P2：memory 浏览器 overlay（/memory 记忆列表/过滤/删除）。 */
    private memoryOverlay;
    /** Phase 9d：流利度追踪（tool 事件 → 渲染策略；stale 提示消费于 renderLive）。 */
    private readonly fluency;
    /** Phase 5.3：底部 glance（状态/错误行派生 + 节流；renderLive 消费 current()）。 */
    private readonly glance;
    /** Phase 5.3：glance metrics 行的 model 名缓存（会话挂载时更新一次；
     *  renderLive 每帧读缓存，不重复查询 agentDefaultModel——模型定路是
     *  mount 时的决策，渲染不该引入额外的 currentSelection 读取）。 */
    private glanceModelName;
    /** 推理努力度缓存（挂载时 request/header 优先、currentSelection 兜底；
     *  request/header 事件更新——与 glanceModelName 同生命周期）。 */
    private glanceEffort;
    /** 会话内最后一条 assistant/message 的 usage（缓存命中/上下文占比数据源；
     *  streamFeed 折叠，随会话挂载/卸载）。 */
    private usageFold;
    /** 当前模型路由的上下文窗口（request/context 事件折叠；adapter 未报时 null）。 */
    private contextWindow;
    private transcript;
    private liveAgent;
    private controls;
    /** 工作流阶段/活动投影（Phase 5.1/6.2）；随会话挂载/卸载，dispose 时解绑订阅。 */
    private statusLine;
    /** 流式提交供给的 session/event 订阅；随会话挂载/卸载。 */
    private streamFeed;
    /** 本层经 create/resume 铸造的 handle；非 registry 兜底的裸 agent。dispose 时释放。 */
    private ownedHandle;
    private readonly initialSessionId;
    private readonly themeName;
    private readonly onExit;
    /** 外部编辑器触发键（Phase 6.4）；缺省 ctrl_e（ctrl+o 已恢复为推理展开）。 */
    private readonly editorKey;
    /** 外部编辑器命令注入（测试用）；缺省走环境变量/平台缺省。 */
    private readonly editorCommand;
    private readonly vimEnabled;
    /** T1.1：5 域投影缓存（snapshot 全量 + onChanged 按 key 分流；服务缺失时为 null → 整体降级）。 */
    private projectionCache;
    /** T4：任务窗格——sessionProjections 任务单元投影快照（服务缺失时为 null）。 */
    private taskItems;
    /** T4：任务窗格显隐（/tasks 切换）。 */
    private taskPanelVisible;
    /** T2.1：委派树面板显隐（/subagents 切换）。 */
    private subagentsPanelVisible;
    /** T2.2：workflow 运行中面板显隐（/workflow 切换）。 */
    private workflowPanelVisible;
    /** T2.1：委派树缓存（listDescendants 预取 + subagent/start|end 事件刷新；
     *  null = subagents 服务缺失/未预取 → 面板降级不可用）。 */
    private delegationEntries;
    /** 对话流 subagent 运行态（runId → 标签/开始时间；end 时结算并提交 scrollback）。 */
    private subagentRuns;
    /** T2.2：运行中 workflow 缓存（key = payload.id；start 建、end 移除）。 */
    private readonly workflowRuns;
    /** T2.2：已结算 run 视图缓存（workflow/end 折叠；/workflow 面板渲染运行中+已完成）。 */
    private readonly completedWorkflowRuns;
    /** T2.3：后台任务同步快照（tasks.list() 每次事件/会话挂载刷新）。 */
    private taskSnapshots;
    /** T2.3：onTaskDone 完成通知（live 区提示行；一次性，渲染后清空）。 */
    private taskNotice;
    /** T3.2：/config 设置面板显隐（/config 切换）。 */
    private configPanelVisible;
    /** T3.2：/config 面板投影缓存（settings describe + permission + credentials；null = 服务缺失）。 */
    private configProjection;
    /** T3.3：/skills 面板显隐（/skills 切换）。 */
    private skillsPanelVisible;
    /** T3.3：skill 快照缓存（ctx.skills.list；空数组 = 无技能或未加载）。 */
    private skillItems;
    /** T3.1：userQuestions provider 注册 disposer；attach 注册、dispose 释放。 */
    private interactionDisposer;
    /** T3.1：挂起提问状态机（pendingQuestion + questionFeedbackMode；Wave 1 提取）。 */
    private readonly question;
    /** C3 项 4：审批挂起状态机（pendingApproval + alwaysApprove；Wave 1 提取）。 */
    private readonly approval;
    /** P1：/btw 侧问状态机（临时 btw agent 旁路；Esc 折叠答案入 scrollback）。 */
    private readonly btw;
    /** P3：多会话快照层（live store 派生；tab 栏数据源）。 */
    private readonly sessionManager;
    /** T2.1：subagent 生命周期事件订阅 disposer；随会话挂载/卸载。 */
    private subagentDisposer;
    /** T2.2：workflow 事件订阅 disposer；attach 订阅、dispose 释放（跨会话运行）。 */
    private workflowDisposer;
    /** T2.3：tasks onTaskDone 订阅 disposer；随会话挂载/卸载。 */
    private taskDoneDisposer;
    /** T2.3：tasks attachSurface('tui') 控制面 disposer；attach 声明、dispose 释放。 */
    private taskSurfaceDisposer;
    /** T1.4：plan 投影 active 态（驱动 statusline [plan] 徽标；服务缺失时为 false）。 */
    private planState;
    /** C2 项 4：当前会话的模型选择 ref（newSession/switchSession 挂载；registry 兜底为 null）。 */
    private modelRef;
    /** C2 项 2：历史搜索 overlay（Ctrl+F；attach 时注册，消息快照激活时提供）。 */
    private searchOverlay;
    /** T1.2：/status 面板显隐（/status 切换；数据源为投影缓存）。 */
    private statusPanelVisible;
    /** T4：任务投影变更订阅 disposer；随会话卸载释放。 */
    private projectionDisposer;
    /** T5：紧凑渲染模式（/density 切换）——工具卡仅标题行。 */
    private compactMode;
    /** reasoning 流缓冲（reasoning-delta 累积）；段结束 commitReasoningBlock 落底清空。 */
    private reasoningText;
    /** 当前推理段起点（首个 reasoning-delta 的事件时间，Unix epoch ms）；live/落底耗时数据源。 */
    private reasoningStartedAt;
    /** 最近一次已落底推理块（折叠头行 + 保留全文；Ctrl+O 展开查看）。会话切换清理。 */
    private lastReasoningBlock;
    /** Ctrl+O 展开/收起最近推理块（live 区展示全文；scrollback 保持折叠头行）。 */
    private reasoningExpanded;
    /** 进行中工具的 presentCall 标题覆盖（callId → title）；result/abort/换会话清理。 */
    private readonly pendingCallTitles;
    private activeSessionId;
    private history;
    private tick;
    private ticker;
    private disposed;
    /** bracketed paste 处理器 disposer（attach 注册，dispose 释放）。 */
    private pasteDisposer;
    /** 渲染帧合并器：事件路径走 schedule（16ms 合并），critical 路径走 flushLiveRender。 */
    private renderBatcher;
    /** 上次输入框获得焦点的时间戳（Ctrl+V 剪贴板读图防抖；overlay 关闭后
     *  FOCUS_DEBOUNCE_MS 内走文本路径，避免把 overlay 里的图误附进输入框）。 */
    private lastInputFocusAt;
    /** 主控模型是否原生支持识图（图片附件气泡提示；装配方经 options.vision 注入）。 */
    private supportsVision;
    /** 是否配置独立识图桥模型（主控不识图时经桥转文字描述后发送）。 */
    private visionBridgeEnabled;
    /** 识图桥来源（'configured' / 'auto' / 'none'；气泡提示文案用）。 */
    private visionBridgeSource;
    constructor(options: TuiAppOptions);
    /** Phase 8：审批 answerer 订阅的 disposer（dispose 时解绑）。 */
    private approvalDisposer;
    /** 当前会话 id（null = 尚未 attach）。 */
    get sessionId(): SessionId | null;
    /**
     * 接管终端：切主题（'auto' 探测背景）、装配会话、注册键路由与 resize、启动渲染 ticker。
     * @param initialSessionId - 覆盖构造选项的起始会话；缺省用构造 initialSessionId，
     *   再缺省恢复最近会话（live store 为空才新建）。
     */
    attach(initialSessionId?: SessionId): Promise<void>;
    /** T3.1：结构化提问 answerer——薄转发 QuestionController（渲染/ESC/重绘由控制器回调承担）。 */
    private handleQuestionRequest;
    /**
     * bracketed paste 文本落地（右键粘贴/终端菜单粘贴）：先尝试剪贴板读图
     * （命中则附图并吞掉这段 paste——粘贴进来的文本是图片字节的乱码，不插图
     * 会污染输入框）；再识别图片路径加载为附件；最后才是普通文本插入。
     * @param text - 终端传来的粘贴文本
     */
    private handlePaste;
    /**
     * Ctrl+V 处理：优先读剪贴板图片 → 失败则 fallback 到文本粘贴。
     * 焦点防抖：输入框在最近 FOCUS_DEBOUNCE_MS 内刚获得焦点时跳过读图
     * （编辑器/overlay 切回后 1s 内的 Ctrl+V 大概率是文本操作）。
     */
    private handleCtrlV;
    /**
     * 设置当前主控模型的识图能力与桥接状态（图片附件气泡提示数据源）。
     * 由装配方按 agent 配置注入；TUI 是纯表现层，不自行查询模型能力。
     * @param supportsVision - 主控模型是否原生支持识图（图片直发）
     * @param bridgeEnabled - 是否配置了独立识图桥模型（主控不识图时经桥转描述）
     * @param bridgeSource - 识图桥来源（configured/auto/none；气泡提示文案用）
     */
    setVisionInfo(supportsVision: boolean, bridgeEnabled: boolean, bridgeSource?: 'configured' | 'auto' | 'none'): void;
    /** T3.1：结算挂起的提问（用户选择/取消）——薄转发。 */
    private settleQuestion;
    /** T3.1：取消挂起的提问（Esc/Ctrl+C）——薄转发。 */
    private cancelQuestion;
    /**
     * Phase 9b：把可恢复会话列表写进 scrollback（启动时）。
     * 排除当前活跃会话；无其他可恢复会话时静默（不占位）。
     * live 标注取 live store（listSessions 的 header 无 live 字段，
     * 经 ctx.sessions.list() 的 id 集合判定）。
     */
    private renderRestorableSessions;
    /**
     * 新建会话：经 ctx.agents.create 铸造 session+agent，本层持有 handle。
     * 模型定路取 agentDefaultModel 当前选择（settings 用户层实时生效），并经
     * installModelSelection 耦合 prompt 装配与请求路由（headless 同款接线）。
     * 会话 id 由本层铸造（session-<uuid>），create 返回的 handle 由 ownedHandle 持有、
     * detach/dispose 时释放；controls 走 controlsFromHandle（驱动 handle.agent）。
     * 先卸载当前挂载（与 switchSession 对称）：否则 transcript/liveAgent/
     * statusLine/streamFeed 被覆盖即泄漏监听器，旧 ownedHandle 丢失即泄漏 agent。
     * @returns 新会话的 id（本层铸造的 session-<uuid>）。
     */
    newSession(): Promise<SessionId>;
    /**
     * C2 项 4：热切当前会话的模型。改 modelRef.current——下一次 agent 步进
     * （prompt assembly）自动生效，不中断当前步骤。registry 兜底的会话
     * （ref 由其他装配方持有）返回 false，调用方提示不可热切。
     * @param selection - 新的 provider/model。
     * @returns 是否已热切（modelRef 存在）。
     */
    switchLiveModel(selection: ModelSelection): boolean;
    /**
     * A3：分叉当前会话（SessionStore.fork 复制历史到新 child session，带
     * parentSession 血缘）并切换到分叉（agent-ensure 走 switchSession 的
     * resume/registry 兜底路径）。无活跃会话时抛错（命令分发层回显失败）。
     * @param opts - 可选 directive：fork 后作为首条消息提交给新会话（分叉探索方向）。
     * @returns 分叉会话 id。
     */
    forkSession(opts?: {
        directive?: string;
    }): Promise<SessionId>;
    /**
     * C3 项 3：打开 rewind overlay（/rewind）。消息快照 = transcript 视图
     * （seq/turn/text），执行回调做「文件回退 + 会话截断 + 持久化截断」。
     * @returns 是否已打开（无活跃会话或无消息时 false）。
     */
    rewindSession(): boolean;
    /**
     * P1：发起 /btw 侧问——BtwController 旁路（临时 btw agent，不持 ownedHandle、
     * 不经过 switchSession）。返回是否已发起：无活跃会话或已有挂起侧问时 false
     * （命令分发层回显提示）；创建/提问失败抛错由 runSlash 统一回显。
     * @param question - 侧问文本（已 trim）。
     * @returns 是否已发起。
     */
    private askBtw;
    /**
     * T3：/export 会话导出——把当前会话完整事件日志渲染为 Markdown 并写盘。
     * 数据源是 session.events（权威事件流，非渲染视图）：完整内容、无折叠截断。
     * path 缺省 = 会话创建目录下 `dsh-export-<id>.md`（header.cwd 缺失时回退
     * 当前进程 cwd）。无活跃会话或写盘失败抛错——命令分发层回显失败（fails loud）。
     * @param path - 目标文件路径；缺省由会话 cwd 决定。
     * @returns 实际写入的导出文件路径。
     */
    private exportTranscript;
    /**
     * P2：打开 memory 浏览器 overlay。条目快照 + 删除回调在激活时经 memory
     * 服务注入（reflect 动态获取；服务缺失返回 false，命令层回显不可用）。
     * @returns 是否已打开。
     */
    private openMemoryBrowser;
    /**
     * C3 项 3：执行回退。mode 决定范围：
     * - convo：仅截断会话（内存 + 持久化）
     * - code：仅文件回退（FileHistory.rewindToBoundary）
     * - both：两者
     * 持久化失败向上抛（RewindOverlay 显示错误）；文件快照缺失计入 filesSkipped。
     * @returns 文件变更数/缺口数与截断 seq。
     */
    private executeRewind;
    /** 文件回退：收集 atSeq 之后的写工具 callId，经 fs-snapshot FileHistory 恢复。 */
    private rewindFiles;
    /**
     * 会话截断：先持久化后内存——truncateStored 失败时内存不动（状态一致、
     * 可重试），成功后再截内存态（同步纯内存操作，不抛错）。
     * 公开版 dsh-session 以 fork 派生代替内存截断，Session 无 truncate 能力
     * 时 fails loud（rewind 的 convo/both 模式在无截断能力的宿主上不可用）。
     * @param atSeq - 截断到的 seq（含）。
     */
    private truncateSession;
    /**
     * 切换到既有会话：卸载旧投影/控制面（并释放本层持有的旧 handle），
     * 再 agent-ensure 目标会话——registry 有 live agent 走 controlsFromRegistry 兜底
     * （非自有，不 dispose）；无则 resume 拿 handle（本层持有并 dispose）。
     * resume 的模型定路沿用会话持久化的 request header（跨重启续模），
     * 无 header（从未成功发起请求的会话）才落 agentDefaultModel 当前选择。
     * @param id - 目标会话 id；必须是 live store 中已存在的会话。
     */
    switchSession(id: SessionId): Promise<void>;
    /**
     * 挂载当前会话的投影与控制面：transcript/live/controls 就位后，
     * 将已提交的历史渲染进 scrollback。
     * @param id - 目标会话 id（activeSessionId 已在调用方设置）。
     */
    private mountSession;
    /** T2.1：预取委派树（async；空会话/服务缺失时置 null 降级）。 */
    /**
     * 对话流 subagent 行的显示标签：委派树缓存命中 label 用之，否则 id 短哈希。
     * @param id - 子代理会话 id。
     * @returns 显示标签。
     */
    private subagentLabel;
    private refreshDelegationTree;
    /** T2.2：运行态缓存项 → 面板视图（终态含 stopReason/agentsStarted）。 */
    private toWorkflowRunView;
    /** T3.2：刷新 /config 面板投影（settings describe + permission + credentials；服务缺失降级）。 */
    private refreshConfigProjection;
    /** T3.3：刷新 skill 快照（ctx.skills.list；服务缺失时空数组）。 */
    private refreshSkillItems;
    /** 当前主题（动态读取，切主题后立即生效）。 */
    private get theme();
    /**
     * 统一 scrollback 写入：先清除 live 区（mid-stream commit 协议），再写条目。
     * 不擦则文本写在光标处（live 区底部），随后 renderLive 重绘 live 区把刚写的
     * 内容覆盖——用户消息丢失根因（assistant 流式 commit 已带 clearForCommit，
     * 非流式路径缺失导致行为不对称）。
     */
    private commitToScrollback;
    /**
     * 提交用户输入：追加输入历史、将用户消息渲染进 scrollback、
     * 走 adapter.send 的 followup 驱动 agent。slash 命令（/steer）分流到 handleSteer。
     * @param text - 输入框提交的文本；空文本但无图时 no-op
     * @param images - 输入框携带的图片附件 data URL 列表（可省略）
     */
    handleSubmit(text: string, images?: string[]): void;
    /**
     * 用户气泡提交：正文 + 图片附件行 + 识图能力提示（vision 三态文案）。
     * 有图且终端支持图形协议时，图片在气泡提交后异步 prepare（本地转码，
     * 毫秒级，先于任何网络往返的 assistant 输出）并以同一写窗口协议追加
     * 图形序列（先清 live 区再 writeRaw，写完立即重绘）——物理上图片位于
     * 所属气泡下方、先于后续流式输出；prepare 失败静默降级为纯文本气泡。
     * @param content - 用户消息正文（已 mention 展开）
     * @param images - 图片 data URL 列表（已 normalize；可省略）
     */
    private commitUserPrompt;
    /** 用户气泡正文（含 📎 附件行与识图能力提示）。 */
    private writeUserBubbleLines;
    /**
     * 执行一条 slash 命令：注册表解析 → handler 运行 → 回显/错误提示。
     * 命令回显写 scrollback（用户可见），但不写回 session log（dsh 纪律：
     * 命令执行是 UI 层副作用，session 事件词汇不变）。
     * @param input - 输入行提交的原始文本（已 trim，以 / 开头）。
     */
    private runSlash;
    /**
     * A1：把未命中的 slash 输入委托给 CommandService（cordis 命令通道）。
     * 无会话、commands 服务未装配、或命令未知名（execute 返回 undefined）时
     * 返回 false，由调用方维持「未知命令」回显；成功/失败回显在此完成。
     * @param input - 完整 slash 输入（含 / 前缀）。
     * @param echo - scrollback 回显回调。
     * @returns 命令是否被 CommandService 受理（true 时调用方不再回显未知命令）。
     */
    private runCordisCommand;
    /**
     * 提交中轮转向：渲染差异化 steer 消息（marker/颜色区分 user）进 scrollback，
     * 走 adapter.send 的 steer API。空文本 no-op（/steer 无参数、Ctrl+T 空输入）。
     * @param text - 转向文本。
     */
    private handleSteer;
    /**
     * 取消当前 agent 活动：Ctrl-C 走 adapter.cancel（cause { kind: 'user' }）。
     * 空闲时 Ctrl-C 幂等 no-op。
     */
    /**
     * Phase 8：审批 answerer 入口——薄转发 ApprovalController（短路/委托/挂起
     * 由控制器内聚，会话归属经 getCurrentSessionId 注入）。
     * @param req - 待决审批请求。
     * @param next - waterfall 委托（不处理时调用）。
     * @returns 用户决定（allowed-once/rejected/cancelled）或 next() 结果。
     */
    private handleApprovalRequest;
    /** Phase 8：结算挂起的审批请求（用户按键/取消）——薄转发。 */
    private settleApproval;
    /** 取消当前运行（Esc/Ctrl+C）：cancel agent、丢弃未发出的流式/推理缓冲并重置流渲染。 */
    handleAbort(): void;
    /**
     * Phase 6.4：打开外部编辑器编辑当前输入行。编辑器是外部进程，必须暂时
     * 退出 raw-mode（编辑器需要正常终端交互）；spawnSync 阻塞期间 ticker 暂停。
     * 任何路径（含编辑器失败）都恢复 raw-mode。编辑结果回填输入行。
     */
    private openExternalEditor;
    /**
     * Tab 补全（Phase 6.3）：委托 InputController 状态机——首次 Tab 解析
     * 光标前 @ 路径 token 的候选并应用首项，再次 Tab 循环。无 @ token 时
     * 返回 false，Tab 保持原行为（InputLine 照常发出 'tab' 事件）。
     */
    private handleTabComplete;
    /**
     * 输入行 ghost 预览文本（阶段 2）：菜单选中命令时预览补全剩余
     * （`/th` + 选中 /theme → `eme`）；完整命令名 + 尾空格 → 预览参数占位
     * （`/theme ` → `<name>`）。菜单关闭/光标不在末尾/无补全关系 → null。
     * @returns ghost 文本或 null。
     */
    private slashGhostText;
    /**
     * 接受 slash 菜单当前选中项（Tab / Enter）。
     * Enter 且输入已是完整命令名（如 `/theme`）→ 关闭菜单并直接提交；
     * 否则补全命令名到输入行（有 argsHint 的命令补到 `cmd ` 留参数位，
     * 参数建议留待下一批），随后关闭菜单。
     * @param opts - submit：Enter 语义（精确命令直接发送）。
     */
    private acceptSlashCompletion;
    /**
     * C3 项 4：Shift+Tab 三态循环（对齐 grok 的两轴模型，plan 与 permission 正交）：
     * Normal → Plan（planMode.set(true)）→ Always-Approve（plan off + 本地短路）→ Normal。
     * plan 切换经 planMode 服务（投影总线驱动 planState 徽标）；always-approve 是
     * 纯 TUI 本地标志（不持久化，退出即失），对审批 answerer 短路放行。
     * alwaysApprove 优先判断：它是同步本地态；planState 经投影异步更新，
     * 若按投影判断会在 Always-Approve 态误走回 Plan 分支。
     */
    private cycleMode;
    /** C3 项 4：经 planMode 服务切换 plan 状态（未装配或未挂载时静默降级）。 */
    private setPlanMode;
    /** 键路由：Enter 提交 / Ctrl-C 取消或退出 / 上下键历史 / 其余交给 InputLine。 */
    private handleKey;
    /**
     * Phase 5.3：glance 一行条的可得数据。model（request header 优先、
     * agentDefaultModel 兜底）、effort（同构）、缓存命中率与上下文占比
     * （最后一条 assistant/message 的 usage 折叠）、上下文窗口
     * （request/context 折叠）、turn 数、本轮耗时。任何数据缺失 → 对应段
     * 省略（glance 段组装按可得段渲染，窄宽渐进 drop）。
     * 无可渲染数据返回 null（不占位）。
     */
    private glanceMetrics;
    /**
     * 把渲染行批量提交到 scrollback（保持时间顺序）。
     * @param rows - RenderedRow 数组。
     */
    private commitRows;
    /**
     * 流式事件供给：assistant text-delta 推进 blockWriter（节流切块，稳定前缀
     * commit 进 scrollback）；message/turn 边界 flush + finalize 收尾。aborted
     * turn 的残文由 handleAbort discard/reset，不在此 commit。
     * @param event - 当前会话的 session/event（订阅处已按会话过滤）。
     */
    private handleStreamEvent;
    /** tools 服务的 presenter 面（可选服务：未装配返回 undefined → 桥软降级）。 */
    private toolPresenters;
    /**
     * 结算工具卡实时提交：从 transcript 查配对 call 的 name/arguments →
     * presenter 桥 → 卡片渲染 → 串行在流式文本 flush 之后 commit 进
     * scrollback（保证「文本 → 卡」的事件序）。配对缺失（截断/rewind 边界）
     * 无卡可渲染，静默跳过。
     */
    private commitSettledToolCard;
    /**
     * 推理段落底：静态 `✻ 思考 (Ns) · N 行` 折叠头行（对标竞品默认折叠——
     * 正文经 Ctrl+O 展开查看）整块 commit 进 scrollback，清缓冲。空缓冲 no-op。
     * 调用点即段边界：首个 text-delta / tool/call / assistant/message /
     * 非中止 turn/end。
     */
    private commitReasoningBlock;
    /** 丢弃推理缓冲（abort / 会话切换；aborted turn 的推理不落底）。 */
    private discardReasoning;
    /** 流式收尾：吐尽节流缓冲，并把 StreamRenderer 剩余 pending commit 进 scrollback。 */
    private flushStream;
    /** wrapping-aware display rows（空行计 1）。 */
    private displayRowsFor;
    /** critical 路径同步穿透：用户交互（提交/审批/按键）不等 16ms 帧边界。 */
    private flushLiveRender;
    /** 渲染一帧 live 区：状态行 + 流式尾巴 + 进行中工具卡 + 输入行。 */
    private renderLive;
    /**
     * 卸载当前会话的投影与控制面，并按 opts 处理本层持有的 handle：
     * - keepHandle（P3 side conversation 切换）：所有权让渡 registry——agent
     *   保持 live（可切回复用），退出时由 agent-loop factory 统一 teardown；
     *   modelRef 同步让渡（registry 兜底语义：不可热切）。
     * - 缺省（dispose 退出）：释放本层 handle（create/resume 铸造的）。
     * registry 兜底的裸 agent 非自有，两种情况都不 dispose。会话本身所有权归
     * 持有方，不销毁。
     * @param opts - keepHandle：切换保留模式（默认释放）。
     */
    private detachProjections;
    /**
     * 退出：先 flush 所有 live 会话到持久层（退出恢复 checkpoint）、停止 ticker、
     * 卸载投影、恢复终端 raw-mode。
     * @returns 全部 flush 完成后 resolve。
     */
    dispose(): Promise<void>;
    /**
     * 刷新会话列表（供外部面板查询；本 MVP 的会话面板直接读 store）。
     * @returns 全部会话的摘要列表。
     */
    refreshSessions(): Promise<SessionSummary[]>;
}
