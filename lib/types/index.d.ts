/**
 * @huiliyi37/dsh-tianshu-tui — interactive terminal UI profile bundle. The bundle
 * patch rides over dsh-base and inserts this runner under the stable
 * `tui-runner` id. Render core: the terminal rendering engine ported from
 * `.rivet/tui-source/tui/` (Apache-2.0 source; see SOURCE-MAP.md for the
 * per-file mapping). The engine is pure presentation — all agent state arrives
 * via {@link TuiPort}.
 *
 * @module @huiliyi37/dsh-tianshu-tui
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ReadStream, WriteStream } from 'node:tty';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { KeyName } from './engine/input-handler.ts';
/** Stable Cordis plugin name the bundle patch inserts. */
export declare const name = "tui-runner";
/** 装配选项：流与起始会话可注入（测试替身），缺省走 process 全局流。 */
export interface TuiRunnerConfig {
    /** 键盘输入流；缺省 process.stdin。 */
    stdin?: ReadStream;
    /** 渲染输出流；缺省 process.stdout。 */
    stdout?: WriteStream;
    /** 启动即切入的会话 id；缺省新建会话。 */
    initialSessionId?: SessionId;
    /** 外部编辑器触发键（Phase 6.4）；缺省 ctrl_e（ctrl+o 已恢复为推理展开）。 */
    editorKey?: KeyName;
    /** 是否启用 Vim 键位（Phase 6.5）；缺省 false。 */
    vimEnabled?: boolean;
    /** 主控模型的识图能力与视觉桥状态（图片附件气泡提示数据源）。 */
    vision?: {
        /** 主控模型是否原生支持识图（图片直发）。 */
        supportsVision?: boolean;
        /** 是否配置了独立识图桥模型（主控不识图时经桥转文字描述）。
         *  未传入时按宿主 `visionBridge` 服务（dsh-vision-bridge 装配时应 provide）
         *  的存在性自动探测。 */
        bridgeEnabled?: boolean;
        /** 识图桥来源（configured=显式配置 / auto=自动选用）。 */
        bridgeSource?: 'configured' | 'auto' | 'none';
    };
    /** 已结算 workflow run 缓存条数上限（/workflow 面板历史），超限 drop-oldest；正整数，缺省 50。 */
    workflowHistoryLimit?: number;
    /** LSP 诊断桥（本地语言服务）：懒启动——agent 触碰文件时拉取该文件诊断。
     *  诊断只进 TUI 本地展示缓存（工具卡徽标 + /lsp 面板），不写会话事件、
     *  不注册任何模型面。缺省启用。 */
    lsp?: {
        /** 是否启用诊断拉取；缺省 true。 */
        enabled?: boolean;
        /** 单次诊断拉取超时（毫秒）；缺省 2000。 */
        timeoutMs?: number;
    };
    /** 启动自更新落盘后自动重启生效（缺省 true；false 时仅提示后手动 /restart）。 */
    autoRestartOnUpdate?: boolean;
}
/**
 * Mount the terminal UI runner.
 * @param ctx - plugin context; the render core wires its services here.
 * @param config - stream injection and starting session (defaults to process).
 */
export declare function apply(ctx: Context, config?: TuiRunnerConfig): void;
export * from './engine/ansi.js';
export * from './engine/write-batcher.js';
export * from './engine/resize-handler.js';
export * from './engine/overlay-engine.js';
export * from './engine/commit-engine.js';
export * from './engine/input-handler.js';
export * from './engine/input-line.js';
export * from './engine/input-controller.js';
export * from './commands/registry.js';
export * from './engine/live-engine.js';
export * from './engine/perf-monitor.js';
export * from './engine/image-tool.js';
export * from './engine/image-attach.js';
export * from './engine/term-image.js';
export * from './engine/stream-renderer.js';
export * from './term-caps.js';
export * from './theme-palettes.js';
export * from './theme.js';
export * from './theme-detect.js';
export * from './theme-custom.js';
export * from './box-chars.js';
export * from './braille-spinner.js';
export * from './width.js';
export * from './stream-window.js';
export * from './block-stream-writer.js';
export * from './scrollback-transcript.js';
export * from './truncation-marker.js';
export * from './statusline.js';
export * from './gutter.js';
export * from './ring-buffer.js';
export * from './live-tail-cap.js';
export * from './ui-glyphs.js';
export * from './port.js';
