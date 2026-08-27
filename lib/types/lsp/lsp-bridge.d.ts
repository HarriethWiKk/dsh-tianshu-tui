/**
 * LspBridge — TUI 侧本地语言服务桥（展示层缓存 + 懒生命周期）。
 *
 * 职责：把「agent 触碰文件」翻译成一次异步诊断拉取，并把结果缓存为
 * 渲染层可同步读取的视图。与既有平台桥同构（clipboard-image / external-editor
 * 的本地进程交互先例）：不进会话事件、不发明事件类型、不注册任何 prompt/
 * 工具/上下文面——诊断是 TUI 私有展示状态，随 TuiApp dispose 全部销毁。
 *
 * 触发策略：
 * - 懒启动：首个匹配扩展名的文件才 spawn 对应语言 server（multi-manager 路由）；
 * - per-file in-flight 合并 + 5s 新鲜度冷却（高频工具步进不刷屏）；
 * - 扩展名无 server / server 未安装 → 一次标记 unsupported（渲染层回显 ⚠）；
 * - 拉取超时（timeoutMs，缺省 2000ms）静默返回空，下次 touch 重拉。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/lsp/lsp-bridge
 */
import { type MultiLspOptions } from './multi-manager.js';
import type { LspDiagnostic } from './manager.js';
/** 展示层诊断视图（LSP 0-based → 1-based 行列；file 为 cwd 相对路径）。 */
export interface LspDiagnosticView {
    /** cwd 相对路径（相对解析失败时原样绝对路径）。 */
    file: string;
    /** 1-based 行号。 */
    line: number;
    /** 1-based 列号。 */
    character: number;
    /** LSP severity：1 Error / 2 Warning / 3 Info / 4 Hint。 */
    severity: 1 | 2 | 3 | 4;
    message: string;
}
export interface LspBridgeOptions extends MultiLspOptions {
    /** LSP server 的 rootUri 与相对路径基准（会话 cwd）。 */
    cwd: string;
    /** 单次诊断拉取超时（毫秒）；缺省 2000。 */
    timeoutMs?: number;
    /**
     * 外部诊断源（伴生插件 provide('lsp') 服务的最小读面）：存在时 bridge
     * 消费它（与模型工具面共享同一 LSP server 集，不双份 spawn）；缺省用
     * 内置 multi-manager（未装配伴生插件时的降级路径）。source 的所有权
     * 归提供方——bridge.dispose 不 dispose source，只解绑。
     */
    source?: LspDiagnosticSource;
}
/** 外部 LSP 服务的最小读面（结构类型；TUI 不跨包依赖 lsp 插件）。 */
export interface LspDiagnosticSource {
    getDiagnostics(path: string, timeoutMs: number): Promise<readonly LspDiagnostic[]>;
    isAvailable(): boolean;
    dispose(): void;
}
/**
 * 官方 `ctx.lsp` 服务（@deepseek-ai/dsh-lsp，deepseek-harness 主仓）的最小读面——
 * 结构类型适配，TUI 不跨包依赖官方包。官方 seam 暴露五操作（含本 TUI 桥消费的
 * `getDiagnostics`）；未装配官方 lsp-stdio provider 时 query 抛 LSP_UNAVAILABLE，
 * 适配器 catch 为静默空。
 */
export interface OfficialLspServiceFacet {
    query(request: {
        operation: 'getDiagnostics';
        filePath: string;
        workspaceRoot: string;
    }, signal?: AbortSignal): Promise<{
        kind: string;
        diagnostics?: readonly LspDiagnostic[];
    }>;
}
/**
 * 把官方 `ctx.lsp` 服务适配为 {@link LspDiagnosticSource}（TUI 桥消费面）。
 * 诊断走官方 seam 的 `getDiagnostics` 操作（与模型工具面 lsp 工具共享同一
 * provider/server 集）；超时用 AbortSignal.timeout 交官方 query 取消；错误
 * （无 provider / 不支持 / 超时）一律静默返回空。所有权归官方服务——适配器
 * 的 dispose 是 no-op（TUI 不销毁宿主服务）。
 * @param service - 官方 ctx.lsp 服务（结构类型）。
 * @param workspaceRoot - 官方 seam 的 workspaceRoot（会话 cwd）。
 * @returns TUI 桥可直接消费的诊断源。
 */
export declare function officialLspSource(service: OfficialLspServiceFacet, workspaceRoot: string): LspDiagnosticSource;
/** 诊断源选择结果：service = 外部源已采纳；builtin = 回落内置 multi-manager。 */
export type SelectedDiagnosticSource = {
    kind: 'service';
    source: LspDiagnosticSource;
} | {
    kind: 'builtin';
};
/**
 * 诊断源选择（纯函数，任务6对齐，2026-08-27）：按装配形态择源——
 * 1. 社区/伴生形状（直接暴露 getDiagnostics 函数）→ 直接采纳；
 * 2. 官方 seam 形状（只有 query）→ **能力门控**：仅当服务声明
 *    `operations` 清单且包含 `getDiagnostics` 时才采纳为诊断源。seam 0.6.x
 *    只暴露导航四操作、无 getDiagnostics 也无 JSON-RPC 逃生口——盲目采纳会让
 *    seam 源顶掉内置 multi-manager，而其 query 恒报结构化不可用 → `/lsp`
 *    面板永久空（真回归）。未声明即回落内置桥；将来官方 seam 增补诊断操作并
 *    在 `operations` 里声明时自动恢复采纳。
 * @param lspService - reflect.get('lsp') 读到的服务（可为 undefined）。
 * @param workspaceRoot - 官方 seam 的 workspaceRoot（会话 cwd）。
 */
export declare function selectDiagnosticSource(lspService: unknown, workspaceRoot: string): SelectedDiagnosticSource;
export interface LspBridge {
    /** 通知桥「agent 触碰了该文件」：异步拉诊断并入缓存；不阻塞调用方。 */
    touchFile(path: string): void;
    /** 同步读缓存：该文件诊断（undefined = 无缓存/未拉取；[] = 已拉取无诊断）。 */
    diagnosticsFor(path: string): readonly LspDiagnosticView[] | undefined;
    /** 全量诊断视图（/lsp 面板数据源；按文件遍历缓存折叠）。 */
    entries(): readonly LspDiagnosticView[];
    /** 该文件是否确定无诊断来源（扩展名不支持或 server 未安装）。 */
    unsupported(path: string): boolean;
    /** 是否至少有一个语言 server 可用（面板空态区分「无诊断」与「未安装」）。 */
    isAvailable(): boolean;
    /** 注册诊断缓存变化回调（TuiApp 触发 renderLive）。 */
    onUpdate(cb: () => void): void;
    /** 销毁：kill 全部 server、清缓存与回调。 */
    dispose(): void;
}
export declare function createLspBridge(options: LspBridgeOptions): LspBridge;
