/**
 * T9 OverlayEngine — 管理全屏覆盖层的 alternate screen buffer 切换。
 *
 * 核心机制：
 * - 进入 overlay 时：`\x1B[?1049h` 切换到 alternate screen buffer
 * - overlay 内：全屏逐行渲染，用 `cursorTo(1,1)` 定位到顶部
 * - 退出 overlay 时：`\x1B[?1049l` 恢复主屏，scrollback 完整无损
 *
 * Surface 路由逻辑复用现有的 `src/tui/surface/router.ts`（纯逻辑，零依赖）。
 * OverlayEngine 只负责终端 buffer 切换和渲染调度。
 *
 * 支持的 overlay 类型（对应现有 Surface）：
 * - Starmap (星图) — 星君/星域总览
 * - Cockpit (座舱) — 运行时状态仪表盘
 * - Chronicle (编年史) — 会话回放
 * - Pager — 分页查看器
 * - CommandPalette — 命令面板
 */
import type { WriteStream } from 'node:tty';
/** overlay 标识。内置名之外允许任意字符串（扩展 overlay）。 */
export type OverlayId = string;
/** overlay 渲染器：全屏内容生产 + 激活/失活生命周期钩子。 */
export interface OverlayRenderer {
    /** 渲染 overlay 内容。返回 ANSI 格式化后的行数组。 */
    render(width: number, height: number): string[];
    /** overlay 激活时的回调 */
    onActivate?(): void;
    /** overlay 失活时的回调 */
    onDeactivate?(): void;
}
/** OverlayEngine 构造参数。 */
export interface OverlayEngineOptions {
    stdout: WriteStream;
    /** 当前终端尺寸获取函数（每次渲染时调用） */
    getSize: () => {
        cols: number;
        rows: number;
    };
    /** 进入 alt screen（overlay 激活）时触发——调用方据此暂停主屏污染检测。 */
    onEnterAltScreen?: () => void;
    /** 退出 alt screen（overlay 关闭）时触发——调用方据此恢复主屏污染检测。 */
    onExitAltScreen?: () => void;
}
/**
 * 全屏覆盖层引擎：管理 alternate screen buffer 的进出与 overlay 渲染调度
 * （固定网格行级 diff + CSI 2026 原子刷新）。退出后主屏 scrollback 完整无损。
 */
export declare class OverlayEngine {
    private stdout;
    private getSize;
    private onEnterAltScreen?;
    private onExitAltScreen?;
    private active;
    private renderers;
    private inAltScreen;
    /** 上一帧屏上每行内容（权威缓存），用于行级 diff。空 = 需全量重绘。 */
    private lastFrame;
    private lastCols;
    private lastRows;
    constructor(options: OverlayEngineOptions);
    /**
     * 注册一个 overlay 渲染器。
     * 通常在模块初始化时调用。
     * @param id - overlay 标识（同名注册覆盖旧渲染器）
     * @param renderer - 该 overlay 的渲染器
     */
    register(id: OverlayId, renderer: OverlayRenderer): void;
    /**
     * 取消注册；若该 overlay 正活跃，先停用（退出 alt screen）。
     * @param id - 要移除的 overlay 标识
     */
    unregister(id: OverlayId): void;
    /**
     * 激活指定 overlay。
     * - 如果已有活跃 overlay，先停用旧的再激活新的（切换不退出 alt screen）。
     * - 自动进入 alternate screen buffer。
     * @param id - 要激活的 overlay 标识
     * @returns 激活成功为 true；id 未注册时为 false（不改变当前状态）
     */
    activate(id: OverlayId): boolean;
    /** 停用当前活跃的 overlay，恢复主屏。 */
    deactivate(): void;
    /** 重新渲染当前 overlay（如 resize 后）。 */
    rerender(): void;
    /**
     * 当前是否在 overlay 中。
     * @returns 有活跃 overlay 时为 true
     */
    isActive(): boolean;
    /**
     * 当前活跃的 overlay ID。
     * @returns 活跃 overlay 标识；无活跃 overlay 时为 null
     */
    activeId(): OverlayId | null;
    private enterAltScreen;
    private exitAltScreen;
    private deactivateInternal;
    private resetFrameCache;
    private render;
}
