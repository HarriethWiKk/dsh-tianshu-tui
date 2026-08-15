/**
 * Phase 6.1 Slash 命令系统 — Cordis 服务式命令注册表与内置命令。
 *
 * 职责划分：
 * - `resolveSlashCommand`：纯函数最小唯一前缀解析（/ 前缀检测、歧义/未知 → null）。
 * - `SlashCommandRegistry`：实例化命令注册表（register/list/get/unregister/resolve/hint），
 *   经 `ctx.provide('tui.commands', registry)` 暴露为 Cordis 服务——外部插件可
 *   `ctx.get('tui.commands')?.register(...)` 扩展命令。
 * - `createBuiltinCommands`：内置命令工厂（/theme /session /clear /compact；/steer 由
 *   TuiApp 直接复用既有入口，注册表只保留其名字参与前缀解析与提示）。
 *
 * dsh 纪律：命令执行只改 UI 状态（主题/滚动区/会话切换）或调用既有服务，不写回 session
 * log、不发明事件类型。命令文本经 `/` 前缀在输入层分流，未知命令回显提示而非提交给 agent。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/commands
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionId } from '@deepseek-ai/dsh-session';
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        'agent-preset/selected': {
            agentPreset: string;
        };
    }
}
import { getActiveThemeName } from '../theme.js';
/**
 * Slash 命令执行上下文——TuiApp 在分发时注入。
 */
export interface SlashCommandArgs {
    /** 参数文本（命令名后已 trim；无参数为空串）。 */
    text: string;
    /** 服务上下文（提供方 ctx）。 */
    ctx: Context;
    /** 当前会话 id；尚未 attach 时为 null。 */
    sessionId: SessionId | null;
    /** 回显一行命令结果到 scrollback。 */
    echo: (text: string) => void;
    /** 请求重绘 live 区（命令执行后统一调用）。 */
    rerender: () => void;
}
/** 一条 slash 命令。 */
export interface SlashCommand {
    /** 命令名（不含 / 前缀；小写，互不为前缀歧义时才能唯一解析）。 */
    name: string;
    /** 命令面板/提示展示描述。 */
    description: string;
    /** 可选参数 ghost 提示（如 `<name>`）。 */
    argsHint?: string;
    /** 执行命令。可 async；抛错由分发层捕获并回显失败信息。 */
    run(args: SlashCommandArgs): void | Promise<void>;
}
/** 解析结果：命中的命令与剥离后的参数文本。 */
export interface SlashParse {
    command: SlashCommand;
    text: string;
}
/**
 * 内置命令名（解析 + 提示的单一事实来源；描述/argsHint 见 createBuiltinCommands）。
 * 含 /steer：TuiApp 复用既有 handleSteer 入口，此处只参与前缀匹配。
 * /status 同款：注册表只声明名字参与前缀解析/提示，实际显隐切换 handler 由
 * TuiApp 经 register 接线（见 ui/app.ts）。
 * /subagents、/workflow、/tasks 的命令定义在 createBuiltinCommands（deps 注入
 * TuiApp 的显隐切换）；/status 保持 TuiApp 内注册。
 */
export declare const BUILTIN_COMMAND_NAMES: readonly ['theme', 'session', 'fork', 'branch', 'clear', 'compact', 'steer', 'model', 'effort', 'preset', 'tasks', 'density', 'goal', 'status', 'subagents', 'workflow', 'config', 'skills', 'rewind', 'btw', 'doctor', 'mcp', 'remember', 'memory', 'export', 'exit', 'yolo'];
/**
 * 最小唯一前缀解析：`/` 前缀 + 命令名 `startsWith` 匹配。
 * 歧义（多命令同前缀）或未知名返回 null——不猜命令。
 * @param input - 输入行原始文本。
 * @param commands - 命令名集合（字符串或带 name 的对象，registry 实例与静态名表共用）。
 * @returns 命中的命令与剥离后的参数文本；无匹配返回 null。
 */
export declare function resolveSlashCommand(input: string, commands: readonly (string | {
    name: string;
})[]): {
    command: {
        name: string;
    };
    text: string;
} | null;
/**
 * 命令注册表——register/unregister/list/get/resolve/hint。
 * 同名 register 覆盖旧命令；空名或含空格的命令名 register 抛错。
 * 实例经 `ctx.provide('tui.commands', registry)` 暴露为 Cordis 服务。
 */
export declare class SlashCommandRegistry {
    private readonly commands;
    /**
     * 注册（或覆盖同名）命令。
     * @param command - 命令定义；空名或含空格的名字抛错。
     */
    register(command: SlashCommand): void;
    /**
     * 反注册命令；不存在时 no-op。
     * @param name - 命令名（不含 / 前缀）。
     */
    unregister(name: string): void;
    /**
     * 按注册顺序列出全部命令。
     * @returns 命令数组（注册顺序）。
     */
    list(): SlashCommand[];
    /**
     * 按名取命令；未注册返回 undefined。
     * @param name - 命令名（不含 / 前缀，精确匹配）。
     * @returns 命中的命令；未注册为 undefined。
     */
    get(name: string): SlashCommand | undefined;
    /**
     * 最小唯一前缀解析（委托 resolveSlashCommand，用实例注册表）。
     * @param input - 输入行原始文本。
     * @returns 命中的命令与参数文本；未知/歧义/非 slash 输入为 null。
     */
    resolve(input: string): SlashParse | null;
    /**
     * 内联提示：输入以 / 开头且有匹配命令时返回提示行；否则 null。
     * 展示在 live 区输入行上方（最小内联提示，不启用 overlay-engine 全屏面板）。
     * @param input - 输入行原始文本。
     * @returns 一行 `命令: /a /b …` 提示；无匹配为 null。
     */
    hint(input: string): string | null;
}
/**
 * 内置命令工厂依赖——TuiApp 私有能力注入（会话铸造、滚动区重置、面板显隐切换）。
 */
export interface BuiltinCommandDeps {
    /** /session new：新建会话并挂载（TuiApp.newSession）。 */
    newSession(): Promise<SessionId>;
    /** /fork、/branch（A3）：分叉当前会话（复制历史）并切换（TuiApp.forkSession）。 */
    forkSession(opts?: {
        directive?: string;
    }): Promise<SessionId>;
    /** C2 项 4：热切当前会话的模型（TuiApp.switchLiveModel）；返回是否已热切。 */
    switchLiveModel(selection: {
        provider: string;
        model: string;
    }): boolean;
    /** /clear：清空当前会话 scrollback（CommitEngine.reset）。 */
    clearScrollback(): void;
    /** /tasks 无参：切换任务窗格显隐（TuiApp 私有状态 + renderLive）。 */
    toggleTaskPanel(): void;
    /** /subagents：切换委派树面板显隐（T2.1；数据源为委派树缓存）。 */
    toggleSubagentsPanel(): void;
    /** /workflow：切换 workflow 运行中面板显隐（T2.2；数据源为运行中缓存）。 */
    toggleWorkflowPanel(): void;
    /** /rewind（C3 项 3）：打开 rewind overlay；返回是否已打开（无会话时 false）。 */
    rewindSession(): boolean;
    /** /btw（P1）：发起侧问；返回是否已发起（无会话/已有挂起侧问时 false）。 */
    askBtw(question: string): Promise<boolean>;
    /** /memory（P2）：打开记忆浏览器 overlay；返回是否已打开（无 memory 服务时 false）。 */
    openMemoryBrowser(): Promise<boolean>;
    /** /session switch（P3）：切换到既有 live 会话（id 字符串；app 侧转 SessionId）。 */
    switchSession(id: string): Promise<void>;
    /** /export（T3）：导出当前会话转录为 Markdown；path 缺省由实现决定；返回导出文件路径。 */
    exportTranscript(path?: string): Promise<string>;
    /** /exit：请求退出 TUI（与 Ctrl+Q 同一 onExit 路径）。 */
    requestExit(): void;
    /** /preset：当前会话的 agent（recompose/composedPreset 的 agentCtx 来源；无会话为 null）。 */
    currentAgent(): Agent | null;
    /** /preset：当前会话是否 blank（无消息且无进行中工具调用）——recompose 的调用方契约。 */
    isBlankSession(): boolean;
    /** /yolo：开启/关闭全放行模式（approval always-approve 快捷入口；返回开启后提示）。 */
    setYoloMode(flag: boolean): void;
}
/**
 * 装配内置命令（/theme /session /clear /compact）。
 * /steer 不在此列——TuiApp 复用既有 handleSteer 入口。
 * @param deps - TuiApp 私有能力。
 * @returns 内置命令数组（含描述/argsHint，供注册表与提示使用）。
 */
export declare function createBuiltinCommands(deps: BuiltinCommandDeps): SlashCommand[];
export { getActiveThemeName };
