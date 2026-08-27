/**
 * actions/types — 统一 action registry 的核心类型（键位动作条目形状）。
 *
 * 单一事实来源：键位绑定（KeyBinding）、触发条件（when）、作用域（context）、
 * 展示文案（hint/help）与执行体（run）收敛为 KeyAction 一条登记。TuiApp.handleKey
 * 的键路由、快捷键面板（format/keymap-panel）与 footer 上下文提示
 * （format/prompt-footer）全部从同一张动作表匹配/投影——新增键位只登记一条动作。
 *
 * 分层：
 * - types.ts（本文件）：KeyBinding / KeyAction / ActionContext / BlockingKeyContext。
 * - registry.ts：ActionRegistry（match + 同域键位冲突校验 + confirmMs 双击布防）。
 * - builtin-actions.ts：内置动作表（run 只经 ActionContext 触达 TuiApp，不 import app）。
 * - key-contexts.ts：阻塞态上下文（question/btw/approval/inspect）统一轮询接口。
 * - projections.ts：keymap 条目 / footer 提示段的投影纯函数。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/actions
 */
import type { KeyName, KeyPress } from '../engine/input-handler.js';
import type { ApprovalOutcome } from '../controllers/approval-controller.js';
/**
 * 键位绑定：name/char/meta 至少给一个，给定字段全部相等才算命中。
 * 可打印字符键（如审批 y/n）用 char（input-handler 里 name 恒为 'unknown'）；
 * 控制键用 name；Alt 修饰加 meta: true（如 Alt+Backspace 删附件）。
 */
export interface KeyBinding {
    /** 按键语义名（engine/input-handler 的 KeyName）。 */
    name?: KeyName;
    /** 可打印字符（大小写敏感；控制键到达时 char 为 ''）。 */
    char?: string;
    /** Alt/Meta 修饰约束；缺省不区分 meta 状态。 */
    meta?: boolean;
}
/** 动作分类（keymap/footer 分组投影用）。 */
export type ActionCategory = '会话' | '面板' | '输入' | '模式' | '工具';
/**
 * 动作作用域：global = 常规态可触发；approval/question/overlay = 对应阻塞态
 * 独占轮询（不参与常规 match；keymap 面板只投影 global 域）。
 */
export type ActionScope = 'global' | 'approval' | 'question' | 'overlay';
/**
 * 路由相位（行为保持：对齐原 handleKey if 链的相对位置）：
 * - early：overlay 委派之前——shift_tab/ctrl_n/ctrl_p 等在面板打开时先生效（现状语义）。
 * - main：阻塞上下文轮询之后——esc 打断/双击 rewind、ctrl_c、ctrl_o、ctrl_t 等。
 * - tail：slash 菜单与 inspect 上下文键之后——空 Tab 命令菜单、Alt+Backspace、↑↓。
 */
export type ActionPhase = 'early' | 'main' | 'tail';
/**
 * 键位动作（注册表条目）。run 返回 false = 未消费（继续流向后续路由直至
 * InputLine 兜底——双击确认首按用）；其余（含 undefined）视为已消费。
 */
export interface KeyAction {
    /** 动作 id（如 'session.new'；confirmMs 布防与投影锚点）。 */
    readonly id: string;
    /** 触发键位（任一绑定命中即候选）。 */
    readonly keys: readonly KeyBinding[];
    /** 触发条件（缺省恒真）；同键多动作靠 when + 注册序分流。 */
    readonly when?: (ctx: ActionContext) => boolean;
    /** 作用域（缺省 'global'）。 */
    readonly context?: ActionScope;
    /** 路由相位（缺省 'main'；见 ActionPhase）。 */
    readonly phase?: ActionPhase;
    readonly category: ActionCategory;
    /** 短文案（footer 提示段 / keymap 动作列）。 */
    readonly hint: string;
    /** 长描述（帮助面扩展位）。 */
    readonly help?: string;
    /** 双击确认窗口（ms）：首按布防、窗口内再按触发；布防状态由 registry 集中管理。 */
    readonly confirmMs?: number;
    /** keymap 键位列展示覆盖（如 'Ctrl+F / Ctrl+R'）；缺省由 keys 生成。 */
    readonly keysLabel?: string;
    /** keymap 面板投影顺序（小在前）；缺省不进 keymap。 */
    readonly keymapOrder?: number;
    /** true = 不投影进 keymap 面板（同键合并行由他条承担 / 内部动作）。 */
    readonly keymapHidden?: boolean;
    /** true = 键位只在 kitty 键盘增强协议下可达（CSI u 修饰键编码）；keymap
     *  投影按终端能力过滤（不支持的终端永不收到该键，行隐身避免展示死键）。 */
    readonly requiresKittyKeyboard?: boolean;
    /** footer 上下文提示段文案（approval 域投影用）；缺省不进 footer。 */
    readonly footerHint?: string;
    /** 执行体（只经 ActionContext 操作 TuiApp）。 */
    run(ctx: ActionContext, key: KeyPress): boolean | void;
}
/**
 * TuiApp 暴露给动作执行体的操作面（装配点在 ui/app.ts，闭包注入私有方法）。
 * 读取方法供 when 守卫；操作方法即原 handleKey 各分支的业务调用原样搬出。
 */
export interface ActionContext {
    /** agent 运行中（Esc/Ctrl+C 打断语义开关）。 */
    isRunning(): boolean;
    /** 输入行为空串。 */
    inputEmpty(): boolean;
    /** slash 命令菜单打开中（打开时 Esc/Tab/↑↓ 归菜单，不走全局动作）。 */
    slashMenuOpen(): boolean;
    /** 检查类面板（/config /skills /status /lsp /tasks）任一打开。 */
    inspectAny(): boolean;
    /** vim normal 态（Esc 空操作——双击 rewind 的布防/触发都跳过）。 */
    vimNormalEsc(): boolean;
    /** 有可展开的推理块（流式缓冲或已落底块；无则 ctrl_o 落给 editorKey 分支）。 */
    hasReasoning(): boolean;
    /** 有进行中的工具卡（空 Enter 展开/收起目标）。 */
    hasPendingToolCard(): boolean;
    /** 输入行有图片附件（空行 Alt+Backspace 删附件目标）。 */
    hasImages(): boolean;
    /** 运行中提交队列非空（空输入 ↑ 取回队首）。 */
    hasQueuedSubmits(): boolean;
    /** 命令面板打开中（ctrl_f 历史搜索避让）。 */
    paletteOpen(): boolean;
    /** 审批挂起中（approval 域动作 when）。 */
    approvalPending(): boolean;
    /** onExit 装配存在（双击退出布防门控；无则 Ctrl+C 退化为纯打断/清空）。 */
    readonly hasExit: boolean;
    /** 布防（首次触发记录时间戳）。 */
    confirmArm(id: string, now: number): void;
    /** 窗口内已布防（窗口取自动作 confirmMs）。 */
    confirmWithin(id: string, now: number): boolean;
    /** 撤防。 */
    confirmDisarm(id: string): void;
    /** Shift+Tab 三态模式循环（Normal → Plan → Always-Approve → Normal）。 */
    cycleMode(): void;
    /** Ctrl+N 新会话（/session new 语义）。 */
    newSession(): void;
    /** Ctrl+S 恢复最近的其他会话。 */
    restoreRecentSession(): void;
    /** 请求退出（onExit 路径；无 onExit 时 no-op）。 */
    requestExit(): void;
    /** Ctrl+P 命令面板开关（backfill 模式）。 */
    togglePalette(): void;
    /** 空 Tab 命令菜单（execute 模式：Enter 直接执行）。 */
    openPaletteMenu(): void;
    /** Ctrl+. 快捷键面板开关。 */
    toggleKeymap(): void;
    /** Ctrl+F 历史搜索 overlay 开关（打开时快照 transcript 消息）。 */
    toggleHistorySearch(): void;
    /** 空 Enter：最后一张进行中工具卡展开/收起。 */
    toggleLatestToolCard(): void;
    /** Esc/Ctrl+C 打断当前回合。 */
    abort(): void;
    /** Esc 关闭检查类面板（inspect.dispatch close，含重绘）。 */
    inspectClose(): void;
    /** 双击 Esc 触发 rewind overlay（无可回退消息时内部回显警告）。 */
    rewindSession(): void;
    /** Ctrl+O 推理块展开/收起。 */
    toggleReasoning(): void;
    /** editorKey（缺省 Ctrl+E）外部编辑器。 */
    openExternalEditor(): void;
    /** Ctrl+T 中轮转向：非空输入行转向提交并清空；空输入 no-op。 */
    steerInput(): void;
    /** Ctrl+Enter 插队（cancel-and-send）：打断当前回合（keepInbox）并在落定后
     *  经正常提交路径直发输入行草稿（controllers/submit-queue 承担编排）。 */
    cancelAndSend(): void;
    /** Ctrl+V 剪贴板图片粘贴（无图 fallback 文本）。 */
    pasteClipboard(): void;
    /** 空行 Alt+Backspace：移除末张图片附件。 */
    removeLastImage(): void;
    /** 空输入 ↑：取回运行中提交队列队首回输入行。 */
    recallQueuedSubmit(): void;
    /** ↑↓ 透传 InputLine 历史导航。 */
    passHistoryKey(key: KeyPress): void;
    /** 清空输入行（Ctrl+C 空闲草稿语义；setValue 记 undo）。 */
    clearInput(): void;
    /** 记录 Ctrl+C 字节处理时间（Windows SIGINT 防抖数据源）。 */
    markCtrlC(now: number): void;
    /** 请求重绘 live 区。 */
    flushLive(): void;
    /** 结算挂起审批（allowed-once/rejected/cancelled）。 */
    settleApproval(outcome: ApprovalOutcome): void;
    /** a 键：先开 always-approve 再结算当前请求（挂起中的这张也立即通过）。 */
    approveAlways(): void;
    /** t 键：该工具进会话白名单（后续自动放行）并结算当前请求。 */
    approveToolSession(): void;
    /** 挂起审批的命令前缀（p 键 when 守卫与投影用；非 bash 类/无挂起 null）。 */
    approvalCommandPrefix(): string | null;
    /** p 键：命令前缀进会话白名单（bash 类同前缀请求后续自动放行）并结算当前请求。 */
    approveCommandPrefix(): void;
    /** f 键：进入拒绝反馈输入态（清空输入行，Enter 提交 / Esc 返回选项态）。 */
    startApprovalFeedback(): void;
}
/**
 * 阻塞态键上下文统一接口（question/btw/approval/inspect）：TuiApp.handleKey
 * 按固定优先级轮询（isActive 命中才委派）。handleKey 返回 false = 放行给
 * 后续路由（btw 只消费 Esc/Ctrl+C，其余键照常进输入行——现状语义）。
 */
export interface BlockingKeyContext {
    /** 上下文标识（调试/日志用）。 */
    readonly id: string;
    /** 是否处于阻塞态（轮询入口判定）。 */
    isActive(): boolean;
    /** 键处理；true = 已消费（终止路由）。 */
    handleKey(key: KeyPress): boolean;
}
