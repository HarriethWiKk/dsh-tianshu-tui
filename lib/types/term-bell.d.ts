/**
 * term-bell — 完成事件的终端 BEL 通道（纯展示侧，失败静默）。
 *
 * BEL（\x07）写入 pty 后由本地终端模拟器响铃/闪屏，是 SSH 会话下唯一
 * 可达的完成提醒——因此不抑制 SSH_*（与 os-notify 的关键差异）。
 * 共享 os-notify 的用户偏好与 SKIP / VITEST / CI 门闸。
 *
 * @module @huiliyi37/dsh-tianshu-tui/term-bell
 */
import { SKIP_NOTIFY_ENV } from './os-notify.js';
/** 与 os-notify 共用的总开关环境变量名（re-export 供调用方/测试使用）。 */
export { SKIP_NOTIFY_ENV };
/** 终端响铃字符（BEL）。 */
export declare const BELL = "\u0007";
/** 最小可写流（TuiApp 注入的 stdout / 测试替身均可）。 */
export interface BellStream {
    write: (s: string) => unknown;
}
export interface BellPrefs {
    /** 与系统通知共用的开关；`false` 时 bell 一并静默。 */
    notifyOs?: boolean;
}
/**
 * 是否允许响铃。
 * 关闭条件：用户偏好关、DSH_TUI_SKIP_NOTIFY、VITEST、CI。
 * SSH 不在此列——BEL 穿透 pty 到本地终端，远程会话反而最需要它。
 */
export declare function shouldBell(env: NodeJS.ProcessEnv, prefs?: BellPrefs): boolean;
/**
 * 门闸放行时向流写 BEL。写失败静默吞掉，永不抛。
 */
export declare function writeBell(out: BellStream, env: NodeJS.ProcessEnv, prefs?: BellPrefs): boolean;
