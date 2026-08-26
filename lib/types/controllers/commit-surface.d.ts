/**
 * CommitSurface — 滚动区提交写入域（C4 第二波，自 ui/app.ts 抽出）。
 *
 * 职责：所有进 scrollback 的写入编舞——
 * - 原子提交（输入框闪烁根修，34a3e07）：BEGIN_SYNC 包裹「清 live 区 → 写
 *   scrollback → 同步重绘」，END_SYNC 收口；窗内 LiveEngine.render 自带的
 *   嵌套 begin 按 CSI 2026 语义忽略、其 end 释放点恰是完整新帧写完之时。
 * - overlay 激活（alt screen）期的暂存队列：条目与图片序列同队保序，退出后
 *   按同一协议补写主屏。
 * - 用户气泡：正文 + 📎 附件行 + 识图能力三态提示；图形协议终端异步 prepare
 *   终端图片并按同一写窗口协议追加，无协议终端降级半块字符预览。
 *
 * 不拥有：LiveEngine/CommitEngine 生命周期（构造注入）、渲染调度（经
 * {@link CommitSurfaceDeps.flushRender} 穿透 WriteBatcher.flushNow）、overlay
 * 本体（经 {@link CommitSurfaceDeps.isOverlayActive} 判定）、vision 配置态
 * （经 {@link CommitSurfaceDeps.vision} 读取——app 侧 resolveVisionBridge 会
 * 原地改写桥状态，必须每次回调取新值）。
 *
 * @module @huiliyi37/dsh-tianshu-tui/controllers/commit-surface
 */
import type { WriteStream } from 'node:tty';
import type { CommitEngine } from '../engine/commit-engine.js';
import type { LiveEngine } from '../engine/live-engine.js';
import type { RivetTheme } from '../theme.js';
/** 识图能力三态快照（app 侧 vision 状态的只读视图）。 */
export interface CommitVisionState {
    supportsVision: boolean;
    bridgeEnabled: boolean;
    bridgeSource: 'configured' | 'auto' | 'none' | undefined;
}
/** CommitSurface 构造依赖。 */
export interface CommitSurfaceDeps {
    live: LiveEngine;
    commit: CommitEngine;
    stdout: WriteStream;
    /** overlay（命令面板/pager 等 alt-screen 面）是否激活——激活期写入只入队。 */
    isOverlayActive: () => boolean;
    /** 原子编舞内的同步重绘（WriteBatcher.flushNow 语义）。 */
    flushRender: () => void;
    getTheme: () => RivetTheme;
    /** 半块预览合成底色（app 侧读主题 userMsgBg，缺省中性暗色）。 */
    previewBackground: () => {
        r: number;
        g: number;
        b: number;
    };
    vision: () => CommitVisionState;
}
/**
 * 滚动区提交写入域。方法名对齐语义：text 文本条目、raw 原始序列、
 * userPrompt 用户气泡（含图片链路）、flushDeferred 补写暂存。
 */
export declare class CommitSurface {
    private readonly live;
    private readonly commit;
    private readonly stdout;
    private readonly deps;
    private deferred;
    constructor(deps: CommitSurfaceDeps);
    /**
     * 原子提交编舞（输入框闪烁根修，2026-08-27）：BEGIN_SYNC 包裹
     * 「清 live 区 → 写 scrollback → 同步重绘」，END_SYNC 收口。
     *
     * 旧序里 clearForCommit 同步直写擦掉整个 live 区（含待办卡/输入轨/footer），
     * 重绘却交给 WriteBatcher 的 16ms 尾沿——每个段落/思考块落底后屏幕上真实缺席
     * 一帧 chrome，推理期段边界密集即呈现为「输入框消失几帧又出现」。三步收敛进
     * 同一轮事件循环后间隙只剩写入耗时；再包 CSI 2026 同步窗把它对终端合成器也
     * 隐藏。窗内 LiveEngine.render 自带的嵌套 begin 按 CSI 2026 语义忽略、其 end
     * 的释放点恰是整幅新帧写完之时，擦除中间态不再有任何显示窗口。
     */
    private atomic;
    /** 文本条目写入。overlay 激活时只入队，退出 alt screen 后按同一协议补写。 */
    text(entry: {
        text: string;
        trailingNewline?: boolean;
    }): void;
    /** 原始 ANSI 序列写入（终端图片图形序列等）。overlay 语义同 {@link text}。 */
    raw(seq: string): void;
    /** overlay 退出后把暂存条目按 mid-stream 协议写入主屏 scrollback。 */
    flushDeferred(): void;
    /**
     * 用户气泡提交：正文 + 图片附件行 + 识图能力提示（vision 三态文案）。
     * 有图且终端支持图形协议时，图片在气泡提交后异步 prepare（本地转码，
     * 毫秒级，先于任何网络往返的 assistant 输出）并以同一写窗口协议追加
     * 图形序列——物理上图片位于所属气泡下方、先于后续流式输出；prepare
     * 失败静默降级为纯文本气泡。
     * @param content - 用户消息正文（已 mention 展开）
     * @param images - 图片 data URL 列表（已 normalize；可省略）
     */
    userPrompt(content: string, images?: string[]): void;
    /**
     * 无图形协议终端的气泡图片回退：半块字符预览写进 scrollback（与图形路径
     * 同编舞——先清 live 区再 writeRaw，写完立即重绘）。解码失败返回 null 已在
     * 渲染器内吞并，此处无需再兜——静默降级为纯文本气泡（📎 行已随正文写入）。
     * @param images - 图片 data URL 列表（与气泡一致，封顶 MAX_IMAGES）
     */
    private halfBlockImages;
    /** 用户气泡正文（含 📎 附件行与识图能力提示）。 */
    private userBubbleLines;
}
