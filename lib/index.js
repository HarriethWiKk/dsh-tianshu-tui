import { randomUUID } from "node:crypto";
import { execFile, execSync, spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve, sep } from "node:path";
import { SessionId } from "@deepseek-ai/dsh-session";
import { installModelSelection } from "@deepseek-ai/dsh-agent";
import chalk from "chalk";
import stringWidth from "string-width";
import { eastAsianWidthType } from "get-east-asian-width";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { promisify } from "node:util";
import { homedir, tmpdir } from "node:os";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { structuredPatch } from "diff";
import { mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { UserQuestionError } from "@deepseek-ai/dsh-user-questions";
//#region lib/types/engine/ansi.js
/**
* T9 ANSI 转义序列工具库。
*
* 提供两个层次的 API：
* 1. 原始转义序列常量 — 直接拼接到输出字符串中
* 2. 类型安全的构建器函数 — 防止参数注入
*
* 参照：ECMA-48 / ISO 6429 标准，VT100/VT220 兼容。
*/
/** ANSI 转义序列原始常量。直接用模板字面量拼接到输出字符串。 */
const ANSI = {
	/** 保存当前光标位置 */
	SAVE_CURSOR: "\x1B[s",
	/** 恢复之前保存的光标位置 */
	RESTORE_CURSOR: "\x1B[u",
	/** 从光标处擦除到行尾 (Erase to End of Line) */
	ERASE_LINE_END: "\x1B[0K",
	/** 擦除整行 (Erase Entire Line) */
	ERASE_LINE: "\x1B[2K",
	/** 从光标处擦除到屏幕末尾 (Erase to End of Screen) */
	ERASE_SCREEN_END: "\x1B[0J",
	/** 擦除整个屏幕 (Erase Entire Screen) */
	ERASE_SCREEN: "\x1B[2J",
	/** 进入 alternate screen buffer（全屏 overlay 用） */
	ALT_SCREEN_ON: "\x1B[?1049h",
	/** 退出 alternate screen buffer，恢复主屏 */
	ALT_SCREEN_OFF: "\x1B[?1049l",
	/**
	* 开始同步输出（CSI 2026 / DECSET 2026）。
	* 终端会缓冲后续输出，直到 END_SYNC 才一次性原子刷新 → 防止增量重绘撕裂/闪烁。
	* 不支持的终端会静默忽略此私有模式（无副作用）。
	*/
	BEGIN_SYNC: "\x1B[?2026h",
	/** 结束同步输出，原子刷新本帧。 */
	END_SYNC: "\x1B[?2026l",
	/** 启用 bracketed paste（DECSET 2004：粘贴文本被 200~/201~ 包裹，
	不触发按键） */
	BRACKETED_PASTE_ON: "\x1B[?2004h",
	/** 关闭 bracketed paste（退出时恢复终端默认） */
	BRACKETED_PASTE_OFF: "\x1B[?2004l",
	/** 隐藏光标 */
	HIDE_CURSOR: "\x1B[?25l",
	/** 显示光标 */
	SHOW_CURSOR: "\x1B[?25h",
	/** 重置所有 SGR 属性 */
	RESET: "\x1B[0m",
	/** 粗体 */
	BOLD: "\x1B[1m",
	/** 细体/暗色 */
	DIM: "\x1B[2m",
	/** 斜体 */
	ITALIC: "\x1B[3m",
	/** 下划线 */
	UNDERLINE: "\x1B[4m",
	/** 闪烁（慢） */
	BLINK: "\x1B[5m",
	/** 反色 */
	REVERSE: "\x1B[7m",
	/** 删除线 */
	STRIKETHROUGH: "\x1B[9m"
};
/**
* 将光标向上移动 n 行。
* @param n - 移动行数；非正/非整数值被钳到 ≥1 的整数
* @returns CUU 转义序列
*/
function cursorUp(n) {
	return `\x1B[${Math.max(1, Math.floor(n))}A`;
}
/**
* 将光标向下移动 n 行。
* @param n - 移动行数；非正/非整数值被钳到 ≥1 的整数
* @returns CUD 转义序列
*/
function cursorDown(n) {
	return `\x1B[${Math.max(1, Math.floor(n))}B`;
}
/**
* 将光标向右移动 n 列。
* @param n - 移动列数；非正/非整数值被钳到 ≥1 的整数
* @returns CUF 转义序列
*/
function cursorForward(n) {
	return `\x1B[${Math.max(1, Math.floor(n))}C`;
}
/**
* 将光标向左移动 n 列。
* @param n - 移动列数；非正/非整数值被钳到 ≥1 的整数
* @returns CUB 转义序列
*/
function cursorBack(n) {
	return `\x1B[${Math.max(1, Math.floor(n))}D`;
}
/**
* 移动光标到绝对位置 (row, col)。1-based。
* @param row - 目标行（1-based）；非正/非整数值被钳到 ≥1 的整数
* @param col - 目标列（1-based）；非正/非整数值被钳到 ≥1 的整数
* @returns CUP 转义序列
*/
function cursorTo(row, col) {
	return `\x1B[${Math.max(1, Math.floor(row))};${Math.max(1, Math.floor(col))}H`;
}
/**
* 移动光标到第 col 列（保持当前行）。1-based。
* @param col - 目标列（1-based）；非正/非整数值被钳到 ≥1 的整数
* @returns CHA 转义序列
*/
function cursorToCol(col) {
	return `\x1B[${Math.max(1, Math.floor(col))}G`;
}
/**
* hex 颜色字符串 → RGB 元组。
* 支持 `#rgb`、`#rrggbb` 格式。无法解析时（含 chalk 命名色）返回 null——
* 调用方以此区分 truecolor 轨主题 token 与 16 色轨命名色（shimmer 降级判定）。
* @param hex - hex 颜色字符串（`#rgb` / `#rrggbb`）。
* @returns `[r, g, b]`（0-255）；无法解析时 null。
*/
function hexToRgb(hex) {
	const match = hex.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
	if (!match) return null;
	const h = match[1];
	/* v8 ignore next -- 正则 ^#(...)$ 匹配成功时捕获组必存在；noUncheckedIndexedAccess 收窄防御 */
	if (h === void 0) return null;
	if (h.length === 3) {
		/* v8 ignore next -- h.length === 3 时下标 0/1/2 恒存在；noUncheckedIndexedAccess 收窄防御 */
		const r = h[0] ?? "", g = h[1] ?? "", b = h[2] ?? "";
		return [
			parseInt(r + r, 16),
			parseInt(g + g, 16),
			parseInt(b + b, 16)
		];
	}
	return [
		parseInt(h.slice(0, 2), 16),
		parseInt(h.slice(2, 4), 16),
		parseInt(h.slice(4, 6), 16)
	];
}
/**
* chalk 命名色 → 基础 16 色 SGR 前景码。
* fallback 主题轨（theme-palettes.ts）用命名色表达 16 色语义；此前 fg() 只认
* hex，命名色被静默丢弃成无色 —— 现在映射为标准 30-37/90-97。
*/
const NAMED_FG_CODES = {
	black: 30,
	red: 31,
	green: 32,
	yellow: 33,
	blue: 34,
	magenta: 35,
	cyan: 36,
	white: 37,
	gray: 90,
	grey: 90,
	blackBright: 90,
	redBright: 91,
	greenBright: 92,
	yellowBright: 93,
	blueBright: 94,
	magentaBright: 95,
	cyanBright: 96,
	whiteBright: 97
};
/**
* RGB → xterm-256 最近邻索引（256 色中间档量化）。
* 候选双轨取最优：6×6×6 色立方（16-231，分量档 0/95/135/175/215/255）
* 与 24 级灰阶（232-255，8+10i）。距离用 RGB 欧氏平方（对量化到 256 档足够）。
* @param r - 红色分量（0-255）
* @param g - 绿色分量（0-255）
* @param b - 蓝色分量（0-255）
* @returns xterm-256 调色板索引（16-255）
*/
function rgbToXterm256(r, g, b) {
	const toCubeIdx = (v) => {
		if (v < 48) return 0;
		if (v < 115) return 1;
		return Math.min(5, Math.floor((v - 35) / 40));
	};
	const CUBE = [
		0,
		95,
		135,
		175,
		215,
		255
	];
	const ci = toCubeIdx(r), gi = toCubeIdx(g), bi = toCubeIdx(b);
	/* v8 ignore next -- toCubeIdx 返回 0..5 恒在 CUBE（长 6）界内；noUncheckedIndexedAccess 收窄防御 */
	const cr = CUBE[ci] ?? 0, cg = CUBE[gi] ?? 0, cb = CUBE[bi] ?? 0;
	const cubeDist = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2;
	const gray = Math.round((r + g + b) / 3);
	const gi24 = Math.max(0, Math.min(23, Math.round((gray - 8) / 10)));
	const gv = 8 + 10 * gi24;
	return (gv - r) ** 2 + (gv - g) ** 2 + (gv - b) ** 2 < cubeDist ? 232 + gi24 : 16 + 36 * ci + 6 * gi + bi;
}
/** 当前是否应量化到 256 色（chalk 检测到 256 色但非 truecolor 终端）。 */
function use256() {
	return chalk.level === 2;
}
/**
* 设置前景色。接受 hex（`#a8e6cf`）或 chalk 命名色（`cyan`/`redBright`）。
* hex 在 truecolor 终端发 38;2，在 256 色终端（chalk.level === 2）量化为 38;5；
* 命名色发基础 16 色码。无法解析时返回 ''（无着色）。
* @param colorValue - hex 颜色字符串或 chalk 命名色
* @returns SGR 前景色序列；无法解析时为空字符串
*/
function fg(colorValue) {
	const rgb = hexToRgb(colorValue);
	if (!rgb) {
		const code = NAMED_FG_CODES[colorValue];
		return code === void 0 ? "" : `\x1B[${code}m`;
	}
	if (use256()) return `\x1B[38;5;${rgbToXterm256(rgb[0], rgb[1], rgb[2])}m`;
	return `\x1B[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
}
/**
* 设置背景色。接受 hex 或 chalk 命名色（命名色码 +10 为背景码）。
* 降级规则同 fg()。
* @param colorValue - hex 颜色字符串或 chalk 命名色
* @returns SGR 背景色序列；无法解析时为空字符串
*/
function bg(colorValue) {
	const rgb = hexToRgb(colorValue);
	if (!rgb) {
		const code = NAMED_FG_CODES[colorValue];
		return code === void 0 ? "" : `\x1B[${code + 10}m`;
	}
	if (use256()) return `\x1B[48;5;${rgbToXterm256(rgb[0], rgb[1], rgb[2])}m`;
	return `\x1B[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
}
/**
* 用 ANSI 前景色 + 可选 SGR 属性包裹文本。
* 始终以 ANSI.RESET 结尾，防止颜色泄露。
* @param text - 要着色的文本
* @param fgHex - 前景色（hex 或 chalk 命名色，同 fg()）
* @param opts - 可选 SGR 属性（bold/dim/italic/underline）
* @returns 着色后的字符串（末尾带 RESET）
*/
function color(text, fgHex, opts) {
	let prefix = fg(fgHex);
	if (opts?.bold) prefix += ANSI.BOLD;
	if (opts?.dim) prefix += ANSI.DIM;
	if (opts?.italic) prefix += ANSI.ITALIC;
	if (opts?.underline) prefix += ANSI.UNDERLINE;
	return `${prefix}${text}${ANSI.RESET}`;
}
/**
* OSC 52 写系统剪贴板（终端支持时；不支持者无害忽略——内部剪贴板 Alt+Y 兜底）。
* 剪贴选区/复制后由 app 在渲染循环 drain 写出。
* @param text - 要写入剪贴板的文本（内部 base64 编码，控制字符无注入风险）
* @returns OSC 52 转义序列
*/
function osc52Clipboard(text) {
	return `\x1B]52;c;${Buffer.from(text, "utf8").toString("base64")}\x07`;
}
let hyperlinkOverride = null;
/**
* 测试/配置钩子：强制开/关超链接（null 恢复自动检测）。
* @param value - true 强制开、false 强制关、null 恢复自动检测
*/
function setHyperlinksEnabled(value) {
	hyperlinkOverride = value;
}
/**
* OSC 8 支持启发式检测。终端无标准能力查询协议，按主流终端约定判断：
* - 环境开关优先：`RIVET_HYPERLINKS=0/1`、`FORCE_HYPERLINK`
* - 已知支持的 TERM_PROGRAM：iTerm2 / WezTerm / VS Code / Hyper / ghostty / Tabby
* - kitty（TERM 前缀）、VTE ≥ 0.50（GNOME Terminal 系）、Windows Terminal（WT_SESSION）
* - tmux/screen 与 dumb 终端保守降级（tmux 需 passthrough 配置，默认关闭）
* @param env - 参与检测的环境变量集合（默认 process.env，可注入用于测试）
* @returns 终端是否支持 OSC 8 超链接
*/
function detectHyperlinkSupport(env = process.env) {
	if (env.RIVET_HYPERLINKS === "0") return false;
	if (env.RIVET_HYPERLINKS === "1" || env.FORCE_HYPERLINK) return true;
	const term = env.TERM ?? "";
	if (term === "dumb" || !process.stdout.isTTY) return false;
	if (env.TMUX || term.startsWith("screen")) return false;
	const program = env.TERM_PROGRAM ?? "";
	if ([
		"iTerm.app",
		"WezTerm",
		"vscode",
		"Hyper",
		"ghostty",
		"Tabby"
	].includes(program)) return true;
	if (term.startsWith("xterm-kitty")) return true;
	if (env.WT_SESSION) return true;
	const vte = Number.parseInt(env.VTE_VERSION ?? "", 10);
	if (Number.isFinite(vte) && vte >= 5e3) return true;
	return false;
}
let detectedSupport = null;
function hyperlinksSupported() {
	if (hyperlinkOverride !== null) return hyperlinkOverride;
	if (detectedSupport === null) detectedSupport = detectHyperlinkSupport();
	return detectedSupport;
}
/**
* 把文本包装为 OSC 8 可点击超链接；不支持的终端返回纯文本（零污染降级）。
* url 中的控制字符会被剥离（OSC 序列注入防护）。
* @param text - 链接显示文本
* @param url - 链接目标；控制字符剥离后为空时返回纯文本
* @returns OSC 8 序列包裹的文本，或降级后的纯文本
*/
function hyperlink(text, url) {
	if (!hyperlinksSupported()) return text;
	const safeUrl = url.replace(/[\x00-\x1F\x7F]/g, "");
	if (!safeUrl) return text;
	return `\x1B]8;;${safeUrl}\x07${text}\x1B]8;;\x07`;
}
/**
* 文件路径 → file:// 超链接（相对路径基于 cwd 归一为绝对路径）。
* @param text - 链接显示文本
* @param filePath - 文件路径（绝对或相对）
* @param cwd - 相对路径的基准目录（默认 process.cwd()）
* @returns OSC 8 file:// 超链接，或降级后的纯文本
*/
function fileLink(text, filePath, cwd = process.cwd()) {
	return hyperlink(text, `file://${filePath.startsWith("/") ? filePath : `${cwd}/${filePath}`}`);
}
let imageProtocolOverride = null;
/**
* 测试/配置钩子：强制指定图片协议（null 恢复自动检测）。
* @param value - 强制使用的协议；null 恢复自动检测
*/
function setImageProtocol(value) {
	imageProtocolOverride = value;
}
/**
* 内联图片协议启发式检测，与 detectHyperlinkSupport 同构：
* - 环境开关优先：`RIVET_IMAGES=0/off` 关闭，`kitty`/`iterm2` 强制指定
* - kitty 协议：kitty（TERM 前缀）、ghostty、WezTerm、Warp、Konsole
* - iTerm2 协议：iTerm.app
* - tmux/screen 与 dumb 终端保守降级（图形序列需 passthrough，默认关闭）
* @param env - 参与检测的环境变量集合（默认 process.env，可注入用于测试）
* @param isTTY - stdout 是否为 TTY（缺省取 process.stdout.isTTY）
* @returns 检测到的图片协议；不支持时为 'none'
*/
function detectImageProtocol(env = process.env, isTTY = process.stdout.isTTY) {
	const override = env.RIVET_IMAGES?.toLowerCase();
	if (override === "0" || override === "off" || override === "none") return "none";
	if (override === "kitty" || override === "iterm2") return override;
	const term = env.TERM ?? "";
	if (term === "dumb" || !isTTY) return "none";
	if (env.TMUX || term.startsWith("screen")) return "none";
	const program = env.TERM_PROGRAM ?? "";
	if (program === "iTerm.app") return "iterm2";
	if (term.startsWith("xterm-kitty")) return "kitty";
	if ([
		"ghostty",
		"WezTerm",
		"WarpTerminal",
		"konsole"
	].includes(program)) return "kitty";
	if (env.KONSOLE_VERSION) return "kitty";
	return "none";
}
let detectedImageProtocol = null;
/**
* 当前生效的图片协议（带缓存 + override 钩子）。
* @returns override 优先，否则首次调用时检测并缓存的协议
*/
function imageProtocol() {
	if (imageProtocolOverride !== null) return imageProtocolOverride;
	if (detectedImageProtocol === null) detectedImageProtocol = detectImageProtocol();
	return detectedImageProtocol;
}
/** 查询光标位置。终端会通过 stdin 返回 `\x1B[row;colR`。 */
const QUERY_CURSOR_POS = "\x1B[6n";
/** 查询终端尺寸（备用方案）。某些终端不支持 stdout.columns。 */
const QUERY_TERMINAL_SIZE = "\x1B[18t";
//#endregion
//#region lib/types/ring-buffer.js
/**
* 创建定容环形缓冲。
* @param cap - 容量上限（满后覆盖最旧项）。
* @returns 新的 RingBuffer 实例。
*/
function createRingBuffer(cap) {
	const buf = new Array(cap);
	let head = 0;
	let count = 0;
	return {
		push(item) {
			buf[(head + count) % cap] = item;
			if (count < cap) count++;
			else head = (head + 1) % cap;
		},
		items() {
			const result = [];
			for (let i = 0; i < count; i++) {
				const item = buf[(head + i) % cap];
				/* v8 ignore next -- count 内的槽位必被 push 填过，恒非 undefined；noUncheckedIndexedAccess 收窄防御 */
				if (item !== void 0) result.push(item);
			}
			return result;
		},
		clear() {
			head = 0;
			count = 0;
		},
		drain(n) {
			const drained = Math.min(n, count);
			const result = [];
			for (let i = 0; i < drained; i++) {
				const item = buf[(head + i) % cap];
				/* v8 ignore next -- drain 只取 count 内的槽位，必被 push 填过；noUncheckedIndexedAccess 收窄防御 */
				if (item !== void 0) result.push(item);
			}
			head = (head + drained) % cap;
			count -= drained;
			return result;
		},
		get size() {
			return count;
		}
	};
}
//#endregion
//#region lib/types/engine/commit-engine.js
/**
* T9 CommitEngine — 将已确定的格式化内容写入终端 scrollback。
*
* 核心原则：
* - 只做 append-only `stdout.write()`，不跟踪已写入内容的位置。
* - 进入 scrollback 的内容不可被擦除、不可被重绘。
* - 替代 Ink 的 `<Static>` 组件语义，但无需 high-water index 追踪。
*
* 与现有的 `committed-log.ts` 的关系：
* - `committed-log.ts` 作为数据层保留（LogEntry 存储 + dedup），
*   CommitEngine 是其消费端——将 LogEntry 格式化后写入 stdout。
* - 阶段 1 会提取格式化函数，届时 CommitEngine 调用这些函数。
*/
/** Scrollback buffer 默认行数上限（长会话防内存无限增长）。 */
const DEFAULT_SCROLLBACK_MAX_LINES = 1e3;
/**
* append-only 提交引擎：把已确定内容写入终端 scrollback，同时在内存
* RingBuffer 里保留最近 N 行供 pager overlay 读取。写入后不可擦除、不可重绘。
*/
var CommitEngine = class {
	stdout;
	flush;
	/**
	* Scrollback buffer: 累积所有已提交文本，供 pager overlay 读取。
	* 使用 RingBuffer 封顶——长会话下无界 string[] 会持续增长，
	* 超过上限后最旧条目被自动丢弃（保留最近的，匹配 pager 实际可见范围）。
	*/
	buffer;
	constructor(options) {
		this.stdout = options.stdout;
		this.flush = options.flush ?? false;
		const cap = options.scrollbackMaxLines ?? DEFAULT_SCROLLBACK_MAX_LINES;
		this.buffer = createRingBuffer(Math.max(1, cap));
	}
	/**
	* 返回 scrollback 完整文本（各条目以换行符连接，封顶后只含最近 N 条）。
	* @returns 换行符连接的 scrollback 文本
	*/
	getContent() {
		return this.buffer.items().join("\n");
	}
	/**
	* 将一条已提交条目写入终端 scrollback。
	*
	* 写入策略：完整的 ANSI 行 + 换行符。终端驱动负责将已显示内容
	* 推入 scrollback buffer。
	*
	* 即使 live region 在底部显示，此写入也发生在 live region 的
	* 重绘区域之前（cursor save 之前），因此天然按时间顺序排列。
	* @param entry - 待写入条目（ansi 优先于 text；自动补齐末尾换行）
	*/
	write(entry) {
		let content = entry.ansi ?? entry.text;
		if (!content.endsWith("\n")) content += "\n";
		if (entry.trailingNewline) content += "\n";
		this.buffer.push(content.trimEnd());
		this.stdout.write(content);
	}
	/**
	* 批量写入多条已提交条目。
	* 在同一帧中连续写入，减少系统调用次数。
	* @param entries - 按顺序写入的条目列表
	*/
	writeBatch(entries) {
		let buf = "";
		for (const entry of entries) {
			const content = entry.ansi ?? entry.text;
			const line = content + (content.endsWith("\n") ? "" : "\n") + (entry.trailingNewline ? "\n" : "");
			this.buffer.push(line.trimEnd());
			buf += line;
		}
		this.stdout.write(buf);
	}
	/**
	* 写入原始 ANSI 字符串（不追加换行）。
	* 用于需要精确控制格式的场景（如分隔线、缩进）。
	* 注意：不进入 scrollback buffer，pager 读不到此内容。
	* @param ansi - 原样写入 stdout 的字符串
	*/
	writeRaw(ansi) {
		this.stdout.write(ansi);
	}
	/**
	* 清空 scrollback buffer（/clear 命令）。已写入终端的行无法被擦除——
	* 重置只影响后续 getContent()/pager 读取与后续写入位置，视觉上由调用方
	* 补一条分隔线收尾。
	*/
	reset() {
		this.buffer.clear();
	}
	/**
	* 写入一条水平分隔线。
	* 宽度 = 终端列数 或 指定宽度。
	* @param width - 分隔线宽度（列数）；缺省取 stdout.columns
	*/
	writeSeparator(width) {
		const w = width ?? this.stdout.columns;
		this.stdout.write(`${ANSI.DIM}${"─".repeat(w)}${ANSI.RESET}\n`);
	}
	/**
	* 确保输出已刷新到终端。
	*/
	drain() {
		if (this.flush) {}
	}
};
//#endregion
//#region lib/types/term-caps.js
/**
* 终端能力探测 — Windows legacy conhost（经典控制台）识别与降级开关。
*
* 背景：PowerShell/cmd 直启的经典 conhost（非 Windows Terminal）配中文点阵
* 字体时，East-Asian Ambiguous 字符与 GBK 框线字符均按 2 列渲染，且大量
* Unicode 字形（✶ ◐ ╭ ❯…）缺失显示为 tofu。LiveEngine 的相对光标回顶依赖
* 逐行宽度估算，估算与实际渲染错位 → 回顶欠擦 → 旧帧逐帧堆叠进 scrollback。
* 本模块提供判定信号，width.ts / 字形降级据此选择保守档。
*/
/**
* 是否运行在 Windows legacy conhost（经典控制台）。
* 启发式（supports-hyperlinks 等库同款）：win32 且无任何现代终端标记——
* Windows Terminal 设 WT_SESSION、VS Code 设 TERM_PROGRAM、ConEmu 设
* ConEmuANSI、mintty/Git Bash 设 TERM。全无 → 经典 conhost。
* @param env - 环境变量（测试注入用，缺省 process.env）。
* @param platform - 平台标识（测试注入用，缺省 process.platform）。
* @returns 是否为经典 conhost。
*/
function isLegacyWindowsConsole(env = process.env, platform = process.platform) {
	if (platform !== "win32") return false;
	if (env.WT_SESSION || env.TERM_PROGRAM || env.ConEmuANSI) return false;
	if (env.TERM) return false;
	return true;
}
/**
* locale 是否 CJK（zh/ja/ko 前缀）。优先 env（POSIX 约定），Intl（OS locale）兜底。
* @param env - 环境变量（测试注入用，缺省 process.env）。
* @returns 是否为 CJK locale。
*/
function isCjkLocale(env = process.env) {
	const candidates = [
		env.LC_ALL ?? "",
		env.LC_CTYPE ?? "",
		env.LANG ?? ""
	];
	if (candidates.some((l) => /^(zh|ja|ko)/i.test(l.trim()))) return true;
	if (candidates.some((l) => l.trim() !== "")) return false;
	try {
		const locale = new Intl.DateTimeFormat().resolvedOptions().locale;
		return /^(zh|ja|ko)/i.test(locale ?? "");
	} catch {}
	return false;
}
let legacyCjkCache = null;
/**
* legacy conhost 且 CJK 环境（宽度 full 档的触发条件）。进程内缓存一次。
* @returns 是否命中 legacy CJK conhost。
*/
function isLegacyCjkConsole() {
	if (legacyCjkCache === null) legacyCjkCache = isLegacyWindowsConsole() && isCjkLocale();
	return legacyCjkCache;
}
let asciiGlyphCache = null;
/**
* 是否使用 ASCII 安全字形（spinner/thinking/工具卡的月相、星形等装饰字形）。
* 原有门槛 chalk.level<3 保留；legacy conhost 无条件降级（字形缺失 + 宽度
* 不可预测，与颜色能力无关）。env `RIVET_ASCII_UI=0/1` 显式覆盖。
* @param env - 环境变量（测试注入用，缺省 process.env）。
* @returns 是否降级为 ASCII 字形。
*/
function useAsciiGlyphs(env = process.env) {
	if (env.RIVET_ASCII_UI === "1") return true;
	if (env.RIVET_ASCII_UI === "0") return false;
	if (asciiGlyphCache === null)
 /* v8 ignore next -- 测试进程非 TTY，chalk.level<3 恒短路；右侧为高色深终端专属场景 */
	asciiGlyphCache = chalk.level < 3 || isLegacyWindowsConsole();
	return asciiGlyphCache;
}
let asciiBorderCache = null;
/**
* 是否使用 ASCII 边框（输入框 chrome）。与字形开关分离：低色深终端
* （tmux/screen 的 chalk.level 2）渲染 Unicode 框线完全正常，边框降级只在
* 框线宽度不可预测的 legacy conhost 触发。env `RIVET_ASCII_UI=0/1` 显式覆盖。
* @param env - 环境变量（测试注入用，缺省 process.env）。
* @returns 是否降级为 ASCII 边框。
*/
function useAsciiBorders(env = process.env) {
	if (env.RIVET_ASCII_UI === "1") return true;
	if (env.RIVET_ASCII_UI === "0") return false;
	if (asciiBorderCache === null) asciiBorderCache = isLegacyWindowsConsole();
	return asciiBorderCache;
}
/** 测试钩子：重置探测缓存。 */
function resetTermCapsCache() {
	legacyCjkCache = null;
	asciiGlyphCache = null;
	asciiBorderCache = null;
}
//#endregion
//#region lib/types/width.js
/**
* 显示宽度度量 — 解决 string-width 的窄宽假设与终端实际渲染的错位。
*
* 背景：`string-width` 把 East-Asian **Ambiguous** 字符（如 `—` `…` `↑↓` `·`）
* 一律按 1 列计；但很多终端（尤其 CJK 环境/字体）把这些符号按 2 列渲染。
* LiveEngine 据 string-width 估算每行占几个显示行（`rowsForLine`），低估后
* 相对光标回顶量不足 → 旧帧顶部泄漏进 scrollback（输入框重影/重叠）。
*
* 关键陷阱：Unicode 把 **box-drawing / block**（U+2500–U+259F，如 `─ │ ╭ █`）
* 也归为 ambiguous，但 xterm 系终端普遍按 **1 列** 渲染它们。若把所有 ambiguous
* 当宽，会把输入框边框算成双宽 → over-erase 反噬 scrollback。因此 wide 模式只对
* **非 box/block 的 ambiguous 符号** 叠加 +1 宽度增量。
*
* 但 Windows legacy conhost（GBK 中文字体）连框线字符也按 **2 列** 渲染——
* wide 档在那里仍会低估边框行宽度 → 折行 → 回顶欠擦。为此增设 **full 档**：
* box/block 一并 +1。三档语义：
* - narrow：= string-width（默认，xterm 系）
* - wide：非 box/block 的 ambiguous +1（CJK xterm 终端）
* - full：所有 ambiguous 含 box/block +1（legacy CJK conhost，自动探测默认）
*
* 度量建立在 `string-width` 之上（继承其对 emoji/ZWJ/组合符/控制符的正确处理），
* narrow 模式与 string-width 完全一致（零回归）。
*/
const ANSI_RE$1 = /\x1B(?:\[[0-9;]*[a-zA-Z]|\][^\x07\x1B]*(?:\x07|\x1B\\))/g;
/** 黏附匹配（按位置）用于截断时识别转义序列。 */
const ANSI_STICKY = /\x1B(?:\[[0-9;]*[a-zA-Z]|\][^\x07\x1B]*(?:\x07|\x1B\\))/y;
const RESET$3 = "\x1B[0m";
const OSC8_OPEN_RE = /\x1B\]8;[^\x07\x1B]*(?:\x07|\x1B\\)/g;
/** box-drawing（U+2500–257F）与 block elements（U+2580–259F）：终端均按 1 列渲染。 */
function isBoxOrBlock(cp) {
	return cp >= 9472 && cp <= 9631;
}
/** 一个 code point 在 wide/full 模式下相对 string-width 的额外宽度（0 或 1）。 */
function ambiguousExtraForCp(cp) {
	if (isBoxOrBlock(cp)) return ambiguousWidthMode() === "full" ? 1 : 0;
	return eastAsianWidthType(cp) === "ambiguous" ? 1 : 0;
}
/** 去掉 ANSI 后逐 code point 累计的 ambiguous 额外宽度。 */
function ambiguousExtra(plain) {
	let extra = 0;
	for (const ch of plain) {
		const cp = ch.codePointAt(0);
		/* v8 ignore next -- for-of 迭代的单个字符必有值；noUncheckedIndexedAccess 收窄防御 */
		if (cp === void 0) continue;
		extra += ambiguousExtraForCp(cp);
	}
	return extra;
}
let detectedModeCache = null;
/**
* 宽度模式：env `RIVET_AMBIGUOUS_WIDTH` 显式值优先（narrow/wide/full），
* 未设时按终端探测——legacy CJK conhost（GBK 字体连框线都按 2 列渲染）
* 默认 full，其余平台默认 narrow（与历史行为一致）。
* @returns 生效的宽度档位（探测结果进程内缓存）。
*/
function ambiguousWidthMode() {
	const env = (process.env.RIVET_AMBIGUOUS_WIDTH ?? "").toLowerCase();
	if (env === "wide") return "wide";
	if (env === "full") return "full";
	if (env === "narrow") return "narrow";
	if (detectedModeCache === null) detectedModeCache = isLegacyCjkConsole() ? "full" : "narrow";
	return detectedModeCache;
}
/**
* 兼容旧布尔口径：wide 或 full 均视为启用（消费方只区分「是否加宽」）。
* @returns 是否启用 ambiguous 加宽。
*/
function ambiguousWideEnabled() {
	return ambiguousWidthMode() !== "narrow";
}
/** 测试钩子：重置探测缓存。 */
function resetWidthModeCache() {
	detectedModeCache = null;
}
/**
* 按显示宽度断行（ANSI 安全：转义序列原样保留、不计宽；不吞字符）。
* 已在预算内的整段返回单行。每行从当前字符重新累积宽度——调用方若需
* 每行带固定前缀（如说话人导轨），应把前缀宽度计入 max 或逐行拼装。
* @param text - 待断行文本（可含 ANSI）。
* @param max - 每行最大显示宽度。
* @param opts - 宽度度量选项（透传 displayWidth）。
* @returns 断行结果（不包含换行符的行数组）。
*/
function wrapToDisplayWidth(text, max, opts = {}) {
	if (max <= 0) return [];
	const wide = !!opts.ambiguousAsWide;
	const lines = [];
	let current = "";
	let w = 0;
	let i = 0;
	let sawAnsi = false;
	while (i < text.length) {
		ANSI_STICKY.lastIndex = i;
		const m = ANSI_STICKY.exec(text);
		if (m && m.index === i) {
			current += m[0];
			i += m[0].length;
			sawAnsi = true;
			continue;
		}
		const cp = text.codePointAt(i);
		/* v8 ignore next -- i 恒 < text.length，codePointAt 必有值；noUncheckedIndexedAccess 收窄防御 */
		if (cp === void 0) break;
		const ch = String.fromCodePoint(cp);
		let cw = stringWidth(ch);
		if (wide) cw += ambiguousExtraForCp(cp);
		if (w + cw > max && w > 0) {
			lines.push(sawAnsi ? `${current}\u001b[0m` : current);
			current = "";
			w = 0;
			sawAnsi = false;
			continue;
		}
		current += ch;
		w += cw;
		i += ch.length;
	}
	lines.push(current);
	return lines;
}
/**
* 文本的显示宽度（已忽略 ANSI 转义）。
* @param text - 待度量文本（可含 ANSI）。
* @param opts - 宽度度量选项。
* @returns 显示宽度（列数）。
*/
function displayWidth(text, opts = {}) {
	const plain = text.replace(ANSI_RE$1, "");
	const base = stringWidth(plain);
	if (!opts.ambiguousAsWide) return base;
	return base + ambiguousExtra(plain);
}
/**
* 按显示宽度截断（ANSI 安全：转义序列原样保留、不计宽；截断发生时补一个 RESET
* 防止颜色泄漏到后续行）。已在预算内则原样返回。
* @param text - 待截断文本（可含 ANSI）。
* @param max - 最大显示宽度（<=0 返回空串）。
* @param opts - 宽度度量选项。
* @returns 截断结果（含 ANSI 时补 RESET，OSC 8 链接被切开时先补闭合）。
*/
function truncateToDisplayWidth(text, max, opts = {}) {
	if (max <= 0) return "";
	if (displayWidth(text, opts) <= max) return text;
	const wide = !!opts.ambiguousAsWide;
	let out = "";
	let w = 0;
	let i = 0;
	let sawAnsi = false;
	while (i < text.length) {
		ANSI_STICKY.lastIndex = i;
		const m = ANSI_STICKY.exec(text);
		if (m && m.index === i) {
			out += m[0];
			i += m[0].length;
			sawAnsi = true;
			continue;
		}
		const cp = text.codePointAt(i);
		/* v8 ignore next -- i 恒 < text.length，codePointAt 必有值；noUncheckedIndexedAccess 收窄防御 */
		if (cp === void 0) break;
		const ch = String.fromCodePoint(cp);
		let cw = stringWidth(ch);
		if (wide) cw += ambiguousExtraForCp(cp);
		if (w + cw > max) break;
		out += ch;
		w += cw;
		i += ch.length;
	}
	if (!sawAnsi) return out;
	const oscSeqs = out.match(OSC8_OPEN_RE) ?? [];
	const lastOsc = oscSeqs[oscSeqs.length - 1];
	return lastOsc !== void 0 && !/^\x1B\]8;;(?:\x07|\x1B\\)$/.test(lastOsc) ? out + "\x1B]8;;\x07\x1B[0m" : out + RESET$3;
}
//#endregion
//#region lib/types/engine/live-engine.js
/**
* T9 LiveEngine — 管理终端底部动态区域（live region）的增量重绘。
*
* 核心机制：
* - 在渲染 live region 之前，用 `cursor save` 保存滚动位置。
* - 渲染时：上移到 live region 起始行 → 逐行擦除 + 重写 → 恢复光标。
* - live region 永远只占底部 N 行（通常 5-20 行），远小于终端高度。
* - streaming 内容由 BlockStreamWriter 控制，超出的部分已经 commit 到 scrollback。
*
* **Display-row awareness**: 所有行数追踪使用 visual display rows（wrapping-aware），
* 而非 logical line count。一个 200 字符的行在 80 列终端占 3 display rows。
* cursorUp / erase / lastDisplayRows 全部基于 display rows，防止 wrap 行导致
* cursor 定位偏差 → ghost 行 / 重复渲染。
*
* 与 Ink 的区别：
* - Ink 在 live region >= terminal rows 时执行 `\x1B[2J` 全屏清屏，
*   LiveEngine 永远不会触发全屏清屏——live region 被严格限制在底部。
*/
/**
* 溢出裁剪：把 `[0, chromeStart)` 的动态段（spinner / thinking / streaming
* tail / 工具卡片）限制在至多 `budget` display rows。
*
* 规则：
* - `budget <= 0`：原样返回。
* - 动态段 > budget：从**顶部**截掉最旧行（approval / 提问等关键内容位于动态段
*   尾部，天然优先保留）。
* - 动态段 ≤ budget：**不垫空行**。live overlay 高度跟内容走，避免空行盖住
*   中间的 scrollback。
*
* @param lines - live region 全部行（动态段在前，chrome 在后）
* @param chromeStart - chrome 段起始下标（`[0, chromeStart)` 为动态段）
* @param budget - 动态段最大高度（display rows）；≤0 时原样返回
* @param rowsForLine - 单行 display rows 度量（wrapping-aware）；默认每行 1 row
* @returns 裁剪后的行数组与新的 chromeStart
*/
function padDynamicRegion(lines, chromeStart, budget, rowsForLine = () => 1) {
	if (budget <= 0) return {
		lines: lines.slice(),
		chromeStart
	};
	const dynamic = lines.slice(0, chromeStart);
	const chrome = lines.slice(chromeStart);
	let rows = 0;
	for (const line of dynamic) rows += rowsForLine(line.text);
	let dropUntil = 0;
	while (rows > budget && dropUntil < dynamic.length) {
		const dropped = dynamic[dropUntil];
		if (dropped === void 0) break;
		rows -= rowsForLine(dropped.text);
		dropUntil++;
	}
	const kept = dynamic.slice(dropUntil);
	return {
		lines: [...kept, ...chrome],
		chromeStart: kept.length
	};
}
/**
* 终端底部动态区域（live region）的增量重绘引擎。
* 行数追踪全部基于 wrapping-aware display rows；渲染后光标常驻区域末行
* （cursor-resident 协议），并以 CPR 探针自愈外来写入污染。
*/
var LiveEngine = class LiveEngine {
	stdout;
	maxRows;
	/** 上一帧渲染的 display rows（wrapping-aware）。用于计算上移量。 */
	lastDisplayRows = 0;
	/** lineCache 渲染时的终端宽度。resize 检测：宽度变了说明屏上内容已被 reflow。 */
	lastColumns = 0;
	/** 是否已执行过首次渲染（用于判断是否需要 save cursor） */
	hasRendered = false;
	/** live region 行缓存：每行的原始文本（不含 ANSI）用于 diff */
	lineCache = [];
	/**
	* ambiguous 宽度模式缓存。`ambiguousWideEnabled()` 每次读 `process.env` 并做
	* 字符串比较，而一帧渲染里 rowsForLine 被调数十次（countDisplayRows / canDiff /
	* buildDiff / reconcileWidth），重复读 env 是无谓开销。该值在一次进程中基本不变，
	* 惰性读取一次后缓存即可。
	*/
	ambiguousWideCache = null;
	onProbeRequest;
	onPolluted;
	/** 最近一次确认的驻停位置（CPR 响应，1-based）。null = 未建立基线。 */
	cprBaseline = null;
	/** 已发出探针但未收到响应（带超时自愈，防终端不应答导致探针停摆）。 */
	cprProbePending = false;
	lastCprProbeMs = 0;
	/** 污染标记：下一帧 render 跳过 H2 短路/diff，走恢复重铺。 */
	polluted = false;
	/** 最近一次探针响应的光标行（恢复路径的爬升上限——绝不爬出视口顶）。 */
	cprReportRow = 1;
	parkedRowsUp = 0;
	parkedCol = null;
	/** 发 CPR 探针那一刻的驻停记账——响应按它折算区域末行，防 caret 移动误判污染。 */
	probeParked = null;
	hardwareCursorVisible = process.env.RIVET_TUI_HARDWARE_CURSOR === "1";
	/** 探针最小间隔：渲染每帧都可能触发，防探针风暴。 */
	static CPR_PROBE_MIN_INTERVAL_MS = 1e3;
	/** 探针响应超时：超过即允许重发（兼容不应答 DSR 的环境）。 */
	static CPR_PROBE_TIMEOUT_MS = 5e3;
	/** ambiguous 宽度模式（缓存 process.env 读取）。 */
	ambiguousWide() {
		if (this.ambiguousWideCache === null) this.ambiguousWideCache = ambiguousWideEnabled();
		return this.ambiguousWideCache;
	}
	constructor(options) {
		this.stdout = options.stdout;
		this.maxRows = options.maxRows ?? 20;
		if (options.onProbeRequest !== void 0) this.onProbeRequest = options.onProbeRequest;
		if (options.onPolluted !== void 0) this.onPolluted = options.onPolluted;
	}
	/**
	* 暂停 CPR 污染检测。overlay（picker/pager 等）激活期间光标在 alt screen，
	* CPR 响应的位置不代表主屏 live region，若照常比对会误判污染并触发 renderLive
	* 把主屏帧写进 alt screen（picker 残影泄漏回主会话的根因）。
	* 调用方应在 overlay 激活时 suppress，退出时 resume（并作废基线等下一帧重建）。
	*/
	probeSuppressed = false;
	/** overlay 激活：暂停探针发送与污染判定。 */
	suppressProbe() {
		this.probeSuppressed = true;
		this.cprProbePending = false;
		this.cprBaseline = null;
	}
	/** overlay 退出：恢复检测；基线作废，下一帧/探针重新建立，避免跨 alt screen 误判。 */
	resumeProbe() {
		this.probeSuppressed = false;
		this.cprBaseline = null;
	}
	/**
	* 请求发一次 CPR 探针（受节流与 pending 去重；无 onProbeRequest 时 no-op）。
	* 调用点：render 结束（帧后驻停基线）+ 空闲期定时器（检出 idle 污染）。
	* overlay 激活期间不发（见 suppressProbe）。
	*/
	requestProbe() {
		if (this.probeSuppressed) return;
		if (!this.onProbeRequest) return;
		const now = Date.now();
		if (this.cprProbePending && now - this.lastCprProbeMs < LiveEngine.CPR_PROBE_TIMEOUT_MS) return;
		if (!this.cprProbePending && now - this.lastCprProbeMs < LiveEngine.CPR_PROBE_MIN_INTERVAL_MS) return;
		this.cprProbePending = true;
		this.lastCprProbeMs = now;
		this.probeParked = {
			rowsUp: this.parkedRowsUp,
			col: this.parkedCol
		};
		this.onProbeRequest();
	}
	/**
	* 喂入一条 CPR 响应（row/col 1-based，来自 InputHandler 的 onCpr）。
	* 首个响应建立驻停基线；后续响应与基线比对——偏离说明光标被外来写入移动，
	* 标记污染并回调 onPolluted（由调用方触发重渲染走恢复路径）。
	* @param row - 光标行（1-based）
	* @param col - 光标列（1-based）
	*/
	noteCpr(row, col) {
		this.cprProbePending = false;
		if (this.probeSuppressed) return;
		this.cprReportRow = row;
		const probe = this.probeParked;
		if (probe && probe.rowsUp !== this.parkedRowsUp) return;
		const regionEndRow = row + (probe?.rowsUp ?? 0);
		const compareCol = probe?.col == null;
		if (!this.hasRendered || this.lastDisplayRows === 0) {
			this.cprBaseline = {
				row: regionEndRow,
				col
			};
			return;
		}
		if (!this.cprBaseline) {
			this.cprBaseline = {
				row: regionEndRow,
				col
			};
			return;
		}
		if (this.cprBaseline.row !== regionEndRow || compareCol && this.cprBaseline.col !== col) {
			this.polluted = true;
			this.cprBaseline = {
				row: regionEndRow,
				col
			};
			this.onPolluted?.();
			return;
		}
		this.cprBaseline = {
			row: regionEndRow,
			col
		};
	}
	/**
	* 更新 live region 行上限（终端 resize 时调用）。
	* maxRows 若大于终端高度，全量重写的 cursorUp 回顶量会超出屏幕导致错位，
	* 因此调用方应传入高度感知的值（如 `min(28, rows - 1)`）。
	* @param n - 新行上限；非正/非整数值被钳到 ≥1 的整数
	*/
	setMaxRows(n) {
		this.maxRows = Math.max(1, Math.floor(n));
	}
	/** 单个 logical line 占用的 display rows（wrapping-aware）。 */
	rowsForLine(text) {
		const width = this.stdout.columns || 80;
		if (width <= 0) return 1;
		const dw = displayWidth(text, { ambiguousAsWide: this.ambiguousWide() });
		if (dw === 0) return 1;
		return Math.ceil(dw / width);
	}
	/** 一组 LiveRegionLine 占用的总 display rows。 */
	countDisplayRows(lines) {
		let total = 0;
		for (const line of lines) total += this.rowsForLine(line.text);
		return total;
	}
	/**
	* 输入行归一化（2026-07-21 输入框重影修复）。
	*
	* LiveRegionLine 的契约是「单逻辑行」，但上游内容偶发携带嵌入换行——已证实的
	* 泄漏链：worker 多行 summary（review 门 evidence 用 `\n` 拼接）→
	* `progressLine: summary.slice(0, 80)` → FleetRegistry.activity → 舰队面板活动行。
	* 带 `\n` 的行在屏上占多个显示行，而 rowsForLine 基于 displayWidth
	* （string-width 剥控制符，`\n` 计 0 宽）按 1 行计 → lastDisplayRows 低于屏上
	* 实际行数 → 下一帧 cursorUp 回顶不足 → 旧帧顶部（输入框头行+边框）残留进
	* scrollback，正是「输入框重影叠屏」的形态。
	*
	* 处理：`\n` 展开为独立行；`\r`/`\t` 替换为空格（同样是 string-width 计 0 宽
	* 但终端会移动光标/跳列的字符）。内容侧净化（progressSnippet）是第一道防线，
	* 这里是引擎层兜底——任何未来新增的内容路径都不能再破坏行数追踪。
	*/
	normalizeLines(lines) {
		let dirty = false;
		for (const l of lines) if (l.text.includes("\n") || l.text.includes("\r") || l.text.includes("	")) {
			dirty = true;
			break;
		}
		if (!dirty) return lines;
		const out = [];
		for (const l of lines) {
			const cleaned = l.text.replace(/[\r\t]/g, " ");
			if (!cleaned.includes("\n")) {
				out.push(cleaned === l.text ? l : {
					...l,
					text: cleaned
				});
				continue;
			}
			for (const seg of cleaned.split("\n")) out.push({
				...l,
				text: seg
			});
		}
		return out;
	}
	/**
	* resize 协调：终端宽度变化时，已绘制的 live region 内容会被终端按新宽 reflow，
	* 其占用的 display rows 随之改变。但 `lastDisplayRows` 是上一帧在**旧宽度**下数的，
	* 若直接用于 `moveToTop`，cursorUp 量与屏上实际行数不符 → 回顶欠/过 → 旧帧顶部
	* 残留进 scrollback（多份不同宽度的 chrome/面板叠屏，见 resize 回归测试）。
	*
	* 修复：检测到宽度变化时，按**当前宽度**从 `lineCache` 重算 `lastDisplayRows`，
	* 使其与终端 reflow 后的屏上行数一致，再做相对回顶。
	*/
	reconcileWidth() {
		const currentColumns = this.stdout.columns || 80;
		if (this.hasRendered && this.lastDisplayRows > 0 && currentColumns !== this.lastColumns) this.lastDisplayRows = this.countDisplayRows(this.lineCache.map((text) => ({ text })));
		this.lastColumns = currentColumns;
	}
	/**
	* 渲染 live region（cursor-resident 协议，对标 aider mdstream / ink createIncremental）。
	*
	* 核心不变量：
	* - 渲染后光标**常驻 live region 最后一行末尾**（尾行不写 `\n`）。
	*   这避免了在终端底部因尾行换行触发滚屏 → 杜绝"贴底每帧滚动"的卡顿。
	* - 增量重绘用**相对光标移动**（cursorUp/cursorDown）回到区域顶，不使用
	*   SAVE/RESTORE 绝对光标——内容滚动后绝对坐标会失效错位。
	* - **行级 diff**：结构未变（行数 + 单显示行）时只重写变化的行，跳过未变行（少闪）。
	* - 整帧用 CSI 2026 同步输出包裹，原子刷新防撕裂。
	*
	* @param lines - 要显示的行（含 ANSI 格式化）
	* @param opts - reservedTail：超预算截断时恒保留的尾部行数（chrome 保护）
	*/
	render(lines, opts) {
		const bounded = this.applyRowBudget(this.normalizeLines(lines), opts?.reservedTail);
		const parking = this.computeParking(bounded);
		if (this.polluted) {
			this.polluted = false;
			this.reconcileWidth();
			const newDisplayRows = this.countDisplayRows(bounded);
			let body;
			if (this.hasRendered && this.lastDisplayRows > 0) {
				const climb = Math.min(Math.max(0, this.lastDisplayRows - 1 - this.parkedRowsUp), Math.max(0, this.cprReportRow - 1));
				body = (climb > 0 ? cursorUp(climb) : "") + "\r" + ANSI.ERASE_SCREEN_END + this.buildAppend(bounded);
			} else body = this.buildAppend(bounded);
			this.stdout.write(ANSI.BEGIN_SYNC + ANSI.HIDE_CURSOR + body + this.buildParkSeq(parking) + ANSI.END_SYNC);
			this.lastDisplayRows = newDisplayRows;
			this.lineCache = bounded.map((l) => l.text);
			this.hasRendered = true;
			this.lastColumns = this.stdout.columns || 80;
			this.cprBaseline = null;
			this.setParked(parking);
			this.requestProbe();
			return;
		}
		const currentColumns = this.stdout.columns || 80;
		if (this.hasRendered && this.lastDisplayRows > 0 && currentColumns === this.lastColumns && bounded.length === this.lineCache.length && bounded.every((l, i) => l.text === this.lineCache[i])) {
			if (parking) this.reparkIfChanged(parking);
			return;
		}
		const widthChanged = this.hasRendered && this.lastDisplayRows > 0 && currentColumns !== this.lastColumns;
		this.reconcileWidth();
		const newDisplayRows = this.countDisplayRows(bounded);
		if (!this.hasRendered || this.lastDisplayRows === 0) {
			this.stdout.write(ANSI.BEGIN_SYNC + ANSI.HIDE_CURSOR + this.buildAppend(bounded) + this.buildParkSeq(parking) + ANSI.END_SYNC);
			this.lastDisplayRows = newDisplayRows;
			this.lineCache = bounded.map((l) => l.text);
			this.hasRendered = true;
			this.setParked(parking);
			this.requestProbe();
			return;
		}
		const prevDisplayRows = this.lastDisplayRows;
		const canDiff = !widthChanged && bounded.length === this.lineCache.length && bounded.every((l, i) => {
			const cached = this.lineCache[i];
			return cached !== void 0 && this.rowsForLine(l.text) === this.rowsForLine(cached);
		});
		const climbRows = prevDisplayRows - this.parkedRowsUp;
		const body = canDiff ? this.buildDiff(bounded, climbRows) : this.buildFullRewrite(bounded, climbRows);
		this.stdout.write(ANSI.BEGIN_SYNC + ANSI.HIDE_CURSOR + body + this.buildParkSeq(parking) + ANSI.END_SYNC);
		this.lastDisplayRows = newDisplayRows;
		this.lineCache = bounded.map((l) => l.text);
		this.setParked(parking);
		this.requestProbe();
	}
	/** 从 bounded 行里找 caret 标记行，算驻停点（距末行 display rows + 0-based 列）。 */
	computeParking(bounded) {
		const idx = bounded.findIndex((l) => l.caretCol != null);
		if (idx < 0) return null;
		let rowsUp = 0;
		for (let i = idx + 1; i < bounded.length; i++) {
			const line = bounded[i];
			if (line === void 0) continue;
			rowsUp += this.rowsForLine(line.text);
		}
		const caretLine = bounded[idx];
		if (caretLine === void 0 || caretLine.caretCol == null) return null;
		return {
			rowsUp,
			col: caretLine.caretCol
		};
	}
	/** 帧末驻停序列：末行尾 → caret 坐标（默认驻停但保持隐藏；env 仅控制可见性）。 */
	buildParkSeq(parking) {
		let seq = "";
		if (parking) {
			if (parking.rowsUp > 0) seq += cursorUp(parking.rowsUp);
			seq += cursorToCol(parking.col + 1);
		}
		if (this.hardwareCursorVisible) seq += parking ? ANSI.SHOW_CURSOR : ANSI.HIDE_CURSOR;
		return seq;
	}
	/** 更新驻停记账（须在 requestProbe 前调用——探针按它折算响应坐标）。 */
	setParked(parking) {
		this.parkedRowsUp = parking?.rowsUp ?? 0;
		this.parkedCol = parking?.col ?? null;
	}
	/** H2 路径专用：行未变、caret 变了 → 只发重定位序列（不重绘任何文字）。 */
	reparkIfChanged(parking) {
		if (this.parkedRowsUp === parking.rowsUp && this.parkedCol === parking.col) return;
		let seq = "";
		const delta = parking.rowsUp - this.parkedRowsUp;
		if (delta > 0) seq += cursorUp(delta);
		else if (delta < 0) seq += cursorDown(-delta);
		seq += cursorToCol(parking.col + 1);
		this.stdout.write(ANSI.BEGIN_SYNC + ANSI.HIDE_CURSOR + seq + (this.hardwareCursorVisible ? ANSI.SHOW_CURSOR : "") + ANSI.END_SYNC);
		this.setParked(parking);
		this.requestProbe();
	}
	/**
	* 行预算：内容超过 maxRows 时，**优先保留尾部 chrome**（GlanceBar + 输入框 + 提示），
	* 截断的是中段 dynamic（streaming tail / 工具输出）的较早部分。
	*
	* **预算按 display rows 计量**（非行数）：窄窗口下长正文/长输入折行后，
	* 行数 ≤ maxRows 也可能整帧超出终端高度——全量重写越过屏幕底部触发滚动，
	* 回顶量与屏上实际布局错位，旧帧正文残留并叠印在 chrome 之下
	* （小窗口打字时正文"泄露"到输入框底下的根因）。不变量：整帧恒 ≤ maxRows
	* display rows（= min(28, rows-1)），重写永不越底。
	*
	* - 全帧 display rows ≤ maxRows：全部保留。
	* - 未指定 reservedTail：按预算保留前若干行。
	* - 指定 reservedTail：尾部 N 行恒保留；剩余预算从 dynamic 段尾部回填。
	*   若 chrome 本身已超 maxRows，仍全部显示——宁可超行，也不能让输入框消失。
	*/
	applyRowBudget(lines, reservedTail) {
		if (this.countDisplayRows(lines) <= this.maxRows) return lines.slice();
		if (reservedTail === void 0 || reservedTail <= 0) {
			const kept = [];
			let rows = 0;
			for (const line of lines) {
				const r = this.rowsForLine(line.text);
				if (rows + r > this.maxRows) break;
				kept.push(line);
				rows += r;
			}
			return kept;
		}
		const tail = Math.min(reservedTail, lines.length);
		const tailLines = lines.slice(lines.length - tail);
		const tailRows = this.countDisplayRows(tailLines);
		const budget = this.maxRows - tailRows;
		if (budget <= 0) return tailLines.slice();
		const dynamic = lines.slice(0, lines.length - tail);
		const kept = [];
		let rows = 0;
		for (let i = dynamic.length - 1; i >= 0; i--) {
			const line = dynamic[i];
			if (line === void 0) continue;
			const r = this.rowsForLine(line.text);
			if (rows + r > budget) break;
			kept.unshift(line);
			rows += r;
		}
		return [...kept, ...tailLines];
	}
	/** Append 路径：行间 `\n`，尾行不带 `\n`（光标常驻最后一行末尾）。 */
	buildAppend(bounded) {
		let out = "";
		for (const [i, line] of bounded.entries()) {
			out += line.text;
			if (i < bounded.length - 1) out += "\n";
		}
		return out;
	}
	/** 相对光标回到 live region 顶部显示行（光标当前在最后一个显示行）。 */
	moveToTop(prevDisplayRows) {
		return prevDisplayRows > 1 ? cursorUp(prevDisplayRows - 1) : "";
	}
	/**
	* 全量重写：回顶 → 擦到屏幕末（覆盖旧的所有显示行，含 wrap）→ 重写全部行。
	* 尾行不带 `\n`，光标停在最后一行末尾。
	*/
	buildFullRewrite(bounded, prevDisplayRows) {
		let out = this.moveToTop(prevDisplayRows);
		out += "\r" + ANSI.ERASE_SCREEN_END;
		for (const [i, line] of bounded.entries()) {
			out += line.text;
			if (i < bounded.length - 1) out += "\n";
		}
		return out;
	}
	/**
	* 行级 diff（结构未变 + 每行 wrap 高度未变时调用，见 canDiff）：
	* 回顶后逐行处理——变化行清除其全部显示行后重写；未变行只按显示行数 cursorDown 跳过。
	* 不写任何 `\n`（cursorDown 在底行会被 clamp，不触发滚屏）。
	*
	* 光标步进不变量：每次迭代开始时光标位于「逻辑行 i 的首个显示行」，
	* 处理结束时（cursorDown 之前）位于「逻辑行 i 的最后一个显示行」，
	* 再 cursorDown(1) 进入下一逻辑行首行。变化行与未变行两条分支都满足该不变量。
	*/
	buildDiff(bounded, prevDisplayRows) {
		let out = this.moveToTop(prevDisplayRows);
		for (const [i, line] of bounded.entries()) {
			const text = line.text;
			const rows = this.rowsForLine(text);
			out += "\r";
			if (this.lineCache[i] !== text) {
				out += ANSI.ERASE_LINE;
				for (let k = 1; k < rows; k++) out += cursorDown(1) + "\r" + ANSI.ERASE_LINE;
				if (rows > 1) out += cursorUp(rows - 1);
				out += text;
			} else if (rows > 1) out += cursorDown(rows - 1);
			if (i < bounded.length - 1) out += cursorDown(1);
		}
		return out;
	}
	/**
	* 清空 live region（擦除但不回滚 scrollback）。
	* 用于流式输出完成、切换到新 turn 时。
	*
	* 光标常驻协议下，光标在最后一个显示行——回顶后擦到屏幕末，光标停在
	* 区域起始处。后续 append/commit 从这里开始写，干净无空白带。
	*/
	clear() {
		this.reconcileWidth();
		if (this.lastDisplayRows === 0) return;
		this.stdout.write(ANSI.HIDE_CURSOR + this.moveToTop(this.lastDisplayRows - this.parkedRowsUp) + "\r" + ANSI.ERASE_SCREEN_END);
		this.lastDisplayRows = 0;
		this.lineCache = [];
		this.setParked(null);
		this.polluted = false;
	}
	/**
	* 擦除 live region 并把光标停在其起始行——为向 scrollback commit 内容腾位。
	*
	* 正确的 mid-stream commit 协议：
	*   live.clearForCommit() → commit.write(...) → live.render(...)
	*
	* cursor-resident 协议下与 clear() 行为一致（光标都回到区域起始处）。
	*/
	clearForCommit() {
		this.clear();
	}
	/**
	* 渲染单行动态文本（如 streaming 行、thinking 指示器）。
	* 简化版：擦除上一帧内容 → 写入新内容。
	* @param text - 该行的 ANSI 格式化文本
	*/
	renderLine(text) {
		this.render([{ text }]);
	}
	/** 重置渲染状态（用于 rewind 等需要全量重绘的场景） */
	reset() {
		this.lastDisplayRows = 0;
		this.lineCache = [];
		this.hasRendered = false;
		this.setParked(null);
	}
};
//#endregion
//#region lib/types/engine/write-batcher.js
/**
* T9 WriteBatcher — 渲染帧合并器（microtask 合并 + 16ms 帧节流）。
*
* 替代 Ink 的 RenderBatcher（依赖 React 调度），直接将多次 render 调用
* 合并为一次 LiveEngine.render()。
*
* 策略（2026-07-24 P2，对标 pi-tui MIN_RENDER_INTERVAL_MS=16）：
* - 距上次 flush ≥16ms：microtask 刷新（leading edge，低延迟路径不变）。
* - 距上次 flush <16ms：setTimeout(剩余) 尾沿（trailing edge）——高吞吐
*   小 delta（流式 token / IME 整段上屏）下帧率封顶 ~60fps，渲染成本从
*   「每事件圈一帧」降为恒定上限；窗口内多次 schedule 合并为一帧。
* - flushNow()：critical 路径（提交/commit/phase 切换）同步穿透，不受
*   节流限制，并作废排队的 microtask 与定时器。
*
* BlockStreamWriter.onBlock → WriteBatcher.flush() → LiveEngine.render()
*
* 健壮性：onFlush 在 microtask/定时器中执行，若直接抛出会变成 unhandled
* rejection 崩进程。故 flush 用 try/catch 包裹，错误交给 onError（默认
* 记录到 stderr 但不中断 TUI），保证一次渲染异常不会让整个终端崩溃。
*/
/** 帧最小间隔（~60fps 上限）。 */
const MIN_FRAME_INTERVAL_MS = 16;
/**
* 渲染帧合并器：schedule() 的多次调用合并为一次 onFlush（microtask 或 16ms
* 尾沿），flushNow() 同步穿透。onFlush 抛错交给 onError（默认写 stderr），
* 不会中断 TUI 进程。
*/
var WriteBatcher = class {
	pending = false;
	generation = 0;
	lastFlushAt = 0;
	timer = null;
	onFlush;
	onError;
	constructor(onFlush, onError) {
		this.onFlush = onFlush;
		this.onError = onError ?? ((err) => {
			try {
				process.stderr.write(`WriteBatcher flush error: ${String(err)}\n`);
			} catch {}
		});
	}
	/** 请求刷新：距上次 flush ≥16ms 走 microtask，否则 16ms 尾沿（窗口内合并）。 */
	schedule() {
		if (this.pending) return;
		this.pending = true;
		const wait = 16 - (Date.now() - this.lastFlushAt);
		if (wait <= 0) {
			const generation = this.generation;
			Promise.resolve().then(() => {
				if (!this.pending || generation !== this.generation) return;
				this.pending = false;
				this.runFlush();
			});
			return;
		}
		this.timer = setTimeout(() => {
			this.timer = null;
			if (!this.pending) return;
			this.pending = false;
			this.runFlush();
		}, wait);
		this.timer.unref();
	}
	/** Immediately flush once and invalidate any previously queued microtask/timer. */
	flushNow() {
		this.generation++;
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		this.pending = false;
		this.runFlush();
	}
	runFlush() {
		this.lastFlushAt = Date.now();
		try {
			this.onFlush();
		} catch (err) {
			this.onError(err);
		}
	}
};
//#endregion
//#region lib/types/engine/input-handler.js
/**
* T9 InputHandler — 统一键盘输入处理（替代 Ink 的 useInput hooks）。
*
* 核心功能：
* - 设置 stdin raw mode，逐字节读取
* - 解析 UTF-8 字符 + ANSI escape sequences（方向键、功能键等）
* - 支持多种输入模式：normal / input / overlay / vim
* - 分发按键事件到注册的处理器
*
* 按键类型分类（参考 Node.js readline + Ink 的 keypress 解析）：
* - 可打印字符（UTF-8）：直接分发
* - 控制字符（Ctrl+A..Z, Tab, Enter, Escape, Backspace）
* - ANSI escape sequences（方向键、Home/End、PgUp/PgDn、F1-F12）
* - 鼠标事件（SGR mouse protocol）— 暂不处理
*/
/** Bracketed paste 标记（DEC 2004） */
const PASTE_START = "\x1B[200~";
const PASTE_END = "\x1B[201~";
/**
* 尚未收完的 CPR 响应形状：`\x1B[66`、`\x1B[66;`、`\x1B[66;1`（缺结尾的 `R`）。
*
* CPR 是终端对 DSR `\x1B[6n` 探针的自动回吐，不是用户按键。它一旦被超时兜底
* 腰斩，剩余部分不该退化成可打印字符——那会让 `[66;` 这样的残片出现在输入框里。
* 完整体由 parseInput 的 CPR 分支正常消费，这里只管被截断的半截。
*/
const CPR_PARTIAL_RE = /^\x1B\[\d+(;\d*)?$/;
/**
* Ctrl+key 的 ASCII 范围：Ctrl+A = 0x01 .. Ctrl+Z = 0x1A
* 以及一些特殊控制字符。
*/
const CTRL_CODES = {
	1: "ctrl_a",
	2: "ctrl_b",
	3: "ctrl_c",
	4: "ctrl_d",
	5: "ctrl_e",
	6: "ctrl_f",
	8: "ctrl_h",
	9: "tab",
	10: "ctrl_j",
	11: "ctrl_k",
	12: "ctrl_l",
	13: "return",
	14: "ctrl_n",
	15: "ctrl_o",
	16: "ctrl_p",
	17: "ctrl_q",
	18: "ctrl_r",
	19: "ctrl_s",
	20: "ctrl_t",
	21: "ctrl_u",
	22: "ctrl_v",
	23: "ctrl_w",
	24: "ctrl_x",
	25: "ctrl_y",
	26: "ctrl_z",
	29: "ctrl_]",
	30: "ctrl_.",
	31: "ctrl_minus",
	27: "escape",
	127: "backspace"
};
const ANSI_ESCAPE_MAP = {
	"[A": "up",
	"[B": "down",
	"[C": "right",
	"[D": "left",
	"[H": "home",
	"[F": "end",
	"[2~": "insert",
	"[3~": "delete",
	"[5~": "pageup",
	"[6~": "pagedown",
	"OP": "f1",
	"OQ": "f2",
	"OR": "f3",
	"OS": "f4",
	"[15~": "f5",
	"[17~": "f6",
	"[18~": "f7",
	"[19~": "f8",
	"[20~": "f9",
	"[21~": "f10",
	"[23~": "f11",
	"[24~": "f12",
	"[Z": "shift_tab"
};
/**
* 统一键盘输入处理器：构造时把 stdin 置为 raw mode 并接管 data 事件，
* 解析 UTF-8 字符 / ANSI 转义序列 / bracketed paste / CPR 响应后分发给
* 注册的处理器。用完必须调用 dispose() 恢复终端默认行为。
*/
var InputHandler = class {
	stdin;
	mode;
	handlers = /* @__PURE__ */ new Map();
	pasteHandlers = /* @__PURE__ */ new Set();
	/** CPR（cursor position report）处理器：终端对 DSR `\x1B[6n` 的响应
	*  `\x1B[{row};{col}R` 不是按键，单独走这个通道（LiveEngine 自愈用）。 */
	cprHandlers = /* @__PURE__ */ new Set();
	escapeTimeoutMs;
	partialSequenceTimeoutMs;
	escapeTimer = null;
	/** 当为 true 时，单独的 ESC 字节立即派发为 escape，不等待超时。
	*  用于 overlay 激活场景，避免 ESC 关闭/退出有 40ms 可感知延迟。 */
	escapeImmediate = false;
	pasteActive = false;
	pasteBuffer = "";
	/**
	* 跨 chunk 不完整代理对缓冲：上游（stdin）可能把同一 UTF-16 代理对的两个
	* code unit 拆到两个 `data` 事件里（高强度输入 + 终端流量控制时偶发）。
	* 若不缓冲，第一段被当成"可打印字符"派发，char 字段就是孤立的
	* high-surrogate `\uD83D`——输入框会显示成豆腐方块，emoji 簇不可用。
	* 这里在 handleData 入口预拼，在派发前剥离尾部 high-surrogate。
	*/
	pendingData = "";
	/**
	* 跨 chunk 输入字节缓冲。ESC 序列、bracketed paste 起止标记都可能被拆到
	* 多个 `data` 事件里；保留未处理完的尾部，等待后续字节完整后再派发。
	*/
	inputBuffer = "";
	constructor(options) {
		this.stdin = options.stdin;
		this.mode = options.mode ?? "input";
		this.escapeTimeoutMs = options.escapeTimeoutMs ?? 80;
		this.partialSequenceTimeoutMs = options.partialSequenceTimeoutMs ?? 500;
		if (this.stdin.isTTY) try {
			this.stdin.setRawMode(true);
		} catch {}
		this.stdin.resume();
		this.stdin.setEncoding("utf8");
		this.stdin.on("data", (data) => {
			this.handleData(data);
		});
	}
	/**
	* 注册按键处理器。
	* @param event - 按键名（KeyName）、`'*'` 通配、或 `mode:keyName` 模式限定形式
	* @param handler - 命中时调用的处理器
	* @returns 取消注册的函数
	*/
	onKey(event, handler) {
		let set = this.handlers.get(event);
		if (!set) {
			set = /* @__PURE__ */ new Set();
			this.handlers.set(event, set);
		}
		set.add(handler);
		return () => {
			set.delete(handler);
		};
	}
	/**
	* 注册所有按键的处理器（通配符）。
	* @param handler - 每个按键事件都会调用的处理器
	* @returns 取消注册的函数
	*/
	onAnyKey(handler) {
		return this.onKey("*", handler);
	}
	/**
	* 注册 bracketed paste 处理器（一次性收到整段粘贴文本，已规范化换行）。
	* @param handler - 接收整段粘贴文本的处理器
	* @returns 取消注册的函数
	*/
	onPaste(handler) {
		this.pasteHandlers.add(handler);
		return () => {
			this.pasteHandlers.delete(handler);
		};
	}
	/**
	* 注册 CPR 处理器（终端光标位置报告，row/col 为 1-based）。
	* @param handler - 接收 row/col 的处理器
	* @returns 取消注册的函数
	*/
	onCpr(handler) {
		this.cprHandlers.add(handler);
		return () => {
			this.cprHandlers.delete(handler);
		};
	}
	/**
	* 切换输入模式（影响 `mode:keyName` 形式处理器的路由）。
	* @param mode - 新的输入模式
	*/
	setMode(mode) {
		this.mode = mode;
	}
	/**
	* 获取当前输入模式。
	* @returns 当前输入模式
	*/
	getMode() {
		return this.mode;
	}
	/**
	* 设置单独 ESC 字节是否立即派发。
	* overlay 激活时设为 true，避免 ESC 关闭/退出等待超时。
	* @param immediate - true 立即派发孤立 ESC；false 恢复超时判定
	*/
	setEscapeImmediate(immediate) {
		this.escapeImmediate = immediate;
	}
	/** 关闭 raw mode，恢复终端默认行为。 */
	dispose() {
		if (this.escapeTimer) {
			clearTimeout(this.escapeTimer);
			this.escapeTimer = null;
		}
		this.pendingData = "";
		this.inputBuffer = "";
		this.stdin.removeAllListeners("data");
		if (this.stdin.isTTY) try {
			this.stdin.setRawMode(false);
		} catch {}
		this.stdin.pause();
		this.handlers.clear();
		this.pasteHandlers.clear();
		this.cprHandlers.clear();
	}
	handleData(data) {
		if (this.pendingData) {
			data = this.pendingData + data;
			this.pendingData = "";
		}
		if (data.length > 0) {
			const lastCode = data.charCodeAt(data.length - 1);
			if (lastCode >= 55296 && lastCode <= 56319) {
				this.pendingData = data.slice(-1);
				data = data.slice(0, -1);
				if (!data) return;
			}
		}
		this.inputBuffer += data;
		if (this.escapeTimer) {
			clearTimeout(this.escapeTimer);
			this.escapeTimer = null;
		}
		this.processInputBuffer();
	}
	/**
	* 从缓冲区起始位置连续派发普通按键，直到遇到不完整序列或缓冲区末尾。
	* 返回实际消费的字节数。
	*/
	dispatchKeys(buf) {
		let i = 0;
		while (i < buf.length) {
			const parsed = this.parseInput(buf.slice(i));
			if (parsed.consumed === 0) break;
			if (parsed.key) this.dispatch(parsed.key);
			i += parsed.consumed;
		}
		return i;
	}
	/** 处理跨 chunk 缓冲的输入缓冲区，按 paste → ESC 序列 → 普通字符优先级解析。 */
	processInputBuffer() {
		while (this.inputBuffer.length > 0) {
			if (this.pasteActive) {
				const endIdx = this.inputBuffer.indexOf(PASTE_END);
				if (endIdx !== -1) {
					this.pasteBuffer += this.inputBuffer.slice(0, endIdx);
					const text = this.pasteBuffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
					this.pasteActive = false;
					this.pasteBuffer = "";
					for (const handler of this.pasteHandlers) handler(text);
					this.inputBuffer = this.inputBuffer.slice(endIdx + 6);
					continue;
				}
				const partial = getPartialSuffix(this.inputBuffer, PASTE_END);
				if (partial > 0) {
					this.pasteBuffer += this.inputBuffer.slice(0, -partial);
					this.inputBuffer = this.inputBuffer.slice(-partial);
					break;
				}
				this.pasteBuffer += this.inputBuffer;
				this.inputBuffer = "";
				break;
			}
			const startIdx = this.inputBuffer.indexOf(PASTE_START);
			if (startIdx !== -1) {
				const prefix = this.inputBuffer.slice(0, startIdx);
				const consumed = this.dispatchKeys(prefix);
				if (consumed < prefix.length) {
					this.inputBuffer = this.inputBuffer.slice(consumed);
					break;
				}
				this.inputBuffer = this.inputBuffer.slice(startIdx + 6);
				this.pasteActive = true;
				this.pasteBuffer = "";
				continue;
			}
			const partialStart = getPartialSuffix(this.inputBuffer, PASTE_START);
			if (partialStart > 0) {
				const prefixLen = this.inputBuffer.length - partialStart;
				const consumed = this.dispatchKeys(this.inputBuffer.slice(0, prefixLen));
				this.inputBuffer = this.inputBuffer.slice(consumed);
				break;
			}
			const consumed = this.dispatchKeys(this.inputBuffer);
			this.inputBuffer = this.inputBuffer.slice(consumed);
			break;
		}
		if (this.inputBuffer === "\x1B" && !this.pasteActive) if (this.escapeImmediate) {
			this.inputBuffer = "";
			this.dispatch({
				raw: "\x1B",
				char: "",
				name: "escape",
				ctrl: false,
				meta: false,
				shift: false
			});
		} else this.escapeTimer = setTimeout(() => {
			this.escapeTimer = null;
			if (this.inputBuffer === "\x1B" && !this.pasteActive) {
				this.inputBuffer = "";
				this.dispatch({
					raw: "\x1B",
					char: "",
					name: "escape",
					ctrl: false,
					meta: false,
					shift: false
				});
			}
		}, this.escapeTimeoutMs);
		else if (!this.pasteActive && (this.inputBuffer.startsWith("\x1B[") || this.inputBuffer.startsWith("\x1BO"))) {
			const flushPartial = () => {
				if (this.pasteActive || !this.inputBuffer.startsWith("\x1B[") && !this.inputBuffer.startsWith("\x1BO")) return;
				if (CPR_PARTIAL_RE.test(this.inputBuffer)) {
					this.inputBuffer = "";
					return;
				}
				this.dispatch({
					raw: "\x1B",
					char: "",
					name: "unknown",
					ctrl: false,
					meta: false,
					shift: false
				});
				this.inputBuffer = this.inputBuffer.slice(1);
				this.processInputBuffer();
			};
			if (this.escapeImmediate) flushPartial();
			else if (!this.escapeTimer) this.escapeTimer = setTimeout(() => {
				this.escapeTimer = null;
				flushPartial();
			}, this.partialSequenceTimeoutMs);
		}
	}
	/** 把按键分发到 name / 通配 / mode 前缀三类处理器。 */
	dispatch(key) {
		const nameSet = this.handlers.get(key.name);
		if (nameSet) for (const handler of nameSet) handler(key);
		const wildSet = this.handlers.get("*");
		if (wildSet) for (const handler of wildSet) handler(key);
		const modeSet = this.handlers.get(`${this.mode}:${key.name}`);
		if (modeSet) for (const handler of modeSet) handler(key);
	}
	/**
	* 解析 data 首部的一个按键事件 + 实际消费的 code unit 数。
	*
	* 返回 { key: null, consumed: 0 } 表示"等后续字节"（孤 ESC 字节、跨 chunk
	* 的 CSI/SS3 序列）；否则 key 非 null，consumed 告诉调用方已消费的字节数。
	*/
	parseInput(data) {
		if (data.length === 0) return {
			key: null,
			consumed: 0
		};
		if (data.startsWith("\x1B")) {
			if (data.length === 1) return {
				key: null,
				consumed: 0
			};
			const csiMatch = data.match(/^\x1B\[[0-9;]*[A-Za-z~]/);
			if (csiMatch) {
				const seq = csiMatch[0];
				const cprMatch = seq.match(/^\x1B\[(\d+);(\d+)R$/);
				if (cprMatch) {
					for (const handler of this.cprHandlers) handler(Number(cprMatch[1]), Number(cprMatch[2]));
					return {
						key: null,
						consumed: seq.length
					};
				}
				const name = this.resolveEscapeSequence(seq);
				const meta = seq.includes(";3") || seq.includes(";4");
				const shift = seq.includes(";2") || name === "shift_tab";
				return {
					key: {
						raw: seq,
						char: "",
						name: name ?? "unknown",
						ctrl: false,
						meta,
						shift
					},
					consumed: seq.length
				};
			}
			const ss3Match = data.match(/^\x1BO[A-Za-z]/);
			if (ss3Match) {
				const seq = ss3Match[0];
				return {
					key: {
						raw: seq,
						char: "",
						name: this.resolveEscapeSequence(seq) ?? "unknown",
						ctrl: false,
						meta: false,
						shift: false
					},
					consumed: seq.length
				};
			}
			if (data.length >= 2 && data[1] !== "[" && data[1] !== "O") {
				const char = data[1];
				if (char === void 0) return {
					key: null,
					consumed: 0
				};
				if (char === "\r") return {
					key: {
						raw: data.slice(0, 2),
						char: "",
						name: "return",
						ctrl: false,
						meta: true,
						shift: false
					},
					consumed: 2
				};
				const isUpper = char >= "A" && char <= "Z";
				return {
					key: {
						raw: data.slice(0, 2),
						char,
						name: "unknown",
						ctrl: false,
						meta: true,
						shift: isUpper
					},
					consumed: 2
				};
			}
			if (/^\x1B(\[([0-9;]*)|O)$/.test(data)) return {
				key: null,
				consumed: 0
			};
			return {
				key: {
					raw: "\x1B",
					char: "",
					name: "unknown",
					ctrl: false,
					meta: false,
					shift: false
				},
				consumed: 1
			};
		}
		const code = data.codePointAt(0);
		if (code === void 0) return {
			key: null,
			consumed: 0
		};
		if (code <= 31 || code === 127) {
			const name = CTRL_CODES[code] ?? "unknown";
			return {
				key: {
					raw: data.slice(0, 1),
					char: "",
					name,
					ctrl: code <= 31 && code !== 9 && code !== 10 && code !== 13,
					meta: false,
					shift: false
				},
				consumed: 1
			};
		}
		const charLen = code > 65535 ? 2 : 1;
		const char = data.slice(0, charLen);
		return {
			key: {
				raw: char,
				char,
				name: char === " " ? "space" : "unknown",
				ctrl: false,
				meta: false,
				shift: char !== char.toLowerCase() && char !== char.toUpperCase() ? false : char === char.toUpperCase() && char.toLowerCase() !== char.toUpperCase()
			},
			consumed: charLen
		};
	}
	resolveEscapeSequence(seq) {
		const body = seq.slice(1);
		const direct = ANSI_ESCAPE_MAP[body];
		if (direct) return direct;
		const modifyOtherKeysMatch = body.match(/^\[(\d+);(\d+)u$/);
		if (modifyOtherKeysMatch) {
			const code = Number(modifyOtherKeysMatch[1]);
			if (code === 13) return "return";
			if (code === 9) return "shift_tab";
		}
		const modMatch = body.match(/^\[(\d+);(\d+)([A-H~])$/);
		if (modMatch) {
			const baseName = ANSI_ESCAPE_MAP[`[${modMatch[3]}`];
			if (baseName) return baseName;
		}
		const prefixMatch = body.match(/^\[(\d+)([~])$/);
		if (prefixMatch) {
			const baseName = ANSI_ESCAPE_MAP[`[${prefixMatch[2]}`];
			if (baseName) return baseName;
		}
		return null;
	}
};
/** 返回 `buf` 后缀中是 `marker` 前缀的最长长度（0 表示没有）。
*  用于 bracketed paste 起止标记跨 chunk 时保留不完整尾部。 */
function getPartialSuffix(buf, marker) {
	const max = Math.min(marker.length - 1, buf.length);
	for (let len = max; len > 0; len--) if (buf.endsWith(marker.slice(0, len))) return len;
	return 0;
}
//#endregion
//#region lib/types/engine/input-line.js
/**
* T9 InputLine — 纯 TypeScript 类，替代 base-text-input.tsx / input.tsx。
*
* 管理输入文本缓冲区、光标位置、历史、Vim 模式。
* 零 React/Ink 依赖。通过回调通知外部变化。
*
* 核心能力：
* - 字符输入 + 多字节 UTF-8 支持
* - 光标移动（左右/home/end/词级）
* - 删除（backspace/delete/词级删除）
* - 历史导航（上下键）
* - 行内编辑（Ctrl+A/E/U/K/W）
* - Vim 模式（Normal/Insert）
* - Tab 补全接口
* - 粘贴支持
*/
/** Grapheme 分段器（Node 22+）。用于按用户感知字符（CJK/emoji/ZWJ 簇）步进光标。
* WSL/Alpine 中若 Node.js 运行时缺少 ICU 数据，Intl.Segmenter 会抛出。
* 降级到按 code-point 分割（仍正确处理多字节 UTF-8，但不支持 ZWJ emoji 簇）。 */
let graphemeSegmenter = null;
try {
	graphemeSegmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
} catch {
	graphemeSegmenter = null;
}
const GRAPHEME_SEGMENTER = graphemeSegmenter;
/** CJK 统一表意/扩展A/兼容/假名/谚文——与 \w 一起视为 word 字符。
*  不复用 prevWordStart 的 /\w/ 口径：它把整段中文当非词，连续中文输入
*  会被错分为一堆独立单元。 */
const WORD_CHAR_RE = /^(?:\w|[一-鿿㐀-䶿豈-﫿぀-ヿ가-힯])$/;
function classifyInsert(ch) {
	if (/^\s$/.test(ch)) return "insert-space";
	if (WORD_CHAR_RE.test(ch)) return "insert-word";
	return "insert-other";
}
const UNDO_STACK_MAX = 200;
/** 快照滞留总字符上限（≈2M UTF-16 code units）：200 单元 × 极端大 buffer
* （多次 100KB+ 粘贴）的滞留内存长尾防护——超限时逐出最旧单元。 */
const UNDO_TOTAL_CHARS_MAX = 2e6;
/** 触发折叠的阈值（行数 或 字符数）。 */
const PASTE_FOLD_MIN_LINES = 10;
const PASTE_FOLD_MIN_CHARS = 1e3;
/** 标记串形态（grapheme 原子化 / 提交展开 / 渲染着色共用）。 */
const PASTE_MARKER_RE = /\[paste #(\d+) \+\d+ lines?\]/g;
/** 返回字符串中所有 grapheme 边界的 code-unit 偏移（含 0 与末尾）。 */
function graphemeBoundaries(value) {
	const bounds = [0];
	if (GRAPHEME_SEGMENTER) for (const seg of GRAPHEME_SEGMENTER.segment(value)) bounds.push(seg.index + seg.segment.length);
	else {
		let i = 0;
		while (i < value.length) {
			const cp = value.codePointAt(i);
			if (cp === void 0) {
				bounds.push(i);
				i++;
				continue;
			}
			bounds.push(i + (cp > 65535 ? 2 : 1));
			i += cp > 65535 ? 2 : 1;
		}
	}
	return bounds;
}
function inputDisplayWidth(text, ambiguousAsWide) {
	return displayWidth(text, { ambiguousAsWide });
}
function pushWrappedSegment(out, segment, prefix, maxContentWidth, cursorOffset, ambiguousAsWide, caretCol, segAbsStart, sel) {
	const chars = Array.from(segment);
	let current = "";
	let currentWidth = 0;
	let currentHasCursor = false;
	let offset = 0;
	let inSel = false;
	const flush = () => {
		out.push({
			text: `${prefix}${current}${inSel ? ANSI.RESET : ""}`,
			cursor: currentHasCursor
		});
		current = inSel ? ANSI.REVERSE : "";
		currentWidth = 0;
		currentHasCursor = false;
	};
	for (const ch of chars) {
		const absOff = (segAbsStart ?? 0) + offset;
		if (sel && inSel && absOff === sel.end) {
			current += ANSI.RESET;
			inSel = false;
		}
		if (sel && !inSel && absOff === sel.start) {
			current += ANSI.REVERSE;
			inSel = true;
		}
		if (cursorOffset !== null && offset === cursorOffset) {
			const markerWidth = inputDisplayWidth("█", ambiguousAsWide);
			if (currentWidth > 0 && currentWidth + markerWidth > maxContentWidth) flush();
			if (caretCol) caretCol.value = currentWidth;
			current += "█";
			currentWidth += markerWidth;
			currentHasCursor = true;
		}
		const chWidth = Math.max(1, inputDisplayWidth(ch, ambiguousAsWide));
		if (currentWidth > 0 && currentWidth + chWidth > maxContentWidth) flush();
		current += ch;
		currentWidth += chWidth;
		offset += ch.length;
	}
	if (cursorOffset !== null && cursorOffset === segment.length) {
		const absOff = (segAbsStart ?? 0) + offset;
		if (sel && inSel && absOff === sel.end) {
			current += ANSI.RESET;
			inSel = false;
		}
		if (sel && !inSel && absOff === sel.start) {
			current += ANSI.REVERSE;
			inSel = true;
		}
		const markerWidth = inputDisplayWidth("█", ambiguousAsWide);
		if (currentWidth > 0 && currentWidth + markerWidth > maxContentWidth) flush();
		if (caretCol) caretCol.value = currentWidth;
		current += "█";
		currentWidth += markerWidth;
		currentHasCursor = true;
	}
	if (currentWidth > 0 || currentHasCursor || segment.length === 0) flush();
}
/** ghost 预览的 dim 样式（终端原生 dim，不依赖主题）。 */
const GHOST_DIM_OPEN = "\x1B[2m";
const GHOST_DIM_CLOSE = "\x1B[22m";
/**
* 在 wrap 后的光标行按列位置插入 dim ghost，并把行宽截到 maxWidth。
* 行文本不含 ANSI（调用方保证无选区）；ghost 按剩余空间截断。
* @param line - wrap 后的光标行文本（prefix + 片段）。
* @param col - 光标列（含 prefix，列 = 字符位置）。
* @param ghost - ghost 文本。
* @param maxWidth - 目标行宽。
* @returns 插入 ghost 并截断后的行。
*/
function insertGhost(line, col, ghost, maxWidth) {
	const prefix = line.slice(0, col);
	const rest = line.slice(col);
	const avail = maxWidth - displayWidth(prefix) - displayWidth(rest);
	if (avail <= 0) return line;
	let shown = "";
	for (const ch of ghost) {
		if (displayWidth(shown + ch) > avail) break;
		shown += ch;
	}
	return `${prefix}${GHOST_DIM_OPEN}${shown}${GHOST_DIM_CLOSE}${rest}`;
}
function wrapInputLines(value, cursor, maxWidth, sel) {
	const ambiguousAsWide = ambiguousWideEnabled();
	const visual = [];
	const logicalLines = value.split("\n");
	const prefixWidth = inputDisplayWidth("❯ ", ambiguousAsWide);
	const maxContentWidth = Math.max(1, maxWidth - prefixWidth);
	let cursorLine = 0;
	let cursorCol = prefixWidth;
	let absoluteOffset = 0;
	for (let lineIndex = 0; lineIndex < logicalLines.length; lineIndex++) {
		const logicalLine = logicalLines[lineIndex];
		if (logicalLine === void 0) continue;
		const lineStart = absoluteOffset;
		const lineEnd = lineStart + logicalLine.length;
		const cursorInLine = cursor >= lineStart && cursor <= lineEnd;
		const prefix = cursorInLine ? "❯ " : "  ";
		const beforeCount = visual.length;
		const caretCol = { value: 0 };
		pushWrappedSegment(visual, logicalLine, prefix, maxContentWidth, cursorInLine ? cursor - lineStart : null, ambiguousAsWide, caretCol, lineStart, sel);
		if (cursorInLine) {
			const found = visual.findIndex((line, idx) => idx >= beforeCount && line.cursor);
			cursorLine = found >= 0 ? found : beforeCount;
			cursorCol = prefixWidth + caretCol.value;
		}
		absoluteOffset = lineEnd + 1;
	}
	return {
		lines: visual.map((line) => line.text),
		cursorLine,
		cursorCol
	};
}
/** 在升序边界数组中找严格小于 cursor 的最大下标（光标左侧最近边界）。二分 O(log n)。 */
function boundaryBefore(bounds, cursor) {
	let lo = 0, hi = bounds.length - 1, ans = 0;
	while (lo <= hi) {
		const mid = lo + hi >>> 1;
		const b = bounds[mid];
		if (b === void 0) break;
		if (b < cursor) {
			ans = b;
			lo = mid + 1;
		} else hi = mid - 1;
	}
	return ans;
}
/** 在升序边界数组中找严格大于 cursor 的最小下标（光标右侧最近边界）。二分 O(log n)。 */
function boundaryAfter(bounds, cursor) {
	let lo = 0, hi = bounds.length - 1;
	while (lo < hi) {
		const mid = lo + hi >>> 1;
		const b = bounds[mid];
		if (b === void 0) break;
		if (b > cursor) hi = mid;
		else lo = mid + 1;
	}
	const b = bounds[lo];
	if (b === void 0) return -1;
	return b > cursor ? b : -1;
}
/** 剔除落在 `[paste #N …]` 标记内部的边界（端点保留）——标记成为原子编辑单位。 */
function atomicPasteMarkerBounds(value, bounds) {
	const spans = [];
	for (const m of value.matchAll(new RegExp(PASTE_MARKER_RE.source, "g"))) {
		const matched = m[0];
		spans.push([m.index, m.index + matched.length]);
	}
	if (spans.length === 0) return bounds;
	return bounds.filter((b) => !spans.some(([s, e]) => b > s && b < e));
}
/** 视窗裁剪：返回可见行 + 光标行在【返回数组内】的下标（硬件光标归位需要）。 */
function viewportWithCaret(lines, cursorLine, maxLines) {
	if (maxLines === void 0 || lines.length <= maxLines) return {
		lines,
		caretLine: Math.min(Math.max(cursorLine, 0), lines.length - 1)
	};
	const max = Math.max(1, Math.floor(maxLines));
	const cursor = Math.min(Math.max(cursorLine, 0), lines.length - 1);
	const cursorText = lines[cursor];
	if (cursorText === void 0) return {
		lines: [],
		caretLine: 0
	};
	if (max === 1) return {
		lines: [cursorText],
		caretLine: 0
	};
	if (max === 2) return cursor < lines.length - 1 ? {
		lines: [cursorText, `… ${lines.length - cursor - 1} lines below`],
		caretLine: 0
	} : {
		lines: [`… ${cursor} lines above`, cursorText],
		caretLine: 1
	};
	const hasAbove = cursor > 0;
	const hasBelow = cursor < lines.length - 1;
	const contentSlots = Math.max(1, max - (hasAbove ? 1 : 0) - (hasBelow ? 1 : 0));
	const minStart = hasAbove ? 1 : 0;
	const maxStart = hasBelow ? Math.max(minStart, lines.length - 1 - contentSlots) : Math.max(minStart, lines.length - contentSlots);
	const centeredStart = cursor - Math.floor(contentSlots / 2);
	const start = Math.min(Math.max(centeredStart, minStart), maxStart);
	const visible = lines.slice(start, start + contentSlots);
	return {
		lines: [
			...hasAbove ? [`… ${start} lines above`] : [],
			...visible,
			...hasBelow ? [`… ${lines.length - (start + contentSlots)} lines below`] : []
		],
		caretLine: (hasAbove ? 1 : 0) + (cursor - start)
	};
}
/**
* 纯 TypeScript 输入行状态机：管理文本缓冲区、光标、历史、选区、undo/redo、
* 图片附件与 Vim 模式，零 React/Ink 依赖。按键经 handleKey 进入，
* 状态变化通过构造时注入的回调通知外部。
*/
var InputLine = class {
	_value;
	_cursor;
	_placeholder;
	_history;
	_historyIdx;
	_vimEnabled;
	_vimMode;
	_maxLength;
	/** 图片附件 data URL 列表 */
	_images = [];
	/** Grapheme 边界缓存（按 value 失效）。光标移动不改 value，命中缓存省去 O(n) 分段。 */
	_graphemeCache = null;
	onChangeCallback;
	onSubmitCallback;
	onTabCompleteCallback;
	onImagesChangeCallback;
	/** undo 栈（改前快照）。submit 后清空——上一条输入的文本不得被下一条撤销复活。 */
	_undoStack = [];
	/** 栈内快照滞留的总字符数（配合 UNDO_TOTAL_CHARS_MAX 防护内存长尾）。 */
	_undoChars = 0;
	/** redo 栈（undo 目标态快照）。任何新编辑（recordUndo）清空——redo 分支失效。 */
	_redoStack = [];
	_redoChars = 0;
	/** 当前未封口单元 kind（仅 insert-word 参与合并）。 */
	_undoOpen = null;
	/** 合并继续时光标应处的位置（插入点右缘）；不符即封口。 */
	_undoExpectCursor = -1;
	/** 翻历史前的在输草稿（P1-2 shell 式往返恢复）。 */
	_draft = null;
	/** 折叠粘贴原文旁路：标记序号 → 原文。提交时展开还原（expandPastes）。 */
	_pastes = /* @__PURE__ */ new Map();
	_pasteSeq = 0;
	/** 选区锚点（shift+方向键设定）；null = 无选区。选区 = [min(anchor,cursor), max)。 */
	_selAnchor = null;
	/** vim visual linewise 标记（V 进入时为 true，v 进入/退出 visual 时复位）。 */
	_visualLineWise = false;
	/** 内部剪贴板（Alt+Y yank / vim p）；系统剪贴板经 OSC52（_clipboardOut → app drain）。 */
	_clipboard = "";
	/** 待 app 写出 OSC52 的剪贴文本（takeClipboardOut 取走后清空）。 */
	_clipboardOut = null;
	/** ghost 预览文本（slash 菜单选中命令的补全剩余/参数占位）；null = 不显示。 */
	_ghost = null;
	constructor(options = {}) {
		this._value = options.value ?? "";
		this._cursor = this._value.length;
		this._placeholder = options.placeholder ?? "";
		this._history = options.history ?? [];
		this._historyIdx = -1;
		this._vimEnabled = options.vimEnabled ?? false;
		this._vimMode = "insert";
		this._maxLength = options.maxLength ?? 1e5;
		this._images = options.images ?? [];
		if (options.onChange !== void 0) this.onChangeCallback = options.onChange;
		if (options.onSubmit !== void 0) this.onSubmitCallback = options.onSubmit;
		if (options.onTabComplete !== void 0) this.onTabCompleteCallback = options.onTabComplete;
		if (options.onImagesChange !== void 0) this.onImagesChangeCallback = options.onImagesChange;
	}
	/** 当前文本值。 */
	get value() {
		return this._value;
	}
	/** 光标位置（buffer code-unit 偏移）。 */
	get cursor() {
		return this._cursor;
	}
	/** 当前 Vim 模式（vimEnabled 为 false 时恒为 insert）。 */
	get vimMode() {
		return this._vimMode;
	}
	/** Vim 键位是否启用。 */
	get vimEnabled() {
		return this._vimEnabled;
	}
	/** 占位符文本（value 为空时显示）。 */
	get placeholder() {
		return this._placeholder;
	}
	/** 图片附件 data URL 列表（防御性拷贝）。 */
	get images() {
		return [...this._images];
	}
	/**
	* 启用/停用 vim 键位。停用或启用时都复位到 insert 模式，避免残留 normal 态吞字符。
	* @param enabled - 是否启用 vim 键位
	*/
	setVimEnabled(enabled) {
		this._vimEnabled = enabled;
		this._vimMode = "insert";
		this._visualLineWise = false;
	}
	/** visual 模式是否为 linewise（V 进入；charwise v 为 false）。渲染 `-- VISUAL LINE --` 用。 */
	get visualLineWise() {
		return this._vimMode === "visual" && this._visualLineWise;
	}
	/**
	* 多行渲染：返回输入框的显示行数组。
	* - 空值时显示 placeholder（首行）
	* - 光标行以 `❯ ` 前缀标识（高亮行），其余行缩进对齐
	* - 光标位置以 `█` 标记
	* - 当 maxWidth 给出时，长逻辑行按显示宽度软换行，避免前文被水平视窗遮盖。
	*   maxLines 仍按光标所在视觉行裁剪，保证正在编辑的位置始终可见。
	* @param options - 视窗裁剪参数（maxLines/maxWidth）
	* @returns 输入框显示行数组
	*/
	displayLines(options = {}) {
		return this.displayLinesWithCaret(options).lines;
	}
	/**
	* displayLines + 光标 cell 坐标（2026-07-23 IME 硬件光标归位）。
	*
	* 返回的 caret 是「█ 左侧」在显示行内的位置：line 为返回数组下标，
	* col 为 0-based cell 数（含 `❯ ` 前缀，按 ambiguousAsWide 口径度量，
	* 与 renderInputRow/rowsForLine 同尺）。调用方把硬件光标搬到该行该列，
	* 终端 IME 候选窗即锚定在输入框内（自绘 █ 终端不可见）。
	* @param options - 视窗裁剪参数（maxLines/maxWidth）
	* @returns 显示行数组 + 光标 cell 坐标（line 为数组下标，col 为 0-based cell）
	*/
	displayLinesWithCaret(options = {}) {
		const ambiguousAsWide = ambiguousWideEnabled();
		const prefixWidth = inputDisplayWidth("❯ ", ambiguousAsWide);
		if (!this._value) return {
			lines: [`❯ █${this._placeholder}`],
			caret: {
				line: 0,
				col: prefixWidth
			}
		};
		const ghostActive = this._ghost !== null && this._ghost !== "" && this._cursor === this._value.length && this.selectionRange === null;
		const before = this._value.slice(0, this._cursor);
		const cursorLine = before.split("\n").length - 1;
		const cursorCol = before.length - (before.lastIndexOf("\n") + 1);
		if (options.maxWidth !== void 0) {
			const wrapped = wrapInputLines(this._value, this._cursor, options.maxWidth, this.selectionRange);
			const view = viewportWithCaret(wrapped.lines, wrapped.cursorLine, options.maxLines);
			if (ghostActive) {
				const lines = [...view.lines];
				const cursorLineText = lines[view.caretLine];
				if (cursorLineText !== void 0) lines[view.caretLine] = insertGhost(cursorLineText, wrapped.cursorCol + 1, this._ghost ?? "", options.maxWidth);
				return {
					lines,
					caret: {
						line: view.caretLine,
						col: wrapped.cursorCol
					}
				};
			}
			return {
				lines: view.lines,
				caret: {
					line: view.caretLine,
					col: wrapped.cursorCol
				}
			};
		}
		const ghostSuffix = ghostActive ? `${GHOST_DIM_OPEN}${this._ghost}${GHOST_DIM_CLOSE}` : "";
		const view = viewportWithCaret(this._value.split("\n").map((line, i) => {
			const isCursorLine = i === cursorLine;
			const prefix = isCursorLine ? "❯ " : "  ";
			if (!isCursorLine) return `${prefix}${line}`;
			return `${prefix}${line.slice(0, cursorCol)}${`█${line.slice(cursorCol)}${ghostSuffix}`}`;
		}), cursorLine, options.maxLines);
		const col = prefixWidth + inputDisplayWidth(before.slice(before.lastIndexOf("\n") + 1), ambiguousAsWide);
		return {
			lines: view.lines,
			caret: {
				line: view.caretLine,
				col
			}
		};
	}
	/**
	* 设置 ghost 预览文本（显示在光标后、dim 色；不影响值/光标/宽度计算）。
	* 幂等：相同文本不触发重渲染状态变化。
	* @param text - ghost 文本；null 关闭。
	*/
	setGhost(text) {
		this._ghost = text;
	}
	/**
	* 设置值（外部更新用）。覆盖式写入（粘贴/补全/审批填充等）记为独立 undo 单元。
	* @param value - 新文本值（超过 maxLength 截断）
	* @param cursor - 新光标位置（钳到值长度内）；缺省置于末尾
	*/
	setValue(value, cursor) {
		this.recordUndo("replace");
		this._value = value.slice(0, this._maxLength);
		this._cursor = cursor !== void 0 ? Math.min(cursor, this._value.length) : this._value.length;
		this.onChangeCallback?.(this._value, this._cursor);
	}
	/**
	* 追加文本到末尾，光标移到追加内容之后。
	* @param text - 要追加的文本
	*/
	append(text) {
		this.setValue(this._value + text, this._value.length + text.length);
	}
	/**
	* 在光标处插入文本（用于 bracketed paste），光标移动到插入内容之后。
	* 命中折叠阈值的长粘贴收纳为原子标记 `[paste #N +M lines]`（原文旁路存储）。
	* @param text - 要插入的文本；空串为 no-op
	*/
	insertText(text) {
		if (!text) return;
		const lineCount = text.split("\n").length;
		if (lineCount > PASTE_FOLD_MIN_LINES || text.length > PASTE_FOLD_MIN_CHARS) {
			const id = ++this._pasteSeq;
			this._pastes.set(id, text);
			const marker = `[paste #${id} +${lineCount} lines]`;
			this.insertText(marker);
			return;
		}
		const before = this._value.slice(0, this._cursor);
		const after = this._value.slice(this._cursor);
		const next = (before + text + after).slice(0, this._maxLength);
		const cursor = Math.min(before.length + text.length, next.length);
		this.setValue(next, cursor);
	}
	/**
	* 提交前把折叠粘贴标记还原为原文（用户手输的同名标记无原文则原样保留）。
	* @param text - 可能含粘贴标记的文本
	* @returns 标记展开后的文本
	*/
	expandPastes(text) {
		if (this._pastes.size === 0) return text;
		return text.replace(PASTE_MARKER_RE, (m, id) => this._pastes.get(Number(id)) ?? m);
	}
	/**
	* 添加图片附件（data URL）。
	* @param dataUrl - 图片 data URL
	*/
	addImage(dataUrl) {
		this._images.push(dataUrl);
		this.onImagesChangeCallback?.([...this._images]);
	}
	/**
	* 移除指定索引的图片附件；越界索引为 no-op。
	* @param index - 要移除的附件下标
	*/
	removeImage(index) {
		if (index < 0 || index >= this._images.length) return;
		this._images.splice(index, 1);
		this.onImagesChangeCallback?.([...this._images]);
	}
	/** 清空图片附件。 */
	clearImages() {
		if (this._images.length === 0) return;
		this._images = [];
		this.onImagesChangeCallback?.([]);
	}
	/**
	* 图片占位摘要，用于 ANSI 渲染。
	* @param maxWidth - 摘要最大宽度；超宽时截断加省略号
	* @returns 摘要行数组；无附件时为空数组
	*/
	imageSummary(maxWidth) {
		if (this._images.length === 0) return [];
		const label = `📎 ${this._images.length} image${this._images.length > 1 ? "s" : ""}`;
		if (!maxWidth || label.length <= maxWidth) return [label];
		return [label.slice(0, maxWidth - 1) + "…"];
	}
	/**
	* 设置历史记录（最新的在前，供上下键导航）。
	* @param history - 历史条目列表
	*/
	setHistory(history) {
		this._history = history;
	}
	/** 选区范围（start<end，buffer code-unit 偏移）；无选区或锚点=光标时 null。
	*  vim visual linewise（V）时对齐整行：start=起始行行首，end=结束行行尾——
	*  删除/复制/高亮自动行级化。 */
	get selectionRange() {
		if (this._selAnchor === null || this._selAnchor === this._cursor) return null;
		let start = Math.min(this._selAnchor, this._cursor);
		let end = Math.max(this._selAnchor, this._cursor);
		if (this._vimMode === "visual" && this._visualLineWise) {
			start = this._value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
			const nl = this._value.indexOf("\n", end);
			end = nl === -1 ? this._value.length : nl + 1;
		}
		return {
			start,
			end
		};
	}
	/**
	* 取走待 OSC52 写出的剪贴文本（app 渲染循环 drain），取走后清空。
	* @returns 待写出的剪贴文本；无待写内容时为 null
	*/
	takeClipboardOut() {
		const t = this._clipboardOut;
		this._clipboardOut = null;
		return t;
	}
	collapseSelection() {
		this._selAnchor = null;
	}
	/** Shift+←/→/Home/End：锚定（首次）并移动光标扩展选区。 */
	extendSelection(name) {
		if (this._selAnchor === null) this._selAnchor = this._cursor;
		this.sealUndo();
		switch (name) {
			case "left":
				this._cursor = this.prevGrapheme();
				break;
			case "right":
				this._cursor = this.nextGrapheme();
				break;
			case "home":
				this._cursor = 0;
				break;
			case "end":
				this._cursor = this._value.length;
				break;
		}
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	/** Backspace/Delete（有选区）：删除选区（独立 undo 单元）。 */
	deleteSelection() {
		const r = this.selectionRange;
		if (!r) return null;
		this.recordUndo("delete");
		this._value = this._value.slice(0, r.start) + this._value.slice(r.end);
		this._cursor = r.start;
		this.collapseSelection();
		this.onChangeCallback?.(this._value, this._cursor);
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	/** Ctrl+K（有选区）：剪切选区 → 内部剪贴板 + OSC52 drain。 */
	cutSelection() {
		const r = this.selectionRange;
		if (!r) return null;
		this._clipboard = this._value.slice(r.start, r.end);
		this._clipboardOut = this._clipboard;
		return this.deleteSelection();
	}
	/** Alt+W：复制选区 → 内部剪贴板 + OSC52 drain（不删除，复制后折叠选区）。 */
	copySelection() {
		const r = this.selectionRange;
		if (!r) return null;
		this._clipboard = this._value.slice(r.start, r.end);
		this._clipboardOut = this._clipboard;
		this.collapseSelection();
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	/** Alt+Y：yank 内部剪贴板（直插不走粘贴折叠；setValue 记 undo）。 */
	yankClipboard() {
		if (!this._clipboard) return null;
		const before = this._value.slice(0, this._cursor);
		const after = this._value.slice(this._cursor);
		this.setValue(before + this._clipboard + after, before.length + this._clipboard.length);
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	/**
	* 处理按键：按全局键 → 选区 → vim 模式 → insert 模式的优先级路由。
	* @param name - 按键语义名称（InputHandler 的 KeyName）
	* @param char - 可打印字符；控制键为 ''
	* @param ctrl - Ctrl 是否按下
	* @param meta - Alt/Meta 是否按下
	* @param shift - Shift 是否按下
	* @returns 产生的事件（change/submit/tab/history）；按键未引起变化时为 null
	*/
	handleKey(name, char, ctrl, meta, shift = false) {
		if (name === "return" && (shift || meta)) return this.insertChar("\n");
		if (name === "return") {
			if (this._value.slice(0, this._cursor).endsWith("\\")) {
				this.recordUndo("replace");
				const before = this._value.slice(0, this._cursor - 1);
				const after = this._value.slice(this._cursor);
				this._value = before + "\n" + after;
				this._cursor = before.length + 1;
				this.onChangeCallback?.(this._value, this._cursor);
				return {
					type: "change",
					value: this._value,
					cursor: this._cursor
				};
			}
			const submitted = this.expandPastes(this._value);
			const submittedImages = [...this._images];
			this.clearAfterSubmit();
			this.onImagesChangeCallback?.([]);
			this.onSubmitCallback?.(submitted, submittedImages);
			return {
				type: "submit",
				value: submitted,
				images: submittedImages
			};
		}
		if (name === "ctrl_j") return this.insertChar("\n");
		if (name === "tab" && !ctrl) {
			this.onTabCompleteCallback?.();
			return { type: "tab" };
		}
		if (this._vimEnabled && this._vimMode === "visual") return this.handleVimVisual(name, char, ctrl);
		if (shift && !ctrl && !meta && (name === "left" || name === "right" || name === "home" || name === "end")) return this.extendSelection(name);
		if (meta && char === "w") return this.copySelection();
		if (meta && char === "y") return this.yankClipboard();
		if (ctrl && name === "ctrl_k" && this.selectionRange) return this.cutSelection();
		if (!ctrl && !meta && (name === "backspace" || name === "delete") && this.selectionRange) return this.deleteSelection();
		this.collapseSelection();
		if (this._vimEnabled && this._vimMode === "normal") return this.handleVimNormal(name, char, ctrl);
		if (meta) switch (name) {
			case "left": return this.moveWordLeft();
			case "right": return this.moveWordRight();
			case "backspace": return this.deleteWordBack();
			case "delete": return this.deleteWordForward();
			default: return null;
		}
		switch (name) {
			case "escape":
				if (this._vimEnabled) {
					this.sealUndo();
					this._vimMode = "normal";
					return {
						type: "change",
						value: this._value,
						cursor: this._cursor
					};
				}
				break;
			case "backspace":
			case "ctrl_h": return this.backspace();
			case "delete": return this.deleteForward();
			case "left": return this.moveLeft();
			case "right": return this.moveRight();
			case "home": return this.moveHome();
			case "end": return this.moveEnd();
			case "up": return this.moveUpOrHistory();
			case "down": return this.moveDownOrHistory();
			default: break;
		}
		if (ctrl) {
			switch (name) {
				case "ctrl_a": return this.moveHome();
				case "ctrl_e": return this.moveEnd();
				case "ctrl_u": return this.deleteToStart();
				case "ctrl_k": return this.deleteToEnd();
				case "ctrl_w": return this.deleteWordBack();
				case "ctrl_d": return this.deleteForward();
				case "ctrl_b": return this.moveLeft();
				case "ctrl_f": return this.moveRight();
				case "ctrl_n": return this.historyNext();
				case "ctrl_p": return this.historyPrev();
				case "ctrl_minus":
				case "ctrl_z": return this.undo();
				case "ctrl_y": return this.redo();
				default: break;
			}
			return null;
		}
		if (char && char.length > 0) return this.insertChar(char);
		return null;
	}
	/**
	* 改值前记录 undo 单元（改前快照）。仅 insert-word 在光标连续时合并
	* （不新增单元）；其余 kind 每次独立成元。kind 切换即自然封口。
	*/
	recordUndo(kind) {
		this._redoStack = [];
		this._redoChars = 0;
		if (!(kind === "insert-word" && this._undoOpen === kind && this._undoExpectCursor === this._cursor)) {
			this._undoStack.push({
				value: this._value,
				cursor: this._cursor,
				kind
			});
			this._undoChars += this._value.length;
			while (this._undoStack.length > UNDO_STACK_MAX || this._undoChars > UNDO_TOTAL_CHARS_MAX) {
				const dropped = this._undoStack.shift();
				if (!dropped) break;
				this._undoChars -= dropped.value.length;
			}
		}
		this._undoOpen = kind;
		this._undoExpectCursor = -1;
	}
	/** 纯光标移动/模式切换：封口袋前单元（不产生新单元）。 */
	sealUndo() {
		this._undoOpen = null;
		this._undoExpectCursor = -1;
	}
	/** fish 式撤销：弹出最近单元恢复 {value, cursor}。Ctrl+- / Ctrl+Z。 */
	undo() {
		const unit = this._undoStack.pop();
		this.sealUndo();
		if (!unit) return null;
		this._undoChars -= unit.value.length;
		this._redoStack.push({
			value: this._value,
			cursor: this._cursor,
			kind: unit.kind
		});
		this._redoChars += this._value.length;
		while (this._redoStack.length > UNDO_STACK_MAX || this._redoChars > UNDO_TOTAL_CHARS_MAX) {
			const dropped = this._redoStack.shift();
			if (!dropped) break;
			this._redoChars -= dropped.value.length;
		}
		this._value = unit.value;
		this._cursor = Math.min(unit.cursor, this._value.length);
		this.onChangeCallback?.(this._value, this._cursor);
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	/** 重做：恢复最近一次 undo 前的状态。Ctrl+Y。 */
	redo() {
		const unit = this._redoStack.pop();
		this.sealUndo();
		if (!unit) return null;
		this._redoChars -= unit.value.length;
		this._undoStack.push({
			value: this._value,
			cursor: this._cursor,
			kind: unit.kind
		});
		this._undoChars += this._value.length;
		this._value = unit.value;
		this._cursor = Math.min(unit.cursor, this._value.length);
		this.onChangeCallback?.(this._value, this._cursor);
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	/**
	* 提交后重置缓冲：清空文本、归零光标、复位历史游标、清空图片附件。
	* 不触发 onChangeCallback —— submit 路径自己负责后续渲染，
	* 避免在 submit 回调里又触发一次 change 渲染造成竞态。
	*/
	clearAfterSubmit() {
		this._value = "";
		this._cursor = 0;
		this._historyIdx = -1;
		this._images = [];
		this._undoStack = [];
		this._undoChars = 0;
		this._redoStack = [];
		this._redoChars = 0;
		this.sealUndo();
		this._draft = null;
		this._pastes.clear();
		this._selAnchor = null;
		this._visualLineWise = false;
	}
	insertChar(ch) {
		if (this._value.length >= this._maxLength) return null;
		const kind = classifyInsert(ch);
		this.recordUndo(kind);
		const before = this._value.slice(0, this._cursor);
		const after = this._value.slice(this._cursor);
		this._value = before + ch + after;
		this._cursor += ch.length;
		if (kind === "insert-word") this._undoExpectCursor = this._cursor;
		this.onChangeCallback?.(this._value, this._cursor);
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	backspace() {
		if (this._cursor <= 0) return null;
		this.recordUndo("delete");
		const left = this._value.slice(0, this._cursor);
		const mentionTail = left.match(/@(?:file|folder|symbol|codebase):(?:"[^"]+"|[^\s]+)\s?$/);
		const nextCh = this._value[this._cursor] ?? "";
		if (mentionTail && (nextCh === "" || /\s/.test(nextCh))) {
			const start = this._cursor - mentionTail[0].length;
			this._value = left.slice(0, start) + this._value.slice(this._cursor);
			this._cursor = start;
			this.onChangeCallback?.(this._value, this._cursor);
			return {
				type: "change",
				value: this._value,
				cursor: this._cursor
			};
		}
		const start = this.prevGrapheme();
		const before = this._value.slice(0, start);
		const after = this._value.slice(this._cursor);
		this._value = before + after;
		this._cursor = start;
		this.onChangeCallback?.(this._value, this._cursor);
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	deleteForward() {
		if (this._cursor >= this._value.length) return null;
		this.recordUndo("delete");
		const end = this.nextGrapheme();
		const before = this._value.slice(0, this._cursor);
		const after = this._value.slice(end);
		this._value = before + after;
		this.onChangeCallback?.(this._value, this._cursor);
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	deleteToStart() {
		if (this._cursor <= 0) return null;
		this.recordUndo("delete");
		this._value = this._value.slice(this._cursor);
		this._cursor = 0;
		this.onChangeCallback?.(this._value, this._cursor);
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	deleteToEnd() {
		if (this._cursor >= this._value.length) return null;
		this.recordUndo("delete");
		this._value = this._value.slice(0, this._cursor);
		this.onChangeCallback?.(this._value, this._cursor);
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	deleteWordBack() {
		if (this._cursor <= 0) return null;
		this.recordUndo("delete");
		const start = this.prevWordStart();
		const before = this._value.slice(0, start);
		const after = this._value.slice(this._cursor);
		this._value = before + after;
		this._cursor = start;
		this.onChangeCallback?.(this._value, this._cursor);
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	deleteWordForward() {
		if (this._cursor >= this._value.length) return null;
		this.recordUndo("delete");
		const end = this.nextWordEnd();
		const before = this._value.slice(0, this._cursor);
		const after = this._value.slice(end);
		this._value = before + after;
		this.onChangeCallback?.(this._value, this._cursor);
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	moveLeft() {
		if (this._cursor <= 0) return null;
		this.sealUndo();
		this._cursor = this.prevGrapheme();
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	moveRight() {
		if (this._cursor >= this._value.length) return null;
		this.sealUndo();
		this._cursor = this.nextGrapheme();
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	/** 光标左侧最近的 grapheme 边界。 */
	prevGrapheme() {
		if (this._cursor <= 0) return 0;
		return boundaryBefore(this.graphemeBounds(), this._cursor);
	}
	/** 光标右侧最近的 grapheme 边界。 */
	nextGrapheme() {
		if (this._cursor >= this._value.length) return this._value.length;
		const b = boundaryAfter(this.graphemeBounds(), this._cursor);
		return b < 0 ? this._value.length : b;
	}
	/** 当前 value 的 grapheme 边界（按 value 缓存，纯光标移动命中缓存）。
	*  折叠粘贴标记为原子单位：标记内部的边界被剔除，光标/删除整体越过。 */
	graphemeBounds() {
		if (this._graphemeCache?.value === this._value) return this._graphemeCache.bounds;
		let bounds = graphemeBoundaries(this._value);
		if (this._pastes.size > 0) bounds = atomicPasteMarkerBounds(this._value, bounds);
		this._graphemeCache = {
			value: this._value,
			bounds
		};
		return bounds;
	}
	moveHome() {
		if (this._cursor === 0) return null;
		this.sealUndo();
		this._cursor = 0;
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	moveEnd() {
		if (this._cursor === this._value.length) return null;
		this.sealUndo();
		this._cursor = this._value.length;
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	moveWordLeft() {
		const start = this.prevWordStart();
		if (start === this._cursor) return null;
		this.sealUndo();
		this._cursor = start;
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	moveWordRight() {
		const end = this.nextWordEnd();
		if (end === this._cursor || end >= this._value.length && this._cursor === this._value.length) return null;
		this.sealUndo();
		this._cursor = end;
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	/** 当前光标的（行,列），列以 code-unit 计。 */
	getLineCol(pos) {
		const parts = this._value.slice(0, pos).split("\n");
		const last = parts[parts.length - 1];
		return {
			line: parts.length - 1,
			col: last === void 0 ? 0 : last.length
		};
	}
	/** 由（行,列）还原 code-unit 偏移，col 超出行长则贴到行尾。 */
	posFromLineCol(line, col) {
		const lines = this._value.split("\n");
		const clampedLine = Math.max(0, Math.min(line, lines.length - 1));
		let pos = 0;
		for (let i = 0; i < clampedLine; i++) {
			const l = lines[i];
			if (l === void 0) break;
			pos += l.length + 1;
		}
		const last = lines[clampedLine];
		if (last !== void 0) pos += Math.min(col, last.length);
		return pos;
	}
	/** Up：多行且不在首行时上移一行，否则取上一条历史。 */
	moveUpOrHistory() {
		if (this._value.includes("\n")) {
			const { line, col } = this.getLineCol(this._cursor);
			if (line > 0) {
				this.sealUndo();
				this._cursor = this.posFromLineCol(line - 1, col);
				return {
					type: "change",
					value: this._value,
					cursor: this._cursor
				};
			}
			return null;
		}
		return this.historyPrev();
	}
	/** Down：多行时专注行间导航（末行原地停，不翻历史）；单行取下一条历史。 */
	moveDownOrHistory() {
		if (this._value.includes("\n")) {
			const { line, col } = this.getLineCol(this._cursor);
			if (line < this._value.split("\n").length - 1) {
				this.sealUndo();
				this._cursor = this.posFromLineCol(line + 1, col);
				return {
					type: "change",
					value: this._value,
					cursor: this._cursor
				};
			}
			return null;
		}
		return this.historyNext();
	}
	historyPrev() {
		if (this._history.length === 0) return null;
		this.recordUndo("replace");
		if (this._historyIdx === -1) {
			this._draft = this._value;
			this._historyIdx = 0;
		} else if (this._historyIdx < this._history.length - 1) this._historyIdx++;
		else {
			this.sealUndo();
			return null;
		}
		this._value = this._history[this._historyIdx] ?? "";
		this._cursor = this._value.length;
		this.onChangeCallback?.(this._value, this._cursor);
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	historyNext() {
		if (this._historyIdx < 0) return null;
		this.recordUndo("replace");
		if (this._historyIdx === 0) {
			this._historyIdx = -1;
			this._value = this._draft ?? "";
			this._draft = null;
		} else {
			this._historyIdx--;
			this._value = this._history[this._historyIdx] ?? "";
		}
		this._cursor = this._value.length;
		this.onChangeCallback?.(this._value, this._cursor);
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	handleVimNormal(name, _char, _ctrl) {
		switch (name) {
			case "escape": return null;
			case "return": {
				const submitted = this.expandPastes(this._value);
				const submittedImages = [...this._images];
				this.clearAfterSubmit();
				this.onImagesChangeCallback?.([]);
				this.onSubmitCallback?.(submitted, submittedImages);
				return {
					type: "submit",
					value: submitted,
					images: submittedImages
				};
			}
			case "left":
			case "ctrl_b": return this.moveLeft();
			case "right":
			case "ctrl_f": return this.moveRight();
			case "home": return this.moveHome();
			case "end": return this.moveEnd();
			case "up": return this.historyPrev();
			case "down": return this.historyNext();
			case "ctrl_minus":
			case "ctrl_z": return this.undo();
			case "ctrl_y": return this.redo();
			default:
				if (_char === "i") {
					this.sealUndo();
					this._vimMode = "insert";
					return {
						type: "change",
						value: this._value,
						cursor: this._cursor
					};
				}
				if (_char === "a") {
					this.sealUndo();
					this._cursor = Math.min(this._cursor + 1, this._value.length);
					this._vimMode = "insert";
					return {
						type: "change",
						value: this._value,
						cursor: this._cursor
					};
				}
				if (_char === "I") {
					this.sealUndo();
					this._cursor = 0;
					this._vimMode = "insert";
					return {
						type: "change",
						value: this._value,
						cursor: this._cursor
					};
				}
				if (_char === "A") {
					this.sealUndo();
					this._cursor = this._value.length;
					this._vimMode = "insert";
					return {
						type: "change",
						value: this._value,
						cursor: this._cursor
					};
				}
				if (_char === "x") return this.deleteForward();
				if (_char === "D") return this.deleteToEnd();
				if (_char === "0") return this.moveHome();
				if (_char === "$") return this.moveEnd();
				if (_char === "^") {
					this.sealUndo();
					this._cursor = this._value.search(/\S|$/);
					return {
						type: "change",
						value: this._value,
						cursor: this._cursor
					};
				}
				if (_char === "w") return this.moveWordRightVim();
				if (_char === "b") return this.moveWordLeft();
				if (_char === "v") {
					this.sealUndo();
					this._selAnchor = this._cursor;
					this._visualLineWise = false;
					this._vimMode = "visual";
					return {
						type: "change",
						value: this._value,
						cursor: this._cursor
					};
				}
				if (_char === "V") {
					this.sealUndo();
					this._selAnchor = this._cursor;
					this._visualLineWise = true;
					this._vimMode = "visual";
					return {
						type: "change",
						value: this._value,
						cursor: this._cursor
					};
				}
				if (_char === "p") return this.pasteClipboard(false);
				if (_char === "P") return this.pasteClipboard(true);
				return null;
		}
	}
	/** vim p/P：内部剪贴板插到光标后/前（charwise 直插，不走粘贴折叠）。 */
	pasteClipboard(before) {
		if (!this._clipboard) return null;
		const at = before ? this._cursor : Math.min(this._cursor + 1, this._value.length);
		const head = this._value.slice(0, at);
		const tail = this._value.slice(at);
		this.setValue(head + this._clipboard + tail, head.length + this._clipboard.length);
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
	/** visual：motion 扩展选区（选区渲染/linewise 对齐由 selectionRange 驱动）。 */
	handleVimVisual(name, _char, _ctrl) {
		switch (name) {
			case "escape":
				this.collapseSelection();
				this._visualLineWise = false;
				this._vimMode = "normal";
				return {
					type: "change",
					value: this._value,
					cursor: this._cursor
				};
			case "return": {
				const submitted = this.expandPastes(this._value);
				const submittedImages = [...this._images];
				this.clearAfterSubmit();
				this._visualLineWise = false;
				this._vimMode = "normal";
				this.onImagesChangeCallback?.([]);
				this.onSubmitCallback?.(submitted, submittedImages);
				return {
					type: "submit",
					value: submitted,
					images: submittedImages
				};
			}
			case "left":
				this._cursor = this.prevGrapheme();
				return {
					type: "change",
					value: this._value,
					cursor: this._cursor
				};
			case "right":
				this._cursor = this.nextGrapheme();
				return {
					type: "change",
					value: this._value,
					cursor: this._cursor
				};
			case "home":
				this._cursor = 0;
				return {
					type: "change",
					value: this._value,
					cursor: this._cursor
				};
			case "end":
				this._cursor = this._value.length;
				return {
					type: "change",
					value: this._value,
					cursor: this._cursor
				};
			case "up":
			case "down": {
				const { line, col } = this.getLineCol(this._cursor);
				const lastLine = this._value.split("\n").length - 1;
				const next = name === "up" ? Math.max(0, line - 1) : Math.min(lastLine, line + 1);
				this._cursor = this.posFromLineCol(next, col);
				return {
					type: "change",
					value: this._value,
					cursor: this._cursor
				};
			}
			case "backspace":
			case "delete": {
				const ev = this.cutSelection();
				this._vimMode = "normal";
				this._visualLineWise = false;
				return ev;
			}
			case "ctrl_minus":
			case "ctrl_z": return this.undo();
			case "ctrl_y": return this.redo();
			default:
				if (_char === "h") {
					this._cursor = this.prevGrapheme();
					return {
						type: "change",
						value: this._value,
						cursor: this._cursor
					};
				}
				if (_char === "l") {
					this._cursor = this.nextGrapheme();
					return {
						type: "change",
						value: this._value,
						cursor: this._cursor
					};
				}
				if (_char === "0") {
					this._cursor = 0;
					return {
						type: "change",
						value: this._value,
						cursor: this._cursor
					};
				}
				if (_char === "$") {
					this._cursor = this._value.length;
					return {
						type: "change",
						value: this._value,
						cursor: this._cursor
					};
				}
				if (_char === "^") {
					this._cursor = this._value.search(/\S|$/);
					return {
						type: "change",
						value: this._value,
						cursor: this._cursor
					};
				}
				if (_char === "w") return this.moveWordRightVim() ?? {
					type: "change",
					value: this._value,
					cursor: this._cursor
				};
				if (_char === "b") return this.moveWordLeft() ?? {
					type: "change",
					value: this._value,
					cursor: this._cursor
				};
				if (_char === "j" || _char === "k") return this.handleVimVisual(_char === "j" ? "down" : "up", _char, _ctrl);
				if (_char === "o") {
					if (this._selAnchor !== null) {
						const tmp = this._selAnchor;
						this._selAnchor = this._cursor;
						this._cursor = tmp;
					}
					return {
						type: "change",
						value: this._value,
						cursor: this._cursor
					};
				}
				if (_char === "d" || _char === "x") {
					const ev = this.cutSelection();
					this._vimMode = "normal";
					this._visualLineWise = false;
					return ev;
				}
				if (_char === "c") {
					const ev = this.cutSelection();
					this._vimMode = "insert";
					this._visualLineWise = false;
					return ev;
				}
				if (_char === "y") {
					const ev = this.copySelection();
					this._vimMode = "normal";
					this._visualLineWise = false;
					return ev;
				}
				if (_char === "v") {
					this.collapseSelection();
					this._visualLineWise = false;
					this._vimMode = "normal";
					return {
						type: "change",
						value: this._value,
						cursor: this._cursor
					};
				}
				return null;
		}
	}
	prevWordStart() {
		if (this._cursor <= 0) return 0;
		let i = this._cursor - 1;
		while (i > 0 && !/\w/.test(this._value[i] ?? "")) i--;
		while (i > 0 && /\w/.test(this._value[i - 1] ?? "")) i--;
		return i;
	}
	nextWordEnd() {
		if (this._cursor >= this._value.length) return this._value.length;
		let i = this._cursor;
		while (i < this._value.length && !/\w/.test(this._value[i] ?? "")) i++;
		if (i >= this._value.length) return this._cursor;
		while (i < this._value.length && /\w/.test(this._value[i] ?? "")) i++;
		return i;
	}
	/** Vim 'w' — move to start of next word (not end) */
	moveWordRightVim() {
		if (this._cursor >= this._value.length) return null;
		let i = this._cursor;
		while (i < this._value.length && /\w/.test(this._value[i] ?? "")) i++;
		while (i < this._value.length && !/\w/.test(this._value[i] ?? "")) i++;
		if (i === this._cursor) return null;
		this.sealUndo();
		this._cursor = i;
		return {
			type: "change",
			value: this._value,
			cursor: this._cursor
		};
	}
};
//#endregion
//#region lib/types/completion/file-completer.js
/**
* Adapted for the dsh-tui port seam (Apache License 2.0, section 4(b)):
* upstream source .rivet/tui-source/tui/file-completer.ts, Copyright
* 2025-2026 Tianshu Contributors, licensed under the Apache License, Version
* 2.0 (see LICENSE and NOTICE). Modified: relocated src/tui/ → src/completion/;
* `resolveFileCompletion` (Tab 协调入口) is dsh-owned, added for Phase 6.3.
*/
/**
* Tab 补全的 `@` 触发后从光标前最近 `@` 起的非空白 token。
* token 内的 emoji/CJK 不会被切碎——正则用 `[^\s]` 锁住空白边界，
* 让用户粘贴「@🎯 目标.md」或「@中文 路径.md」类带表情符号/中文的
* 路径请求走完整个 token，再交由 `getCompletions` 走 git ls-files 过滤。
* @param text - 输入框当前完整文本。
* @param cursorPos - 光标位置（token 只在光标前查找）。
* @returns `@` 后的 token（可为空串）；光标前无 `@` token 时为 null。
*/
function extractAtToken(text, cursorPos) {
	return text.slice(0, cursorPos).match(/@([^\s]*)$/)?.[1] ?? null;
}
const GIT_LS_FILES_TIMEOUT_MS = 500;
/**
* 走 `git ls-files` 拿补全候选（前缀命中优先，其次短路径优先）。
*
* 非 git 目录 / 命令失败 / 超时 → 静默返回 []，**不抛错**：
* @-补全是输入便利功能，不应污染主流程；上层也只把候选列表当作
* 「建议」，空候选就当普通 @-token 提交给 agent。
* @param partial - 已输入的路径片段（大小写不敏感子串匹配）。
* @param cwd - git 仓库工作目录。
* @param limit - 候选上限。
* @param timeoutMs - git ls-files 超时毫秒数（缺省 500ms，见上方权衡）。
* @returns 匹配的仓库相对路径列表；失败/超时静默返回 []。
*/
function getCompletions(partial, cwd, limit, timeoutMs = GIT_LS_FILES_TIMEOUT_MS) {
	try {
		const output = execSync("git ls-files --cached --others --exclude-standard", {
			cwd,
			encoding: "utf-8",
			timeout: timeoutMs,
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			],
			windowsHide: true
		});
		const lower = partial.toLowerCase();
		return output.trim().split(/\r?\n/).filter(Boolean).filter((f) => f.toLowerCase().includes(lower)).sort((a, b) => {
			return (a.toLowerCase().startsWith(lower) ? 0 : 1) - (b.toLowerCase().startsWith(lower) ? 0 : 1) || a.length - b.length;
		}).slice(0, limit);
	} catch {
		return [];
	}
}
/**
* 把选中的候选回填到输入：光标前最近 `@` 起替换为规范形 `@file:` 引用
* （含空格路径加引号），并附一个尾随空格。
* @param text - 输入框当前完整文本。
* @param cursorPos - 光标位置。
* @param completion - 选中的仓库相对路径。
* @returns 回填后的文本与新光标位置（落在尾随空格之后）。
*/
function applyCompletion(text, cursorPos, completion) {
	const before = text.slice(0, cursorPos);
	const after = text.slice(cursorPos);
	const atIdx = before.lastIndexOf("@");
	const mention = completion.includes(" ") ? `@file:"${completion}" ` : `@file:${completion} `;
	return {
		text: before.slice(0, atIdx) + mention + after,
		cursor: atIdx + mention.length
	};
}
/**
* dsh 新增（Phase 6.3）：Tab 补全协调入口。
*
* 仅当光标前存在 `@` 路径 token（路径片段，可含 / . emoji/CJK）时才接管
* Tab：返回 token 与候选；无 token 或无候选返回 null，Tab 保持原行为。
* 与 slash 轮协调：slash 分支在输入以 `/` 开头时优先，@ token 条件天然
* 隔离二者，互不重叠。
* @param input - 输入框当前完整文本。
* @param cursor - 光标位置。
* @param cwd - git 仓库工作目录。
* @param limit - 候选上限（缺省 8）。
* @param timeoutMs - git ls-files 超时（缺省 500ms，产品即时性权衡）；
*   测试/慢速环境可显式放宽。
* @returns token 与候选列表；无 token 或无候选时为 null（Tab 保持原行为）。
*/
function resolveFileCompletion(input, cursor, cwd, limit = 8, timeoutMs = GIT_LS_FILES_TIMEOUT_MS) {
	const token = extractAtToken(input, cursor);
	if (token === null) return null;
	const candidates = getCompletions(token, cwd, limit, timeoutMs);
	if (candidates.length === 0) return null;
	return {
		token,
		candidates
	};
}
//#endregion
//#region lib/types/engine/input-controller.js
/** MRU 列表长度上限（超出丢弃最旧）。 */
const SLASH_MRU_MAX = 10;
/**
* Input state manager — holds the 6 input-related state fields extracted from
* TuiApp (W-B5). Input event handling (onAnyKey, onSubmit), key routing, slash
* command processing, and tab completion logic stay in TuiApp; this class only
* manages the state values.
*/
var InputController = class {
	/** slash 命令列表（外部注入，提示 + Tab 补全用） */
	slashCommands = [];
	/** slash hint 当前选中项索引（输入以 / 开头时，Tab 补全目标） */
	slashSelectedIdx = 0;
	/** slash 命令菜单状态（输入变化经 refreshSlash 更新；app.ts 渲染与键路由消费）。 */
	slashMenu = {
		open: false,
		query: "",
		matches: [],
		selected: 0
	};
	/** 最近使用命令名（最新在前，上限 SLASH_MRU_MAX；匹配排序 MRU 优先）。 */
	slashMru = [];
	/** 光标前 @ token 的文件补全状态（Tab 循环）；null = 未在补全中。 */
	fileCompletion = null;
	/**
	* 记录一次命令执行（MRU 排序数据源）：去重前移、超上限截断尾部。
	* @param name - 命令名（不含 / 前缀）。
	*/
	recordSlashUse(name) {
		this.slashMru = [name, ...this.slashMru.filter((n) => n !== name)].slice(0, 10);
	}
	/**
	* 输入变化时刷新 slash 菜单：
	* - 完整命令名 + 尾空格（参数模式，如 `/theme `）且命令带 argsHint → 菜单
	*   保持打开显示该命令，输入行 ghost 提示参数占位（app.ts 消费）。
	* - 以 / 开头且有匹配命令 → 打开并保持选择（carry：query 不变时按命令名
	*   找回选中项）；无匹配或非 / 输入 → 关闭。
	* @param value - 输入行当前文本。
	*/
	refreshSlash(value) {
		if (!value.startsWith("/")) {
			this.closeSlash();
			return;
		}
		const query = value.slice(1);
		const argMatch = /^(\S+) $/.exec(query);
		if (argMatch !== null) {
			const cmdName = argMatch[1];
			const cmd = this.slashCommands.find((c) => c.name === cmdName);
			if (cmd !== void 0 && cmd.argsHint !== void 0) {
				this.slashMenu = {
					open: true,
					query,
					matches: [cmd],
					selected: 0
				};
				return;
			}
		}
		const prev = this.slashMenu;
		const matches = this.suggestMatches(query);
		if (matches.length === 0) {
			this.closeSlash();
			return;
		}
		this.slashMenu = {
			open: true,
			query,
			matches,
			selected: prev.open && prev.query === query ? this.carrySelection(prev, matches) : 0
		};
	}
	/** 关闭 slash 菜单（保持 matches 供渲染兜底，open 置 false）。 */
	closeSlash() {
		this.slashMenu.open = false;
	}
	/**
	* 移动菜单选择（↑↓；环绕）。
	* @param delta - 步长（-1 / +1）。
	*/
	moveSlashSelection(delta) {
		const m = this.slashMenu;
		if (!m.open || m.matches.length === 0) return;
		m.selected = (m.selected + delta + m.matches.length) % m.matches.length;
	}
	/**
	* 滚动菜单选择（PageUp/Down；两端 clamp 不环绕）。
	* @param delta - 步长（±maxRows 由调用方给定）。
	*/
	scrollSlashSelection(delta) {
		const m = this.slashMenu;
		if (!m.open || m.matches.length === 0) return;
		m.selected = Math.max(0, Math.min(m.matches.length - 1, m.selected + delta));
	}
	/**
	* 匹配：前缀优先 + 子串兜底（均按注册顺序稳定排序）。
	* @param query - 去 / 前缀的查询（空串 = 全量列表）。
	* @returns 匹配条目。
	*/
	suggestMatches(query) {
		const rank = this.mruRank();
		const sortByMru = (entries) => [...entries].sort((a, b) => (rank.get(b.name) ?? 0) - (rank.get(a.name) ?? 0));
		if (query === "") return sortByMru(this.slashCommands);
		const q = query.toLowerCase();
		const prefix = [];
		const substring = [];
		for (const c of this.slashCommands) {
			const name = c.name.toLowerCase();
			if (name.startsWith(q)) prefix.push(c);
			else if (name.includes(q)) substring.push(c);
		}
		return [...sortByMru(prefix), ...sortByMru(substring)];
	}
	/** MRU 排名表：最近使用得分最高（未使用 0 分）。 */
	mruRank() {
		const rank = /* @__PURE__ */ new Map();
		for (let i = 0; i < this.slashMru.length; i++) {
			const name = this.slashMru[i];
			/* v8 ignore next -- 循环内下标恒在界内；noUncheckedIndexedAccess 防御 */
			if (name === void 0) continue;
			rank.set(name, this.slashMru.length - i);
		}
		return rank;
	}
	/**
	* query 未变时按命令名找回上一选中项（输入变化不重置选择）。
	* @param prev - 上一菜单状态（open 且 query 相同）。
	* @param matches - 新匹配列表。
	* @returns 选中项下标（找不到回 0）。
	*/
	carrySelection(prev, matches) {
		const prevName = prev.matches[prev.selected]?.name;
		/* v8 ignore next -- open=true 时 matches 恒非空且 selected 由 move/scroll 钳制；防御分支 */
		if (prevName === void 0) return 0;
		const idx = matches.findIndex((m) => m.name === prevName);
		return idx >= 0 ? idx : 0;
	}
	/**
	* Tab 补全驱动（Phase 6.3）：首次 Tab 解析光标前 @ token 的候选并应用
	* 首项；再次 Tab 在候选间循环（唯一候选直接应用且不进入循环）。
	* 无 @ token 或无候选返回 null——Tab 保持原行为，由调用方决定是否消费。
	* @param value - 输入行当前文本。
	* @param cursor - 光标位置（code-unit 偏移）。
	* @param cwd - 补全基目录（git ls-files 执行目录）。
	* @param limit - 候选数量上限（默认 8）。
	* @param timeoutMs - git ls-files 超时（缺省 500ms 产品权衡；测试可放宽）。
	* @returns 要应用到输入行的 { text, cursor }；无可补全返回 null。
	*/
	tabComplete(value, cursor, cwd, limit = 8, timeoutMs) {
		if (this.fileCompletion !== null && this.fileCompletion.candidates.length > 1) {
			const fc = this.fileCompletion;
			fc.idx = (fc.idx + 1) % fc.candidates.length;
			const next = fc.candidates[fc.idx];
			/* v8 ignore next -- idx 取模后必在界内；守卫仅为 noUncheckedIndexedAccess 逃生 */
			if (next === void 0) return null;
			return applyCompletion(fc.baseText, fc.baseCursor, next);
		}
		const resolved = resolveFileCompletion(value, cursor, cwd, limit, timeoutMs);
		if (resolved === null) return null;
		this.fileCompletion = {
			baseText: value,
			baseCursor: cursor,
			candidates: resolved.candidates,
			idx: 0
		};
		const first = resolved.candidates[0];
		/* v8 ignore next -- resolveFileCompletion 保证 candidates 非空；守卫仅为 noUncheckedIndexedAccess 逃生 */
		if (first === void 0) return null;
		const applied = applyCompletion(value, cursor, first);
		if (resolved.candidates.length === 1) this.fileCompletion = null;
		return applied;
	}
	/** 输入历史（最新在前，submit 时更新 + 持久化） */
	inputHistory = [];
	/** Ctrl+C double-press window start timestamp (ms), 0 = inactive */
	ctrlCPendingSince = 0;
	/** ESC double-press: last ESC timestamp (ms), 0 = inactive */
	lastEscAt = 0;
};
//#endregion
//#region lib/types/engine/resize-handler.js
/**
* T9 ResizeHandler — 终端 resize 事件的防抖处理。
*
* trailing-edge debounce（默认 150ms）合并连发的 resize 事件，settle 后回调一次。
*
* **scrollback 不受影响的前提**：resize 时只重绘 live region；但终端会把已绘的
* live 内容按新宽度 reflow，其占用行数随之变化。LiveEngine.render()/clear() 内的
* reconcileWidth() 检测到宽度变化时按新宽从 lineCache 重算行数再相对回顶，
* 否则旧帧顶部会残留进 scrollback（多份不同宽度的 chrome/面板叠屏）。
* 这条 reflow 协调是 resize 正确性的关键 —— 改 LiveEngine 回顶逻辑时务必保留。
*
* **事件来源**：Node tty WriteStream 自身监听 SIGWINCH 并转成 'resize' 事件，
* 但在部分多路复用器（tmux/screen 某些配置）、CI/pty 等环境下该转发不生效，
* 收不到任何 resize 通知。故叠加一个低频轮询兜底（pollMs，默认 300ms），
* 比对 columns/rows 缓存值，变化即触发防抖回调。事件 + 轮询双保险，谁先到都行。
*/
/**
* 终端 resize 防抖处理器：'resize' 事件 + 低频轮询双来源，合并进同一条
* trailing-edge debounce 通道，settle 后尺寸确有变化才回调。用完调用 dispose()。
*/
var ResizeHandler = class {
	stdout;
	debounceMs;
	timer = null;
	callback = null;
	currentCols;
	currentRows;
	/** 轮询兜底定时器。 */
	pollTimer = null;
	constructor(options) {
		this.stdout = options.stdout;
		this.debounceMs = options.debounceMs ?? 150;
		this.currentCols = this.stdout.columns;
		this.currentRows = this.stdout.rows;
		const pollMs = options.pollMs ?? 300;
		if (pollMs > 0) {
			this.pollTimer = setInterval(() => {
				this.poll();
			}, pollMs);
			this.pollTimer.unref();
		}
	}
	/**
	* 注册 resize 回调。每个 ResizeHandler 只有一个回调。
	* 多次调用会替换之前的回调。
	* @param callback - 尺寸变化时调用的回调
	*/
	onResize(callback) {
		this.callback = callback;
		this.stdout.on("resize", this.handleResize);
	}
	/**
	* 获取当前终端尺寸（直读 stdout，不经防抖缓存）。
	* @returns 当前列数与行数
	*/
	getSize() {
		return {
			cols: this.stdout.columns,
			rows: this.stdout.rows
		};
	}
	/** 移除 resize 监听 */
	dispose() {
		this.stdout.removeListener("resize", this.handleResize);
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
		this.callback = null;
	}
	handleResize = () => {
		this.scheduleCallback();
	};
	/** 轮询兜底：尺寸变化时触发防抖（与事件来源共用同一条 debounce 通道）。 */
	poll() {
		const cols = this.stdout.columns;
		const rows = this.stdout.rows;
		if (cols !== this.currentCols || rows !== this.currentRows) this.scheduleCallback();
	}
	/** 防抖回调：settle 后比对尺寸，变化才通知 callback。 */
	scheduleCallback() {
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.timer = null;
			const cols = this.stdout.columns;
			const rows = this.stdout.rows;
			if (cols !== this.currentCols || rows !== this.currentRows) {
				this.currentCols = cols;
				this.currentRows = rows;
				this.callback?.(cols, rows);
			}
		}, this.debounceMs);
	}
};
//#endregion
//#region lib/types/block-stream-writer.js
const DEFAULT_CONFIG = {
	minChars: 100,
	maxChars: 200,
	idleMs: 180,
	maxBufferSize: 64 * 1024
};
/** 句末标点（中英文）。拆成数组用 lastIndexOf 逐个定位，避免逐字符 includes 的 O(n²)。 */
const SENTENCE_ENDS = [
	"。",
	"！",
	"？",
	".",
	"!",
	"?",
	"；",
	";"
];
/**
* 把流式文本按语义边界（段落 > 句末 > 空白）聚合成块再回调 onBlock：
* 达到 maxChars 强制切分，静默 idleMs 后冲刷剩余。缓冲受
* maxBufferSize 硬上限约束，peek() 可读未发出的活尾。
*/
var BlockStreamWriter = class {
	buffer = "";
	idleTimer = null;
	sending = Promise.resolve();
	config;
	onBlock;
	hasEmitted = false;
	constructor(config, onBlock) {
		this.config = {
			...DEFAULT_CONFIG,
			...config
		};
		this.onBlock = onBlock;
	}
	/**
	* 追加一段流式文本；达到切分条件时同步发出块。空串为 no-op。
	* @param chunk - 新到的文本片段。
	*/
	push(chunk) {
		if (!chunk) return;
		this.buffer += chunk;
		this.enforceBufferLimit();
		this.resetIdleTimer();
		this.checkEmit();
	}
	/** 立即把缓冲余量作为最后一块发出并等待发送完成；空缓冲为 no-op。 */
	async flush() {
		this.clearIdleTimer();
		if (!this.buffer) return;
		const text = this.buffer;
		this.buffer = "";
		this.enqueue(text);
		await this.sending;
	}
	/** Drop buffered text WITHOUT emitting. Used when a stale run never
	*  finalized (e.g. abort, maxTurns exhaustion) and a new run is starting —
	*  flushing here would paint the previous run's leftover text into the
	*  new run's output. */
	discard() {
		this.clearIdleTimer();
		this.buffer = "";
	}
	/**
	* The text received but not yet emitted as a block — i.e. the live tail.
	* Structurally bounded by maxChars/maxBufferSize, so it stays small enough
	* to render in the live region without exceeding the viewport (真凶②).
	* @returns 已接收但尚未成块发出的缓冲文本。
	*/
	peek() {
		return this.buffer;
	}
	resetIdleTimer() {
		this.clearIdleTimer();
		this.idleTimer = setTimeout(() => {
			this.flush().catch((error) => {
				console.error("BlockStreamWriter idle flush failed:", error);
			});
		}, this.config.idleMs);
	}
	clearIdleTimer() {
		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
	}
	checkEmit() {
		const minChars = this.hasEmitted ? this.config.minChars : 15;
		if (this.buffer.length < minChars) return;
		this.hasEmitted = true;
		if (this.buffer.length >= this.config.maxChars) {
			const pos = this.findBreakPoint(this.buffer, this.config.maxChars);
			const block = this.buffer.slice(0, pos);
			this.buffer = this.buffer.slice(pos);
			this.enqueue(block);
			if (this.buffer.length >= this.config.maxChars) this.checkEmit();
			return;
		}
		const paraIdx = this.buffer.lastIndexOf("\n\n");
		if (paraIdx !== -1 && paraIdx >= Math.floor(this.config.minChars * .5)) {
			const block = this.buffer.slice(0, paraIdx + 2);
			this.buffer = this.buffer.slice(paraIdx + 2);
			this.enqueue(block);
			return;
		}
		const sentIdx = this.findSentenceEnd(this.buffer);
		if (sentIdx !== -1) {
			const block = this.buffer.slice(0, sentIdx + 1);
			this.buffer = this.buffer.slice(sentIdx + 1);
			this.enqueue(block);
		}
	}
	enforceBufferLimit() {
		if (this.buffer.length <= this.config.maxBufferSize) return;
		while (this.buffer.length > this.config.maxBufferSize) {
			const pos = this.findBreakPoint(this.buffer, Math.min(this.config.maxChars, this.buffer.length));
			/* v8 ignore next 1 -- maxChars>0 时 findBreakPoint 恒返回 >0，Math.min 的 maxChars 分支结构性不可达 */
			const cut = pos > 0 ? pos : Math.min(this.config.maxChars > 0 ? this.config.maxChars : 1, this.buffer.length);
			const block = this.buffer.slice(0, cut);
			this.buffer = this.buffer.slice(cut);
			this.enqueue(block);
		}
	}
	findBreakPoint(text, maxPos) {
		const para = text.lastIndexOf("\n\n", maxPos);
		if (para !== -1 && para > Math.floor(maxPos * .3)) return para + 2;
		const nl = text.lastIndexOf("\n", maxPos);
		if (nl !== -1 && nl > Math.floor(maxPos * .3)) return nl + 1;
		const sp = text.lastIndexOf(" ", maxPos);
		if (sp !== -1 && sp > Math.floor(maxPos * .3)) return sp + 1;
		return maxPos;
	}
	findSentenceEnd(text) {
		let last = -1;
		for (const end of SENTENCE_ENDS) {
			const idx = text.lastIndexOf(end);
			if (idx > last) last = idx;
		}
		return last;
	}
	enqueue(text) {
		this.onBlock(text);
	}
};
//#endregion
//#region lib/types/format/hidden-lines.js
/**
* 长输出塌缩标记 —— 对标 Claude Code 的 `─── ✂ N lines hidden ───`。
*
* 此前各处自行拼字符串，同一语义出现过四种写法（`… +N more lines`、
* `… +N earlier lines`、`… +N 行`、`... N lines hidden ...`），用户在同一屏里
* 会看到不同形态的「还有内容没显示」。统一到一个可辨识的水平标记：它跨越整行、
* 带剪刀符，一眼能与正文区分开。
*/
/** 标记两侧的规则线长度（显示列）。 */
const RULE = 3;
/**
* 生成塌缩标记文本（不含颜色）。
*
* @param count 被隐藏的行数
* @param variant `hidden` 为中部省略，`earlier` 为上文省略（错误输出保留尾部时用）
* @returns 形如 `─── ✂ 已隐藏 N 行 ───` 的标记文本（ascii 轨用 `-`/`--`）。
*/
function hiddenLinesMarker(count, variant = "hidden") {
	const ascii = useAsciiGlyphs();
	const scissors = ascii ? "--" : "✂";
	const rule = (ascii ? "-" : "─").repeat(RULE);
	return `${rule} ${scissors} ${variant === "earlier" ? `已隐藏上文 ${count} 行` : `已隐藏 ${count} 行`} ${rule}`;
}
//#endregion
//#region lib/types/format/diff.js
/**
* 格式化函数 — diff 输出（基础版，直移 .rivet/tui-source/tui/format/diff.ts）。
*
* 源出 .rivet/tui-source/tui/format/diff.ts（Apache-2.0 来源，见
* LICENSE/NOTICE/SOURCE-MAP.md）。本文件与源保持一致（本地依赖
* hidden-lines.ts 已存在），未做裁剪。
*/
const DEFAULT_MAX_LINES$1 = 50;
/**
* 从 diff 文本提取统计：添加行数、删除行数、hunk 数。
* @param content - unified diff 文本（+++/--- 文件头不计入增删）。
* @returns adds/dels/hunks 计数。
*/
function computeDiffStats(content) {
	const lines = content.split("\n");
	let adds = 0;
	let dels = 0;
	let hunks = 0;
	for (const line of lines) {
		if (line.startsWith("@@")) {
			hunks++;
			continue;
		}
		if (line.startsWith("+") && !line.startsWith("+++")) {
			adds++;
			continue;
		}
		if (line.startsWith("-") && !line.startsWith("---")) {
			dels++;
			continue;
		}
	}
	return {
		adds,
		dels,
		hunks
	};
}
/**
* 启发式检测文本是否为 unified diff 内容。
* 前 20 行内计 diff 信号（diff --git / 文件头 / hunk 头）；有 hunk 头且
* 存在 +/- 行即判真，否则要求信号 ≥ 2。
* @param text - 待检测文本。
* @returns 判定为 diff 内容时 true。
*/
function isDiffContent(text) {
	let diffSignals = 0;
	let hasHunk = false;
	const lines = text.split("\n");
	for (const line of lines.slice(0, 20)) {
		if (!line) continue;
		if (/^diff --git/.test(line)) {
			diffSignals += 2;
			continue;
		}
		if (/^(---|\+\+\+)\s/.test(line)) {
			diffSignals++;
			continue;
		}
		if (/^@@[^@]+@@/.test(line)) {
			hasHunk = true;
			diffSignals++;
			continue;
		}
	}
	if (hasHunk && /^[-+]/m.test(text)) return true;
	return diffSignals >= 2;
}
/** 从 hunk 头解析起始行号。`@@ -a,b +c,d @@` → { old: a, new: c }。 */
function parseHunkStart(line) {
	const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
	if (!m) return null;
	return {
		old: Number(m[1]),
		new: Number(m[2])
	};
}
/**
* 为每一行计算行号 gutter 标签（不含着色）。
* 有 hunk 头才有行号语义：add/context 显示新文件行号，del 显示旧文件行号。
* 无 hunk 的裸 +/- 片段返回 null（不加 gutter）。
*/
function computeLineNumbers(allLines) {
	let oldNo = 0;
	let newNo = 0;
	let inHunk = false;
	let sawHunk = false;
	const labels = [];
	for (const line of allLines) {
		const type = classifyLine(line);
		if (type === "hunk") {
			const start = parseHunkStart(line);
			if (start) {
				oldNo = start.old;
				newNo = start.new;
				inHunk = true;
				sawHunk = true;
			}
			labels.push(null);
			continue;
		}
		if (!inHunk || type === "meta" || type === "header") {
			labels.push(null);
			continue;
		}
		if (type === "add") {
			labels.push(String(newNo));
			newNo++;
			continue;
		}
		if (type === "del") {
			labels.push(String(oldNo));
			oldNo++;
			continue;
		}
		labels.push(String(newNo));
		oldNo++;
		newNo++;
	}
	return sawHunk ? labels : null;
}
/**
* 格式化 diff 为 ANSI 行数组。
*
* 颜色映射：
* - 添加行 (+): theme.success (绿)
* - 删除行 (-): theme.error (红)
* - hunk header (@@): theme.secondary
* - 文件头 (---/+++): theme.warning
* - 上下文行: theme.muted
* - meta (diff --git 等): theme.dim
* @param input - diff 文本与可选行数上限（超限时头尾各留一半 + 隐藏标记）。
* @param theme - 当前主题。
* @returns ANSI 行数组：`diff: +N −M` 摘要头 + 染色内容行（有 hunk 时附行号 gutter）。
*/
function formatDiff(input, theme) {
	const maxLines = input.maxLines ?? DEFAULT_MAX_LINES$1;
	const allLines = input.content.split("\n");
	const stats = computeDiffStats(input.content);
	const lineNumbers = computeLineNumbers(allLines);
	const gutterWidth = lineNumbers ? Math.max(3, ...lineNumbers.filter((l) => l !== null).map((l) => l.length)) : 0;
	const truncated = allLines.length > maxLines;
	const headCount = Math.floor(maxLines / 2);
	const rows = allLines.map((line, i) => ({
		line,
		label: lineNumbers?.[i] ?? null
	}));
	const displayRows = truncated ? [
		...rows.slice(0, headCount),
		{
			line: hiddenLinesMarker(allLines.length - maxLines),
			label: null
		},
		...rows.slice(-headCount)
	] : rows;
	const lines = [];
	lines.push(color(`diff: +${stats.adds} −${stats.dels}${truncated ? ` (${allLines.length} total, showing ${maxLines})` : ""}`, theme.secondary));
	for (const row of displayRows) {
		const type = classifyLine(row.line);
		const lineColor = getDiffColor(type, theme);
		let rendered = color(row.line, lineColor);
		if (type === "header") {
			const filePath = extractHeaderPath(row.line);
			if (filePath) rendered = fileLink(rendered, filePath);
		}
		if (lineNumbers) {
			const gutter = color(`${(row.label ?? "").padStart(gutterWidth)}│`, theme.dim);
			lines.push(`${gutter}${rendered}`);
		} else lines.push(rendered);
	}
	return lines;
}
/** 从 ---/+++ 文件头提取路径（剥 a// b/ 前缀；/dev/null 与时间戳后缀跳过）。 */
function extractHeaderPath(line) {
	const m = /^(?:---|\+\+\+)\s+(.+)$/.exec(line);
	if (!m) return null;
	const group = m[1];
	/* v8 ignore next -- 正则 ^.+$ 匹配成功时捕获组必存在；noUncheckedIndexedAccess 收窄防御 */
	if (group === void 0) return null;
	/* v8 ignore next -- split('\t') 恒返回非空数组，?? 右侧不可达；noUncheckedIndexedAccess 收窄防御 */
	let p = group.split("	")[0] ?? "";
	p = p.trim();
	if (p === "/dev/null") return null;
	if (p.startsWith("a/") || p.startsWith("b/")) p = p.slice(2);
	return p || null;
}
function classifyLine(line) {
	if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("new ") || line.startsWith("old ") || line.startsWith("rename ") || line.startsWith("similarity ")) return "meta";
	if (line.startsWith("---") || line.startsWith("+++")) return "header";
	if (line.startsWith("@@")) return "hunk";
	if (line.startsWith("+")) return "add";
	if (line.startsWith("-")) return "del";
	return "context";
}
function getDiffColor(type, theme) {
	switch (type) {
		case "add": return theme.success;
		case "del": return theme.error;
		case "hunk": return theme.secondary;
		case "header": return theme.warning;
		case "meta": return theme.dim;
		case "context": return theme.muted;
	}
}
/**
* 单行 diff 分类 → 主题色。供 formatCodeBlock 渲染内嵌 diff 段复用，
* 与 formatDiff 的行分类着色保持一致（+ 绿 − 红 @@ 次色 头 warning）。
* @param line - 单行 diff 文本。
* @param theme - 当前主题。
* @returns 该行对应主题色。
*/
function diffLineColor(line, theme) {
	return getDiffColor(classifyLine(line), theme);
}
//#endregion
//#region lib/types/pi/latex-to-unicode.js
var _a;
function parseCssColorToRgb(spec) {
	const s = spec.trim();
	const hexMatch = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/u.exec(s);
	if (hexMatch) {
		const h = hexMatch[1] ?? "";
		if (h.length === 3) {
			const r = h[0] ?? "", g = h[1] ?? "", b = h[2] ?? "";
			return {
				r: parseInt(r + r, 16),
				g: parseInt(g + g, 16),
				b: parseInt(b + b, 16)
			};
		}
		return {
			r: parseInt(h.slice(0, 2), 16),
			g: parseInt(h.slice(2, 4), 16),
			b: parseInt(h.slice(4, 6), 16)
		};
	}
	const fnMatch = /^rgba?\(\s*([^)]+)\)$/i.exec(s);
	if (fnMatch) {
		const parts = (fnMatch[1] ?? "").split(/[,\s]+/).filter((p) => p.length > 0);
		if (parts.length >= 3) {
			const r = parseFloat(parts[0] ?? "");
			const g = parseFloat(parts[1] ?? "");
			const b = parseFloat(parts[2] ?? "");
			if ([
				r,
				g,
				b
			].every((v) => Number.isFinite(v))) return {
				r: clampByte(r),
				g: clampByte(g),
				b: clampByte(b)
			};
		}
	}
	return null;
}
function rgbToAnsi256({ r, g, b }) {
	if (r === g && g === b) {
		if (r < 8) return "\x1B[38;5;0m";
		if (r > 248) return "\x1B[38;5;15m";
		return `\x1b[38;5;${Math.round((r - 8) / 247 * 24) + 232}m`;
	}
	return `\x1b[38;5;${16 + 36 * Math.round(r / 51) + 6 * Math.round(g / 51) + Math.round(b / 51)}m`;
}
function rgbToAnsi16m({ r, g, b }) {
	return `\x1b[38;2;${r};${g};${b}m`;
}
function bunColorShim(spec, format) {
	const rgb = parseCssColorToRgb(spec);
	if (rgb === null) return null;
	if (format === "css") return spec;
	if (format === "{rgb}") return rgb;
	if (format === "ansi-256") return rgbToAnsi256(rgb);
	return rgbToAnsi16m(rgb);
}
const SUPERSCRIPT = {
	"0": "⁰",
	"1": "¹",
	"2": "²",
	"3": "³",
	"4": "⁴",
	"5": "⁵",
	"6": "⁶",
	"7": "⁷",
	"8": "⁸",
	"9": "⁹",
	"+": "⁺",
	"-": "⁻",
	"−": "⁻",
	"=": "⁼",
	"(": "⁽",
	")": "⁾",
	".": "·",
	" ": " ",
	a: "ᵃ",
	b: "ᵇ",
	c: "ᶜ",
	d: "ᵈ",
	e: "ᵉ",
	f: "ᶠ",
	g: "ᵍ",
	h: "ʰ",
	i: "ⁱ",
	j: "ʲ",
	k: "ᵏ",
	l: "ˡ",
	m: "ᵐ",
	n: "ⁿ",
	o: "ᵒ",
	p: "ᵖ",
	r: "ʳ",
	s: "ˢ",
	t: "ᵗ",
	u: "ᵘ",
	v: "ᵛ",
	w: "ʷ",
	x: "ˣ",
	y: "ʸ",
	z: "ᶻ",
	A: "ᴬ",
	B: "ᴮ",
	D: "ᴰ",
	E: "ᴱ",
	G: "ᴳ",
	H: "ᴴ",
	I: "ᴵ",
	J: "ᴶ",
	K: "ᴷ",
	L: "ᴸ",
	M: "ᴹ",
	N: "ᴺ",
	O: "ᴼ",
	P: "ᴾ",
	R: "ᴿ",
	T: "ᵀ",
	U: "ᵁ",
	V: "ⱽ",
	W: "ᵂ",
	α: "ᵅ",
	β: "ᵝ",
	γ: "ᵞ",
	δ: "ᵟ",
	ε: "ᵋ",
	θ: "ᶿ",
	ι: "ᶥ",
	φ: "ᵠ",
	χ: "ᵡ"
};
const SUBSCRIPT = {
	"0": "₀",
	"1": "₁",
	"2": "₂",
	"3": "₃",
	"4": "₄",
	"5": "₅",
	"6": "₆",
	"7": "₇",
	"8": "₈",
	"9": "₉",
	"+": "₊",
	"-": "₋",
	"−": "₋",
	"=": "₌",
	"(": "₍",
	")": "₎",
	" ": " ",
	a: "ₐ",
	e: "ₑ",
	h: "ₕ",
	i: "ᵢ",
	j: "ⱼ",
	k: "ₖ",
	l: "ₗ",
	m: "ₘ",
	n: "ₙ",
	o: "ₒ",
	p: "ₚ",
	r: "ᵣ",
	s: "ₛ",
	t: "ₜ",
	u: "ᵤ",
	v: "ᵥ",
	x: "ₓ",
	β: "ᵦ",
	γ: "ᵧ",
	ρ: "ᵨ",
	φ: "ᵩ",
	χ: "ᵪ"
};
const PRIMES = [
	"",
	"′",
	"″",
	"‴",
	"⁗"
];
const VULGAR = {
	"1/2": "½",
	"1/3": "⅓",
	"2/3": "⅔",
	"1/4": "¼",
	"3/4": "¾",
	"1/5": "⅕",
	"2/5": "⅖",
	"3/5": "⅗",
	"4/5": "⅘",
	"1/6": "⅙",
	"5/6": "⅚",
	"1/7": "⅐",
	"1/8": "⅛",
	"3/8": "⅜",
	"5/8": "⅝",
	"7/8": "⅞",
	"1/9": "⅑",
	"1/10": "⅒",
	"0/3": "↉"
};
const NOT_MAP = {
	"=": "≠",
	"<": "≮",
	">": "≯",
	"∈": "∉",
	"∋": "∌",
	"⊂": "⊄",
	"⊃": "⊅",
	"⊆": "⊈",
	"⊇": "⊉",
	"≡": "≢",
	"∃": "∄",
	"≤": "≰",
	"≥": "≱",
	"≈": "≉",
	"≅": "≇",
	"∼": "≁",
	"≃": "≄",
	"∣": "∤",
	"∥": "∦",
	"≺": "⊀",
	"≻": "⊁",
	"⊑": "⋢",
	"⊒": "⋣"
};
const ACCENTS = {
	hat: "̂",
	widehat: "̂",
	check: "̌",
	widecheck: "̌",
	tilde: "̃",
	widetilde: "̃",
	acute: "́",
	grave: "̀",
	dot: "̇",
	ddot: "̈",
	dddot: "⃛",
	ddddot: "⃜",
	breve: "̆",
	bar: "̄",
	vec: "⃗",
	overrightarrow: "⃗",
	overleftarrow: "⃖",
	mathring: "̊",
	overline: "̅",
	underline: "̲",
	underbar: "̲"
};
const FUNCTIONS = {
	sin: true,
	cos: true,
	tan: true,
	cot: true,
	sec: true,
	csc: true,
	sinh: true,
	cosh: true,
	tanh: true,
	coth: true,
	arcsin: true,
	arccos: true,
	arctan: true,
	arccot: true,
	arcsec: true,
	arccsc: true,
	sech: true,
	csch: true,
	ln: true,
	log: true,
	lg: true,
	exp: true,
	lim: true,
	limsup: true,
	liminf: true,
	max: true,
	min: true,
	sup: true,
	inf: true,
	det: true,
	dim: true,
	ker: true,
	hom: true,
	arg: true,
	deg: true,
	gcd: true,
	lcm: true,
	Pr: true,
	argmax: true,
	argmin: true,
	sgn: true,
	tr: true,
	rank: true,
	diag: true,
	var: true,
	cov: true,
	median: true,
	mod: true
};
const FONTS = {
	mathbf: "bold",
	boldsymbol: "bolditalic",
	bm: "bolditalic",
	pmb: "bold",
	mathbb: "doublestruck",
	Bbb: "doublestruck",
	mathds: "doublestruck",
	mathbbm: "doublestruck",
	mathcal: "script",
	mathscr: "boldscript",
	mathfrak: "fraktur",
	mathbfscr: "boldscript",
	mathbfcal: "boldscript",
	mathbffrak: "boldfraktur",
	mathfrakbold: "boldfraktur",
	mathsf: "sans",
	mathsfit: "sansitalic",
	mathsfbf: "sansbold",
	mathbfsf: "sansbold",
	mathsfbfit: "sansbolditalic",
	mathbfsfit: "sansbolditalic",
	mathtt: "mono",
	mathit: "italic",
	mathbfit: "bolditalic",
	textbf: "bold",
	textit: "italic",
	texttt: "mono",
	textsf: "sans"
};
const TEXT_COMMANDS = {
	text: true,
	textrm: true,
	textnormal: true,
	textup: true,
	textmd: true,
	textsc: true,
	textsl: true,
	emph: true,
	mathrm: true,
	mathnormal: true,
	mbox: true,
	hbox: true
};
const PLANES = {
	bold: {
		upper: 119808,
		lower: 119834,
		digit: 120782
	},
	italic: {
		upper: 119860,
		lower: 119886
	},
	bolditalic: {
		upper: 119912,
		lower: 119938
	},
	script: {
		upper: 119964,
		lower: 119990
	},
	boldscript: {
		upper: 120016,
		lower: 120042
	},
	fraktur: {
		upper: 120068,
		lower: 120094
	},
	doublestruck: {
		upper: 120120,
		lower: 120146,
		digit: 120792
	},
	boldfraktur: {
		upper: 120172,
		lower: 120198
	},
	sans: {
		upper: 120224,
		lower: 120250,
		digit: 120802
	},
	sansbold: {
		upper: 120276,
		lower: 120302,
		digit: 120812
	},
	sansitalic: {
		upper: 120328,
		lower: 120354
	},
	sansbolditalic: {
		upper: 120380,
		lower: 120406
	},
	mono: {
		upper: 120432,
		lower: 120458,
		digit: 120822
	}
};
const ALPHA_HOLES = {
	"italic:h": "ℎ",
	"script:B": "ℬ",
	"script:E": "ℰ",
	"script:F": "ℱ",
	"script:H": "ℋ",
	"script:I": "ℐ",
	"script:L": "ℒ",
	"script:M": "ℳ",
	"script:R": "ℛ",
	"script:e": "ℯ",
	"script:g": "ℊ",
	"script:o": "ℴ",
	"fraktur:C": "ℭ",
	"fraktur:H": "ℌ",
	"fraktur:I": "ℑ",
	"fraktur:R": "ℜ",
	"fraktur:Z": "ℨ",
	"doublestruck:C": "ℂ",
	"doublestruck:H": "ℍ",
	"doublestruck:N": "ℕ",
	"doublestruck:P": "ℙ",
	"doublestruck:Q": "ℚ",
	"doublestruck:R": "ℝ",
	"doublestruck:Z": "ℤ"
};
const ENV_DELIMS = {
	matrix: ["", ""],
	smallmatrix: ["", ""],
	array: ["", ""],
	tabular: ["", ""],
	pmatrix: ["(", ")"],
	bmatrix: ["[", "]"],
	Bmatrix: ["{", "}"],
	vmatrix: ["|", "|"],
	Vmatrix: ["‖", "‖"],
	cases: ["{", ""],
	"cases*": ["{", ""],
	dcases: ["{", ""],
	"dcases*": ["{", ""],
	rcases: ["", "}"],
	drcases: ["", "}"],
	aligned: ["", ""],
	"aligned*": ["", ""],
	alignedat: ["", ""],
	"alignedat*": ["", ""],
	align: ["", ""],
	"align*": ["", ""],
	alignat: ["", ""],
	"alignat*": ["", ""],
	split: ["", ""],
	gathered: ["", ""],
	equation: ["", ""],
	"equation*": ["", ""]
};
const SYMBOLS = {
	alpha: "α",
	beta: "β",
	gamma: "γ",
	delta: "δ",
	epsilon: "ϵ",
	varepsilon: "ε",
	zeta: "ζ",
	eta: "η",
	theta: "θ",
	vartheta: "ϑ",
	iota: "ι",
	kappa: "κ",
	varkappa: "ϰ",
	lambda: "λ",
	mu: "μ",
	nu: "ν",
	xi: "ξ",
	omicron: "ο",
	pi: "π",
	varpi: "ϖ",
	rho: "ρ",
	varrho: "ϱ",
	sigma: "σ",
	varsigma: "ς",
	tau: "τ",
	upsilon: "υ",
	phi: "ϕ",
	varphi: "φ",
	chi: "χ",
	psi: "ψ",
	omega: "ω",
	digamma: "ϝ",
	Gamma: "Γ",
	Delta: "Δ",
	Theta: "Θ",
	Lambda: "Λ",
	Xi: "Ξ",
	Pi: "Π",
	Sigma: "Σ",
	Upsilon: "Υ",
	Phi: "Φ",
	Psi: "Ψ",
	Omega: "Ω",
	sum: "∑",
	prod: "∏",
	coprod: "∐",
	int: "∫",
	iint: "∬",
	iiint: "∭",
	iiiint: "⨌",
	oint: "∮",
	oiint: "∯",
	oiiint: "∰",
	bigcap: "⋂",
	bigcup: "⋃",
	bigsqcup: "⨆",
	bigvee: "⋁",
	bigwedge: "⋀",
	bigodot: "⨀",
	bigoplus: "⨁",
	bigotimes: "⨂",
	biguplus: "⨄",
	Cap: "⋒",
	Cup: "⋓",
	bigstar: "★",
	pm: "±",
	mp: "∓",
	times: "×",
	div: "÷",
	ast: "∗",
	star: "⋆",
	circ: "∘",
	bullet: "∙",
	cdot: "⋅",
	cdotp: "·",
	centerdot: "·",
	cap: "∩",
	cup: "∪",
	uplus: "⊎",
	sqcap: "⊓",
	sqcup: "⊔",
	vee: "∨",
	wedge: "∧",
	land: "∧",
	lor: "∨",
	setminus: "∖",
	smallsetminus: "∖",
	wr: "≀",
	amalg: "⨿",
	diamond: "⋄",
	Diamond: "◇",
	bigtriangleup: "△",
	bigtriangledown: "▽",
	triangleleft: "◁",
	triangleright: "▷",
	lhd: "⊲",
	rhd: "⊳",
	unlhd: "⊴",
	unrhd: "⊵",
	oplus: "⊕",
	ominus: "⊖",
	otimes: "⊗",
	oslash: "⊘",
	odot: "⊙",
	dagger: "†",
	ddagger: "‡",
	boxplus: "⊞",
	boxtimes: "⊠",
	boxdot: "⊡",
	boxminus: "⊟",
	ltimes: "⋉",
	rtimes: "⋊",
	leftthreetimes: "⋋",
	rightthreetimes: "⋌",
	curlyvee: "⋎",
	curlywedge: "⋏",
	barwedge: "⊼",
	veebar: "⊻",
	doublebarwedge: "⩞",
	circledast: "⊛",
	circledcirc: "⊚",
	circleddash: "⊝",
	divideontimes: "⋇",
	dotplus: "∔",
	leq: "≤",
	le: "≤",
	geq: "≥",
	ge: "≥",
	ll: "≪",
	gg: "≫",
	neq: "≠",
	ne: "≠",
	equiv: "≡",
	doteq: "≐",
	sim: "∼",
	simeq: "≃",
	approx: "≈",
	approxeq: "≊",
	cong: "≅",
	propto: "∝",
	asymp: "≍",
	prec: "≺",
	succ: "≻",
	preceq: "⪯",
	succeq: "⪰",
	subset: "⊂",
	supset: "⊃",
	subseteq: "⊆",
	supseteq: "⊇",
	subsetneq: "⊊",
	supsetneq: "⊋",
	sqsubset: "⊏",
	sqsupset: "⊐",
	sqsubseteq: "⊑",
	sqsupseteq: "⊒",
	in: "∈",
	ni: "∋",
	owns: "∋",
	notin: "∉",
	mid: "∣",
	nmid: "∤",
	parallel: "∥",
	nparallel: "∦",
	perp: "⊥",
	vdash: "⊢",
	dashv: "⊣",
	models: "⊨",
	vDash: "⊨",
	Vdash: "⊩",
	bowtie: "⋈",
	smile: "⌣",
	frown: "⌢",
	between: "≬",
	lessgtr: "≶",
	gtrless: "≷",
	leqslant: "⩽",
	geqslant: "⩾",
	lesssim: "≲",
	gtrsim: "≳",
	lessapprox: "⪅",
	gtrapprox: "⪆",
	leqq: "≦",
	geqq: "≧",
	lneq: "⪇",
	gneq: "⪈",
	lneqq: "≨",
	gneqq: "≩",
	nleq: "≰",
	ngeq: "≱",
	nless: "≮",
	ngtr: "≯",
	nsubseteq: "⊈",
	nsupseteq: "⊉",
	nsim: "≁",
	ncong: "≇",
	triangleq: "≜",
	coloneqq: "≔",
	eqqcolon: "≕",
	risingdotseq: "≓",
	fallingdotseq: "≒",
	circeq: "≗",
	eqcirc: "≖",
	precsim: "≾",
	succsim: "≿",
	precapprox: "⪷",
	succapprox: "⪸",
	curlyeqprec: "⋞",
	curlyeqsucc: "⋟",
	Subset: "⋐",
	Supset: "⋑",
	subseteqq: "⫅",
	supseteqq: "⫆",
	subsetneqq: "⫋",
	supsetneqq: "⫌",
	Vvdash: "⊪",
	shortmid: "∣",
	shortparallel: "∥",
	pitchfork: "⋔",
	leftarrow: "←",
	gets: "←",
	rightarrow: "→",
	to: "→",
	leftrightarrow: "↔",
	Leftarrow: "⇐",
	Rightarrow: "⇒",
	Leftrightarrow: "⇔",
	uparrow: "↑",
	downarrow: "↓",
	updownarrow: "↕",
	Uparrow: "⇑",
	Downarrow: "⇓",
	Updownarrow: "⇕",
	mapsto: "↦",
	longmapsto: "⟼",
	hookleftarrow: "↩",
	hookrightarrow: "↪",
	leftharpoonup: "↼",
	rightharpoonup: "⇀",
	leftharpoondown: "↽",
	rightharpoondown: "⇁",
	rightleftharpoons: "⇌",
	longleftarrow: "⟵",
	longrightarrow: "⟶",
	longleftrightarrow: "⟷",
	Longleftarrow: "⟸",
	Longrightarrow: "⟹",
	Longleftrightarrow: "⟺",
	implies: "⟹",
	impliedby: "⟸",
	iff: "⟺",
	nearrow: "↗",
	searrow: "↘",
	swarrow: "↙",
	nwarrow: "↖",
	nleftarrow: "↚",
	nrightarrow: "↛",
	leadsto: "⇝",
	rightsquigarrow: "⇝",
	leftrightsquigarrow: "↭",
	twoheadrightarrow: "↠",
	twoheadleftarrow: "↞",
	leftrightharpoons: "⇋",
	rightleftarrows: "⇄",
	leftrightarrows: "⇆",
	leftleftarrows: "⇇",
	rightrightarrows: "⇉",
	upuparrows: "⇈",
	downdownarrows: "⇊",
	circlearrowleft: "↺",
	circlearrowright: "↻",
	curvearrowleft: "↶",
	curvearrowright: "↷",
	dashleftarrow: "⇠",
	dashrightarrow: "⇢",
	Lleftarrow: "⇚",
	Rrightarrow: "⇛",
	leftarrowtail: "↢",
	rightarrowtail: "↣",
	looparrowleft: "↫",
	looparrowright: "↬",
	multimap: "⊸",
	infty: "∞",
	partial: "∂",
	nabla: "∇",
	forall: "∀",
	exists: "∃",
	nexists: "∄",
	emptyset: "∅",
	varnothing: "∅",
	neg: "¬",
	lnot: "¬",
	top: "⊤",
	bot: "⊥",
	angle: "∠",
	measuredangle: "∡",
	sphericalangle: "∢",
	aleph: "ℵ",
	beth: "ℶ",
	gimel: "ℷ",
	daleth: "ℸ",
	hbar: "ℏ",
	hslash: "ℏ",
	ell: "ℓ",
	imath: "ı",
	jmath: "ȷ",
	wp: "℘",
	Re: "ℜ",
	Im: "ℑ",
	mho: "℧",
	complement: "∁",
	surd: "√",
	flat: "♭",
	natural: "♮",
	sharp: "♯",
	clubsuit: "♣",
	diamondsuit: "♦",
	heartsuit: "♥",
	spadesuit: "♠",
	clubs: "♣",
	diamonds: "♦",
	hearts: "♥",
	spades: "♠",
	therefore: "∴",
	because: "∵",
	checkmark: "✓",
	maltese: "✠",
	dag: "†",
	ddag: "‡",
	S: "§",
	P: "¶",
	copyright: "©",
	circledR: "®",
	pounds: "£",
	yen: "¥",
	euro: "€",
	degree: "°",
	prime: "′",
	backprime: "‵",
	colon: ":",
	semicolon: ";",
	neper: "₪",
	square: "□",
	Box: "□",
	blacksquare: "■",
	lozenge: "◊",
	blacklozenge: "⧫",
	triangle: "△",
	blacktriangle: "▴",
	blacktriangledown: "▾",
	blacktriangleleft: "◂",
	blacktriangleright: "▸",
	diagup: "╱",
	diagdown: "╲",
	backepsilon: "϶",
	Game: "⅁",
	eth: "ð",
	ldots: "…",
	dots: "…",
	cdots: "⋯",
	vdots: "⋮",
	ddots: "⋱",
	hdots: "…",
	mathellipsis: "…",
	dotsc: "…",
	dotsb: "⋯",
	dotsm: "⋯",
	dotsi: "⋯",
	langle: "⟨",
	rangle: "⟩",
	lceil: "⌈",
	rceil: "⌉",
	lfloor: "⌊",
	rfloor: "⌋",
	lbrace: "{",
	rbrace: "}",
	lbrack: "[",
	rbrack: "]",
	vert: "|",
	Vert: "‖",
	lvert: "|",
	rvert: "|",
	lVert: "‖",
	rVert: "‖",
	backslash: "\\",
	slash: "/",
	ulcorner: "⌜",
	urcorner: "⌝",
	llcorner: "⌞",
	lrcorner: "⌟",
	lmoustache: "⎰",
	rmoustache: "⎱",
	lgroup: "⟮",
	rgroup: "⟯",
	bracevert: "⎪",
	Reals: "ℝ",
	Complex: "ℂ",
	Natural: "ℕ",
	Integer: "ℤ",
	Rational: "ℚ"
};
/** Map every code point of `text` through `table`; null if any is unmappable. */
function mapAll(text, table) {
	let out = "";
	for (const ch of text) {
		const mapped = table[ch];
		if (mapped === void 0) return null;
		out += mapped;
	}
	return out;
}
/** Number of Unicode code points (not UTF-16 units) in `s`. */
function codePointLength(s) {
	let n = 0;
	for (const _ of s) n++;
	return n;
}
/** Style a single ASCII letter/digit via the math alphanumeric block. */
function styleAlnum(ch, style) {
	const hole = ALPHA_HOLES[`${style}:${ch}`];
	if (hole) return hole;
	const plane = PLANES[style];
	const code = ch.charCodeAt(0);
	if (code >= 65 && code <= 90) return String.fromCodePoint(plane.upper + (code - 65));
	if (code >= 97 && code <= 122) return String.fromCodePoint(plane.lower + (code - 97));
	if (code >= 48 && code <= 57 && plane.digit !== void 0) return String.fromCodePoint(plane.digit + (code - 48));
	return ch;
}
/** Identity, or math-alphanumeric styling when a font style is active. */
function styleChar(ch, style) {
	if (style === null) return ch;
	const code = ch.charCodeAt(0);
	return code >= 65 && code <= 90 || code >= 97 && code <= 122 || code >= 48 && code <= 57 ? styleAlnum(ch, style) : ch;
}
/** Append a combining mark after each non-space base glyph (accents/radicals). */
function applyCombining(text, mark) {
	let out = "";
	for (const ch of text) out += ch === " " ? ch : ch + mark;
	return out;
}
/** Light unescape for text-mode content (`\&` → `&`, `~` → space). */
function unescapeText(s) {
	return s.replace(/\\([&%$#_{}\s])/g, "$1").replace(/~/g, " ");
}
const ANSI_FG_RESET = "\x1B[39m";
const ANSI_BG_RESET = "\x1B[49m";
const LATEX_NAMED_COLORS = {
	black: "#000000",
	blue: "#0000ff",
	brown: "#a52a2a",
	cyan: "#00ffff",
	darkgray: "#404040",
	darkgrey: "#404040",
	gray: "#808080",
	green: "#00ff00",
	grey: "#808080",
	lightgray: "#c0c0c0",
	lightgrey: "#c0c0c0",
	lime: "#00ff00",
	magenta: "#ff00ff",
	olive: "#808000",
	orange: "#ffa500",
	pink: "#ffc0cb",
	purple: "#800080",
	red: "#ff0000",
	teal: "#008080",
	violet: "#ee82ee",
	white: "#ffffff",
	yellow: "#ffff00"
};
function colorFormat() {
	return "ansi-256";
}
function clamp01(n) {
	if (n <= 0) return 0;
	if (n >= 1) return 1;
	return n;
}
function clampByte(n) {
	if (n <= 0) return 0;
	if (n >= 255) return 255;
	return Math.round(n);
}
function cssRgb(rgb) {
	return `rgb(${clampByte(rgb.r)}, ${clampByte(rgb.g)}, ${clampByte(rgb.b)})`;
}
function parseNumber(raw) {
	const trimmed = raw.trim();
	if (trimmed === "") return null;
	const value = Number(trimmed.endsWith("%") ? Number(trimmed.slice(0, -1)) / 100 : trimmed);
	return Number.isFinite(value) ? value : null;
}
function parseColorComponents(spec, expected) {
	const parts = spec.split(/[,\s]+/u).map((part) => part.trim()).filter(Boolean);
	if (parts.length !== expected) return null;
	const values = [];
	for (const part of parts) {
		const value = parseNumber(part);
		if (value === null) return null;
		values.push(value);
	}
	return values;
}
function rgbFromUnit(values) {
	if (values.length !== 3) return null;
	return cssRgb({
		r: clamp01(values[0] ?? 0) * 255,
		g: clamp01(values[1] ?? 0) * 255,
		b: clamp01(values[2] ?? 0) * 255
	});
}
function rgbFromByte(values) {
	if (values.length !== 3) return null;
	return cssRgb({
		r: values[0] ?? 0,
		g: values[1] ?? 0,
		b: values[2] ?? 0
	});
}
function rgbFromCmyk(values) {
	if (values.length !== 4) return null;
	const c = clamp01(values[0] ?? 0);
	const m = clamp01(values[1] ?? 0);
	const y = clamp01(values[2] ?? 0);
	const k = clamp01(values[3] ?? 0);
	return cssRgb({
		r: 255 * (1 - c) * (1 - k),
		g: 255 * (1 - m) * (1 - k),
		b: 255 * (1 - y) * (1 - k)
	});
}
function rgbFromHsv(values, hueScale) {
	if (values.length !== 3) return null;
	const h = (values[0] ?? 0) * hueScale % 360 / 60;
	const s = clamp01(values[1] ?? 0);
	const v = clamp01(values[2] ?? 0);
	const c = v * s;
	const x = c * (1 - Math.abs(h % 2 - 1));
	const m = v - c;
	let r = 0;
	let g = 0;
	let b = 0;
	if (h < 1) {
		r = c;
		g = x;
	} else if (h < 2) {
		r = x;
		g = c;
	} else if (h < 3) {
		g = c;
		b = x;
	} else if (h < 4) {
		g = x;
		b = c;
	} else if (h < 5) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}
	return cssRgb({
		r: (r + m) * 255,
		g: (g + m) * 255,
		b: (b + m) * 255
	});
}
function rgbFromWave(spec) {
	const wavelength = parseNumber(spec);
	if (wavelength === null || wavelength < 380 || wavelength > 780) return null;
	let r = 0;
	let g = 0;
	let b = 0;
	if (wavelength < 440) {
		r = -(wavelength - 440) / 60;
		b = 1;
	} else if (wavelength < 490) {
		g = (wavelength - 440) / 50;
		b = 1;
	} else if (wavelength < 510) {
		g = 1;
		b = -(wavelength - 510) / 20;
	} else if (wavelength < 580) {
		r = (wavelength - 510) / 70;
		g = 1;
	} else if (wavelength < 645) {
		r = 1;
		g = -(wavelength - 645) / 65;
	} else r = 1;
	const factor = wavelength < 420 ? .3 + .7 * (wavelength - 380) / 40 : wavelength > 700 ? .3 + .7 * (780 - wavelength) / 80 : 1;
	return cssRgb({
		r: r * factor * 255,
		g: g * factor * 255,
		b: b * factor * 255
	});
}
function normalizeCssColor(spec, allowMix) {
	const trimmed = spec.trim();
	if (trimmed === "") return null;
	if (allowMix && trimmed.includes("!")) {
		const mixed = resolveMixedColor(trimmed);
		if (mixed !== null) return mixed;
	}
	const named = LATEX_NAMED_COLORS[trimmed] ?? LATEX_NAMED_COLORS[trimmed.toLowerCase()];
	if (named !== void 0) return named;
	if (bunColorShim(trimmed, "css") !== null) return trimmed;
	const lower = trimmed.toLowerCase();
	return lower !== trimmed && bunColorShim(lower, "css") !== null ? lower : null;
}
function resolveModeledColor(model, spec) {
	const trimmedModel = model.trim();
	if (trimmedModel === "" || trimmedModel === "named") return normalizeCssColor(spec, true);
	if (trimmedModel === "HTML" || trimmedModel === "Html" || trimmedModel === "html") {
		const hex = spec.trim().replace(/^#/u, "");
		return /^[0-9A-Fa-f]{3,8}$/u.test(hex) ? `#${hex}` : null;
	}
	if (trimmedModel === "wave") return rgbFromWave(spec);
	const lower = trimmedModel.toLowerCase();
	if (trimmedModel === "RGB") return rgbFromByte(parseColorComponents(spec, 3) ?? []);
	if (lower === "rgb") return rgbFromUnit(parseColorComponents(spec, 3) ?? []);
	if (lower === "cmyk") return rgbFromCmyk(parseColorComponents(spec, 4) ?? []);
	if (lower === "gray" || lower === "grey") {
		const value = parseColorComponents(spec, 1)?.[0];
		if (value === void 0) return null;
		const byte = clamp01(trimmedModel === "Gray" || trimmedModel === "Grey" ? value / 15 : value) * 255;
		return cssRgb({
			r: byte,
			g: byte,
			b: byte
		});
	}
	if (lower === "hsb" || lower === "hsv") {
		const values = parseColorComponents(spec, 3);
		if (values === null) return null;
		return rgbFromHsv(values, trimmedModel === "Hsb" || trimmedModel === "HSV" ? 1 : 360);
	}
	return normalizeCssColor(spec, true);
}
function resolveLatexColor(model, spec) {
	const unescaped = unescapeText(spec).trim();
	if (unescaped === "") return null;
	return model === null ? normalizeCssColor(unescaped, true) : resolveModeledColor(model, unescaped);
}
function resolveMixedColor(spec) {
	const parts = spec.split("!");
	if (parts.length < 2) return null;
	const first = normalizeCssColor(parts[0] ?? "", false);
	if (first === null) return null;
	let current = bunColorShim(first, "{rgb}");
	if (current === null) return null;
	for (let i = 1; i < parts.length; i += 2) {
		const percent = parseNumber(parts[i] ?? "");
		if (percent === null) return null;
		const nextColor = normalizeCssColor(parts[i + 1] ?? "white", false);
		if (nextColor === null) return null;
		const next = bunColorShim(nextColor, "{rgb}");
		if (next === null) return null;
		const t = clamp01(percent / 100);
		current = {
			r: current.r * t + next.r * (1 - t),
			g: current.g * t + next.g * (1 - t),
			b: current.b * t + next.b * (1 - t)
		};
	}
	return cssRgb(current);
}
function ansiColor(model, spec) {
	const css = resolveLatexColor(model, spec);
	if (css === null) return null;
	const foreground = bunColorShim(css, colorFormat());
	if (foreground === null || !foreground.startsWith("\x1B[38;")) return null;
	return {
		foreground,
		background: foreground.replace("\x1B[38;", "\x1B[48;")
	};
}
function restoreAnsi(text, fromForeground, toForeground, fromBackground, toBackground) {
	if (fromForeground !== toForeground && fromForeground !== null) text += toForeground ?? ANSI_FG_RESET;
	if (fromBackground !== toBackground && fromBackground !== null) text += toBackground ?? ANSI_BG_RESET;
	return text;
}
function toSuperscript(text, group) {
	if (text === "") return "";
	const mapped = mapAll(text, SUPERSCRIPT);
	if (mapped !== null) return mapped;
	return group ? `^(${text})` : `^${text}`;
}
function toSubscript(text, group) {
	if (text === "") return "";
	const mapped = mapAll(text, SUBSCRIPT);
	if (mapped !== null) return mapped;
	return group ? `_(${text})` : `_${text}`;
}
const BIG_DELIM = /^(?:[bB]igg?|[bB]igg?[lrm])$/;
const EXTENSIBLE_ARROWS = {
	xleftarrow: "←",
	xrightarrow: "→",
	xleftrightarrow: "↔",
	xLeftarrow: "⇐",
	xRightarrow: "⇒",
	xLeftrightarrow: "⇔",
	xhookleftarrow: "↩",
	xhookrightarrow: "↪",
	xtwoheadleftarrow: "↞",
	xtwoheadrightarrow: "↠",
	xmapsto: "↦",
	xrightharpoonup: "⇀",
	xrightharpoondown: "⇁",
	xleftharpoonup: "↼",
	xleftharpoondown: "↽",
	xrightleftharpoons: "⇌",
	xleftrightharpoons: "⇋"
};
var LatexParser = class {
	#s;
	#i = 0;
	#foreground = null;
	#background = null;
	constructor(src) {
		this.#s = src;
	}
	render() {
		return restoreAnsi(this.parse(null, false), this.#foreground, null, this.#background, null);
	}
	/** Parse a run until end-of-input, or until `}` when `stopAtBrace`. */
	parse(style, stopAtBrace) {
		let out = "";
		while (this.#i < this.#s.length) {
			if (this.#s[this.#i] === "}") {
				if (stopAtBrace) break;
				this.#i++;
				continue;
			}
			out += this.#node(style);
		}
		return out;
	}
	#node(style) {
		const c = this.#s[this.#i];
		if (c === void 0) return "";
		switch (c) {
			case "\\": return this.#command(style);
			case "{": return this.#group(style);
			case "^":
				this.#i++;
				return this.#script(style, true);
			case "_":
				this.#i++;
				return this.#script(style, false);
			case "$":
				this.#i++;
				return "";
			case "~":
				this.#i++;
				return " ";
			case "&":
				this.#i++;
				return "  ";
			case "'": {
				let k = 0;
				while (this.#s[this.#i] === "'") {
					k++;
					this.#i++;
				}
				return k <= 4 ? PRIMES[k] ?? "" : PRIMES[1].repeat(k);
			}
			case "%": {
				const nl = this.#s.indexOf("\n", this.#i);
				this.#i = nl === -1 ? this.#s.length : nl + 1;
				return "";
			}
			default:
				this.#i++;
				return styleChar(c, style);
		}
	}
	#command(style) {
		this.#i++;
		if (this.#i >= this.#s.length) return "";
		const c = this.#s[this.#i] ?? "";
		if (!/[A-Za-z]/.test(c)) {
			this.#i++;
			switch (c) {
				case "\\": return "\n";
				case "{":
				case "}":
				case "$":
				case "%":
				case "&":
				case "#":
				case "_":
				case " ":
				case ".": return c;
				case ",":
				case ":":
				case ";":
				case ">": return " ";
				case "!": return "";
				case "/": return "";
				case "|": return "‖";
				case "(":
				case ")":
				case "[":
				case "]": return "";
				default: return c;
			}
		}
		let name = "";
		while (this.#i < this.#s.length && /[A-Za-z]/.test(this.#s[this.#i] ?? "")) {
			name += this.#s[this.#i] ?? "";
			this.#i++;
		}
		if (this.#s[this.#i] === "*") this.#i++;
		return this.#applyCommand(name, style);
	}
	#applyCommand(name, style) {
		const font = FONTS[name];
		if (font) return this.#argument(font).text;
		if (TEXT_COMMANDS[name]) return unescapeText(this.#rawArgument());
		if (name === "operatorname") return unescapeText(this.#rawArgument()) + this.#spaceBeforeArg();
		const accent = ACCENTS[name];
		if (accent) return applyCombining(this.#argument(style).text, accent);
		if (name === "frac" || name === "dfrac" || name === "tfrac" || name === "cfrac") {
			const num = this.#argument(style);
			const den = this.#argument(style);
			return this.#fraction(num, den);
		}
		if (name === "genfrac") {
			const left = this.#argument(style).text;
			const right = this.#argument(style).text;
			this.#rawArgument();
			this.#rawArgument();
			const num = this.#argument(style);
			const den = this.#argument(style);
			return left + this.#fraction(num, den) + right;
		}
		if (name === "binom" || name === "dbinom" || name === "tbinom") {
			const n = this.#argument(style);
			const k = this.#argument(style);
			return `C(${n.text}, ${k.text})`;
		}
		if (name === "sqrt") return this.#sqrt(style);
		if (name === "not") {
			const arg = this.#argument(style);
			return NOT_MAP[arg.text] ?? applyCombining(arg.text, "̸");
		}
		if (name === "overset" || name === "stackrel") return this.#scriptedAbove(style);
		if (name === "underset") return this.#scriptedBelow(style);
		if (name === "prescript") return this.#prescript(style);
		const arrow = EXTENSIBLE_ARROWS[name];
		if (arrow !== void 0) return this.#extensibleArrow(style, arrow);
		if (name === "boxed" || name === "fbox") return `[${this.#argument(style).text}]`;
		if (name === "overbrace") return `⏞(${this.#argument(style).text})`;
		if (name === "underbrace") return `⏟(${this.#argument(style).text})`;
		if (name === "overbracket") return `⎴(${this.#argument(style).text})`;
		if (name === "underbracket") return `⎵(${this.#argument(style).text})`;
		if (name === "overparen") return `⏜(${this.#argument(style).text})`;
		if (name === "underparen") return `⏝(${this.#argument(style).text})`;
		if (name === "cancel") return applyCombining(this.#argument(style).text, "̸");
		if (name === "bcancel") return applyCombining(this.#argument(style).text, "⃥");
		if (name === "xcancel") return applyCombining(applyCombining(this.#argument(style).text, "̸"), "⃥");
		if (name === "sout") return applyCombining(this.#argument(style).text, "̶");
		if (name === "substack") return this.#argument(style).text.replace(NEWLINES, ",");
		if (name === "left" || name === "right" || name === "middle") return this.#delimiter(style);
		if (BIG_DELIM.test(name)) return this.#delimiter(style);
		if (name === "begin") return this.#environment(style);
		if (name === "end") {
			this.#rawArgument();
			return "";
		}
		if (name === "bmod") return " mod ";
		if (name === "pmod") return `(mod ${this.#argument(style).text})`;
		if (name === "pod") return `(${this.#argument(style).text})`;
		if (name === "tag") return `(${this.#argument(style).text})`;
		if (name === "label") {
			this.#rawArgument();
			return "";
		}
		if (name === "ref" || name === "eqref") return `(${unescapeText(this.#rawArgument())})`;
		if (name === "url") return unescapeText(this.#rawArgument());
		if (name === "href") {
			this.#rawArgument();
			return this.#argument(style).text;
		}
		if (name === "textcolor") return this.#scopedForeground(this.#readAnsiColor(), style);
		if (name === "colorbox") return this.#scopedBackground(this.#readAnsiColor(), style);
		if (name === "fcolorbox") return this.#fcolorbox(style);
		if (name === "color") return this.#setForeground();
		if (name === "normalcolor") {
			const previous = this.#foreground;
			this.#foreground = null;
			return previous === null ? "" : ANSI_FG_RESET;
		}
		if (name === "phantom" || name === "hphantom") return " ".repeat(codePointLength(this.#argument(style).text));
		if (name === "vphantom") {
			this.#argument(style);
			return "";
		}
		if (FUNCTIONS[name]) return name + this.#spaceBeforeArg();
		const symbol = SYMBOLS[name];
		if (symbol !== void 0) return symbol;
		switch (name) {
			case "displaystyle":
			case "textstyle":
			case "scriptstyle":
			case "scriptscriptstyle":
			case "limits":
			case "nolimits":
			case "nonumber":
			case "notag":
			case "quad": return name === "quad" ? "  " : "";
			case "qquad": return "    ";
			case "thinspace":
			case "enspace":
			case "medspace":
			case "thickspace":
			case "space": return " ";
			case "negthinspace":
			case "negmedspace":
			case "negthickspace": return "";
		}
		return name;
	}
	#group(style) {
		this.#i++;
		const outerForeground = this.#foreground;
		const outerBackground = this.#background;
		const inner = this.parse(style, true);
		const innerForeground = this.#foreground;
		const innerBackground = this.#background;
		if (this.#s[this.#i] === "}") this.#i++;
		this.#foreground = outerForeground;
		this.#background = outerBackground;
		return restoreAnsi(inner, innerForeground, outerForeground, innerBackground, outerBackground);
	}
	#readAnsiColor() {
		return ansiColor(this.#optionalRawArgument(), this.#rawArgument());
	}
	#setForeground() {
		const color = this.#readAnsiColor();
		if (color === null) return "";
		this.#foreground = color.foreground;
		return color.foreground;
	}
	#scopedForeground(color, style) {
		const outerForeground = this.#foreground;
		if (color === null) return this.#argument(style).text;
		this.#foreground = color.foreground;
		const arg = this.#argument(style).text;
		const innerForeground = this.#foreground;
		this.#foreground = outerForeground;
		return color.foreground + restoreAnsi(arg, innerForeground, outerForeground, this.#background, this.#background);
	}
	#scopedBackground(color, style) {
		const outerBackground = this.#background;
		if (color === null) return this.#argument(style).text;
		this.#background = color.background;
		const arg = this.#argument(style).text;
		const innerBackground = this.#background;
		this.#background = outerBackground;
		return color.background + restoreAnsi(arg, this.#foreground, this.#foreground, innerBackground, outerBackground);
	}
	#fcolorbox(style) {
		const frameModel = this.#optionalRawArgument();
		const frame = ansiColor(frameModel, this.#rawArgument());
		const background = ansiColor(this.#optionalRawArgument() ?? frameModel, this.#rawArgument());
		const body = this.#scopedBackground(background, style);
		if (frame === null) return `[${body}]`;
		return `${frame.foreground}[${this.#foreground ?? ANSI_FG_RESET}${body}${frame.foreground}]${this.#foreground ?? ANSI_FG_RESET}`;
	}
	/** Read one argument: a `{…}` group, a single command, or a single char. */
	#argument(style) {
		while (this.#s[this.#i] === " ") this.#i++;
		const c = this.#s[this.#i];
		if (c === void 0) return {
			text: "",
			group: false
		};
		if (c === "{") {
			this.#i++;
			const inner = this.parse(style, true);
			if (this.#s[this.#i] === "}") this.#i++;
			return {
				text: inner,
				group: true
			};
		}
		if (c === "\\") return {
			text: this.#command(style),
			group: false
		};
		if (c === "^" || c === "_") {
			this.#i++;
			return {
				text: this.#script(style, c === "^"),
				group: false
			};
		}
		this.#i++;
		return {
			text: styleChar(c, style),
			group: false
		};
	}
	/** Read a raw (unparsed) argument, returning its literal source text. */
	#rawArgument() {
		while (this.#s[this.#i] === " ") this.#i++;
		if (this.#s[this.#i] !== "{") {
			const c = this.#s[this.#i];
			if (c === void 0) return "";
			if (c === "\\") {
				let t = "\\";
				this.#i++;
				if (/[A-Za-z]/.test(this.#s[this.#i] ?? "")) while (/[A-Za-z]/.test(this.#s[this.#i] ?? "")) {
					t += this.#s[this.#i] ?? "";
					this.#i++;
				}
				else {
					t += this.#s[this.#i] ?? "";
					this.#i++;
				}
				return t;
			}
			this.#i++;
			return c;
		}
		this.#i++;
		let depth = 1;
		let out = "";
		while (this.#i < this.#s.length && depth > 0) {
			const c = this.#s[this.#i];
			if (c === "\\") {
				out += c + (this.#s[this.#i + 1] ?? "");
				this.#i += 2;
				continue;
			}
			if (c === "{") depth++;
			else if (c === "}") {
				depth--;
				if (depth === 0) {
					this.#i++;
					break;
				}
			}
			out += c ?? "";
			this.#i++;
		}
		return out;
	}
	#script(style, sup) {
		const arg = this.#argument(style);
		return sup ? toSuperscript(arg.text, arg.group) : toSubscript(arg.text, arg.group);
	}
	#wrapFrac(arg) {
		return arg.group && codePointLength(arg.text) > 1 ? `(${arg.text})` : arg.text;
	}
	#fraction(num, den) {
		const vulgar = VULGAR[`${num.text}/${den.text}`];
		if (vulgar) return vulgar;
		return `${this.#wrapFrac(num)}/${this.#wrapFrac(den)}`;
	}
	#scriptedAbove(style) {
		const above = this.#argument(style);
		return this.#argument(style).text + toSuperscript(above.text, true);
	}
	#scriptedBelow(style) {
		const below = this.#argument(style);
		return this.#argument(style).text + toSubscript(below.text, true);
	}
	#prescript(style) {
		const sup = this.#argument(style);
		const sub = this.#argument(style);
		const base = this.#argument(style);
		return toSuperscript(sup.text, true) + toSubscript(sub.text, true) + base.text;
	}
	#extensibleArrow(style, arrow) {
		const below = this.#optionalArgument(style);
		return arrow + toSuperscript(this.#argument(style).text, true) + (below ? toSubscript(below.text, true) : "");
	}
	#delimiter(style) {
		while (this.#s[this.#i] === " ") this.#i++;
		const c = this.#s[this.#i];
		if (c === void 0) return "";
		if (c === ".") {
			this.#i++;
			return "";
		}
		if (c !== "\\") {
			this.#i++;
			return styleChar(c, style);
		}
		this.#i++;
		if (this.#i >= this.#s.length) return "";
		const d = this.#s[this.#i] ?? "";
		if (!/[A-Za-z]/.test(d)) {
			this.#i++;
			switch (d) {
				case ".": return "";
				case "{": return "{";
				case "}": return "}";
				case "|": return "‖";
				default: return d;
			}
		}
		let name = "";
		while (this.#i < this.#s.length && /[A-Za-z]/.test(this.#s[this.#i] ?? "")) {
			name += this.#s[this.#i] ?? "";
			this.#i++;
		}
		return SYMBOLS[name] ?? name;
	}
	#optionalArgument(style) {
		const source = this.#optionalRawArgument();
		if (source === null) return null;
		return {
			text: new _a(source).parse(style, false),
			group: true
		};
	}
	#optionalRawArgument() {
		while (this.#s[this.#i] === " ") this.#i++;
		if (this.#s[this.#i] !== "[") return null;
		this.#i++;
		let bracketDepth = 1;
		let braceDepth = 0;
		let out = "";
		while (this.#i < this.#s.length && bracketDepth > 0) {
			const c = this.#s[this.#i];
			if (c === "\\") {
				out += c + (this.#s[this.#i + 1] ?? "");
				this.#i += 2;
				continue;
			}
			if (c === "{") braceDepth++;
			else if (c === "}" && braceDepth > 0) braceDepth--;
			else if (braceDepth === 0 && c === "[") bracketDepth++;
			else if (braceDepth === 0 && c === "]") {
				bracketDepth--;
				if (bracketDepth === 0) {
					this.#i++;
					break;
				}
			}
			out += c ?? "";
			this.#i++;
		}
		return out;
	}
	#sqrt(style) {
		while (this.#s[this.#i] === " ") this.#i++;
		let radical = "√";
		const index = this.#optionalArgument(style)?.text;
		if (index !== void 0) radical = index === "2" ? "√" : index === "3" ? "∛" : index === "4" ? "∜" : `${toSuperscript(index, true)}√`;
		const radicand = this.#argument(style).text;
		return radical + (codePointLength(radicand) > 1 ? `(${radicand})` : radicand);
	}
	#environment(style) {
		const env = this.#rawArgument().trim();
		if (env === "array" || env === "tabular" || env === "array*" || env === "tabular*" || env === "alignedat" || env === "alignedat*" || env === "alignat" || env === "alignat*" || env === "gatheredat") {
			this.#optionalRawArgument();
			if (this.#s[this.#i] === "{") this.#rawArgument();
		}
		let body = "";
		while (this.#i < this.#s.length) {
			if (this.#s.startsWith("\\end", this.#i)) {
				this.#i += 4;
				this.#rawArgument();
				break;
			}
			body += this.#node(style);
		}
		body = body.trim();
		if (env === "cases" || env === "cases*" || env === "dcases" || env === "dcases*" || env === "rcases" || env === "drcases") body = body.replace(/[ \t]*\n+[ \t]*/g, "; ").replace(/ {3,}/g, "  ");
		const delims = ENV_DELIMS[env];
		return delims ? delims[0] + body + delims[1] : body;
	}
	/** A separator space when the next glyph is alphanumeric or a command. */
	#spaceBeforeArg() {
		const c = this.#s[this.#i];
		if (c === void 0) return "";
		return /[A-Za-z0-9\\]/.test(c) ? " " : "";
	}
};
_a = LatexParser;
/**
* Convert a bare LaTeX math fragment (no surrounding `$`/`\(` delimiters) to its
* best-effort Unicode rendering. Unknown commands degrade to their bare name;
* `\\` becomes a newline. Always returns a string (never throws).
* @param src - 不带定界符的 LaTeX 数学片段。
* @returns 尽力而为的 Unicode 渲染结果；空串或非字符串输入原样返回。
*/
function latexToUnicode(src) {
	if (typeof src !== "string" || src.length === 0) return src;
	return new LatexParser(src).render();
}
const NEWLINES = /\n+/g;
const BARE_MATH_LINE_COMMAND = /\\(?:operatorname|frac|dfrac|tfrac|cfrac|genfrac|sqrt|sum|prod|coprod|int|iint|iiint|lim|alpha|beta|gamma|delta|epsilon|varepsilon|theta|lambda|mu|sigma|phi|varphi|pi|omega|infty|partial|nabla|forall|exists|mathbb|mathcal|mathscr|mathbf|mathrm|left|right|begin|phantom|hphantom|vphantom|cdots|ldots|dots|to|rightarrow|leftarrow|leq|geq|neq|times|cdot|overline|underline|vec|hat|bar|textcolor|color|normalcolor|colorbox|fcolorbox)\b/;
const BARE_MATH_ENVIRONMENTS = new Set([
	"matrix",
	"smallmatrix",
	"pmatrix",
	"bmatrix",
	"Bmatrix",
	"vmatrix",
	"Vmatrix",
	"cases",
	"dcases",
	"rcases",
	"drcases",
	"aligned",
	"alignedat",
	"align",
	"alignat",
	"split",
	"gathered",
	"gatheredat",
	"gather",
	"multline",
	"equation",
	"eqnarray",
	"array",
	"subarray"
]);
/**
* True when `env` is a math environment safe to auto-render without `$`/`\[`
* delimiters. The trailing `*` of starred variants (`align*`, `equation*`) is
* ignored; text-mode environments (`tabular`, `itemize`, …) return false.
* @param env - `\begin{…}` 中的环境名（可带尾部 `*`）。
* @returns 属于可裸渲染数学环境时为 true。
*/
function isBareMathEnvironment(env) {
	return BARE_MATH_ENVIRONMENTS.has(env.endsWith("*") ? env.slice(0, -1) : env);
}
function renderBareMathInText(text) {
	let out = "";
	let i = 0;
	for (;;) {
		const begin = text.indexOf("\\begin{", i);
		if (begin === -1) return out + renderBareMathLines(text.slice(i));
		const envStart = begin + 7;
		const envEnd = text.indexOf("}", envStart);
		if (envEnd === -1) return out + renderBareMathLines(text.slice(i));
		const env = text.slice(envStart, envEnd);
		const closeToken = `\\end{${env}}`;
		const close = text.indexOf(closeToken, envEnd + 1);
		if (close === -1) {
			out += renderBareMathLines(text.slice(i, envEnd + 1));
			i = envEnd + 1;
			continue;
		}
		const blockEnd = close + closeToken.length;
		if (!isBareMathEnvironment(env)) {
			out += renderBareMathLines(text.slice(i, begin)) + text.slice(begin, blockEnd);
			i = blockEnd;
			continue;
		}
		const lineStart = text.lastIndexOf("\n", begin - 1) + 1;
		const prefix = text.slice(lineStart, begin);
		let start = prefix.includes("\\") || prefix.includes("=") ? lineStart : begin;
		if (start === begin && prefix.trim() === "" && lineStart > 0) {
			const previousLineEnd = lineStart - 1;
			const previousLineStart = text.lastIndexOf("\n", previousLineEnd - 1) + 1;
			const previousLine = text.slice(previousLineStart, previousLineEnd);
			if (/[=([{]\s*$/.test(previousLine)) start = previousLineStart;
		}
		out += renderBareMathLines(text.slice(i, start));
		out += latexToUnicode(text.slice(start, blockEnd)).replace(NEWLINES, " ");
		i = blockEnd;
	}
}
function renderBareMathLines(text) {
	let out = "";
	let lineStart = 0;
	for (let i = 0; i <= text.length; i++) {
		if (i !== text.length && text[i] !== "\n") continue;
		const line = text.slice(lineStart, i);
		out += shouldRenderBareMathLine(line) ? latexToUnicode(line).replace(NEWLINES, " ") : line;
		if (i !== text.length) out += "\n";
		lineStart = i + 1;
	}
	return out;
}
function shouldRenderBareMathLine(line) {
	const trimmed = line.trim();
	if (trimmed === "" || !trimmed.includes("\\")) return false;
	const env = /\\(?:begin|end)\{([^}]*)\}/.exec(trimmed);
	if (env && !isBareMathEnvironment(env[1] ?? "")) return false;
	if (!BARE_MATH_LINE_COMMAND.test(trimmed)) return false;
	return trimmed.startsWith("\\") || /[=<>^_{}&]/.test(trimmed);
}
/**
* Scan prose for math spans — `$$…$$`, `\[…\]` (display) and `$…$`, `\(…\)`
* (inline) — and replace each with its Unicode rendering, leaving everything
* else verbatim. Newlines inside a span collapse to spaces so the result stays
* single-line-safe.
*
* Inline `$…$` uses pandoc's anti-currency heuristics: the opener must not be
* followed by whitespace, the closer must not be preceded by whitespace nor
* followed by a digit, and `\$` is treated as a literal dollar — so "$5 and
* $10" is left untouched.
* @param text - 可能含数学 span 的原始 prose 文本。
* @returns 数学 span 就地替换为 Unicode 渲染后的文本；其余内容原样保留。
*/
function renderMathInText(text) {
	if (typeof text !== "string" || text.length === 0) return text;
	if (!text.includes("$") && !text.includes("\\(") && !text.includes("\\[") && !text.includes("\\begin") && !BARE_MATH_LINE_COMMAND.test(text)) return text;
	const conv = (inner) => latexToUnicode(inner).replace(NEWLINES, " ");
	let out = "";
	let i = 0;
	const n = text.length;
	while (i < n) {
		const c = text[i];
		if (c === "\\") {
			const d = text[i + 1];
			if (d === "\\") {
				out += "\\\\";
				i += 2;
				continue;
			}
			if (d === "(") {
				const close = text.indexOf("\\)", i + 2);
				if (close !== -1) {
					out += conv(text.slice(i + 2, close));
					i = close + 2;
					continue;
				}
			} else if (d === "[") {
				const close = text.indexOf("\\]", i + 2);
				if (close !== -1) {
					out += conv(text.slice(i + 2, close));
					i = close + 2;
					continue;
				}
			} else if (d === "$") {
				out += "$";
				i += 2;
				continue;
			}
			out += c;
			i++;
			continue;
		}
		if (c === "$") {
			if (text[i + 1] === "$") {
				const close = text.indexOf("$$", i + 2);
				if (close !== -1 && text.slice(i + 2, close).trim().length > 0) {
					out += conv(text.slice(i + 2, close));
					i = close + 2;
					continue;
				}
				out += "$$";
				i += 2;
				continue;
			}
			const close = inlineMathSpanEnd(text, i);
			if (close !== -1) {
				out += conv(text.slice(i + 1, close));
				i = close + 1;
				continue;
			}
			out += "$";
			i++;
			continue;
		}
		out += c ?? "";
		i++;
	}
	return renderBareMathInText(out);
}
/**
* Index of the `$` that closes an inline math span opened at `open` (the index
* of the opening `$`), or -1 when the run is not inline math. Applies pandoc's
* anti-currency heuristics: the opener must not be followed by whitespace, the
* closer must not be preceded by whitespace nor followed by a digit, `\$` is a
* literal dollar, and the span may not span a newline. Shared by
* `renderMathInText` and the markdown math tokenizer so the rule has one home.
* @param text - 被扫描的完整文本。
* @param open - 开头 `$` 在 `text` 中的索引。
* @returns 闭合 `$` 的索引；不构成行内数学 span 时返回 -1。
*/
function inlineMathSpanEnd(text, open) {
	const after = text[open + 1];
	if (after === void 0 || after === " " || after === "	" || after === "\n" || after === "$") return -1;
	for (let j = open + 1; j < text.length; j++) {
		const ch = text[j];
		if (ch === "\\") {
			j++;
			continue;
		}
		if (ch === "\n") return -1;
		if (ch === "$") {
			const prev = text[j - 1];
			if (prev === " " || prev === "	") return -1;
			const next = text[j + 1];
			if (next !== void 0 && next >= "0" && next <= "9") continue;
			return text.slice(open + 1, j).trim().length > 0 ? j : -1;
		}
	}
	return -1;
}
//#endregion
//#region lib/types/pi/latex-block.js
const BAR = "─";
const FRAC_COMMANDS = {
	frac: true,
	dfrac: true,
	tfrac: true,
	cfrac: true
};
const DISPLAY_ROW_ENVIRONMENTS = {
	equation: true,
	eqnarray: true,
	align: true,
	aligned: true,
	alignat: true,
	alignedat: true,
	flalign: true,
	split: true,
	gather: true,
	gathered: true,
	gatheredat: true,
	multline: true,
	displaymath: true,
	math: true
};
function spaces(n) {
	return n > 0 ? " ".repeat(n) : "";
}
/** Pad `line` on the right to `width` visible columns. */
function padRight(line, width) {
	return line + spaces(width - displayWidth(line));
}
/** Pad `line` symmetrically (left-biased) to `width` visible columns. */
function center$1(line, width) {
	const extra = width - displayWidth(line);
	if (extra <= 0) return line;
	const left = extra >> 1;
	return spaces(left) + line + spaces(extra - left);
}
/** A single rendered string (possibly multi-line) as a baseline-centered box. */
function textBox(text) {
	const raw = text.split("\n");
	let width = 0;
	for (const line of raw) width = Math.max(width, displayWidth(line));
	return {
		lines: raw.map((line) => padRight(line, width)),
		baseline: raw.length - 1 >> 1,
		width
	};
}
/** Place boxes side by side, aligning their baselines. */
function hconcat(boxes) {
	if (boxes.length === 1) return boxes[0] ?? textBox("");
	let above = 0;
	let below = 0;
	for (const b of boxes) {
		above = Math.max(above, b.baseline);
		below = Math.max(below, b.lines.length - 1 - b.baseline);
	}
	const height = above + below + 1;
	const lines = [];
	let width = 0;
	for (const b of boxes) width += b.width;
	for (let row = 0; row < height; row++) {
		let line = "";
		for (const b of boxes) {
			const local = row - (above - b.baseline);
			line += local >= 0 && local < b.lines.length ? b.lines[local] ?? "" : spaces(b.width);
		}
		lines.push(line);
	}
	return {
		lines,
		baseline: above,
		width
	};
}
/** Stack `num` over `den`, separated by a bar; the bar becomes the baseline. */
function fracBox(num, den) {
	const width = Math.max(num.width, den.width) + 2;
	return {
		lines: [
			...num.lines.map((line) => center$1(line, width)),
			BAR.repeat(width),
			...den.lines.map((line) => center$1(line, width))
		],
		baseline: num.lines.length,
		width
	};
}
/** Stack boxes vertically (left-aligned), e.g. the rows of an aligned block. */
function vconcat(boxes) {
	if (boxes.length === 1) return boxes[0] ?? textBox("");
	let width = 0;
	for (const b of boxes) width = Math.max(width, b.width);
	const lines = [];
	for (const b of boxes) for (const line of b.lines) lines.push(padRight(line, width));
	return {
		lines,
		baseline: lines.length - 1 >> 1,
		width
	};
}
/** Read a balanced `{…}` beginning at `i` (which must point at `{`). */
function readBraceGroup(src, i) {
	let depth = 0;
	let out = "";
	let j = i;
	for (; j < src.length; j++) {
		const c = src[j];
		if (c === "\\") {
			out += c + (src[j + 1] ?? "");
			j++;
			continue;
		}
		if (c === "{") {
			depth++;
			if (depth > 1) out += c;
			continue;
		}
		if (c === "}") {
			depth--;
			if (depth === 0) {
				j++;
				break;
			}
			out += c;
			continue;
		}
		out += c ?? "";
	}
	return {
		text: out,
		end: j
	};
}
/**
* Read one fraction argument: a `{…}` group, a single char, or a `\command`
* together with its attached `[…]`/`{…}` arguments (or whole `\begin…\end`
* block), so e.g. `\frac\sqrt{a}{b}` reads `\sqrt{a}` as the numerator.
*/
function readArg(src, i) {
	while (src[i] === " ") i++;
	if (i >= src.length) return {
		text: "",
		end: i
	};
	const ch = src[i];
	if (ch === void 0) return {
		text: "",
		end: i
	};
	if (ch === "{") return readBraceGroup(src, i);
	if (ch !== "\\") return {
		text: ch,
		end: i + 1
	};
	let j = i + 1;
	let name = "";
	while (/[A-Za-z]/.test(src[j] ?? "")) {
		name += src[j] ?? "";
		j++;
	}
	if (name === "begin") {
		const env = consumeEnvironment(src, i);
		if (env) return env;
	}
	if (!name) return {
		text: src.slice(i, i + 2),
		end: i + 2
	};
	let end = j;
	while (src[end] === "[" || src[end] === "{") if (src[end] === "{") end = readBraceGroup(src, end).end;
	else {
		const close = src.indexOf("]", end);
		end = close === -1 ? src.length : close + 1;
	}
	return {
		text: src.slice(i, end),
		end
	};
}
/** Locate a `\begin{env}…\end{env}` block (balanced) starting at the backslash. */
function readEnvironment(src, start) {
	let i = start + 6;
	while (src[i] === " ") i++;
	if (src[i] !== "{") return null;
	const nameGroup = readBraceGroup(src, i);
	let k = nameGroup.end;
	let depth = 1;
	let bodyEnd = src.length;
	while (k < src.length && depth > 0) {
		if (src.startsWith("\\begin", k)) {
			depth++;
			k += 6;
			continue;
		}
		if (src.startsWith("\\end", k)) {
			depth--;
			if (depth === 0) bodyEnd = k;
			k += 4;
			while (src[k] === " ") k++;
			if (src[k] === "{") k = readBraceGroup(src, k).end;
			if (depth === 0) break;
			continue;
		}
		k++;
	}
	return {
		env: nameGroup.text.trim(),
		bodyStart: nameGroup.end,
		bodyEnd,
		end: k
	};
}
/** The full `\begin{env}…\end{env}` substring as an inline run. */
function consumeEnvironment(src, start) {
	const env = readEnvironment(src, start);
	return env ? {
		text: src.slice(start, env.end),
		end: env.end
	} : null;
}
/** Split an environment body on top-level `\\` row breaks (depth-aware). */
function splitRows(body) {
	const rows = [];
	let braceDepth = 0;
	let envDepth = 0;
	let last = 0;
	let i = 0;
	while (i < body.length) {
		if (body.startsWith("\\begin", i)) {
			envDepth++;
			i += 6;
			continue;
		}
		if (body.startsWith("\\end", i)) {
			envDepth--;
			i += 4;
			continue;
		}
		const c = body[i];
		if (c === "\\") {
			if (body[i + 1] === "\\" && braceDepth === 0 && envDepth === 0) {
				rows.push(body.slice(last, i));
				i += 2;
				while (body[i] === " ") i++;
				if (body[i] === "[") {
					const close = body.indexOf("]", i);
					i = close === -1 ? body.length : close + 1;
				}
				last = i;
				continue;
			}
			i += 2;
			continue;
		}
		if (c === "{") braceDepth++;
		else if (c === "}") braceDepth--;
		i++;
	}
	rows.push(body.slice(last));
	return rows;
}
/**
* Render a `\begin{env}…\end{env}` block. Expression "wrapper" environments
* (`equation`, `align`, `gather`, …) have their rows parsed so fractions stack;
* grid/structure environments (matrix/array/cases) render flat via
* `latexToUnicode`.
*/
function parseEnvironment(src, start) {
	const env = readEnvironment(src, start);
	if (env === null) return null;
	const base = env.env.endsWith("*") ? env.env.slice(0, -1) : env.env;
	if (!DISPLAY_ROW_ENVIRONMENTS[base]) return {
		box: textBox(latexToUnicode(src.slice(start, env.end))),
		end: env.end
	};
	let bodyStart = env.bodyStart;
	if (base === "alignat" || base === "alignedat" || base === "gatheredat") {
		let p = bodyStart;
		while (src[p] === " " || src[p] === "\n") p++;
		if (src[p] === "{") bodyStart = readBraceGroup(src, p).end;
	}
	const rows = splitRows(src.slice(bodyStart, env.bodyEnd)).map((row) => row.trim()).filter((row) => row !== "").map((row) => parseExpr(row));
	return {
		box: rows.length > 0 ? vconcat(rows) : textBox(""),
		end: env.end
	};
}
/** Append a script (`^`/`_`) and its argument to the inline run verbatim. */
function readScript(src, i) {
	let out = src[i] ?? "";
	i++;
	while (src[i] === " ") {
		const sp = src[i];
		if (sp === void 0) break;
		out += sp;
		i++;
	}
	if (src[i] === "{") {
		const group = readBraceGroup(src, i);
		return {
			text: `${out}{${group.text}}`,
			end: group.end
		};
	}
	if (src[i] === "\\") {
		let j = i + 1;
		if (/[A-Za-z]/.test(src[j] ?? "")) while (/[A-Za-z]/.test(src[j] ?? "")) j++;
		else j++;
		return {
			text: out + src.slice(i, j),
			end: j
		};
	}
	if (i < src.length) {
		const ch = src[i];
		if (ch !== void 0) return {
			text: out + ch,
			end: i + 1
		};
	}
	return {
		text: out,
		end: i
	};
}
/**
* Parse a math fragment into a layout box, stacking top-level fractions (and
* fractions nested inside other fractions' arguments). Non-fraction runs —
* including scripts, roots, environments, and command arguments — are gathered
* into inline strings and rendered through `latexToUnicode`.
*/
function parseExpr(src) {
	const boxes = [];
	let inline = "";
	const flush = () => {
		if (inline) {
			boxes.push(textBox(latexToUnicode(inline)));
			inline = "";
		}
	};
	let i = 0;
	while (i < src.length) {
		const c = src[i];
		if (c === "\\") {
			let j = i + 1;
			let name = "";
			while (j < src.length) {
				const ch = src[j];
				if (ch === void 0 || !/[A-Za-z]/.test(ch)) break;
				name += ch;
				j++;
			}
			if (name && FRAC_COMMANDS[name]) {
				flush();
				const num = readArg(src, j);
				const den = readArg(src, num.end);
				boxes.push(fracBox(parseExpr(num.text), parseExpr(den.text)));
				i = den.end;
				continue;
			}
			if (name === "begin") {
				const env = parseEnvironment(src, i);
				if (env) {
					flush();
					boxes.push(env.box);
					i = env.end;
					continue;
				}
			}
			if (!name) {
				inline += `\\${src[j] ?? ""}`;
				i = j + 1;
				continue;
			}
			inline += `\\${name}`;
			i = j;
			while (src[i] === "[" || src[i] === "{") if (src[i] === "{") {
				const group = readBraceGroup(src, i);
				inline += `{${group.text}}`;
				i = group.end;
			} else {
				const close = src.indexOf("]", i);
				const end = close === -1 ? src.length : close + 1;
				inline += src.slice(i, end);
				i = end;
			}
			continue;
		}
		if (c === "^" || c === "_") {
			const script = readScript(src, i);
			inline += script.text;
			i = script.end;
			continue;
		}
		if (c === "{") {
			const group = readBraceGroup(src, i);
			flush();
			boxes.push(parseExpr(group.text));
			i = group.end;
			continue;
		}
		inline += c ?? "";
		i++;
	}
	flush();
	if (boxes.length === 0) return textBox("");
	return hconcat(boxes);
}
/** Split on top-level `\n` row separators (outside braces and environments). */
function splitLines(src) {
	const lines = [];
	let braceDepth = 0;
	let envDepth = 0;
	let last = 0;
	let i = 0;
	while (i < src.length) {
		if (src.startsWith("\\begin", i)) {
			envDepth++;
			i += 6;
			continue;
		}
		if (src.startsWith("\\end", i)) {
			envDepth--;
			i += 4;
			continue;
		}
		const c = src[i];
		if (c === "\\") {
			i += 2;
			continue;
		}
		if (c === "{") braceDepth++;
		else if (c === "}") braceDepth--;
		else if (c === "\n" && braceDepth === 0 && envDepth === 0) {
			lines.push(src.slice(last, i));
			last = i + 1;
		}
		i++;
	}
	lines.push(src.slice(last));
	return lines;
}
/**
* Render a display LaTeX math fragment to lines, stacking `\frac` vertically.
* Top-level source newlines become vertical rows (so a `lhs =` line stays above
* its block); each row stacks fractions via `parseExpr`. Inline math should use
* `latexToUnicode` instead — fractions there stay single-line.
* @param src - display 数学的 LaTeX 源（不带 `$$`/`\[` 定界符）。
* @returns 渲染后的行数组（去除首尾空行）；空输入返回空数组。
*/
function latexToBlock(src) {
	if (typeof src !== "string" || src.trim() === "") return [];
	const rows = splitLines(src.trim()).map((line) => line.trim()).filter((line) => line !== "").map((line) => parseExpr(line));
	if (rows.length === 0) return [];
	let lines = vconcat(rows).lines;
	while (lines.length > 1) {
		const last = lines[lines.length - 1];
		if (last === void 0 || last.trim() !== "") break;
		lines = lines.slice(0, -1);
	}
	while (lines.length > 1) {
		const first = lines[0];
		if (first === void 0 || first.trim() !== "") break;
		lines = lines.slice(1);
	}
	return lines;
}
//#endregion
//#region lib/types/format/markdown.js
/**
* T9 纯 ANSI Markdown 格式化器。
*
* 从 `markdown-render.tsx` 提取：所有解析逻辑（parseBlocks、parseInline、
* highlightLine、guessLang、keywordsForLang）保持不变，只将 React 渲染函数
* 替换为纯 ANSI 字符串构建器。
*
* 零 React/Ink 依赖。输出为 ANSI 格式化字符串数组（每行一个元素）。
*/
const JS_KEYWORDS = new Set([
	"const",
	"let",
	"var",
	"function",
	"return",
	"if",
	"else",
	"for",
	"while",
	"class",
	"new",
	"this",
	"import",
	"export",
	"from",
	"default",
	"async",
	"await",
	"try",
	"catch",
	"throw",
	"typeof",
	"instanceof",
	"switch",
	"case",
	"break",
	"continue",
	"interface",
	"type",
	"enum",
	"extends",
	"implements",
	"readonly",
	"true",
	"false",
	"null",
	"undefined",
	"void",
	"delete",
	"in",
	"of",
	"as"
]);
const PY_KEYWORDS = new Set([
	"def",
	"class",
	"return",
	"if",
	"elif",
	"else",
	"for",
	"while",
	"import",
	"from",
	"as",
	"try",
	"except",
	"finally",
	"raise",
	"with",
	"yield",
	"lambda",
	"pass",
	"break",
	"continue",
	"and",
	"or",
	"not",
	"in",
	"is",
	"True",
	"False",
	"None",
	"self",
	"async",
	"await",
	"print"
]);
const GO_KEYWORDS = new Set([
	"func",
	"return",
	"if",
	"else",
	"for",
	"range",
	"var",
	"const",
	"type",
	"struct",
	"interface",
	"package",
	"import",
	"defer",
	"go",
	"chan",
	"select",
	"case",
	"switch",
	"default",
	"break",
	"continue",
	"map",
	"nil",
	"true",
	"false",
	"err",
	"make",
	"append"
]);
const RUST_KEYWORDS = new Set([
	"fn",
	"let",
	"mut",
	"pub",
	"struct",
	"enum",
	"impl",
	"trait",
	"mod",
	"use",
	"return",
	"if",
	"else",
	"for",
	"while",
	"loop",
	"match",
	"self",
	"Self",
	"true",
	"false",
	"Some",
	"None",
	"Ok",
	"Err",
	"async",
	"await",
	"move",
	"where",
	"type",
	"const",
	"static",
	"ref",
	"as",
	"in"
]);
const BASH_KEYWORDS = new Set([
	"if",
	"then",
	"else",
	"elif",
	"fi",
	"for",
	"while",
	"do",
	"done",
	"case",
	"esac",
	"function",
	"return",
	"exit",
	"echo",
	"export",
	"source",
	"alias",
	"local",
	"readonly",
	"set",
	"unset",
	"true",
	"false"
]);
const CPP_KEYWORDS = new Set([
	"alignas",
	"alignof",
	"and",
	"and_eq",
	"asm",
	"auto",
	"bitand",
	"bitor",
	"bool",
	"break",
	"case",
	"catch",
	"char",
	"class",
	"compl",
	"concept",
	"const",
	"const_cast",
	"continue",
	"default",
	"delete",
	"do",
	"double",
	"else",
	"enum",
	"explicit",
	"export",
	"extern",
	"false",
	"float",
	"for",
	"friend",
	"goto",
	"if",
	"inline",
	"int",
	"long",
	"mutable",
	"namespace",
	"new",
	"noexcept",
	"not",
	"nullptr",
	"operator",
	"or",
	"private",
	"protected",
	"public",
	"reinterpret_cast",
	"return",
	"short",
	"signed",
	"sizeof",
	"static",
	"static_cast",
	"struct",
	"switch",
	"template",
	"this",
	"throw",
	"true",
	"try",
	"typedef",
	"typename",
	"union",
	"unsigned",
	"using",
	"virtual",
	"void",
	"volatile",
	"while"
]);
const SQL_KEYWORDS = new Set([
	"select",
	"insert",
	"update",
	"delete",
	"from",
	"where",
	"join",
	"left",
	"right",
	"inner",
	"outer",
	"on",
	"group",
	"by",
	"order",
	"having",
	"limit",
	"offset",
	"create",
	"table",
	"alter",
	"drop",
	"index",
	"view",
	"into",
	"values",
	"set",
	"and",
	"or",
	"not",
	"in",
	"is",
	"null",
	"true",
	"false",
	"as",
	"distinct",
	"count",
	"sum",
	"avg",
	"min",
	"max",
	"union",
	"all",
	"any",
	"exists",
	"like",
	"between",
	"case",
	"when",
	"then",
	"else",
	"end"
]);
const RUBY_KEYWORDS = new Set([
	"alias",
	"and",
	"begin",
	"break",
	"case",
	"class",
	"def",
	"do",
	"else",
	"elsif",
	"end",
	"ensure",
	"false",
	"for",
	"if",
	"in",
	"module",
	"next",
	"nil",
	"not",
	"or",
	"redo",
	"rescue",
	"retry",
	"return",
	"self",
	"super",
	"then",
	"true",
	"undef",
	"unless",
	"until",
	"when",
	"while",
	"yield"
]);
const PHP_KEYWORDS = new Set([
	"abstract",
	"and",
	"array",
	"as",
	"break",
	"case",
	"catch",
	"class",
	"const",
	"continue",
	"declare",
	"default",
	"do",
	"echo",
	"else",
	"elsif",
	"extends",
	"final",
	"finally",
	"fn",
	"for",
	"foreach",
	"function",
	"global",
	"if",
	"implements",
	"include",
	"instanceof",
	"interface",
	"isset",
	"list",
	"match",
	"namespace",
	"new",
	"or",
	"print",
	"private",
	"protected",
	"public",
	"return",
	"static",
	"switch",
	"throw",
	"trait",
	"try",
	"unset",
	"use",
	"var",
	"while",
	"yield",
	"true",
	"false",
	"null"
]);
const DOCKERFILE_KEYWORDS = new Set([
	"from",
	"run",
	"cmd",
	"label",
	"expose",
	"env",
	"add",
	"copy",
	"entrypoint",
	"volume",
	"user",
	"workdir",
	"arg",
	"onbuild",
	"stopsignal",
	"healthcheck",
	"shell"
]);
/**
* 语言名（含常见别名）→ 高亮关键字配置。
* @param lang - 语言名或别名（如 ts/py/golang），大小写不敏感。
* @returns 匹配的关键字配置；不认识的语言返回 null（不高亮）。
*/
function keywordsForLang(lang) {
	const l = lang.toLowerCase();
	if (l === "typescript" || l === "ts" || l === "javascript" || l === "js" || l === "jsx" || l === "tsx") return { keywords: JS_KEYWORDS };
	if (l === "python" || l === "py") return { keywords: PY_KEYWORDS };
	if (l === "go" || l === "golang") return { keywords: GO_KEYWORDS };
	if (l === "rust" || l === "rs") return { keywords: RUST_KEYWORDS };
	if (l === "bash" || l === "sh" || l === "shell" || l === "zsh") return { keywords: BASH_KEYWORDS };
	if (l === "c" || l === "cpp" || l === "cc" || l === "h" || l === "hpp") return { keywords: CPP_KEYWORDS };
	if (l === "java") return { keywords: new Set([
		"abstract",
		"assert",
		"boolean",
		"break",
		"byte",
		"case",
		"catch",
		"char",
		"class",
		"const",
		"continue",
		"default",
		"do",
		"double",
		"else",
		"enum",
		"extends",
		"final",
		"finally",
		"float",
		"for",
		"goto",
		"if",
		"implements",
		"import",
		"instanceof",
		"int",
		"interface",
		"long",
		"native",
		"new",
		"package",
		"private",
		"protected",
		"public",
		"return",
		"short",
		"static",
		"super",
		"switch",
		"synchronized",
		"this",
		"throw",
		"throws",
		"transient",
		"try",
		"void",
		"volatile",
		"while",
		"true",
		"false",
		"null"
	]) };
	if (l === "sql") return {
		keywords: SQL_KEYWORDS,
		caseInsensitive: true
	};
	if (l === "ruby" || l === "rb") return { keywords: RUBY_KEYWORDS };
	if (l === "php") return { keywords: PHP_KEYWORDS };
	if (l === "dockerfile" || l === "docker") return {
		keywords: DOCKERFILE_KEYWORDS,
		caseInsensitive: true
	};
	return null;
}
function getSynColors(theme) {
	return {
		keyword: theme?.primary ?? "#d7dce3",
		type: theme?.secondary ?? "#b0b8c4",
		func: theme?.secondary ?? "#b0b8c4",
		string: theme?.muted ?? "#9aa2b1",
		number: theme?.muted ?? "#9aa2b1",
		punct: theme?.dim ?? "#6e7681",
		comment: theme?.dim ?? "#6e7681"
	};
}
/**
* 单行行内 Markdown 分词：**bold**、*em*、`code`、[text](url) → Segment 序列。
* 未闭合的分隔符按普通文本处理（不吞字符）。
* @param text - 单行文本（不含换行）。
* @returns 顺序覆盖整行的 Segment 数组。
*/
function parseInline(text) {
	const segments = [];
	let i = 0;
	let buf = "";
	const flush = () => {
		if (buf) {
			segments.push({ text: buf });
			buf = "";
		}
	};
	while (i < text.length) {
		if (text[i] === "*" && text[i + 1] === "*" || text[i] === "_" && text[i + 1] === "_") {
			const delim = text.slice(i, i + 2);
			const end = text.indexOf(delim, i + 2);
			if (end !== -1) {
				flush();
				segments.push({
					text: text.slice(i + 2, end),
					bold: true
				});
				i = end + 2;
				continue;
			}
		}
		if (text[i] === "*" && text[i + 1] !== "*" && (i === 0 || text[i - 1] !== "*")) {
			const end = text.indexOf("*", i + 1);
			if (end !== -1 && text[end + 1] !== "*" && (end === 0 || text[end - 1] !== "*")) {
				flush();
				segments.push({
					text: text.slice(i + 1, end),
					italic: true
				});
				i = end + 1;
				continue;
			}
		}
		if (text[i] === "_" && text[i + 1] !== "_" && (i === 0 || /[a-zA-Z]/.test(text[i - 1] ?? ""))) {
			const end = text.indexOf("_", i + 1);
			if (end !== -1 && text[end + 1] !== "_") {
				flush();
				segments.push({
					text: text.slice(i + 1, end),
					italic: true
				});
				i = end + 1;
				continue;
			}
		}
		if (text[i] === "`") {
			const end = text.indexOf("`", i + 1);
			if (end !== -1) {
				flush();
				segments.push({
					text: text.slice(i + 1, end),
					code: true
				});
				i = end + 1;
				continue;
			}
		}
		if (text[i] === "[") {
			const textEnd = text.indexOf("]", i + 1);
			if (textEnd !== -1 && text[textEnd + 1] === "(") {
				const urlEnd = text.indexOf(")", textEnd + 2);
				if (urlEnd !== -1) {
					flush();
					const href = text.slice(textEnd + 2, urlEnd).trim();
					segments.push({
						text: text.slice(i + 1, textEnd),
						underline: true,
						...href ? { href } : {}
					});
					i = urlEnd + 1;
					continue;
				}
			}
		}
		buf += text[i] ?? "";
		i++;
	}
	flush();
	return segments;
}
/**
* 多行 Markdown 块级解析：代码围栏、$$/\[ 数学块、标题、hr、引用、列表、
* 表格与段落。未闭合的代码围栏/数学块收集到文末。
* @param text - 完整 Markdown 文本（可多行）。
* @returns 按出现序的 Block 数组。
*/
function parseBlocks(text) {
	const lines = text.split("\n");
	const blocks = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (line === void 0) break;
		if (line.startsWith("```")) {
			const language = line.slice(3).trim();
			const codeLines = [];
			i++;
			while (i < lines.length) {
				const l = lines[i];
				if (l === void 0 || l.startsWith("```")) break;
				codeLines.push(l);
				i++;
			}
			blocks.push({
				type: "code",
				...language ? { language } : {},
				content: codeLines.join("\n")
			});
			i++;
			continue;
		}
		if (line.startsWith("$$") || line.startsWith("\\[")) {
			const opener = line.startsWith("$$") ? "$$" : "\\[";
			const closer = line.startsWith("$$") ? "$$" : "\\]";
			if (line.endsWith(closer) && line.length > opener.length) {
				const body = line.slice(opener.length, line.length - closer.length);
				blocks.push({
					type: "math",
					content: body
				});
				i++;
				continue;
			}
			const bodyLines = [];
			i++;
			while (i < lines.length) {
				const l = lines[i];
				if (l === void 0 || l.includes(closer)) break;
				bodyLines.push(l);
				i++;
			}
			if (i < lines.length) {
				const closeLine = lines[i] ?? "";
				const closeIdx = closeLine.indexOf(closer);
				if (closeIdx > 0) bodyLines.push(closeLine.slice(0, closeIdx));
				i++;
			}
			blocks.push({
				type: "math",
				content: bodyLines.join("\n")
			});
			continue;
		}
		const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
		if (headerMatch) {
			blocks.push({
				type: "header",
				level: (headerMatch[1] ?? "").length,
				content: headerMatch[2] ?? ""
			});
			i++;
			continue;
		}
		if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
			blocks.push({
				type: "hr",
				content: ""
			});
			i++;
			continue;
		}
		if (line.startsWith("> ")) {
			const quoteLines = [];
			while (i < lines.length) {
				const q = lines[i];
				if (q === void 0 || !q.startsWith("> ")) break;
				quoteLines.push(q.slice(2));
				i++;
			}
			blocks.push({
				type: "blockquote",
				content: quoteLines.join("\n")
			});
			continue;
		}
		if (/^(\s*[-*]\s|\s*\d+\.\s)/.test(line)) {
			const items = [];
			while (i < lines.length) {
				const item = lines[i];
				if (item === void 0 || !/^(\s*[-*]\s|\s*\d+\.\s)/.test(item)) break;
				items.push(item.replace(/^\s*[-*]\s|\s*\d+\.\s/, ""));
				i++;
			}
			blocks.push({
				type: "list",
				content: items.join("\n"),
				items
			});
			continue;
		}
		if (line.includes("|") && i + 1 < lines.length && /^\|?[\s-:|]+\|?$/.test(lines[i + 1] ?? "")) {
			const tableLines = [];
			while (i < lines.length) {
				const t = lines[i];
				if (t === void 0 || !t.includes("|")) break;
				tableLines.push(t);
				i++;
			}
			blocks.push({
				type: "table",
				content: tableLines.join("\n")
			});
			continue;
		}
		if (line.trim() === "") {
			i++;
			continue;
		}
		const paraLines = [];
		while (i < lines.length) {
			const p = lines[i];
			if (p === void 0 || p.trim() === "" || p.startsWith("#") || p.startsWith("```") || p.startsWith("> ") || /^(\s*[-*]\s)/.test(p)) break;
			paraLines.push(p);
			i++;
		}
		if (paraLines.length > 0) blocks.push({
			type: "paragraph",
			content: paraLines.join("\n")
		});
		else {
			blocks.push({
				type: "paragraph",
				content: line
			});
			i++;
		}
	}
	return blocks;
}
/**
* 单行代码语法高亮：字符串/数字/关键字/类型名/函数调用/标点/注释分段着色。
* @param line - 单行代码文本。
* @param keywords - 语言关键字集合；null 时整行按普通文本返回（不高亮）。
* @param caseInsensitive - 关键字匹配是否大小写不敏感（SQL/Dockerfile）。
* @param theme - 当前主题；缺省时回退硬编码色。
* @returns 顺序覆盖整行的 Segment 数组（带 color 标记）。
*/
function highlightLine(line, keywords, caseInsensitive = false, theme) {
	if (!keywords) return [{ text: line }];
	const SYN = getSynColors(theme);
	const segments = [];
	const commentIdx = line.indexOf("//");
	const hashCommentIdx = line.indexOf("#");
	let effectiveCommentIdx = -1;
	if (commentIdx !== -1 && (hashCommentIdx === -1 || commentIdx < hashCommentIdx)) effectiveCommentIdx = commentIdx;
	else if (hashCommentIdx !== -1) effectiveCommentIdx = hashCommentIdx;
	const effectiveLine = effectiveCommentIdx !== -1 ? line.slice(0, effectiveCommentIdx) : line;
	const commentPart = effectiveCommentIdx !== -1 ? line.slice(effectiveCommentIdx) : "";
	const re = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\w+\b|\s+|[^\s\w]+)/g;
	let match;
	while ((match = re.exec(effectiveLine)) !== null) {
		const token = match[0];
		if (/^\s+$/.test(token)) {
			segments.push({ text: token });
			continue;
		}
		if (/^["'`]/.test(token)) {
			segments.push({
				text: token,
				color: SYN.string
			});
			continue;
		}
		if (/^[^\s\w]+$/.test(token)) {
			segments.push({
				text: token,
				color: SYN.punct
			});
			continue;
		}
		const matchToken = caseInsensitive ? token.toLowerCase() : token;
		if (keywords.has(matchToken)) segments.push({
			text: token,
			color: SYN.keyword,
			bold: true
		});
		else if (/^\d[\d._]*$/.test(token)) segments.push({
			text: token,
			color: SYN.number
		});
		else if (/^[A-Z][a-zA-Z0-9]*$/.test(token)) segments.push({
			text: token,
			color: SYN.type
		});
		else if (effectiveLine[match.index + token.length] === "(") segments.push({
			text: token,
			color: SYN.func
		});
		else segments.push({ text: token });
	}
	if (commentPart) segments.push({
		text: commentPart,
		color: SYN.comment
	});
	return segments;
}
/**
* 从代码文本前 500 字符启发式猜测语言（typescript/python/go/rust/bash）。
* @param text - 代码文本。
* @returns 猜中的语言名；无法判定返回 undefined。
*/
function guessLang(text) {
	const sample = text.slice(0, 500);
	if (/\bimport\b.*\bfrom\b|export\s+(default|const|function)|=>\s*[{(]|:\s*(string|number|boolean)\b/.test(sample)) return "typescript";
	if (/\bdef\b|\bclass\b.*:$|import\s+\w+/m.test(sample)) return "python";
	if (/\bfunc\b|\bpackage\b\s+\w+|:=/.test(sample)) return "go";
	if (/\bfn\b|\blet\s+mut\b|\bimpl\b/.test(sample)) return "rust";
	if (/^#!/.test(sample) || /\bfi\b|\bdone\b|\besac\b/.test(sample)) return "bash";
}
/**
* 快速判定文本是否含 Markdown/数学/链接语法（决定 formatMarkdown 是否走完整解析）。
* @param text - 待检测文本。
* @returns 含任一 Markdown 信号（强调/代码/标题/列表/引用/hr/数学分隔符/链接）时 true。
*/
function hasMarkdown(text) {
	return text.includes("**") || text.includes("`") || text.includes("```") || /^#{1,6}\s/m.test(text) || /^[-*]\s/m.test(text) || /^>\s/m.test(text) || /^(-{3,}|\*{3,}|_{3,})\s*$/m.test(text) || /\$[^\s$]/.test(text) || text.includes("$$") || text.includes("\\[") || text.includes("\\(") || /\[[^\]]+\]\([^)]+\)/.test(text);
}
const NUMBERED_LINE_RE = /^\s*\d+│/;
function formatSegment(seg, theme) {
	let s = seg.text;
	const opts = {
		...seg.bold !== void 0 ? { bold: seg.bold } : {},
		...seg.italic !== void 0 ? { italic: seg.italic } : {},
		...seg.underline !== void 0 ? { underline: seg.underline } : {},
		...seg.dimmed !== void 0 ? { dim: seg.dimmed } : {}
	};
	const fgHex = seg.color ?? (seg.code ? theme.secondary : "");
	if (seg.color || seg.code || seg.bold || seg.italic || seg.underline || seg.dimmed) s = color(seg.code ? ` ${seg.text} ` : seg.text, fgHex, opts);
	if (seg.href) s = hyperlink(s, seg.href);
	return s;
}
function formatInlineToAnsi(segments, theme) {
	return segments.map((seg) => formatSegment(seg, theme)).join("");
}
/**
* 1. 尝试检测并格式化 Git Commit 提交标签行
* 示例: "95454cd0  — 5 files, +70/-4。"
* @param line - 待检测的单行文本（保留前导缩进）。
* @param theme - 当前主题（hash/分隔符/增删计数分色）。
* @returns 命中提交行格式时返回染色后的行；否则 null（调用方走普通渲染）。
*/
function tryFormatGitCommitLine(line, theme) {
	const indent = /^\s*/.exec(line)?.[0] ?? "";
	const trimmed = line.trim();
	const match = /^(?:commit\s+)?([0-9a-f]{7,40})\s+(—|-|:)\s+(.*)$/i.exec(trimmed);
	if (!match) return null;
	const [, hash, sep, rest] = match;
	if (!/\b\d+\s+files?|\+\d+|\-\d+|insertions?|deletions?/i.test(rest)) return null;
	return `${indent}${color(`⎇ ${hash}`, theme.secondary, {
		bold: true,
		underline: true
	})}${color(` ${sep} `, theme.dim)}${rest.replace(/\+(\d+)/g, color("+$1", theme.success, { bold: true })).replace(/\-(\d+)/g, color("-$1", theme.error, { bold: true })).replace(/(\d+)(\s+files?)/g, color("$1$2", theme.assistantColor))}`;
}
/**
* 2. 高亮行首的代码序号（如 ①-⑩ / ❶-❿ / 1. 2. 等）
* @param renderedLine - 已渲染的行（可含 ANSI；只改写行首序号段）。
* @param theme - 当前主题（序号用 warning 色加粗）。
* @returns 行首命中序号时返回改写后的行；否则原样返回。
*/
function highlightCodeLineNumber(renderedLine, theme) {
	const circleMatch = /^(\s*)([①②③④⑤⑥⑦⑧⑨⑩❶❷❸❹❺❻❼❽❾❿])(\s*.*)$/.exec(renderedLine);
	if (circleMatch) {
		const [, indent, num, rest] = circleMatch;
		return `${indent}${color(num, theme.warning, { bold: true })}${rest}`;
	}
	const digitMatch = /^(\s*)(\d+[\.\)])(\s+.*)$/.exec(renderedLine);
	if (digitMatch) {
		const [, indent, num, rest] = digitMatch;
		return `${indent}${color(num, theme.warning, { bold: true })}${rest}`;
	}
	return renderedLine;
}
function formatCodeBlock(language, content, _columns, theme) {
	const lines = content.split("\n");
	const langConfig = language ? keywordsForLang(language) : null;
	const keywords = langConfig?.keywords ?? null;
	const caseInsensitive = langConfig?.caseInsensitive ?? false;
	const langLower = language?.toLowerCase();
	const isDiffBlock = langLower === "diff" || langLower === "patch" || isDiffContent(content);
	const MAX_CODE_LINES = 60;
	const truncated = lines.length > MAX_CODE_LINES;
	const visible = truncated ? lines.slice(0, MAX_CODE_LINES) : lines;
	const result = [];
	const label = language || "code";
	let labelDisplay = label;
	if (label === "code" || label === "- code -" || label === "bash") labelDisplay = `‹/› ${label.replace(/^-?\s*code\s*-?$/i, "CODE")}`;
	else labelDisplay = `‹/› ${label.toUpperCase()}`;
	result.push(color(`╴ ${labelDisplay} ╴`, theme.secondary, { bold: true }));
	for (const line of visible) {
		if (isDiffBlock) {
			result.push(color(line, diffLineColor(line, theme)));
			continue;
		}
		const gitFormatted = tryFormatGitCommitLine(line, theme);
		if (gitFormatted) {
			result.push(gitFormatted);
			continue;
		}
		const ansiLine = formatInlineToAnsi(highlightLine(line, keywords, caseInsensitive, theme), theme);
		result.push(highlightCodeLineNumber(ansiLine, theme));
	}
	if (truncated) result.push(color(hiddenLinesMarker(lines.length - MAX_CODE_LINES), theme.muted));
	return result;
}
function formatBlock(block, columns, theme) {
	const result = [];
	switch (block.type) {
		case "header": {
			const level = block.level ?? 1;
			const colors = [
				theme.primary,
				void 0,
				void 0,
				theme.secondary,
				theme.secondary,
				theme.secondary
			];
			const glyph = [
				"▌",
				"▌",
				"",
				"",
				"",
				""
			][level - 1] ?? "";
			const headerColor = colors[level - 1];
			const text = glyph ? `${glyph} ${block.content}` : block.content;
			result.push(headerColor ? color(text, headerColor, { bold: true }) : color(text, theme.assistantColor, { bold: true }));
			break;
		}
		case "code":
			result.push(...formatCodeBlock(block.language, block.content, columns, theme));
			break;
		case "math": {
			const mathLines = latexToBlock(block.content);
			if (mathLines.length === 0) result.push(color(latexToUnicode(block.content), theme.assistantColor));
			else for (const ml of mathLines) result.push(color(ml, theme.assistantColor));
			break;
		}
		case "list": {
			const items = block.items ?? block.content.split("\n");
			for (const item of items) {
				const itemAnsi = formatInlineToAnsi(parseInline(item), theme);
				result.push(`${color("◇", theme.secondary)} ${highlightCodeLineNumber(itemAnsi, theme)}`);
			}
			break;
		}
		case "blockquote":
			result.push(`${color("▎", theme.secondary)} ${color(block.content, theme.muted, { italic: true })}`);
			break;
		case "hr":
			result.push(color("─".repeat(Math.max(20, columns - 4)), theme.dim));
			break;
		case "table": {
			const dataLines = block.content.split("\n").filter((l) => !/^\|?[\s-:|]+\|?$/.test(l.trim()));
			for (let i = 0; i < dataLines.length; i++) {
				const line = dataLines[i];
				if (line === void 0) continue;
				result.push(i === 0 ? color(line, theme.secondary, { bold: true }) : line);
			}
			break;
		}
		default: {
			const lines = block.content.split("\n");
			for (const line of lines) {
				const gitFormattedLine = tryFormatGitCommitLine(line, theme);
				if (gitFormattedLine) result.push(gitFormattedLine);
				else {
					const formatted = color(formatInlineToAnsi(parseInline(renderMathInText(line)), theme), theme.assistantColor);
					result.push(highlightCodeLineNumber(formatted, theme));
				}
			}
			break;
		}
	}
	return result;
}
/**
* 将 Markdown 文本格式化为 ANSI 行数组。
*
* 这是 `Markdown` React 组件的纯 ANSI 替代。
* 零 React/Ink 依赖。
* @param input - 文本、可选语言提示与终端宽度。
* @param theme - 当前主题。
* @returns ANSI 行数组；空文本返回空数组。
*/
function formatMarkdown(input, theme) {
	if (!input.text) return [];
	const result = [];
	if (!hasMarkdown(input.text) && NUMBERED_LINE_RE.test(input.text)) {
		const lang = input.language ?? guessLang(input.text);
		const langConfig = lang ? keywordsForLang(lang) : null;
		const keywords = langConfig?.keywords ?? null;
		const caseInsensitive = langConfig?.caseInsensitive ?? false;
		for (const line of input.text.split("\n")) {
			const pipeIdx = line.indexOf("│");
			if (pipeIdx === -1) {
				result.push(line);
				continue;
			}
			const gutter = line.slice(0, pipeIdx + 1);
			const segs = highlightLine(line.slice(pipeIdx + 1), keywords, caseInsensitive, theme);
			result.push(`${color(gutter, theme.dim)}${formatInlineToAnsi(segs, theme)}`);
		}
		return result;
	}
	if (!hasMarkdown(input.text)) for (const line of input.text.split("\n")) {
		const gitFormatted = tryFormatGitCommitLine(line, theme);
		if (gitFormatted) result.push(gitFormatted);
		else result.push(highlightCodeLineNumber(line, theme));
	}
	else {
		const blocks = parseBlocks(input.text);
		for (const block of blocks) result.push(...formatBlock(block, input.columns, theme));
	}
	for (let i = result.length - 1; i >= 0; i--) {
		const lineStr = result[i];
		if (!lineStr) continue;
		const plainLine = lineStr.replace(/\u001b\[[0-9;]*m/g, "").trim();
		if (!plainLine) continue;
		if (/[？\?]\s*$/.test(plainLine) && !plainLine.includes("⚡")) result[i] = `${color("⚡", theme.warning, { bold: true })} ${lineStr}`;
		break;
	}
	return result;
}
//#endregion
//#region lib/types/live-tail-cap.js
/** Display rows a single logical line occupies at the given width (wrapping-aware). */
function rowsFor(line, width) {
	if (width <= 0) return 1;
	return Math.max(1, Math.ceil(displayWidth(line, { ambiguousAsWide: ambiguousWideEnabled() }) / width));
}
/**
* 多行文本在给定宽度下占的显示行总数（折行感知；空行也计 1 行）。
* @param text - 待度量文本（按 `\n` 分行）。
* @param width - 终端宽度（<=0 时每逻辑行按 1 行计）。
* @returns 显示行总数。
*/
function displayRowsForText(text, width) {
	return text.split("\n").reduce((total, line) => total + rowsFor(line, width), 0);
}
const OMITTED_PREFIX = "… ";
const OMITTED_PREFIX_NARROW = "…";
function charWidth(ch) {
	return displayWidth(ch, { ambiguousAsWide: ambiguousWideEnabled() });
}
function takeTailByDisplayWidth(line, maxDisplayWidth) {
	if (maxDisplayWidth <= 0) return "";
	const chars = Array.from(line);
	let width = 0;
	let start = chars.length;
	for (let i = chars.length - 1; i >= 0; i--) {
		const ch = chars[i];
		/* v8 ignore next -- Array.from 结果无稀疏位；noUncheckedIndexedAccess 收窄防御 */
		if (ch === void 0) continue;
		const nextWidth = width + charWidth(ch);
		if (nextWidth > maxDisplayWidth) break;
		width = nextWidth;
		start = i;
	}
	return chars.slice(start).join("");
}
function takeTailByDisplayRows(line, width, rows) {
	/* v8 ignore next -- 唯一调用方 capLiveTail 保证 remaining>0 才进入，此分支不可达 */
	if (rows <= 0) return "";
	/* v8 ignore next -- width<=0 时 rowsFor 恒 1、remaining 恒 0，partial-fit 永不发生 */
	if (width <= 0) return line;
	return takeTailByDisplayWidth(line, rows * width);
}
function markOmittedHead(line, width) {
	if (width <= 0) return `${OMITTED_PREFIX}${line}`;
	const prefix = width > charWidth(OMITTED_PREFIX) ? OMITTED_PREFIX : OMITTED_PREFIX_NARROW;
	return `${prefix}${takeTailByDisplayWidth(line, Math.max(0, rowsFor(line, width) * width - charWidth(prefix)))}`;
}
/**
* Cap the live tail to the last `maxRows` DISPLAY rows (wrapping-aware).
*
* The live (redrawn) region must never exceed the viewport, or Ink's relative
* cursor-up erase clamps at the viewport top and the terminal scrolls/duplicates
* every frame (真凶②). The bound must be in DISPLAY rows, not logical lines or
* chars (R6): a line wider than the terminal wraps to multiple rows.
*
* This only trims the redrawn live region. Committed content already lives in
* native scrollback (full, scrollable, searchable) — nothing here hides it.
*
* @param text - live 区全文（按 `\n` 分行）。
* @param width - 终端宽度（折行成本按此计算）。
* @param maxRows - 显示行上限（<=0 返回空串）。
* @returns 裁到上限内的尾部文本；发生裁剪时首行加省略号前缀。
*/
function capLiveTail(text, width, maxRows) {
	if (maxRows <= 0) return "";
	const lines = text.split("\n");
	let rows = 0;
	let omitted = false;
	const kept = [];
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		/* v8 ignore next -- split 结果无稀疏位；noUncheckedIndexedAccess 收窄防御 */
		if (line === void 0) continue;
		const cost = rowsFor(line, width);
		if (rows + cost > maxRows) {
			const remaining = maxRows - rows;
			if (remaining > 0) kept.unshift(takeTailByDisplayRows(line, width, remaining));
			omitted = true;
			break;
		}
		rows += cost;
		kept.unshift(line);
	}
	if (omitted && kept.length > 0) {
		const first = kept[0];
		/* v8 ignore next -- kept.length>0 保证 kept[0] 必有值；noUncheckedIndexedAccess 收窄防御 */
		if (first !== void 0) kept[0] = markOmittedHead(first, width);
	}
	return kept.join("\n");
}
/** A line that opens/closes a fenced code block (``` at column 0). */
function isFenceLine(line) {
	return line.startsWith("```");
}
/**
* Like capLiveTail, but markdown-fence-aware for the LIVE streaming tail.
*
* The live view renders the tail through the markdown block parser, which pairs
* ``` fences greedily (1st = open, 2nd = close, …). A raw tail slice can begin
* INSIDE a code block — then the tail's first ``` is really the block's CLOSER,
* but the parser reads it as an OPENER and boxes the following PROSE in a stray
* "code" frame (real code ends up outside the box; the offset is the tell). It
* flickers as the window slides each delta → "occasional code box around prose".
*
* Fix: count fences in the dropped head (everything above the visible tail). If
* odd, the tail starts inside a code block, so prepend a synthetic ``` opener
* that pairs with the inherited closer and realigns every fence after it. We
* reserve one row for that opener so the result still fits maxRows.
*
* Operates on the FULL accumulated text (not a pre-slice) so the fence count is
* correct; it only walks the trailing maxRows worth of lines for the visible
* region, so cost stays bounded regardless of total reply length.
*
* @param fullText - 累积的完整流式文本（不能是预切片，否则围栏计数会错）。
* @param width - 终端宽度。
* @param maxRows - 显示行上限（<=0 返回空串；需补合成开栏时为其保留一行）。
* @returns 裁剪后的尾部文本，必要时前置合成 ``` 开栏。
*/
function capLiveTailMarkdownSafe(fullText, width, maxRows) {
	if (maxRows <= 0) return "";
	const lines = fullText.split("\n");
	let rows = 0;
	let firstKept = lines.length;
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		/* v8 ignore next -- split 结果无稀疏位；noUncheckedIndexedAccess 收窄防御 */
		if (line === void 0) continue;
		const cost = rowsFor(line, width);
		if (rows + cost > maxRows) break;
		rows += cost;
		firstKept = i;
	}
	let fences = 0;
	for (let i = 0; i < firstKept; i++) {
		const line = lines[i];
		/* v8 ignore next -- split 结果无稀疏位；noUncheckedIndexedAccess 收窄防御 */
		if (line === void 0) continue;
		if (isFenceLine(line)) fences++;
	}
	const startsInsideCode = fences % 2 === 1;
	const capped = capLiveTail(lines.slice(firstKept >= lines.length ? lines.length - 1 : firstKept).join("\n"), width, startsInsideCode ? Math.max(1, maxRows - 1) : maxRows);
	return startsInsideCode ? "```\n" + capped : capped;
}
//#endregion
//#region lib/types/engine/stream-renderer.js
/**
* T9 StreamRenderer — 流式 Markdown 增量渲染（Claude Code StreamingMarkdown 模型）。
*
* 职责：
* - 接收 BlockStreamWriter 吐出的节流文本块，累积到 pending 缓冲区。
* - 在「最后一个稳定的顶层 block 边界」切分：空行结束的段落、闭合的 ``` 围栏。
* - 稳定前缀立即经 formatMarkdown 渲染后 commit 到 scrollback（不可回退）。
* - 尾部不完整 block 留在 pending，由 live 区以原始文本渲染（display-width
*   aware tail-cap，避免 CJK 宽字符截断错位）。
* - 围栏代码块流式期间不解析高亮（防闪烁）：未闭合的 ``` 内容停留在 pending，
*   闭合后整块作为稳定前缀高亮 commit。
*
* 数据流：
*   onTextDelta → BlockStreamWriter（节流）→ StreamRenderer.push
*     ├── 稳定 block → formatMarkdown → commit(scrollback)
*     └── 尾部不完整 block → getLiveTail → LiveEngine 底部重绘
*/
/**
* 找到文本中最后一个稳定的顶层 block 边界（fence-aware）。
*
* 边界定义（均为「该行结尾、含换行符」的 offset）：
* - 围栏外的空行（段落/列表/标题等 block 在空行处结束）
* - 闭合的 ``` 围栏行（整个代码块完整，可安全高亮）
*
* 围栏内部的空行不算边界（代码块未闭合时不可切分）。
* 最后一行（可能无尾随换行、仍在增长）永不参与判定。
*
* @param text - 累积中的流式 Markdown 文本
* @returns 切割 offset；0 表示尚无稳定边界
*/
function findStableBoundary(text) {
	let inFence = false;
	let lastBoundary = 0;
	let offset = 0;
	const lines = text.split("\n");
	for (let i = 0; i < lines.length - 1; i++) {
		const line = lines[i];
		if (line === void 0) continue;
		const lineEnd = offset + line.length + 1;
		if (line.startsWith("```")) {
			inFence = !inFence;
			if (!inFence) lastBoundary = lineEnd;
		} else if (!inFence && line.trim() === "") lastBoundary = lineEnd;
		offset = lineEnd;
	}
	return lastBoundary;
}
/**
* 流式 Markdown 增量渲染器：累积文本块，在稳定 block 边界切分——
* 稳定前缀经 formatMarkdown 渲染后 commit 到 scrollback（带 LRU 渲染缓存），
* 尾部不完整 block 留在 pending 由 live 区以原始文本展示。
*/
var StreamRenderer = class StreamRenderer {
	static CACHE_MAX_ENTRIES = 64;
	static CACHE_MAX_TEXT = 16 * 1024;
	pending = "";
	committedAny = false;
	options;
	stableCache = /* @__PURE__ */ new Map();
	constructor(options) {
		this.options = options;
	}
	/** 是否已有任何内容 commit 到 scrollback（用于 header 等一次性输出判定） */
	get hasCommitted() {
		return this.committedAny;
	}
	/** 是否持有任何内容（pending 或已 commit） */
	get hasContent() {
		return this.committedAny || this.pending.length > 0;
	}
	/** 当前未 commit 的尾部文本 */
	get pendingText() {
		return this.pending;
	}
	/**
	* 累积流式文本块；出现稳定边界时立即渲染并 commit 稳定前缀。
	* @param chunk - 新到达的文本块；空串为 no-op
	* @returns 本次是否同步 commit 了稳定前缀
	*/
	push(chunk) {
		if (!chunk) return false;
		this.pending += chunk;
		const cut = findStableBoundary(this.pending);
		if (cut > 0) {
			const stable = this.pending.slice(0, cut);
			this.pending = this.pending.slice(cut);
			return this.commitText(stable);
		}
		return false;
	}
	/**
	* 流结束：把剩余 pending 全部渲染 commit。
	* @returns 本轮是否输出过任何内容
	*/
	finalize() {
		if (this.pending.trim().length > 0) this.commitText(this.pending);
		this.pending = "";
		const had = this.committedAny;
		this.committedAny = false;
		return had;
	}
	/** 丢弃所有状态（abort 场景） */
	reset() {
		this.pending = "";
		this.committedAny = false;
	}
	/**
	* live 区尾部行：原始文本（不做 markdown 解析，防未闭合围栏闪烁），
	* display-width aware 截断到 maxRows 显示行。
	*
	* `extraTail` 为尚未吐块的最新缓冲（BlockStreamWriter.peek()）——拼在
	* pending 之后一起截断，使最新 token 逐字可见（打字机节奏），无需等 blockWriter
	* 吐块。截断对合并文本整体生效，保证不超视口 / CJK 宽度正确。
	* @param maxRows - 尾部显示行上限
	* @param extraTail - 尚未吐块的最新缓冲（BlockStreamWriter.peek()）
	* @returns 截断后的尾部行数组；无尾部内容时为空数组
	*/
	getLiveTailLines(maxRows, extraTail = "") {
		const tail = this.pending + extraTail;
		if (!tail) return [];
		const capped = capLiveTailMarkdownSafe(tail, this.options.getColumns(), maxRows);
		return capped ? capped.split("\n") : [];
	}
	commitText(text) {
		const trimmed = text.replace(/\n+$/, "");
		if (!trimmed.trim()) return false;
		const columns = this.options.getColumns();
		const cacheable = Buffer.byteLength(trimmed, "utf8") <= StreamRenderer.CACHE_MAX_TEXT;
		const language = trimmed.startsWith("```") ? trimmed.slice(3).split(/\s|\n/, 1)[0] ?? "" : "";
		const key = cacheable ? `${columns}\0${this.options.getThemeKey()}\0${language}\0${trimmed}` : void 0;
		let ansi = key === void 0 ? void 0 : this.stableCache.get(key);
		if (ansi !== void 0 && key !== void 0) {
			this.stableCache.delete(key);
			this.stableCache.set(key, ansi);
			this.options.onCacheResult?.(true);
			this.options.perfMonitor?.recordCache(true);
		} else {
			if (key !== void 0) {
				this.options.onCacheResult?.(false);
				this.options.perfMonitor?.recordCache(false);
			}
			const render = () => formatMarkdown({
				text: trimmed,
				columns
			}, this.options.getTheme());
			const rendered = this.options.perfMonitor?.measure("formatMarkdown", render) ?? render();
			if (rendered.length === 0) return false;
			ansi = rendered.join("\n");
			if (key !== void 0) {
				this.stableCache.set(key, ansi);
				if (this.stableCache.size > StreamRenderer.CACHE_MAX_ENTRIES) {
					const oldest = this.stableCache.keys().next().value;
					if (oldest !== void 0) this.stableCache.delete(oldest);
				}
			}
		}
		this.options.commit(ansi);
		this.committedAny = true;
		return true;
	}
};
//#endregion
//#region lib/types/engine/perf-monitor.js
/**
* TUI 渲染性能监控：按采样点计时（p50/p99/max）+ 事件循环延迟直方图 + 缓存命中率。
* 未启用（--debug-perf / RIVET_DEBUG_TELEMETRY=1 之外）时所有操作为 no-op 零开销。
*/
const SAMPLE_NAMES = [
	"renderLive",
	"delta",
	"formatMarkdown",
	"flush"
];
const NS_PER_MS = 1e6;
const MAX_RETAINED_SAMPLES = 4096;
function roundMs(value) {
	return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}
function emptyStats() {
	return {
		count: 0,
		p50Ms: 0,
		p99Ms: 0,
		maxMs: 0
	};
}
/**
* 判断性能监控是否应启用：`--debug-perf` 命令行开关或 `RIVET_DEBUG_TELEMETRY=1`。
* @param args - 命令行参数（默认 process.argv.slice(2)，可注入用于测试）
* @param env - 环境变量集合（默认 process.env，可注入用于测试）
* @returns 应启用监控时为 true
*/
function isTuiPerfEnabled(args = process.argv.slice(2), env = process.env) {
	return args.includes("--debug-perf") || env.RIVET_DEBUG_TELEMETRY === "1";
}
/**
* TUI 性能监控器。enabled=false 时不分配采样存储、不开直方图，
* 所有记录方法直通返回；enabled=true 时每个采样点保留最近 4096 条样本。
* 用完调用 stop() 关闭事件循环直方图。
*/
var TuiPerfMonitor = class {
	/** 监控是否启用（构造时确定，不可变）。 */
	enabled;
	now;
	histogram;
	samples;
	counts;
	maxima;
	cacheHits = 0;
	cacheMisses = 0;
	lastLoopLag = {
		p99Ms: 0,
		maxMs: 0
	};
	lastLoopLagAt = Number.NEGATIVE_INFINITY;
	stopped = false;
	constructor(options) {
		this.enabled = options.enabled;
		this.now = options.now ?? (() => performance.now());
		if (!this.enabled) return;
		this.samples = {
			renderLive: [],
			delta: [],
			formatMarkdown: [],
			flush: []
		};
		this.counts = {
			renderLive: 0,
			delta: 0,
			formatMarkdown: 0,
			flush: 0
		};
		this.maxima = {
			renderLive: 0,
			delta: 0,
			formatMarkdown: 0,
			flush: 0
		};
		this.histogram = (options.createHistogram ?? (() => monitorEventLoopDelay({ resolution: 20 })))();
		this.histogram.enable();
	}
	/**
	* 计时执行一个同步操作并记录耗时（操作抛错时仍记录，异常原样上抛）。
	* @param name - 采样点名称
	* @param operation - 被计时的同步操作
	* @returns operation 的返回值
	*/
	measure(name, operation) {
		if (!this.enabled) return operation();
		const start = this.now();
		try {
			return operation();
		} finally {
			this.record(name, this.now() - start);
		}
	}
	/**
	* 记录一次外部测得的耗时（负值钳为 0；超出保留上限时逐出最旧样本）。
	* @param name - 采样点名称
	* @param durationMs - 耗时（毫秒）
	*/
	record(name, durationMs) {
		if (!this.enabled || !this.samples || !this.counts || !this.maxima) return;
		const value = Math.max(0, durationMs);
		const retained = this.samples[name];
		if (retained.length >= MAX_RETAINED_SAMPLES) retained.shift();
		retained.push(value);
		this.counts[name]++;
		this.maxima[name] = Math.max(this.maxima[name], value);
	}
	/**
	* 记录一次缓存命中/未命中。
	* @param hit - true 计命中，false 计未命中
	*/
	recordCache(hit) {
		if (!this.enabled) return;
		if (hit) this.cacheHits++;
		else this.cacheMisses++;
	}
	/**
	* 读取事件循环延迟统计（带最小采样间隔的缓存；采样后重置直方图窗口）。
	* @param minIntervalMs - 两次真实采样的最小间隔（默认 1000ms），间隔内返回缓存值
	* @returns 最近窗口的延迟统计；未启用时为上次缓存（初始全 0）
	*/
	getLoopLagWindow(minIntervalMs = 1e3) {
		if (!this.enabled || !this.histogram) return this.lastLoopLag;
		const now = this.now();
		if (now - this.lastLoopLagAt < minIntervalMs) return this.lastLoopLag;
		this.lastLoopLag = this.sampleLoopLag();
		this.lastLoopLagAt = now;
		return this.lastLoopLag;
	}
	/**
	* 汇总全部采样点的统计快照（p50/p99 基于保留样本，count/max 为全程累计）。
	* @returns 性能快照；未启用监控时为 undefined
	*/
	summary() {
		if (!this.enabled || !this.samples || !this.counts || !this.maxima) return void 0;
		const stats = {};
		for (const name of SAMPLE_NAMES) {
			const retained = [...this.samples[name]].sort((a, b) => a - b);
			if (retained.length === 0) {
				stats[name] = emptyStats();
				continue;
			}
			const percentile = (p) => retained[Math.max(0, Math.ceil(p * retained.length) - 1)] ?? 0;
			stats[name] = {
				count: this.counts[name],
				p50Ms: roundMs(percentile(.5)),
				p99Ms: roundMs(percentile(.99)),
				maxMs: roundMs(this.maxima[name])
			};
		}
		return {
			kind: "perf-summary",
			samples: stats,
			cache: {
				hits: this.cacheHits,
				misses: this.cacheMisses
			},
			loopLag: this.sampleLoopLag()
		};
	}
	/** 关闭事件循环直方图（幂等；未启用监控时为 no-op）。 */
	stop() {
		if (!this.histogram || this.stopped) return;
		this.histogram.disable();
		this.stopped = true;
	}
	sampleLoopLag() {
		if (!this.histogram) return this.lastLoopLag;
		const snapshot = {
			p99Ms: roundMs(this.histogram.percentile(99) / NS_PER_MS),
			maxMs: roundMs(this.histogram.max / NS_PER_MS)
		};
		this.histogram.reset();
		return snapshot;
	}
};
//#endregion
//#region lib/types/engine/image-tool.js
/**
* 系统图像工具共享执行器 — 平台感知的候选命令构造与 fallback 执行、临时目录管理，
* 供 image-attach（缩放）与 term-image（格式转换）两条路径共用，
* 避免两套超时/清理策略漂移。
*
* 候选顺序按平台区分（见 toPngCandidates / resizeCandidates）：
* - darwin/linux：sips（macOS 内置，Linux 上不存在会自然失败进 fallback）
*   → ImageMagick v7（magick）→ v6（convert）。
* - win32：magick → PowerShell + System.Drawing 兜底。不含 sips（不存在），
*   也不含 convert——避免撞名系统工具 C:\Windows\System32\convert.exe
*   （FAT→NTFS 转换）；PowerShell 为 Windows 自带，覆盖未装 ImageMagick 的场景。
*   注意 System.Drawing 不支持 WebP（无 WebP 编解码器）——win32 未装 ImageMagick
*   时 WebP 转换必然失败：所有候选跑完返回 null，调用方退回文本占位。失败
*   不再是静默的：全部候选失败且 RIVET_DEBUG 非空时向 stderr 打一行调试输出
*   （见 runImageTool 末尾）。
*
* 临时目录约定：每次转换一个 `rivet-imgtool-*` 独立目录，finally 中删除；
* 进程崩溃/SIGKILL 残留由下一次转换时的惰性清扫兜底（mtime 超过 1 小时即删）。
*/
const execFileAsync$1 = promisify(execFile);
/** 转换临时目录的名称前缀（惰性清扫按此前缀识别残留目录）。 */
const IMAGE_TEMP_DIR_PREFIX = "rivet-imgtool-";
/** 残留目录惰性清扫阈值。 */
const STALE_MS = 3600 * 1e3;
/** PowerShell 单引号字符串字面量：内部 ' 翻倍转义。 */
function psQuote(path) {
	return `'${path.replace(/'/g, "''")}'`;
}
/** PowerShell 兜底命令：inbox powershell.exe + System.Drawing，-Command 执行脚本。 */
function powershellCommand(script) {
	return {
		bin: "powershell",
		args: [
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			script
		]
	};
}
/**
* 「任意格式 → PNG」转换候选命令（首个成功即采用）。
* darwin/linux：sips → magick → convert；win32：magick → PowerShell
* （convert 会撞名系统工具 convert.exe，sips 不存在，均排除）。
* @param inPath - 输入图片路径（任意受支持格式）
* @param outPath - PNG 输出路径
* @param platform - 目标平台（默认 process.platform，可注入用于测试）
* @returns 按优先级排列的候选命令列表
*/
function toPngCandidates(inPath, outPath, platform = process.platform) {
	if (platform === "win32") return [{
		bin: "magick",
		args: [inPath, `png:${outPath}`]
	}, powershellCommand(`\$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Drawing; \$img=\$null; try { $img=[System.Drawing.Image]::FromFile(${psQuote(inPath)}); $img.Save(${psQuote(outPath)},[System.Drawing.Imaging.ImageFormat]::Png) } finally { if (\$img) { \$img.Dispose() } }`)];
	return [
		{
			bin: "sips",
			args: [
				"-s",
				"format",
				"png",
				inPath,
				"--out",
				outPath
			]
		},
		{
			bin: "magick",
			args: [inPath, `png:${outPath}`]
		},
		{
			bin: "convert",
			args: [inPath, `png:${outPath}`]
		}
	];
}
/**
* 「等比缩放到长边 ≤ maxEdge 并输出 PNG」候选命令（首个成功即采用）。
* darwin/linux：sips → magick → convert；win32：magick → PowerShell。
* @param inPath - 输入图片路径
* @param outPath - PNG 输出路径
* @param maxEdge - 长边像素上限（仅超限时缩小，保持宽高比）
* @param platform - 目标平台（默认 process.platform，可注入用于测试）
* @returns 按优先级排列的候选命令列表
*/
function resizeCandidates(inPath, outPath, maxEdge, platform = process.platform) {
	if (platform === "win32") {
		const script = [
			"$ErrorActionPreference='Stop'",
			"Add-Type -AssemblyName System.Drawing",
			"$img=$null;$bmp=$null;$g=$null",
			"try {",
			`$img=[System.Drawing.Image]::FromFile(${psQuote(inPath)})`,
			`$scale=[Math]::Min(1.0,${maxEdge}/[Math]::Max($img.Width,$img.Height))`,
			"$w=[int][Math]::Max(1,[Math]::Round($img.Width*$scale))",
			"$h=[int][Math]::Max(1,[Math]::Round($img.Height*$scale))",
			"$bmp=New-Object System.Drawing.Bitmap($w,$h)",
			"$g=[System.Drawing.Graphics]::FromImage($bmp)",
			"$g.DrawImage($img,0,0,$w,$h)",
			`$bmp.Save(${psQuote(outPath)},[System.Drawing.Imaging.ImageFormat]::Png)`,
			"} finally {",
			"if ($g) { $g.Dispose() }",
			"if ($bmp) { $bmp.Dispose() }",
			"if ($img) { $img.Dispose() }",
			"}"
		].join(";");
		return [{
			bin: "magick",
			args: [
				inPath,
				"-resize",
				`${maxEdge}x${maxEdge}>`,
				outPath
			]
		}, powershellCommand(script)];
	}
	return [
		{
			bin: "sips",
			args: [
				"-Z",
				String(maxEdge),
				inPath,
				"--out",
				outPath
			]
		},
		{
			bin: "magick",
			args: [
				inPath,
				"-resize",
				`${maxEdge}x${maxEdge}>`,
				outPath
			]
		},
		{
			bin: "convert",
			args: [
				inPath,
				"-resize",
				`${maxEdge}x${maxEdge}>`,
				outPath
			]
		}
	];
}
/**
* 「等比缩放到长边 ≤ maxEdge 并以 JPEG 质量 quality 输出」候选命令（首个成功即采用）。
* 用于发送管线的降级压缩链（image-attach）：PNG 源第一级保透明输出 PNG，
* 其余格式及降级档一律转 JPEG——同时完成「provider 支持格式」转码
* （BMP/TIFF 等不在 provider 白名单内）。`>` 修饰符 / sips -Z 保证只缩不放。
* @param inPath - 输入图片路径
* @param outPath - JPEG 输出路径
* @param maxEdge - 长边像素上限（仅超限时缩小，保持宽高比）
* @param quality - JPEG 质量 0-100（sips formatOptions / magick -quality）
* @param platform - 目标平台（默认 process.platform，可注入用于测试）
* @returns 按优先级排列的候选命令列表
*/
function resizeJpegCandidates(inPath, outPath, maxEdge, quality, platform = process.platform) {
	if (platform === "win32") {
		const script = [
			"$ErrorActionPreference='Stop'",
			"Add-Type -AssemblyName System.Drawing",
			"$img=$null;$bmp=$null;$g=$null",
			"try {",
			`$img=[System.Drawing.Image]::FromFile(${psQuote(inPath)})`,
			`$scale=[Math]::Min(1.0,${maxEdge}/[Math]::Max($img.Width,$img.Height))`,
			"$w=[int][Math]::Max(1,[Math]::Round($img.Width*$scale))",
			"$h=[int][Math]::Max(1,[Math]::Round($img.Height*$scale))",
			"$bmp=New-Object System.Drawing.Bitmap($w,$h)",
			"$g=[System.Drawing.Graphics]::FromImage($bmp)",
			"$g.DrawImage($img,0,0,$w,$h)",
			"$codec=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }",
			"$params=New-Object System.Drawing.Imaging.EncoderParameters(1)",
			`$params.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,${quality})`,
			`$bmp.Save(${psQuote(outPath)},$codec,$params)`,
			"} finally {",
			"if ($g) { $g.Dispose() }",
			"if ($bmp) { $bmp.Dispose() }",
			"if ($img) { $img.Dispose() }",
			"}"
		].join(";");
		return [{
			bin: "magick",
			args: [
				inPath,
				"-resize",
				`${maxEdge}x${maxEdge}>`,
				"-quality",
				String(quality),
				`jpg:${outPath}`
			]
		}, powershellCommand(script)];
	}
	return [
		{
			bin: "sips",
			args: [
				"-s",
				"format",
				"jpeg",
				"-s",
				"formatOptions",
				String(quality),
				"-Z",
				String(maxEdge),
				inPath,
				"--out",
				outPath
			]
		},
		{
			bin: "magick",
			args: [
				inPath,
				"-resize",
				`${maxEdge}x${maxEdge}>`,
				"-quality",
				String(quality),
				`jpg:${outPath}`
			]
		},
		{
			bin: "convert",
			args: [
				inPath,
				"-resize",
				`${maxEdge}x${maxEdge}>`,
				"-quality",
				String(quality),
				`jpg:${outPath}`
			]
		}
	];
}
/** PNG 文件签名（magic bytes）。 */
const PNG_SIGNATURE = Buffer.from([
	137,
	80,
	78,
	71,
	13,
	10,
	26,
	10
]);
/** 完整 IEND chunk：length 0 + 'IEND' + CRC（内容固定）。 */
const PNG_IEND_CHUNK = Buffer.from([
	0,
	0,
	0,
	0,
	73,
	69,
	78,
	68,
	174,
	66,
	96,
	130
]);
/**
* PNG 完整性校验：signature（8 字节）+ 首个 chunk 是长度 13 的 IHDR
* （宽高均为正整数）+ 文件末尾 12 字节为完整 IEND chunk。
* 防「工具 exit 0 但只写出签名/截断 PNG」被当成可渲染图片。
* @param buf - 待校验的文件内容
* @returns 通过完整性校验时为 true
*/
function isCompletePng(buf) {
	if (buf.length < 45) return false;
	if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) return false;
	if (buf.readUInt32BE(8) !== 13) return false;
	if (buf.toString("latin1", 12, 16) !== "IHDR") return false;
	if (buf.readUInt32BE(16) === 0 || buf.readUInt32BE(20) === 0) return false;
	return buf.subarray(buf.length - PNG_IEND_CHUNK.length).equals(PNG_IEND_CHUNK);
}
/**
* 依序尝试候选命令，首个产出有效 PNG 的候选返回其内容 Buffer；全部失败返回 null。
*
* 候选级隔离：每个候选把「执行 + 读回 + 校验」作为一体化尝试——先删除
* outputPath（不存在则忽略），再 execFile 要求 exit 0，readFile 读回后以
* isCompletePng 校验完整性（签名 + IHDR + IEND，截断 PNG 不算数）。
* 先删残片是为了避免前一候选留下的非空输出被后一候选
* （exit 0 但没写文件）误判为自己的产出。
*
* 全部失败时若 RIVET_DEBUG 非空，向 stderr 打一行带原因的调试输出
* （哪个工具、什么错误），避免静默降级不可观测。
*
* 注意：硬编码 PNG 校验的前提是两个调用方（toPngCandidates / resizeCandidates）
* 的产出都是 PNG；未来若接入其他输出格式需放宽此校验。
* @param candidates - 依序尝试的候选命令
* @param outputPath - 各候选约定写出的 PNG 路径（每次尝试前先删残片）
* @param timeoutMs - 单个候选的执行超时（默认 15000ms）
* @returns 首个有效 PNG 的内容；全部候选失败返回 null
*/
async function runImageTool(candidates, outputPath, timeoutMs = 15e3) {
	let lastFailure = null;
	for (const { bin, args } of candidates) try {
		await rm(outputPath, { force: true });
		await execFileAsync$1(bin, args, { timeout: timeoutMs });
		const out = await readFile(outputPath);
		if (isCompletePng(out)) return out;
		lastFailure = `${bin}: exit 0 但未产出完整 PNG`;
	} catch (err) {
		lastFailure = `${bin}: ${err instanceof Error ? err.message : String(err)}`;
	}
	if (lastFailure && process.env["RIVET_DEBUG"]) console.error(`[image-tool] 全部 ${candidates.length} 个候选失败，最后一次：${lastFailure}`);
	return null;
}
/**
* 创建本次转换的独立临时目录，并顺手触发惰性清扫（fire-and-forget）。
* @returns 新建临时目录的绝对路径
*/
async function makeImageTempDir() {
	sweepStaleImageTempDirs().catch(() => {});
	return mkdtemp(join(tmpdir(), IMAGE_TEMP_DIR_PREFIX));
}
/**
* 删除转换临时目录；失败静默。
* @param dir - makeImageTempDir 返回的目录路径
*/
async function removeImageTempDir(dir) {
	await rm(dir, {
		recursive: true,
		force: true
	}).catch(() => {});
}
/**
* 清扫超过 1 小时的残留临时目录（进程中断的兜底回收）。
* @param now - 判定陈旧的基准时间戳（默认 Date.now()，可注入用于测试）
*/
async function sweepStaleImageTempDirs(now = Date.now()) {
	let entries;
	try {
		entries = await readdir(tmpdir());
	} catch {
		return;
	}
	for (const entry of entries) {
		if (!entry.startsWith("rivet-imgtool-")) continue;
		const full = join(tmpdir(), entry);
		try {
			if (now - (await stat(full)).mtimeMs > STALE_MS) await rm(full, {
				recursive: true,
				force: true
			});
		} catch {}
	}
}
//#endregion
//#region lib/types/engine/image-attach.js
/**
* TUI image attachment loader — turns an on-disk image path into a base64 data URL
* suitable for the vision model pipeline.
*
* Terminals can only bracketed-paste text, so users paste an image file path; this
* module reads the file, validates the format, and adaptively compresses it so the
* payload stays under the server cap while the resolution stays as high as possible.
*
* 自适应压缩（对齐 opencode-tui desktop 的 compressImageSafe 语义，Node 侧以系统
* 工具实现）：只在超限时压缩；压缩是三级渐进，每级从原图重新编码（不链式再压，
* 避免累积失真）：
*   1. 长边 ≤ maxEdge（默认 1568）：PNG 源保透明输出 PNG，其余格式转 JPEG 0.82
*      （同时完成 provider 白名单转码，BMP/TIFF 等不再原样外发）；
*   2. 仍超限 → JPEG 0.55 同分辨率；
*   3. 仍超限 → 长边 ≤ 1024 + JPEG 0.55。
* 所有档位只缩不放（sips -Z / magick `>` 语义），小图原样发送。
* 压缩成功后可零工具解析出实际宽高（PNG IHDR / JPEG SOF），供气泡展示。
*/
/** Provider cap: 10 MB decoded per image (matches common vision API limits). */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Long-edge clamp. 1568px keeps token cost bounded while staying legible. */
const MAX_EDGE = 1568;
/** Max number of images per prompt (matches desktop Composer). */
const MAX_IMAGES = 4;
/** JPEG quality for the first compression tier. */
const JPEG_QUALITY = 82;
/** Fallback JPEG quality when the first tier's output still exceeds the cap. */
const FALLBACK_QUALITY = 55;
/** Fallback long edge when quality reduction alone is not enough. */
const FALLBACK_EDGE = 1024;
const IMAGE_MIMES = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
	".tiff": "image/tiff",
	".tif": "image/tiff",
	".bmp": "image/bmp"
};
let _runner = null;
/** 注入/清除测试 runner（null 恢复真实 runImageTool）。 */
function setImageToolRunner(runner) {
	_runner = runner;
}
/** 执行候选命令链：测试注入优先，否则走真实系统工具。 */
function runCandidates(candidates, outputPath) {
	return _runner ? _runner(candidates, outputPath) : runImageTool(candidates, outputPath);
}
/**
* 从图片头部解析宽高（零工具调用）：PNG 读 IHDR（偏移 16/20，big-endian），
* JPEG 扫描 SOF0/1/2 段标记（排除 DHT/DAC/JPG 干扰标记）。解析失败返回 null
* （不阻塞发送——宽高只是展示信息）。
* @param buf - 图片内容（至少包含头部）
* @param mime - 图片 MIME（决定解析分支）
* @returns 宽高；无法解析返回 null
*/
function probeImageSize(buf, mime) {
	if (mime === "image/png") {
		if (buf.length < 24) return null;
		const width = buf.readUInt32BE(16);
		const height = buf.readUInt32BE(20);
		if (width === 0 || height === 0) return null;
		return {
			width,
			height
		};
	}
	if (mime === "image/jpeg") {
		let i = 2;
		while (i + 8 < buf.length) {
			if (buf[i] !== 255) {
				i += 1;
				continue;
			}
			const marker = buf[i + 1];
			if (marker === void 0) return null;
			if (marker === 216 || marker === 217 || marker === 1 || marker === 255) {
				i += 2;
				continue;
			}
			const len = buf.readUInt16BE(i + 2);
			if (len < 2 || i + 2 + len > buf.length) return null;
			if (marker >= 192 && marker <= 207 && marker !== 196 && marker !== 200 && marker !== 204) {
				if (len < 8) return null;
				const height = buf.readUInt16BE(i + 5);
				const width = buf.readUInt16BE(i + 7);
				if (width === 0 || height === 0) return null;
				return {
					width,
					height
				};
			}
			i += 2 + len;
		}
		return null;
	}
	return null;
}
/** 按 keepPng/maxEdge/quality 生成候选并执行，返回首个产出；工具全部失败返回 null。 */
async function tryCompress(inPath, dir, keepPng, maxEdge, quality) {
	const outPath = join(dir, keepPng ? "out.png" : "out.jpg");
	return runCandidates(keepPng ? resizeCandidates(inPath, outPath, maxEdge) : resizeJpegCandidates(inPath, outPath, maxEdge, quality), outPath);
}
/**
* 三级自适应压缩，直到字节 ≤ maxBytes。每级从原图重编码。
* @returns 命中预算的输出与格式；无可用图像工具（候选全部失败）返回 null。
* @throws 有工具但三级全部超限——错误带最后一级的实际大小。
*/
async function compressToBudget(absolutePath, dir, maxEdge, maxBytes, sourceMime) {
	const attempts = [
		{
			keepPng: sourceMime === "image/png",
			edge: maxEdge,
			quality: 82
		},
		{
			keepPng: false,
			edge: maxEdge,
			quality: 55
		},
		{
			keepPng: false,
			edge: Math.min(maxEdge, FALLBACK_EDGE),
			quality: 55
		}
	];
	let last = null;
	for (const attempt of attempts) {
		const out = await tryCompress(absolutePath, dir, attempt.keepPng, attempt.edge, attempt.quality);
		if (out === null) return null;
		last = out;
		if (out.length <= maxBytes) return {
			buf: out,
			mime: attempt.keepPng ? "image/png" : "image/jpeg"
		};
	}
	const mb = ((last?.length ?? 0) / (1024 * 1024)).toFixed(1);
	throw new Error(`图片压缩后仍超过上限（${mb} MB），请改用更小的源图`);
}
/**
* 仅按 magic bytes 识别 MIME；不识别即返回 null。
* 不做扩展名 fallback——真实图片（png/jpeg/webp/gif/tiff/bmp）都有可靠 magic，
* 任意内容改名 .png 不应进入转码流程。保留 filePath 参数仅为兼容既有调用签名。
* @param buf - 文件内容（至少前 12 字节参与识别）
* @param _filePath - 未使用；仅为兼容既有调用签名保留
* @returns 识别出的 MIME；无法识别返回 null
*/
function detectImageMime(buf, _filePath) {
	if (buf.length >= 8) {
		if (buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71) return "image/png";
		if (buf[0] === 255 && buf[1] === 216 && buf[2] === 255) return "image/jpeg";
		if (buf.length >= 12 && buf[0] === 82 && buf[1] === 73 && buf[2] === 70 && buf[3] === 70 && buf[8] === 87 && buf[9] === 69 && buf[10] === 66 && buf[11] === 80) return "image/webp";
		if (buf[0] === 71 && buf[1] === 73 && buf[2] === 70) return "image/gif";
		if (buf[0] === 73 && buf[1] === 73 && buf[2] === 42 && buf[3] === 0 || buf[0] === 77 && buf[1] === 77 && buf[2] === 0 && buf[3] === 42) return "image/tiff";
		if (buf[0] === 66 && buf[1] === 77) return "image/bmp";
	}
	return null;
}
/**
* 按文件扩展名判断文本是否像受支持的图片路径（仅粗筛，真实格式以 magic bytes 为准）。
* @param text - 待判断的路径文本（首尾空白会被忽略）
* @returns 扩展名命中受支持图片格式时为 true
*/
function looksLikeImagePath(text) {
	return extname(text.trim()).toLowerCase() in IMAGE_MIMES;
}
/** 组装附件：data URL + 头部解析宽高（解析失败省略宽高，不阻塞发送）。 */
function toAttachment(buf, mime, name) {
	const size = probeImageSize(buf, mime);
	return {
		dataUrl: `data:${mime};base64,${buf.toString("base64")}`,
		mime,
		name,
		...size === null ? {} : {
			width: size.width,
			height: size.height
		}
	};
}
/**
* Load an image from disk and return it as a base64 data URL.
*
* - Validates format by magic bytes (no extension fallback).
* - Rejects unsupported formats.
* - If the decoded file exceeds maxBytes, adaptively compresses it: 1568px
*   (PNG keeps transparency) → JPEG 0.55 → 1024px + 0.55, never upscaling.
* @param absolutePath - 图片文件的绝对路径
* @param options - maxBytes/maxEdge 上限覆盖
* @returns 图片附件（data URL + MIME + 文件名 + 压缩后的宽高）；格式不支持抛错
* @throws 无可用图像工具，或压缩后仍超限（错误信息区分两种原因）
*/
async function loadImageAttachment(absolutePath, options = {}) {
	const maxBytes = options.maxBytes ?? 10485760;
	const maxEdge = options.maxEdge ?? 1568;
	const raw = await readFile(absolutePath);
	const mime = detectImageMime(raw, absolutePath);
	if (!mime) throw new Error(`Unsupported image format: ${absolutePath}`);
	if (raw.length <= maxBytes) return toAttachment(raw, mime, basename(absolutePath));
	const dir = await makeImageTempDir();
	try {
		const result = await compressToBudget(absolutePath, dir, maxEdge, maxBytes, mime);
		if (result === null) throw new Error("Image too large and no image tool produced output. Install an image tool (sips on macOS, ImageMagick on Linux/Windows) to compress.");
		return toAttachment(result.buf, result.mime, basename(absolutePath));
	} finally {
		await removeImageTempDir(dir);
	}
}
//#endregion
//#region lib/types/engine/clipboard-image.js
/**
* Clipboard image reader — reads image data from the system clipboard.
*
* 平台 shell 命令路径（osascript / wl-paste / xclip / PowerShell）+ 测试注入点。
* opencode-tui 上游的 native（@mariozechner/clipboard）路径未移植：dsh 未声明该
* 依赖，动态导入恒失败只会留下死代码；未来引入依赖时按 git 历史恢复即可。
*
* 可测试性设计：setClipboardReader() 注入 mock（单元测试）；tryShellClipboard()
* 接受可注入的 execFile/platform/readFile/tmpdir/randomUUID（shell 路径测试）。
*/
const execFileAsync = promisify(execFile);
/**
* 读系统剪贴板图片；无图或读取失败返回 null（调用方据此 fallback 到文本）。
* 优先测试注入 reader，否则走平台 shell 命令链。
* @returns 剪贴板图片；无图/失败/不支持时为 null
*/
async function readImageFromClipboard() {
	return tryShellClipboard();
}
/**
* 读系统剪贴板文本（Ctrl+V 无图时的 fallback；部分终端不经 bracketed paste
* 传递粘贴文本）。各平台优先 pbpaste / wl-paste / xclip / PowerShell。
* @returns 剪贴板文本；无工具或失败时 null
*/
async function readTextFromClipboard() {
	const pf = process.platform;
	try {
		if (pf === "darwin") return (await execFileAsync("pbpaste", [], {
			timeout: 5e3,
			maxBuffer: 1024 * 1024
		})).stdout;
		if (pf === "linux") try {
			return (await execFileAsync("wl-paste", [], {
				timeout: 5e3,
				maxBuffer: 1024 * 1024
			})).stdout;
		} catch {
			return (await execFileAsync("xclip", [
				"-selection",
				"clipboard",
				"-o"
			], {
				timeout: 5e3,
				maxBuffer: 1024 * 1024
			})).stdout;
		}
		if (pf === "win32") return (await execFileAsync("powershell", [
			"-NoProfile",
			"-Command",
			"Get-Clipboard"
		], {
			timeout: 5e3,
			maxBuffer: 1024 * 1024
		})).stdout;
	} catch {}
	return null;
}
/**
* 平台 shell 剪贴板读图链：darwin osascript / linux wl-paste+xclip / win32
* PowerShell。任一步失败静默降级到下一个平台分支；全部失败返回 null。
* @param opts - 注入参数（缺省用真实 execFile/平台/fs/os）
* @returns 剪贴板图片；不可用时 null
*/
async function tryShellClipboard(opts) {
	const ef = opts?.execFile ?? (async (bin, args) => {
		const r = await execFileAsync(bin, args, {
			timeout: 15e3,
			maxBuffer: 50 * 1024 * 1024,
			encoding: "latin1"
		});
		return {
			stdout: r.stdout,
			stderr: r.stderr
		};
	});
	const pf = opts?.platform ?? process.platform;
	const rf = opts?.readFile ?? (async (p) => {
		const raw = await readFile(p);
		return Buffer.from(raw);
	});
	const td = opts?.tmpdir ?? tmpdir();
	const uuid = opts?.randomUUID ?? randomUUID;
	try {
		if (pf === "darwin") return await tryMacOSClipboard(ef, rf, td, uuid);
		if (pf === "linux") return await tryLinuxClipboard(ef);
		if (pf === "win32") return await tryWindowsClipboard(ef, rf, td, uuid);
	} catch {}
	return null;
}
async function tryMacOSClipboard(ef, rf, td, uuid) {
	let info;
	try {
		info = (await ef("osascript", ["-e", "clipboard info"])).stdout;
	} catch {
		return null;
	}
	if (!info.includes("«class PNG»") && !info.includes("«class jp2»") && !info.includes("TIFF picture") && !info.includes("GIF picture")) return null;
	let imageClass = "«class PNG»";
	if (info.includes("«class PNG»")) imageClass = "«class PNG»";
	else if (info.includes("TIFF picture")) imageClass = "TIFF picture";
	else if (info.includes("GIF picture")) imageClass = "GIF picture";
	const tmpPath = `${td}/rivet-clip-${uuid()}.png`;
	try {
		await ef("osascript", [
			"-e",
			`set theFile to (open for access POSIX file "${tmpPath}" with write permission)`,
			"-e",
			"set eof of theFile to 0",
			"-e",
			`write (the clipboard as ${imageClass}) to theFile`,
			"-e",
			"close access theFile"
		]);
		const buf = await rf(tmpPath);
		if (buf.length === 0) return null;
		const mime = detectImageMime(buf, "clipboard.png");
		if (mime === "image/tiff" || mime === "image/bmp") {
			const pngBuf = await convertToPng(tmpPath, ef, td, uuid);
			if (pngBuf) return bufToClipboardImage(pngBuf, "clipboard.png");
		}
		return bufToClipboardImage(buf, "clipboard.png");
	} catch {
		return null;
	} finally {
		await unlink(tmpPath).catch(() => {});
	}
}
async function tryLinuxClipboard(ef) {
	for (const [bin, args] of [["wl-paste", ["-t", "image/png"]], ["xclip", [
		"-selection",
		"clipboard",
		"-t",
		"image/png",
		"-o"
	]]]) try {
		const r = await ef(bin, args);
		if (!r.stdout || r.stdout.length === 0) continue;
		const buf = Buffer.from(r.stdout, "latin1");
		if (buf.length === 0) continue;
		return bufToClipboardImage(buf, "clipboard.png");
	} catch {}
	return null;
}
async function tryWindowsClipboard(ef, rf, td, uuid) {
	const tmpPath = `${td}\\rivet-clip-${uuid()}.png`;
	try {
		await ef("powershell", [
			"-NoProfile",
			"-Command",
			`
Add-Type -AssemblyName System.Windows.Forms
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($img) { $img.Save('${tmpPath.replace(/\\/g, "\\\\")}', [System.Drawing.Imaging.ImageFormat]::Png); Write-Output 'ok' }
else { exit 1 }
`.trim()
		]);
		const buf = await rf(tmpPath);
		if (buf.length === 0) return null;
		return bufToClipboardImage(buf, "clipboard.png");
	} catch {
		return null;
	} finally {
		await unlink(tmpPath).catch(() => {});
	}
}
/** TIFF/BMP 经 macOS sips 转 PNG；失败返回 null。 */
async function convertToPng(srcPath, ef, td, uuid) {
	if (process.platform !== "darwin") return null;
	const pngPath = `${td}/rivet-clip-${uuid()}.png`;
	try {
		await ef("sips", [
			"-s",
			"format",
			"png",
			srcPath,
			"--out",
			pngPath
		]);
		const { readFile } = await import("node:fs/promises");
		const pngBuf = await readFile(pngPath);
		return pngBuf.length > 0 ? pngBuf : null;
	} catch {
		return null;
	} finally {
		const { unlink } = await import("node:fs/promises");
		await unlink(pngPath).catch(() => {});
	}
}
function bufToClipboardImage(buf, name) {
	const mime = detectImageMime(buf, name) ?? "image/png";
	return {
		dataUrl: `data:${mime};base64,${buf.toString("base64")}`,
		mime,
		name,
		source: mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpeg" : "image"
	};
}
//#endregion
//#region lib/types/engine/term-image.js
/**
* 终端内联图片渲染 — 把 data URL 图片准备/编码为 kitty / iTerm2 图形协议序列。
*
* 协议事实（与 detectImageProtocol 配套）：
* - kitty APC：`\x1B_G<control>;<base64 payload>\x1B\\`，仅支持 RGB/RGBA/PNG 载荷
*   （f=100 = PNG），非 PNG 需先转码。base64 必须按 ≤4096 字节分块，除末块外
*   长度须为 4 的倍数，用 m=1/0 标记。q=2 抑制终端响应，避免污染 stdin 解析。
*   同时给 c（列）和 r（行）时终端把图片缩放进该单元格矩形（保持宽高比），
*   放置后光标下移 r 行、停在图片右缘列——几何有界、位置确定，这是 live 区
*   锚点安全的前提；调用方随后输出 `\r` 回到行首。
* - iTerm2 OSC 1337：`\x1B]1337;File=inline=1;width=N;height=M:<base64>\x07`，
*   直接支持 png/jpeg/gif/webp，宽高以单元格计，preserveAspectRatio=1 下
*   图片适配进宽高超框，绘制后光标停在图片末行右缘；调用方随后输出 `\r\n`
*   把光标移到图片下方行首。
* 两种序列都会被不支持的终端静默忽略，因此检测失误的最坏结果是图片不显示。
*
* 安全边界：data URL 载荷在编码前必须通过严格 base64 校验（RFC 4648 字母表 +
* 合法 padding + 非空 + 长度 4 对齐），否则载荷里的 BEL/ESC/ST 可以提前终止
* OSC/APC 序列并向终端注入任意控制序列。
*/
/** kitty 协议单块 base64 上限（协议规定 ≤4096 且除末块外须为 4 的倍数）。 */
const KITTY_CHUNK = 4096;
/**
* 估算字符 cell 高宽比（≈2，主流等宽字体）。
* 只用于把 kitty 的 r 收紧到图片实际需要行数；估错只会留白或轻微缩放，
* 不影响正确性（光标移动行数以我们给出的 r 为准，与图片内容无关）。
*/
const CELL_ASPECT = 2;
/** 编码白名单：两种协议合计可直接/可转换展示的 MIME。 */
const SUPPORTED_MIMES = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"image/tiff",
	"image/bmp"
]);
const MIME_EXTS = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/gif": ".gif",
	"image/webp": ".webp",
	"image/tiff": ".tiff",
	"image/bmp": ".bmp"
};
/** RFC 4648 base64（标准字母表 + 合法 padding）。 */
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
/**
* 解析并校验 data URL → { mime, b64 }。
* 拒绝：非 data URL、非白名单 MIME、空载荷、含控制字符/非法字符的载荷、
* 非法 padding、长度非 4 对齐、解码后超过 MAX_IMAGE_BYTES。
* @param dataUrl - `data:<mime>;base64,<payload>` 形式的字符串
* @returns 小写 MIME 与已校验的 base64 载荷；任一校验失败返回 null
*/
function parseImageDataUrl(dataUrl) {
	const m = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl);
	if (!m || m[1] === void 0 || m[2] === void 0) return null;
	const mime = m[1].toLowerCase();
	if (!SUPPORTED_MIMES.has(mime)) return null;
	const b64 = m[2];
	if (b64.length === 0 || b64.length % 4 !== 0 || !BASE64_RE.test(b64)) return null;
	const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
	if (b64.length * 3 / 4 - padding > 10485760) return null;
	return {
		mime,
		b64
	};
}
/** 从 PNG base64 解出 IHDR 宽高（解码前 33 字节即可）；非法 PNG 返回 null。 */
function pngDimensions(pngB64) {
	const head = Buffer.from(pngB64.slice(0, 44), "base64");
	if (head.length < 24 || head[0] !== 137 || head[1] !== 80 || head[2] !== 78 || head[3] !== 71) return null;
	const width = head.readUInt32BE(16);
	const height = head.readUInt32BE(20);
	if (width <= 0 || height <= 0) return null;
	return {
		width,
		height
	};
}
/**
* 非 PNG 转码为 PNG base64（kitty 协议只接受 PNG 容器）。
* 走共享图像工具执行器的平台感知候选（见 toPngCandidates），每次转换独立
* 临时目录；全部失败返回 null，调用方降级为文本占位。
*/
async function ensurePngBase64(mime, b64) {
	if (mime === "image/png") return b64;
	const dir = await makeImageTempDir();
	const inPath = join(dir, `in${MIME_EXTS[mime] ?? ".img"}`);
	const outPath = join(dir, "out.png");
	try {
		await writeFile(inPath, Buffer.from(b64, "base64"));
		const png = await runImageTool(toPngCandidates(inPath, outPath), outPath);
		if (!png) return null;
		return png.toString("base64");
	} finally {
		await removeImageTempDir(dir);
	}
}
/**
* data URL → 已备图片（慢速部分：校验 + 必要的 PNG 转码）。
* 在 commit 前异步完成；编码（快速、与终端尺寸相关）留到写入时进行，
* 使转码期间的终端 resize 不会用过期宽度编码。
* 返回 null 表示无法准备，调用方保持文本占位。
* @param dataUrl - 图片 data URL（经 parseImageDataUrl 校验）
* @param protocol - 目标终端图形协议（kitty 需 PNG，必要时转码）
* @returns 已备图片材料；校验或转码失败返回 null
*/
async function prepareTermImage(dataUrl, protocol) {
	const parsed = parseImageDataUrl(dataUrl);
	if (!parsed) return null;
	if (protocol === "iterm2" && (parsed.mime === "image/png" || parsed.mime === "image/jpeg" || parsed.mime === "image/gif" || parsed.mime === "image/webp")) return { b64: parsed.b64 };
	const png = await ensurePngBase64(parsed.mime, parsed.b64);
	if (!png) return null;
	const dims = pngDimensions(png);
	return dims ? {
		b64: png,
		pixelWidth: dims.width,
		pixelHeight: dims.height
	} : { b64: png };
}
/**
* iTerm2 OSC 1337 内联图片序列。宽高以单元格计，图片按比例适配进超框。
* @param b64 - 图片 base64 载荷（png/jpeg/gif/webp，须已通过校验）
* @param cols - 超框宽度（单元格列数）
* @param maxRows - 超框高度（单元格行数）
* @returns OSC 1337 转义序列（末尾不含换行）
*/
function encodeIterm2Image(b64, cols, maxRows) {
	return `\x1B]1337;File=inline=1;width=${cols};height=${maxRows};preserveAspectRatio=1:${b64}\x07`;
}
/**
* kitty APC 图形序列（f=100 PNG，分块直传，c×r 有界单元格矩形）。
* @param b64Png - PNG 图片的 base64 载荷（协议只接受 PNG 容器）
* @param cols - 放置矩形宽度（单元格列数）
* @param rows - 放置矩形高度（单元格行数）
* @returns 分块拼接的 APC 序列；空载荷返回 ''
*/
function encodeKittyImage(b64Png, cols, rows) {
	const chunks = [];
	for (let i = 0; i < b64Png.length; i += KITTY_CHUNK) chunks.push(b64Png.slice(i, i + KITTY_CHUNK));
	if (chunks.length === 0) return "";
	return chunks.map((chunk, i) => {
		const more = i < chunks.length - 1 ? 1 : 0;
		return `\x1B_G${i === 0 ? `a=T,f=100,q=2,c=${cols},r=${rows},m=${more}` : `q=2,m=${more}`};${chunk}\x1B\\`;
	}).join("");
}
/**
* 已备图片 → 终端图形序列。cols/maxRows 应在写入当刻取最新终端尺寸。
* kitty 用像素尺寸把 r 收紧到实际需要行数（受 maxRows 封顶），
* 拿不到尺寸时退回 maxRows（宁可留白，几何必须有界）。
* 序列末尾不含换行，由调用方控制光标。
* @param image - prepareTermImage 产出的已备图片
* @param protocol - 目标终端图形协议
* @param cols - 可用宽度（单元格列数，下限 10）
* @param maxRows - 高度上限（单元格行数，下限 1）
* @returns 终端图形序列；kitty 空载荷时为 ''
*/
function encodeTermImage(image, protocol, cols, maxRows) {
	const width = Math.max(10, cols);
	const rowCap = Math.max(1, maxRows);
	if (protocol === "iterm2") return encodeIterm2Image(image.b64, width, rowCap);
	let rows = rowCap;
	if (image.pixelWidth && image.pixelHeight) rows = Math.min(rowCap, Math.max(1, Math.ceil(image.pixelHeight / image.pixelWidth * (width / CELL_ASPECT))));
	return encodeKittyImage(image.b64, width, rows);
}
let prepareOverride = null;
/**
* 测试钩子：替换 prepare 实现（null 恢复真实实现）。
* @param fn - 替代的 prepare 实现；null 恢复真实实现
*/
function setTermImagePreparer(fn) {
	prepareOverride = fn;
}
/**
* app 层统一入口：走注入点后的 prepare。
* @param dataUrl - 图片 data URL
* @param protocol - 目标终端图形协议
* @returns 已备图片材料；无法准备时为 null
*/
async function prepareTermImageForCommit(dataUrl, protocol) {
	return (prepareOverride ?? prepareTermImage)(dataUrl, protocol);
}
//#endregion
//#region lib/types/adapter/transcript.js
/**
* Read-only transcript projection: derives a TUI-facing conversation view from
* the session log. The session log is the authoritative fact source; this
* module never appends to it and invents no new event vocabulary — every
* projected fact traces to one {@link SessionEvent} of the canonical
* {@link SessionEventMap}.
*
* Two layers: a pure, immutable fold (`emptyTranscript` / `applyTranscriptEvent`)
* that is trivially unit-testable, and a live subscription wrapper
* (`createTranscript`) that replays the session's existing log and then folds
* every `session/event` publication for that session.
*
* @module @deepseek-ai/dsh-tianshu-tui/adapter/transcript
*/
/**
* An empty transcript view for `sessionId`, before any event is folded.
* @param sessionId - 视图所属的会话 id。
* @returns 空消息/空工具、turn 与 seq 均为 -1 的初始视图。
*/
function emptyTranscript(sessionId) {
	return {
		sessionId,
		messages: [],
		streaming: void 0,
		tools: [],
		turn: -1,
		firstInTurnTime: void 0,
		seq: -1
	};
}
/** Fold the text-bearing blocks of a message's content into one display string. */
function foldText(content) {
	let out = "";
	for (const block of content) if (block.type === "text") out += block.text;
	return out;
}
/** Fold the reasoning blocks of a message's content into one display string (kept apart from text). */
function foldReasoning(content) {
	let out = "";
	for (const block of content) if (block.type === "reasoning") out += block.text;
	return out;
}
/**
* Fold one committed session event into the derived view. Returns a NEW view.
* @param view - 折叠前的视图（不被就地修改）。
* @param event - 已提交的会话事件。
* @returns 折叠后的新视图；与投影无关的事件只推进 seq 水位。
*/
function applyTranscriptEvent(view, event) {
	const base = {
		...view,
		seq: event.seq
	};
	switch (event.type) {
		case "user/message": {
			const row = {
				seq: event.seq,
				time: event.time,
				kind: "user",
				turn: view.turn,
				step: void 0,
				text: foldText(event.data.content),
				reasoning: "",
				event
			};
			return {
				...base,
				messages: [...base.messages, row],
				...base.firstInTurnTime === void 0 ? { firstInTurnTime: event.time } : {}
			};
		}
		case "assistant/chunk": {
			const { turn, step, chunk } = event.data;
			const text = chunk.type === "text-delta" ? chunk.text : "";
			const reasoning = chunk.type === "reasoning-delta" ? chunk.text : "";
			const current = base.streaming;
			const streaming = current !== void 0 && current.turn === turn && current.step === step ? {
				...current,
				text: current.text + text,
				reasoning: current.reasoning + reasoning
			} : {
				turn,
				step,
				text,
				reasoning
			};
			return {
				...base,
				streaming
			};
		}
		case "assistant/message": {
			const { turn, step, message } = event.data;
			const row = {
				seq: event.seq,
				time: event.time,
				kind: "assistant",
				turn,
				step,
				text: foldText(message.content),
				reasoning: foldReasoning(message.content),
				event
			};
			const streaming = base.streaming !== void 0 && base.streaming.turn === turn && base.streaming.step === step ? void 0 : base.streaming;
			return {
				...base,
				messages: [...base.messages, row],
				streaming,
				...row.turn === base.turn && base.firstInTurnTime === void 0 ? { firstInTurnTime: event.time } : {}
			};
		}
		case "tool/call": {
			const { callId, name, arguments: raw, turn, step } = event.data;
			const tool = {
				callId,
				name,
				arguments: raw,
				turn,
				step,
				seq: event.seq,
				time: event.time,
				result: void 0,
				error: void 0
			};
			return {
				...base,
				tools: [...base.tools, tool]
			};
		}
		case "tool/result": {
			const { toolCallId: callId } = event.data.message.content[0];
			const tools = base.tools.map((tool) => {
				if (tool.callId !== callId) return tool;
				return {
					...tool,
					result: event,
					...event.data.error === void 0 ? {} : { error: event.data.error }
				};
			});
			return {
				...base,
				tools
			};
		}
		case "turn/start": return {
			...base,
			turn: event.data.turn,
			firstInTurnTime: void 0
		};
		default: return base;
	}
}
/**
* Create a live transcript projection for one session.
* @param ctx - any context of the app; used to subscribe to `session/event`.
* @param session - the live session whose log is projected. Its existing
*   `events` are folded at creation (replay); later appends arrive via the
*   `session/event` firehose, filtered by session id.
* @returns the live projection; call `dispose()` to detach its subscription.
*/
function createTranscript(ctx, session) {
	let view = emptyTranscript(session.id);
	for (const event of session.events) view = applyTranscriptEvent(view, event);
	const handler = (owner, event) => {
		if (owner.id !== session.id) return;
		view = applyTranscriptEvent(view, event);
	};
	const dispose = ctx.on("session/event", handler);
	return {
		get view() {
			return view;
		},
		dispose() {
			dispose();
		}
	};
}
//#endregion
//#region lib/types/adapter/tool-view.js
/**
* presenter 桥 — 把 harness 工具声明的渲染意图（ToolDefinition.presentCall /
* presentResult）软降级地解析给 TUI 渲染层。
*
* 镜像 apiproxy `viewFor` 的消费模式（packages/host/apiproxy）：presenter
* 是 args 的纯函数，live 结算与 resume replay 走同一条桥；tools 服务缺失、
* 工具未注册、参数 JSON 不可解析、presenter 抛错——一律降级为「无意图」，
* 渲染层回落 formatToolCard 文本折叠。展示层失败绝不中断会话流。
*
* @module @deepseek-ai/dsh-tianshu-tui/adapter/tool-view
*/
/**
* 解析一次工具调用的渲染意图（presentCall + 可选 presentResult）。
* @param tools - tools 服务面；缺失（服务未装配）时直接降级。
* @param request - 调用事实（名字、原始参数、可选已结算结果）。
* @returns 解析出的渲染意图；任何失败路径返回空对象（软降级）。
*/
function resolveToolViews(tools, request) {
	if (tools === void 0) return {};
	const definition = tools.get(request.name);
	if (definition === void 0) return {};
	try {
		const args = JSON.parse(request.argumentsRaw);
		const call = definition.presentCall?.(args);
		const result = request.result === void 0 ? void 0 : definition.presentResult?.(args, {
			content: request.result.content,
			isError: request.result.isError,
			...request.result.meta === void 0 ? {} : { meta: request.result.meta }
		});
		return {
			...call === void 0 ? {} : { call },
			...result === void 0 ? {} : { result }
		};
	} catch {
		return {};
	}
}
//#endregion
//#region lib/types/adapter/live.js
/**
* Live agent projection: derives a TUI-facing view of one agent's live state
* from the `agent/*` event stream (`agent/status`, `agent/inbox/*`,
* `agent/error`, `agent/disposed`). No new event vocabulary is invented and no
* state is written back — the events are the fact source, this is a projection.
*
* Two layers mirror the transcript module: a pure fold (`emptyLiveState` /
* `applyLiveEvent`) and a live subscription wrapper (`trackAgent`).
*
* @module @deepseek-ai/dsh-tianshu-tui/adapter/live
*/
/**
* An empty live state for `id`, with no event yet folded.
* @param id - 被追踪的 agent/会话 id。
* @returns idle、空 inbox、live=true 的初始状态。
*/
function emptyLiveState(id) {
	return {
		id,
		status: "idle",
		inbox: [],
		lastError: void 0,
		live: true,
		activity: void 0
	};
}
/** Remove a message by identity from the pending inbox list. */
function withoutMessage(inbox, id) {
	return inbox.filter((message) => message.id !== id);
}
/**
* Fold one agent-scoped event into the derived state. Returns a NEW state.
* @param state - the previous derived state.
* @param event - one discriminated agent event: status, inbox mutation,
*   tool activity, error, or disposal. Payloads for other agents are filtered
*   by the caller.
* @returns the folded state.
*/
function applyLiveEvent(state, event) {
	switch (event.type) {
		case "status": return event.status === "running" ? {
			...state,
			status: event.status,
			lastError: void 0
		} : {
			...state,
			status: event.status
		};
		case "inbox-inserted": return {
			...state,
			inbox: [...state.inbox, event.message]
		};
		case "inbox-claimed":
		case "inbox-discarded": return {
			...state,
			inbox: withoutMessage(state.inbox, event.messageId)
		};
		case "tool-call": return {
			...state,
			activity: {
				callId: event.callId,
				name: event.name,
				arguments: event.arguments,
				turn: event.turn,
				step: event.step
			}
		};
		case "tool-result": return state.activity?.callId === event.callId ? {
			...state,
			activity: void 0
		} : state;
		case "error": return {
			...state,
			lastError: {
				turn: event.turn,
				step: event.step,
				error: event.error
			}
		};
		case "disposed": return {
			...state,
			live: false
		};
	}
}
/**
* Track one agent's live state. Seeds from the registry when the agent is
* already live; thereafter folds every matching `agent/*` event. The caller
* owns the agent handle it may hold — this projection never disposes it.
* @param ctx - any context of the app; used to subscribe to `agent/*` events
*   (globally dispatched, so events are filtered by agent id here).
* @param id - the agent/session id to track.
* @returns the live projection; call `dispose()` to detach.
*/
function trackAgent(ctx, id) {
	const seeded = ctx.agents.get(id);
	let state = {
		...emptyLiveState(id),
		status: seeded?.status ?? "idle",
		live: seeded !== void 0,
		inbox: seeded === void 0 ? [] : [...seeded.inbox.nextTurn, ...seeded.inbox.nextStep]
	};
	const onStatus = ({ agent, status }) => {
		if (agent.id !== id) return;
		state = applyLiveEvent(state, {
			type: "status",
			status
		});
	};
	const onInserted = ({ agent, message }) => {
		if (agent.id !== id) return;
		state = applyLiveEvent(state, {
			type: "inbox-inserted",
			message
		});
	};
	const onClaimed = ({ agent, message }) => {
		if (agent.id !== id) return;
		state = applyLiveEvent(state, {
			type: "inbox-claimed",
			messageId: message.id
		});
	};
	const onDiscarded = ({ agent, message }) => {
		if (agent.id !== id) return;
		state = applyLiveEvent(state, {
			type: "inbox-discarded",
			messageId: message.id
		});
	};
	const onError = ({ agent, turn, step, error }) => {
		if (agent.id !== id) return;
		state = applyLiveEvent(state, {
			type: "error",
			turn,
			step,
			error
		});
	};
	const onDisposed = ({ agent }) => {
		if (agent.id !== id) return;
		state = applyLiveEvent(state, { type: "disposed" });
	};
	const onSessionEvent = (owner, event) => {
		if (owner.id !== id) return;
		switch (event.type) {
			case "tool/call":
				state = applyLiveEvent(state, {
					type: "tool-call",
					turn: event.data.turn,
					step: event.data.step,
					callId: event.data.callId,
					name: event.data.name,
					arguments: event.data.arguments
				});
				break;
			case "tool/result":
				state = applyLiveEvent(state, {
					type: "tool-result",
					callId: event.data.message.source.callId
				});
				break;
			default: break;
		}
	};
	const disposers = [
		ctx.on("agent/status", onStatus),
		ctx.on("agent/inbox/inserted", onInserted),
		ctx.on("agent/inbox/claimed", onClaimed),
		ctx.on("agent/inbox/discarded", onDiscarded),
		ctx.on("agent/error", onError),
		ctx.on("agent/disposed", onDisposed),
		ctx.on("session/event", onSessionEvent)
	];
	return {
		get state() {
			return state;
		},
		dispose() {
			for (const dispose of disposers) dispose();
		}
	};
}
//#endregion
//#region lib/types/adapter/send.js
/**
* TUI output control surface: turns user intent into driver input through the
* {@link Agent} public interface. A handle-created agent is driven through the
* handle the TUI itself owns; a switched-to session is driven through the bare
* agent returned by `ctx.agents.get(id)` and is NEVER disposed here (only the
* handle holder — the structural owner — may tear an agent down). This module
* writes no session events directly: `followup`/`steer`/`inject` submit inbox
* input that the agent loop logs through its own durable channels.
*
* @module @deepseek-ai/dsh-tianshu-tui/adapter/send
*/
/** 解析 data URL（`data:<mediaType>;base64,<bytes>`）为 attachment 保存入参。 */
function parseImageDataUrl$1(dataUrl) {
	const match = /^data:([a-zA-Z0-9./+-]+);base64,(.+)$/.exec(dataUrl);
	if (match === null) throw new Error(`无法解析图片 data URL（缺 base64 载荷）：${dataUrl.slice(0, 40)}…`);
	const mediaType = match[1];
	const payload = match[2];
	if (mediaType === void 0 || payload === void 0) throw new Error(`无法解析图片 data URL（分组缺失）：${dataUrl.slice(0, 40)}…`);
	if (![
		"image/png",
		"image/jpeg",
		"image/webp",
		"image/gif"
	].includes(mediaType)) throw new Error(`不支持的图片 media type：${mediaType}`);
	return {
		data: Buffer.from(payload, "base64"),
		mediaType
	};
}
/** Build an identified text-only user message (synchronous fast path). */
function toUserMessageSync(text) {
	return createUserMessage({
		content: [{
			type: "text",
			text
		}],
		source: { kind: "user" }
	});
}
/**
* Build an identified user message from plain TUI input text + optional image
* attachments. Images arrive as data URLs (paste/attach pipeline) and are
* durably committed through the attachment service before the message is
* published, so the message content carries only the stable reference.
* @param ctx - context exposing `ctx.attachments` (fails loud when absent).
* @param text - the prompt text.
* @param images - optional image data URLs, committed in order.
* @returns the identified user message with attachment-backed image blocks.
*/
async function toUserMessage(ctx, text, images) {
	if (images === void 0 || images.length === 0) return toUserMessageSync(text);
	const content = [{
		type: "text",
		text
	}];
	const attachments = ctx.reflect.get("attachments", false);
	if (attachments === void 0) throw new Error("图片发送需要 attachments 服务（attachment-local 未装配）");
	for (const dataUrl of images) {
		const attachment = await attachments.saveImage(parseImageDataUrl$1(dataUrl));
		content.push({
			type: "image",
			attachment
		});
	}
	return createUserMessage({
		content,
		source: { kind: "user" }
	});
}
/**
* Build controls for an agent the caller OWNS through a handle. The handle
* itself is intentionally not exposed here — disposal stays with the holder
* (`handle.dispose()`); this surface only drives the agent.
* @param handle - the owned handle returned by `ctx.agents.create`/`resume`.
* @returns the drive-only control surface over `handle.agent`.
*/
function controlsFromHandle(handle) {
	return controlsFromAgent(handle.agent);
}
/**
* Build controls for a bare agent the caller does NOT own. Never disposes the
* agent: teardown of a switched-to session belongs to its structural owner.
* @param agent - a bare agent, e.g. from `ctx.agents.get(id)`.
* @returns the drive-only control surface over the agent.
*/
function controlsFromAgent(agent) {
	return {
		followup: (text, images) => {
			if (images === void 0 || images.length === 0) {
				agent.followup(toUserMessageSync(text));
				return Promise.resolve();
			}
			return toUserMessage(agent.ctx, text, images).then((message) => {
				agent.followup(message);
			});
		},
		steer: (text) => {
			agent.steer(toUserMessageSync(text));
		},
		inject: (text) => {
			agent.inject(toUserMessageSync(text));
		},
		cancel: (cause, options) => {
			if (options === void 0) agent.cancel(cause);
			else agent.cancel(cause, options);
		},
		whenIdle: () => agent.whenIdle()
	};
}
/**
* Resolve controls for a live agent by session id through the registry, for
* session switching. The returned surface drives the bare agent and never
* disposes it (non-owner semantics).
* @param ctx - any context exposing `ctx.agents`.
* @param id - the shared agent/session id to look up.
* @returns controls for the live agent, or `undefined` when none is registered.
*/
function controlsFromRegistry(ctx, id) {
	const agent = ctx.agents.get(id);
	return agent === void 0 ? void 0 : controlsFromAgent(agent);
}
//#endregion
//#region lib/types/adapter/sessions.js
/**
* Session management surface: listing, lookup, forking, history loading, and
* teardown flushing. The session log is the authoritative fact source — this
* module only READS logs and the live store; it never appends events and never
* disposes agents (a handle's teardown belongs to its holder).
*
* @module @deepseek-ai/dsh-tianshu-tui/adapter/sessions
*/
function toSummary(header) {
	return {
		id: header.id,
		version: header.version,
		createdAt: header.createdAt,
		cwd: header.cwd,
		parentSession: header.parentSession
	};
}
/**
* List known sessions, newest first. Persisted sessions come from
* `ctx.sessionPersistence` (metadata-only listing) when that service is
* configured; otherwise the live in-memory store's headers are used.
* @param ctx - any context exposing `ctx.sessions` and optionally
*   `ctx.sessionPersistence`.
* @returns one summary per known session, ordered by `createdAt` descending.
*/
async function listSessions(ctx) {
	const persistence = ctx.get("sessionPersistence");
	return (persistence !== void 0 ? await persistence.list() : ctx.sessions.list().map((session) => session.header)).map(toSummary).sort((a, b) => b.createdAt - a.createdAt);
}
/**
* Resolve the live session object for an id.
* @param ctx - any context exposing `ctx.sessions`.
* @param id - the session id to look up.
* @returns the live session, or `undefined` when not in the live store.
*/
function getSession(ctx, id) {
	return ctx.sessions.get(id);
}
/**
* Flush every live session to durable storage — the teardown checkpoint.
* Each flush dispatches the awaited `session/flush` durability barrier through
* `ctx.sessions.flush`; persistence plugins drain their buffers there.
* @param ctx - any context exposing `ctx.sessions`.
* @returns after every live session's flush has settled; the first listener
*   failure propagates.
*/
async function flushAll(ctx) {
	for (const session of ctx.sessions.list()) await ctx.sessions.flush(session);
}
/** 全部内置主题调色板（名字 → 定义）；消费方经 theme.ts 的 buildTheme/THEMES 使用。 */
const THEME_PALETTES = {
	pastel: {
		background: "dark",
		description: "温和粉彩。二次元风格启发，高对比、低饱和度多色卡。",
		truecolor: {
			primary: "#a8e6cf",
			secondary: "#d4a5f5",
			success: "#d0f0a8",
			warning: "#ffe0a3",
			error: "#ff9aa2",
			dim: "#8585a0",
			pulseQuiet: "#4a4a5a",
			pulseActive: "#a8e6cf",
			pulseAlert: "#ff9aa2"
		},
		fallback: {
			primary: "cyan",
			secondary: "magenta",
			success: "green",
			warning: "yellow",
			error: "red",
			dim: "gray",
			pulseQuiet: "gray",
			pulseActive: "cyan",
			pulseAlert: "red"
		}
	},
	cyberpunk: {
		background: "dark",
		description: "赛博朋克。霓虹极高对比，酷炫亮眼。",
		truecolor: {
			primary: "#48c6e2",
			secondary: "#c4a3ff",
			success: "#4ade80",
			warning: "#fbbf24",
			error: "#e27585",
			dim: "#9494b8",
			pulseQuiet: "#2f3048",
			pulseActive: "#48c6e2",
			pulseAlert: "#e27585"
		},
		fallback: {
			primary: "cyan",
			secondary: "magenta",
			success: "green",
			warning: "yellow",
			error: "red",
			dim: "gray",
			pulseQuiet: "gray",
			pulseActive: "cyan",
			pulseAlert: "red"
		}
	},
	observatory: {
		background: "dark",
		description: "五色星辰。传统五行配色体系，天玑星君玄灰底色。",
		truecolor: {
			primary: "#7c78f2",
			secondary: "#a78bfa",
			success: "#34d399",
			warning: "#f59e0b",
			error: "#f87171",
			dim: "#8da0b8",
			pulseQuiet: "#334155",
			pulseActive: "#7c78f2",
			pulseAlert: "#f87171"
		},
		fallback: {
			primary: "blue",
			secondary: "magenta",
			success: "green",
			warning: "yellow",
			error: "red",
			dim: "gray",
			pulseQuiet: "gray",
			pulseActive: "cyan",
			pulseAlert: "red"
		}
	},
	midnight: {
		background: "dark",
		description: "GitHub 暗黑风格。极简中性灰度，高度清晰。",
		truecolor: {
			primary: "#58a6ff",
			secondary: "#b0b8c4",
			success: "#3fb950",
			warning: "#d29922",
			error: "#f85149",
			dim: "#8b949e",
			pulseQuiet: "#3d4450",
			pulseActive: "#58a6ff",
			pulseAlert: "#f85149"
		},
		overrides: {
			userColor: "#e6edf3",
			assistantColor: "#e6edf3"
		},
		fallback: {
			primary: "blue",
			secondary: "white",
			success: "green",
			warning: "yellow",
			error: "red",
			dim: "gray",
			pulseQuiet: "gray",
			pulseActive: "blue",
			pulseAlert: "red"
		},
		fallbackOverrides: {
			userColor: "white",
			assistantColor: "white"
		}
	},
	starfield: {
		background: "dark",
		description: "星空星座。Rivet 原生星图美学，天蓝主星与星云紫辅色。",
		truecolor: {
			primary: "#8ab4ff",
			secondary: "#c9a9ff",
			success: "#7ee7c7",
			warning: "#ffd479",
			error: "#ff8a9b",
			dim: "#959dbe",
			pulseQuiet: "#2b3052",
			pulseActive: "#8ab4ff",
			pulseAlert: "#ff8a9b"
		},
		overrides: {
			userColor: "#e8ecf8",
			assistantColor: "#c9a9ff",
			muted: "#aab4d4"
		},
		fallback: {
			primary: "blue",
			secondary: "magenta",
			success: "cyan",
			warning: "yellow",
			error: "red",
			dim: "gray",
			pulseQuiet: "gray",
			pulseActive: "blue",
			pulseAlert: "red"
		},
		fallbackOverrides: {
			userColor: "white",
			assistantColor: "magenta"
		}
	},
	tianshu: {
		background: "dark",
		description: "玄夜墨色。95% 墨灰，配以星金主色与朱砂用户印，沉稳低调。",
		truecolor: {
			primary: "#dfb282",
			secondary: "#a49ac7",
			success: "#75a399",
			warning: "#d1914a",
			error: "#bd5f7a",
			dim: "#8a8fa0",
			pulseQuiet: "#3a3d4a",
			pulseActive: "#dfb282",
			pulseAlert: "#d86459",
			toolShell: "#a0a3b0",
			toolEdit: "#a49ac7"
		},
		overrides: {
			userColor: "#d86459",
			assistantColor: "#d2d5dd",
			muted: "#adb2bf",
			systemColor: "#adb2bf"
		},
		fallback: {
			primary: "yellowBright",
			secondary: "magenta",
			success: "cyan",
			warning: "yellow",
			error: "redBright",
			dim: "gray",
			pulseQuiet: "gray",
			pulseActive: "yellowBright",
			pulseAlert: "red"
		},
		fallbackOverrides: {
			userColor: "red",
			assistantColor: "white"
		}
	},
	claude: {
		background: "dark",
		description: "Claude Code 官方 TUI 经典调色盘移植。橘黄经典。",
		truecolor: {
			primary: "#d77757",
			secondary: "#af87ff",
			success: "#4eba65",
			warning: "#ffc107",
			error: "#ff6b80",
			dim: "#767676",
			pulseQuiet: "#888888",
			pulseActive: "#d77757",
			pulseAlert: "#ff6b80"
		},
		overrides: {
			userColor: "#d77757",
			assistantColor: "#d9d9d9",
			muted: "#999999"
		},
		fallback: {
			primary: "redBright",
			secondary: "magentaBright",
			success: "greenBright",
			warning: "yellowBright",
			error: "redBright",
			dim: "white",
			pulseQuiet: "white",
			pulseActive: "redBright",
			pulseAlert: "redBright"
		},
		fallbackOverrides: {
			userColor: "redBright",
			assistantColor: "white"
		}
	},
	ziwei: {
		background: "dark",
		description: "帝星紫微。朱砂红标记点缀帝星紫，富含中国星图古典美学韵味。",
		truecolor: {
			primary: "#c9b8ff",
			secondary: "#8ab4ff",
			success: "#7ee7c7",
			warning: "#ffd479",
			error: "#ff8a9b",
			dim: "#868ba8",
			pulseQuiet: "#3a3d4a",
			pulseActive: "#c9b8ff",
			pulseAlert: "#d4453a",
			toolShell: "#8ab4ff",
			toolEdit: "#c9b8ff",
			toolTest: "#7ee7c7",
			toolDelegate: "#ffd479"
		},
		overrides: {
			userColor: "#d4453a",
			assistantColor: "#c9b8ff",
			muted: "#9aa2b1"
		},
		fallback: {
			primary: "magenta",
			secondary: "blue",
			success: "cyan",
			warning: "yellow",
			error: "redBright",
			dim: "gray",
			pulseQuiet: "gray",
			pulseActive: "magenta",
			pulseAlert: "red"
		},
		fallbackOverrides: {
			userColor: "red",
			assistantColor: "magenta",
			muted: "white"
		}
	},
	slate: {
		background: "dark",
		description: "冷静板岩灰。单一冷静 Teal 主色，无彩色结构，低眩光长久不累。",
		truecolor: {
			primary: "#56b6c2",
			secondary: "#7aa2cf",
			success: "#7fb88a",
			warning: "#d6a35c",
			error: "#e08891",
			dim: "#848d9c",
			pulseQuiet: "#39414f",
			pulseActive: "#56b6c2",
			pulseAlert: "#e08891",
			toolShell: "#7aa2cf",
			toolEdit: "#6fb3ab",
			toolTest: "#7fb88a",
			toolDelegate: "#d6a35c"
		},
		overrides: {
			userColor: "#e2e6ec",
			assistantColor: "#c4c9d2",
			muted: "#8b93a3"
		},
		fallback: {
			primary: "cyan",
			secondary: "blue",
			success: "green",
			warning: "yellow",
			error: "red",
			dim: "gray",
			pulseQuiet: "gray",
			pulseActive: "cyan",
			pulseAlert: "red"
		},
		fallbackOverrides: {
			userColor: "white",
			assistantColor: "white",
			muted: "gray"
		}
	},
	dawn: {
		background: "dark",
		description: "启明星晨曦调。青蓝边框、暖金标题、雾灰正文，贴近 Tianshu 启动画面。",
		truecolor: {
			primary: "#58d6f5",
			secondary: "#d8a15c",
			success: "#7bbf98",
			warning: "#e5763a",
			error: "#e58e98",
			dim: "#8f9aaa",
			pulseQuiet: "#2b3340",
			pulseActive: "#58d6f5",
			pulseAlert: "#e58e98"
		},
		overrides: {
			userColor: "#ffb454",
			assistantColor: "#dce3ea",
			muted: "#8f9aaa",
			systemColor: "#8f9aaa"
		},
		fallback: {
			primary: "cyan",
			secondary: "yellow",
			success: "green",
			warning: "yellow",
			error: "red",
			dim: "gray",
			pulseQuiet: "gray",
			pulseActive: "cyan",
			pulseAlert: "red"
		},
		fallbackOverrides: {
			userColor: "yellowBright",
			assistantColor: "white",
			muted: "gray"
		}
	},
	antigravity: {
		background: "dark",
		description: "Codex 风格。天青色冷调 Accent，亮灰结构文本，现代而克制。",
		truecolor: {
			primary: "#5aa9ff",
			secondary: "#8ab4ff",
			success: "#43c463",
			warning: "#e0a93a",
			error: "#f76b6b",
			dim: "#9093a0",
			pulseQuiet: "#2a2a32",
			pulseActive: "#5aa9ff",
			pulseAlert: "#f76b6b",
			toolShell: "#7aa2cf",
			toolEdit: "#6fb3ab",
			toolTest: "#43c463",
			toolDelegate: "#e0a93a"
		},
		overrides: {
			userColor: "#d8e2ee",
			assistantColor: "#c4c9d2",
			muted: "#989aa6"
		},
		fallback: {
			primary: "blue",
			secondary: "cyan",
			success: "green",
			warning: "yellow",
			error: "red",
			dim: "gray",
			pulseQuiet: "gray",
			pulseActive: "blue",
			pulseAlert: "red"
		},
		fallbackOverrides: {
			userColor: "cyanBright",
			assistantColor: "white",
			muted: "gray"
		}
	},
	cobalt: {
		background: "dark",
		description: "钴蓝·冷调中性 (默认风格)。oklch 调和，明度梯度清晰，视觉极度舒适。",
		truecolor: {
			primary: "#6ab8ff",
			secondary: "#7dacbf",
			success: "#58cbb4",
			warning: "#d4b44c",
			error: "#ed7665",
			dim: "#8693a0",
			pulseQuiet: "#30363d",
			pulseActive: "#6ab8ff",
			pulseAlert: "#ed7665",
			toolShell: "#5f97c5",
			toolEdit: "#65b9ca",
			toolTest: "#58cbb4",
			toolDelegate: "#d4b44c"
		},
		overrides: {
			userColor: "#fbbf24",
			assistantColor: "#c9cfd6",
			muted: "#9ca5b3"
		},
		fallback: {
			primary: "blue",
			secondary: "cyan",
			success: "green",
			warning: "yellow",
			error: "red",
			dim: "gray",
			pulseQuiet: "gray",
			pulseActive: "blue",
			pulseAlert: "red"
		},
		fallbackOverrides: {
			userColor: "yellowBright",
			assistantColor: "white",
			muted: "gray"
		}
	},
	graphite: {
		background: "dark",
		description: "石墨冰青 (专业默认)。中性灰阶 + 单一冰青 accent，低饱和语义色，长时间编码不疲劳。",
		truecolor: {
			primary: "#7cc4e8",
			secondary: "#8b98ab",
			success: "#7fbf8e",
			warning: "#d9b36c",
			error: "#e07a6f",
			dim: "#828d9c",
			pulseQuiet: "#2f3540",
			pulseActive: "#7cc4e8",
			pulseAlert: "#e07a6f",
			toolShell: "#7ba7c9",
			toolEdit: "#8b98ab",
			toolTest: "#7fbf8e",
			toolDelegate: "#d9b36c"
		},
		overrides: {
			userColor: "#e0aa53",
			assistantColor: "#c8cdd6",
			muted: "#9aa4b0",
			systemColor: "#8b95a1"
		},
		fallback: {
			primary: "cyan",
			secondary: "blue",
			success: "green",
			warning: "yellow",
			error: "red",
			dim: "gray",
			pulseQuiet: "gray",
			pulseActive: "cyan",
			pulseAlert: "red"
		},
		fallbackOverrides: {
			userColor: "yellowBright",
			assistantColor: "white",
			muted: "gray"
		}
	},
	gemini: {
		background: "dark",
		description: "Gemini 风格。结合星云微光渐变 (冷靛蓝与星云紫) 与极光薄荷，极具科技美感。",
		truecolor: {
			primary: "#818cf8",
			secondary: "#c084fc",
			success: "#34d399",
			warning: "#fbbf24",
			error: "#f43f5e",
			dim: "#8b8ea9",
			pulseQuiet: "#2a2b3d",
			pulseActive: "#818cf8",
			pulseAlert: "#f43f5e",
			toolShell: "#7dd3fc",
			toolEdit: "#c084fc",
			toolTest: "#34d399",
			toolDelegate: "#fbbf24"
		},
		overrides: {
			userColor: "#e0e7ff",
			assistantColor: "#c4c9d2",
			muted: "#9497a6"
		},
		fallback: {
			primary: "blueBright",
			secondary: "magentaBright",
			success: "cyanBright",
			warning: "yellowBright",
			error: "redBright",
			dim: "gray",
			pulseQuiet: "gray",
			pulseActive: "blueBright",
			pulseAlert: "redBright"
		},
		fallbackOverrides: {
			userColor: "white",
			assistantColor: "white",
			muted: "gray"
		}
	},
	paper: {
		background: "light",
		description: "纸白亮色。面向白底/浅色终端，全语义色加深降亮，靛蓝 accent。",
		truecolor: {
			primary: "#1d4ed8",
			secondary: "#0e7490",
			success: "#15803d",
			warning: "#a16207",
			error: "#b91c1c",
			dim: "#6b7280",
			pulseQuiet: "#d1d5db",
			pulseActive: "#1d4ed8",
			pulseAlert: "#b91c1c",
			toolShell: "#1e6091",
			toolEdit: "#0e7490",
			toolTest: "#15803d",
			toolDelegate: "#a16207"
		},
		overrides: {
			userColor: "#1f2937",
			assistantColor: "#374151",
			muted: "#4b5563",
			systemColor: "#4b5563"
		},
		fallback: {
			primary: "blue",
			secondary: "cyan",
			success: "green",
			warning: "yellow",
			error: "red",
			dim: "black",
			pulseQuiet: "black",
			pulseActive: "blue",
			pulseAlert: "red"
		},
		fallbackOverrides: {
			userColor: "black",
			assistantColor: "black",
			muted: "black"
		}
	},
	"light-ansi": {
		background: "light",
		description: "亮色 ANSI。16 色纯净版，跟随终端自身配色方案，亮背景友好。",
		truecolor: {
			primary: "#0550ae",
			secondary: "#8250df",
			success: "#116329",
			warning: "#7d4e00",
			error: "#a40e26",
			dim: "#57606a",
			pulseQuiet: "#d0d7de",
			pulseActive: "#0550ae",
			pulseAlert: "#a40e26"
		},
		overrides: {
			userColor: "#24292f",
			assistantColor: "#24292f",
			muted: "#57606a",
			systemColor: "#57606a"
		},
		fallback: {
			primary: "blue",
			secondary: "magenta",
			success: "green",
			warning: "yellow",
			error: "red",
			dim: "black",
			pulseQuiet: "black",
			pulseActive: "blue",
			pulseAlert: "red"
		},
		fallbackOverrides: {
			userColor: "black",
			assistantColor: "black",
			muted: "black"
		}
	}
};
//#endregion
//#region lib/types/theme.js
/**
* 主题系统 — 语义 token 解析层。
*
* 两段式架构（2026-07 重构）：
* - theme-palettes.ts: 调色板定义（语义 token → 颜色值 + background/description 元数据）
* - theme.ts（本文件）: palette → RivetTheme 解析、主题切换、自定义主题注册表
*
* 颜色深度分档（渲染端 ansi.ts 消化）：
* - level >= 2: truecolor 轨（hex；level 2 由 fg() 现场量化为 xterm-256）
* - level <= 1: fallback 轨（chalk 命名色 → 基础 16 色 SGR）
*
* 自定义主题：~/.rivet/themes/*.json 经 theme-custom.ts 加载后注册到本模块，
* 以 `custom:<name>` 引用。语义 token 局部覆盖，缺省继承 base 主题。
*/
/** 内置主题名列表（非空元组，供 /theme 补全与 config schema 枚举）。 */
const THEME_NAMES = Object.keys(THEME_PALETTES);
function makeToolColor(c) {
	return (name) => {
		switch (name) {
			case "bash":
			case "grep":
			case "glob":
			case "read_file":
			case "read_section":
			case "read_policy":
			case "semantic_search":
			case "repo_map":
			case "repo_graph":
			case "inspect_project":
			case "related_tests":
			case "file_info":
			case "ls": return c.toolShell ?? c.primary;
			case "edit_file":
			case "write_file":
			case "hash_edit":
			case "apply_patch": return c.toolEdit ?? c.secondary;
			case "run_tests": return c.toolTest ?? c.success;
			case "delegate_task":
			case "delegate_batch": return c.toolDelegate ?? c.warning;
			default: return c.toolShell ?? c.dim;
		}
	};
}
function makeContextColor(c) {
	return (pct) => {
		if (pct >= .88) return c.error;
		if (pct >= .75) return c.warning;
		return c.dim;
	};
}
function buildTheme(colors, overrides, auxiliaryDefault = "#9aa2b1") {
	return {
		...colors,
		muted: overrides?.muted ?? auxiliaryDefault,
		userColor: overrides?.userColor ?? colors.primary,
		assistantColor: overrides?.assistantColor ?? colors.secondary,
		systemColor: overrides?.systemColor ?? auxiliaryDefault,
		brandColor: overrides?.brandColor ?? colors.primary,
		toolColor: makeToolColor(colors),
		contextColor: makeContextColor(colors)
	};
}
function buildEntry(def) {
	return {
		truecolor: buildTheme(def.truecolor, def.overrides),
		fallback: buildTheme(def.fallback, def.fallbackOverrides, def.fallback.dim),
		background: def.background,
		description: def.description
	};
}
/** 全部内置主题（palette 定义解析为双轨 ThemeEntry）。 */
const THEMES = Object.fromEntries(Object.entries(THEME_PALETTES).map(([name, def]) => [name, buildEntry(def)]));
const customThemes = /* @__PURE__ */ new Map();
/**
* 注册自定义主题（不含 `custom:` 前缀的裸名）。覆盖同名旧注册。
* @param name - 裸名（引用时加 `custom:` 前缀）。
* @param input - 主题输入（未知 base 名回退按 background 选默认）。
*/
function registerCustomTheme(name, input) {
	const background = input.background ?? "dark";
	const baseName = input.base && input.base in THEME_PALETTES ? input.base : background === "light" ? "paper" : "cobalt";
	const baseDef = THEME_PALETTES[baseName];
	const colors = {
		...baseDef.truecolor,
		...input.colors
	};
	const overrides = {
		...baseDef.overrides,
		...input.overrides
	};
	customThemes.set(name, {
		truecolor: buildTheme(colors, overrides),
		fallback: buildTheme(baseDef.fallback, baseDef.fallbackOverrides, baseDef.fallback.dim),
		background,
		description: input.description ?? `Custom theme (base: ${baseName})`
	});
}
/**
* 已注册的自定义主题裸名列表（不含 `custom:` 前缀）。
* @returns 裸名数组（注册顺序）。
*/
function listCustomThemes() {
	return [...customThemes.keys()];
}
/** 清空自定义主题注册表（测试用）。 */
function clearCustomThemes() {
	customThemes.clear();
}
/**
* 解析主题条目：内置名或 `custom:<name>`。未知名返回 undefined。
* @param name - 主题引用名。
* @returns 主题条目；未知名返回 undefined。
*/
function resolveThemeEntry(name) {
	if (name.startsWith("custom:")) return customThemes.get(name.slice(7));
	return THEMES[name];
}
let activeTheme = "graphite";
/**
* 切换主题。接受内置名或 `custom:<name>`；未知名 no-op 并返回 false。
* @param name - 主题引用名。
* @returns 是否切换成功。
*/
function setTheme(name) {
	if (!resolveThemeEntry(name)) return false;
	activeTheme = name;
	return true;
}
/**
* 当前激活的主题引用名（内置名或 `custom:<name>`）。
* @returns 主题引用名。
*/
function getActiveThemeName() {
	return activeTheme;
}
/**
* 当前主题面向的终端背景。
* @returns 背景明暗（激活主题不可解析时落 'dark'）。
*/
function getActiveThemeBackground() {
	return resolveThemeEntry(activeTheme)?.background ?? "dark";
}
/**
* 当前激活主题按色深分档解析：level >= 2 走 truecolor 轨，否则 fallback 轨。
* @param colorLevel - 颜色能力等级（缺省 chalk.level）。
* @returns 解析后的主题（激活名不可解析时落 cobalt）。
*/
function getTheme(colorLevel) {
	const level = colorLevel ?? chalk.level;
	const entry = resolveThemeEntry(activeTheme) ?? THEMES.cobalt;
	return level >= 2 ? entry.truecolor : entry.fallback;
}
//#endregion
//#region lib/types/theme-detect.js
/**
* 终端背景明暗检测 — `theme: "auto"` 支撑。
*
* 检测链（先到先得）：
* 1. OSC 11 查询终端背景色（`ESC ] 11 ; ? BEL`）——现代终端（iTerm2/kitty/
*    WezTerm/Windows Terminal/Ghostty…）会回 `ESC ] 11 ; rgb:RRRR/GGGG/BBBB`，
*    按感知亮度判明暗。500ms 超时。
* 2. COLORFGBG 环境变量兜底（rxvt 系约定 `<fg>;<bg>`，bg 7/15 视为亮）。
* 3. 全部失败 → 'dark'（终端世界的保守默认）。
*
* 内部按需临时开 raw mode 并 resume 读响应，结束后把 raw mode 与暂停/流动
* 状态恢复为进入时的原状——TUI 已接管 stdin 时也可安全调用。
* 非 TTY（管道/CI）直接走 env 兜底。
*/
/**
* 解析 OSC 11 响应中的 rgb 载荷 → 感知亮度 [0,1]。无法解析返回 null。
* @param response - 终端回包原文（含 `rgb:RRRR/GGGG/BBBB` 片段）。
* @returns BT.601 感知亮度；无 rgb 载荷返回 null。
*/
function parseOsc11Luminance(response) {
	const m = response.match(/rgb:([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})/);
	if (!m) return null;
	const norm = (s) => parseInt(s, 16) / (16 ** s.length - 1);
	/* v8 ignore next -- match 成功必有 3 组捕获，?? 右侧为 noUncheckedIndexedAccess 收窄防御 */
	const r = norm(m[1] ?? ""), g = norm(m[2] ?? ""), b = norm(m[3] ?? "");
	return .299 * r + .587 * g + .114 * b;
}
/**
* COLORFGBG 兜底解析（如 "15;0" / "0;15" / "12;8"）。无法判断返回 null。
* @param env - COLORFGBG 环境变量值（取末段为 bg 索引）。
* @returns 明暗判定；缺失或非数字 bg 返回 null。
*/
function parseColorFgBg(env) {
	if (!env) return null;
	const parts = env.split(";");
	const bgRaw = parts[parts.length - 1]?.trim();
	if (!bgRaw || !/^\d+$/.test(bgRaw)) return null;
	const bgIndex = Number(bgRaw);
	return bgIndex === 7 || bgIndex === 15 ? "light" : "dark";
}
/**
* 检测终端背景明暗。见模块头注释的检测链。
* 任何异常（raw mode 失败、流关闭…）都吞掉并落到兜底，绝不让主题检测拦死启动。
* @param opts - 超时与流/env 注入选项。
* @returns 明暗判定（检测链全部失败落 'dark'）。
*/
async function detectTerminalBackground(opts = {}) {
	/* v8 ignore next -- 全部调用方（含测试）均显式注入 opts.stdin，?? 右侧为契约兜底 */
	const stdin = opts.stdin ?? process.stdin;
	/* v8 ignore next -- 同上：opts.stdout 恒显式注入 */
	const stdout = opts.stdout ?? process.stdout;
	/* v8 ignore next -- 同上：opts.env 恒显式注入 */
	const env = opts.env ?? process.env;
	const timeoutMs = opts.timeoutMs ?? 500;
	const fallback = () => parseColorFgBg(env.COLORFGBG) ?? "dark";
	if (!stdin.isTTY || !stdout.isTTY) return fallback();
	const wasRaw = stdin.isRaw;
	const wasPaused = stdin.isPaused();
	try {
		return await new Promise((resolve) => {
			let buffer = "";
			let done = false;
			const finish = (value) => {
				/* v8 ignore next -- 首次 finish 即 off 监听并 clearTimeout，运行时至多调用一次，done 恒 false */
				if (done) return;
				done = true;
				clearTimeout(timer);
				stdin.off("data", onData);
				try {
					if (!wasRaw) stdin.setRawMode(false);
				} catch {}
				if (wasPaused) stdin.pause();
				resolve(value);
			};
			const onData = (chunk) => {
				buffer += chunk.toString("latin1");
				if (/\]11;.*(\x07|\x1B\\)/.test(buffer)) {
					const lum = parseOsc11Luminance(buffer);
					finish(lum === null ? null : lum > .5 ? "light" : "dark");
				}
			};
			const timer = setTimeout(() => {
				finish(null);
			}, timeoutMs);
			try {
				if (!wasRaw) stdin.setRawMode(true);
				stdin.resume();
				stdin.on("data", onData);
				stdout.write("\x1B]11;?\x07");
			} catch {
				finish(null);
			}
		}) ?? fallback();
	} catch {
		return fallback();
	}
}
/**
* auto 主题的默认落点：dark → graphite，light → paper。
* @param background - 终端背景明暗。
* @returns 对应主题名。
*/
function autoThemeFor(background) {
	return background === "light" ? "paper" : "graphite";
}
//#endregion
//#region lib/types/format/user-message.js
/**
* T9 格式化函数 — 用户消息与转向消息共用「说话人导轨」制式。
*
* 源出 .rivet/tui-source/tui/format/user-message.ts（Apache-2.0 来源，见
* LICENSE/NOTICE/SOURCE-MAP.md）。本文件为 dsh-tui 移植的基础版，无天枢耦合。
*
* 渲染结构（导轨制式，marker + 颜色承担说话人识别）：
* ▌ 消息首行             (markerColor + bold 导轨；regular 中性正文)
* ▌ 消息后续行           (同一导轨；regular 中性正文)
* ▌                       (空行只保留导轨)
*
* 说话人：
* - user：marker `❯`/`▌` + userColor（formatUserMessage）
* - steer：marker `>>`/`➤` + warning（formatSteerMessage，见 steer-message.ts）
*/
/**
* 消息时间戳 → `[HH:MM]` 显示段（本地时区）。
* @param ms - Unix epoch 毫秒。
* @returns 形如 `[14:32]` 的显示文本。
*/
function formatTimestamp(ms) {
	const d = new Date(ms);
	return `[${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}]`;
}
/**
* 渲染一条「说话人导轨」消息：markerColor+bold 导轨前缀 + 中性正文。
* 首行与正文同行；后续行维持同一导轨，空行只保留导轨。
* 正文按 width 折叠（导轨前缀宽度计入每行预算；CJK 宽字符按显示宽度度量）。
* 提供 timestamp 且正文宽度足够时，首行最后一块后附 `[HH:MM]`（宽度预算
* 从首行折叠扣除，窄宽隐藏不破版）。
* @param input - 文本、宽度、marker 与 markerColor。
* @param theme - 当前主题（正文用 assistantColor 中性色；时间戳用 secondary）。
* @returns 渲染行数组（每行含导轨前缀）。
*/
function formatRailedMessage(input, theme) {
	const lines = [];
	const prefix = color(input.marker, input.markerColor, { bold: true });
	const railWidth = displayWidth(input.marker) + 1;
	const bodyWidth = Math.max(0, input.width - railWidth);
	const stampText = input.timestamp !== void 0 && bodyWidth >= 12 ? ` ${color(formatTimestamp(input.timestamp), theme.secondary)}` : "";
	const stampWidth = displayWidth(stampText);
	for (const [index, contentLine] of input.content.split("\n").entries()) {
		if (contentLine.trim().length === 0) {
			lines.push(prefix);
			continue;
		}
		if (bodyWidth <= 0) {
			lines.push(`${prefix} ${color(contentLine, theme.assistantColor)}`);
			continue;
		}
		const chunks = wrapToDisplayWidth(contentLine, index === 0 ? Math.max(1, bodyWidth - stampWidth) : bodyWidth);
		for (const [chunkIndex, chunk] of chunks.entries()) {
			const stamp = index === 0 && chunkIndex === 0 ? stampText : "";
			lines.push(`${prefix} ${color(chunk, theme.assistantColor)}${stamp}`);
		}
	}
	return lines;
}
/**
* 渲染用户消息为 scrollback 行：userColor `❯`/`▌` 导轨 + 中性正文。
* @param input - 用户消息文本与宽度。
* @param theme - 当前主题（marker 用 userColor）。
* @returns 渲染行数组（每行含导轨前缀）。
*/
function formatUserMessage(input, theme) {
	const marker = chalk.level < 3 ? "❯" : "▌";
	return formatRailedMessage({
		...input,
		marker,
		markerColor: theme.userColor
	}, theme);
}
//#endregion
//#region lib/types/format/steer-message.js
/**
* T9 格式化函数 — 转向消息（中轮 steer，marker 与颜色区分 user）。
*
* 渲染结构与 user-message 同一导轨制式（说话人识别靠 marker + 颜色）：
* - marker：`➤`（truecolor 轨）/ `>>`（ascii 轨），warning 色 + bold
* - 正文：assistantColor 中性色（同 user 正文层级）
*
* @module @deepseek-ai/dsh-tianshu-tui/format/steer-message
*/
/**
* 渲染转向消息为 scrollback 行：warning 色 `➤`/`>>` 导轨 + 中性正文，
* 与 user 消息（`▌`/`❯` + userColor）在 marker 与颜色上区分。
* @param input - 转向文本与宽度。
* @param theme - 当前主题（marker 用 warning 色）。
* @returns 渲染行数组（每行含导轨前缀）。
*/
function formatSteerMessage(input, theme) {
	const marker = chalk.level < 3 ? ">>" : "➤";
	return formatRailedMessage({
		...input,
		marker,
		markerColor: theme.warning
	}, theme);
}
//#endregion
//#region lib/types/braille-spinner.js
const FRAMES = [
	"⠋",
	"⠙",
	"⠹",
	"⠸",
	"⠼",
	"⠴",
	"⠦",
	"⠧",
	"⠇",
	"⠏"
];
/**
* Smooth braille spinner frame for a monotonically increasing tick index (S16).
* @param tick - 单调递增的帧计数（负值也安全，双取模回卷）。
* @returns 当前帧的盲文字符。
*/
function brailleSpinnerFrame(tick) {
	/* v8 ignore next -- 双取模后 idx 恒在 [0, FRAMES.length) 界内；noUncheckedIndexedAccess 收窄防御 */
	return FRAMES[(tick % FRAMES.length + FRAMES.length) % FRAMES.length] ?? "";
}
const CIRCLE_FRAMES = [
	"◐",
	"◓",
	"◑",
	"◒"
];
/**
* Rotating circle spinner frame for a monotonically increasing tick index.
* @param tick - 单调递增的帧计数（负值也安全，双取模回卷）。
* @returns 当前帧的月相圆圈字符。
*/
function circleSpinnerFrame(tick) {
	/* v8 ignore next -- 双取模后 idx 恒在 [0, CIRCLE_FRAMES.length) 界内；noUncheckedIndexedAccess 收窄防御 */
	return CIRCLE_FRAMES[(tick % CIRCLE_FRAMES.length + CIRCLE_FRAMES.length) % CIRCLE_FRAMES.length] ?? "";
}
//#endregion
//#region lib/types/truncation-marker.js
/**
* 折叠/截断提示的单一事实来源。
*
* 渲染端（tool-card / collapsed-*）产出这些标记，scrollback pager 解析端
* （scrollback-transcript.ts）反向识别它们来判定「这条消息被截断过、可展开」。
* 两边各写各的字符串会在文案调整时静默失联——pager 的展开入口消失而没有任何报错，
* 所以放在这里共享。
*/
/**
* 折叠 N 行的提示：`… +25 行`（纯计数，不带展开快捷键——ctrl+o 已被占用且无消费端）。
* @param omitted - 被折叠的行/项数。
* @param unit - 计数单位（缺省「行」；diff 场景可传「行 diff」等）。
* @returns 截断计数提示行。
*/
function truncationHint(omitted, unit = "行") {
	return `… +${omitted} ${unit}`;
}
/**
* 截断标记识别。生产端形态统一锚 `… +N 行` 计数，展开提示可选（兼容
* /resume 载入旧会话里的 `… +25 行 · ctrl+o 展开` 与历史英文
* `… +N lines [Ctrl+O]`，不认会让旧会话的展开入口失效）。
*/
const TRUNCATION_MARKER_RE = /…\s*\+\s*\d+\s*行(?:\s*·\s*ctrl\+o\s*展开)?|…\s*\+\s*\d+\s*行 diff|…\s*\+\s*\d+\s*lines\s*\[Ctrl\+O\]/i;
//#endregion
//#region lib/types/format/tool-meta.js
/**
* 工具元数据基础版 — tool-card 渲染的辅助函数合体。
*
* 源出 .rivet/tui-source/tui/ 的 tool-family.ts / tool-label.ts /
* tool-elapsed.ts / tool-domain.ts（Apache-2.0 来源，见 LICENSE/NOTICE/
* SOURCE-MAP.md）。本文件为 dsh-tui 移植的基础版：保留 tool-card 渲染所
* 需的最小契约（family 判定、标题参数摘要、耗时格式化、委派工具识别），
* 去掉天枢特有的星域映射与浏览器调试工具分支。
*/
const TOOL_MAP = {
	read_file: {
		family: "read",
		verb: "read"
	},
	glob: {
		family: "find",
		verb: "find"
	},
	grep: {
		family: "find",
		verb: "search"
	},
	bash: {
		family: "run",
		verb: "run"
	},
	edit_file: {
		family: "write",
		verb: "patch"
	},
	write_file: {
		family: "write",
		verb: "write"
	},
	apply_patch: {
		family: "write",
		verb: "patch"
	},
	run_tests: {
		family: "run",
		verb: "test"
	},
	delegate_task: {
		family: "run",
		verb: "delegate"
	},
	delegate_batch: {
		family: "run",
		verb: "batch"
	},
	web_fetch: {
		family: "read",
		verb: "fetch"
	},
	inspect_project: {
		family: "find",
		verb: "inspect"
	},
	repo_map: {
		family: "find",
		verb: "map"
	},
	semantic_search: {
		family: "find",
		verb: "search"
	},
	ask_user_question: {
		family: "other",
		verb: "ask"
	}
};
const DEFAULT = {
	family: "other",
	verb: "tool"
};
/**
* 工具家族元数据；未知名工具落 other/tool。
* @param toolName - 工具名（模型原样产出）。
* @returns 家族与标题动词。
*/
function getToolFamily(toolName) {
	return TOOL_MAP[toolName] ?? DEFAULT;
}
/** 截断辅助：超长文本尾部加省略号。 */
function truncate$2(s, max) {
	return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
/** unknown → 文本：string 原样；number/boolean 用 String；对象/null/undefined → ''（防 [object Object]）。 */
function textOf(value) {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return "";
}
/** 路径 basename（POSIX/Windows 分隔符都认）。 */
function pathBasename(value) {
	return textOf(value).replace(/^.*[/\\]/, "");
}
/**
* 工具的主参数摘要（不含动词前缀）——供 `● Verb(arg)` 卡片标题使用。
* 基础版只摘录最常用的参数字段；未知工具返回空串。
* @param name - 工具名（决定摘录哪个参数字段）。
* @param input - 工具输入参数（模型产出的已解析 JSON 对象）。
* @returns 截断后的主参数摘要；未知工具返回空串。
*/
function toolArgSummary(name, input) {
	switch (name) {
		case "read_file":
		case "write_file":
		case "edit_file": return truncate$2(pathBasename(input.file_path ?? input.path), 45);
		case "bash":
 /* v8 ignore next -- split('\n') 恒返回非空数组，[0] 恒存在；noUncheckedIndexedAccess 收窄防御 */
		return truncate$2(textOf(input.command).split("\n")[0] ?? "", 55);
		case "grep":
		case "glob":
		case "semantic_search": return truncate$2(textOf(input.pattern), 35);
		case "delegate_task": return truncate$2(textOf(input.objective), 50);
		case "delegate_batch": return `${Array.isArray(input.tasks) ? input.tasks.length : "?"} tasks`;
		case "web_fetch": return truncate$2(textOf(input.url), 50);
		default: return "";
	}
}
/**
* 容错解析 tool/call 的 arguments JSON（模型产出，wire 边界必须运行时校验）。
* 解析失败/非对象返回 undefined——卡片显示纯动词标题。
* @param raw - 模型产出的原始 arguments JSON 字符串。
* @returns 解析出的对象；空串/非对象/解析失败为 undefined。
*/
function parseToolArguments(raw) {
	if (!raw) return void 0;
	try {
		const parsed = JSON.parse(raw);
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : void 0;
	} catch {
		return;
	}
}
/**
* 精确耗时（Claude Code 风）：<1s → `123ms`，<60s → `1.5s`，否则 `1m05s`。
* @param ms - 毫秒耗时；负数按 0。
* @returns 人类可读的耗时文本。
*/
function formatElapsed$2(ms) {
	if (ms < 1e3) return `${Math.max(0, Math.round(ms))}ms`;
	if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
	const mins = Math.floor(ms / 6e4);
	const secs = Math.round(ms % 6e4 / 1e3);
	return `${mins}m${String(secs).padStart(2, "0")}s`;
}
//#endregion
//#region lib/types/format/tool-family.js
/**
* 工具家族着色分类 — Phase 7.2。
*
* 与 tool-meta.ts 的 `getToolFamily`（read/write/run/find/other，服务于
* 截断/展开策略与 diff 分支）并存但不重叠：本模块的家族只决定标题着色，
* 是纯投影的「工具名 → 功能域」映射，不产生、不写回任何事件。
*
* 五色家族（任务规格）：文件操作蓝 / shell 黄 / 搜索绿 / 编辑紫 / 网络青。
* 家族映射到主题的语义 token（而非硬编码 hex）——跨主题与 16 色 fallback
* 轨都稳定，色相随主题漂移是设计内的（同 makeToolColor 的惯例）。
*/
/** 工具名 → 着色家族映射。未列出的工具落 `other`（dim）。 */
const FAMILY_MAP = {
	read_file: "file",
	read_section: "file",
	write_file: "file",
	edit_file: "file",
	glob: "file",
	repo_map: "file",
	repo_graph: "file",
	inspect_project: "file",
	file_info: "file",
	ls: "file",
	bash: "shell",
	grep: "search",
	ast_grep: "search",
	semantic_search: "search",
	related_tests: "search",
	apply_patch: "edit",
	hash_edit: "edit",
	str_replace: "edit",
	web_fetch: "network",
	web_search: "network"
};
/**
* 工具名 → 着色家族；未知名工具落 `other`。
* @param toolName - 工具名（模型原样产出）。
* @returns 着色家族标签。
*/
function getToolColorFamily(toolName) {
	return FAMILY_MAP[toolName] ?? "other";
}
/** 家族 → 语义色 token 解析（纯投影）。 */
function familyToToken(family, theme) {
	switch (family) {
		case "file": return theme.primary;
		case "shell": return theme.warning;
		case "search": return theme.success;
		case "edit": return theme.secondary;
		case "network": return theme.toolShell ?? theme.primary;
		default: return theme.dim;
	}
}
/**
* 工具家族的标题配色（ANSI 色值）。
* @param toolName - 工具名（模型原样产出）。
* @param theme - 当前主题（RivetTheme 结构满足 FamilyTheme 最小契约）；家族经语义 token 映射，跨主题稳定。
* @returns 家族色的色值字符串（hex 或 fallback 命名色）。
*/
function toolFamilyColor(toolName, theme) {
	return familyToToken(getToolColorFamily(toolName), theme);
}
//#endregion
//#region lib/types/format/tool-card.js
/**
* 工具卡片渲染（基础版）— Claude Code 风格折叠卡片。
*
* 源出 .rivet/tui-source/tui/format/tool-card.ts（Apache-2.0 来源，见
* LICENSE/NOTICE/SOURCE-MAP.md）。本文件为 dsh-tui 移植的基础版：
* 保留 header/bullet 状态形色、diff 检测分支、read 族头尾预览、截断提示
* 与 live 进行中卡片；去掉天枢特有的 browser_debug 分级着色、委派任务
* 流式预览与星域映射（见反目标：不做 worker/星域面板）。
*
* 渲染结构：
*   › Run(npm test) (1.2s)
*     ⎿  前 4 行输出
*        … +25 行
*
* - 状态形色双通道：› 成功绿 / ✗ 失败红 / ⠋ 进行中 dim / ? 待答黄
*/
/** 宽度口径：与 LiveEngine.rowsForLine 一致。工具输出（git diff/代码/日志）
*  常含 `— … │ →` 等 ambiguous 符号 + CJK，按 .length 截断会低估列宽。 */
const WIDE$1 = { ambiguousAsWide: true };
const DEFAULT_MAX_LINES = 4;
const READ_HEAD_LINES = 3;
const READ_TAIL_LINES = 5;
const DIFF_MAX_LINES = 20;
/**
* 按工具家族给不同默认展开高度。
* @param toolName - 工具名（家族判定经 getToolFamily）。
* @returns 折叠态默认显示的输出行数上限。
*/
function getDefaultMaxLines(toolName) {
	switch (getToolFamily(toolName).family) {
		case "run": return 8;
		case "find": return 6;
		case "write": return DIFF_MAX_LINES;
		case "read": return 8;
		default: return DEFAULT_MAX_LINES;
	}
}
const BODY_FIRST_PREFIX = "⎿  ";
const BODY_CONT_PREFIX = "   ";
/**
* 标题动词：family verb 首字母大写（Run/Read/Patch/Write/Search/Find…）。
* @param toolName - 工具名（家族判定经 getToolFamily）。
* @returns 首字母大写的标题动词。
*/
function toolTitleVerb(toolName) {
	const verb = getToolFamily(toolName).verb;
	return verb.charAt(0).toUpperCase() + verb.slice(1);
}
/**
* 标题行文本（无色）：`Run(npm test)` 或 `Read(foo.ts)`。
* @param toolName - 工具名（决定标题动词）。
* @param toolInput - 工具输入参数（经 toolArgSummary 摘录主参数）。
* @param rawPath - 原始文件路径；无参数摘要时回退取其 basename。
* @returns 有参数摘要时 `Verb(arg)`，否则仅动词。
*/
function toolCardTitle(toolName, toolInput, rawPath) {
	const verb = toolTitleVerb(toolName);
	let arg = toolInput ? toolArgSummary(toolName, toolInput) : "";
	/* v8 ignore next -- split('/') 恒返回非空数组，pop() 恒有值；noUncheckedIndexedAccess 收窄防御 */
	if (!arg && rawPath) arg = rawPath.split("/").pop() ?? rawPath;
	return arg ? `${verb}(${arg})` : verb;
}
/**
* 缩进工具卡 body 行：第一行 `⎿  `（dim 着色），后续行对齐缩进。
* formatToolCard 与 presenter 卡（tool-view-card.ts）共用的卡片体语汇。
* @param bodyLines - 已着色的 body 行。
* @param indent - 卡片整体缩进前缀（工具链树形层级）。
* @param theme - 当前主题。
* @returns 缩进后的行数组。
*/
function indentToolBody(bodyLines, indent, theme) {
	return bodyLines.map((line, i) => `${indent}${i === 0 ? color(BODY_FIRST_PREFIX, theme.dim) : BODY_CONT_PREFIX}${line}`);
}
/**
* 工具卡标题行：`› Verb(arg) (1.2s)` 形态，bullet 形色双通道（16 色终端
* 与红绿色觉障碍下「成功/失败」不能只靠颜色）。
* @param input - 标题文本与状态。
* @param theme - 当前主题（状态形色与家族着色取语义 token）。
* @returns 单行 ANSI 标题。
*/
function formatToolCardHeader(input, theme) {
	const { toolName, title, isError = false, streaming = false, elapsedMs, indent = "", badge } = input;
	const isQuestion = toolName === "ask_user_question";
	const useAscii = useAsciiGlyphs();
	const bulletColor = isError ? theme.error : isQuestion ? theme.warning : streaming ? theme.dim : theme.success;
	const bulletGlyph = isError ? useAscii ? "x" : "✗" : isQuestion ? "?" : streaming ? useAscii ? "-" : "⠋" : "›";
	const tColor = isQuestion ? theme.warning : toolFamilyColor(toolName, theme);
	let header = `${indent}${color(bulletGlyph, bulletColor)} ${color(title, tColor, { bold: true })}`;
	if (streaming) header += ` ${color("…", theme.dim)}`;
	else if (elapsedMs !== void 0) header += ` ${color(`(${formatElapsed$2(elapsedMs)})`, theme.muted)}`;
	if (badge !== void 0) header += ` ${badge}`;
	return header;
}
/**
* 格式化工具卡片为 ANSI 行数组（Claude Code ●/⎿ 结构）。
* @param input - 工具名、输出内容与折叠/展开等渲染选项。
* @param theme - 当前主题（状态形色与家族着色取语义 token）。
* @returns ANSI 行数组：标题行 + 按截断策略折叠的 body 行。
*/
function formatToolCard(input, theme) {
	const { toolName, content, isError = false, depth = 0, rawPath, elapsedMs, streaming = false, toolInput, expanded = false } = input;
	const family = getToolFamily(toolName);
	const indent = depth > 0 ? "  ".repeat(depth) : "";
	const isQuestion = toolName === "ask_user_question";
	const lines = [formatToolCardHeader({
		toolName,
		title: toolCardTitle(toolName, toolInput, rawPath),
		isError,
		streaming,
		...elapsedMs === void 0 ? {} : { elapsedMs },
		indent
	}, theme)];
	const trimmed = content.replace(/\n+$/, "");
	if (!trimmed) {
		lines.push(`${indent}${color(BODY_FIRST_PREFIX, theme.dim)}${color("(无输出)", theme.muted)}`);
		return lines;
	}
	if (family.family === "write" && isDiffContent(trimmed)) {
		const stats = computeDiffStats(trimmed);
		const changeCount = stats.adds + stats.dels;
		if (changeCount <= 10 || expanded) {
			const diffLines = formatDiff({
				content: trimmed,
				maxLines: Number.MAX_SAFE_INTEGER
			}, theme);
			lines.push(...indentToolBody(diffLines, indent, theme));
		} else {
			const summary = `⎿ ${stats.hunks > 0 ? `${stats.hunks} 处修改` : `${changeCount} 行修改`} (+${stats.adds} −${stats.dels})`;
			lines.push(`${indent}${color(BODY_FIRST_PREFIX, theme.dim)}${color(summary, theme.muted)}`);
		}
		return lines;
	}
	const contentLines = trimmed.split("\n");
	const totalLines = contentLines.length;
	const maxLines = input.maxLines ?? getDefaultMaxLines(toolName);
	const bodyColor = isError ? theme.error : isQuestion ? theme.warning : theme.muted;
	const renderLine = (l) => color(l, bodyColor);
	if (expanded || isQuestion || totalLines <= maxLines) {
		lines.push(...indentToolBody(contentLines.map(renderLine), indent, theme));
		if (rawPath && !expanded)
 /* v8 ignore next -- split('/') 恒返回非空数组，pop() 恒有值；noUncheckedIndexedAccess 收窄防御 */
		lines.push(`${indent}${BODY_CONT_PREFIX}${color(`raw: ${rawPath.split("/").pop() ?? rawPath}`, theme.muted)}`);
		return lines;
	}
	if (family.family === "read") {
		const head = contentLines.slice(0, READ_HEAD_LINES);
		const tail = contentLines.slice(-5);
		const omitted = totalLines - READ_HEAD_LINES - READ_TAIL_LINES;
		const body = [
			...head.map(renderLine),
			color(truncationHint(omitted), theme.secondary),
			...tail.map(renderLine)
		];
		lines.push(...indentToolBody(body, indent, theme));
		return lines;
	}
	const head = contentLines.slice(0, maxLines);
	const omitted = totalLines - maxLines;
	const body = [...head.map(renderLine), color(truncationHint(omitted), theme.secondary)];
	lines.push(...indentToolBody(body, indent, theme));
	return lines;
}
/**
* live 区进行中工具的渲染：dim `●` 标题行 + 末 N 行输出（⎿ 缩进）。
* @param input - 工具名、流式输出 tail、耗时与终端列数等。
* @param theme - 当前主题。
* @returns ANSI 行数组：标题行 + tailLines 行（compact 模式仅标题行）。
*/
function formatToolCardLive(input, theme) {
	const title = input.title ?? toolCardTitle(input.toolName, input.toolInput);
	const useAscii = useAsciiGlyphs();
	/* v8 ignore stop */
	let header = `${color(input.tick !== void 0 ? useAscii ? [
		"-",
		"\\",
		"|",
		"/"
	][(input.tick % 4 + 4) % 4] ?? "-" : brailleSpinnerFrame(input.tick) : "●", theme.dim)} ${color(title, toolFamilyColor(input.toolName, theme), { bold: true })}`;
	if (input.elapsedMs !== void 0 && input.elapsedMs >= 1e3) header += ` ${color(`(${formatElapsed$2(input.elapsedMs)})`, theme.muted)}`;
	const lines = [header];
	if (input.compact === true) return lines;
	const tailRows = input.outputTailLines ?? (() => {
		const tail = (input.outputTail ?? "").replace(/\n+$/, "");
		return tail ? tail.split("\n") : void 0;
	})();
	const tailCount = Math.max(0, input.tailLines ?? 3);
	const maxWidth = Math.max(10, input.columns - 3);
	const tailLines = [];
	if (tailCount > 0 && tailRows && tailRows.length > 0) {
		const shown = tailRows.slice(-tailCount).map((l) => {
			const ellW = displayWidth("…", WIDE$1);
			return color(displayWidth(l, WIDE$1) > maxWidth ? `${truncateToDisplayWidth(l, maxWidth - ellW, WIDE$1)}…` : l, theme.muted);
		});
		tailLines.push(...indentToolBody(shown, "", theme));
	}
	if (tailCount > 0 && tailLines.length === 0) tailLines.push(`${color(BODY_FIRST_PREFIX, theme.dim)}${color("…", theme.dim)}`);
	lines.push(...tailLines);
	return lines;
}
//#endregion
//#region lib/types/format/tool-view-card.js
/**
* presenter 卡渲染 — 消费 harness 工具声明的结构化渲染意图
* （dsh-tools presentation.ts 的 ToolCallView/ToolResultView），把 diff /
* terminal 卡渲染为 ANSI 行；generic 与其余卡型（search/read/web，二批
* 结构化）回落 formatToolCard 的文本折叠。
*
* 与 formatToolCard 的关系：本模块是「结构化意图优先」的分派层——意图
* 缺失（工具无 presenter / 桥软降级）时整体回落文本卡；标题行与 body
* 缩进语汇（formatToolCardHeader / indentToolBody）两者共用。
*
* diff 卡不渲染行号 gutter：FileDiff 不携带原始行号（fs 的逐 hunk meta
* 已剥掉 hunk 起点），伪造 1 起的行号会误导，+/− 前缀是诚实的双通道。
*/
/** diff 上下文行数（与 fs 工具 meta 的逐 hunk 上下文口径一致）。 */
const DIFF_CONTEXT_LINES = 3;
/** 折叠阈值：增删行合计超过此数折叠为统计行（与 formatToolCard diff 嗅探分支同口径）。 */
const DIFF_FOLD_CHANGES = 10;
/** 单个 FileDiff 正文行数上限（折叠态；与 tool-card write 族 DIFF_MAX_LINES 同口径）。 */
const DIFF_MAX_BODY_LINES = 20;
/** terminal 卡标题里命令的截断长度（与 toolArgSummary 的 bash 口径一致）。 */
const COMMAND_TITLE_MAX = 55;
/** structuredPatch 一个 hunk 的行 → DiffRow（`\ No newline` 标注是补丁元信息，剥掉）。 */
function hunkRows(lines) {
	const rows = [];
	for (const line of lines) {
		if (line.startsWith("\\")) continue;
		const text = line.slice(1);
		if (line.startsWith("+")) rows.push({
			kind: "add",
			text
		});
		else if (line.startsWith("-")) rows.push({
			kind: "del",
			text
		});
		else rows.push({
			kind: "ctx",
			text
		});
	}
	return rows;
}
/** 一个 FileDiff 的行序列：纯新建全为 add；否则 Myers（structuredPatch）逐 hunk，hunk 间插 gap。 */
function fileDiffRows(diff) {
	if (diff.oldText === null) return diff.newText.replace(/\n$/, "").split("\n").map((text) => ({
		kind: "add",
		text
	}));
	const patch = structuredPatch(diff.path, diff.path, diff.oldText, diff.newText, void 0, void 0, { context: DIFF_CONTEXT_LINES });
	const rows = [];
	for (const hunk of patch.hunks) {
		if (rows.length > 0) rows.push({
			kind: "gap",
			text: ""
		});
		rows.push(...hunkRows(hunk.lines));
	}
	return rows;
}
/**
* 多个 FileDiff 的增删统计（折叠阈值与统计行数据源）。
* @param diffs - presenter 产出的文件级 diff 列表。
* @returns 增/删行计数。
*/
function fileDiffStats(diffs) {
	let adds = 0;
	let dels = 0;
	for (const diff of diffs) for (const row of fileDiffRows(diff)) if (row.kind === "add") adds++;
	else if (row.kind === "del") dels++;
	return {
		adds,
		dels
	};
}
/**
* 渲染一个结构化 {@link FileDiff} 为着色行数组：`+` 绿 / `-` 红 /
* 上下文 muted，hunk 间以 dim `⋯` 分隔；新建文件（oldText null）全为
* 添加行。审批预览（permission-diff.ts）与结算卡共用此渲染。
* @param diff - 单文件 diff（oldText null = 新建/覆盖，无前像可比）。
* @param options - 行数上限。
* @param theme - 当前主题。
* @returns ANSI 行数组；old/new 相同（无 hunk）时为空数组。
*/
function renderFileDiff(diff, options, theme) {
	const rows = fileDiffRows(diff);
	const render = (row) => {
		switch (row.kind) {
			case "add": return color(`+ ${row.text}`, theme.success);
			case "del": return color(`- ${row.text}`, theme.error);
			case "ctx": return color(`  ${row.text}`, theme.muted);
			case "gap": return color("⋯", theme.dim);
		}
	};
	const rendered = rows.map(render);
	const maxLines = options.maxLines;
	if (maxLines === void 0 || rendered.length <= maxLines) return rendered;
	const head = Math.floor(maxLines / 2);
	return [
		...rendered.slice(0, head),
		color(hiddenLinesMarker(rendered.length - maxLines), theme.secondary),
		...rendered.slice(rendered.length - (maxLines - head))
	];
}
/** 超长截断（显示语义同 toolArgSummary）。 */
function clip(text, max) {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
/** diff 结算卡：标题 + 红绿正文（大改动折叠为统计行）。 */
function diffCard(input, view, theme) {
	const toolInput = parseToolArguments(input.argumentsRaw);
	const title = view.title ?? input.callView?.title ?? toolCardTitle(input.toolName, toolInput);
	const lines = [formatToolCardHeader({
		toolName: input.toolName,
		title,
		isError: input.isError,
		...input.elapsedMs === void 0 ? {} : { elapsedMs: input.elapsedMs }
	}, theme)];
	const { adds, dels } = fileDiffStats(view.diffs);
	const statsLine = color(`${view.diffs.length} 处修改 (+${adds} −${dels})`, theme.muted);
	if (input.compact === true || input.expanded !== true && adds + dels > DIFF_FOLD_CHANGES) {
		lines.push(...indentToolBody([statsLine], "", theme));
		return lines;
	}
	const multiPath = new Set(view.diffs.map((d) => d.path)).size > 1;
	const body = [];
	for (const diff of view.diffs) {
		if (body.length > 0) body.push(color("⋯", theme.dim));
		if (multiPath) body.push(color(diff.path, theme.warning));
		body.push(...renderFileDiff(diff, input.expanded === true ? {} : { maxLines: DIFF_MAX_BODY_LINES }, theme));
	}
	if (body.length === 0) body.push(color("(无变更)", theme.muted));
	lines.push(...indentToolBody(body, "", theme));
	return lines;
}
/** terminal 结算卡：命令标题 + exit/signal 徽标 + cwd 头 + 折叠输出体。 */
function terminalCard(input, view, theme) {
	const toolInput = parseToolArguments(input.argumentsRaw);
	const command = view.title ?? (input.callView?.card === "terminal" ? input.callView.title : void 0);
	const title = command === void 0 ? toolCardTitle(input.toolName, toolInput) : `${toolTitleVerb(input.toolName)}(${clip(command.split("\n")[0] ?? command, COMMAND_TITLE_MAX)})`;
	const badge = view.signal !== void 0 ? color(`[${view.signal}]`, theme.warning) : view.exitCode !== void 0 && view.exitCode !== 0 ? color(`[exit ${view.exitCode}]`, theme.error) : void 0;
	const lines = [formatToolCardHeader({
		toolName: input.toolName,
		title,
		isError: input.isError,
		...input.elapsedMs === void 0 ? {} : { elapsedMs: input.elapsedMs },
		...badge === void 0 ? {} : { badge }
	}, theme)];
	if (input.compact === true) return lines;
	const body = [];
	if (input.callView?.card === "terminal" && input.callView.cwd !== void 0) body.push(color(`cwd: ${input.callView.cwd}`, theme.dim));
	const output = (view.output ?? input.content).replace(/\n+$/, "");
	const bodyColor = input.isError ? theme.error : theme.muted;
	if (!output) body.push(color("(无输出)", theme.muted));
	else {
		const rows = output.split("\n");
		const maxLines = getDefaultMaxLines(input.toolName);
		if (input.expanded === true || rows.length <= maxLines) body.push(...rows.map((row) => color(row, bodyColor)));
		else {
			body.push(...rows.slice(0, maxLines).map((row) => color(row, bodyColor)));
			body.push(color(truncationHint(rows.length - maxLines), theme.secondary));
		}
	}
	lines.push(...indentToolBody(body, "", theme));
	return lines;
}
/** GenericResultView 的 content 块折叠为显示文本（text 块拼接；无 text 块回落 undefined）。 */
function foldViewContent(view) {
	if (view.content === void 0) return void 0;
	const text = view.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
	return text === "" ? void 0 : text;
}
/**
* 结算工具卡总入口：按 presentResult 意图分派 diff / terminal 结构化卡；
* generic 与其余卡型（search/read/web 二批结构化）回落 formatToolCard
* 文本折叠（generic 的 content 块覆盖模型面文本）。
* @param input - 调用事实 + 渲染意图（桥产物，可全缺省）。
* @param theme - 当前主题。
* @returns ANSI 行数组（标题行 + 卡片体）。
*/
function formatToolViewCard(input, theme) {
	const view = input.resultView;
	if (view !== void 0) {
		if (view.card === "diff") return diffCard(input, view, theme);
		if (view.card === "terminal") return terminalCard(input, view, theme);
	}
	const override = view?.card === "generic" ? foldViewContent(view) : void 0;
	const toolInput = parseToolArguments(input.argumentsRaw);
	return formatToolCard({
		toolName: input.toolName,
		content: override ?? input.content,
		isError: input.isError,
		...toolInput === void 0 ? {} : { toolInput },
		...input.elapsedMs === void 0 ? {} : { elapsedMs: input.elapsedMs },
		...input.expanded === void 0 ? {} : { expanded: input.expanded }
	}, theme);
}
/** 亮度插值量化档数：限制每帧的转义段数（≤ 档数 + 1 段）。 */
const MIX_STEPS = 7;
/** RGB 元组 → `#rrggbb`。 */
function rgbToHex(rgb) {
	const part = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
	return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}
/**
* 两个 hex 颜色的线性插值。
* @param a - 起点色（hex）。
* @param b - 终点色（hex）。
* @param t - 插值系数（0 = a，1 = b；范围外截断）。
* @returns 插值后的 `#rrggbb`；任一输入不可解析时原样返回 `a`。
*/
function mixHex(a, b, t) {
	const ra = hexToRgb(a);
	const rb = hexToRgb(b);
	if (ra === null || rb === null) return a;
	const k = Math.max(0, Math.min(1, t));
	return rgbToHex([
		ra[0] + (rb[0] - ra[0]) * k,
		ra[1] + (rb[1] - ra[1]) * k,
		ra[2] + (rb[2] - ra[2]) * k
	]);
}
/**
* 光带高亮色派生：base 向白色混合 ~65%（GIF 光带的提亮感），不硬编码
* GIF 原色以保持主题一致性。
* @param base - 基色（主题语义 token）。
* @returns 提亮后的 hex；base 不可解析（16 色轨）时原样返回。
*/
function shimmerHighlight(base) {
	return mixHex(base, "#ffffff", .65);
}
/**
* 渲染一帧 shimmer 行：光带中心随 tick 从文本左侧 band 列外扫到右侧
* band 列外（进出场与 GIF 的循环「熄灭」帧一致），带内字符按与中心的
* 显示列距离做余弦衰减插值。
* @param input - 文本、tick 与颜色参数。
* @returns 单行 ANSI 串（末尾 RESET）；base/highlight 任一不可解析时
*   降级为静态 base 色整行。
*/
function shimmerLine(input) {
	const base = hexToRgb(input.base);
	const highlight = hexToRgb(input.highlight);
	if (base === null || highlight === null) return color(input.text, input.base);
	const period = Math.max(1, input.periodTicks ?? 15);
	const band = Math.max(1, input.bandCols ?? 6);
	const cols = displayWidth(input.text);
	const center = (input.tick % period + period) % period / period * (cols + 2 * band) - band;
	let out = "";
	let col = 0;
	let lastSeq = "";
	for (const ch of input.text) {
		const w = displayWidth(ch);
		const mid = col + w / 2;
		col += w;
		const dist = Math.abs(mid - center);
		const raw = dist >= band ? 0 : .5 * (1 + Math.cos(Math.PI * dist / band));
		const t = Math.round(raw * MIX_STEPS) / MIX_STEPS;
		const seq = fg(rgbToHex([
			base[0] + (highlight[0] - base[0]) * t,
			base[1] + (highlight[1] - base[1]) * t,
			base[2] + (highlight[2] - base[2]) * t
		]));
		if (seq !== lastSeq) {
			out += seq;
			lastSeq = seq;
		}
		out += ch;
	}
	return `${out}${ANSI.RESET}`;
}
//#endregion
//#region lib/types/format/reasoning.js
/**
* think 推理渲染 — 对标 Claude Code 的思考通道两态：
* - live 流式期：shimmer 头行（deep-diving.gif 光带样式）+ 尾 N 行暗色推理；
* - 段结束落底：静态头行 + 推理全文（暗色斜体）。推理是模型的草稿流，
*   不走 markdown 管线，保持原文样貌。
*
* 段边界与提交时机归 app.ts（首个 text-delta / tool/call / assistant/message
* 是推理段的结束点）；本模块是纯渲染函数。
*/
/** 宽度口径：与 tool-card / LiveEngine.rowsForLine 一致（CJK + ambiguous 按宽）。 */
const WIDE = { ambiguousAsWide: true };
/** 思考头行 glyph（Claude Code 视觉词汇）。 */
const HEADER_GLYPH = "✻";
/** 头行文本（无色）：`✻ 思考中… (3.2s)` / `✻ 思考 (3.2s) · 12 行`。 */
function headerText(active, elapsedMs, lineCount) {
	return `${HEADER_GLYPH} ${active ? "思考中…" : "思考"}${elapsedMs === void 0 ? "" : ` (${formatElapsed$2(elapsedMs)})`}${lineCount === void 0 ? "" : ` · ${lineCount} 行`}`;
}
/** 非空逻辑行数（折叠头行的隐藏内容提示；空文本 0）。 */
function contentLineCount(text) {
	return text.split("\n").filter((line) => line.trim() !== "").length;
}
/**
* live 区流式推理段：shimmer 头行 +（非展开时）尾 {@link REASONING_TAIL_LINES}
* 行暗色推理文本（超宽截断加省略号）；展开时渲染全部推理行。
* @param input - 推理文本、tick、耗时与终端列数。
* @param theme - 当前主题（头行基色取 primary；16 色轨自动静态降级）。
* @returns ANSI 行数组：头行 +（非紧凑时）尾巴/全文行。
*/
function formatReasoningLive(input, theme) {
	const lines = [shimmerLine({
		text: headerText(true, input.elapsedMs !== void 0 && input.elapsedMs >= 1e3 ? input.elapsedMs : void 0),
		tick: input.tick,
		base: theme.primary,
		highlight: shimmerHighlight(theme.primary)
	})];
	if (input.compact === true) return lines;
	const trimmed = input.text.replace(/\n+$/, "");
	if (!trimmed) return lines;
	const maxWidth = Math.max(10, input.columns - 3);
	const ellipsisWidth = displayWidth("…", WIDE);
	const rows = input.expanded === true ? trimmed.split("\n") : trimmed.split("\n").slice(-3);
	for (const row of rows) {
		const clipped = displayWidth(row, WIDE) > maxWidth ? `${truncateToDisplayWidth(row, maxWidth - ellipsisWidth, WIDE)}…` : row;
		lines.push(`  ${color(clipped, theme.dim, { italic: true })}`);
	}
	return lines;
}
/**
* 结算推理块（scrollback 落底形态）：静态头行（shimmer 冻结为 dim，与
* GIF 循环的「熄灭」帧一致）。默认折叠——只落头行（含隐藏行数提示），
* 正文经 expanded 展开渲染（对标竞品：思考默认收起，按需查看全文）。
* @param input - 推理全文、总耗时与折叠/展开/紧凑开关。
* @param theme - 当前主题。
* @returns ANSI 行数组：头行 +（expanded 且非 compact 时）全文行；空文本仅头行。
*/
function formatReasoningBlock(input, theme) {
	const lineCount = contentLineCount(input.text);
	const lines = [color(headerText(false, input.elapsedMs, lineCount === 0 ? void 0 : lineCount), theme.dim, { italic: true })];
	if (input.compact === true || input.expanded !== true) return lines;
	const trimmed = input.text.replace(/\n+$/, "");
	if (!trimmed) return lines;
	for (const row of trimmed.split("\n")) lines.push(row === "" ? "" : `  ${color(row, theme.muted, { italic: true })}`);
	return lines;
}
//#endregion
//#region lib/types/format/keymap-panel.js
/**
* 快捷键面板（grok-build Ctrl+. 键位清单弹层移植）。
*
* 纯函数层：KEYMAP_ENTRIES 是当前实现的完整快捷键表单一事实来源，
* renderKeymapPanel 把条目渲染为两列对齐行（键位左列 + 动作右列），
* 窄宽降级为单列紧凑行、超宽截断不破版。TuiApp 把它注册为 overlay
* 渲染器，Ctrl+. 触发进出。
*
* @module @deepseek-ai/dsh-tianshu-tui/format/keymap-panel
*/
/** 当前实现的完整快捷键表（新增键位时在此登记，面板自动跟随）。 */
const KEYMAP_ENTRIES = [
	{
		keys: "Enter",
		action: "发送"
	},
	{
		keys: "Shift+Enter",
		action: "换行（或 \\+Enter 续行）"
	},
	{
		keys: "Ctrl+P",
		action: "命令面板"
	},
	{
		keys: "Ctrl+O",
		action: "展开/收起推理块"
	},
	{
		keys: "Ctrl+E",
		action: "外部编辑器"
	},
	{
		keys: "Ctrl+T",
		action: "中轮转向"
	},
	{
		keys: "Ctrl+U",
		action: "删除到行首"
	},
	{
		keys: "Tab",
		action: "@-路径补全"
	},
	{
		keys: "Ctrl+.",
		action: "快捷键面板"
	},
	{
		keys: "Esc",
		action: "取消/关闭"
	}
];
/** 键位列宽：最长键位 + 2 列间隔。 */
function keyColumnWidth(entries) {
	let max = 0;
	for (const entry of entries) {
		const w = displayWidth(entry.keys);
		if (w > max) max = w;
	}
	return max + 2;
}
/**
* 渲染快捷键面板为行数组：标题 + 两列对齐条目。
* 宽度不足时动作列按剩余宽度截断；极端窄宽（连键位列都放不下）降级为
* 紧凑单列 `键位 动作`（不截断键位，动作截断）。
* @param width - 终端列数。
* @returns ANSI 行数组（无着色——overlay 面板由上层统一取色）。
*/
function renderKeymapPanel(width) {
	const rows = ["快捷键", ""];
	if (width < 12) return rows;
	const keyCol = keyColumnWidth(KEYMAP_ENTRIES);
	const actionBudget = Math.max(1, width - keyCol);
	for (const entry of KEYMAP_ENTRIES) {
		if (keyCol >= width) {
			const compact = ` ${entry.keys} ${entry.action}`;
			rows.push(compact.slice(0, width));
			continue;
		}
		const padded = ` ${entry.keys}${" ".repeat(keyCol - displayWidth(entry.keys))}`;
		const action = displayWidth(entry.action) > actionBudget ? truncateByWidth$7(entry.action, actionBudget) : entry.action;
		rows.push(`${padded}${action}`);
	}
	return rows;
}
/** 按显示宽度截断字符串（尾部补 …）。 */
function truncateByWidth$7(text, max) {
	let out = "";
	let w = 0;
	for (const ch of text) {
		const cw = displayWidth(ch);
		if (w + cw > max - 1) break;
		out += ch;
		w += cw;
	}
	return `${out}…`;
}
//#endregion
//#region lib/types/format/export.js
/**
* /export 会话导出渲染（纯函数，Cordis-free）：session events → Markdown 文本。
* 数据源是会话日志（权威事件流）——导出完整内容（无折叠/截断的渲染视图缺陷）；
* 工具结果超长按 5000 字符截断并附标记。同输入恒同输出（可测）。
* @module @deepseek-ai/dsh-tianshu-tui/format/export
*/
/** 工具结果文本截断上限。 */
const TOOL_RESULT_CAP = 5e3;
/** 抽取消息的文本块（text + reasoning 分离）。 */
function messageText(message) {
	let text = "";
	let reasoning = "";
	for (const block of message.content) switch (block.type) {
		case "text":
			text += block.text;
			break;
		case "reasoning":
			reasoning += block.text;
			break;
		default: break;
	}
	return {
		text,
		reasoning
	};
}
/** 截断超长文本（保留头部 + 尾部 + 标记）。 */
function truncate$1(text, cap) {
	if (text.length <= cap) return text;
	return `${text.slice(0, cap)}\n…+${text.length - cap} 字符`;
}
/** 渲染一条工具结果消息（ToolResultMessage 的 content 是 ToolResultBlock 元组）。 */
function renderToolResult(message) {
	return truncate$1(message.content.flatMap((block) => block.type === "tool-result" ? block.content : []).filter((block) => block.type === "text").map((block) => block.text).join(""), TOOL_RESULT_CAP);
}
/**
* 把会话事件渲染为可分享的 Markdown 转录。
* @param events - 会话事件日志（权威数据源）。
* @param meta - 导出头信息。
* @returns 完整 Markdown 文本。
*/
function renderSessionExport(events, meta) {
	const lines = [];
	lines.push(`# Session export — ${meta.sessionId}`);
	if (meta.cwd !== void 0 && meta.cwd !== "") lines.push(`工作区: ${meta.cwd}`);
	lines.push("");
	let count = 0;
	for (const event of events) switch (event.type) {
		case "user/message": {
			const { text } = messageText(event.data);
			if (text !== "") {
				lines.push("## 用户", "", text, "");
				count++;
			}
			break;
		}
		case "assistant/message": {
			const { text, reasoning } = messageText(event.data.message);
			const toolCalls = event.data.message.content.filter((block) => block.type === "tool-call").map((block) => `${block.name}(${block.arguments})`);
			if (text === "" && reasoning === "" && toolCalls.length === 0) break;
			lines.push("## Assistant", "");
			if (reasoning !== "") lines.push(`> 推理: ${reasoning}`, "");
			if (text !== "") lines.push(text, "");
			for (const call of toolCalls) lines.push(`工具调用: \`${call}\``);
			lines.push("");
			count++;
			break;
		}
		case "tool/result": {
			const text = renderToolResult(event.data.message);
			if (text !== "") {
				lines.push("## 工具结果", "", text, "");
				count++;
			}
			break;
		}
		default: break;
	}
	if (count === 0) lines.push("（无消息）");
	return lines.join("\n");
}
//#endregion
//#region lib/types/question-panel.js
/**
* 结构化提问面板（user-questions 数据面移植，纯函数层）。
*
* projectQuestionPanel 把 AskUserQuestionRequest 形状的提问投影为面板行：
* 标题行 + 每个 question 一块。两种渲染形态：
* - 通用选项面板：header 分隔行（可选）+ ❓ 问题行（multiSelect 尾缀
*   「（多选）」）+ detail 缩进行（可选）+ 编号选项行（「n. label」，
*   option.description 二级缩进）；
* - plan-review 决策卡：🧭 问题行 + detail 缩进行（计划正文）+ 选项行按
*   intent.approve 分类——命中的 label 标 ✓ 且 BOLD 高亮（批准项），其余
*   标 ✗（否决项）；approve 不命中任何选项时全部按否决渲染（不吞异常、
*   不伪造批准）；multiSelect 在决策卡形态不追加多选标记（裁决为单选）。
* 数据面形状结构兼容 @deepseek-ai/dsh-user-questions 的
* AskUserQuestionRequest/AskUserQuestionItem（intent 唯一 kind
* 'plan-review' 带 approve: string），纯函数层不跨包依赖、无 I/O。
* 空 questions 返回仅标题行；每行按显示宽度截断（仅截断时补 …，
* 极端窄宽退化为 … 不抛错）。TuiApp 消费 user-questions 提供方的
* request 快照（接线由其他维度独占）。
*
* @module @deepseek-ai/dsh-tianshu-tui/question-panel
*/
/** 面板标题行。 */
const TITLE$5 = "❓ 提问";
/** 多选标记（尾缀在通用问题行）。 */
const MULTI_MARK = "（多选）";
/** 粗体（与 engine/ansi.ts 的 ANSI.BOLD 一致；纯函数层不跨模块依赖）。 */
const BOLD = "\x1B[1m";
/** SGR 重置转义序列。 */
const RESET$2 = "\x1B[0m";
/** plan-review 批准项标记。 */
const APPROVE_MARK = "✓";
/** plan-review 否决项标记。 */
const REJECT_MARK = "✗";
/**
* 投影提问请求为面板行（标题 + 每个 question 一块，按输入顺序）。
* @param request - 提问请求（只消费 questions 字段）。
* @param opts - 面板选项（行宽预算）。
* @returns 面板行数组（空 questions → 仅标题行）。
*/
function projectQuestionPanel(request, opts) {
	const rows = [TITLE$5];
	for (const item of request.questions) rows.push(...projectQuestion(item, opts.width));
	return rows;
}
/** 渲染单个 question 块（header + 问题行 + detail + 选项行；形态由 intent 决定）。 */
function projectQuestion(item, width) {
	const rows = [];
	if (item.header !== void 0) rows.push(truncateByWidth$6(`── ${item.header} ──`, width));
	const intent = item.intent;
	if (intent?.kind === "plan-review") {
		rows.push(truncateByWidth$6(`🧭 ${item.question}`, width));
		if (item.detail !== void 0) rows.push(...projectDetail(item.detail, width));
		rows.push(...projectPlanOptions(item.options, intent.approve, width));
		rows.push(...projectPlanKeyHints(item, width));
		return rows;
	}
	const multiMark = item.multiSelect === true ? MULTI_MARK : "";
	rows.push(truncateByWidth$6(`❓ ${item.question}${multiMark}`, width));
	if (item.detail !== void 0) rows.push(...projectDetail(item.detail, width));
	rows.push(...projectOptionList(item.options, width));
	return rows;
}
/** detail 按行拆分，每行渲染为一级缩进行（plan-review 卡中为计划正文）。 */
function projectDetail(detail, width) {
	return detail.split(/\r?\n/).map((line) => truncateByWidth$6(`  ${line}`, width));
}
/** plan-review 卡选项行：approve 命中 ✓ + BOLD 高亮，其余 ✗。 */
function projectPlanOptions(options, approve, width) {
	if (options === void 0) return [];
	const rows = [];
	options.forEach((opt, i) => {
		const isApprove = opt.label === approve;
		const cut = truncateByWidth$6(`  ${isApprove ? APPROVE_MARK : REJECT_MARK} ${i + 1}. ${opt.label}`, width);
		rows.push(isApprove ? `${BOLD}${cut}${RESET$2}` : cut);
	});
	return rows;
}
/** plan-review 卡 key hints：数字键选选项（编号 1-based），f 反馈，Esc/Ctrl+C 取消。 */
function projectPlanKeyHints(item, width) {
	const approve = item.intent?.approve;
	const approveIdx = item.options?.findIndex((o) => o.label === approve);
	const keepIdx = item.options?.findIndex((o, i) => i !== approveIdx && o.label !== approve);
	const hints = [];
	if (approveIdx !== void 0 && approveIdx >= 0) hints.push(`[${approveIdx + 1}] ${item.options?.[approveIdx]?.label ?? ""}`);
	if (keepIdx !== void 0 && keepIdx >= 0) hints.push(`[${keepIdx + 1}] ${item.options?.[keepIdx]?.label ?? ""}`);
	hints.push("[f] 反馈修改", "[Esc]/[Ctrl+C] 取消");
	return [truncateByWidth$6(`  ${hints.join("  ")}`, width)];
}
/** 通用选项行：编号 + label，description 二级缩进。 */
function projectOptionList(options, width) {
	if (options === void 0) return [];
	const rows = [];
	options.forEach((opt, i) => {
		rows.push(truncateByWidth$6(`  ${i + 1}. ${opt.label}`, width));
		if (opt.description !== void 0) rows.push(truncateByWidth$6(`    ${opt.description}`, width));
	});
	return rows;
}
/** 按显示宽度截断字符串（仅发生截断时尾部补 …；极端窄宽退化为 …）。 */
function truncateByWidth$6(text, max) {
	if (max <= 1) return "…";
	let out = "";
	let w = 0;
	for (const ch of text) {
		const cw = displayWidth(ch);
		if (w + cw > max - 1) break;
		out += ch;
		w += cw;
	}
	return w < displayWidth(text) ? `${out}…` : out;
}
//#endregion
//#region lib/types/format/task-panel.js
/**
* 任务窗格（grok-build /tasks 面板移植）。
*
* 纯函数层：projectTaskPanel 把 sessionProjections 注册表的任务投影
* （全量快照或 null）投影为面板行。null = 从未写过任务（面板不渲染）；
* 空数组 = 已清空（渲染占位）。TuiApp 消费注册表的任务单元，/tasks 命令
* 切换显隐，行渲染进 live 区。
*
* @module @deepseek-ai/dsh-tianshu-tui/format/task-panel
*/
/** 面板标题行。 */
const TITLE$4 = "📋 任务";
/** 状态 → 标记符号。 */
function statusMark(status) {
	if (status === "completed") return "[x]";
	if (status === "in_progress") return "⏳";
	return "[ ]";
}
/**
* 投影任务快照为面板行。
* @param tasks - 任务全量快照；null（从未写入）→ 空数组（不渲染面板）。
* @param width - 终端列数（行截断预算，含标题）。
* @returns 面板行数组（含标题与空态占位；null 输入返回空数组）。
*/
function projectTaskPanel(tasks, width) {
	if (tasks === null) return [];
	const rows = [TITLE$4];
	if (tasks.length === 0) {
		rows.push("（无任务）");
		return rows;
	}
	for (const task of tasks) rows.push(truncateByWidth$5(` ${statusMark(task.status)} ${task.content}`, Math.max(1, width)));
	return rows;
}
/** 按显示宽度截断字符串（仅发生截断时尾部补 …）。 */
function truncateByWidth$5(text, max) {
	if (max <= 1) return "…";
	let out = "";
	let w = 0;
	for (const ch of text) {
		const cw = displayWidth(ch);
		if (w + cw > max - 1) break;
		out += ch;
		w += cw;
	}
	return w < displayWidth(text) ? `${out}…` : out;
}
//#endregion
//#region lib/types/status-panel.js
/**
* /status 状态面板（grok-build goal_detail 面板移植，纯函数层）。
*
* projectStatusPanel 把 goal/todos/plan 三个投影快照渲染为面板行：
* 目标段（状态标签 + objective + 轮次 + 阻塞原因）、任务段（复用
* task-panel 三态行）、计划模式段（active/pending 徽标）。null 快照 =
* 从未写入（该段不渲染）；空数组 = 已清空（任务段渲染占位）。TuiApp 消费
* sessionProjections 的 goal/todos/plan 单元，/status 命令切换显隐，行
* 渲染进 live 区（接线在 ui/app.ts 与 registry.ts，由其他维度独占）。
*
* @module @deepseek-ai/dsh-tianshu-tui/status-panel
*/
/** status_label 映射（参照 grok-build goal_detail：状态 → (文本, 颜色, 阶段)）。 */
const STATUS_LABELS = {
	active: {
		text: "进行中",
		color: "green",
		stage: "active"
	},
	paused: {
		text: "已暂停",
		color: "yellow",
		stage: "paused"
	},
	blocked: {
		text: "已阻塞",
		color: "red",
		stage: "blocked"
	},
	complete: {
		text: "已完成",
		color: "blue",
		stage: "complete"
	}
};
/** 目标段标题行。 */
const GOAL_TITLE = "◆ 目标";
/** 计划段徽标前缀。 */
const PLAN_TITLE = "📐 计划";
/**
* 状态 → (文本, 颜色, 阶段) 三元组映射（grok-build status_label 模式）。
* @param phase - goal 投影单元的状态阶段。
* @returns 状态文本、语义色名与阶段标识。
*/
function goalStatusLabel(phase) {
	return STATUS_LABELS[phase];
}
/**
* 投影 goal/todos/plan 快照为 /status 面板行。
* @param goal - goal 投影快照；null（从未写入）→ 目标段不渲染。
* @param todos - 任务快照；null → 任务段不渲染，空数组 → 渲染占位。
* @param plan - plan 投影快照；null → 计划段不渲染。
* @param opts - 渲染选项（含行截断宽度预算）。
* @returns 面板行数组（三段按目标/任务/计划顺序拼接）。
*/
function projectStatusPanel(goal, todos, plan, opts) {
	const rows = [];
	if (goal !== null) rows.push(...projectGoalSection(goal, opts.width));
	rows.push(...projectTaskPanel(todos, Math.max(1, opts.width)));
	if (plan !== null) rows.push(...projectPlanSection(plan, opts.width));
	return rows;
}
/** 目标段：状态行 + objective + 轮次 + 阻塞原因。 */
function projectGoalSection(goal, width) {
	const rows = [];
	const label = goalStatusLabel(goal.goal.phase);
	rows.push(truncateByWidth$4(`${GOAL_TITLE} · ${label.text}`, width));
	rows.push(truncateByWidth$4(goal.goal.objective, width));
	rows.push(truncateByWidth$4(`↻ 轮次 ${goal.roundsStarted}/${goal.goal.maxGoalRounds}`, width));
	if (goal.goal.phase === "blocked" && goal.goal.blockedReason !== void 0) rows.push(truncateByWidth$4(`🚧 ${goal.goal.blockedReason.message}`, width));
	return rows;
}
/** 计划段：active/pending 徽标单行。 */
function projectPlanSection(plan, width) {
	return [truncateByWidth$4(`${PLAN_TITLE} · ${plan.active ? "进行中" : "关闭"}${plan.pending === true ? " · 待生效" : ""}`, width)];
}
/** 按显示宽度截断字符串（仅发生截断时尾部补 …；极端窄宽退化为 …）。 */
function truncateByWidth$4(text, max) {
	if (max <= 1) return "…";
	let out = "";
	let w = 0;
	for (const ch of text) {
		const cw = displayWidth(ch);
		if (w + cw > max - 1) break;
		out += ch;
		w += cw;
	}
	return w < displayWidth(text) ? `${out}…` : out;
}
//#endregion
//#region lib/types/delegation-panel.js
/**
* 委派树面板（grok-build tasks_pane 分组行移植，纯函数层）。
*
* projectDelegationTree 把 listDescendants 的树条目与 subagent 投影
* （identity/timing）投影为面板行：标题行 + 每层委派一行，depth 驱动层级
* 缩进，activity 状态标记（running ● / inactive ○），mode 标记（one-shot
* ▶ / continuable ↻），label 缺失回退 id 前 8 位短哈希，耗时取
* subagentTiming settledMs（秒，一位小数）。null 投影与缺失 timing 均按
* 「无数据不渲染该字段」处理；diagnostic 条目渲染警示行（不吞异常、不伪造
* activity/mode）。空 entries 返回空数组——无委派树则不渲染面板。TuiApp
* 消费 listDescendants 快照与 sessionProjections 的 subagent/subagentTiming
* 单元，行渲染进 live 区（接线由其他维度独占）。
*
* @module @deepseek-ai/dsh-tianshu-tui/delegation-panel
*/
/** 面板标题行。 */
const TITLE$3 = "🌳 委派";
/** activity → 状态标记。 */
function activityMark(activity) {
	return activity === "running" ? "●" : "○";
}
/** mode → 模式标记。 */
function modeMark(mode) {
	return mode === "continuable" ? "↻" : "▶";
}
/** diagnostic reason → 警示文本。 */
function reasonLabel(reason) {
	if (reason === "corrupt") return "损坏";
	if (reason === "unavailable") return "不可用";
	return "不支持";
}
/** id 前 8 位短哈希（label 缺失回退）。 */
function shortHash(id) {
	return id.slice(0, 8);
}
/** settledMs → 秒文本（一位小数）。 */
function formatSettled(ms) {
	return `${(ms / 1e3).toFixed(1)}s`;
}
/**
* 投影委派树为面板行。
* @param entries - listDescendants 树条目（已按 pre-order 排序）；空数组 → 空行数组（面板不渲染）。
* @param identities - 按 id 键控的 subagent 身份投影（label/mode 覆盖 entry 自带值）。
* @param timings - 按 id 键控的 subagent 耗时投影（settledMs → 耗时后缀）。
* @param opts - 渲染选项（含行截断宽度预算）。
* @returns 面板行数组（标题 + 每层委派一行；空输入返回空数组）。
*/
function projectDelegationTree(entries, identities, timings, opts) {
	if (entries.length === 0) return [];
	const rows = [truncateByWidth$3(TITLE$3, opts.width)];
	for (const entry of entries) rows.push(renderEntry(entry, identities, timings, opts.width));
	return rows;
}
/** 渲染单个条目为一行（child 渲染状态行，diagnostic 渲染警示行）。 */
function renderEntry(entry, identities, timings, width) {
	const indent = "  ".repeat(Math.max(0, entry.depth));
	if (entry.kind === "diagnostic") return truncateByWidth$3(`${indent}⚠ ${reasonLabel(entry.reason)} ${shortHash(entry.id)}`, width);
	const identity = identities.get(entry.id);
	const mode = identity?.mode ?? entry.mode;
	const label = identity?.label ?? entry.label ?? shortHash(entry.id);
	const timing = timings.get(entry.id);
	const timingSuffix = timing === void 0 ? "" : ` ${formatSettled(timing.settledMs)}`;
	return truncateByWidth$3(`${indent}${activityMark(entry.activity)} ${modeMark(mode)} ${label}${timingSuffix}`, width);
}
/** 按显示宽度截断字符串（仅发生截断时尾部补 …；极端窄宽退化为 …）。 */
function truncateByWidth$3(text, max) {
	if (max <= 1) return "…";
	let out = "";
	let w = 0;
	for (const ch of text) {
		const cw = displayWidth(ch);
		if (w + cw > max - 1) break;
		out += ch;
		w += cw;
	}
	return w < displayWidth(text) ? `${out}…` : out;
}
//#endregion
//#region lib/types/workflow-panel.js
/**
* workflow-panel — 工作流运行态面板（grok workflows.rs render_list/roster 移植，纯函数层）。
*
* projectWorkflow 把多个 run 的运行态视图投影为面板行：
* - 列表行：状态字形 + badge + objective + meta（phases/agents/elapsed），cancelled 整行 DIM 置灰；
* - 展开行：opts.expanded 命中的 run 追加 roster（label + phase + 状态）；
* - 终态汇总：消费 stopReason/agentsStarted（grok 的死字段我们消费），error 消息可选进汇总行。
* 数据面形状结构兼容 workflow 包 types.ts（WorkflowRunInfo 字段名 id；WorkflowAgentEndInfo
* 追加 outcome；WorkflowResultInfo 无 value），纯函数层不跨包依赖、无 I/O。
*
* @module @deepseek-ai/dsh-tianshu-tui/workflow-panel
*/
/** 面板标题行。 */
const TITLE$2 = "📜 工作流";
/** 空态占位行。 */
const EMPTY$1 = "（暂无工作流）";
/** 置灰（细体/暗色）转义序列：cancelled 列表行整行包裹。 */
const DIM$1 = "\x1B[2m";
/** SGR 重置转义序列。 */
const RESET$1 = "\x1B[0m";
/** 运行中字形（result 未结算）。 */
const RUNNING_GLYPH = "⏳";
/** 终态原因 → 列表行状态字形。 */
const RUN_GLYPHS = {
	completed: "✓",
	cancelled: "⊘",
	error: "✗"
};
/** 终态原因 → 汇总行文本。 */
const STOP_TEXTS = {
	completed: "已完成",
	cancelled: "已取消",
	error: "出错"
};
/** 结算方式 → roster 行状态文本。 */
const OUTCOME_TEXTS = {
	completed: "已完成",
	failed: "失败",
	cancelled: "已取消"
};
/**
* run 的状态字形：未结算 → ⏳；否则按终态原因映射。
* @param view - run 运行态视图。
* @returns 状态字形。
*/
function runGlyph(view) {
	const reason = view.result?.stopReason;
	return reason === void 0 ? RUNNING_GLYPH : RUN_GLYPHS[reason];
}
/**
* 毫秒 → 人类可读时长（45s / 1m20s / 2h1m）。
* @param ms - 毫秒数。
* @returns 格式化时长。
*/
function formatElapsed$1(ms) {
	const s = Math.floor(ms / 1e3);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m${s % 60}s`;
	return `${Math.floor(m / 60)}h${m % 60}m`;
}
/**
* 单个 run 的列表行：字形 + [badge] + objective + meta（phases/agents/elapsed）。
* cancelled 的 run 整行（截断后）DIM 包裹置灰。
* @param view - run 运行态视图。
* @param width - 行截断预算。
* @returns 列表行（可能含 ANSI）。
*/
function projectListRow$1(view, width) {
	const meta = [];
	if (view.info.meta.phases !== void 0) meta.push(`${view.info.meta.phases.length} 阶段`);
	meta.push(`${view.agents.length} 个 agent`);
	if (view.elapsedMs !== void 0) meta.push(formatElapsed$1(view.elapsedMs));
	const cut = truncateByWidth$2(`${runGlyph(view)} [${view.info.meta.name}] ${view.info.meta.description} · ${meta.join(" · ")}`, width);
	return view.result?.stopReason === "cancelled" ? `${DIM$1}${cut}${RESET$1}` : cut;
}
/**
* 展开行：roster 每行「序号. label · phase · 状态」（phase 缺省跳过）。
* @param view - run 运行态视图。
* @param width - 行截断预算。
* @returns roster 行数组（无 agent 时为空数组）。
*/
function projectRosterRows(view, width) {
	const rows = [];
	for (const agent of view.agents) {
		const phase = agent.phase === void 0 ? "" : ` · ${agent.phase}`;
		rows.push(truncateByWidth$2(`  ├ ${agent.seq}. ${agent.label}${phase} · ${OUTCOME_TEXTS[agent.outcome]}`, width));
	}
	return rows;
}
/**
* 终态汇总行：消费 stopReason/agentsStarted，error 消息可选。
* @param view - run 运行态视图。
* @param width - 行截断预算。
* @returns 汇总行数组（run 未结算时为空数组）。
*/
function projectResultRow(view, width) {
	const result = view.result;
	if (result === void 0) return [];
	const errorPart = result.error === void 0 ? "" : ` · ${result.error}`;
	return [truncateByWidth$2(`  └ 终态：${STOP_TEXTS[result.stopReason]}${errorPart} · 启动 ${result.agentsStarted} 个 agent`, width)];
}
/**
* 投影多个 run 的运行态视图为面板行（标题 + 列表行 + 展开的 roster/终态汇总）。
* @param runs - run 视图数组；空数组 → 标题 + 空态占位。
* @param opts - 面板选项（行宽 + 展开集合）。
* @returns 面板行数组。
*/
function projectWorkflow(runs, opts) {
	const rows = [TITLE$2];
	if (runs.length === 0) {
		rows.push(EMPTY$1);
		return rows;
	}
	const expanded = opts.expanded;
	for (const view of runs) {
		rows.push(projectListRow$1(view, opts.width));
		if (expanded !== void 0 && expanded.includes(view.info.id)) {
			rows.push(...projectRosterRows(view, opts.width));
			rows.push(...projectResultRow(view, opts.width));
		}
	}
	return rows;
}
/** 按显示宽度截断字符串（仅发生截断时尾部补 …；极端窄宽退化为 …）。 */
function truncateByWidth$2(text, max) {
	if (max <= 1) return "…";
	let out = "";
	let w = 0;
	for (const ch of text) {
		const cw = displayWidth(ch);
		if (w + cw > max - 1) break;
		out += ch;
		w += cw;
	}
	return w < displayWidth(text) ? `${out}…` : out;
}
//#endregion
//#region lib/types/config-panel.js
/**
* /config 设置面板（纯函数层，T3.2）。
*
* projectConfigPanel 把 settings 描述符、权限预设选择、凭据信息三段投影渲染
* 为面板行：
* - 设置段：每个命名空间一行（ns + 值 + secrets 脱敏标记）——值以 unknown
*   流动（SettingsValue 类型不存在），null/undefined 渲染 —，object 紧凑
*   JSON；schema 声明的 secret 槽用 🔒 标记（有值的显示已脱敏计数，空槽
*   显示槽位）。
* - 权限预设选择器：选项名从投影动态取（不硬编码预设表），当前值打勾 ✓、
*   其余 ○；仅 'custom' 一个保留字——currentValue 为 custom 而选项缺失时
*   补一行。
* - 凭据徽章：每行一个凭据（ref + 已配置/未配置徽章 + source + 可写/只读），
*   writable 为 false 时整行 DIM 置灰。
* 数据面形状结构兼容 dsh-settings 的 SettingsDescriptor（ns/value/secrets）、
* dsh-permission 的 PermissionSelect（options/currentValue）与 dsh-credentials
* 的 CredentialInfo（configured/source/writable）——纯函数层不跨包依赖、无
* I/O 无服务访问。permission 为 null（未组合权限服务）时选择器段不渲染。
* TuiApp 消费三个投影快照，/config 命令切换显隐，行渲染进 live 区（接线由
* 其他维度独占）。
*
* @module @deepseek-ai/dsh-tianshu-tui/config-panel
*/
/** 面板标题行。 */
const TITLE$1 = "⚙ 配置";
/** 设置段标题。 */
const SETTINGS_TITLE = "◆ 设置";
/** 权限预设段标题。 */
const PERMISSION_TITLE = "◆ 权限预设";
/** 凭据段标题。 */
const CREDENTIALS_TITLE = "◆ 凭据";
/** 设置空态占位。 */
const EMPTY_SETTINGS = "  （无设置项）";
/** 凭据空态占位。 */
const EMPTY_CREDENTIALS = "  （无凭据）";
/** 置灰（细体/暗色）转义序列：只读凭据行整行包裹。 */
const DIM = "\x1B[2m";
/** SGR 重置转义序列。 */
const RESET = "\x1B[0m";
/** 当前选中选项标记。 */
const CHECK = "✓";
/** 非当前选项标记。 */
const CIRCLE = "○";
/** 已配置徽章。 */
const CONFIGURED = "● 已配置";
/** 未配置徽章。 */
const UNCONFIGURED = "○ 未配置";
/** 权限预设唯一保留字：派生自 knob 组合、不在预设表中的当前值。 */
const CUSTOM = "custom";
/**
* 投影 settings/permission/credentials 三块为 /config 面板行。
* @param projection - 面板投影（设置描述符 + 权限选择 + 凭据信息）。
* @param opts - 渲染选项（含行截断宽度预算）。
* @returns 面板行数组（标题 + 设置段 + 权限预设段（permission 非 null 时）+ 凭据段）。
*/
function projectConfigPanel(projection, opts) {
	const rows = [truncateByWidth$1(TITLE$1, opts.width)];
	rows.push(...projectSettingsSection(projection.settings, opts.width));
	if (projection.permission !== null) rows.push(...projectPermissionSection(projection.permission, opts.width));
	rows.push(...projectCredentialsSection(projection.credentials, opts.width));
	return rows;
}
/** 设置段：段标题 + 每个命名空间一行（ns + 值 + secrets 脱敏标记）；空数组渲染占位。 */
function projectSettingsSection(settings, width) {
	const rows = [truncateByWidth$1(SETTINGS_TITLE, width)];
	if (settings.length === 0) {
		rows.push(truncateByWidth$1(EMPTY_SETTINGS, width));
		return rows;
	}
	for (const desc of settings) rows.push(truncateByWidth$1(`  ${desc.ns} · ${formatValue(desc.value)}${secretMark(desc.secrets)}`, width));
	return rows;
}
/**
* unknown 值 → 显示文本。string/number/boolean 直出；object/array 紧凑
* JSON；symbol/function/bigint 顶层值属于数据违约（JSON-shaped 契约不可
* 达），回退显示类型名防渲染崩溃。
* @param value - 设置命名空间的当前解析值。
* @returns 显示文本（null/undefined → —）。
*/
function formatValue(value) {
	if (value === void 0 || value === null) return "—";
	switch (typeof value) {
		case "string": return value;
		case "number": return String(value);
		case "boolean": return String(value);
		case "symbol":
		case "function":
		case "bigint": return typeof value;
		default: return JSON.stringify(value);
	}
}
/**
* secrets 脱敏标记：无槽/空数组 → 无标记；有已脱敏值 → 计数标记；仅空槽 → 槽位标记。
* @param secrets - schema 声明的 secret 槽（redactSecrets 后的描述符携带）。
* @returns 行内脱敏标记后缀（无槽时为空串）。
*/
function secretMark(secrets) {
	if (secrets === void 0 || secrets.length === 0) return "";
	const set = secrets.filter((s) => s.set).length;
	return set > 0 ? ` 🔒 ${set} 密钥已脱敏` : " 🔒 密钥槽";
}
/** 权限预设段：段标题 + 每个选项一行（当前 ✓ / 其余 ○）；custom 保留字缺失时补行。 */
function projectPermissionSection(permission, width) {
	const rows = [truncateByWidth$1(PERMISSION_TITLE, width)];
	const options = [...permission.options];
	if (permission.currentValue === CUSTOM && !options.some((opt) => opt.value === CUSTOM)) options.push({
		value: CUSTOM,
		name: CUSTOM
	});
	for (const opt of options) {
		const mark = opt.value === permission.currentValue ? CHECK : CIRCLE;
		rows.push(truncateByWidth$1(`  ${mark} ${opt.name}`, width));
	}
	return rows;
}
/** 凭据段：段标题 + 每个凭据一行徽章；空数组渲染占位。 */
function projectCredentialsSection(credentials, width) {
	const rows = [truncateByWidth$1(CREDENTIALS_TITLE, width)];
	if (credentials.length === 0) {
		rows.push(truncateByWidth$1(EMPTY_CREDENTIALS, width));
		return rows;
	}
	for (const cred of credentials) rows.push(projectCredentialRow(cred, width));
	return rows;
}
/**
* 单个凭据徽章行：ref + 已配置/未配置 + source + 可写/只读；writable 为
* false 时整行（截断后）DIM 置灰。
* @param cred - 凭据信息。
* @param width - 行截断预算。
* @returns 徽章行（只读时含 ANSI）。
*/
function projectCredentialRow(cred, width) {
	const configured = cred.configured ? CONFIGURED : UNCONFIGURED;
	const source = cred.source === void 0 ? "" : ` · ${cred.source}`;
	const writable = cred.writable ? "可写" : "只读";
	const row = truncateByWidth$1(`  ${cred.ref} ${configured}${source} · ${writable}`, width);
	return cred.writable ? row : `${DIM}${row}${RESET}`;
}
/** 按显示宽度截断字符串（仅发生截断时尾部补 …；极端窄宽退化为 …）。 */
function truncateByWidth$1(text, max) {
	if (max <= 1) return "…";
	let out = "";
	let w = 0;
	for (const ch of text) {
		const cw = displayWidth(ch);
		if (w + cw > max - 1) break;
		out += ch;
		w += cw;
	}
	return w < displayWidth(text) ? `${out}…` : out;
}
//#endregion
//#region lib/types/skill-panel.js
/**
* 技能浏览面板（skill 数据面移植，纯函数层，T3.3）。
*
* projectSkillPanel 把 SkillSummary 形状的快照投影为面板行：
* - 列表行：每个 skill 一行「name · description · 来源标记」——来源标记按
*   SkillSource 已知值映射短标签（项目 .dsh / 项目 AGENTS / 运行时 / 用户
*   .dsh / 用户 AGENTS / 自定义 / 内置），未知来源回退渲染原值；
* - 选中详情：opts.selected 命中的 skill 在其列表行后追加一行
*   「└ provider · 调用形态 · whenToUse」（whenToUse 缺省时省略该段）——
*   调用形态由 invocation.modelInvocable/userInvocable 组合推导
*   （模型+用户可调 / 仅模型可调 / 仅用户可调 / 不可调），selected 未命中
*   或缺省不渲染详情行。
* 数据面形状结构兼容 @deepseek-ai/dsh-skill 的 SkillSummary（纯函数层只消费
* name/description/whenToUse/invocation/source/provider；resourceBase 不参与
* 渲染），skills/change 无 payload 事件、刷新靠重查，面板层只消费 list 快照
* 投影。空列表渲染标题 + 空态占位；每行按显示宽度截断（仅截断时补 …，
* 极端窄宽退化为 … 不抛错）。TuiApp 消费技能快照与 /skills 命令切换显隐
* （接线由其他维度独占）。
*
* @module @deepseek-ai/dsh-tianshu-tui/skill-panel
*/
/** 面板标题行。 */
const TITLE = "🧭 技能";
/** 空态占位行。 */
const EMPTY = "（暂无技能）";
/** 已知 SkillSource → 短标签；未知来源回退渲染原值。 */
const SOURCE_LABELS = {
	"project-dsh": "项目 .dsh",
	"project-agents": "项目 AGENTS",
	runtime: "运行时",
	"user-dsh": "用户 .dsh",
	"user-agents": "用户 AGENTS",
	custom: "自定义",
	bundled: "内置"
};
/**
* 投影技能快照为面板行（标题 + 列表行 + 命中的选中详情行）。
* @param skills - skill 摘要数组；空数组 → 标题 + 空态占位。
* @param opts - 面板选项（行宽预算 + 可选选中名）。
* @returns 面板行数组。
*/
function projectSkillPanel(skills, opts) {
	const rows = [TITLE];
	if (skills.length === 0) {
		rows.push(EMPTY);
		return rows;
	}
	for (const skill of skills) {
		rows.push(truncateByWidth(projectListRow(skill), opts.width));
		if (skill.name === opts.selected) rows.push(truncateByWidth(projectDetailRow(skill), opts.width));
	}
	return rows;
}
/** 单个 skill 列表行：name · description · 来源标记。 */
function projectListRow(skill) {
	return `  ${skill.name} · ${skill.description} · ${sourceLabel(skill.source)}`;
}
/** 来源标记：已知 SkillSource 映射短标签，未知值回退原值。 */
function sourceLabel(source) {
	return SOURCE_LABELS[source] ?? source;
}
/** 选中详情行：└ provider · 调用形态 · whenToUse（whenToUse 缺省省略）。 */
function projectDetailRow(skill) {
	const whenToUse = skill.whenToUse === void 0 ? "" : ` · ${skill.whenToUse}`;
	return `  └ ${skill.provider} · ${invocationText(skill.invocation)}${whenToUse}`;
}
/** 调用形态文本：由 modelInvocable/userInvocable 组合推导；双不可调也渲染不吞。 */
function invocationText(invocation) {
	const { modelInvocable, userInvocable } = invocation;
	if (modelInvocable && userInvocable) return "模型+用户可调";
	if (modelInvocable) return "仅模型可调";
	if (userInvocable) return "仅用户可调";
	return "不可调";
}
/** 按显示宽度截断字符串（仅发生截断时尾部补 …；极端窄宽退化为 …）。 */
function truncateByWidth(text, max) {
	if (max <= 1) return "…";
	let out = "";
	let w = 0;
	for (const ch of text) {
		const cw = displayWidth(ch);
		if (w + cw > max - 1) break;
		out += ch;
		w += cw;
	}
	return w < displayWidth(text) ? `${out}…` : out;
}
//#endregion
//#region lib/types/render/live-panels.js
/**
* live-panels — renderLive 的 7 面板段纯函数（Wave 2 提取）。
*
* renderLive 每帧把 TuiApp 读取的字段子集组装为 LiveSnapshot（render/
* live-snapshot.ts），交给本模块的 7 个纯函数（(snapshot) => string[]）
* 渲染面板行；组合器负责 { text } 包装与 theme 着色、非面板段（提问/审批/
* 流利度/流式尾巴/工具卡/输入行）直渲染。面板是纯函数：同一 snapshot 恒返回
* 同一行序列，无 I/O、无时钟、无副作用——taskNotice 的「渲染后清空」副作用
* 由组合器承担。
*
* 每个面板复用既有 project* 纯函数（format/task-panel、status-panel、
* delegation-panel、workflow-panel、config-panel、skill-panel、
* format/glance-bar），本模块只做「snapshot → 既有面板函数输入」的适配与
* 顺序编排，不重复实现渲染逻辑。依赖方向保持 app.ts → render/ 单向。
*
* @module @deepseek-ai/dsh-tianshu-tui/render/live-panels
*/
/** 后台任务区状态标记（与 renderLive 现状一致：running ⏳ / completed ✓ / 其余 ✗）。 */
function taskSnapshotMark(status) {
	if (status === "running") return "⏳";
	if (status === "completed") return "✓";
	return "✗";
}
/**
* 渲染 glance 段：状态行 + 错误行。
* 状态/错误行为纯文本（组合器按需着色）。metrics 行自 C4 概念稿 C 起移出
* glance 面板——由 renderLive 在输入行下方常驻渲染（三行底部区），避免
* 顶部/底部双份。
* @param snapshot - 当前帧快照。
* @returns 面板行数组（状态行恒存在；错误行按数据追加）。
*/
function renderGlancePanel(snapshot) {
	const rows = [];
	if (snapshot.glanceStatus !== null) rows.push(snapshot.glanceStatus);
	if (snapshot.glanceError !== null) rows.push(snapshot.glanceError);
	return rows;
}
/**
* 渲染会话 tab 栏（P3 side conversation）：状态栏上方单行，全部 live 会话
* 的缩略 tab。活跃会话 ▸ 前缀；运行中会话 ⏳ 后缀。单会话不渲染——tab 只在
* 有多个目标可切换时才有信息量，单会话的随机短 id 白占一行（chrome 瘦身）。
* @param snapshot - 当前帧快照。
* @returns tab 栏行（0 或 1 行；纯文本，着色由组合器按整行处理）。
*/
function renderSessionTabs(snapshot) {
	if (snapshot.sessionTabs.length <= 1) return [];
	return [snapshot.sessionTabs.map((tab) => {
		const short = tab.id.startsWith("session-") ? tab.id.slice(8, 20) : tab.id.slice(0, 16);
		const running = tab.status === "running" ? " ⏳" : "";
		return tab.id === snapshot.activeSessionId ? `▸ ${short}${running}` : ` · ${short}${running}`;
	}).join("")];
}
/**
* 渲染任务面板：任务窗格（projectTaskPanel） + 后台任务区（taskSnapshots
* 逐行）。面板隐藏 → 空数组；taskItems 为 null（服务缺失/未写入）→ 窗格不
* 渲染，后台任务区独立渲染（与 renderLive 现状同语义）。
* @param snapshot - 当前帧快照。
* @returns 面板行数组（窗格行在前，后台任务区行在后）。
*/
function renderTasksPanel(snapshot) {
	if (!snapshot.taskPanelVisible) return [];
	const rows = [];
	rows.push(...projectTaskPanel(snapshot.taskItems, snapshot.cols));
	for (const t of snapshot.taskSnapshots) {
		const detail = t.detail === void 0 ? "" : ` · ${t.detail}`;
		rows.push(`${taskSnapshotMark(t.status)} ${t.label}${detail}`);
	}
	return rows;
}
/**
* 渲染 /config 设置面板（设置段 + 权限预设选择器 + 凭据徽章）。面板隐藏或
* 投影为 null（服务缺失）→ 空数组。settings 契约是数组；违约形状（非数组，
* 如单对象）归一为 descriptor 数组再渲染，避免 for...of 对非迭代对象抛错。
* @param snapshot - 当前帧快照。
* @returns 面板行数组。
*/
function renderConfigPanel(snapshot) {
	if (!snapshot.configPanelVisible) return [];
	if (snapshot.configProjection === null) return [];
	const projection = snapshot.configProjection;
	const settings = Array.isArray(projection.settings) ? projection.settings : Object.entries(projection.settings).map(([ns, value]) => ({
		ns,
		value
	}));
	return projectConfigPanel({
		...projection,
		settings,
		permission: projection.permission ?? null
	}, { width: snapshot.cols });
}
/**
* 渲染 /skills 技能面板（标题 + 列表行 + 命中的选中详情行）。面板隐藏 →
* 空数组；空列表渲染标题 + 空态占位（由 projectSkillPanel 承担）。
* @param snapshot - 当前帧快照。
* @returns 面板行数组。
*/
function renderSkillsPanel(snapshot) {
	if (!snapshot.skillsPanelVisible) return [];
	return projectSkillPanel(snapshot.skillItems, { width: snapshot.cols });
}
/**
* 渲染 /subagents 委派树面板（标题 + 每层委派一行）。面板隐藏或 entries 为
* null（服务缺失/未预取）→ 空数组（降级不渲染）。
* @param snapshot - 当前帧快照。
* @returns 面板行数组。
*/
function renderDelegationPanel(snapshot) {
	if (!snapshot.subagentsPanelVisible) return [];
	if (snapshot.delegationEntries === null) return [];
	return projectDelegationTree(snapshot.delegationEntries, snapshot.subagentIdentities, snapshot.subagentTimings, { width: snapshot.cols });
}
/**
* 渲染 /workflow 运行态面板（列表行 + 终态汇总）。面板隐藏 → 空数组。
* projectWorkflow 只消费 meta.name；本适配层把 run id 注入列表行
* （meta.description 追加 "(id)" 后缀；name 已是 id 时不重复），使 run 标识
* 在面板可见且不破坏 [name] 徽标形态。
* @param snapshot - 当前帧快照。
* @returns 面板行数组。
*/
function renderWorkflowPanel(snapshot) {
	if (!snapshot.workflowPanelVisible) return [];
	return projectWorkflow(snapshot.workflowRuns.map(withVisibleRunId), { width: snapshot.cols });
}
/** 使 run id 在列表行可见：meta.description 追加 "(id)" 后缀（name 已是 id 时不重复）。 */
function withVisibleRunId(run) {
	if (run.info.meta.name === run.info.id) return run;
	const idSuffix = `(${run.info.id})`;
	const description = run.info.meta.description === "" ? idSuffix : `${run.info.meta.description} ${idSuffix}`;
	return {
		...run,
		info: {
			...run.info,
			meta: {
				...run.info.meta,
				description
			}
		}
	};
}
/**
* 渲染 /status 状态面板（目标段 + 任务段 + 计划段）。面板隐藏 → 空数组。
* todos 为 null 时任务段渲染「（无任务）」占位（区别于 goal/plan 为 null 时
* 对应段不渲染的语义——todos null = 已清空/未写入，面板打开即展示任务区）。
* @param snapshot - 当前帧快照。
* @returns 面板行数组。
*/
function renderStatusPanel(snapshot) {
	if (!snapshot.statusPanelVisible) return [];
	return projectStatusPanel(snapshot.goal, snapshot.todos ?? [], snapshot.plan, { width: snapshot.cols });
}
//#endregion
//#region lib/types/statusline.js
/**
* 可脚本化 statusline — 对齐 Claude Code statusLine 协议的字段子集。
*
* config `ui.statusLine.command` 指定用户脚本；每次刷新把会话状态 JSON 写入
* 脚本 stdin，取 stdout 首行渲染在输入框上方的独立行。
*
* 协议 payload（CC 字段子集 + rivet 扩展）：
* ```json
* {
*   "session_id": "…",
*   "model": { "display_name": "deepseek-v4" },
*   "workspace": { "current_dir": "/path/to/project" },
*   "git": { "branch": "main" },
*   "context": { "ratio": 0.42, "estimated_tokens": 54000, "max_tokens": 128000 },
*   "cost": { "total_yuan": 0.1234 },
*   "turn": 7
* }
* ```
*
* 安全/稳态约束：
* - 节流（默认 3s）+ 单飞（前一次未返回则跳过本次）
* - 超时 kill（默认 2s），脚本失败/超时保留上一次输出（不闪断）
* - 输出截断到 300 字符、去掉换行——渲染层再按终端宽度 clamp
*/
/**
* 用户脚本 statusline 执行器：节流 + 单飞 + 超时 kill；输出经 `onUpdate`
* 推送（截断 300 字符、取 stdout 首行）。失败/超时静默保留上一次输出。
*/
var StatusLineRunner = class {
	onUpdate;
	command;
	intervalMs;
	timeoutMs;
	lastRunMs = 0;
	inFlight = false;
	lastOutput = null;
	constructor(config, onUpdate) {
		this.onUpdate = onUpdate;
		this.command = config.command;
		this.intervalMs = config.intervalMs ?? 3e3;
		this.timeoutMs = config.timeoutMs ?? 2e3;
	}
	/** 当前缓存的 statusline 文本（脚本 stdout 首行）。 */
	get current() {
		return this.lastOutput;
	}
	/**
	* 请求刷新。节流 + 单飞；实际执行时把 payload JSON 写入脚本 stdin。
	* 失败/超时静默保留上一次输出。
	* @param payload - 写入脚本 stdin 的会话状态。
	*/
	refresh(payload) {
		const now = Date.now();
		if (this.inFlight || now - this.lastRunMs < this.intervalMs) return;
		this.lastRunMs = now;
		this.inFlight = true;
		let child;
		try {
			child = spawn(this.command, {
				shell: true,
				stdio: [
					"pipe",
					"pipe",
					"ignore"
				],
				windowsHide: true
			});
		} catch {
			this.inFlight = false;
			return;
		}
		let stdout = "";
		let settled = false;
		const settle = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			this.inFlight = false;
			const firstLine = stdout.split("\n")[0]?.trim() ?? "";
			if (firstLine) {
				this.lastOutput = firstLine.slice(0, 300);
				this.onUpdate(this.lastOutput);
			}
		};
		const timer = setTimeout(() => {
			try {
				child.kill("SIGKILL");
			} catch {}
			settle();
		}, this.timeoutMs);
		child.stdout?.on("data", (chunk) => {
			stdout += chunk.toString("utf8");
		});
		child.on("error", () => {
			settle();
		});
		child.on("close", () => {
			settle();
		});
		try {
			child.stdin?.write(JSON.stringify(payload));
			child.stdin?.end();
		} catch {}
	}
};
/**
* 空工作流视图：尚未收到任何 turn 事件，处于理解阶段。
* @param sessionId - 归属会话 id。
* @returns 初始视图（turn = -1，无活动）。
*/
function emptyWorkflowView(sessionId) {
	return {
		sessionId,
		phase: "understand",
		turn: -1,
		activity: void 0
	};
}
/**
* 工具名 → 工作流阶段。未知名工具返回 undefined（不改变当前阶段）。
* 分类依据：读/搜 → 调研；写/改/执行 → 实施；测试 → 验证。
* @param toolName - 工具名。
* @returns 推断阶段；未知工具返回 undefined。
*/
function inferPhaseFromTool(toolName) {
	switch (toolName) {
		case "read_file":
		case "grep":
		case "glob":
		case "diff":
		case "semantic_search":
		case "web_fetch":
		case "repo_map":
		case "inspect_project": return "research";
		case "edit_file":
		case "write_file":
		case "apply_patch":
		case "bash": return "implement";
		case "run_tests": return "verify";
		default: return;
	}
}
/**
* Fold 一个 session 事件进入工作流视图（纯函数，返回新视图）。
* turn/start 重置为理解；todo/write → 拆解；turn/end(completed) → 收尾；
* tool/call 投影阶段与活动。其余事件（chunk/assistant 等）不改变视图。
* @param view - 当前视图。
* @param event - 会话事件。
* @returns 新视图。
*/
function applyWorkflowEvent(view, event) {
	switch (event.type) {
		case "turn/start": return {
			...view,
			phase: "understand",
			turn: event.data.turn,
			activity: void 0
		};
		case "tool/call": {
			const phase = inferPhaseFromTool(event.data.name);
			return {
				...view,
				phase: phase ?? view.phase,
				activity: {
					name: event.data.name,
					arguments: event.data.arguments,
					turn: event.data.turn,
					step: event.data.step
				}
			};
		}
		case "todo/write": return {
			...view,
			phase: "decompose"
		};
		case "turn/end": return event.data.reason.kind === "completed" ? {
			...view,
			phase: "wrapup",
			activity: void 0
		} : view;
		default: return view;
	}
}
const PHASE_LABELS = {
	understand: "理解",
	research: "调研",
	decompose: "拆解",
	implement: "实施",
	verify: "验证",
	wrapup: "收尾"
};
/**
* 渲染 statusline 文本：`阶段 · 工具名`，无活动时仅阶段。
* plan 投影 active 时带 [plan] 徽标（T1.4）；pending 切换待生效时显示
* [plan…]（A1：轮内 /plan 的意图在下一请求边界才落地，需给用户反馈）。
* 授权模式徽标：permission preset 装配时显示预设名（如 [danger-full-access]，
* 即 yolo 语义的全放行预设）；否则按 approval/policy 折叠值显示 [yolo]
* （'never' = 不询问，sandbox 越界仍拒绝）或 [ask]（显式记录时）。
* @param view - 工作流视图。
* @param planActive - plan 模式已生效（渲染 [plan]）。
* @param planPending - plan 切换待请求边界落地（渲染 [plan…]，优先于 planActive）。
* @param alwaysApprove - always-approve 生效（渲染 [auto]）。
* @param approvalPolicy - approval/policy 折叠值；null = 未记录不显示徽标。
* @param permissionPreset - permission/preset 折叠值；非 null 时压过 approvalPolicy 徽标。
* @returns statusline 文本。
*/
function formatStatusLine(view, planActive = false, planPending = false, alwaysApprove = false, approvalPolicy = null, permissionPreset = null) {
	const phase = PHASE_LABELS[view.phase];
	const badge = planPending ? " [plan…]" : planActive ? " [plan]" : "";
	const auto = alwaysApprove ? " [auto]" : "";
	const preset = permissionPreset !== null ? ` [${permissionPreset}]` : "";
	const suffix = `${badge}${auto}${preset}${preset === "" && approvalPolicy !== null ? approvalPolicy === "never" ? " [yolo]" : " [ask]" : ""}`;
	return view.activity === void 0 ? `${phase}${suffix}` : `${phase}${suffix} · ${view.activity.name}`;
}
/**
* 自包含 statusline：订阅 `agent/status` + 本 session 的 `session/event`，
* 折叠出工作流阶段与实时工具活动，每次变更经 `onUpdate` 推送渲染文本。
* 不依赖 ui/app.ts 喂数据——事件即事实源，纯投影。
*/
var WorkflowStatusLine = class {
	view;
	planState = {
		active: false,
		pending: false
	};
	alwaysApprove = false;
	/** 会话内最后一条 approval/policy 折叠值（null = 未记录，默认 ask 语义不显示徽标）。 */
	approvalPolicy = null;
	/** 会话内最后一条 permission/preset 折叠值（permission 服务装配时；null = 未记录）。 */
	permissionPreset = null;
	lastText = null;
	onUpdate;
	disposers;
	constructor(ctx, sessionId, onUpdate) {
		this.view = emptyWorkflowView(sessionId);
		this.onUpdate = onUpdate;
		const onStatus = (_payload) => {
			if (_payload.agent.id !== sessionId) return;
			this.emit();
		};
		const onSessionEvent = (owner, event) => {
			if (owner.id !== sessionId) return;
			this.view = applyWorkflowEvent(this.view, event);
			if (event.type === "approval/policy") this.approvalPolicy = event.data.policy;
			else if (event.type === "permission/preset") this.permissionPreset = event.data.preset;
			this.emit();
		};
		this.disposers = [ctx.on("agent/status", onStatus), ctx.on("session/event", onSessionEvent)];
	}
	/**
	* T1.4 + A1：设置 plan 徽标态（plan 投影的 active/pending）。数据由装配方
	* （ui/app.ts 的投影总线）提供，本类不订阅 plan 投影。
	* pending=true 表示有切换意图待请求边界落地（轮内 /plan），渲染 [plan…]。
	* 相同状态幂等不推送。
	* @param state - plan 投影的 active/pending 态。
	*/
	setPlanState(state) {
		if (this.planState.active === state.active && this.planState.pending === state.pending) return;
		this.planState = {
			active: state.active,
			pending: state.pending
		};
		this.emit();
	}
	/**
	* C3 项 4：always-approve 徽标态（Shift+Tab 循环第三态）。数据由装配方
	* （ui/app.ts 的 cycleMode）提供，本类不持有策略。相同状态幂等不推送。
	* @param active - always-approve 是否生效。
	*/
	setAlwaysApprove(active) {
		if (this.alwaysApprove === active) return;
		this.alwaysApprove = active;
		this.emit();
	}
	/** 当前缓存的 statusline 文本；无事件时 null。 */
	get current() {
		return this.lastText;
	}
	emit() {
		const text = formatStatusLine(this.view, this.planState.active, this.planState.pending, this.alwaysApprove, this.approvalPolicy, this.permissionPreset);
		this.lastText = text;
		this.onUpdate(text);
	}
	/** 解绑两个订阅；幂等。 */
	dispose() {
		for (const dispose of this.disposers) dispose();
	}
};
//#endregion
//#region lib/types/format/doctor-report.js
/**
* 收集终端诊断报告。
* @param cols 终端列数
* @param rows 终端行数
* @param background 终端背景色
* @param env 环境变量（默认 process.env）
* @returns 检查结果列表（可修复项带 fixId）。
*/
function collectDoctorReport(cols, rows, background, env = process.env) {
	const checks = [{
		name: "终端尺寸",
		status: "ok",
		value: `${cols}×${rows}`
	}, {
		name: "终端背景",
		status: "ok",
		value: background
	}];
	const hyperlink = detectHyperlinkSupport(env);
	checks.push({
		name: "超链接",
		status: hyperlink ? "ok" : "warn",
		value: hyperlink ? "✓" : "不支持"
	});
	const imageProtocol = detectImageProtocol(env);
	checks.push({
		name: "图片协议",
		status: imageProtocol !== "none" ? "ok" : "info",
		value: imageProtocol
	});
	const legacy = isLegacyWindowsConsole(env);
	checks.push({
		name: "终端兼容",
		status: legacy ? "warn" : "ok",
		value: legacy ? "遗留模式（功能受限）" : "现代终端"
	});
	const tcLevel = globalThis.chalkLevel ?? 3;
	checks.push({
		name: "True Color",
		status: tcLevel >= 3 ? "ok" : "warn",
		value: tcLevel >= 3 ? "✓ 16M 色" : `仅 ${tcLevel === 2 ? "256 色" : "16 色"}`
	});
	const inTmux = Boolean(env.TMUX);
	checks.push({
		name: "剪贴板",
		status: inTmux ? "warn" : "ok",
		value: inTmux ? "tmux 内（需 set-clipboard on）" : "直接终端",
		...inTmux ? { fixId: 1 } : {}
	});
	if ((env.TERM ?? "").toLowerCase().includes("kitty") && imageProtocol === "none") checks.push({
		name: "kitty 图片",
		status: "warn",
		value: "dcs-passthrough 未开启",
		fixId: 2
	});
	return checks;
}
/** 可修复项清单（与 DoctorCheck.fixId 对应）。 */
const DOCTOR_FIXES = [{
	id: 1,
	title: "tmux 剪贴板配置",
	guidance: "echo 'set-option -s set-clipboard on' >> ~/.tmux.conf  # 允许 tmux 使用系统剪贴板"
}, {
	id: 2,
	title: "kitty dcs-passthrough",
	guidance: "echo 'term_features all' >> ~/.config/kitty/kitty.conf  # 启用 DCS 透传（图片协议需要）"
}];
/**
* 获取修复指引文本。
* @param fixId - 修复项 id（DoctorCheck.fixId）。
* @returns 标题 + 指引文本；未知 id 返回 null。
*/
function getDoctorFixGuidance(fixId) {
	const fix = DOCTOR_FIXES.find((f) => f.id === fixId);
	if (fix === void 0) return null;
	return `[${fix.id}] ${fix.title}\n\n${fix.guidance}`;
}
//#endregion
//#region lib/types/commands/registry.js
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
/** /model 的 effort 白名单（llm 三档：off / high / max）。 */
const EFFORT_LEVELS = [
	"off",
	"high",
	"max"
];
/**
* 内置命令名（解析 + 提示的单一事实来源；描述/argsHint 见 createBuiltinCommands）。
* 含 /steer：TuiApp 复用既有 handleSteer 入口，此处只参与前缀匹配。
* /status 同款：注册表只声明名字参与前缀解析/提示，实际显隐切换 handler 由
* TuiApp 经 register 接线（见 ui/app.ts）。
* /subagents、/workflow、/tasks 的命令定义在 createBuiltinCommands（deps 注入
* TuiApp 的显隐切换）；/status 保持 TuiApp 内注册。
*/
const BUILTIN_COMMAND_NAMES = [
	"theme",
	"session",
	"fork",
	"branch",
	"clear",
	"compact",
	"steer",
	"model",
	"effort",
	"tasks",
	"density",
	"goal",
	"status",
	"subagents",
	"workflow",
	"config",
	"skills",
	"rewind",
	"btw",
	"doctor",
	"mcp",
	"remember",
	"memory",
	"export"
];
/**
* /model 一键切换别名（TUI 便捷层）：展开为已注册的 deepseek-official
* 路由 + 官方 wire 模型 id。官方 API 没有 spark 模型名，也没有
* deepseek-spark provider；别名只是 flash/pro 的快捷写法。
*/
const SPARK_ALIASES = {
	"spark-flash": {
		provider: "deepseek-official",
		model: "deepseek-v4-flash"
	},
	"spark-pro": {
		provider: "deepseek-official",
		model: "deepseek-v4-pro"
	}
};
/**
* 最小唯一前缀解析：`/` 前缀 + 命令名 `startsWith` 匹配。
* 歧义（多命令同前缀）或未知名返回 null——不猜命令。
* @param input - 输入行原始文本。
* @param commands - 命令名集合（字符串或带 name 的对象，registry 实例与静态名表共用）。
* @returns 命中的命令与剥离后的参数文本；无匹配返回 null。
*/
function resolveSlashCommand(input, commands) {
	if (!input.startsWith("/")) return null;
	const spaceIdx = input.indexOf(" ");
	const token = spaceIdx === -1 ? input.slice(1) : input.slice(1, spaceIdx);
	const rest = spaceIdx === -1 ? "" : input.slice(spaceIdx + 1).trim();
	if (token === "") return null;
	const nameOf = (c) => typeof c === "string" ? c : c.name;
	const matches = commands.filter((c) => nameOf(c).startsWith(token));
	if (matches.length !== 1) return null;
	const match = matches[0];
	/* v8 ignore next -- length===1 保证 [0] 必有值；noUncheckedIndexedAccess 收窄防御 */
	if (match === void 0) return null;
	return {
		command: { name: nameOf(match) },
		text: rest
	};
}
/**
* 命令注册表——register/unregister/list/get/resolve/hint。
* 同名 register 覆盖旧命令；空名或含空格的命令名 register 抛错。
* 实例经 `ctx.provide('tui.commands', registry)` 暴露为 Cordis 服务。
*/
var SlashCommandRegistry = class {
	commands = /* @__PURE__ */ new Map();
	/**
	* 注册（或覆盖同名）命令。
	* @param command - 命令定义；空名或含空格的名字抛错。
	*/
	register(command) {
		if (command.name === "" || command.name.includes(" ")) throw new Error(`invalid slash command name: ${JSON.stringify(command.name)}`);
		this.commands.set(command.name, command);
	}
	/**
	* 反注册命令；不存在时 no-op。
	* @param name - 命令名（不含 / 前缀）。
	*/
	unregister(name) {
		this.commands.delete(name);
	}
	/**
	* 按注册顺序列出全部命令。
	* @returns 命令数组（注册顺序）。
	*/
	list() {
		return [...this.commands.values()];
	}
	/**
	* 按名取命令；未注册返回 undefined。
	* @param name - 命令名（不含 / 前缀，精确匹配）。
	* @returns 命中的命令；未注册为 undefined。
	*/
	get(name) {
		return this.commands.get(name);
	}
	/**
	* 最小唯一前缀解析（委托 resolveSlashCommand，用实例注册表）。
	* @param input - 输入行原始文本。
	* @returns 命中的命令与参数文本；未知/歧义/非 slash 输入为 null。
	*/
	resolve(input) {
		const parsed = resolveSlashCommand(input, this.list());
		/* v8 ignore next -- resolveSlashCommand 只在命令存在时返回对象，get 必命中；双查防御 */
		if (parsed === null) return null;
		const command = this.commands.get(parsed.command.name);
		/* v8 ignore next -- 同上：parsed 来自本注册表命令名，get 恒非 undefined；双查防御 */
		if (command === void 0) return null;
		return {
			command,
			text: parsed.text
		};
	}
	/**
	* 内联提示：输入以 / 开头且有匹配命令时返回提示行；否则 null。
	* 展示在 live 区输入行上方（最小内联提示，不启用 overlay-engine 全屏面板）。
	* @param input - 输入行原始文本。
	* @returns 一行 `命令: /a /b …` 提示；无匹配为 null。
	*/
	hint(input) {
		if (!input.startsWith("/")) return null;
		const token = input.slice(1);
		if (token === "") return null;
		const matches = this.list().filter((c) => c.name.startsWith(token));
		if (matches.length === 0) return null;
		return `命令: ${matches.map((c) => `/${c.name}${c.argsHint === void 0 ? "" : ` ${c.argsHint}`}`).join("   ")}`;
	}
};
/**
* 装配内置命令（/theme /session /clear /compact）。
* /steer 不在此列——TuiApp 复用既有 handleSteer 入口。
* @param deps - TuiApp 私有能力。
* @returns 内置命令数组（含描述/argsHint，供注册表与提示使用）。
*/
function createBuiltinCommands(deps) {
	return [
		{
			name: "theme",
			description: "切换主题（内置或 custom:<name>）",
			argsHint: "<name>",
			run: ({ text, echo }) => {
				const name = text.trim();
				if (name === "") {
					echo(`用法: /theme <name>。可用: ${THEME_NAMES.join(", ")}`);
					return;
				}
				if (setTheme(name)) echo(`主题已切换: ${name}`);
				else echo(`未知主题: ${name}。可用: ${THEME_NAMES.join(", ")}`);
			}
		},
		{
			name: "session",
			description: "会话管理：new 新建，list 列出，switch 切换",
			argsHint: "new|list|switch <id>",
			run: async ({ text, echo, ctx }) => {
				/* v8 ignore next -- split(/\s+/) 恒返回非空数组，[0] 必有值；noUncheckedIndexedAccess 收窄防御 */
				const sub = text.split(/\s+/)[0] ?? "";
				if (sub === "new") {
					echo(`已新建会话: ${await deps.newSession()}`);
					return;
				}
				if (sub === "list") {
					const rows = await listSessions(ctx);
					if (rows.length === 0) {
						echo("（当前无会话）");
						return;
					}
					for (const row of rows) echo(`${row.id} · ${new Date(row.createdAt).toISOString()}`);
					return;
				}
				if (sub === "switch") {
					const id = text.slice(sub.length).trim();
					if (id === "") {
						echo("用法: /session switch <id>（/session list 查看 id）");
						return;
					}
					await deps.switchSession(id);
					echo(`已切换会话: ${id}`);
					return;
				}
				echo("用法: /session new|list|switch <id>");
			}
		},
		{
			name: "fork",
			description: "分叉当前会话（复制历史到新会话并切换）",
			argsHint: "[directive]",
			run: async ({ text, echo }) => {
				const directive = text.trim();
				echo(`已分叉会话: ${directive === "" ? await deps.forkSession() : await deps.forkSession({ directive })}`);
			}
		},
		{
			name: "rewind",
			description: "回退到指定消息（C3 项 3：会话截断 + 可选文件回退）",
			argsHint: "",
			run: ({ echo }) => {
				if (!deps.rewindSession()) echo("⚠ 当前无可回退的会话");
			}
		},
		{
			name: "branch",
			description: "分叉当前会话（/fork 别名）",
			run: async ({ echo }) => {
				echo(`已分叉会话: ${await deps.forkSession()}`);
			}
		},
		{
			name: "model",
			description: "查看或切换模型（默认 + 当前会话热切；spark-flash / spark-pro 映射到官方 flash / pro）",
			argsHint: "[provider/model | spark-flash | spark-pro]",
			run: async ({ text, echo, ctx }) => {
				const facet = ctx.agentDefaultModel;
				if (facet === void 0) {
					echo("⚠ agent-default-model 服务不可用");
					return;
				}
				const current = facet.currentSelection();
				const raw = text.trim();
				if (raw === "") {
					const effortPart = current.reasoningEffort === void 0 ? "" : ` (effort: ${current.reasoningEffort})`;
					echo(`当前模型: ${current.provider}/${current.model}${effortPart}`);
					return;
				}
				const [target = "", effortRaw] = raw.split(/\s+/);
				if (effortRaw !== void 0 && !EFFORT_LEVELS.includes(effortRaw)) {
					echo(`⚠ 不支持的 effort: ${effortRaw}（可用: off / high / max）`);
					return;
				}
				const aliased = SPARK_ALIASES[target];
				const parts = (aliased === void 0 ? target : `${aliased.provider}/${aliased.model}`).split("/");
				/* v8 ignore next 2 -- split 恒返回非空数组且元素恒为 string；noUncheckedIndexedAccess 收窄防御 */
				const next = parts.length === 2 ? {
					provider: parts[0] ?? "",
					model: parts[1] ?? ""
				} : {
					provider: current.provider,
					model: parts[0] ?? ""
				};
				const selection = effortRaw === void 0 ? next : {
					...next,
					reasoningEffort: effortRaw
				};
				await facet.saveSelection(selection);
				const hot = deps.switchLiveModel(selection);
				const effortPart = effortRaw === void 0 ? "" : ` (effort: ${effortRaw})`;
				echo(hot ? `模型已切换: ${selection.provider}/${selection.model}${effortPart}（当前会话与默认均生效）` : `模型已切换: ${selection.provider}/${selection.model}${effortPart}（默认生效；当前会话不可热切）`);
			}
		},
		{
			name: "effort",
			description: "设置推理等级（off / high / max 固定；auto 回模型默认）",
			argsHint: "[off|high|max|auto]",
			run: async ({ text, echo, ctx }) => {
				const facet = ctx.agentDefaultModel;
				if (facet === void 0) {
					echo("⚠ agent-default-model 服务不可用");
					return;
				}
				const current = facet.currentSelection();
				const input = text.trim();
				if (input === "") {
					echo(current.reasoningEffort === void 0 ? "当前推理等级: auto（跟随模型默认）" : `当前推理等级: ${current.reasoningEffort}（/effort auto 可回默认）`);
					return;
				}
				if (input === "auto") {
					const selection = {
						provider: current.provider,
						model: current.model
					};
					await facet.saveSelection(selection);
					echo(deps.switchLiveModel(selection) ? "推理等级已设为 auto（跟随模型默认；当前会话与默认均生效）" : "推理等级已设为 auto（跟随模型默认；默认生效；当前会话不可热切）");
					return;
				}
				if (!EFFORT_LEVELS.includes(input)) {
					echo(`⚠ 不支持的推理等级: ${input}（可用: off / high / max / auto）`);
					return;
				}
				const selection = {
					provider: current.provider,
					model: current.model,
					reasoningEffort: input
				};
				await facet.saveSelection(selection);
				echo(deps.switchLiveModel(selection) ? `推理等级已设为 ${input}（固定；当前会话与默认均生效；/effort auto 回默认）` : `推理等级已设为 ${input}（固定；默认生效；当前会话不可热切；/effort auto 回默认）`);
			}
		},
		{
			name: "clear",
			description: "清空当前会话滚动区",
			run: ({ echo }) => {
				deps.clearScrollback();
				echo("已清空当前会话滚动区");
			}
		},
		{
			name: "compact",
			description: "压缩当前会话（需 compact 服务）",
			run: async ({ text: _text, echo, ctx, sessionId }) => {
				const compact = ctx.reflect.get("compact", false);
				if (compact === void 0) {
					echo("⚠ compact 服务不可用（未加载 compact 插件）");
					return;
				}
				if (sessionId === null) {
					echo("⚠ 当前无会话");
					return;
				}
				const session = ctx.sessions.get(sessionId);
				if (session === void 0) {
					echo("⚠ 会话不存在");
					return;
				}
				const agent = ctx.agents.get(sessionId);
				echo(await compact.compactIfNeeded({
					session,
					options: agent?.options ?? {}
				}, "pressure", new AbortController().signal) === null ? "无需压缩（或无可压缩范围）" : "压缩完成");
			}
		},
		{
			name: "goal",
			description: "目标管理：查看/创建/暂停/恢复/完成/阻塞（需 goal 服务）",
			argsHint: "[create <objective>|pause|resume|complete|block]",
			run: ({ text, echo, ctx, sessionId }) => {
				const goals = ctx.reflect.get("goals", false);
				if (goals === void 0) {
					echo("⚠ goal 服务不可用（未加载 goal 插件）");
					return;
				}
				if (sessionId === null) {
					echo("⚠ 当前无会话");
					return;
				}
				const agent = ctx.agents.get(sessionId);
				if (agent === void 0) {
					echo("⚠ 会话不存在");
					return;
				}
				/* v8 ignore next -- split(/\s+/) 恒返回非空数组，[0] 必有值；noUncheckedIndexedAccess 收窄防御 */
				const verb = text.split(/\s+/)[0] ?? "";
				const rest = verb === "" ? "" : text.slice(verb.length).trim();
				if (verb === "") {
					const view = goals.get(agent);
					if (view === void 0) {
						echo("（当前无目标）");
						return;
					}
					echo(formatGoalView(view));
					return;
				}
				if (verb === "create") {
					if (rest === "") {
						echo("用法: /goal create <objective>");
						return;
					}
					const view = goals.create(agent, { objective: rest });
					echo(`目标已创建: ${view.objective}（phase: ${view.phase}）`);
					return;
				}
				if (![
					"pause",
					"resume",
					"complete",
					"block"
				].includes(verb)) {
					echo("用法: /goal [create <objective>|pause|resume|complete|block]");
					return;
				}
				const current = goals.get(agent);
				if (current === void 0) {
					echo("（当前无目标，无法执行该操作）");
					return;
				}
				const ref = {
					id: current.id,
					revision: current.revision
				};
				if (verb === "pause") {
					echo(`目标已暂停: ${goals.pause(agent, ref).objective}`);
					return;
				}
				if (verb === "resume") {
					const view = goals.resume(agent, ref);
					echo(`目标已恢复: ${view.objective}（phase: ${view.phase}）`);
					return;
				}
				if (verb === "complete") {
					echo(`目标已完成: ${goals.complete(agent, ref).objective}`);
					return;
				}
				/* v8 ignore next -- MUTATIONS 过滤 + 前三 if 提前 return，此处 verb 恒为 'block'，false 侧不可达 */
				if (verb === "block") {
					echo(`目标已阻塞: ${goals.block(agent, ref, {
						code: "user-requested",
						message: rest === "" ? "blocked by user via /goal" : rest
					}).objective}`);
					return;
				}
			}
		},
		{
			name: "tasks",
			description: "任务窗格：无参切换；kill <id> 终止后台任务",
			argsHint: "[kill <id>]",
			run: ({ text, echo, ctx }) => {
				/* v8 ignore next -- split(/\s+/) 恒返回非空数组，[0] 必有值；noUncheckedIndexedAccess 收窄防御 */
				const sub = text.split(/\s+/)[0] ?? "";
				if (sub === "kill") {
					const id = text.slice(sub.length).trim();
					if (id === "") {
						echo("用法: /tasks kill <id>");
						return;
					}
					const tasks = ctx.reflect.get("tasks", false);
					if (tasks === void 0) {
						echo("⚠ tasks 服务不可用（未加载 tasks 插件）");
						return;
					}
					echo(tasks.kill(id) === "already-finished" ? `任务已结束: ${id}` : `已请求终止任务: ${id}`);
					return;
				}
				if (sub !== "") {
					echo("用法: /tasks [kill <id>]");
					return;
				}
				deps.toggleTaskPanel();
			}
		},
		{
			name: "subagents",
			description: "切换委派树面板（subagent 层级投影）",
			run: () => {
				deps.toggleSubagentsPanel();
			}
		},
		{
			name: "workflow",
			description: "切换 workflow 运行中面板",
			run: () => {
				deps.toggleWorkflowPanel();
			}
		},
		{
			name: "btw",
			description: "侧问：向后台 agent 提问（不中断当前对话）",
			argsHint: "<question>",
			run: async ({ text, echo }) => {
				const question = text.trim();
				if (question === "") {
					echo("用法: /btw <question>");
					return;
				}
				if (!await deps.askBtw(question)) echo("⚠ 当前无会话或已有挂起的侧问");
			}
		},
		{
			name: "remember",
			description: "保存一条项目记忆（写入 .dsh/memory/global.md）",
			argsHint: "<text>",
			run: async ({ text, echo, ctx }) => {
				const memory = ctx.reflect.get("memory", false);
				if (memory === void 0) {
					echo("⚠ memory 服务不可用（未加载 memory 插件）");
					return;
				}
				const content = text.trim();
				if (content === "") {
					echo("用法: /remember <text>");
					return;
				}
				echo(`已保存记忆: ${(await memory.save({
					text: content,
					scope: "global",
					tags: [],
					source: "user"
				})).id}`);
			}
		},
		{
			name: "memory",
			description: "打开记忆浏览器；delete <id> 直接删除",
			argsHint: "[delete <id>]",
			run: async ({ text, echo, ctx }) => {
				const memory = ctx.reflect.get("memory", false);
				if (memory === void 0) {
					echo("⚠ memory 服务不可用（未加载 memory 插件）");
					return;
				}
				/* v8 ignore next -- split(/\s+/) 恒返回非空数组，[0] 必有值；noUncheckedIndexedAccess 收窄防御 */
				const sub = text.split(/\s+/)[0] ?? "";
				if (sub === "delete") {
					const id = text.slice(sub.length).trim();
					if (id === "") {
						echo("用法: /memory delete <id>");
						return;
					}
					await memory.delete(id);
					echo(`已删除记忆: ${id}`);
					return;
				}
				if (sub !== "") {
					echo("用法: /memory [delete <id>]");
					return;
				}
				if (!await deps.openMemoryBrowser()) echo("⚠ 无法打开记忆浏览器");
			}
		},
		{
			name: "doctor",
			description: "终端诊断：检测终端能力并输出报告；fix <id> 查看修复指引",
			argsHint: "[fix <id>]",
			run: ({ text, echo }) => {
				const sub = text.trim();
				if (sub.startsWith("fix")) {
					const idStr = sub.slice(3).trim();
					const id = Number(idStr);
					if (Number.isNaN(id) || idStr === "") {
						echo("用法: /doctor fix <id>");
						return;
					}
					const guidance = getDoctorFixGuidance(id);
					if (guidance === null) {
						echo(`未知修复项: ${id}`);
						return;
					}
					echo(guidance);
					return;
				}
				if (sub !== "") {
					echo("用法: /doctor [fix <id>]");
					return;
				}
				const cols = process.stdout.columns;
				const rows = process.stdout.rows;
				const checks = collectDoctorReport(cols, rows, process.env.COLORFGBG !== void 0 ? "已检测" : "未检测");
				echo("终端诊断报告:");
				for (const c of checks) {
					const icon = c.status === "ok" ? "✓" : c.status === "warn" ? "⚠" : "ℹ";
					const fixTag = c.fixId !== void 0 ? ` [修复 ${c.fixId}]` : "";
					echo(`  ${icon} ${c.name}: ${c.value}${fixTag}`);
				}
				const fixable = checks.filter((c) => c.fixId !== void 0);
				if (fixable.length > 0) {
					echo("");
					echo("可修复项:");
					for (const c of fixable) {
						const id = c.fixId;
						if (id === void 0) continue;
						const fix = getDoctorFixGuidance(id);
						if (fix !== null) echo(`  [${id}] ${fix.split("\n")[0]}`);
					}
					echo("运行 /doctor fix <id> 查看详细修复指引");
				}
			}
		},
		{
			name: "mcp",
			description: "MCP 状态：列出已连接 server 与工具数；tools <name> 查看工具清单",
			argsHint: "[tools <server>]",
			run: ({ text, echo, ctx }) => {
				const table = ctx.reflect.get("mcp.status", false);
				if (table === void 0 || table.size === 0) {
					echo("⚠ 无 MCP server 连接（检查 cordis.yml 中 mcp-client 插件配置）");
					return;
				}
				const sub = text.trim();
				if (sub.startsWith("tools")) {
					const target = sub.slice(5).trim();
					if (target === "") {
						echo("用法: /mcp tools <server>");
						return;
					}
					const status = table.get(target);
					if (status === void 0) {
						echo(`未知 MCP server: ${target}。可用: ${[...table.keys()].join(", ")}`);
						return;
					}
					const names = status.listToolNames().sort();
					echo(`${target} (${names.length} 工具):`);
					for (const name of names) echo(`  ${name}`);
					return;
				}
				if (sub !== "") {
					echo("用法: /mcp [tools <server>]");
					return;
				}
				const servers = [...table.values()].sort((a, b) => a.serverName.localeCompare(b.serverName));
				echo(`MCP servers (${servers.length}):`);
				for (const s of servers) echo(`  ${s.serverName}: ${s.getToolCount()} 工具`);
			}
		},
		{
			name: "export",
			description: "导出当前会话转录为 Markdown 文件（T3）",
			argsHint: "[path]",
			run: async ({ text, echo }) => {
				const path = text.trim() === "" ? void 0 : text.trim();
				echo(`会话已导出: ${await deps.exportTranscript(path)}`);
			}
		}
	];
}
/** 渲染一行当前目标（/goal 无参视图）。 */
function formatGoalView(view) {
	return `目标: ${view.objective}（phase: ${view.phase}，rounds: ${view.roundsStarted}/${view.maxGoalRounds}）`;
}
//#endregion
//#region lib/types/ui/render.js
/**
* 转录渲染 — 把 adapter/transcript 的 TranscriptView 投影渲染为终端行。
*
* 纯函数层：输入 TranscriptView + RivetTheme + 终端宽度（+ 可选 presenter
* 意图解析器），输出 ANSI 行数组。零 IO、零全局状态，便于单测；TuiApp
* 装配层只负责把这些行送进 CommitEngine / LiveEngine。
*
* 消息 → 行映射：
* - user → formatUserMessage（▌ 导轨）
* - assistant → 思考块（reasoning 折叠，暗色）+ formatMarkdown 正文
* - tool/call+result 配对 → formatToolViewCard（presenter 意图优先，
*   diff/terminal 结构化卡；无意图回落 formatToolCard 文本折叠）
*
* 顺序契约：renderTranscript 按事件 seq 交错消息与工具卡（卡插在其
* `tool/call` 事件的位置）——与 live 路径的逐事件提交产出同一顺序，
* resume 回放与实时会话渲染一致。
*/
/**
* 从配对的 `tool/result` 事件提取模型面显示文本与错误标记。
* live 结算提交（app.ts）与 resume 回放（renderToolRows）共用同一提取。
* @param result - 配对的 tool/result 事件。
* @returns tool-result 块内 text 块折叠文本 + 错误标记（事件 error 或块级 isError）。
*/
function toolResultText(result) {
	let content = "";
	const first = result.data.message.content[0];
	if (first !== void 0 && first.type === "tool-result" && first.content !== void 0) content = first.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
	const isError = result.data.error !== void 0 || first?.isError === true;
	return {
		content,
		isError
	};
}
/**
* 渲染一条完成的 user/assistant 消息为终端行。
* assistant 消息先渲染思考块（reasoning 折叠，暗色斜体），再渲染 markdown
* 正文——与 live 路径「思考落底在正文前」的提交顺序一致。
* @param message - TranscriptView.messages 中的一条。
* @param theme - 当前主题。
* @param columns - 终端列数（markdown 换行度量）。
* @param options - 紧凑模式等渲染选项。
* @returns ANSI 行数组。
*/
function renderMessageRows(message, theme, columns, options = {}) {
	if (message.kind === "user") return formatUserMessage({
		content: message.text,
		width: columns,
		timestamp: message.time
	}, theme).map((ansi) => ({
		ansi,
		kind: "user"
	}));
	const rows = [];
	if (message.reasoning !== "") rows.push(...formatReasoningBlock({
		text: message.reasoning,
		...options.compact === void 0 ? {} : { compact: options.compact }
	}, theme).map((ansi) => ({
		ansi,
		kind: "assistant"
	})));
	rows.push(...formatMarkdown({
		text: message.text,
		columns
	}, theme).map((ansi) => ({
		ansi,
		kind: "assistant"
	})));
	return rows;
}
/**
* 渲染一条工具调用（call → result 配对）为卡片行。
* 已结算：presenter 意图分派 diff/terminal 结构化卡（意图缺省回落文本
* 折叠）；进行中（无 result）：保留 formatToolCard 流式态。
* @param tool - TranscriptView.tools 中的一条。
* @param theme - 当前主题。
* @param options - presenter 意图、展开与紧凑选项。
* @returns ANSI 行数组。
*/
function renderToolRows(tool, theme, options = {}) {
	const result = tool.result;
	if (result === void 0) {
		const args = parseToolArguments(tool.arguments);
		return formatToolCard({
			toolName: tool.name,
			content: "",
			...args === void 0 ? {} : { toolInput: args },
			streaming: true,
			...options.expanded === void 0 ? {} : { expanded: options.expanded }
		}, theme).map((ansi) => ({
			ansi,
			kind: "tool"
		}));
	}
	const { content, isError } = toolResultText(result);
	const views = options.resolveViews?.(tool) ?? {};
	return formatToolViewCard({
		toolName: tool.name,
		argumentsRaw: tool.arguments,
		content,
		isError,
		...views.call === void 0 ? {} : { callView: views.call },
		...views.result === void 0 ? {} : { resultView: views.result },
		elapsedMs: Math.max(0, result.time - tool.time),
		...options.expanded === void 0 ? {} : { expanded: options.expanded },
		...options.compact === void 0 ? {} : { compact: options.compact }
	}, theme).map((ansi) => ({
		ansi,
		kind: "tool"
	}));
}
/**
* 渲染整个 transcript 到 scrollback 的完整行序列。
* 消息与工具卡按事件 seq 交错（两个来源各自按 seq 有序，双指针归并）：
* assistant 正文（seq 于 assistant/message）先于其 step 的工具卡
* （seq 于 tool/call）——与 live 提交顺序（文本 → 卡）一致。
* @param view - 当前 transcript 投影。
* @param theme - 当前主题。
* @param columns - 终端列数。
* @param options - presenter 意图解析器与紧凑/展开选项。
* @returns 有序 RenderedRow 数组。
*/
function renderTranscript(view, theme, columns, options = {}) {
	const rows = [];
	const messages = view.messages;
	const tools = view.tools;
	let mi = 0;
	let ti = 0;
	while (mi < messages.length || ti < tools.length) {
		const message = messages[mi];
		const tool = tools[ti];
		if (tool === void 0 || message !== void 0 && message.seq <= tool.seq) {
			/* v8 ignore next -- 循环条件保证两指针至少一个未尽；tool undefined 时 message 必存在 */
			if (message === void 0) break;
			rows.push(...renderMessageRows(message, theme, columns, options));
			mi++;
		} else {
			rows.push(...renderToolRows(tool, theme, options));
			ti++;
		}
	}
	return rows;
}
//#endregion
//#region lib/types/command-palette.js
/**
* 初始面板状态（关闭、空查询、选中第 0 项）。
* @returns 初始状态。
*/
function emptyPaletteState() {
	return {
		open: false,
		query: "",
		selected: 0
	};
}
/**
* SlashCommand → 面板条目。
* @param commands - 注册表命令列表。
* @returns 面板条目（argsHint 缺省时不带该字段）。
*/
function toPaletteEntries(commands) {
	return commands.map((c) => ({
		name: c.name,
		description: c.description,
		...c.argsHint === void 0 ? {} : { argsHint: c.argsHint }
	}));
}
function isSubsequence(query, name) {
	let i = 0;
	for (const ch of name) {
		if (ch === query[i]) i++;
		if (i === query.length) return true;
	}
	return i === query.length;
}
/**
* 模糊过滤：名称/描述子串 + 名称子序列；前缀优先排序；大小写不敏感。
* @param entries - 全部条目。
* @param query - 查询串（trim 后为空则返回全部）。
* @returns 过滤排序后的条目。
*/
function filterPalette(entries, query) {
	const q = query.trim().toLowerCase();
	if (!q) return [...entries];
	const hit = [];
	const tail = [];
	for (const e of entries) {
		const name = e.name.toLowerCase();
		const desc = e.description.toLowerCase();
		if (name.startsWith(q)) hit.push(e);
		else if (name.includes(q) || desc.includes(q) || isSubsequence(q, name)) tail.push(e);
	}
	return [...hit, ...tail];
}
/**
* 过滤后可见条目（selected 指向过滤列表下标）。
* @param state - 面板状态（取 query）。
* @param entries - 全部条目。
* @returns 过滤后条目。
*/
function paletteVisibleEntries(state, entries) {
	return filterPalette(entries, state.query);
}
/**
* 折叠一个事件进入面板状态（纯函数）：open 重置查询与选中、type 追加字符并
* 归零选中、move 在 [0, count-1] 内夹紧移动。
* @param state - 当前状态。
* @param event - 输入事件。
* @returns 新状态。
*/
function applyPaletteEvent(state, event) {
	switch (event.type) {
		case "open": return {
			...state,
			open: true,
			query: "",
			selected: 0
		};
		case "close": return {
			...state,
			open: false
		};
		case "type": return {
			...state,
			query: state.query + event.char,
			selected: 0
		};
		case "backspace": return {
			...state,
			query: state.query.slice(0, -1)
		};
		case "move": {
			const maxIndex = Math.max(0, event.count - 1);
			const next = state.selected + event.delta;
			return {
				...state,
				selected: Math.max(0, Math.min(next, maxIndex))
			};
		}
	}
}
/**
* 回填文本：`/name `（含尾随空格，用户续写参数）。
* @param entry - 选中条目。
* @returns 回填到输入框的文本。
*/
function paletteCommitText(entry) {
	return `/${entry.name} `;
}
/**
* overlay 渲染：头 + 条目（选中 ▶ 高亮、宽度截断）+ 底部键位提示；滚动窗口跟随选中。
* @param state - 面板状态。
* @param entries - 全部条目（内部按 query 过滤）。
* @param width - 可用显示宽度（条目按此截断）。
* @param height - 可用行数（头尾各占一行，其余给条目窗口）。
* @param theme - 主题（取语义色）。
* @returns 渲染行数组（含 ANSI）。
*/
function renderCommandPalette(state, entries, width, height, theme) {
	const visible = filterPalette(entries, state.query);
	const lines = [color("命令面板", theme.brandColor, { bold: true })];
	if (visible.length === 0) lines.push(color("无匹配", theme.muted));
	else {
		const bodyHeight = Math.max(1, height - 2);
		const sel = Math.max(0, Math.min(state.selected, visible.length - 1));
		const start = Math.max(0, sel - bodyHeight + 1);
		const window = visible.slice(start, start + bodyHeight);
		for (let i = 0; i < window.length; i++) {
			const e = window[i];
			/* v8 ignore next 1 -- unreachable: window 来自 visible.slice()，元素恒非 undefined */
			if (e === void 0) continue;
			const isSel = start + i === sel;
			const label = `/${e.name}${e.argsHint !== void 0 ? ` ${e.argsHint}` : ""}`;
			const clipped = truncate(isSel ? `▶ ${label}` : `  ${label}`, width);
			lines.push(isSel ? color(clipped, theme.primary, { bold: true }) : color(clipped, theme.dim));
		}
	}
	lines.push(color("Enter 执行 · Esc 关闭", theme.muted));
	return lines;
}
function truncate(text, width) {
	let out = "";
	for (const ch of text) {
		if (displayWidth(out + ch) > width) break;
		out += ch;
	}
	return out;
}
/** Ctrl+P 面板控制器：open/toggle/type/move/commit，实现 OverlayRenderer 契约。 */
var CommandPalette = class {
	state = emptyPaletteState();
	getCommands;
	getTheme;
	constructor(opts) {
		this.getCommands = opts.getCommands;
		this.getTheme = opts.getTheme;
	}
	/**
	* 面板是否打开。
	* @returns 开合状态。
	*/
	isOpen() {
		return this.state.open;
	}
	/** 打开面板（重置查询与选中）。 */
	open() {
		this.state = applyPaletteEvent(this.state, { type: "open" });
	}
	/** 关闭面板（保留查询，下次 open 时重置）。 */
	close() {
		this.state = applyPaletteEvent(this.state, { type: "close" });
	}
	/** 开合切换。 */
	toggle() {
		if (this.state.open) this.close();
		else this.open();
	}
	/**
	* 追加查询字符（选中归零）。
	* @param char - 输入字符。
	*/
	type(char) {
		this.state = applyPaletteEvent(this.state, {
			type: "type",
			char
		});
	}
	/**
	* 移动选中项（在过滤后列表范围内夹紧）。
	* @param delta - 移动量（负上正下）。
	*/
	move(delta) {
		this.state = applyPaletteEvent(this.state, {
			type: "move",
			delta,
			count: this.paletteVisible().length
		});
	}
	/** 当前查询串。 */
	get query() {
		return this.state.query;
	}
	/** 过滤后可见条目（paletteVisible 的别名访问器）。 */
	get entries() {
		return this.paletteVisible();
	}
	/**
	* 过滤后可见条目（命令现取自 getCommands）。
	* @returns 过滤后条目。
	*/
	paletteVisible() {
		return paletteVisibleEntries(this.state, toPaletteEntries(this.getCommands()));
	}
	/**
	* 提交选中项：返回条目 + 回填文本；无选中返回 null。
	* @returns 条目与回填文本；选中越界（如无匹配）返回 null。
	*/
	commit() {
		const entry = this.paletteVisible()[this.state.selected];
		if (entry === void 0) return null;
		return {
			entry,
			text: paletteCommitText(entry)
		};
	}
	/**
	* OverlayRenderer 契约：render(width, height) → string[]。
	* @param width - 可用显示宽度。
	* @param height - 可用行数。
	* @returns 渲染行数组（含 ANSI）。
	*/
	render(width, height) {
		return renderCommandPalette(this.state, toPaletteEntries(this.getCommands()), width, height, this.getTheme());
	}
};
//#endregion
//#region lib/types/engine/overlay-engine.js
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
/**
* 全屏覆盖层引擎：管理 alternate screen buffer 的进出与 overlay 渲染调度
* （固定网格行级 diff + CSI 2026 原子刷新）。退出后主屏 scrollback 完整无损。
*/
var OverlayEngine = class {
	stdout;
	getSize;
	onEnterAltScreen;
	onExitAltScreen;
	active = null;
	renderers = /* @__PURE__ */ new Map();
	inAltScreen = false;
	/** 上一帧屏上每行内容（权威缓存），用于行级 diff。空 = 需全量重绘。 */
	lastFrame = [];
	lastCols = 0;
	lastRows = 0;
	constructor(options) {
		this.stdout = options.stdout;
		this.getSize = options.getSize;
		if (options.onEnterAltScreen !== void 0) this.onEnterAltScreen = options.onEnterAltScreen;
		if (options.onExitAltScreen !== void 0) this.onExitAltScreen = options.onExitAltScreen;
	}
	/**
	* 注册一个 overlay 渲染器。
	* 通常在模块初始化时调用。
	* @param id - overlay 标识（同名注册覆盖旧渲染器）
	* @param renderer - 该 overlay 的渲染器
	*/
	register(id, renderer) {
		this.renderers.set(id, renderer);
	}
	/**
	* 取消注册；若该 overlay 正活跃，先停用（退出 alt screen）。
	* @param id - 要移除的 overlay 标识
	*/
	unregister(id) {
		if (this.active === id) this.deactivate();
		this.renderers.delete(id);
	}
	/**
	* 激活指定 overlay。
	* - 如果已有活跃 overlay，先停用旧的再激活新的（切换不退出 alt screen）。
	* - 自动进入 alternate screen buffer。
	* @param id - 要激活的 overlay 标识
	* @returns 激活成功为 true；id 未注册时为 false（不改变当前状态）
	*/
	activate(id) {
		const renderer = this.renderers.get(id);
		if (!renderer) return false;
		if (this.active !== null) {
			this.renderers.get(this.active)?.onDeactivate?.();
			this.active = null;
			this.resetFrameCache();
		}
		this.active = id;
		this.enterAltScreen();
		this.resetFrameCache();
		renderer.onActivate?.();
		this.render();
		return true;
	}
	/** 停用当前活跃的 overlay，恢复主屏。 */
	deactivate() {
		if (this.active === null) return;
		this.deactivateInternal();
	}
	/** 重新渲染当前 overlay（如 resize 后）。 */
	rerender() {
		if (this.active === null) return;
		this.render();
	}
	/**
	* 当前是否在 overlay 中。
	* @returns 有活跃 overlay 时为 true
	*/
	isActive() {
		return this.active !== null;
	}
	/**
	* 当前活跃的 overlay ID。
	* @returns 活跃 overlay 标识；无活跃 overlay 时为 null
	*/
	activeId() {
		return this.active;
	}
	enterAltScreen() {
		if (this.inAltScreen) return;
		this.stdout.write(ANSI.ALT_SCREEN_ON);
		this.stdout.write(ANSI.HIDE_CURSOR);
		this.inAltScreen = true;
		this.onEnterAltScreen?.();
	}
	exitAltScreen() {
		if (!this.inAltScreen) return;
		this.stdout.write(ANSI.SHOW_CURSOR);
		this.stdout.write(ANSI.ALT_SCREEN_OFF);
		this.inAltScreen = false;
		this.onExitAltScreen?.();
	}
	deactivateInternal() {
		const id = this.active;
		if (id === null) return;
		this.renderers.get(id)?.onDeactivate?.();
		this.active = null;
		this.resetFrameCache();
		this.exitAltScreen();
	}
	resetFrameCache() {
		this.lastFrame = [];
		this.lastCols = 0;
		this.lastRows = 0;
	}
	render() {
		const activeId = this.active;
		if (activeId === null) return;
		const renderer = this.renderers.get(activeId);
		if (!renderer) return;
		const { cols, rows } = this.getSize();
		const lines = renderer.render(cols, rows);
		const desired = new Array(rows);
		for (let i = 0; i < rows; i++) {
			const line = lines[i];
			desired[i] = i < lines.length && line !== void 0 ? line : "";
		}
		const cacheValid = this.lastFrame.length === rows && cols === this.lastCols && rows === this.lastRows;
		let body;
		if (!cacheValid) {
			let out = cursorTo(1, 1);
			for (let i = 0; i < rows; i++) {
				out += ANSI.ERASE_LINE + (desired[i] ?? "");
				if (i < rows - 1) out += "\n";
			}
			body = out;
		} else {
			let out = "";
			for (let i = 0; i < rows; i++) {
				if (desired[i] === this.lastFrame[i]) continue;
				out += cursorTo(i + 1, 1) + ANSI.ERASE_LINE + (desired[i] ?? "");
			}
			body = out;
		}
		this.lastFrame = desired;
		this.lastCols = cols;
		this.lastRows = rows;
		if (body.length === 0) return;
		this.stdout.write(ANSI.BEGIN_SYNC + body + ANSI.END_SYNC);
	}
};
//#endregion
//#region lib/types/engine/overlay-controller.js
/**
* OverlayController — overlay 生命周期 + CPR suppress/resume 协调。
*
* 直通 OverlayEngine 的 register/unregister/activate/deactivate/rerender；
* 在进入/退出 alt screen 时自动调用 LiveEngine 的 suppressProbe()/resumeProbe()，
* 把「overlay 激活期间暂停主屏污染检测」这一协调固化在装配点，调用方不会忘记。
* 不暂停则 CPR 探针会把「光标在 overlay 里」误判为主屏污染，触发 renderLive
* 把主屏帧写进 alt screen（picker 残影泄漏回主会话的根因）。
*
* 无 overlay 注册时零输出，不改变主屏行为——只是把未来 overlay 的生命周期
* 与 CPR 协调收敛到单一装配点。
*
* @module @deepseek-ai/dsh-tianshu-tui/engine/overlay-controller
*/
/**
* overlay 生命周期协调器：直通 OverlayEngine，并在进入/退出 alt screen 时
* 自动暂停/恢复 LiveEngine 的 CPR 污染检测（防主屏帧写进 alt screen）。
*/
var OverlayController = class {
	engine;
	constructor(options) {
		this.engine = new OverlayEngine({
			stdout: options.stdout,
			getSize: options.getSize,
			onEnterAltScreen: () => {
				options.live.suppressProbe();
				options.onOverlayChange?.(true);
			},
			onExitAltScreen: () => {
				options.live.resumeProbe();
				options.onOverlayChange?.(false);
			}
		});
	}
	/**
	* 注册一个 overlay 渲染器（通常模块初始化时调用）。
	* @param id - overlay 标识
	* @param renderer - 该 overlay 的渲染器
	*/
	register(id, renderer) {
		this.engine.register(id, renderer);
	}
	/**
	* 取消注册；若该 overlay 正活跃，先停用。
	* @param id - 要移除的 overlay 标识
	*/
	unregister(id) {
		this.engine.unregister(id);
	}
	/**
	* 激活指定 overlay（自动进入 alt screen 并暂停主屏污染检测）。
	* @param id - 要激活的 overlay 标识
	* @returns 激活成功为 true；id 未注册时为 false
	*/
	activate(id) {
		return this.engine.activate(id);
	}
	/** 停用当前活跃 overlay，恢复主屏并恢复污染检测。 */
	deactivate() {
		this.engine.deactivate();
	}
	/** 重新渲染当前 overlay（如 resize 后）。 */
	rerender() {
		this.engine.rerender();
	}
	/**
	* 当前是否在 overlay 中。
	* @returns 有活跃 overlay 时为 true
	*/
	isActive() {
		return this.engine.isActive();
	}
	/**
	* 当前活跃的 overlay ID。
	* @returns 活跃 overlay 标识；无活跃 overlay 时为 null
	*/
	activeId() {
		return this.engine.activeId();
	}
};
//#endregion
//#region lib/types/engine/metrics-glance-controller.js
/**
* MetricsGlanceController — 底部 glance 数据收集与刷新节流（Phase 5.3 数据基础）。
*
* 把 ui/app.ts 原先内联在 renderLive 里的状态行回退派生与错误行格式化收敛为
* 纯函数（deriveGlanceStatus / deriveGlanceError / deriveGlance），控制器把它们
* 包进「窗口内合并、窗口末重算」的节流。数据全部来自既有 LiveAgentState 与
* statusLine 投影，不发明事件类型。
*
* 节流语义：
* - 首次 refresh 恒同步重算（构造后立即可读，不依赖时钟）。
* - 窗口内（throttleMs，默认 16ms 一帧）重复 refresh 合并到窗口末重算一次；
*   窗口外 refresh 同步重算。重收集成本被节流封顶，状态行/错误行新鲜度 ≤ 一帧。
* - 数据实际变化时经 onChange 推送（未变化不推送，避免重绘风暴）。
*
* @module @deepseek-ai/dsh-tianshu-tui/engine/metrics-glance-controller
*/
/**
* 状态行派生：工作流投影优先，否则 agent 状态回退（复刻 TuiApp 旧装配）。
* 空闲态返回 null（不渲染不占位）：空闲提示已由 footer 承载，状态行只在
* 「有事发生」（运行中/已停止/投影文本）时出现。
* @param statusText - WorkflowStatusLine.current；null = 无投影。
* @param live - live agent 状态；undefined = 未挂载。
* @returns 状态行纯文本；空闲 null。
*/
function deriveGlanceStatus(statusText, live) {
	if (statusText !== null) return statusText;
	if (live === void 0 || live.live) return live?.status === "running" ? "● 运行中" : null;
	return "✗ 已停止";
}
/**
* 错误行派生：glyph（ascii 降级）+ 首行截断至 cols-2（复刻 TuiApp 旧装配）。
* @param live - live agent 状态；无 lastError 或未挂载时返回 null。
* @param columns - 终端列数。
* @returns 错误行纯文本；无错误 null。
*/
function deriveGlanceError(live, columns) {
	if (live?.lastError === void 0) return null;
	const raw = live.lastError.error;
	const message = raw instanceof Error ? raw.message : String(raw);
	return `${useAsciiGlyphs() ? "x" : "✗"} ${truncateToDisplayWidth(message.split("\n")[0] ?? "", columns - 2)}`;
}
/**
* 整帧 glance 派生（状态行 + 错误行一次计算）。
* @param statusText - WorkflowStatusLine.current；null = 无投影
* @param live - live agent 状态；undefined = 未挂载
* @param columns - 终端列数（错误首行截断度量）
* @returns 状态行 + 错误行数据
*/
function deriveGlance(statusText, live, columns) {
	return {
		status: deriveGlanceStatus(statusText, live),
		error: deriveGlanceError(live, columns)
	};
}
/**
* 底部 glance 数据收集 + 刷新节流控制器。
* renderLive 每帧调用 refresh() 后读 current()：窗口内读缓存（零重收集），
* 窗口外同步重算——收集成本与渲染节奏解耦。
*/
var MetricsGlanceController = class {
	cache;
	computed = false;
	lastComputeAt = 0;
	timer = null;
	throttleMs;
	options;
	constructor(options) {
		this.options = options;
		this.throttleMs = options.throttleMs ?? 16;
		this.cache = deriveGlance(null, void 0, 80);
	}
	/**
	* 当前缓存的 glance 数据（renderLive 每帧读取；新鲜度 ≤ 节流窗口）。
	* @returns 最近一次重算的 glance 数据
	*/
	current() {
		return this.cache;
	}
	/**
	* 请求刷新。首次恒同步重算；此后窗口内合并到窗口末、窗口外同步重算。
	* 数据实际变化时经 onChange 推送。
	*/
	refresh() {
		if (this.timer !== null) return;
		if (!this.computed) {
			this.compute();
			return;
		}
		const wait = this.throttleMs - (Date.now() - this.lastComputeAt);
		if (wait <= 0) {
			this.compute();
			return;
		}
		this.timer = setTimeout(() => {
			this.timer = null;
			this.compute();
		}, wait);
		this.timer.unref();
	}
	/** 清空待执行定时器（幂等）。 */
	dispose() {
		if (this.timer !== null) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}
	compute() {
		this.lastComputeAt = Date.now();
		const first = !this.computed;
		const next = deriveGlance(this.options.getStatusText(), this.options.getLiveState(), this.options.getColumns());
		const changed = first || next.status !== this.cache.status || next.error !== this.cache.error;
		this.cache = next;
		this.computed = true;
		if (changed) this.options.onChange?.(next);
	}
};
function asString(value) {
	return typeof value === "string" ? value : null;
}
/**
* 从编辑类工具参数提取 old/new 文本对。
* str_replace_editor 的 str_replace 用 old_str/new_str；edit_file 用
* old_string/new_string（宿主侧工具，兼容提取）。
*/
function extractReplacePair(args) {
	return {
		path: asString(args.path),
		oldText: asString(args.old_str) ?? asString(args.old_string),
		newText: asString(args.new_str) ?? asString(args.new_string)
	};
}
/** write 类预览：path + 前 N 行内容（create/write_file）。 */
function formatWritePreview(path, content, theme) {
	const head = content.split("\n").slice(0, 4);
	const lines = [`${path} 新文件内容预览:`];
	for (const line of head) lines.push(`  ${line}`);
	if (content.split("\n").length > 4) {
		const muted = theme.muted;
		lines.push(muted === void 0 ? "  …" : `  …（共 ${content.split("\n").length} 行）`);
	}
	return lines;
}
/** old/new 替换对 → 路径统计头 + renderFileDiff 行（结算卡同一渲染）。 */
function formatReplaceDiff(path, oldText, newText, theme) {
	const diff = {
		path,
		oldText,
		newText
	};
	const { adds, dels } = fileDiffStats([diff]);
	return [color(`${path} (+${adds} −${dels})`, theme.warning), ...renderFileDiff(diff, { maxLines: 12 }, theme)];
}
/**
* 格式化审批 diff 为 ANSI 行数组；非编辑工具或参数不可解析返回 null。
* - str_replace_editor str_replace / edit_file：old/new → renderFileDiff
*   （±3 context，与结算工具卡共用渲染——所批即所见）
* - str_replace_editor create / write_file：path + 前 4 行预览（无 old）
* - 其他命令/工具：null（无替换语义不渲染）
* @param input - 待审批工具调用的名与原始参数 JSON。
* @param theme - 当前主题（diff 染色透传 renderFileDiff）。
* @returns diff/预览的 ANSI 行数组；不可渲染时 null（调用方不占位）。
*/
function formatPermissionDiff(input, theme) {
	let parsed;
	try {
		parsed = JSON.parse(input.arguments);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null) return null;
	const args = parsed;
	if (input.toolName === "str_replace_editor") {
		if (args.command === "str_replace") {
			const { path, oldText, newText } = extractReplacePair(args);
			if (path === null || oldText === null || newText === null) return null;
			if (oldText === newText) return null;
			return formatReplaceDiff(path, oldText, newText, theme);
		}
		if (args.command === "create") {
			const path = asString(args.path);
			const content = asString(args.file_text);
			if (path === null || content === null) return null;
			return formatWritePreview(path, content, theme);
		}
		return null;
	}
	if (input.toolName === "write_file") {
		const path = asString(args.path);
		const content = asString(args.content) ?? asString(args.file_text);
		if (path === null || content === null) return null;
		return formatWritePreview(path, content, theme);
	}
	if (input.toolName === "edit_file") {
		const { path, oldText, newText } = extractReplacePair(args);
		if (path === null || oldText === null || newText === null) return null;
		if (oldText === newText) return null;
		return formatReplaceDiff(path, oldText, newText, theme);
	}
	return null;
}
//#endregion
//#region lib/types/box-chars.js
/**
* 线框字符集与框体几何 —— 输入框、首屏欢迎框等「圆角盒」的单一事实源。
*
* 拆出来的原因是**等宽契约**：首屏欢迎框必须与输入框逐列咬合（左右边线同列、
* 总宽相同），否则两个框上下叠在一起时会错位。宽度公式若在 app.ts 与
* welcome.ts 各写一份，改其中一处就会静默破坏对齐——放这里共享。
*/
/**
* 输入框线框字符集（按 separator 主题）。纯字面量，提升到模块级避免 renderLive
* 每帧重建对象字面量。getInputChrome 据此缓存着色后的 leftBar/rightBar/botBorder。
*/
const INPUT_BOX_CHARS = {
	thin: {
		tl: "╭",
		tr: "╮",
		bl: "╰",
		br: "╯",
		h: "─",
		v: "│",
		m: "┬"
	},
	thick: {
		tl: "┏",
		tr: "┓",
		bl: "┗",
		br: "┛",
		h: "━",
		v: "┃",
		m: "┳"
	},
	dots: {
		tl: "╭",
		tr: "╮",
		bl: "╰",
		br: "╯",
		h: "┄",
		v: "┊",
		m: "┬"
	},
	/** Kimi Code 风格：圆角 thin 字面 + 顶框内嵌模型名标签。字面量与 thin 一致。 */
	kimi: {
		tl: "╭",
		tr: "╮",
		bl: "╰",
		br: "╯",
		h: "─",
		v: "│",
		m: "┬"
	},
	/**
	* legacy conhost 降级档：GBK 点阵字体把框线字符按 2 列渲染（或缺字形出
	* tofu），边框行实际宽度超过 cols → 折行 → LiveEngine 回顶欠擦 → 输入框
	* 逐帧重影。ASCII 字符宽度确定为 1 列，任何字体/代码页下都不折行。
	*/
	ascii: {
		tl: "+",
		tr: "+",
		bl: "+",
		br: "+",
		h: "-",
		v: "|",
		m: "+"
	}
};
/**
* 按 separator 取线框字符集，未知 separator 回退到 thin。返回值确定非空。
* legacy conhost（useAsciiBorders）下无条件走 ascii 档——该开关进程内恒定
* （term-caps 缓存），getInputChrome 的 memo key 无需包含它。
* @param separator - separator 主题名（thin/thick/dots/kimi）。
* @returns 对应的线框字符集；未知名回退 thin，ASCII 降级档优先。
*/
function boxCharsFor(separator) {
	if (useAsciiBorders()) return INPUT_BOX_CHARS.ascii;
	switch (separator) {
		case "thick": return INPUT_BOX_CHARS.thick;
		case "dots": return INPUT_BOX_CHARS.dots;
		case "kimi": return INPUT_BOX_CHARS.kimi;
		default: return INPUT_BOX_CHARS.thin;
	}
}
/**
* 框内内容区宽度（不含 `│ ` 与 ` │`）。首屏欢迎框与输入框共用，保证等宽。
*
* 硬约束：框体外宽 = inner + 4（`│ ` + inner + ` │`）必须 ≤ columns，否则
* 右边线折到下一行。故 inner 上限 = columns - 4。
*
* - columns >= 26：`columns - 6`（在上限内再留 2 列呼吸）—— 正常终端
* - columns < 26：`columns - 4`（框体顶满，外宽 = columns，贴右边界不超出）
* - 下限 0：columns < 4 时框体无法成立，返回 0 让上层降级（极罕见）
*
* 此前固定下限 20 会让 < 26 列终端的框体外宽(24)超出边界、右边线折行。
* @param columns - 终端列数。
* @returns 内容区宽度（列），下限 0。
*/
function boxInnerWidth(columns) {
	if (columns >= 26) return columns - 6;
	return Math.max(0, columns - 4);
}
/**
* 框体外宽（含左右边线）。顶/底框 = tl + h×(inner+2) + tr，
* 内容行 = `│ ` + inner + ` │`，两者恒等于 inner + 4。
* @param columns - 终端列数。
* @returns 框体外宽（列），恒为 boxInnerWidth(columns) + 4。
*/
function boxOuterWidth(columns) {
	return boxInnerWidth(columns) + 4;
}
//#endregion
//#region lib/types/format/approval-card.js
/**
* 审批卡（format/approval-card.ts）— 纯渲染。
*
* 形态对齐输入轨：上下圆角横线、左右不封。标题嵌在顶轨，diff 体在中间，
* 底行是 y/n/a/esc 键位。小窗口 compact 只保留提示行（diff 仍由
* formatPermissionDiff 产出，调用方决定是否传入）。
*/
/** 审批卡键位行（与 handleKey 的 y/n/a/esc 对齐）。 */
const APPROVAL_KEY_HINTS = "[y] 允许  [n] 拒绝  [a] 本会话放行  [esc] 取消";
/**
* 圆角轨包裹一块 live 内容（审批卡 / 提问卡共用）。
* @param columns - 外宽。
* @param title - 顶轨内嵌标题（纯文本）。
* @param body - 已着色的内容行。
* @param borderColor - 轨线颜色。
* @returns 顶轨 + body + 底轨；columns < 4 时仅 body。
*/
function formatRailsBlock(columns, title, body, borderColor) {
	if (columns < 4) {
		const cap = Math.max(1, columns);
		return body.map((line) => truncateToDisplayWidth(line, cap));
	}
	const chars = boxCharsFor("thin");
	const inner = Math.max(0, columns - 2);
	const maxLabel = Math.max(1, inner - 3);
	const label = title === "" ? "" : ` ${truncateToDisplayWidth(title, maxLabel)} `;
	const fill = Math.max(0, inner - 1 - displayWidth(label));
	const top = color(`${chars.tl}${chars.h}${label}${chars.h.repeat(fill)}${chars.tr}`, borderColor);
	const bottom = color(`${chars.bl}${chars.h.repeat(inner)}${chars.br}`, borderColor);
	return [
		top,
		...body.map((line) => truncateToDisplayWidth(line, columns)),
		bottom
	];
}
/**
* 渲染审批卡：顶轨「审批 · 工具名」+ 提示/diff + 键位 + 底轨。
* @param input - 列数、工具名、可选原因/diff、是否紧凑。
* @param theme - 当前主题（轨线与提示用 warning）。
* @returns ANSI 行数组；columns ≤ 0 返回空数组。
*/
function formatApprovalCard(input, theme) {
	if (input.columns <= 0) return [];
	const why = input.reason === void 0 || input.reason === "" ? "" : `（${input.reason}）`;
	const diff = input.diffLines;
	const hasDiff = diff !== void 0 && diff !== null && diff.length > 0;
	const blind = hasDiff ? "" : "（diff 不可见）";
	const prompt = color(`⚠ 允许执行 ${input.toolName}？${why}${blind}`, theme.warning);
	const hints = color(APPROVAL_KEY_HINTS, theme.muted);
	const body = [prompt];
	if (hasDiff && input.compact !== true) for (const line of diff) body.push(line);
	body.push(hints);
	return formatRailsBlock(input.columns, `审批 · ${input.toolName}`, body, theme.warning);
}
//#endregion
//#region lib/types/format/history-search-overlay.js
/**
* C2 项 2：历史搜索 overlay — 全屏 alt-screen 内 smart-case 搜索对话历史。
*
* 设计决策（C2 文档）：
* - 不引入 Worker（DSH 单会话规模小，主线程同步搜索够）
* - 数据源：transcript.view.messages（adapter 事件投影，消费 text 字段）
* - smart-case：查询含大写 → 精确匹配；否则大小写不敏感
* - 输入实时搜索（type 即重算），n/N 循环跳转，Esc 退出
*/
/** smart-case：查询含大写字母 → 精确匹配；否则不敏感。 */
function hasUpper(query) {
	return /[A-Z]/.test(query);
}
/** 历史搜索 overlay：smart-case 子串搜索对话历史，输入实时重算，n/N 循环跳转（主线程同步搜索，零 I/O）。 */
var HistorySearchOverlay = class {
	query = "";
	matches = [];
	current = 0;
	messages = [];
	theme;
	constructor(theme) {
		this.theme = theme ?? getTheme();
	}
	/**
	* 装配方提供消息快照（transcript.view.messages）；重复设置重算搜索。
	* @param messages - 可搜索的消息快照。
	*/
	setMessages(messages) {
		this.messages = messages;
		this.research();
	}
	/**
	* 输入字符：累积进 query 并实时搜索。
	* @param char - 追加到 query 的可打印字符。
	*/
	type(char) {
		this.query += char;
		this.research();
	}
	/** 退格：删末字符并重算。 */
	backspace() {
		this.query = this.query.slice(0, -1);
		this.research();
	}
	/** 清空查询（overlay 关闭时调用）。 */
	clear() {
		this.query = "";
		this.matches = [];
		this.current = 0;
	}
	/** 下一个匹配（循环）。 */
	goNext() {
		if (this.matches.length === 0) return;
		this.current = (this.current + 1) % this.matches.length;
	}
	/** 上一个匹配（循环）。 */
	goPrev() {
		if (this.matches.length === 0) return;
		this.current = (this.current - 1 + this.matches.length) % this.matches.length;
	}
	/**
	* 当前匹配数。
	* @returns 命中的消息条数。
	*/
	matchCount() {
		return this.matches.length;
	}
	/**
	* 当前匹配的消息索引；无匹配返回 -1。
	* @returns messages 数组下标，或 -1。
	*/
	currentIndex() {
		/* v8 ignore next -- current 经 % matches.length 归一化恒在界内（goNext/goPrev），索引必有值 */
		return this.matches.length === 0 ? -1 : this.matches[this.current] ?? -1;
	}
	research() {
		this.current = 0;
		if (this.query === "") {
			this.matches = [];
			return;
		}
		const sensitive = hasUpper(this.query);
		const q = sensitive ? this.query : this.query.toLowerCase();
		this.matches = [];
		for (let i = 0; i < this.messages.length; i++) {
			const message = this.messages[i];
			/* v8 ignore next -- 数组元素由装配方构造，无 undefined；noUncheckedIndexedAccess 防御 */
			if (message === void 0) continue;
			if ((sensitive ? message.text : message.text.toLowerCase()).includes(q)) this.matches.push(i);
		}
	}
	render(width, height) {
		const theme = this.theme;
		const rows = [];
		const queryText = this.query === "" ? "输入搜索词（n/N 跳转，Esc 退出）" : this.query;
		const counter = this.matches.length > 0 ? `  ${this.current + 1}/${this.matches.length}` : "";
		rows.push(color(`/ ${queryText}${this.query === "" ? "" : "▌"}${counter}`, theme.secondary));
		const bodyHeight = Math.max(1, height - 2);
		const start = this.currentIndex() >= 0 ? this.currentIndex() : 0;
		const contentWidth = Math.max(10, width - 2);
		let used = 0;
		for (let i = start; i < this.messages.length; i++) {
			if (used >= bodyHeight) break;
			const message = this.messages[i];
			/* v8 ignore next -- 数组元素由装配方构造，无 undefined；noUncheckedIndexedAccess 防御 */
			if (message === void 0) continue;
			const isMatch = this.matches.includes(i);
			const line = truncateToDisplayWidth(message.text === "" ? "(空消息)" : message.text, contentWidth);
			rows.push(isMatch ? color(`▸ ${line}`, theme.success) : `  ${line}`);
			used++;
		}
		rows.push(color("n/N 下一个/上一个 · Esc 退出", theme.muted));
		return rows;
	}
	/* v8 ignore next -- 空实现：消息快照由装配方在激活时 setMessages，无自有语句可覆盖 */
	onActivate() {}
	onDeactivate() {
		this.clear();
	}
};
//#endregion
//#region lib/types/format/rewind-overlay.js
/**
* C3 项 3：rewind overlay — 双阶段回退面板（消息列表 → 回退粒度）。
*
* 阶段 1（list）：展示会话消息（turn/text/seq），↑↓/j k 移动，Enter 选中目标。
* 阶段 2（mode）：convo（仅截断会话）/ code（仅文件回退）/ both（两者）。
* 执行回调由装配方提供（TuiApp.rewindSession 接 FileHistory + SessionStore）。
*
* 数据源：transcript.view.messages（TranscriptMessage：seq/turn/text）。
*/
const MODE_LABELS = {
	convo: "只截断会话（保留文件）",
	code: "只回退文件（保留会话）",
	both: "会话 + 文件都回退"
};
const MODE_KEYS = [
	{
		key: "1",
		mode: "convo"
	},
	{
		key: "2",
		mode: "code"
	},
	{
		key: "3",
		mode: "both"
	}
];
/** 双阶段回退面板：消息列表选目标 → 粒度选择 → 执行 → 结果展示（纯状态机 + 渲染，零 I/O）。 */
var RewindOverlay = class {
	messages = [];
	/** 阶段：list → mode → executing → done；null = 未激活。 */
	phase = null;
	selected = 0;
	mode = null;
	result = null;
	theme;
	executor = null;
	constructor(theme) {
		this.theme = theme ?? getTheme();
	}
	/**
	* 装配方提供消息快照 + 执行回调；重复设置重置状态。
	* @param messages - 会话消息快照（transcript.view.messages）。
	* @param executor - 用户确认后执行回退的回调。
	*/
	setMessages(messages, executor) {
		this.messages = messages;
		this.executor = executor;
		this.phase = "list";
		this.selected = Math.max(0, messages.length - 1);
		this.mode = null;
		this.result = null;
	}
	/**
	* 当前选中的 seq；无消息返回 -1。
	* @returns 选中消息的 seq，或 -1。
	*/
	selectedSeq() {
		const m = this.messages[this.selected];
		return m === void 0 ? -1 : m.seq;
	}
	/**
	* done 阶段（结果已显示，装配方应关闭 overlay）。
	* @returns 处于 done 阶段时 true。
	*/
	isDone() {
		return this.phase === "done";
	}
	/**
	* 处理按键；返回 true 表示已消费。
	* @param name - 按键名（up/down/return/escape/ctrl_c 等）。
	* @param char - 可打印字符（j/k 移动，1/2/3 选粒度）。
	* @returns 已消费时 true（Esc/Ctrl+C 由装配方关闭 overlay）。
	*/
	handleKey(name, char) {
		if (this.phase === "list") {
			if (name === "up" || char === "k") {
				this.selected = Math.max(0, this.selected - 1);
				return true;
			}
			if (name === "down" || char === "j") {
				this.selected = Math.min(this.messages.length - 1, this.selected + 1);
				return true;
			}
			if (name === "return") {
				if (this.selectedSeq() >= 0) this.phase = "mode";
				return true;
			}
			return name === "escape" || name === "ctrl_c";
		}
		if (this.phase === "mode") {
			if (char === "1" || char === "2" || char === "3") {
				this.mode = MODE_KEYS.find((k) => k.key === char)?.mode ?? null;
				this.run();
				return true;
			}
			return name === "escape" || name === "ctrl_c";
		}
		return this.phase === "done";
	}
	/** 执行回退（mode 阶段选中后）。 */
	async run() {
		const executor = this.executor;
		const mode = this.mode;
		const atSeq = this.selectedSeq();
		if (executor === null || mode === null || atSeq < 0) return;
		this.phase = "executing";
		try {
			this.result = await executor(mode, atSeq);
		} catch (error) {
			this.result = {
				filesChanged: -1,
				error: error instanceof Error ? error.message : String(error)
			};
		}
		this.phase = "done";
	}
	render(width, height) {
		if (this.phase === null) return [];
		const theme = this.theme;
		const rows = [color("⟲ rewind 回退", theme.secondary)];
		const contentWidth = Math.max(1, width - 2);
		const bodyHeight = Math.max(1, height - 3);
		if (this.phase === "list") {
			const shown = this.messages.slice(-bodyHeight);
			const offset = this.messages.length - shown.length;
			shown.forEach((m, i) => {
				const sel = offset + i === this.selected;
				const line = truncateToDisplayWidth(`[turn ${m.turn}] ${m.text.replace(/\n/g, " ")}`, contentWidth - 2);
				rows.push(sel ? color(`▸ ${line}`, theme.success) : `  ${line}`);
			});
			rows.push(color("↑↓/j k 选择 · Enter 确认 · Esc 取消", theme.muted));
			return rows;
		}
		if (this.phase === "mode") {
			rows.push(color(`回退到 seq ${this.selectedSeq()}，选择粒度：`, theme.primary));
			MODE_KEYS.forEach(({ key, mode }) => {
				rows.push(`  ${key}. ${MODE_LABELS[mode]}`);
			});
			rows.push(color("Esc 取消", theme.muted));
			return rows;
		}
		if (this.phase === "executing") {
			rows.push(color("回退执行中…", theme.muted));
			return rows;
		}
		const r = this.result;
		if (r === null) {
			rows.push(color("回退已取消", theme.muted));
			return rows;
		}
		if (r.filesChanged < 0) rows.push(color(`回退失败：${r.error ?? "未知错误"}`, theme.error));
		else {
			const skippedNote = r.filesSkipped !== void 0 && r.filesSkipped > 0 ? `（${r.filesSkipped} 个文件因快照缺失未回退）` : "";
			rows.push(color(`回退完成：${r.filesChanged} 个文件${skippedNote}${r.truncatedTo === void 0 ? "" : `，会话截断到 seq ${r.truncatedTo}`}`, theme.success));
		}
		rows.push(color("任意键关闭", theme.muted));
		return rows;
	}
};
//#endregion
//#region lib/types/external-editor.js
/**
* external-editor — 外部编辑器集成（Phase 6.4）。
*
* Ctrl+E（可配 editorKey；ctrl+o 已恢复为推理展开）把当前输入行内容写入
* 临时文件，spawn `$VISUAL || $EDITOR` 打开编辑，保存退出后内容回填输入框。
* 纯 Node API，零依赖。
*
* 移植自 .rivet/tui-source/tui/external-editor.ts（Apache-2.0；SOURCE-MAP.md）。
* 差异：源引用的 ../platform.js getDefaultEditor 未随移植源落地，此处内联
* （VISUAL/EDITOR 优先，缺省 vi / notepad@win32）。
*
* @module @deepseek-ai/dsh-tianshu-tui/external-editor
*/
/**
* 平台缺省编辑器（VISUAL/EDITOR 均未设置时）。
* @returns win32 为 notepad，其余平台为 vi。
*/
function getDefaultEditor() {
	return process.platform === "win32" ? "notepad" : "vi";
}
/**
* 编辑器命令：VISUAL 优先，其次 EDITOR，最后平台缺省。
* @param env - 环境变量来源（测试可注入；缺省 process.env）。
* @returns 要 spawn 的编辑器命令。
*/
function getEditorCommand(env = process.env) {
	return env["VISUAL"] || env["EDITOR"] || getDefaultEditor();
}
/**
* 把初始内容写入一次性临时文件（目录 mkdtemp，文件 RIVET_INPUT.md）。
* @param content - 写入的初始内容。
* @returns 临时文件的绝对路径。
*/
function createTempFile(content) {
	const path = join(mkdtempSync(join(tmpdir(), "rivet-edit-")), "RIVET_INPUT.md");
	writeFileSync(path, content);
	return path;
}
/**
* 读取编辑结果并清理临时文件（unlink 失败 best-effort）。
* @param path - createTempFile 返回的临时文件路径。
* @returns 文件内容（utf-8）。
*/
function readAndCleanup(path) {
	const content = readFileSync(path, "utf-8");
	try {
		unlinkSync(path);
	} catch {}
	return content;
}
/**
* 打开编辑器编辑 initialContent，返回编辑后的内容。
* 编辑器命令可注入（测试）；缺省走 getEditorCommand()。
* 编辑器异常终止（status !== 0 且有 error）返回 null；status 非 0 但无
* error（编辑器被信号终止但文件已保存）仍读回内容。
* @param initialContent - 预填进编辑器的初始内容。
* @param editor - 编辑器命令（测试注入）；缺省走 getEditorCommand()。
* @returns 编辑后的内容；编辑器启动/执行异常时为 null。
*/
function openInEditor(initialContent, editor) {
	const path = createTempFile(initialContent);
	const result = spawnSync(editor ?? getEditorCommand(), [path], { stdio: "inherit" });
	if (result.status !== 0 && result.error) return null;
	return readAndCleanup(path);
}
//#endregion
//#region lib/types/format/fluency-policy.js
/**
* fluency-policy — 流利度策略（9d 移植，ActivityPhase 适配本包 5 值）。
*
* 从信号（phase/silentMs/outputRate/resultLength/contextPressure/isError/
* isApproval/consecutiveRoutine）推出渲染策略：visibility（normal/quiet/
* inspect/stress）、foldRoutine、coalesceMs、stale 提示。
*
* 移植自 .rivet/tui-source/tui/fluency-policy.ts（Apache-2.0；SOURCE-MAP.md）。
* 差异：本包 ActivityPhase 为 idle/tool/waiting/thinking/streaming 五值，
* 源的 analyzing/mcp/compacting/preflight 档位及其分支已删除。
*
* @module @deepseek-ai/dsh-tianshu-tui/format/fluency-policy
*/
const HIGH_VOLUME_RESULT_LENGTH = 5e4;
const HIGH_OUTPUT_RATE = 5e4;
const PHASE_STALE_TIERS = {
	thinking: [
		3e4,
		9e4,
		18e4
	],
	streaming: [
		15e3,
		6e4,
		12e4
	],
	tool: [
		45e3,
		9e4,
		18e4
	],
	waiting: [
		15e3,
		6e4,
		12e4
	],
	idle: [
		15e3,
		6e4,
		12e4
	]
};
/** 按阶段分档的等待提示。到 action 档会明确告诉用户可以 Ctrl+C——长等待里
*  「还活着吗 / 我能做什么」是唯一真正要回答的两个问题。
*
*  由 TuiApp.renderLive 的 spinner 区直接消费。
* @param phase - 当前活动相位（决定分档阈值与文案）。
* @param silentMs - 静默时长（毫秒）。
* @returns 达到 info/warn/action 档时返回提示与级别；未达 info 档返回 null。 */
function getPhaseStaleMessage(phase, silentMs) {
	const [info, warn, action] = PHASE_STALE_TIERS[phase] ?? PHASE_STALE_TIERS.streaming;
	const sec = Math.round(silentMs / 1e3);
	const min = Math.round(silentMs / 6e4);
	if (silentMs >= action) {
		if (phase === "thinking") return {
			message: `Long think — Ctrl+C to stop (${min}m)`,
			level: "action"
		};
		if (phase === "tool") return {
			message: `Tool may be stuck — Ctrl+C (${min}m)`,
			level: "action"
		};
		return {
			message: `No response — Ctrl+C to interrupt (${min}m)`,
			level: "action"
		};
	}
	if (silentMs >= warn) {
		if (phase === "thinking") return {
			message: `Collecting context... ${min}m`,
			level: "warn"
		};
		if (phase === "tool") return {
			message: `Tool running long... ${min}m`,
			level: "warn"
		};
		return {
			message: `Still waiting... ${min}m`,
			level: "warn"
		};
	}
	if (silentMs >= info) {
		if (phase === "thinking") return {
			message: `Thinking deeply... ${sec}s`,
			level: "info"
		};
		if (phase === "tool") return {
			message: `Executing tools... ${sec}s`,
			level: "info"
		};
		return {
			message: `Waiting for response... ${sec}s`,
			level: "info"
		};
	}
	return null;
}
/**
* 从信号推出渲染策略。优先级：错误/审批（恒 inspect）> 高上下文压力
* （stress + 聚合）> 长静默（inspect + stale 提示）> 大结果/高输出速率
* （inspect + 折叠）> 连续例行（quiet）> normal。
* @param signals - 当前信号快照。
* @returns 命中的首个策略档位。
*/
function computeFluencyPolicy(signals) {
	if (signals.isError) return {
		visibility: "inspect",
		foldRoutine: false,
		coalesceMs: 0
	};
	if (signals.isApproval) return {
		visibility: "inspect",
		foldRoutine: false,
		coalesceMs: 0
	};
	if (signals.contextPressure >= .8) return {
		visibility: "stress",
		foldRoutine: true,
		coalesceMs: 1e3 + Math.round(signals.contextPressure * 2e3)
	};
	if (signals.silentMs >= 15e3) {
		const stale = getPhaseStaleMessage(signals.phase, signals.silentMs);
		if (stale) return {
			visibility: "inspect",
			foldRoutine: false,
			coalesceMs: 0,
			staleMessage: stale.message,
			staleLevel: stale.level
		};
	}
	if (signals.resultLength >= HIGH_VOLUME_RESULT_LENGTH || signals.outputRate >= HIGH_OUTPUT_RATE) return {
		visibility: "inspect",
		foldRoutine: true,
		coalesceMs: 1e3
	};
	if (signals.consecutiveRoutine >= 4) return {
		visibility: "quiet",
		foldRoutine: true,
		coalesceMs: 500
	};
	return {
		visibility: "normal",
		foldRoutine: false,
		coalesceMs: 0
	};
}
/** 连续例行事件计数器：非例行事件即清零，连续 ≥4 次触发折叠。 */
var RoutineCounter = class {
	_count = 0;
	/** 当前连续例行事件计数。 */
	get count() {
		return this._count;
	}
	/**
	* 记录一个事件：例行则累加，非例行则清零。
	* @param isRoutine - 该事件是否例行。
	*/
	record(isRoutine) {
		this._count = isRoutine ? this._count + 1 : 0;
	}
	/** 清零计数。 */
	reset() {
		this._count = 0;
	}
	/** 是否应折叠例行事件（连续 ≥4 次）。 */
	get shouldFold() {
		return this._count >= 4;
	}
};
//#endregion
//#region lib/types/fluency-hook.js
/**
* fluency-hook — 流利度追踪器（9d 移植）。
*
* FluencyTracker 消费工具事件流（tool/call、tool/result、agent 阶段、
* turn 边界），维护连续 routine 计数 / 输出速率 / 静默时长等信号，
* getPolicy() 折叠为渲染策略（见 format/fluency-policy.ts）。
*
* 移植自 .rivet/tui-source/tui/fluency-hook.ts（Apache-2.0；SOURCE-MAP.md）。
* 差异：ActivityPhase 适配本包五值；contextPressure 由装配层喂入
* （0..1，TUI 无 token 数据源时保持 0）。
*
* @module @deepseek-ai/dsh-tianshu-tui/fluency-hook
*/
const ROUTINE_TOOLS = new Set([
	"read_file",
	"grep",
	"glob",
	"inspect_project",
	"repo_map",
	"related_tests",
	"recall",
	"diff"
]);
/**
* 流利度追踪器：消费工具/阶段/回合事件，维护连续 routine 计数、
* 输出速率、静默时长等信号，供 getPolicy() 折叠为渲染策略。
*/
var FluencyTracker = class {
	routine = new RoutineCounter();
	lastEventAt = Date.now();
	contextPressure = 0;
	lastIsError = false;
	lastIsApproval = false;
	phase = "idle";
	outputRate = 0;
	resultLength = 0;
	/**
	* 判定一次工具调用是否算 routine（只读检索类且未出错）。
	* @param name - 工具名。
	* @param isError - 该次调用是否出错；出错一律不算 routine。
	* @returns 属于 routine 工具集且未出错时为 true。
	*/
	isRoutineTool(name, isError) {
		if (isError) return false;
		return ROUTINE_TOOLS.has(name);
	}
	/**
	* 记录一次工具结果：更新 routine 计数、输出速率与错误/审批标记，阶段切到 tool。
	* @param event - 工具结果事件。
	*/
	recordToolResult(event) {
		const now = Date.now();
		const elapsedSeconds = Math.max((now - this.lastEventAt) / 1e3, 1);
		this.routine.record(this.isRoutineTool(event.name, event.isError));
		this.outputRate = event.resultLength / elapsedSeconds;
		this.resultLength = event.resultLength;
		this.lastEventAt = now;
		this.lastIsError = event.isError;
		this.lastIsApproval = false;
		this.phase = "tool";
	}
	/** 记录一次审批交互：置审批标记并清零连续 routine 计数。 */
	recordApproval() {
		this.lastIsApproval = true;
		this.routine.reset();
	}
	/**
	* 由装配层喂入上下文压力信号（TUI 无 token 数据源时保持 0）。
	* @param pressure - 上下文压力，0..1。
	*/
	setContextPressure(pressure) {
		this.contextPressure = pressure;
	}
	/**
	* 切换当前活动阶段并重置静默计时起点。
	* @param phase - 新的活动阶段。
	*/
	setPhase(phase) {
		this.phase = phase;
		this.lastEventAt = Date.now();
	}
	/**
	* 回填已静默的时长（把静默计时起点拨回 silentMs 毫秒前）。
	* @param silentMs - 已静默的毫秒数。
	*/
	updateSilence(silentMs) {
		this.lastEventAt = Date.now() - silentMs;
	}
	/** 回合结束：清空全部信号并回到 idle 阶段。 */
	onTurnComplete() {
		this.routine.reset();
		this.lastIsError = false;
		this.lastIsApproval = false;
		this.outputRate = 0;
		this.resultLength = 0;
		this.lastEventAt = Date.now();
		this.phase = "idle";
	}
	/**
	* 把当前信号快照折叠为渲染策略。
	* @returns 由 computeFluencyPolicy 计算的当前流利度策略。
	*/
	getPolicy() {
		return computeFluencyPolicy({
			phase: this.phase,
			silentMs: Date.now() - this.lastEventAt,
			outputRate: this.outputRate,
			resultLength: this.resultLength,
			contextPressure: this.contextPressure,
			isError: this.lastIsError,
			isApproval: this.lastIsApproval,
			consecutiveRoutine: this.routine.count
		});
	}
};
//#endregion
//#region lib/types/mention-parser.js
/**
* mention-parser — @路径展开解析器（RED 基线）。
*
* 纯函数：输入文本 + 光标 → 光标处的候选 @token（含 span/value/引号态）。
* 不读文件——文件内容摘要展开由装配层（后续）接线。
*
* token 形：裸 `@path` 与引号形 `@"a b.ts"`（路径含空格/反斜杠时）。
*/
const BARE_MENTION_RE = /@([^\s@]+)/g;
const QUOTED_MENTION_RE = /@"((?:[^"\\]|\\.)*)"/g;
/**
* 全量提取所有 mention token（裸 + 引号形）。
* @param input - 输入框全文。
* @returns 带分类的 token 列表（引号形优先，裸形跳过已被引号形消费的区域）。
*/
function parseMentions(input) {
	const out = [];
	for (const m of input.matchAll(QUOTED_MENTION_RE)) {
		const start = m.index;
		const raw = m[0];
		/* v8 ignore next -- matchAll 成功匹配的 RegExpMatchArray 索引必有值；noUncheckedIndexedAccess 收窄防御 */
		if (raw === void 0) continue;
		const value = m[1];
		/* v8 ignore next -- 参与匹配的捕获组必有值；noUncheckedIndexedAccess 收窄防御 */
		if (value === void 0) continue;
		out.push({
			start,
			end: start + raw.length,
			value,
			quoted: true,
			kind: mentionKind(value)
		});
	}
	for (const m of input.matchAll(BARE_MENTION_RE)) {
		const start = m.index;
		const raw = m[0];
		/* v8 ignore next -- matchAll 成功匹配的 RegExpMatchArray 索引必有值；noUncheckedIndexedAccess 收窄防御 */
		if (raw === void 0) continue;
		if (out.some((r) => start >= r.start && start < r.end)) continue;
		const value = m[1];
		/* v8 ignore next -- 参与匹配的捕获组必有值；noUncheckedIndexedAccess 收窄防御 */
		if (value === void 0) continue;
		out.push({
			start,
			end: start + raw.length,
			value,
			quoted: false,
			kind: mentionKind(value)
		});
	}
	return out;
}
/**
* token 形状启发式分类：尾斜杠 → folder；含 #/:: → symbol；空 → raw；其余 file。
* @param value - 去引号后的路径值。
* @returns 分类结果。
*/
function mentionKind(value) {
	if (value === "") return "raw";
	if (value.endsWith("/")) return "folder";
	if (value.includes("#") || value.includes("::")) return "symbol";
	return "file";
}
//#endregion
//#region lib/types/mention-expand.js
/**
* mention-expand — @mention 用户侧摘要展开（Phase 9a 装配层）。
*
* 语义决策（.agents/notes/implemented/feature/2026-08-10-tui-mention-semantics.*）：
* `@filename` 展开为截断的内容摘要展示在用户消息中，**不做** agent 上下文注入。
* 读取边界：仅限工作区（cwd）内文件；目录/不存在/越界 → 降级为引用名展示
* （token 原样保留，不展开）。摘要截断（首 20 行 / 4KB）加折叠标记。
*
* 文件读取在 file 边界做存在性与大小验证（AGENTS.md 边界验证纪律）：
* 先 resolve + 前缀校验（防越界），再 stat 存在性/类型，读取后截断。
*
* @module @deepseek-ai/dsh-tianshu-tui/mention-expand
*/
/** 摘要截断上限：首 20 行 / 4KB（决策 note）。 */
const MAX_SUMMARY_LINES = 20;
const MAX_SUMMARY_CHARS = 4 * 1024;
/** 是否在 cwd 内（resolve 后严格前缀，防 ../ 越界）。 */
function isInsideCwd(cwd, candidate) {
	return candidate === cwd || candidate.startsWith(cwd + sep);
}
/** 读取文件摘要：前 20 行 / 4KB 截断 + 折叠标记；读失败降级 null。 */
function readSummary(path) {
	let raw;
	try {
		raw = readFileSync(path, "utf-8");
	} catch {
		return null;
	}
	const lines = raw.split("\n");
	const first = lines.slice(0, MAX_SUMMARY_LINES).join("\n");
	const truncated = first.length > MAX_SUMMARY_CHARS ? first.slice(0, MAX_SUMMARY_CHARS) : first;
	return truncated.length < raw.length || lines.length > MAX_SUMMARY_LINES ? `${truncated}\n… [截断 ${lines.length} 行 / ${raw.length} 字符]` : truncated;
}
/**
* 展开输入中的所有 @mention：file 类 token 读 cwd 内文件内容摘要，
* 替换为 `@path\n<摘要>`；folder/越界/不存在/读取失败 → token 原样保留。
* @param input - 输入文本。
* @param cwd - 工作区根（读取边界）。
* @returns 展开后的文本。
*/
function expandMentions(input, cwd) {
	const mentions = parseMentions(input);
	if (mentions.length === 0) return input;
	const segments = [];
	let cursor = input.length;
	for (let index = mentions.length - 1; index >= 0; index -= 1) {
		const mention = mentions[index];
		/* v8 ignore next -- 循环自 mentions.length-1 递减至 0，index 恒在界内；noUncheckedIndexedAccess 收窄防御 */
		if (mention === void 0) continue;
		const keep = () => {
			if (mention.end < cursor) segments.unshift(input.slice(mention.end, cursor));
			segments.unshift(input.slice(mention.start, mention.end));
			cursor = mention.start;
		};
		if (mention.kind !== "file") {
			keep();
			continue;
		}
		const candidate = resolve(cwd, mention.value);
		const summary = isInsideCwd(cwd, candidate) ? readSummary(candidate) : null;
		if (summary === null) {
			keep();
			continue;
		}
		if (mention.end < cursor) segments.unshift(input.slice(mention.end, cursor));
		segments.unshift(`@${mention.value}\n${summary}`);
		cursor = mention.start;
	}
	segments.unshift(input.slice(0, cursor));
	return segments.join("");
}
//#endregion
//#region lib/types/restore-session.js
const DAY_MS = 864e5;
/**
* 相对时间：<60s 刚刚 / <1h N 分钟前 / <24h N 小时前 / <7d N 天前 / ≥7d 日期。
* @param createdAt - 会话创建时间戳（毫秒）。
* @param now - 当前时间戳（毫秒）。
* @returns 相对时间文本（≥7 天为 `YYYY-MM-DD`）。
*/
function formatSessionAge(createdAt, now) {
	const diff = now - createdAt;
	if (diff < 6e4) return "刚刚";
	if (diff < 36e5) return `${Math.floor(diff / 6e4)} 分钟前`;
	if (diff < DAY_MS) return `${Math.floor(diff / 36e5)} 小时前`;
	if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)} 天前`;
	const d = new Date(createdAt);
	const pad = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/**
* 待审批挂起状态机：handle() 按短路放行 / next() 委托 / 挂起三选一，
* settle() 结算用户决定，peek() 给 renderLive 出快照（见模块注释语义）。
* 挂起超过 timeoutMs 无人应答时自动结算 cancelled（fail-closed）。
*/
var ApprovalController = class {
	pending = null;
	alwaysApproveFlag = false;
	getCurrentSessionId;
	onChanged;
	timeoutMs;
	constructor(options) {
		this.getCurrentSessionId = options.getCurrentSessionId;
		this.onChanged = options.onChanged;
		this.timeoutMs = options.timeoutMs ?? 6e4;
	}
	/** 是否有挂起的审批（handleKey 分支入口判断）。 */
	get isPending() {
		return this.pending !== null;
	}
	/** C3 项 4：always-approve 模式激活标志（三态循环读写；退出/切会话时 app 侧复位）。 */
	get alwaysApprove() {
		return this.alwaysApproveFlag;
	}
	/**
	* 设置 always-approve 模式（C3 项 4 三态循环；statusLine 徽标由 app 侧同步）。
	* @param flag - true 时当前会话的审批请求短路放行。
	*/
	setAlwaysApprove(flag) {
		this.alwaysApproveFlag = flag;
	}
	/**
	* 审批 answerer 入口：短路放行 / 委托 next() / 挂起，三选一。
	* @param req - 待决审批请求（approval/request 事件 payload）。
	* @param next - waterfall 委托（不处理时调用；链上其他 answerer 兜底）。
	* @returns 用户决定（allowed-once/rejected/cancelled）或 next() 结果。
	*/
	handle(req, next) {
		const current = this.getCurrentSessionId();
		if (this.alwaysApproveFlag && req.agent.session.id === current) return Promise.resolve("allowed-once");
		if (req.agent.session.id !== current || this.pending !== null) return next();
		return new Promise((resolve) => {
			const signal = req.signal;
			if (signal !== void 0 && signal.aborted) {
				resolve("cancelled");
				return;
			}
			const onAbort = () => {
				this.settle("cancelled");
			};
			const timer = Number.isFinite(this.timeoutMs) ? setTimeout(() => {
				this.settle("cancelled");
			}, this.timeoutMs) : void 0;
			this.pending = {
				req,
				resolve,
				since: Date.now(),
				timer,
				...signal !== void 0 ? { onAbort } : {}
			};
			signal?.addEventListener("abort", onAbort, { once: true });
			this.onChanged?.();
		});
	}
	/**
	* 结算挂起的审批请求（用户按键 y/N/Ctrl+C；会话卸载时 cancel 为 cancelled；
	* 请求 signal abort 时自动结算为 cancelled；挂起超过 timeoutMs 时自动结算为 cancelled）。
	* @param outcome - 用户决定。
	*/
	settle(outcome) {
		const pending = this.pending;
		/* v8 ignore next -- settle 仅在 pendingApproval 非 null 的调用点可达 */
		if (pending === null) return;
		this.pending = null;
		if (pending.timer !== void 0) clearTimeout(pending.timer);
		const onAbort = pending.onAbort;
		if (onAbort !== void 0) pending.req.signal?.removeEventListener("abort", onAbort);
		pending.resolve(outcome);
		this.onChanged?.();
	}
	/**
	* 当前挂起态快照（renderLive 审批段消费）。
	* @returns { req, since }；无挂起 null。
	*/
	peek() {
		if (this.pending === null) return null;
		return {
			req: this.pending.req,
			since: this.pending.since
		};
	}
};
//#endregion
//#region lib/types/controllers/question-controller.js
/**
* QuestionController — 挂起结构化提问状态机（Wave 1 从 ui/app.ts 提取）。
*
* 持有 pendingQuestion 挂起态（request + resolve/reject 句柄）与
* questionFeedbackMode（plan-review 反馈输入态）。状态、行为、渲染三件事的
* 对象边界：挂起/结算/取消收敛在本控制器，渲染经 peek() 快照由 renderLive
* 消费，键仲裁由 app.ts handleKey 读 isPending/feedbackMode 后调 settle/cancel。
*
* 副作用注入（不 import app.ts、不碰渲染）：
* - onEscapeImmediate(flag)：挂起期间 ESC 恒为「取消提问」而非 CSI 序列前缀，
*   立即派发避免 80ms 窗口内后续按键被吞进序列缓冲（input-handler 语义）。
* - onChanged()：状态实际变化（挂起/结算/取消）后回调，app 侧据此 flushLiveRender。
*
* 契约（与 user-questions provider 对齐）：
* - 重叠 ask → reject UserQuestionError(ASK_CANCELLED)（一次只呈现一个问题）。
* - cancel → reject UserQuestionError(ASK_CANCELLED)（取消必须 reject，非 resolve）。
*
* @module @deepseek-ai/dsh-tianshu-tui/controllers/question-controller
*/
/**
* 挂起结构化提问状态机：一次只挂起一个问题（重叠 ask 即 reject），
* settle/cancel 结算句柄，peek() 给 renderLive 出快照（见模块注释契约）。
*/
var QuestionController = class {
	pending = null;
	feedback = false;
	onEscapeImmediate;
	onChanged;
	constructor(options) {
		this.onEscapeImmediate = options.onEscapeImmediate;
		this.onChanged = options.onChanged;
	}
	/** 是否有挂起的提问（handleKey 分支入口判断）。 */
	get isPending() {
		return this.pending !== null;
	}
	/** plan-review 反馈输入态（f 键进入；结算/取消时复位）。 */
	get feedbackMode() {
		return this.feedback;
	}
	/**
	* 进入/退出反馈输入态（f 键 / Esc 返回选项态；不触发结算）。
	* @param flag - true 进入反馈输入态，false 返回选项态。
	*/
	setFeedbackMode(flag) {
		this.feedback = flag;
	}
	/**
	* 挂起一个提问请求：存 resolve/reject 句柄，返回等用户结算的 promise。
	* 已有挂起时 reject ASK_CANCELLED（重叠保护，不覆盖首个挂起）。
	* @param request - user-questions 的 AskUserQuestionRequest 形状（cast 自 unknown）。
	* @returns 结算值（settle 的 answer）或 UserQuestionError(ASK_CANCELLED)。
	*/
	ask(request) {
		const req = request;
		if (this.pending !== null) return Promise.reject(new UserQuestionError("a question is already pending; the user is answering it", "ASK_CANCELLED"));
		const promise = new Promise((resolve, reject) => {
			this.pending = {
				request: req,
				resolve,
				reject
			};
			this.onEscapeImmediate(true);
			this.onChanged?.();
		});
		promise.catch(() => {});
		return promise;
	}
	/**
	* 结算挂起的提问（用户选择/提交反馈）。
	* @param answer - provider 契约的结算值（{ answers: [{ id, selected[], custom? }] }）。
	*/
	settle(answer) {
		const pending = this.pending;
		/* v8 ignore next -- 调用点均先断言 isPending，null 分支仅类型收窄 */
		if (pending === null) return;
		this.pending = null;
		this.feedback = false;
		this.onEscapeImmediate(false);
		pending.resolve(answer);
		this.onChanged?.();
	}
	/**
	* 取消挂起的提问（Esc/Ctrl+C）——reject ASK_CANCELLED（provider 契约）。
	*/
	cancel() {
		const pending = this.pending;
		/* v8 ignore next -- 调用点均先断言 isPending，null 分支仅类型收窄 */
		if (pending === null) return;
		this.pending = null;
		this.feedback = false;
		this.onEscapeImmediate(false);
		pending.reject(new UserQuestionError("the user cancelled the question", "ASK_CANCELLED"));
		this.onChanged?.();
	}
	/**
	* 当前挂起态快照（renderLive 挂起段消费）。
	* @returns { request, feedbackMode }；无挂起 null。
	*/
	peek() {
		if (this.pending === null) return null;
		return {
			request: this.pending.request,
			feedbackMode: this.feedback
		};
	}
};
//#endregion
//#region lib/types/controllers/btw-controller.js
/**
* BtwController — /btw 侧问状态机（P1 提取，对齐 Question/Approval controller 模式）。
*
* 语义：用户可在主 agent 运行中途提出一个独立问题。btw 走本地 Cordis 旁路——
* 从当前会话 fork 一个「最后完整 turn」的事件前缀（seed）创建临时 btw agent
* （独立 session，不赋值 ownedHandle、不经过 switchSession），单轮问答后销毁。
* 答案经 session/event 流收集（text-delta → turn/end 定稿），渲染快照经 peek()
* 由 renderLive 消费；Esc 由 app 侧 handleKey 仲裁后调 dismiss()。
*
* 关键约束（与主对话流的隔离）：
* - seed 只含完整 turn：fork 语义禁止 ending inside open turn（SessionStore.fork
*   的 OPEN_TURN 检查同构）——主 agent 运行中（open turn）侧问不污染主上下文。
* - 不持 ownedHandle：btw agent 是 registry 级旁路（switchSession 兜底分支同款），
*   dispose 由本控制器在收尾时显式执行（dismiss/超时/完成）。
* - 事件订阅按 btw session id 过滤，不干扰主会话的 streamFeed。
*
* 状态机：idle → loading → done | error →（dismiss）idle。
* - done：答案定稿后等待 Esc 折叠（app 经 onAnswer 写 scrollback）。
* - error：超时/失败后仍可 Esc 关闭。
* - loading 时 Esc：取消并销毁 btw agent（无答案可写）。
* 重叠保护：ask 期间再次 ask 静默忽略（一次只跑一个侧问）。
*
* @module @deepseek-ai/dsh-tianshu-tui/controllers/btw-controller
*/
/**
* 从会话事件日志计算 btw 的 fork seed：最后一个 turn/end 之前的完整前缀。
* fork 语义要求 seed 是 balanced completed-turn prefix（SessionStore.fork 的
* OPEN_TURN 检查同构）——主 agent 运行中（open turn）时截到上一个完整 turn，
* 无任何完整 turn 时为空 seed（btw 从零上下文开始）。
* @param events - 源会话事件日志（seq 连续从 0 开始，数组下标即 seq）。
* @returns 完整 turn 前缀（可直接作 agents.create 的 seed）。
*/
function completedTurnSeed(events) {
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i];
		if (event !== void 0 && event.type === "turn/end") return events.slice(0, i + 1);
	}
	return [];
}
/**
* /btw 侧问状态机：fork 完整 turn 前缀创建临时 btw agent，单轮问答后销毁；
* 状态流 idle → loading → done|error →（dismiss）idle（见模块注释约束）。
*/
var BtwController = class {
	state = null;
	/** 当前 btw agent 的 owned handle（本控制器持有，收尾时 dispose）。 */
	handle = null;
	/** btw session 事件订阅 disposer（随收尾释放）。 */
	feed = null;
	/** loading 超时定时器（finish/fail/dismiss 时清除）。 */
	timer = null;
	ctx;
	activeSessionId;
	onChanged;
	onAnswer;
	timeoutMs;
	constructor(options) {
		this.ctx = options.ctx;
		this.activeSessionId = options.activeSessionId;
		this.onChanged = options.onChanged;
		this.onAnswer = options.onAnswer;
		this.timeoutMs = options.timeoutMs ?? 3e4;
	}
	/** 是否有挂起的侧问（handleKey Esc 分支入口判断）。 */
	get isActive() {
		return this.state !== null;
	}
	/**
	* 当前挂起态快照（renderLive btw 段消费）。
	* @returns 挂起态；无挂起侧问为 null。
	*/
	peek() {
		return this.state;
	}
	/**
	* 发起一次侧问：fork 完整 turn 前缀 → agents.create（btw session，不持
	* ownedHandle）→ 订阅答案流 → followup 单轮。已有挂起时静默忽略（一次一个）。
	* @param question - 侧问文本（已 trim；空文本由命令层拦截）。
	* @throws 无活跃会话/会话不存在/创建失败（命令分发层回显失败）。
	*/
	async ask(question) {
		if (this.state !== null) return;
		const activeId = this.activeSessionId();
		if (activeId === null) throw new Error("当前无活跃会话，无法发起侧问");
		const session = this.ctx.sessions.get(activeId);
		if (session === void 0) throw new Error(`unknown session: ${activeId}`);
		const btwId = SessionId(`session-btw-${randomUUID()}`);
		const seed = completedTurnSeed(session.events);
		const selection = this.ctx.agentDefaultModel.currentSelection();
		const handle = await this.ctx.agents.create({
			sessionId: btwId,
			seed,
			meta: {
				cwd: session.header.cwd ?? process.cwd(),
				parentSession: activeId,
				seedLength: seed.length
			},
			agentOptions: {
				provider: selection.provider,
				model: selection.model
			}
		});
		const buffer = [];
		const feed = this.ctx.on("session/event", (owner, event) => {
			if (owner.id !== btwId) return;
			if (event.type === "assistant/chunk" && event.data.chunk.type === "text-delta") buffer.push(event.data.chunk.text);
			else if (event.type === "turn/end") this.finish(buffer.join(""));
		});
		this.handle = handle;
		this.feed = feed;
		this.state = {
			status: "loading",
			question
		};
		this.timer = setTimeout(() => {
			this.fail("等待侧问回答超时（无响应）");
		}, this.timeoutMs);
		try {
			await controlsFromHandle(handle).followup(question);
		} catch (err) {
			this.teardown();
			this.state = null;
			throw err;
		}
		this.onChanged?.();
	}
	/**
	* 关闭挂起的侧问（Esc/Ctrl+C）。done 态把答案折叠进 scrollback（onAnswer
	* 回调）；loading 态取消并销毁 btw agent；error 态直接清除。
	*/
	dismiss() {
		const current = this.state;
		if (current === null) return;
		if (current.status === "done") this.onAnswer?.({
			question: current.question,
			answer: current.answer ?? ""
		});
		this.teardown();
		this.state = null;
		this.onChanged?.();
	}
	/**
	* 总清理（app dispose 时）：未决侧问（loading/error）直接销毁 btw agent，
	* done 态不折叠（答案未确认，丢弃——退出即弃，与 always-approve 同生命周期）。
	*/
	dispose() {
		if (this.state === null) return;
		this.teardown();
		this.state = null;
	}
	/** 答案定稿（turn/end 触发）：释放订阅与 agent（turn 已结束，dispose 安全）。 */
	finish(answer) {
		const current = this.state;
		if (current === null || current.status !== "loading") return;
		this.teardown();
		this.state = {
			status: "done",
			question: current.question,
			answer
		};
		this.onChanged?.();
	}
	/** 失败（超时）：销毁 btw agent，置 error 态（Esc 关闭）。 */
	fail(message) {
		const current = this.state;
		if (current === null || current.status !== "loading") return;
		this.teardown();
		this.state = {
			status: "error",
			question: current.question,
			error: message
		};
		this.onChanged?.();
	}
	/** 释放订阅 + dispose btw agent handle（幂等：收尾后再次调用 no-op）。 */
	teardown() {
		if (this.timer !== null) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		this.feed?.();
		this.feed = null;
		const handle = this.handle;
		this.handle = null;
		if (handle !== null) handle.dispose();
	}
};
//#endregion
//#region lib/types/controllers/session-manager.js
/**
* SessionManager — 多会话 side conversation 快照层（P3）。
*
* 会话快照从 live store 派生（不重复存储）：ctx.sessions.list() 是权威来源
* （AgentRegistry 多 agent 并存 + SessionStore 多 session 天然支持），本层只
* 做「session → 投影元数据」的派生与状态查询。tab 栏渲染消费 list()。
*
* 会话生命周期归属：agent 由 agent-loop factory 持有（TuiApp 切换时经
* detachProjections({ keepHandle: true }) 让渡所有权给 registry）；本层不
* 创建/销毁会话——退出时由 factory 统一 teardown。
*
* @module @deepseek-ai/dsh-tianshu-tui/controllers/session-manager
*/
/** 多会话快照层：从 live store（ctx.sessions/ctx.agents）派生投影元数据，不持有会话生命周期。 */
var SessionManager = class {
	ctx;
	constructor(ctx) {
		this.ctx = ctx;
	}
	/**
	* 全部 live 会话的投影快照（live store 派生；按创建序）。
	* @returns 每个 live 会话一条 SessionSnapshot。
	*/
	list() {
		const sessions = this.ctx.sessions.list();
		const snapshots = [];
		for (const session of sessions) snapshots.push({
			id: session.id,
			status: this.ctx.agents.get(session.id)?.status ?? "idle",
			messageCount: session.events.length
		});
		return snapshots;
	}
	/**
	* 某会话的 agent 状态（无 live agent 视为 idle）。
	* @param id - 会话 id。
	* @returns 'running' 或 'idle'。
	*/
	statusOf(id) {
		return this.ctx.agents.get(id)?.status ?? "idle";
	}
};
//#endregion
//#region lib/types/format/btw-panel.js
/**
* renderBtwPanel — /btw 侧问浮动面板纯函数（P1）。
*
* 把 BtwController 的 peek 快照投影为 live 区顶部面板行：loading 显示 spinner
* + 问题文本 + Esc 提示；done 显示问题 + 答案全文（逐行截断）+ 折叠提示；
* error 显示失败信息。纯函数：同一输入恒返回同一行序列，无 I/O、无时钟
* （spinner 是静态 glyph，不随 tick 变化——面板在 120ms ticker 下已自动刷新）。
* 着色由组合器（renderLive）按状态决定，本模块只产纯文本行。
*
* @module @deepseek-ai/dsh-tianshu-tui/format/btw-panel
*/
/**
* 渲染 btw 侧问面板行。
* @param input - 挂起态快照。
* @param opts - 渲染选项。
* @returns 面板行数组（纯文本；状态行恒存在）。
*/
function renderBtwPanel(input, opts) {
	const rows = [];
	if (input.status === "loading") {
		rows.push(`⏳ 侧问: ${truncateToDisplayWidth(input.question, opts.width)}`);
		rows.push("（Esc 取消；不中断当前对话）");
		return rows;
	}
	if (input.status === "error") {
		rows.push(`⚠ 侧问失败: ${truncateToDisplayWidth(input.error ?? "", opts.width)}`);
		rows.push("（Esc 关闭）");
		return rows;
	}
	rows.push(`💬 侧问: ${truncateToDisplayWidth(input.question, opts.width)}`);
	const answer = input.answer ?? "";
	if (answer === "") rows.push("（空回答）");
	else for (const line of answer.split("\n")) rows.push(truncateToDisplayWidth(line, opts.width));
	rows.push("（Esc 关闭，答案已写入记录）");
	return rows;
}
//#endregion
//#region lib/types/format/whale.js
/**
* 欢迎页鲸鱼品牌像素画（format/whale.ts）— 纯渲染。
*
* 半块字符像素画：每个字符格用 `▀`（fg=上像素 + bg=下像素）表达 2 个纵向
* 像素；单色格用 `█`、半透明格用 `▀`/`▄` 仅设前景，全透明格纯空格（不涂
* 背景，终端底色透出）。块字符（U+2580–259F）在 narrow/wide 宽度档均按
* 1 列计（width.ts isBoxOrBlock），居中数学与宽度守恒成立；legacy CJK
* conhost（full 档）把块字符渲染成 2 列会拉伸错位——该档整体降级不出画。
*
* 品牌资产用固定色（不随主题变）：DeepSeek 品牌蓝身体 + 白肚 + 深色眼。
* 白肚在亮色主题下与终端底色融合，恰好还原 logo 在白纸上的原始观感。
*/
/**
* 像素网格（16 行 × 24 列 → 8 文本行）。图例：
* `.` 透明 / `B` 身体蓝 / `W` 白肚 / `E` 眼睛 / `P` 腮红。
* 形状对照品牌手绘鲸鱼：圆润身体、左下白肚、上中深色眼 + 腮红、右上翘尾。
*/
const GRID = [
	".................BB..BB.",
	".................BBBBBB.",
	"......BBBBBBB....BBBB...",
	"....BBBBBBBBBBB..BBB....",
	"..BBBBBBBBBBBBBBBBBB....",
	".BBBBBBBBBBBBBBBBBBB....",
	".BBBBBBBBEEBBBBBBBBB....",
	"BBWWWWBBBEEBBBBBBBBB....",
	"BWWWWWWPPBBBBBBBBBB.....",
	"BWWWWWWPPBBBBBBBBBB.....",
	"BWWWWWWWWWWWBBBBBB......",
	"BWWWWWWWWWWWWWBBBB......",
	".BWWWWWWWWWWWWWBBB......",
	"..BWWWWWWWWWWWBBB.......",
	"....BBWWWWWWWBBB........",
	".......BBBBBBBB........."
];
GRID.length / 2;
/** truecolor/256 轨：DeepSeek 品牌蓝 + 近白肚（纯白在暗底刺眼）+ 深藏青眼。 */
const TRUECOLOR_PALETTE = {
	body: "#4d6bfe",
	belly: "#f2f5fa",
	eye: "#14204a",
	blush: "#f5a8b8"
};
/** 16 色轨：命名色近似；腮红细节该档不表达（映射回身体色）。 */
const ANSI16_PALETTE = {
	body: "blueBright",
	belly: "whiteBright",
	eye: "blue",
	blush: "blueBright"
};
/** SGR 背景回默认（49）：透明格前清背景，防止半块 bg 泄漏到空格。 */
const BG_DEFAULT = "\x1B[49m";
function pixelColor(ch, pal) {
	switch (ch) {
		case "B": return pal.body;
		case "W": return pal.belly;
		case "E": return pal.eye;
		case "P": return pal.blush;
		default: return null;
	}
}
/**
* 欢迎页鲸鱼像素画：返回在 width 内水平居中的 ANSI 行数组（WHALE_ROWS 行）。
* 降级矩阵（任一不满足返回空数组，调用方回落纯文字品牌区）：
* - `width ≥ WHALE_MIN_COLS` 且 `rows ≥ WHALE_MIN_ROWS`
* - `colorLevel ≥ 1`（无色终端画不出品牌色，纯剪影无识别度）
* - `ambiguousWidthMode() !== 'full'`（legacy conhost 块字符按 2 列渲染）
* 宽度守恒：任何输出行 displayWidth ≤ width；画不截断，放不下即整体降级。
* @param input - 终端尺寸与颜色能力等级。
* @returns 居中 ANSI 行数组；降级时空数组。
*/
function formatWhaleLogo(input) {
	const level = input.colorLevel ?? chalk.level;
	if (level < 1) return [];
	if (input.width < 40 || input.rows < 22) return [];
	if (ambiguousWidthMode() === "full") return [];
	const pal = level >= 2 ? TRUECOLOR_PALETTE : ANSI16_PALETTE;
	const indent = " ".repeat(Math.max(0, Math.floor((input.width - 24) / 2)));
	const out = [];
	for (let y = 0; y < GRID.length; y += 2) {
		const top = GRID[y] ?? "";
		const bottom = GRID[y + 1] ?? "";
		let line = "";
		let curFg = null;
		let curBg = null;
		let pendingSpaces = 0;
		for (let x = 0; x < 24; x++) {
			const t = pixelColor(top[x] ?? ".", pal);
			const b = pixelColor(bottom[x] ?? ".", pal);
			let ch;
			let wantFg;
			let wantBg = null;
			if (t === null) {
				if (b === null) {
					pendingSpaces++;
					continue;
				}
				ch = "▄";
				wantFg = b;
			} else if (b === null) {
				ch = "▀";
				wantFg = t;
			} else if (t === b) {
				ch = "█";
				wantFg = t;
			} else {
				ch = "▀";
				wantFg = t;
				wantBg = b;
			}
			if (pendingSpaces > 0) {
				if (curBg !== null) {
					line += BG_DEFAULT;
					curBg = null;
				}
				line += " ".repeat(pendingSpaces);
				pendingSpaces = 0;
			}
			if (wantBg !== curBg) {
				line += wantBg === null ? BG_DEFAULT : bg(wantBg);
				curBg = wantBg;
			}
			if (wantFg !== curFg) {
				line += fg(wantFg);
				curFg = wantFg;
			}
			line += ch;
		}
		out.push(line === "" ? "" : `${indent}${line}${ANSI.RESET}`);
	}
	return out;
}
//#endregion
//#region lib/types/format/welcome.js
/**
* 启动欢迎面（format/welcome.ts）— 纯渲染。
*
* 首屏骨架对齐 Claude Code LogoV2：左栏鲸鱼 + 品牌 + 环境行，右栏 Tips
* （实用快捷键，不是可点菜单）。窄屏回落为垂直居中叠放。输入轨
* 由 format/input-frame 承担，本模块只出欢迎块。
* 宽度守恒：任何输入下每行显示宽度 ≤ width。
*/
function truncateTo$5(text, columns) {
	let out = "";
	for (const ch of text) {
		if (displayWidth(out + ch) > columns) break;
		out += ch;
	}
	return out;
}
/** 在 width 内水平居中（左侧填充；右侧不补，宽度守恒即 ≤ width）。 */
function center(text, width) {
	const left = Math.max(0, Math.floor((width - displayWidth(text)) / 2));
	return `${" ".repeat(left)}${text}`;
}
/** 右侧空格补到 width；超宽 ANSI 安全截断。 */
function padTo(text, width) {
	const w = displayWidth(text);
	if (w >= width) return truncateToDisplayWidth(text, width);
	return `${text}${" ".repeat(width - w)}`;
}
/** 鲸鱼行前导空格（居中 indent）在左栏 zip 前剥掉；ANSI 码在空格之后。 */
function stripLeadingSpaces(line) {
	let i = 0;
	while (i < line.length && line[i] === " ") i++;
	return line.slice(i);
}
/**
* 欢迎页品牌区：主标 brand（BOLD brandColor）+ 副标题（muted），各一行。
* @param input - 宽度、品牌名、副标题与对齐。
* @param theme - 当前主题（主标 brandColor BOLD，副标题 muted）。
* @returns 两行 ANSI；width ≤ 0 返回空数组。
*/
function formatBrandWelcome(input, theme) {
	if (input.width <= 0) return [];
	const brand = truncateTo$5(input.brand ?? "dsh-tianshu-tui", input.width);
	const subtitle = truncateTo$5(input.subtitle ?? "DeepSeek Harness", input.width);
	const brandLine = color(brand, theme.brandColor, { bold: true });
	const subLine = color(subtitle, theme.muted);
	if (input.align === "left") return [brandLine, subLine];
	return [center(brandLine, input.width), center(subLine, input.width)];
}
/**
* 环境检查紧凑行（欢迎页常驻）：`graphite · API Key ✓ · Git ✓`。
* 缺 API key 时该段换 warning 色并携带可行动提示（设 DEEPSEEK_API_KEY）；
* git ✗ 仅信息性展示。用「API Key」措辞（非 footer 的「API ✗」）。
* @param env - 环境检查结果（主题名/API key/git/对齐）。
* @param theme - 当前主题（muted；缺 key 段 warning）。
* @returns 单行 ANSI；cols ≤ 0 返回空数组。
*/
function formatEnvCheckLine(env, theme) {
	if (env.cols <= 0) return [];
	const sep = color(" · ", theme.muted);
	const api = env.hasApiKey ? color("API Key ✓", theme.muted) : color("API Key ✗（设 DEEPSEEK_API_KEY）", theme.warning);
	const git = color(`Git ${env.isGitRepo ? "✓" : "✗"}`, theme.muted);
	const line = `${color(env.themeName, theme.muted)}${sep}${api}${sep}${git}`;
	return [truncateToDisplayWidth(env.align === "left" ? line : center(line, env.cols), env.cols)];
}
/**
* 欢迎页右栏 Tips：标题 + 快捷键列对齐 + 说明。
* 不可用项整行 muted 且仍显示 keyHint（与旧菜单不同：tips 要让用户知道键还在）。
* 空 items 仍渲染标题（调用方恒有一组默认 tips）。
* @param input - 宽度、tips 项与对齐。
* @param theme - 当前主题（标题 brandColor，hint secondary，说明 muted）。
* @returns ANSI 行数组。
*/
function formatWelcomeTips(input, theme) {
	const { width, items } = input;
	if (width <= 0) return [];
	const budget = Math.max(0, width - 1);
	let hintCol = 0;
	for (const item of items) hintCol = Math.max(hintCol, displayWidth(item.keyHint));
	const rows = [];
	const title = color("Tips", theme.brandColor, { bold: true });
	rows.push(title);
	for (const item of items) {
		const hintPad = Math.max(0, hintCol - displayWidth(item.keyHint));
		const hintText = `${item.keyHint}${" ".repeat(hintPad)}`;
		const body = `${hintText}  ${item.label}`;
		const truncated = truncateTo$5(body, budget);
		if (item.available === false) {
			rows.push(color(truncated, theme.muted));
			continue;
		}
		const hintPart = color(hintText, theme.secondary);
		const labelPart = color(`  ${truncateTo$5(item.label, Math.max(0, budget - hintCol - 2))}`, theme.muted);
		rows.push(displayWidth(body) > budget ? color(truncated, theme.muted) : `${hintPart}${labelPart}`);
	}
	if (input.align === "center") {
		let blockW = 0;
		for (const row of rows) blockW = Math.max(blockW, displayWidth(row));
		blockW = Math.min(blockW, budget);
		const indent = " ".repeat(Math.max(0, Math.floor((width - blockW) / 2)));
		return rows.map((row) => truncateToDisplayWidth(`${indent}${row}`, budget));
	}
	return rows.map((row) => truncateToDisplayWidth(row, budget));
}
/** 左右栏间隙列数。 */
const HERO_GAP = 3;
/** 右栏 tips 放不下时回落叠放的最小宽度。 */
const TIPS_MIN_WIDTH = 18;
/**
* 欢迎英雄区：宽屏左鲸鱼/品牌/环境 + 右 Tips zip；窄屏垂直居中叠放。
* @param input - 终端宽、鲸鱼行、环境检查、tips 项。
* @param theme - 当前主题。
* @returns ANSI 行数组；width ≤ 0 返回空数组。
*/
function formatWelcomeHero(input, theme) {
	const { width, whale, tips } = input;
	if (width <= 0) return [];
	const env = {
		...input.env,
		cols: width
	};
	const stacked = () => {
		const out = [];
		if (whale.length > 0) {
			out.push(...whale);
			out.push("");
		}
		out.push(...formatBrandWelcome({
			width,
			align: "center"
		}, theme));
		out.push("");
		out.push(...formatEnvCheckLine({
			...env,
			cols: width,
			align: "center"
		}, theme));
		out.push("");
		out.push(...formatWelcomeTips({
			width,
			items: tips,
			align: "center"
		}, theme));
		return out;
	};
	if (width < 72) return stacked();
	const gutter = width >= 22 ? 2 : 0;
	const inner = width - gutter;
	const brand = formatBrandWelcome({
		width: inner,
		align: "left"
	}, theme);
	const envLeft = formatEnvCheckLine({
		...env,
		cols: inner,
		align: "left"
	}, theme);
	const whaleStripped = whale.map(stripLeadingSpaces);
	let leftW = 24;
	for (const line of [
		...whaleStripped,
		...brand,
		...envLeft
	]) leftW = Math.max(leftW, displayWidth(line));
	const rightW = inner - leftW - HERO_GAP;
	if (rightW < TIPS_MIN_WIDTH) return stacked();
	const leftCol = [];
	if (whaleStripped.length > 0) {
		leftCol.push(...whaleStripped);
		leftCol.push("");
	}
	leftCol.push(...brand);
	leftCol.push(...envLeft);
	const rightCol = formatWelcomeTips({
		width: rightW,
		items: tips,
		align: "left"
	}, theme);
	const rows = Math.max(leftCol.length, rightCol.length);
	const gap = " ".repeat(HERO_GAP);
	const pad = " ".repeat(gutter);
	const out = [];
	for (let i = 0; i < rows; i++) {
		const left = padTo(leftCol[i] ?? "", leftW);
		const right = rightCol[i] ?? "";
		out.push(truncateToDisplayWidth(`${pad}${left}${gap}${right}`, width));
	}
	return out;
}
//#endregion
//#region lib/types/format/top-bar.js
/**
* 顶部栏（format/top-bar.ts）— 纯渲染（C4 概念稿 A「航图」top bar）。
*
* 启动信息行：cwd + git 分支（可选）+ 模型（可选）。快捷键提示不在本行——
* 概念稿 A 的 shortcuts 行由底部 footer（format/prompt-footer.ts）承担。
* 段顺序（从前往后）：📁 cwd → model → (branch)；超宽时从后往前丢段
* （branch → model），最后只剩 cwd 仍超宽则截断加省略号。
* 分支段 brandColor 强调；📁 图标 ascii 档降级为 `~`（legacy 终端宽度稳定）。
* 宽度守恒：任何输入下每行显示宽度 ≤ width。
*/
function truncateTo$4(text, columns) {
	let out = "";
	for (const ch of text) {
		if (displayWidth(out + ch) > columns) break;
		out += ch;
	}
	return out;
}
/**
* 渲染顶部栏单行：段顺序 cwd → model → branch，超宽丢尾段。
* @param input - 宽度、cwd、可选分支/模型/ascii。
* @param theme - 当前主题（cwd secondary、分支 brandColor）。
* @returns 单行 ANSI；任何宽度下 ≤ width。
*/
function formatTopBar(input, theme) {
	const { width, cwd, branch, modelName, ascii } = input;
	const base = `${ascii === true ? "~" : "📁"} ${cwd}`;
	const tail = [];
	if (modelName !== void 0 && modelName !== "") tail.push(modelName);
	if (branch !== void 0 && branch !== "") tail.push(`(${branch})`);
	let segs = tail;
	for (;;) {
		if (displayWidth([base, ...segs].join(" · ")) <= width) {
			const parts = [color(base, theme.secondary)];
			for (const s of segs) parts.push(color(s, s.startsWith("(") ? theme.brandColor : theme.secondary));
			return [parts.join(" · ")];
		}
		if (segs.length === 0) break;
		segs = segs.slice(0, -1);
	}
	const ellipsis = "…";
	return [color(`${truncateTo$4(base, Math.max(1, width - displayWidth(ellipsis)))}${ellipsis}`, theme.secondary)];
}
//#endregion
//#region lib/types/format/turn-status.js
/**
* 状态行（format/turn-status.ts）— 纯渲染（C4 概念稿 A「航图」turn_status）。
*
* statusline 文本的活动态呈现：agent 运行中 → braille spinner（tick 驱动帧
* 循环）；等待输入 → pulsing ◆。statusText 为 null/空时不渲染（不占位）。
* ascii 档：spinner 降级 `*`、等待降级 `-`（legacy 终端宽度稳定）。
* 宽度守恒：statusText 超宽截断（spinner 前缀保留）。
*/
function truncateTo$3(text, columns) {
	let out = "";
	for (const ch of text) {
		if (displayWidth(out + ch) > columns) break;
		out += ch;
	}
	return out;
}
/**
* 渲染状态行：spinner（或 ◆）+ statusText。
* @param input - statusline 文本、tick、运行态、可选 ascii/width。
* @param theme - 当前主题（整行 primary 色）。
* @returns 单行 ANSI；无可渲染内容返回空数组。
*/
function formatTurnStatus(input, theme) {
	const { statusText, tick, active, ascii, width } = input;
	if (statusText === null || statusText === "") return [];
	let text = `${active ? ascii === true ? "*" : brailleSpinnerFrame(tick) : ascii === true ? "-" : "◆"} ${statusText}`;
	if (width !== void 0 && width > 0) text = truncateTo$3(text, width);
	return [color(text, theme.primary)];
}
//#endregion
//#region lib/types/format/chrome-colors.js
/**
* 输入轨 / footer 局部雾蓝（dsh-cc-tui Gentle Mist Blue dark）。
*
* 只给 chrome 用，不进 theme-palettes，避免改动全局主题与工具卡家族色。
* 来源：dsh-cc-tui `src/theme.ts` darkTheme.promptBorder / inactiveShimmer / subtle。
*/
/** 输入轨线（CC `promptBorder`）。 */
const CHROME_PROMPT_BORDER = "#55606F";
/** footer 模式字与右侧状态（CC `inactiveShimmer`）。 */
const CHROME_INACTIVE_SHIMMER = "#AAB2C2";
/** footer 快捷键提示（CC `subtle`）。 */
const CHROME_SUBTLE = "#5E6673";
/**
* 渲染底部 footer：mode 段 + 快捷键提示段，宽终端合并右侧状态段（右对齐）。
* @param input - 宽度、模式徽标与右侧状态段。
* @param theme - 当前主题（plan/auto 徽标走 warning/error；其余用雾蓝 chrome）。
* @returns 单行 ANSI；任何宽度下 ≤ width。
*/
function formatPromptFooter(input, theme) {
	const { width, planActive, planPending, alwaysApprove } = input;
	const mode = `normal${planPending === true ? " [plan…]" : planActive === true ? " [plan]" : ""}${alwaysApprove === true ? " [auto]" : ""}`;
	const modeColor = planPending === true || planActive === true ? theme.warning : alwaysApprove === true ? theme.error : CHROME_INACTIVE_SHIMMER;
	let segs = input.approvalPending === true ? [
		"y 允许",
		"n 拒绝",
		"a 放行",
		"esc 取消"
	] : [
		"Enter 发送",
		"/ 命令",
		"ctrl+p 面板"
	];
	for (;;) {
		const text = [mode, ...segs].join(" · ");
		if (displayWidth(text) <= width) {
			const parts = [color(mode, modeColor)];
			for (const s of segs) parts.push(color(s, CHROME_SUBTLE));
			const leftAnsi = parts.join(" · ");
			const right = input.rightSegments;
			if (right !== void 0 && right.length > 0 && width >= 80) return mergeRightSegments(leftAnsi, text, right, width);
			return [leftAnsi];
		}
		if (segs.length === 0) break;
		segs = segs.slice(0, -1);
	}
	return [color(mode, modeColor)];
}
/**
* 左侧 + 右侧状态段合并为一行（右对齐）；右段放不下时从后往前丢。
* @param leftAnsi - 已着色的左侧文本。
* @param leftPlain - 左侧纯文本（宽度度量用）。
* @param right - 右侧状态段（纯文本）。
* @param width - 目标行宽。
* @returns 合并后的单行 ANSI。
*/
function mergeRightSegments(leftAnsi, leftPlain, right, width) {
	let rightSegs = [...right];
	for (;;) {
		const rightPlain = rightSegs.join(" · ");
		const pad = Math.max(0, width - displayWidth(leftPlain) - displayWidth(rightPlain));
		if (pad > 0) {
			const rightAnsi = rightSegs.map((s) => color(s, CHROME_INACTIVE_SHIMMER)).join(" · ");
			return [`${leftAnsi}${" ".repeat(pad)}${rightAnsi}`];
		}
		/* v8 ignore next -- 不可达：width ≥ FOOTER_RIGHT_MERGE_MIN_WIDTH 且左侧 ≤ 43 字符时必能放下 1 个右段 */
		if (rightSegs.length === 0) return [leftAnsi];
		rightSegs = rightSegs.slice(0, -1);
	}
}
//#endregion
//#region lib/types/format/input-frame.js
/**
* 输入轨（format/input-frame.ts）— 纯渲染。
*
* Claude Code PromptInput 形态：`borderStyle=round` + `borderLeft/Right=false`。
* 只画上下两条圆角横线（╭─╮ / ╰─╯），输入行本身不包左右 `│`。
* 轨线色随模式：normal 雾蓝 promptBorder / plan warning / auto error。
* ascii 降级由 boxCharsFor 走 +---+。columns < 4 时不加轨，原样返回输入行。
*/
/**
* 渲染输入轨：顶轨 + 输入行（无左右竖线）+ 底轨。
* @param input - 列数、输入行、光标坐标与模式标志。
* @param theme - 当前主题（plan warning / auto error；normal 用雾蓝轨线）。
* @returns 轨线行数组与 caretLine+1；columns < 4 时原样返回输入行。
*/
function formatInputFrame(input, theme) {
	const { columns } = input;
	if (columns < 4) return {
		lines: [...input.lines],
		caretLine: input.caretLine,
		caretCol: input.caretCol
	};
	const chars = boxCharsFor(input.separator ?? "thin");
	const borderColor = input.planPending === true || input.planActive === true ? theme.warning : input.alwaysApprove === true ? theme.error : CHROME_PROMPT_BORDER;
	const inner = Math.max(0, columns - 2);
	const top = color(`${chars.tl}${chars.h.repeat(inner)}${chars.tr}`, borderColor);
	const bottom = color(`${chars.bl}${chars.h.repeat(inner)}${chars.br}`, borderColor);
	return {
		lines: [
			top,
			...input.lines.map((line) => truncateToDisplayWidth(line, columns)),
			bottom
		],
		caretLine: input.caretLine + 1,
		caretCol: input.caretCol
	};
}
/** label 列宽硬上限（对齐 grok slash_dropdown 的 LABEL_CAP）。 */
const LABEL_CAP = 40;
/** label 列占可用宽度的比例上限（对齐 grok 的 3/5，取 0.5 保描述空间）。 */
const LABEL_BUDGET_RATIO = .5;
function truncateTo$2(text, columns) {
	/* v8 ignore next -- 调用点保证 columns ≥ 1（labelW ≥ 1；descW ≥ 2 才调用） */
	if (columns <= 0) return "";
	let out = "";
	for (const ch of text) {
		if (displayWidth(out + ch) > columns) break;
		out += ch;
	}
	return out;
}
/** 滚动窗口起点：total > maxRows 时让 selected 尽量居中，两端 clamp。 */
function windowStart(selected, total, maxRows) {
	if (total <= maxRows) return 0;
	const maxStart = total - maxRows;
	return Math.max(0, Math.min(maxStart, selected - Math.floor((maxRows - 1) / 2)));
}
/**
* 渲染 slash 命令下拉菜单行数组。
* @param input - 宽度、菜单项、选中下标与行数上限。
* @param theme - 当前主题（选中 label primary+bold、未选中 muted、描述 muted）。
* @returns ANSI 行数组；items 为空或 width ≤ 0 返回空数组。
*/
function formatSlashMenu(input, theme) {
	const { width, items, selected } = input;
	if (width <= 0 || items.length === 0) return [];
	const ascii = input.ascii === true;
	const maxRows = input.maxRows !== void 0 && input.maxRows > 0 ? input.maxRows : 8;
	const total = items.length;
	if (width < 4) return [color(truncateTo$2(ascii ? "> " : "❯ ", width), theme.muted)];
	const start = windowStart(selected, total, maxRows);
	const visible = items.slice(start, start + maxRows);
	const labelTexts = visible.map((item) => item.argsHint !== void 0 ? `/${item.name} ${item.argsHint}` : `/${item.name}`);
	const labelBudget = Math.min(LABEL_CAP, Math.max(0, Math.floor((width - 2) * LABEL_BUDGET_RATIO)));
	const labelW = Math.min(labelBudget, Math.max(0, ...labelTexts.map((t) => displayWidth(t))));
	const out = [];
	visible.forEach((item, i) => {
		const isSel = start + i === selected;
		const prefix = isSel ? ascii ? "> " : "❯ " : "  ";
		const labelTrimmed = truncateTo$2(labelTexts[i] ?? "", labelW);
		const pad = Math.max(0, labelW - displayWidth(labelTrimmed));
		const descW = width - displayWidth(prefix) - labelW - 2;
		const desc = descW >= 2 ? truncateTo$2(item.description, descW) : "";
		const labelAnsi = color(`${prefix}${labelTrimmed}`, isSel ? theme.primary : theme.muted, isSel ? { bold: true } : void 0);
		const descAnsi = desc === "" ? "" : color(`  ${desc}`, theme.muted);
		out.push(`${labelAnsi}${" ".repeat(pad)}${descAnsi}`);
	});
	if (total > maxRows) out.push(color(truncateTo$2(`  ${ascii ? "^v" : "↑↓"} 还有 ${total - maxRows} 项`, width), theme.muted));
	return out;
}
//#endregion
//#region lib/types/format/subagent-line.js
/**
* subagent 对话流状态行（format/subagent-line.ts）— 纯渲染
* （grok scrollback/blocks/subagent.rs 移植，dsh 精简版）。
*
* 运行中：live 区动态行 `⠋ 子代理 <label>`（braille spinner 帧随 tick 变化）；
* 终态：提交 scrollback 的静态行 `✓ 子代理 <label> · 43s`（completed）、
* `◌ …`（aborted）、`✗ … · 12s (error)`（error/max-tokens/refusal 及
* merge-extensible 未知 reason）。宽度守恒、ascii 降级。
*/
function truncateTo$1(text, columns) {
	let out = "";
	for (const ch of text) {
		if (displayWidth(out + ch) > columns) break;
		out += ch;
	}
	return out;
}
/** 耗时 → 秒文本（一位小数，delegation-panel 同款）。 */
function formatElapsed(ms) {
	return `${(ms / 1e3).toFixed(1)}s`;
}
/**
* 渲染运行中状态行：`⠋ 子代理 <label>`（live 区动态帧）。
* @param input - 宽度、标签与帧计数。
* @param theme - 当前主题（整行 primary）。
* @returns 单行 ANSI；宽度守恒。
*/
function formatSubagentRunning(input, theme) {
	return [color(truncateTo$1(`${input.ascii === true ? "*" : brailleSpinnerFrame(input.tick ?? 0)} 子代理 ${input.label}`, input.width), theme.primary)];
}
/**
* 渲染终态状态行：`✓/◌/✗ 子代理 <label> · <耗时>[ (reason)]`（提交 scrollback）。
* completed → ✓ success；aborted → ◌ muted；其余（error/max-tokens/refusal/
* 未知）→ ✗ error 且带 reason 后缀（completed/aborted 无后缀）。
* @param input - 宽度、标签、耗时与终止原因。
* @param theme - 当前主题（状态标记着色；label 与耗时 muted）。
* @returns 单行 ANSI；宽度守恒（label 截断优先于 reason 后缀）。
*/
function formatSubagentDone(input, theme) {
	const { width, label, elapsedMs, stopReason } = input;
	const mark = stopReason === "completed" ? "✓" : stopReason === "aborted" ? "◌" : "✗";
	const markColor = stopReason === "completed" ? theme.success : stopReason === "aborted" ? theme.muted : theme.error;
	const suffix = stopReason === "completed" || stopReason === "aborted" ? "" : ` (${stopReason})`;
	const text = `${mark} 子代理 ${label} · ${formatElapsed(elapsedMs)}${suffix}`;
	return `${color(mark, markColor)}${color(truncateTo$1(text.slice(1), Math.max(0, width - displayWidth(mark))), theme.muted)}`;
}
//#endregion
//#region lib/types/format/spinner-status.js
/**
* 人类可读耗时：<60s 纯秒；否则 分+秒；负数按 0。
* @param ms - 毫秒耗时。
* @returns 形如 `42s` 或 `2m 5s` 的文本。
*/
function formatElapsedHuman(ms) {
	const s = Math.max(0, Math.floor(ms / 1e3));
	if (s < 60) return `${s}s`;
	return `${Math.floor(s / 60)}m ${s % 60}s`;
}
//#endregion
//#region lib/types/format/glance-bar.js
/**
* metrics 一行条（format/glance-bar.ts）— 纯渲染。
*
* segment 组装：model / effort / 缓存% / 上下文% / ◧ tokens / #turn / $cost / elapsed / 停滞。
* 窄宽 drop 尾部次要段；极窄截断 model 段；任何宽度下不破版。
*/
/**
* token 计数紧凑显示：<1000 原样；<1M 用 `k`（非整时留 1 位小数）；否则 `M` 留 2 位。
* @param n - token 数。
* @returns 紧凑计数文本。
*/
function formatTokenCount(n) {
	if (n < 1e3) return String(n);
	if (n < 1e6) {
		const v = n / 1e3;
		return Number.isInteger(v) ? `${v}k` : `${v.toFixed(1)}k`;
	}
	return `${(n / 1e6).toFixed(2)}M`;
}
/**
* 段组装（纯函数；返回 ANSI 段列表，外层按 ` · ` 拼接）。
* @param input - metrics 输入；仅组装已提供的段（turn/cost 只在 density full 档）。
* @returns 无色段文本列表，按固定顺序。
*/
function glanceBarSegments(input) {
	const segs = [];
	if (input.modelName !== void 0) segs.push(input.modelName);
	if (input.effort !== void 0) segs.push(`effort:${input.effort}`);
	if (input.cacheHitRate !== void 0) segs.push(`缓存 ${Math.round(input.cacheHitRate * 100)}%`);
	if (input.contextRatio !== void 0) segs.push(`上下文 ${Math.round(input.contextRatio * 100)}%`);
	if (input.tokens !== void 0) {
		const t = `${formatTokenCount(input.tokens.used)}/${formatTokenCount(input.tokens.max)}`;
		segs.push(input.ascii ? `[${t}]` : `◧ ${t}`);
	}
	if (input.elapsedMs !== void 0) segs.push(formatElapsedHuman(input.elapsedMs));
	if (input.density === "full") {
		if (input.turnCount !== void 0) segs.push(`#${input.turnCount}`);
		if (input.cost !== void 0) segs.push(`$${input.cost}`);
	}
	if (input.stalled) segs.push("停滞");
	return segs;
}
function truncateTo(text, columns) {
	let out = "";
	for (const ch of text) {
		if (displayWidth(out + ch) > columns) break;
		out += ch;
	}
	return out;
}
/**
* 一行条渲染：渐进 drop 次要段，极窄只剩 model 并截断；空 metrics 不占位。
* @param input - metrics 输入（width ≤ 0 或缺省时不渲染）。
* @param theme - 当前主题（整行 primary 色）。
* @returns 单行 live 区内容；无可渲染内容返回空数组。
*/
function formatGlanceBar(input, theme) {
	const width = input.width ?? 0;
	if (width <= 0) return [];
	let current = {
		...input,
		width
	};
	for (;;) {
		const segs = glanceBarSegments(current);
		if (segs.length === 0) return [];
		const text = segs.join(" · ");
		if (displayWidth(text) <= width) return [{ text: color(text, theme.primary) }];
		const next = { ...current };
		if (next.stalled) next.stalled = false;
		else if (next.elapsedMs !== void 0) delete next.elapsedMs;
		else if (next.cost !== void 0) delete next.cost;
		else if (next.turnCount !== void 0) delete next.turnCount;
		else if (next.tokens !== void 0) delete next.tokens;
		else if (next.contextRatio !== void 0) delete next.contextRatio;
		else if (next.cacheHitRate !== void 0) delete next.cacheHitRate;
		else if (next.effort !== void 0) delete next.effort;
		else return [{ text: color(truncateTo(next.modelName ?? "", width), theme.primary) }];
		current = next;
	}
}
//#endregion
//#region lib/types/format/memory-overlay.js
/**
* memory overlay — 记忆浏览器（P2 交互打磨）。
*
* 上下布局（终端宽度限制下左右分栏不友好）：上部为记忆列表（过滤后视口），
* 下部为选中项完整内容。交互：
* - ↑↓/j k：移动选中
* - 可打印字符：进过滤 query（text/tags 子串，大小写不敏感）
* - Backspace：退过滤
* - x：删除选中（异步执行 onDelete + refetch 刷新；注意：x/X 已专用于删除，
*   不进入过滤 query——只有字母数字/符号等非控制字符才进 query。若用户想输入
*   含 'x' 的过滤词，可用大写 'X' 代替——但 'X' 目前同 x 语义。后续可选：改为
*   dd 双键确认删除，释放单 x 给过滤。）
* - Ctrl+N/Ctrl+P：下/上一页（分页，每页 20 条）
* - Esc/Ctrl+C：关闭（装配方 deactivate）
*
* 数据源由装配方注入（TuiApp.openMemoryBrowser 经 memory 服务 list/delete），
* overlay 本身不碰 I/O——纯状态机 + 渲染（对齐 RewindOverlay 模式）。
*/
/** 每页条目数（与 grok-build memory 视图对齐：~20 条/页）。 */
const PAGE_SIZE = 20;
/** 记忆浏览器 overlay：过滤列表 + 选中项内容，删除/分页经装配方注入的回调（纯状态机 + 渲染，零 I/O）。 */
var MemoryBrowserOverlay = class {
	items = [];
	query = "";
	selected = 0;
	sources = null;
	/** 删除/翻页执行中（渲染占位，防连点）。 */
	deleting = false;
	/** 分页：是否还有更多页（setItems 装配方判定；翻页后按实拉条数刷新）。 */
	hasMore = false;
	theme;
	constructor(theme) {
		this.theme = theme ?? getTheme();
	}
	/**
	* 装配方提供条目快照 + 数据源回调；重复设置重置状态（回到首页）。
	* @param items - 首页条目快照。
	* @param sources - 删除/刷新/分页回调。
	* @param hasMore - 首页之后是否还有更多条目（Ctrl+N 翻页前提）。
	*/
	setItems(items, sources, hasMore) {
		this.items = items;
		this.sources = sources;
		this.query = "";
		this.selected = 0;
		this.deleting = false;
		this.hasMore = hasMore;
	}
	/** 过滤后的条目（query 为空 = 全量）。 */
	get filtered() {
		const needle = this.query.toLowerCase();
		if (needle === "") return this.items;
		return this.items.filter((item) => item.text.toLowerCase().includes(needle) || item.tags.some((tag) => tag.toLowerCase().includes(needle)));
	}
	/**
	* 处理按键；返回 true 表示已消费（Esc/Ctrl+C 由装配方关闭 overlay）。
	* @param name - 按键名（up/down/backspace/ctrl_n/ctrl_p/escape/ctrl_c 等）。
	* @param char - 可打印字符（j/k 移动，x/X 删除，其余进过滤 query）。
	* @returns 已消费时 true。
	*/
	handleKey(name, char) {
		if (this.deleting) return true;
		if (name === "up" || char === "k") {
			this.selected = Math.max(0, this.selected - 1);
			return true;
		}
		if (name === "down" || char === "j") {
			this.selected = Math.min(this.filtered.length - 1, this.selected + 1);
			return true;
		}
		if (name === "backspace") {
			if (this.query !== "") {
				this.query = this.query.slice(0, -1);
				this.selected = Math.min(this.selected, Math.max(0, this.filtered.length - 1));
			}
			return true;
		}
		if (char === "x" || char === "X") {
			this.deleteSelected();
			return true;
		}
		if (name === "ctrl_n") {
			this.nextPage();
			return true;
		}
		if (name === "ctrl_p") {
			this.prevPage();
			return true;
		}
		if (char !== "" && char !== " ") {
			this.query += char;
			this.selected = 0;
			return true;
		}
		return name === "escape" || name === "ctrl_c";
	}
	/** 删除当前选中项（异步：onDelete + refetch 刷新；失败静默保持列表）。 */
	async deleteSelected() {
		const sources = this.sources;
		const item = this.filtered[this.selected];
		if (sources === null || item === void 0) return;
		this.deleting = true;
		try {
			await sources.onDelete(item.id);
			this.items = await sources.refetch();
			this.selected = Math.min(this.selected, Math.max(0, this.filtered.length - 1));
		} finally {
			this.deleting = false;
		}
	}
	/** 下一页（异步拉取，加载中静默）。offset 语义 = 已加载条数（fetchPage
	* 跳过前 N 条）；成功后 hasMore 按实拉条数刷新（满页 = 可能还有）。 */
	async nextPage() {
		const sources = this.sources;
		if (sources === null || !this.hasMore) return;
		this.deleting = true;
		try {
			const nextOffset = this.items.length;
			const page = await sources.fetchPage(nextOffset, PAGE_SIZE);
			if (page.length > 0) {
				this.items = [...this.items, ...page];
				this.hasMore = page.length >= PAGE_SIZE;
				this.selected = Math.min(this.selected, Math.max(0, this.filtered.length - 1));
			}
		} finally {
			this.deleting = false;
		}
	}
	/** 上一页（Ctrl+P：无条件回到首页——fetchPage(0, limit) 覆盖为首页，幂等）。 */
	async prevPage() {
		const sources = this.sources;
		if (sources === null) return;
		this.deleting = true;
		try {
			const page = await sources.fetchPage(0, PAGE_SIZE);
			this.items = page;
			this.hasMore = page.length >= PAGE_SIZE;
			this.selected = 0;
		} finally {
			this.deleting = false;
		}
	}
	render(width, height) {
		const theme = this.theme;
		const contentWidth = Math.max(1, width - 2);
		if (this.items.length === 0) return [
			color("🧠 memory", theme.secondary),
			color("（暂无记忆）", theme.muted),
			color("用 /remember <text> 保存第一条", theme.muted)
		];
		if (this.deleting) return [color("🧠 memory", theme.secondary), color("删除中…", theme.muted)];
		const filtered = this.filtered;
		const rows = [color(`🧠 memory${this.query === "" ? "" : ` · filter: ${this.query}`}（${filtered.length}/${this.items.length} 条）`, theme.secondary)];
		if (filtered.length === 0) {
			rows.push(color("（无匹配条目——Backspace 清除过滤）", theme.muted));
			rows.push(color("─".repeat(contentWidth), theme.muted));
			rows.push(color("↑↓ 选择 · 输入过滤 · x 删除 · Ctrl+N/P 翻页 · Esc 关闭", theme.muted));
			return rows;
		}
		const listHeight = Math.max(1, Math.floor((height - 3) / 2));
		const offset = Math.max(0, Math.min(this.selected - listHeight + 1, filtered.length - listHeight));
		for (let i = offset; i < Math.min(offset + listHeight, filtered.length); i++) {
			const item = filtered[i];
			if (item === void 0) continue;
			const sel = i === this.selected;
			const firstLine = (item.text.split("\n")[0] ?? "").replace(/\n/g, " ");
			const tags = item.tags.length > 0 ? ` #${item.tags.join(" #")}` : "";
			const line = truncateToDisplayWidth(`[${item.id.slice(0, 8)}] ${firstLine}${tags}`, contentWidth - 2);
			rows.push(sel ? color(`▸ ${line}`, theme.success) : `  ${line}`);
		}
		rows.push(color("─".repeat(contentWidth), theme.muted));
		const selected = filtered[this.selected];
		if (selected !== void 0) {
			const remaining = Math.max(1, height - rows.length - 2);
			const contentLines = selected.text.split("\n");
			for (let i = 0; i < Math.min(remaining, contentLines.length); i++) {
				const line = contentLines[i];
				if (line !== void 0) rows.push(truncateToDisplayWidth(line, contentWidth));
			}
			if (contentLines.length > remaining) rows.push(color(`…（共 ${contentLines.length} 行）`, theme.muted));
		}
		rows.push(color("↑↓ 选择 · 输入过滤 · x 删除 · Ctrl+N/P 翻页 · Esc 关闭", theme.muted));
		return rows;
	}
};
//#endregion
//#region lib/types/ui/app.js
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
/** Wave 2：renderLive 7 面板纯函数 + 单帧快照类型（app.ts → render/ 单向依赖）。 */
/** Phase 8：审批 answerer 的请求/结果类型由 ApprovalController 持有（单向依赖）。 */
/** live 区预留行（顶轨 + 输入 + 底轨 + footer）。 */
const LIVE_RESERVED_ROWS = 4;
/** C3 项 3：写工具名判定（与 fs-snapshot 的 trackEdit 钩子同一集合）。 */
function isWriteToolCall(name) {
	return name === "write" || name === "edit" || name === "str_replace_editor";
}
/**
* 提交前规范化图片数组：只保留合法 data URL（parseImageDataUrl 校验），
* 截断到 MAX_IMAGES 上限。空/全非法返回 undefined（与无图提交同形）。
* @param images - 输入框携带的图片 data URL 列表
* @returns 规范化后的图片列表；无有效图片时 undefined
*/
function normalizeSubmitImages(images) {
	if (images === void 0 || images.length === 0) return void 0;
	const valid = images.filter((u) => parseImageDataUrl(u) !== null).slice(0, 4);
	return valid.length === 0 ? void 0 : valid;
}
/** 检测当前目录是否为 git 仓库（静默，失败返回 false）。 */
function isGitRepo() {
	try {
		execSync("git rev-parse --is-inside-work-tree", {
			stdio: "pipe",
			encoding: "utf-8"
		});
		return true;
	} catch {
		return false;
	}
}
/**
* 读取当前 git 分支（C4 概念稿 A top bar；attach 时一次，静默）。
* detached HEAD 或非仓库返回 undefined（不渲染分支段）。
*/
function gitBranch() {
	try {
		const out = execSync("git rev-parse --abbrev-ref HEAD", {
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			encoding: "utf-8"
		}).trim();
		return out === "" || out === "HEAD" ? void 0 : out;
	} catch {
		return;
	}
}
/** 命令 → InputController 提示条目的投影（slash hint / Tab 补全数据源）。 */
function toSlashHint(command) {
	return {
		name: command.name,
		description: command.description,
		...command.argsHint === void 0 ? {} : { argsHint: command.argsHint }
	};
}
/**
* 会话界面主装配。生命周期：构造 → attach()（接管终端）→ dispose()（恢复终端）。
* attach 前不写终端；dispose 后终端恢复 raw-mode 前状态。
*/
var TuiApp = class {
	ctx;
	stdout;
	stdin;
	commit;
	live;
	input;
	inputLine;
	resize;
	blockWriter;
	streamRenderer;
	/** 渲染性能监测（--debug-perf / RIVET_DEBUG_TELEMETRY=1 时激活；默认零开销）。 */
	perfMonitor;
	/** 输入状态控制器（slash 提示 / Tab 补全数据源，W-B5 提取的输入状态）。 */
	inputController;
	/** Slash 命令注册表：内置命令 + 'tui.commands' 服务面（外部插件可扩展）。 */
	slash;
	/** Ctrl+P 命令面板（overlay 渲染经 OverlayController 进出 alt screen）。 */
	palette = null;
	/** API key 就绪标志（footer 右侧段；attach 时经 credentials.describe 刷新）。 */
	apiKeyReady = Boolean(process.env.DEEPSEEK_API_KEY);
	overlay = null;
	/** C3 项 3：rewind overlay（/rewind 双阶段回退面板）。 */
	rewindOverlay = null;
	/** P2：memory 浏览器 overlay（/memory 记忆列表/过滤/删除）。 */
	memoryOverlay = null;
	/** Phase 9d：流利度追踪（tool 事件 → 渲染策略；stale 提示消费于 renderLive）。 */
	fluency = new FluencyTracker();
	/** Phase 5.3：底部 glance（状态/错误行派生 + 节流；renderLive 消费 current()）。 */
	glance;
	/** Phase 5.3：glance metrics 行的 model 名缓存（会话挂载时更新一次；
	*  renderLive 每帧读缓存，不重复查询 agentDefaultModel——模型定路是
	*  mount 时的决策，渲染不该引入额外的 currentSelection 读取）。 */
	glanceModelName = null;
	/** 推理努力度缓存（挂载时 request/header 优先、currentSelection 兜底；
	*  request/header 事件更新——与 glanceModelName 同生命周期）。 */
	glanceEffort = null;
	/** 会话内最后一条 assistant/message 的 usage（缓存命中/上下文占比数据源；
	*  streamFeed 折叠，随会话挂载/卸载）。 */
	usageFold = null;
	/** 当前模型路由的上下文窗口（request/context 事件折叠；adapter 未报时 null）。 */
	contextWindow = null;
	transcript = null;
	liveAgent = null;
	controls = null;
	/** 工作流阶段/活动投影（Phase 5.1/6.2）；随会话挂载/卸载，dispose 时解绑订阅。 */
	statusLine = null;
	/** 流式提交供给的 session/event 订阅；随会话挂载/卸载。 */
	streamFeed = null;
	/** 本层经 create/resume 铸造的 handle；非 registry 兜底的裸 agent。dispose 时释放。 */
	ownedHandle = null;
	initialSessionId;
	themeName;
	onExit;
	/** 外部编辑器触发键（Phase 6.4）；缺省 ctrl_e（ctrl+o 已恢复为推理展开）。 */
	editorKey;
	/** 外部编辑器命令注入（测试用）；缺省走环境变量/平台缺省。 */
	editorCommand;
	vimEnabled;
	/** T1.1：5 域投影缓存（snapshot 全量 + onChanged 按 key 分流；服务缺失时为 null → 整体降级）。 */
	projectionCache = null;
	/** T4：任务窗格——sessionProjections 任务单元投影快照（服务缺失时为 null）。 */
	taskItems = null;
	/** T4：任务窗格显隐（/tasks 切换）。 */
	taskPanelVisible = false;
	/** T2.1：委派树面板显隐（/subagents 切换）。 */
	subagentsPanelVisible = false;
	/** T2.2：workflow 运行中面板显隐（/workflow 切换）。 */
	workflowPanelVisible = false;
	/** T2.1：委派树缓存（listDescendants 预取 + subagent/start|end 事件刷新；
	*  null = subagents 服务缺失/未预取 → 面板降级不可用）。 */
	delegationEntries = null;
	/** 对话流 subagent 运行态（runId → 标签/开始时间；end 时结算并提交 scrollback）。 */
	subagentRuns = /* @__PURE__ */ new Map();
	/** T2.2：运行中 workflow 缓存（key = payload.id；start 建、end 移除）。 */
	workflowRuns = /* @__PURE__ */ new Map();
	/** T2.2：已结算 run 视图缓存（workflow/end 折叠；/workflow 面板渲染运行中+已完成）。 */
	completedWorkflowRuns = /* @__PURE__ */ new Map();
	/** T2.3：后台任务同步快照（tasks.list() 每次事件/会话挂载刷新）。 */
	taskSnapshots = [];
	/** T2.3：onTaskDone 完成通知（live 区提示行；一次性，渲染后清空）。 */
	taskNotice = null;
	/** T3.2：/config 设置面板显隐（/config 切换）。 */
	configPanelVisible = false;
	/** T3.2：/config 面板投影缓存（settings describe + permission + credentials；null = 服务缺失）。 */
	configProjection = null;
	/** T3.3：/skills 面板显隐（/skills 切换）。 */
	skillsPanelVisible = false;
	/** T3.3：skill 快照缓存（ctx.skills.list；空数组 = 无技能或未加载）。 */
	skillItems = [];
	/** T3.1：userQuestions provider 注册 disposer；attach 注册、dispose 释放。 */
	interactionDisposer = null;
	/** T3.1：挂起提问状态机（pendingQuestion + questionFeedbackMode；Wave 1 提取）。 */
	question;
	/** C3 项 4：审批挂起状态机（pendingApproval + alwaysApprove；Wave 1 提取）。 */
	approval;
	/** P1：/btw 侧问状态机（临时 btw agent 旁路；Esc 折叠答案入 scrollback）。 */
	btw;
	/** P3：多会话快照层（live store 派生；tab 栏数据源）。 */
	sessionManager;
	/** T2.1：subagent 生命周期事件订阅 disposer；随会话挂载/卸载。 */
	subagentDisposer = null;
	/** T2.2：workflow 事件订阅 disposer；attach 订阅、dispose 释放（跨会话运行）。 */
	workflowDisposer = null;
	/** T2.3：tasks onTaskDone 订阅 disposer；随会话挂载/卸载。 */
	taskDoneDisposer = null;
	/** T2.3：tasks attachSurface('tui') 控制面 disposer；attach 声明、dispose 释放。 */
	taskSurfaceDisposer = null;
	/** T1.4：plan 投影 active 态（驱动 statusline [plan] 徽标；服务缺失时为 false）。 */
	planState = {
		active: false,
		pending: false
	};
	/** C2 项 4：当前会话的模型选择 ref（newSession/switchSession 挂载；registry 兜底为 null）。 */
	modelRef = null;
	/** C2 项 2：历史搜索 overlay（Ctrl+F；attach 时注册，消息快照激活时提供）。 */
	searchOverlay = null;
	/** T1.2：/status 面板显隐（/status 切换；数据源为投影缓存）。 */
	statusPanelVisible = false;
	/** T4：任务投影变更订阅 disposer；随会话卸载释放。 */
	projectionDisposer = null;
	/** T5：紧凑渲染模式（/density 切换）——工具卡仅标题行。 */
	compactMode = false;
	/** reasoning 流缓冲（reasoning-delta 累积）；段结束 commitReasoningBlock 落底清空。 */
	reasoningText = "";
	/** 当前推理段起点（首个 reasoning-delta 的事件时间，Unix epoch ms）；live/落底耗时数据源。 */
	reasoningStartedAt = null;
	/** 最近一次已落底推理块（折叠头行 + 保留全文；Ctrl+O 展开查看）。会话切换清理。 */
	lastReasoningBlock = null;
	/** Ctrl+O 展开/收起最近推理块（live 区展示全文；scrollback 保持折叠头行）。 */
	reasoningExpanded = false;
	/** 进行中工具的 presentCall 标题覆盖（callId → title）；result/abort/换会话清理。 */
	pendingCallTitles = /* @__PURE__ */ new Map();
	activeSessionId = null;
	history = [];
	tick = 0;
	ticker = null;
	disposed = false;
	/** bracketed paste 处理器 disposer（attach 注册，dispose 释放）。 */
	pasteDisposer = null;
	/** 渲染帧合并器：事件路径走 schedule（16ms 合并），critical 路径走 flushLiveRender。 */
	renderBatcher;
	/** 上次输入框获得焦点的时间戳（Ctrl+V 剪贴板读图防抖；overlay 关闭后
	*  FOCUS_DEBOUNCE_MS 内走文本路径，避免把 overlay 里的图误附进输入框）。 */
	lastInputFocusAt = 0;
	/** 主控模型是否原生支持识图（图片附件气泡提示；装配方经 options.vision 注入）。 */
	supportsVision = false;
	/** 是否配置独立识图桥模型（主控不识图时经桥转文字描述后发送）。 */
	visionBridgeEnabled = false;
	/** 识图桥来源（'configured' / 'auto' / 'none'；气泡提示文案用）。 */
	visionBridgeSource;
	constructor(options) {
		this.ctx = options.ctx;
		this.stdout = options.stdout;
		this.stdin = options.stdin;
		this.initialSessionId = options.initialSessionId;
		this.themeName = options.theme ?? "auto";
		this.onExit = options.onExit;
		this.editorKey = options.editorKey ?? "ctrl_e";
		this.editorCommand = options.editorCommand;
		this.vimEnabled = options.vimEnabled ?? false;
		this.supportsVision = options.vision?.supportsVision ?? false;
		this.visionBridgeEnabled = options.vision?.bridgeEnabled ?? false;
		this.visionBridgeSource = options.vision?.bridgeSource;
		this.commit = new CommitEngine({ stdout: options.stdout });
		this.live = new LiveEngine({
			stdout: options.stdout,
			reservedRows: LIVE_RESERVED_ROWS,
			maxRows: Math.max(8, options.stdout.rows - 1)
		});
		this.input = new InputHandler({
			stdin: options.stdin,
			mode: "input"
		});
		this.inputLine = new InputLine({
			history: this.history,
			vimEnabled: this.vimEnabled,
			onSubmit: (text, images) => {
				this.handleSubmit(text, images);
			},
			onTabComplete: () => this.handleTabComplete(),
			onChange: (value) => {
				this.inputController.refreshSlash(value);
			}
		});
		this.resize = new ResizeHandler({ stdout: options.stdout });
		this.renderBatcher = new WriteBatcher(() => {
			this.renderLive();
		});
		this.blockWriter = new BlockStreamWriter({
			minChars: 60,
			maxChars: 200,
			idleMs: 180
		}, (block) => {
			/* v8 ignore next -- BlockStreamWriter flush 的 block 恒非空，push 恒返回 true */
			if (!this.streamRenderer.push(block)) this.renderBatcher.schedule();
		});
		this.perfMonitor = new TuiPerfMonitor({ enabled: isTuiPerfEnabled() });
		this.streamRenderer = new StreamRenderer({
			commit: (ansi) => {
				this.commitToScrollback({
					text: ansi,
					trailingNewline: true
				});
				this.renderBatcher.schedule();
			},
			getColumns: () => this.stdout.columns,
			getTheme: () => getTheme(),
			getThemeKey: () => "tui-conversation",
			perfMonitor: this.perfMonitor
		});
		this.inputController = new InputController();
		this.slash = new SlashCommandRegistry();
		for (const command of createBuiltinCommands({
			newSession: () => this.newSession(),
			forkSession: () => this.forkSession(),
			switchLiveModel: (selection) => this.switchLiveModel(selection),
			clearScrollback: () => {
				this.commit.reset();
			},
			toggleTaskPanel: () => {
				this.taskPanelVisible = !this.taskPanelVisible;
				this.renderBatcher.schedule();
			},
			toggleSubagentsPanel: () => {
				this.subagentsPanelVisible = !this.subagentsPanelVisible;
				this.renderBatcher.schedule();
			},
			toggleWorkflowPanel: () => {
				this.workflowPanelVisible = !this.workflowPanelVisible;
				this.renderBatcher.schedule();
			},
			rewindSession: () => this.rewindSession(),
			askBtw: (question) => this.askBtw(question),
			openMemoryBrowser: () => this.openMemoryBrowser(),
			switchSession: (id) => this.switchSession(SessionId(id)),
			exportTranscript: (path) => this.exportTranscript(path)
		})) this.slash.register(command);
		this.slash.register({
			name: "steer",
			description: "中轮转向（中途纠正方向）",
			argsHint: "<text>",
			run: (args) => {
				this.handleSteer(args.text);
			}
		});
		this.slash.register({
			name: "status",
			description: "切换状态面板（投影总线 5 域快照）",
			run: () => {
				this.statusPanelVisible = !this.statusPanelVisible;
				this.renderBatcher.schedule();
			}
		});
		this.slash.register({
			name: "config",
			description: "切换设置面板（settings/permission/credentials）",
			run: () => {
				this.configPanelVisible = !this.configPanelVisible;
				if (this.configPanelVisible) this.refreshConfigProjection();
				this.renderBatcher.schedule();
			}
		});
		this.slash.register({
			name: "skills",
			description: "切换技能浏览面板",
			run: () => {
				this.skillsPanelVisible = !this.skillsPanelVisible;
				if (this.skillsPanelVisible) this.refreshSkillItems();
				this.renderBatcher.schedule();
			}
		});
		this.slash.register({
			name: "density",
			description: "切换紧凑渲染模式（工具卡仅标题行）",
			run: () => {
				this.compactMode = !this.compactMode;
				this.renderBatcher.schedule();
			}
		});
		this.inputController.slashCommands = this.slash.list().map(toSlashHint);
		this.ctx.provide("tui.commands", this.slash);
		this.glance = new MetricsGlanceController({
			getStatusText: () => this.statusLine?.current ?? null,
			getLiveState: () => this.liveAgent?.state,
			getColumns: () => this.stdout.columns,
			throttleMs: 0
		});
		this.question = new QuestionController({
			onEscapeImmediate: (flag) => {
				this.input.setEscapeImmediate(flag);
			},
			onChanged: () => {
				this.flushLiveRender();
			}
		});
		this.approval = new ApprovalController({
			getCurrentSessionId: () => this.activeSessionId,
			onChanged: () => {
				this.flushLiveRender();
			}
		});
		this.btw = new BtwController({
			ctx: this.ctx,
			activeSessionId: () => this.activeSessionId,
			onChanged: () => {
				this.flushLiveRender();
			},
			onAnswer: (entry) => {
				this.commitToScrollback({
					text: `[btw] ${entry.question}\n${entry.answer}`,
					trailingNewline: true
				});
			}
		});
		this.sessionManager = new SessionManager(this.ctx);
	}
	/** Phase 8：审批 answerer 订阅的 disposer（dispose 时解绑）。 */
	approvalDisposer = null;
	/** 当前会话 id（null = 尚未 attach）。 */
	get sessionId() {
		return this.activeSessionId;
	}
	/**
	* 接管终端：切主题（'auto' 探测背景）、装配会话、注册键路由与 resize、启动渲染 ticker。
	* @param initialSessionId - 覆盖构造选项的起始会话；缺省用构造 initialSessionId，
	*   再缺省恢复最近会话（live store 为空才新建）。
	*/
	async attach(initialSessionId) {
		if (this.disposed) throw new Error("TuiApp already disposed");
		this.stdout.write(ANSI.BRACKETED_PASTE_ON);
		this.pasteDisposer?.();
		this.pasteDisposer = this.input.onPaste((text) => {
			this.handlePaste(text);
		});
		if (this.themeName === "auto") {
			/* v8 ignore next -- autoThemeFor 恒返回有效主题名，setTheme 恒 true，graphite 兜底不可达 */
			if (!setTheme(autoThemeFor(await detectTerminalBackground()))) setTheme("graphite");
		} else setTheme(this.themeName);
		const target = initialSessionId ?? this.initialSessionId ?? this.ctx.sessions.list()[0]?.id;
		if (target !== void 0) await this.switchSession(target);
		else await this.newSession();
		await this.renderRestorableSessions();
		this.resize.onResize(() => {
			this.live.setMaxRows(Math.max(8, this.stdout.rows - 1));
			this.flushLiveRender();
		});
		this.input.onAnyKey((key) => {
			this.handleKey(key);
		});
		this.approvalDisposer?.();
		this.approvalDisposer = this.ctx.on("approval/request", (req, next) => {
			return this.handleApprovalRequest(req, next);
		});
		this.palette = new CommandPalette({
			getCommands: () => this.slash.list(),
			getTheme: () => this.theme
		});
		this.overlay = new OverlayController({
			stdout: this.stdout,
			getSize: () => ({
				cols: this.stdout.columns,
				rows: this.stdout.rows
			}),
			live: this.live,
			onOverlayChange: () => {
				this.renderBatcher.schedule();
			}
		});
		this.overlay.register("command-palette", this.palette);
		this.overlay.register("keymap", { render: (cols) => renderKeymapPanel(cols) });
		this.searchOverlay = new HistorySearchOverlay();
		this.overlay.register("search", this.searchOverlay);
		this.rewindOverlay = new RewindOverlay();
		this.overlay.register("rewind", this.rewindOverlay);
		this.memoryOverlay = new MemoryBrowserOverlay();
		this.overlay.register("memory", this.memoryOverlay);
		this.input.setMode("input");
		this.ticker = setInterval(() => {
			this.tick++;
			this.renderLive();
		}, 120);
		this.ticker.unref();
		this.interactionDisposer?.();
		const userQuestions = this.ctx.reflect.get("userQuestions", false);
		if (userQuestions !== void 0) this.interactionDisposer = userQuestions.registerProvider({ ask: (request) => this.handleQuestionRequest(request) });
		this.flushLiveRender();
	}
	/** T3.1：结构化提问 answerer——薄转发 QuestionController（渲染/ESC/重绘由控制器回调承担）。 */
	handleQuestionRequest(request) {
		return this.question.ask(request);
	}
	/**
	* bracketed paste 文本落地（右键粘贴/终端菜单粘贴）：先尝试剪贴板读图
	* （命中则附图并吞掉这段 paste——粘贴进来的文本是图片字节的乱码，不插图
	* 会污染输入框）；再识别图片路径加载为附件；最后才是普通文本插入。
	* @param text - 终端传来的粘贴文本
	*/
	async handlePaste(text) {
		if (this.inputLine.images.length < 4) try {
			const imgResult = await readImageFromClipboard();
			if (imgResult) {
				this.inputLine.addImage(imgResult.dataUrl);
				this.flushLiveRender();
				return;
			}
		} catch {}
		const trimmed = text.trim();
		if (trimmed && looksLikeImagePath(trimmed) && !trimmed.includes("\n")) {
			if (this.inputLine.images.length >= 4) {
				this.commitToScrollback({
					text: color(`⚠ 最多附加 4 张图片`, this.theme.warning),
					trailingNewline: true
				});
				this.flushLiveRender();
				return;
			}
			try {
				const attachment = await loadImageAttachment(resolve(trimmed));
				this.inputLine.addImage(attachment.dataUrl);
				this.flushLiveRender();
				return;
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				this.commitToScrollback({
					text: color(`⚠ 图片加载失败: ${message}`, this.theme.warning),
					trailingNewline: true
				});
				this.flushLiveRender();
			}
		}
		this.inputLine.insertText(text);
		this.flushLiveRender();
	}
	/**
	* Ctrl+V 处理：优先读剪贴板图片 → 失败则 fallback 到文本粘贴。
	* 焦点防抖：输入框在最近 FOCUS_DEBOUNCE_MS 内刚获得焦点时跳过读图
	* （编辑器/overlay 切回后 1s 内的 Ctrl+V 大概率是文本操作）。
	*/
	async handleCtrlV() {
		if (Date.now() - this.lastInputFocusAt < 1e3) {
			const text = await readTextFromClipboard();
			if (text) {
				this.inputLine.insertText(text);
				this.flushLiveRender();
			}
			return;
		}
		try {
			const result = await readImageFromClipboard();
			if (result) {
				if (this.inputLine.images.length >= 4) {
					this.commitToScrollback({
						text: color(`⚠ 最多附加 4 张图片`, this.theme.warning),
						trailingNewline: true
					});
					this.flushLiveRender();
					return;
				}
				this.inputLine.addImage(result.dataUrl);
				this.flushLiveRender();
				return;
			}
		} catch {}
		const text = await readTextFromClipboard();
		if (text) {
			this.inputLine.insertText(text);
			this.flushLiveRender();
		}
	}
	/**
	* 设置当前主控模型的识图能力与桥接状态（图片附件气泡提示数据源）。
	* 由装配方按 agent 配置注入；TUI 是纯表现层，不自行查询模型能力。
	* @param supportsVision - 主控模型是否原生支持识图（图片直发）
	* @param bridgeEnabled - 是否配置了独立识图桥模型（主控不识图时经桥转描述）
	* @param bridgeSource - 识图桥来源（configured/auto/none；气泡提示文案用）
	*/
	setVisionInfo(supportsVision, bridgeEnabled, bridgeSource) {
		this.supportsVision = supportsVision;
		this.visionBridgeEnabled = bridgeEnabled;
		this.visionBridgeSource = bridgeSource;
	}
	/** T3.1：结算挂起的提问（用户选择/取消）——薄转发。 */
	settleQuestion(answer) {
		this.question.settle(answer);
	}
	/** T3.1：取消挂起的提问（Esc/Ctrl+C）——薄转发。 */
	cancelQuestion() {
		this.question.cancel();
	}
	/**
	* 查 DEEPSEEK_API_KEY 是否已配置：优先 credentials.describe（含 file / .env 层），
	* 服务缺失或抛错时回退 process.env。欢迎页与 footer 共用，避免只看环境变量的误报。
	*/
	async refreshApiKeyReady() {
		const credentials = this.ctx.reflect.get("credentials", false);
		if (credentials !== void 0) try {
			const info = await credentials.describe("DEEPSEEK_API_KEY");
			this.apiKeyReady = info.configured;
			return;
		} catch {}
		this.apiKeyReady = Boolean(process.env.DEEPSEEK_API_KEY);
	}
	/**
	* Phase 9b：把可恢复会话列表写进 scrollback（启动时）。
	* 排除当前活跃会话；无其他可恢复会话时静默（不占位）。
	* live 标注取 live store（listSessions 的 header 无 live 字段，
	* 经 ctx.sessions.list() 的 id 集合判定）。
	*/
	async renderRestorableSessions() {
		await this.refreshApiKeyReady();
		const cols = this.stdout.columns;
		const gutter = cols >= 12 ? 2 : 0;
		const commitLine = (text) => {
			this.commitToScrollback({ text });
		};
		const current = this.ctx.agentDefaultModel.currentSelection();
		const branch = gitBranch();
		for (const line of formatTopBar({
			width: cols - gutter,
			cwd: process.cwd(),
			modelName: `${current.provider}/${current.model}`,
			...branch === void 0 ? {} : { branch }
		}, this.theme)) commitLine(gutter > 0 ? `${" ".repeat(gutter)}${line}` : line);
		const active = this.activeSessionId;
		const others = (await listSessions(this.ctx)).filter((s) => s.id !== active);
		const env = {
			hasApiKey: this.apiKeyReady,
			isGitRepo: isGitRepo(),
			themeName: getActiveThemeName(),
			cols
		};
		const recent = others[0];
		const resumeAvailable = others.length > 0;
		const resumeLabel = recent === void 0 ? "恢复会话" : `恢复 · ${formatSessionAge(recent.createdAt, Date.now())}`;
		const whale = formatWhaleLogo({
			width: cols,
			rows: this.stdout.rows
		});
		commitLine("");
		const tips = [
			{
				keyHint: "ctrl+n",
				label: "新会话"
			},
			{
				keyHint: "ctrl+s",
				label: resumeLabel,
				available: resumeAvailable
			},
			{
				keyHint: "ctrl+p",
				label: "命令面板"
			},
			{
				keyHint: "/",
				label: "slash 命令"
			},
			{
				keyHint: "ctrl+o",
				label: "展开推理"
			},
			{
				keyHint: "shift+tab",
				label: "模式循环"
			}
		];
		for (const line of formatWelcomeHero({
			width: cols,
			whale,
			env,
			tips
		}, this.theme)) commitLine(line);
		commitLine("");
	}
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
	async newSession() {
		await this.detachProjections({ keepHandle: true });
		const id = SessionId(`session-${randomUUID()}`);
		const selection = this.ctx.agentDefaultModel.currentSelection();
		this.modelRef = {
			current: selection,
			assembled: void 0
		};
		const ref = this.modelRef;
		const handle = await this.ctx.agents.create({
			sessionId: id,
			meta: { cwd: process.cwd() },
			agentOptions: {
				provider: selection.provider,
				model: selection.model
			},
			setup: (agentCtx) => {
				installModelSelection(agentCtx, ref);
			}
		});
		this.ownedHandle = handle;
		this.controls = controlsFromHandle(handle);
		this.activeSessionId = id;
		this.mountSession(id);
		return id;
	}
	/**
	* C2 项 4：热切当前会话的模型。改 modelRef.current——下一次 agent 步进
	* （prompt assembly）自动生效，不中断当前步骤。registry 兜底的会话
	* （ref 由其他装配方持有）返回 false，调用方提示不可热切。
	* @param selection - 新的 provider/model。
	* @returns 是否已热切（modelRef 存在）。
	*/
	switchLiveModel(selection) {
		if (this.modelRef === null) return false;
		this.modelRef.current = selection;
		return true;
	}
	/**
	* A3：分叉当前会话（SessionStore.fork 复制历史到新 child session，带
	* parentSession 血缘）并切换到分叉（agent-ensure 走 switchSession 的
	* resume/registry 兜底路径）。无活跃会话时抛错（命令分发层回显失败）。
	* @param opts - 可选 directive：fork 后作为首条消息提交给新会话（分叉探索方向）。
	* @returns 分叉会话 id。
	*/
	async forkSession(opts) {
		if (this.activeSessionId === null) throw new Error("当前无会话可分叉");
		const child = this.ctx.sessions.fork(this.activeSessionId);
		await this.switchSession(child.id);
		if (opts?.directive !== void 0 && opts.directive !== "") await this.controls?.followup(opts.directive);
		return child.id;
	}
	/**
	* C3 项 3：打开 rewind overlay（/rewind）。消息快照 = transcript 视图
	* （seq/turn/text），执行回调做「文件回退 + 会话截断 + 持久化截断」。
	* @returns 是否已打开（无活跃会话或无消息时 false）。
	*/
	rewindSession() {
		const overlay = this.overlay;
		const rewind = this.rewindOverlay;
		if (overlay === null || rewind === null) return false;
		if (this.activeSessionId === null) return false;
		const messages = this.transcript?.view.messages ?? [];
		if (messages.length === 0) return false;
		rewind.setMessages(messages, (mode, atSeq) => this.executeRewind(mode, atSeq));
		overlay.activate("rewind");
		return true;
	}
	/**
	* P1：发起 /btw 侧问——BtwController 旁路（临时 btw agent，不持 ownedHandle、
	* 不经过 switchSession）。返回是否已发起：无活跃会话或已有挂起侧问时 false
	* （命令分发层回显提示）；创建/提问失败抛错由 runSlash 统一回显。
	* @param question - 侧问文本（已 trim）。
	* @returns 是否已发起。
	*/
	async askBtw(question) {
		if (this.activeSessionId === null) return false;
		if (this.btw.isActive) return false;
		await this.btw.ask(question);
		return true;
	}
	/**
	* T3：/export 会话导出——把当前会话完整事件日志渲染为 Markdown 并写盘。
	* 数据源是 session.events（权威事件流，非渲染视图）：完整内容、无折叠截断。
	* path 缺省 = 会话创建目录下 `dsh-export-<id>.md`（header.cwd 缺失时回退
	* 当前进程 cwd）。无活跃会话或写盘失败抛错——命令分发层回显失败（fails loud）。
	* @param path - 目标文件路径；缺省由会话 cwd 决定。
	* @returns 实际写入的导出文件路径。
	*/
	async exportTranscript(path) {
		if (this.activeSessionId === null) throw new Error("当前无会话，无法导出");
		const session = this.ctx.sessions.get(this.activeSessionId);
		if (session === void 0) throw new Error("会话不存在，无法导出");
		const target = path ?? join(session.header.cwd ?? process.cwd(), `dsh-export-${session.id}.md`);
		await writeFile(target, renderSessionExport(session.events, {
			sessionId: session.id,
			...session.header.cwd !== void 0 ? { cwd: session.header.cwd } : {}
		}), "utf8");
		return target;
	}
	/**
	* P2：打开 memory 浏览器 overlay。条目快照 + 删除回调在激活时经 memory
	* 服务注入（reflect 动态获取；服务缺失返回 false，命令层回显不可用）。
	* @returns 是否已打开。
	*/
	async openMemoryBrowser() {
		const overlay = this.overlay;
		const browser = this.memoryOverlay;
		if (overlay === null || browser === null) return false;
		const memory = this.ctx.reflect.get("memory", false);
		if (memory === void 0) return false;
		const PAGE_SIZE = 20;
		const items = await memory.list({
			limit: PAGE_SIZE,
			offset: 0
		});
		const hasMore = items.length >= PAGE_SIZE;
		browser.setItems(items, {
			refetch: async () => memory.list(),
			onDelete: async (id) => {
				await memory.delete(id);
			},
			fetchPage: async (offset, limit) => memory.list({
				offset,
				limit
			})
		}, hasMore);
		overlay.activate("memory");
		return true;
	}
	/**
	* C3 项 3：执行回退。mode 决定范围：
	* - convo：仅截断会话（内存 + 持久化）
	* - code：仅文件回退（FileHistory.rewindToBoundary）
	* - both：两者
	* 持久化失败向上抛（RewindOverlay 显示错误）；文件快照缺失计入 filesSkipped。
	* @returns 文件变更数/缺口数与截断 seq。
	*/
	async executeRewind(mode, atSeq) {
		let filesChanged = 0;
		let filesSkipped;
		if (mode !== "convo") {
			const r = await this.rewindFiles(atSeq);
			filesChanged = r.changed;
			filesSkipped = r.skipped;
		}
		const result = { filesChanged };
		if (filesSkipped !== void 0) result.filesSkipped = filesSkipped;
		if (mode === "convo" || mode === "both") {
			await this.truncateSession(atSeq);
			result.truncatedTo = atSeq;
		}
		return result;
	}
	/** 文件回退：收集 atSeq 之后的写工具 callId，经 fs-snapshot FileHistory 恢复。 */
	async rewindFiles(atSeq) {
		if (this.activeSessionId === null) return {
			changed: 0,
			skipped: 0
		};
		const session = this.ctx.sessions.get(this.activeSessionId);
		if (session === void 0) return {
			changed: 0,
			skipped: 0
		};
		const histories = this.ctx.reflect.get("fsSnapshot.histories", false);
		if (histories === void 0) throw new Error("rewind 文件快照不可用（fs-snapshot 未装配）");
		const fh = histories.get(this.activeSessionId);
		if (fh === void 0) return {
			changed: 0,
			skipped: 0
		};
		const postBoundaryIds = /* @__PURE__ */ new Set();
		for (const e of session.events) {
			if (e.seq <= atSeq) continue;
			if (e.type === "tool/call" && isWriteToolCall(e.data.name)) postBoundaryIds.add(e.data.callId);
		}
		const { changed, skipped } = await fh.rewindToBoundary(postBoundaryIds);
		return {
			changed: changed.length,
			skipped
		};
	}
	/**
	* 会话截断：先持久化后内存——truncateStored 失败时内存不动（状态一致、
	* 可重试），成功后再截内存态（同步纯内存操作，不抛错）。
	* 公开版 dsh-session 以 fork 派生代替内存截断，Session 无 truncate 能力
	* 时 fails loud（rewind 的 convo/both 模式在无截断能力的宿主上不可用）。
	* @param atSeq - 截断到的 seq（含）。
	*/
	async truncateSession(atSeq) {
		if (this.activeSessionId === null) return;
		const persistence = this.ctx.reflect.get("sessionPersistence", false);
		if (persistence !== void 0) await persistence.truncateStored(this.activeSessionId, atSeq);
		const session = this.ctx.sessions.get(this.activeSessionId);
		if (session === void 0) return;
		const truncate = session.truncate;
		if (truncate === void 0) throw new Error("会话截断不可用：宿主 dsh-session 不支持 truncate（rewind 请改用 fork 派生）");
		truncate.call(session, atSeq);
	}
	/**
	* 切换到既有会话：卸载旧投影/控制面（并释放本层持有的旧 handle），
	* 再 agent-ensure 目标会话——registry 有 live agent 走 controlsFromRegistry 兜底
	* （非自有，不 dispose）；无则 resume 拿 handle（本层持有并 dispose）。
	* resume 的模型定路沿用会话持久化的 request header（跨重启续模），
	* 无 header（从未成功发起请求的会话）才落 agentDefaultModel 当前选择。
	* @param id - 目标会话 id；必须是 live store 中已存在的会话。
	*/
	async switchSession(id) {
		await this.detachProjections({ keepHandle: true });
		this.activeSessionId = id;
		if (this.ctx.agents.get(id) !== void 0) {
			/* v8 ignore next -- agent 已确认存在（if 分支外），controlsFromRegistry 恒返回非空 */
			this.controls = controlsFromRegistry(this.ctx, id) ?? null;
			this.modelRef = null;
		} else {
			const persisted = getSession(this.ctx, id)?.requestHeader()?.config;
			const selection = persisted === void 0 ? this.ctx.agentDefaultModel.currentSelection() : {
				provider: persisted.provider,
				model: persisted.model,
				...persisted.reasoningEffort === void 0 ? {} : { reasoningEffort: persisted.reasoningEffort }
			};
			this.modelRef = {
				current: selection,
				assembled: void 0
			};
			const ref = this.modelRef;
			const handle = await this.ctx.agents.resume({
				resumeSessionId: id,
				agentOptions: {
					provider: selection.provider,
					model: selection.model
				},
				setup: (agentCtx) => {
					installModelSelection(agentCtx, ref);
				}
			});
			this.ownedHandle = handle;
			this.controls = controlsFromHandle(handle);
		}
		this.mountSession(id);
	}
	/**
	* 挂载当前会话的投影与控制面：transcript/live/controls 就位后，
	* 将已提交的历史渲染进 scrollback。
	* @param id - 目标会话 id（activeSessionId 已在调用方设置）。
	*/
	mountSession(id) {
		const session = getSession(this.ctx, id);
		if (session === void 0) throw new Error(`unknown session: ${id}`);
		this.transcript = createTranscript(this.ctx, session);
		this.liveAgent = trackAgent(this.ctx, id);
		this.statusLine = new WorkflowStatusLine(this.ctx, id, () => {
			this.renderBatcher.schedule();
		});
		const headerConfig = session.requestHeader()?.config;
		if (headerConfig !== void 0) {
			this.glanceModelName = headerConfig.model;
			this.glanceEffort = headerConfig.reasoningEffort ?? null;
		} else {
			const selection = this.ctx.agentDefaultModel.currentSelection();
			this.glanceModelName = selection.model;
			this.glanceEffort = selection.reasoningEffort ?? null;
		}
		this.contextWindow = session.requestContext()?.contextWindow ?? null;
		this.streamFeed = this.ctx.on("session/event", (owner, event) => {
			if (owner.id !== id) return;
			this.handleStreamEvent(event);
		});
		this.taskPanelVisible = false;
		this.statusPanelVisible = false;
		this.taskItems = null;
		this.planState = {
			active: false,
			pending: false
		};
		this.projectionCache = null;
		const projections = this.ctx.reflect.get("sessionProjections", false);
		if (projections !== void 0) {
			const snap = projections.snapshot(session);
			this.projectionCache = { ...snap.values };
			this.taskItems = snap.values.todos ?? null;
			const plan = snap.values.plan;
			this.planState = {
				active: plan?.active ?? false,
				pending: plan?.pending ?? false
			};
			this.statusLine?.setPlanState(this.planState);
			this.projectionDisposer = projections.onChanged((s, key, value) => {
				if (s.id !== id) return;
				/* v8 ignore next -- projectionCache 在快照后恒非 null（L766 赋值），null 仅类型收窄 */
				if (this.projectionCache !== null) this.projectionCache[key] = value;
				if (key === "todos") {
					this.taskItems = value;
					this.renderBatcher.schedule();
				} else if (key === "plan") {
					const plan = value;
					this.planState = {
						active: plan?.active ?? false,
						pending: plan?.pending ?? false
					};
					this.statusLine?.setPlanState(this.planState);
					this.renderBatcher.schedule();
				} else this.renderBatcher.schedule();
			});
		}
		this.discardReasoning();
		this.lastReasoningBlock = null;
		this.reasoningExpanded = false;
		this.pendingCallTitles.clear();
		const rows = renderTranscript(this.transcript.view, this.theme, this.stdout.columns, {
			compact: this.compactMode,
			resolveViews: (tool) => resolveToolViews(this.toolPresenters(), {
				name: tool.name,
				argumentsRaw: tool.arguments,
				...tool.result === void 0 ? {} : { result: {
					content: tool.result.data.message.content[0].content,
					isError: toolResultText(tool.result).isError,
					...tool.result.data.meta === void 0 ? {} : { meta: tool.result.data.meta }
				} }
			})
		});
		this.commitRows(rows);
		this.inputLine.setHistory(this.history);
		this.subagentDisposer?.();
		this.delegationEntries = null;
		this.subagentRuns.clear();
		const onSubStart = this.ctx.on("subagent/start", () => {
			this.refreshDelegationTree(id);
		});
		const onSubEnd = this.ctx.on("subagent/end", () => {
			this.refreshDelegationTree(id);
		});
		const onRunStart = this.ctx.on("subagent/start", (info) => {
			this.subagentRuns.set(info.runId, {
				label: this.subagentLabel(info.id),
				startedAt: Date.now()
			});
			this.renderBatcher.schedule();
		});
		const onRunEnd = this.ctx.on("subagent/end", (info) => {
			const run = this.subagentRuns.get(info.runId);
			if (run === void 0) return;
			this.subagentRuns.delete(info.runId);
			this.commitToScrollback({
				text: formatSubagentDone({
					width: this.stdout.columns,
					label: run.label,
					elapsedMs: Date.now() - run.startedAt,
					stopReason: info.stopReason
				}, this.theme),
				trailingNewline: true
			});
			this.renderBatcher.schedule();
		});
		this.subagentDisposer = () => {
			onSubStart();
			onSubEnd();
			onRunStart();
			onRunEnd();
		};
		this.refreshDelegationTree(id);
		this.workflowDisposer?.();
		this.workflowRuns.clear();
		const workflowListeners = [
			this.ctx.on("workflow/start", (info) => {
				this.workflowRuns.set(info.id, {
					id: info.id,
					phase: null,
					agents: []
				});
				this.flushLiveRender();
			}),
			this.ctx.on("workflow/phase", (info, title) => {
				const run = this.workflowRuns.get(info.id);
				if (run !== void 0) {
					run.phase = title;
					this.renderBatcher.schedule();
				}
			}),
			this.ctx.on("workflow/agent-start", (info, agent) => {
				const run = this.workflowRuns.get(info.id);
				if (run !== void 0) {
					run.agents.push({
						seq: agent.seq,
						label: agent.label
					});
					this.renderBatcher.schedule();
				}
			}),
			this.ctx.on("workflow/agent-end", (info, agent) => {
				const slot = this.workflowRuns.get(info.id)?.agents.find((a) => a.seq === agent.seq);
				if (slot !== void 0) {
					slot.outcome = agent.outcome;
					this.renderBatcher.schedule();
				}
			}),
			this.ctx.on("workflow/end", (info, result) => {
				const run = this.workflowRuns.get(info.id);
				if (run !== void 0) {
					const view = this.toWorkflowRunView(run, result);
					this.workflowRuns.delete(info.id);
					this.completedWorkflowRuns.set(info.id, view);
					this.flushLiveRender();
				}
			})
		];
		this.workflowDisposer = () => {
			for (const d of workflowListeners) d();
		};
		this.taskDoneDisposer?.();
		this.taskSurfaceDisposer?.();
		this.taskSnapshots = [];
		this.taskNotice = null;
		const tasks = this.ctx.reflect.get("tasks", false);
		if (tasks !== void 0) {
			this.taskSnapshots = tasks.list();
			this.taskDoneDisposer = tasks.onTaskDone((snapshot) => {
				this.taskNotice = `✓ 任务完成: ${snapshot.label}`;
				this.taskSnapshots = tasks.list();
				this.flushLiveRender();
			});
			this.taskSurfaceDisposer = tasks.attachSurface("tui");
		}
		this.flushLiveRender();
	}
	/** T2.1：预取委派树（async；空会话/服务缺失时置 null 降级）。 */
	/**
	* 对话流 subagent 行的显示标签：委派树缓存命中 label 用之，否则 id 短哈希。
	* @param id - 子代理会话 id。
	* @returns 显示标签。
	*/
	subagentLabel(id) {
		for (const e of this.delegationEntries ?? []) if (e.kind === "child" && e.id === id) return e.label ?? id.slice(0, 8);
		return id.slice(0, 8);
	}
	refreshDelegationTree(sessionId) {
		const subagents = this.ctx.reflect.get("subagents", false);
		if (subagents === void 0) {
			this.delegationEntries = null;
			return;
		}
		subagents.listDescendants(sessionId).then((entries) => {
			if (this.disposed) return;
			this.delegationEntries = entries;
			this.renderBatcher.schedule();
		}).catch(() => {
			/* v8 ignore next -- dispose 后 reject 的竞态守卫（同步测试无法构造） */
			if (this.disposed) return;
			this.delegationEntries = null;
		});
	}
	/** T2.2：运行态缓存项 → 面板视图（终态含 stopReason/agentsStarted）。 */
	toWorkflowRunView(run, result) {
		return {
			info: {
				id: run.id,
				meta: {
					name: run.phase ?? run.id,
					description: ""
				}
			},
			agents: run.agents.map((a) => ({
				seq: a.seq,
				label: a.label,
				childId: "",
				outcome: a.outcome ?? "completed"
			})),
			result: {
				stopReason: result.stopReason,
				...result.error === void 0 ? {} : { error: result.error },
				agentsStarted: run.agents.length
			},
			elapsedMs: Date.now()
		};
	}
	/** T3.2：刷新 /config 面板投影（settings describe + permission + credentials；服务缺失降级）。 */
	refreshConfigProjection() {
		const settings = this.ctx.reflect.get("settings", false);
		const permission = this.ctx.reflect.get("permission", false);
		const credentials = this.ctx.reflect.get("credentials", false);
		if (settings === void 0 && permission === void 0 && credentials === void 0) {
			this.configProjection = null;
			return;
		}
		const settingsDescriptors = settings === void 0 ? [] : settings.describe({ redactSecrets: true });
		const permissionView = permission === void 0 ? null : {
			options: permission.names.map((n) => ({
				value: n,
				name: n
			})),
			currentValue: permission.current([])
		};
		const credentialsList = [];
		if (credentials !== void 0) credentials.describe({ id: "" }).catch(() => {});
		this.configProjection = {
			settings: settingsDescriptors,
			permission: permissionView,
			credentials: credentialsList
		};
	}
	/** T3.3：刷新 skill 快照（ctx.skills.list；服务缺失时空数组）。 */
	refreshSkillItems() {
		const skills = this.ctx.reflect.get("skills", false);
		if (skills === void 0) {
			this.skillItems = [];
			return;
		}
		skills.list().then((items) => {
			/* v8 ignore next -- dispose 后 promise 才 resolve 的场景无法在同步测试中构造 */
			if (this.disposed) return;
			this.skillItems = items;
			this.renderBatcher.schedule();
		}).catch(() => {
			/* v8 ignore next -- 同上：dispose 后 reject 的竞态守卫 */
			if (this.disposed) return;
			this.skillItems = [];
		});
	}
	/** 当前主题（动态读取，切主题后立即生效）。 */
	get theme() {
		return getTheme();
	}
	/**
	* 统一 scrollback 写入：先清除 live 区（mid-stream commit 协议），再写条目。
	* 不擦则文本写在光标处（live 区底部），随后 renderLive 重绘 live 区把刚写的
	* 内容覆盖——用户消息丢失根因（assistant 流式 commit 已带 clearForCommit，
	* 非流式路径缺失导致行为不对称）。
	*/
	commitToScrollback(entry) {
		this.live.clearForCommit();
		this.commit.write(entry);
	}
	/**
	* 提交用户输入：追加输入历史、将用户消息渲染进 scrollback、
	* 走 adapter.send 的 followup 驱动 agent。slash 命令（/steer）分流到 handleSteer。
	* @param text - 输入框提交的文本；空文本但无图时 no-op
	* @param images - 输入框携带的图片附件 data URL 列表（可省略）
	*/
	handleSubmit(text, images) {
		images = normalizeSubmitImages(images);
		let trimmed = text.trim();
		const hasImages = images !== void 0 && images.length > 0;
		const imagesReachable = this.supportsVision || this.visionBridgeEnabled;
		if (!trimmed && hasImages) if (imagesReachable) {
			text = "📎 图片消息";
			trimmed = text;
		} else {
			this.commitUserPrompt("", images);
			this.inputLine.clearImages();
			this.flushLiveRender();
			return;
		}
		if (!trimmed) return;
		if (trimmed.startsWith("/")) {
			this.runSlash(trimmed);
			return;
		}
		const expanded = expandMentions(trimmed, process.cwd());
		this.history = [trimmed, ...this.history.filter((h) => h !== trimmed)].slice(0, 100);
		this.inputLine.setHistory(this.history);
		this.commitUserPrompt(expanded, images);
		this.inputLine.clearImages();
		this.controls?.followup(expanded, imagesReachable ? images : void 0).catch((err) => {
			const message = err instanceof Error ? err.message : String(err);
			this.commitToScrollback({
				text: `⚠ 消息发送失败: ${message}`,
				trailingNewline: true
			});
			this.flushLiveRender();
		});
		this.flushLiveRender();
	}
	/**
	* 用户气泡提交：正文 + 图片附件行 + 识图能力提示（vision 三态文案）。
	* 有图且终端支持图形协议时，图片在气泡提交后异步 prepare（本地转码，
	* 毫秒级，先于任何网络往返的 assistant 输出）并以同一写窗口协议追加
	* 图形序列（先清 live 区再 writeRaw，写完立即重绘）——物理上图片位于
	* 所属气泡下方、先于后续流式输出；prepare 失败静默降级为纯文本气泡。
	* @param content - 用户消息正文（已 mention 展开）
	* @param images - 图片 data URL 列表（已 normalize；可省略）
	*/
	commitUserPrompt(content, images) {
		const protocol = imageProtocol();
		const withImages = images !== void 0 && images.length > 0 && protocol !== "none";
		this.commitToScrollback({
			text: this.writeUserBubbleLines(content, images),
			trailingNewline: true
		});
		if (!withImages) return;
		(async () => {
			let prepared = [];
			try {
				for (const dataUrl of images.slice(0, 4)) {
					const img = await prepareTermImageForCommit(dataUrl, protocol);
					if (img) prepared.push(img);
				}
			} catch {
				prepared = [];
			}
			if (prepared.length === 0) return;
			const cols = Math.max(10, this.stdout.columns - 4);
			const maxRows = Math.max(5, Math.min(40, (this.stdout.rows || 24) - 6));
			let seq = "";
			for (const img of prepared) {
				const s = encodeTermImage(img, protocol, cols, maxRows);
				if (s) seq += s + (protocol === "kitty" ? "\r" : "\r\n");
			}
			if (!seq) return;
			this.live.clearForCommit();
			this.commit.writeRaw(seq);
			this.flushLiveRender();
		})();
	}
	/** 用户气泡正文（含 📎 附件行与识图能力提示）。 */
	writeUserBubbleLines(content, images) {
		const hasImages = images !== void 0 && images.length > 0;
		let imageNote = "";
		if (hasImages) {
			imageNote = `\n${color(`📎 ${images.length} image${images.length > 1 ? "s" : ""} attached`, this.theme.muted)}`;
			if (!this.supportsVision) if (this.visionBridgeEnabled) {
				const src = this.visionBridgeSource === "auto" ? "（自动选用的视觉模型）" : "";
				imageNote += `\n${color(`🖼 主模型不识图，将经识图桥${src}生成图片描述后发送`, this.theme.muted)}`;
			} else imageNote += `\n${color("⚠ 当前模型不支持识图，且无可用识图桥，图片未发送。请在配置中指定识图模型。", this.theme.warning)}`;
		}
		return formatUserMessage({
			content: content.trim() + imageNote,
			width: this.stdout.columns
		}, this.theme).join("\n");
	}
	/**
	* 执行一条 slash 命令：注册表解析 → handler 运行 → 回显/错误提示。
	* 命令回显写 scrollback（用户可见），但不写回 session log（dsh 纪律：
	* 命令执行是 UI 层副作用，session 事件词汇不变）。
	* @param input - 输入行提交的原始文本（已 trim，以 / 开头）。
	*/
	async runSlash(input) {
		const echo = (text) => {
			this.commitToScrollback({
				text,
				trailingNewline: true
			});
		};
		const parsed = this.slash.resolve(input);
		if (parsed === null) {
			if (await this.runCordisCommand(input, echo)) {
				this.flushLiveRender();
				return;
			}
			echo(`未知命令: ${input}。可用: ${this.slash.list().map((c) => `/${c.name}`).join(" ")}`);
			this.flushLiveRender();
			return;
		}
		try {
			await parsed.command.run({
				text: parsed.text,
				ctx: this.ctx,
				sessionId: this.activeSessionId,
				echo,
				/* v8 ignore next -- 内置命令 run 均不消费 rerender（死回调，无调用方） */
				rerender: () => {
					this.flushLiveRender();
				}
			});
			this.inputController.recordSlashUse(parsed.command.name);
		} catch (err) {
			echo(`⚠ 命令执行失败: ${err instanceof Error ? err.message : String(err)}`);
		}
		this.flushLiveRender();
	}
	/**
	* A1：把未命中的 slash 输入委托给 CommandService（cordis 命令通道）。
	* 无会话、commands 服务未装配、或命令未知名（execute 返回 undefined）时
	* 返回 false，由调用方维持「未知命令」回显；成功/失败回显在此完成。
	* @param input - 完整 slash 输入（含 / 前缀）。
	* @param echo - scrollback 回显回调。
	* @returns 命令是否被 CommandService 受理（true 时调用方不再回显未知命令）。
	*/
	async runCordisCommand(input, echo) {
		if (this.activeSessionId === null) return false;
		const commands = this.ctx.reflect.get("commands", false);
		if (commands === void 0) return false;
		const agent = this.ctx.agents.get(this.activeSessionId);
		if (agent === void 0) return false;
		try {
			const execution = await commands.execute(agent, input, new AbortController().signal);
			if (execution === void 0) return false;
			if (execution.result.kind === "success") echo(execution.result.text ?? "已执行");
			else echo(`⚠ 命令执行失败: ${execution.result.text}`);
			return true;
		} catch (err) {
			echo(`⚠ 命令执行失败: ${err instanceof Error ? err.message : String(err)}`);
			return true;
		}
	}
	/**
	* 提交中轮转向：渲染差异化 steer 消息（marker/颜色区分 user）进 scrollback，
	* 走 adapter.send 的 steer API。空文本 no-op（/steer 无参数、Ctrl+T 空输入）。
	* @param text - 转向文本。
	*/
	handleSteer(text) {
		const trimmed = text.trim();
		if (!trimmed) return;
		this.history = [trimmed, ...this.history.filter((h) => h !== trimmed)].slice(0, 100);
		this.inputLine.setHistory(this.history);
		this.commitToScrollback({
			text: formatSteerMessage({
				content: trimmed,
				width: this.stdout.columns
			}, this.theme).join("\n"),
			trailingNewline: true
		});
		this.controls?.steer(trimmed);
		this.flushLiveRender();
	}
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
	handleApprovalRequest(req, next) {
		return this.approval.handle(req, next);
	}
	/** Phase 8：结算挂起的审批请求（用户按键/取消）——薄转发。 */
	settleApproval(outcome) {
		this.approval.settle(outcome);
	}
	/** 取消当前运行（Esc/Ctrl+C）：cancel agent、丢弃未发出的流式/推理缓冲并重置流渲染。 */
	handleAbort() {
		this.controls?.cancel({ kind: "user" });
		this.commitToScrollback({
			text: "⏹ 已取消",
			trailingNewline: true
		});
		this.blockWriter.discard();
		this.streamRenderer.reset();
		this.discardReasoning();
		this.pendingCallTitles.clear();
		this.flushLiveRender();
	}
	/**
	* Phase 6.4：打开外部编辑器编辑当前输入行。编辑器是外部进程，必须暂时
	* 退出 raw-mode（编辑器需要正常终端交互）；spawnSync 阻塞期间 ticker 暂停。
	* 任何路径（含编辑器失败）都恢复 raw-mode。编辑结果回填输入行。
	*/
	openExternalEditor() {
		try {
			this.stdin.setRawMode(false);
		} catch {}
		let content = null;
		try {
			content = openInEditor(this.inputLine.value, this.editorCommand);
		} finally {
			try {
				this.stdin.setRawMode(true);
			} catch {}
		}
		if (content !== null) this.inputLine.setValue(content);
		this.flushLiveRender();
	}
	/**
	* Tab 补全（Phase 6.3）：委托 InputController 状态机——首次 Tab 解析
	* 光标前 @ 路径 token 的候选并应用首项，再次 Tab 循环。无 @ token 时
	* 返回 false，Tab 保持原行为（InputLine 照常发出 'tab' 事件）。
	*/
	handleTabComplete() {
		const result = this.inputController.tabComplete(this.inputLine.value, this.inputLine.cursor, process.cwd());
		if (result === null) return false;
		this.inputLine.setValue(result.text, result.cursor);
		this.flushLiveRender();
		return true;
	}
	/**
	* 输入行 ghost 预览文本（阶段 2）：菜单选中命令时预览补全剩余
	* （`/th` + 选中 /theme → `eme`）；完整命令名 + 尾空格 → 预览参数占位
	* （`/theme ` → `<name>`）。菜单关闭/光标不在末尾/无补全关系 → null。
	* @returns ghost 文本或 null。
	*/
	slashGhostText() {
		const menu = this.inputController.slashMenu;
		if (!menu.open) return null;
		const selected = menu.matches[menu.selected];
		if (selected === void 0) return null;
		const value = this.inputLine.value;
		if (this.inputLine.cursor !== value.length || value === "") return null;
		const name = `/${selected.name}`;
		if (value === `${name} ` && selected.argsHint !== void 0) return selected.argsHint;
		if (value === name) return null;
		if (name.startsWith(value)) return name.slice(value.length);
		return null;
	}
	/**
	* 接受 slash 菜单当前选中项（Tab / Enter）。
	* Enter 且输入已是完整命令名（如 `/theme`）→ 关闭菜单并直接提交；
	* 否则补全命令名到输入行（有 argsHint 的命令补到 `cmd ` 留参数位，
	* 参数建议留待下一批），随后关闭菜单。
	* @param opts - submit：Enter 语义（精确命令直接发送）。
	*/
	acceptSlashCompletion(opts) {
		const menu = this.inputController.slashMenu;
		const selected = menu.matches[menu.selected];
		if (selected === void 0) {
			this.inputController.closeSlash();
			this.flushLiveRender();
			return;
		}
		const name = `/${selected.name}`;
		const current = this.inputLine.value;
		if (opts?.submit === true && (current === name || current === `${name} `)) {
			this.inputController.closeSlash();
			this.inputLine.setValue("");
			this.handleSubmit(current);
			return;
		}
		this.inputLine.setValue(selected.argsHint !== void 0 ? `${name} ` : name);
		this.inputController.closeSlash();
		this.flushLiveRender();
	}
	/**
	* C3 项 4：Shift+Tab 三态循环（对齐 grok 的两轴模型，plan 与 permission 正交）：
	* Normal → Plan（planMode.set(true)）→ Always-Approve（plan off + 本地短路）→ Normal。
	* plan 切换经 planMode 服务（投影总线驱动 planState 徽标）；always-approve 是
	* 纯 TUI 本地标志（不持久化，退出即失），对审批 answerer 短路放行。
	* alwaysApprove 优先判断：它是同步本地态；planState 经投影异步更新，
	* 若按投影判断会在 Always-Approve 态误走回 Plan 分支。
	*/
	cycleMode() {
		if (this.approval.alwaysApprove) {
			this.approval.setAlwaysApprove(false);
			this.statusLine?.setAlwaysApprove(false);
			this.flushLiveRender();
		} else if (this.planState.active) {
			this.setPlanMode(false);
			this.approval.setAlwaysApprove(true);
			this.statusLine?.setAlwaysApprove(true);
			this.flushLiveRender();
		} else this.setPlanMode(true);
	}
	/** C3 项 4：经 planMode 服务切换 plan 状态（未装配或未挂载时静默降级）。 */
	setPlanMode(active) {
		const planMode = this.ctx.reflect.get("planMode", false);
		if (planMode === void 0) return;
		if (this.activeSessionId === null) return;
		const agent = this.ctx.agents.get(this.activeSessionId);
		if (agent === void 0) return;
		planMode.set(agent, active);
	}
	/** 键路由：Enter 提交 / Ctrl-C 取消或退出 / 上下键历史 / 其余交给 InputLine。 */
	handleKey(key) {
		if (key.name === "shift_tab") {
			this.cycleMode();
			return;
		}
		if (key.name === "ctrl_n") {
			this.newSession();
			return;
		}
		if (key.name === "ctrl_s") {
			const others = this.ctx.sessions.list().filter((s) => s.id !== this.activeSessionId);
			const target = others[others.length - 1]?.id;
			if (target !== void 0) this.switchSession(target);
			return;
		}
		if (key.name === "ctrl_q") {
			if (this.onExit !== void 0) this.onExit();
			return;
		}
		if (key.name === "ctrl_p") {
			const palette = this.palette;
			const overlay = this.overlay;
			/* v8 ignore next 2 -- palette/overlay 在 attach 时恒创建（L539-547），null 仅类型收窄 */
			if (palette !== null && overlay !== null) if (palette.isOpen()) {
				palette.close();
				overlay.deactivate();
			} else {
				palette.open();
				overlay.activate("command-palette");
			}
			return;
		}
		if (key.name === "ctrl_.") {
			const overlay = this.overlay;
			/* v8 ignore next -- overlay 在 attach 时恒创建，null 仅类型收窄 */
			if (overlay !== null) if (overlay.activeId() === "keymap") overlay.deactivate();
			else overlay.activate("keymap");
			return;
		}
		if (key.name === "ctrl_f" && this.palette?.isOpen() !== true) {
			const overlay = this.overlay;
			const search = this.searchOverlay;
			/* v8 ignore next 2 -- overlay/searchOverlay 在 attach 时恒创建（L539-547），null 仅类型收窄 */
			if (overlay !== null && search !== null) if (overlay.activeId() === "search") overlay.deactivate();
			else {
				search.setMessages(this.transcript?.view.messages ?? []);
				overlay.activate("search");
			}
			return;
		}
		if (this.overlay?.activeId() === "search" && this.searchOverlay !== null) {
			if (key.name === "escape" || key.name === "ctrl_c") this.overlay.deactivate();
			else if (key.name === "backspace") {
				this.searchOverlay.backspace();
				this.overlay.rerender();
			} else if (key.char === "n" || key.char === "N") {
				this.searchOverlay.goNext();
				this.overlay.rerender();
			} else if (key.char === "p" || key.char === "P") {
				this.searchOverlay.goPrev();
				this.overlay.rerender();
			} else if (key.char !== "") {
				this.searchOverlay.type(key.char);
				this.overlay.rerender();
			}
			return;
		}
		if (this.overlay?.activeId() === "rewind" && this.rewindOverlay !== null) {
			if (this.rewindOverlay.handleKey(key.name, key.char)) this.overlay.rerender();
			if (this.rewindOverlay.isDone()) this.overlay.deactivate();
			return;
		}
		if (this.overlay?.activeId() === "memory" && this.memoryOverlay !== null) {
			if (key.name === "escape" || key.name === "ctrl_c") this.overlay.deactivate();
			else if (this.memoryOverlay.handleKey(key.name, key.char)) this.overlay.rerender();
			return;
		}
		if (this.palette?.isOpen() === true) {
			if (key.name === "return") {
				const committed = this.palette.commit();
				this.overlay?.deactivate();
				this.palette.close();
				if (committed !== null) this.inputLine.setValue(committed.text);
			} else if (key.name === "up" || key.name === "down") {
				this.palette.move(key.name === "up" ? -1 : 1);
				this.overlay?.rerender();
			} else if (key.char !== "") {
				this.palette.type(key.char);
				this.overlay?.rerender();
			}
			return;
		}
		if (this.question.isPending) {
			const item = this.question.peek()?.request.questions[0];
			if (this.question.feedbackMode) if (key.name === "return") {
				const feedback = this.inputLine.value;
				this.inputLine.setValue("");
				const keepLabel = item?.options?.find((o) => o.label !== item.intent?.approve)?.label ?? item?.options?.[0]?.label ?? "";
				this.settleQuestion({ answers: [{
					id: item?.id ?? "",
					selected: [keepLabel],
					custom: feedback
				}] });
			} else if (key.name === "escape" || key.name === "ctrl_c") {
				this.question.setFeedbackMode(false);
				this.flushLiveRender();
			} else {
				this.inputLine.handleKey(key.name, key.char, key.ctrl, key.meta, key.shift);
				this.flushLiveRender();
			}
			else if (key.name === "escape" || key.name === "ctrl_c") this.cancelQuestion();
			else if (item !== void 0 && item.intent?.kind === "plan-review" && (key.char === "f" || key.char === "F")) {
				this.question.setFeedbackMode(true);
				this.inputLine.setValue("");
				this.flushLiveRender();
			} else if (item !== void 0 && item.options !== void 0 && /^[0-9]$/.test(key.char)) {
				const idx = Number(key.char) - 1;
				const option = item.options[idx];
				if (option !== void 0) this.settleQuestion({ answers: [{
					id: item.id,
					selected: [option.label]
				}] });
			}
			return;
		}
		if (this.btw.isActive && (key.name === "escape" || key.name === "ctrl_c")) {
			this.btw.dismiss();
			this.flushLiveRender();
			return;
		}
		if (this.approval.isPending) {
			if (key.char === "y" || key.char === "Y") this.settleApproval("allowed-once");
			else if (key.char === "n" || key.char === "N") this.settleApproval("rejected");
			else if (key.char === "a" || key.char === "A") {
				this.approval.setAlwaysApprove(true);
				this.statusLine?.setAlwaysApprove(true);
				this.settleApproval("allowed-once");
			} else if (key.name === "ctrl_c" || key.name === "escape") this.settleApproval("cancelled");
			return;
		}
		if (key.name === "ctrl_c") {
			if (this.inputLine.value === "" && this.onExit !== void 0) {
				this.onExit();
				return;
			}
			this.handleAbort();
			return;
		}
		if (key.name === "ctrl_o") {
			if (this.reasoningText !== "" || this.lastReasoningBlock !== null) {
				this.reasoningExpanded = !this.reasoningExpanded;
				this.renderBatcher.schedule();
				return;
			}
		}
		if (key.name === this.editorKey) {
			this.openExternalEditor();
			return;
		}
		if (key.name === "ctrl_t") {
			const text = this.inputLine.value.trim();
			if (text !== "") {
				this.inputLine.setValue("");
				this.handleSteer(text);
			}
			return;
		}
		if (key.name === "ctrl_v") {
			this.handleCtrlV();
			return;
		}
		if (this.inputController.slashMenu.open) {
			if (key.name === "up" || key.name === "down") {
				this.inputController.moveSlashSelection(key.name === "up" ? -1 : 1);
				this.flushLiveRender();
				return;
			}
			if (key.name === "pageup" || key.name === "pagedown") {
				this.inputController.scrollSlashSelection(key.name === "pageup" ? -8 : 8);
				this.flushLiveRender();
				return;
			}
			if (key.name === "tab") {
				this.acceptSlashCompletion();
				return;
			}
			if (key.name === "return") {
				this.acceptSlashCompletion({ submit: true });
				return;
			}
			if (key.name === "escape") {
				this.inputController.closeSlash();
				this.flushLiveRender();
				return;
			}
		}
		if (key.name === "up" || key.name === "down") {
			this.inputLine.handleKey(key.name, key.char, key.ctrl, key.meta, key.shift);
			this.flushLiveRender();
			return;
		}
		const event = this.inputLine.handleKey(key.name, key.char, key.ctrl, key.meta, key.shift);
		const clip = this.inputLine.takeClipboardOut();
		if (clip != null) this.stdout.write(osc52Clipboard(clip));
		if (event !== null) this.flushLiveRender();
	}
	/**
	* Phase 5.3：glance 一行条的可得数据。model（request header 优先、
	* agentDefaultModel 兜底）、effort（同构）、缓存命中率与上下文占比
	* （最后一条 assistant/message 的 usage 折叠）、上下文窗口
	* （request/context 折叠）、turn 数、本轮耗时。任何数据缺失 → 对应段
	* 省略（glance 段组装按可得段渲染，窄宽渐进 drop）。
	* 无可渲染数据返回 null（不占位）。
	*/
	glanceMetrics() {
		const view = this.transcript?.view;
		if (view === void 0) return null;
		const modelName = this.glanceModelName;
		/* v8 ignore next -- glanceModelName 在 mountSession 时经 ?? 兜底恒非 null；防御分支 */
		if (modelName === null) return null;
		const input = {
			width: this.stdout.columns,
			modelName
		};
		if (this.glanceEffort !== null) input.effort = this.glanceEffort;
		const usage = this.usageFold;
		if (usage !== null) {
			const billed = usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
			if (billed > 0) {
				if (usage.cacheReadTokens !== void 0 || usage.cacheWriteTokens !== void 0) input.cacheHitRate = (usage.cacheReadTokens ?? 0) / billed;
				if (this.contextWindow !== null && this.contextWindow > 0) {
					input.contextRatio = Math.min(1, billed / this.contextWindow);
					input.tokens = {
						used: billed,
						max: this.contextWindow
					};
				}
			}
		}
		if (view.turn >= 0) {
			input.turnCount = view.turn + 1;
			if (view.firstInTurnTime !== void 0) input.elapsedMs = Date.now() - view.firstInTurnTime;
		}
		return input;
	}
	/**
	* 把渲染行批量提交到 scrollback（保持时间顺序）。
	* @param rows - RenderedRow 数组。
	*/
	commitRows(rows) {
		if (rows.length === 0) return;
		const buf = [];
		for (const row of rows) buf.push(row.ansi);
		this.commitToScrollback({
			text: buf.join("\n"),
			trailingNewline: true
		});
	}
	/**
	* 流式事件供给：assistant text-delta 推进 blockWriter（节流切块，稳定前缀
	* commit 进 scrollback）；message/turn 边界 flush + finalize 收尾。aborted
	* turn 的残文由 handleAbort discard/reset，不在此 commit。
	* @param event - 当前会话的 session/event（订阅处已按会话过滤）。
	*/
	handleStreamEvent(event) {
		switch (event.type) {
			case "assistant/chunk": {
				const { chunk } = event.data;
				if (chunk.type === "text-delta") {
					this.commitReasoningBlock();
					this.blockWriter.push(chunk.text);
				} else if (chunk.type === "reasoning-delta") {
					if (this.reasoningText === "") this.reasoningStartedAt = event.time;
					this.reasoningText += chunk.text;
					this.renderBatcher.schedule();
				}
				break;
			}
			case "assistant/message":
				this.commitReasoningBlock();
				if (event.data.usage !== void 0) this.usageFold = event.data.usage;
				this.flushStream();
				break;
			case "request/header":
				this.glanceEffort = event.data.header.config.reasoningEffort ?? null;
				break;
			case "request/context":
				this.contextWindow = event.data.contextWindow ?? null;
				break;
			case "tool/call": {
				this.commitReasoningBlock();
				const { call } = resolveToolViews(this.toolPresenters(), {
					name: event.data.name,
					argumentsRaw: event.data.arguments
				});
				if (call !== void 0) this.pendingCallTitles.set(event.data.callId, call.title);
				this.fluency.setPhase("tool");
				break;
			}
			case "tool/result": {
				const { message, error } = event.data;
				const resultBlock = message.content[0];
				const resultLength = resultBlock.content.reduce((acc, block) => acc + (block.type === "text" ? block.text.length : 0), 0);
				const callId = message.source.callId;
				const name = this.transcript?.view.tools.findLast((t) => t.callId === callId)?.name ?? "tool";
				this.fluency.recordToolResult({
					name,
					isError: error !== void 0 || resultBlock.isError === true,
					resultLength
				});
				this.pendingCallTitles.delete(callId);
				this.commitSettledToolCard(event);
				break;
			}
			case "turn/end":
				this.fluency.onTurnComplete();
				if (event.data.reason.kind !== "aborted") {
					this.commitReasoningBlock();
					this.flushStream();
				} else this.discardReasoning();
				this.pendingCallTitles.clear();
				break;
			default: break;
		}
	}
	/** tools 服务的 presenter 面（可选服务：未装配返回 undefined → 桥软降级）。 */
	toolPresenters() {
		return this.ctx.reflect.get("tools", false);
	}
	/**
	* 结算工具卡实时提交：从 transcript 查配对 call 的 name/arguments →
	* presenter 桥 → 卡片渲染 → 串行在流式文本 flush 之后 commit 进
	* scrollback（保证「文本 → 卡」的事件序）。配对缺失（截断/rewind 边界）
	* 无卡可渲染，静默跳过。
	*/
	commitSettledToolCard(event) {
		const callId = event.data.message.source.callId;
		const tool = this.transcript?.view.tools.findLast((t) => t.callId === callId);
		if (tool === void 0) return;
		const { content, isError } = toolResultText(event);
		const views = resolveToolViews(this.toolPresenters(), {
			name: tool.name,
			argumentsRaw: tool.arguments,
			result: {
				content: event.data.message.content[0].content,
				isError,
				...event.data.meta === void 0 ? {} : { meta: event.data.meta }
			}
		});
		const rows = formatToolViewCard({
			toolName: tool.name,
			argumentsRaw: tool.arguments,
			content,
			isError,
			...views.call === void 0 ? {} : { callView: views.call },
			...views.result === void 0 ? {} : { resultView: views.result },
			elapsedMs: Math.max(0, event.time - tool.time),
			compact: this.compactMode
		}, this.theme);
		this.flushStream().then(() => {
			if (this.disposed) return;
			this.commitToScrollback({
				text: rows.join("\n"),
				trailingNewline: true
			});
			this.renderBatcher.schedule();
		});
	}
	/**
	* 推理段落底：静态 `✻ 思考 (Ns) · N 行` 折叠头行（对标竞品默认折叠——
	* 正文经 Ctrl+O 展开查看）整块 commit 进 scrollback，清缓冲。空缓冲 no-op。
	* 调用点即段边界：首个 text-delta / tool/call / assistant/message /
	* 非中止 turn/end。
	*/
	commitReasoningBlock() {
		if (this.reasoningText === "") return;
		const elapsedMs = this.reasoningStartedAt === null ? void 0 : Math.max(0, Date.now() - this.reasoningStartedAt);
		const lines = formatReasoningBlock({
			text: this.reasoningText,
			...elapsedMs === void 0 ? {} : { elapsedMs },
			compact: this.compactMode
		}, this.theme);
		this.lastReasoningBlock = {
			text: this.reasoningText,
			...elapsedMs === void 0 ? {} : { elapsedMs }
		};
		this.reasoningExpanded = false;
		this.discardReasoning();
		this.commitToScrollback({
			text: lines.join("\n"),
			trailingNewline: true
		});
		this.renderBatcher.schedule();
	}
	/** 丢弃推理缓冲（abort / 会话切换；aborted turn 的推理不落底）。 */
	discardReasoning() {
		this.reasoningText = "";
		this.reasoningStartedAt = null;
	}
	/** 流式收尾：吐尽节流缓冲，并把 StreamRenderer 剩余 pending commit 进 scrollback。 */
	async flushStream() {
		await this.blockWriter.flush();
		this.streamRenderer.finalize();
	}
	/** wrapping-aware display rows（空行计 1）。 */
	displayRowsFor(text) {
		const cols = this.stdout.columns;
		if (cols <= 0) return 1;
		const dw = displayWidth(text, { ambiguousAsWide: ambiguousWideEnabled() });
		if (dw === 0) return 1;
		return Math.ceil(dw / cols);
	}
	/** critical 路径同步穿透：用户交互（提交/审批/按键）不等 16ms 帧边界。 */
	flushLiveRender() {
		this.renderBatcher.flushNow();
	}
	/** 渲染一帧 live 区：状态行 + 流式尾巴 + 进行中工具卡 + 输入行。 */
	renderLive() {
		if (this.disposed) return;
		const renderStart = performance.now();
		const theme = this.theme;
		const termCols = this.stdout.columns;
		const gutter = termCols >= 12 ? 2 : 0;
		const cols = Math.max(1, termCols - gutter * 2);
		const tightViewport = this.stdout.rows < 22;
		const compactLive = this.compactMode || tightViewport;
		const lines = [];
		this.glance.refresh();
		const glance = this.glance.current();
		const turnStatusLines = formatTurnStatus({
			statusText: glance.status,
			tick: this.tick,
			active: this.liveAgent?.state.status === "running",
			width: cols
		}, theme);
		const workflowRuns = [];
		for (const state of this.workflowRuns.values()) workflowRuns.push({
			info: {
				id: state.id,
				meta: {
					name: state.phase ?? state.id,
					description: ""
				}
			},
			agents: state.agents.map((a) => ({
				seq: a.seq,
				label: a.label,
				childId: "",
				outcome: a.outcome ?? "completed"
			})),
			elapsedMs: Date.now()
		});
		workflowRuns.push(...this.completedWorkflowRuns.values());
		const snapshot = {
			cols,
			theme,
			glanceStatus: turnStatusLines[0] ?? null,
			glanceError: glance.error,
			taskPanelVisible: this.taskPanelVisible,
			taskItems: this.taskItems,
			taskSnapshots: this.taskSnapshots,
			taskNotice: this.taskNotice,
			statusPanelVisible: this.statusPanelVisible,
			goal: this.projectionCache?.goal ?? null,
			todos: this.projectionCache?.todos ?? null,
			plan: this.projectionCache?.plan ?? null,
			subagentsPanelVisible: this.subagentsPanelVisible,
			delegationEntries: this.delegationEntries,
			subagentIdentities: this.projectionCache?.subagent ?? /* @__PURE__ */ new Map(),
			subagentTimings: this.projectionCache?.subagentTiming ?? /* @__PURE__ */ new Map(),
			workflowPanelVisible: this.workflowPanelVisible,
			workflowRuns,
			configPanelVisible: this.configPanelVisible,
			configProjection: this.configProjection,
			skillsPanelVisible: this.skillsPanelVisible,
			skillItems: this.skillItems,
			activeSessionId: this.activeSessionId === null ? null : String(this.activeSessionId),
			sessionTabs: this.sessionManager.list().map((s) => ({
				id: String(s.id),
				status: s.status
			}))
		};
		for (const line of renderSessionTabs(snapshot)) lines.push({ text: color(line, theme.secondary) });
		for (const line of renderGlancePanel(snapshot)) lines.push({ text: line });
		for (const line of renderTasksPanel(snapshot)) lines.push({ text: line });
		if (this.statusPanelVisible && this.projectionCache !== null) for (const line of renderStatusPanel(snapshot)) lines.push({ text: line });
		for (const line of renderDelegationPanel(snapshot)) lines.push({ text: line });
		for (const line of renderWorkflowPanel(snapshot)) lines.push({ text: line });
		for (const line of renderConfigPanel(snapshot)) lines.push({ text: line });
		for (const line of renderSkillsPanel(snapshot)) lines.push({ text: line });
		const btwPeek = this.btw.peek();
		if (btwPeek !== null) {
			const btwColor = btwPeek.status === "error" ? theme.warning : btwPeek.status === "loading" ? theme.secondary : null;
			for (const line of renderBtwPanel(btwPeek, { width: cols })) lines.push({ text: btwColor === null ? line : color(line, btwColor) });
		}
		if (snapshot.taskNotice !== null) {
			lines.push({ text: color(snapshot.taskNotice, theme.muted) });
			this.taskNotice = null;
		}
		const policy = this.fluency.getPolicy();
		if (policy.staleMessage !== void 0 && policy.staleLevel !== void 0) {
			const staleColor = policy.staleLevel === "action" ? theme.error : policy.staleLevel === "warn" ? theme.warning : theme.secondary;
			lines.push({ text: color(`⏳ ${policy.staleMessage}`, staleColor) });
		}
		if (this.reasoningExpanded) {
			if (this.reasoningText !== "") {
				const reasoningLines = formatReasoningLive({
					text: this.reasoningText,
					...this.reasoningStartedAt === null ? {} : { elapsedMs: Math.max(0, Date.now() - this.reasoningStartedAt) },
					tick: this.tick,
					columns: cols,
					expanded: true
				}, theme);
				for (const line of reasoningLines) lines.push({ text: line });
				lines.push({ text: color("— ctrl+o 收起", theme.dim) });
			} else if (this.lastReasoningBlock !== null) {
				const blockLines = formatReasoningBlock({
					text: this.lastReasoningBlock.text,
					...this.lastReasoningBlock.elapsedMs === void 0 ? {} : { elapsedMs: this.lastReasoningBlock.elapsedMs },
					expanded: true
				}, theme);
				for (const line of blockLines) lines.push({ text: line });
				lines.push({ text: color("— ctrl+o 收起", theme.dim) });
			}
		}
		if (this.reasoningText !== "" && !this.reasoningExpanded) {
			const reasoningLines = formatReasoningLive({
				text: this.reasoningText,
				...this.reasoningStartedAt === null ? {} : { elapsedMs: Math.max(0, Date.now() - this.reasoningStartedAt) },
				tick: this.tick,
				columns: cols,
				compact: compactLive
			}, theme);
			for (const line of reasoningLines) lines.push({ text: line });
		}
		for (const line of this.streamRenderer.getLiveTailLines(tightViewport ? 2 : 6, this.blockWriter.peek())) lines.push({ text: line });
		const pendingTools = this.transcript?.view.tools.filter((t) => t.result === void 0) ?? [];
		for (const tool of pendingTools) {
			const args = parseToolArguments(tool.arguments);
			const titleOverride = this.pendingCallTitles.get(tool.callId);
			const rows = formatToolCardLive({
				toolName: tool.name,
				...args === void 0 ? {} : { toolInput: args },
				...titleOverride === void 0 ? {} : { title: titleOverride },
				columns: cols,
				tailLines: tightViewport ? 1 : 2,
				tick: this.tick,
				compact: compactLive
			}, theme);
			for (const line of rows) lines.push({ text: line });
		}
		for (const run of this.subagentRuns.values()) for (const line of formatSubagentRunning({
			width: cols,
			label: run.label,
			tick: this.tick
		}, theme)) lines.push({ text: line });
		const chromeStart = lines.length;
		const questionPeek = this.question.peek();
		if (questionPeek !== null) {
			for (const line of projectQuestionPanel(questionPeek.request, { width: cols })) lines.push({ text: line });
			if (questionPeek.feedbackMode) lines.push({ text: color("📝 反馈输入中（Enter 提交 / Esc / Ctrl+C 返回选项）", theme.muted) });
		}
		const approvalPeek = this.approval.peek();
		if (approvalPeek !== null) {
			const callId = approvalPeek.req.callId;
			const toolCall = callId === void 0 ? void 0 : this.transcript?.view.tools.findLast((t) => t.callId === callId);
			const diff = toolCall === void 0 ? null : formatPermissionDiff({
				toolName: toolCall.name,
				arguments: toolCall.arguments
			}, this.theme);
			for (const line of formatApprovalCard({
				columns: cols,
				toolName: approvalPeek.req.toolName,
				...approvalPeek.req.reason === void 0 ? {} : { reason: approvalPeek.req.reason },
				diffLines: diff,
				compact: compactLive
			}, theme)) lines.push({ text: line });
		}
		const inputValue = this.inputLine.value;
		if (this.inputController.slashMenu.open) for (const line of formatSlashMenu({
			width: cols,
			items: this.inputController.slashMenu.matches,
			selected: this.inputController.slashMenu.selected
		}, theme)) lines.push({ text: line });
		else {
			const hint = this.slash.hint(inputValue);
			if (hint !== null) lines.push({ text: hint });
		}
		if (this.vimEnabled && this.inputLine.vimMode !== "insert") {
			const modeLabel = this.inputLine.vimMode === "visual" ? this.inputLine.visualLineWise ? "-- VISUAL LINE --" : "-- VISUAL --" : "-- NORMAL --";
			lines.push({ text: color(modeLabel, theme.secondary) });
		}
		for (const summary of this.inputLine.imageSummary(cols)) lines.push({ text: color(summary, theme.muted) });
		this.inputLine.setGhost(this.slashGhostText());
		lines.push({ text: "" });
		const planProj = this.projectionCache?.plan;
		const modeColor = planProj?.pending === true || planProj?.active === true ? theme.warning : this.approval.alwaysApprove ? theme.error : theme.secondary;
		const promptColor = this.liveAgent?.state.status === "running" ? theme.dim : modeColor;
		const inputView = this.inputLine.displayLinesWithCaret({ maxWidth: cols });
		const frame = formatInputFrame({
			columns: cols,
			lines: inputView.lines.map((line) => line.startsWith("❯ ") ? `${color("❯", promptColor)}${line.slice(1)}` : line),
			caretLine: inputView.caret.line,
			caretCol: inputView.caret.col,
			planActive: planProj?.active === true,
			planPending: planProj?.pending === true,
			alwaysApprove: this.approval.alwaysApprove
		}, theme);
		for (const [i, line] of frame.lines.entries()) lines.push(i === frame.caretLine ? {
			text: line,
			caretCol: frame.caretCol
		} : { text: line });
		const bottomMetrics = this.glanceMetrics();
		const mergeRight = bottomMetrics !== null && termCols >= 80;
		const rightSegments = mergeRight ? [...glanceBarSegments({
			...bottomMetrics,
			width: cols
		}), `API ${this.apiKeyReady ? "✓" : "✗"}`] : void 0;
		const footerLines = formatPromptFooter({
			width: cols,
			planActive: planProj?.active === true,
			planPending: planProj?.pending === true,
			alwaysApprove: this.approval.alwaysApprove,
			approvalPending: this.approval.isPending,
			...rightSegments !== void 0 ? { rightSegments } : {}
		}, theme);
		for (const line of footerLines) lines.push({ text: line });
		if (bottomMetrics !== null && !mergeRight) for (const line of formatGlanceBar({
			...bottomMetrics,
			width: cols
		}, theme)) lines.push({ text: line.text });
		if (gutter > 0) {
			const pad = " ".repeat(gutter);
			for (const line of lines) {
				line.text = `${pad}${line.text}`;
				if (line.caretCol !== void 0) line.caretCol += gutter;
			}
		}
		const rowsForLine = (text) => this.displayRowsFor(text);
		let chromeRows = 0;
		for (let i = chromeStart; i < lines.length; i++) {
			const row = lines[i];
			if (row === void 0) continue;
			chromeRows += rowsForLine(row.text);
		}
		const padded = padDynamicRegion(lines, chromeStart, Math.max(0, this.stdout.rows - chromeRows - 1), rowsForLine);
		const chromeTail = padded.lines.length - padded.chromeStart;
		this.live.render(padded.lines, chromeTail > 0 ? { reservedTail: chromeTail } : void 0);
		this.perfMonitor.record("renderLive", performance.now() - renderStart);
	}
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
	async detachProjections(opts) {
		this.transcript?.dispose();
		this.liveAgent?.dispose();
		this.statusLine?.dispose();
		this.streamFeed?.();
		this.streamFeed = null;
		this.projectionDisposer?.();
		this.projectionDisposer = null;
		this.subagentDisposer?.();
		this.subagentDisposer = null;
		this.workflowDisposer?.();
		this.workflowDisposer = null;
		this.taskDoneDisposer?.();
		this.taskDoneDisposer = null;
		this.taskSnapshots = [];
		this.taskNotice = null;
		this.usageFold = null;
		this.glanceEffort = null;
		this.contextWindow = null;
		this.projectionCache = null;
		this.taskItems = null;
		this.planState = {
			active: false,
			pending: false
		};
		this.approval.setAlwaysApprove(false);
		if (this.approval.isPending) this.approval.settle("cancelled");
		if (this.question.isPending) this.question.cancel();
		this.taskPanelVisible = false;
		this.statusPanelVisible = false;
		this.blockWriter.discard();
		this.streamRenderer.reset();
		if (this.ownedHandle !== null) if (opts?.keepHandle === true) {
			this.ownedHandle = null;
			this.modelRef = null;
		} else {
			const handle = this.ownedHandle;
			this.ownedHandle = null;
			await handle.dispose();
		}
		this.transcript = null;
		this.liveAgent = null;
		this.statusLine = null;
		this.controls = null;
	}
	/**
	* 退出：先 flush 所有 live 会话到持久层（退出恢复 checkpoint）、停止 ticker、
	* 卸载投影、恢复终端 raw-mode。
	* @returns 全部 flush 完成后 resolve。
	*/
	async dispose() {
		if (this.disposed) return;
		this.disposed = true;
		if (this.ticker !== null) {
			clearInterval(this.ticker);
			this.ticker = null;
		}
		try {
			await flushAll(this.ctx);
		} catch {}
		this.approvalDisposer?.();
		this.approvalDisposer = null;
		if (this.approval.isPending) this.approval.settle("cancelled");
		this.interactionDisposer?.();
		this.interactionDisposer = null;
		if (this.question.isPending) this.question.cancel();
		await this.detachProjections();
		this.btw.dispose();
		this.taskSurfaceDisposer?.();
		this.taskSurfaceDisposer = null;
		this.stdout.write(ANSI.BRACKETED_PASTE_OFF);
		this.pasteDisposer?.();
		this.pasteDisposer = null;
		this.input.dispose();
		this.resize.dispose();
		this.glance.dispose();
		this.perfMonitor.stop();
		this.live.clear();
	}
	/**
	* 刷新会话列表（供外部面板查询；本 MVP 的会话面板直接读 store）。
	* @returns 全部会话的摘要列表。
	*/
	async refreshSessions() {
		return listSessions(this.ctx);
	}
};
//#endregion
//#region lib/types/theme-custom.js
/**
* 用户自定义主题加载 — `~/.dsh-tui/themes/*.json`。
*
* 文件格式（语义 token 局部覆盖，缺省继承 base 主题）：
* ```json
* {
*   "base": "cobalt",
*   "background": "dark",
*   "description": "My theme",
*   "colors": { "primary": "#ff8800", "toolEdit": "#88ccff" },
*   "overrides": { "userColor": "#ffffff" }
* }
* ```
* 文件名（去 .json）即主题名，引用方式 `custom:<name>`。
* 单个文件解析失败只跳过该文件（stderr 警告），不影响其他主题与启动。
*/
/** 默认自定义主题根目录（`~/.dsh-tui`；源 `rivetHome()` 为天枢路径，移植时改为本包路径）。 */
function defaultThemesRoot() {
	return join(homedir(), ".dsh-tui");
}
/**
* 自定义主题目录。
* @param base - 根目录（测试注入）；缺省 `~/.dsh-tui`。
* @returns `<base>/themes` 路径。
*/
function customThemesDir(base) {
	return join(base ?? defaultThemesRoot(), "themes");
}
const HEX_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;
const COLOR_KEYS = [
	"primary",
	"secondary",
	"success",
	"warning",
	"error",
	"dim",
	"pulseQuiet",
	"pulseActive",
	"pulseAlert",
	"toolShell",
	"toolEdit",
	"toolTest",
	"toolDelegate"
];
const OVERRIDE_KEYS = [
	"userColor",
	"assistantColor",
	"muted",
	"systemColor"
];
function pickHexFields(raw, keys) {
	const out = {};
	if (typeof raw !== "object" || raw === null) return out;
	for (const key of keys) {
		const v = raw[key];
		if (typeof v === "string" && HEX_RE.test(v)) out[key] = v;
	}
	return out;
}
/**
* 解析单个自定义主题 JSON → CustomThemeInput。结构非法返回 null。
* @param text - 主题文件的原始 JSON 文本。
* @returns 过滤掉非法字段后的主题输入；JSON 或顶层结构非法时为 null。
*/
function parseCustomThemeJson(text) {
	let raw;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof raw !== "object" || raw === null) return null;
	const obj = raw;
	const input = {};
	if (typeof obj.base === "string" && obj.base in THEME_PALETTES) input.base = obj.base;
	if (obj.background === "dark" || obj.background === "light") input.background = obj.background;
	if (typeof obj.description === "string") input.description = obj.description;
	input.colors = pickHexFields(obj.colors, COLOR_KEYS);
	input.overrides = pickHexFields(obj.overrides, OVERRIDE_KEYS);
	return input;
}
/** 主题名合法性：字母数字、连字符、下划线（避免 `custom:` 引用歧义/路径注入）。 */
const NAME_RE = /^[A-Za-z0-9_-]+$/;
/**
* 扫描并注册全部自定义主题。返回成功注册的裸名列表。
* 目录不存在 → 空列表（不是错误）。
* @param baseDir - 根目录（测试注入）；缺省 `~/.dsh-tui`。
* @returns 成功注册的主题裸名（不含 `custom:` 前缀）。
*/
function loadCustomThemes(baseDir) {
	const dir = customThemesDir(baseDir);
	let files;
	try {
		files = readdirSync(dir).filter((f) => f.endsWith(".json"));
	} catch {
		return [];
	}
	const loaded = [];
	for (const file of files) {
		const name = basename(file, ".json");
		if (!NAME_RE.test(name)) continue;
		try {
			const input = parseCustomThemeJson(readFileSync(join(dir, file), "utf8"));
			if (!input) {
				process.stderr.write(`[theme] skip invalid custom theme: ${file}\n`);
				continue;
			}
			registerCustomTheme(name, input);
			loaded.push(name);
		} catch {
			process.stderr.write(`[theme] failed to read custom theme: ${file}\n`);
		}
	}
	return loaded;
}
//#endregion
//#region lib/types/stream-window.js
const LIVE_STREAM_TRUNCATION_MARKER = "… truncated live stream output …\n";
/**
* 追加流式输出并保持窗口上限：超过 maxChars 时只留尾部并前置截断标记。
* @param current - 已累计的窗口内容。
* @param next - 新到的输出片段。
* @param maxChars - 窗口字符上限（不含截断标记本身）。
* @returns 追加（并按需截尾）后的窗口内容。
*/
function appendStreamWindow(current, next, maxChars) {
	const combined = current + next;
	if (combined.length <= maxChars) return combined;
	return LIVE_STREAM_TRUNCATION_MARKER + combined.slice(-maxChars);
}
//#endregion
//#region lib/types/scrollback-transcript.js
/**
* Scrollback transcript parser — turns CommitEngine text into message-level units
* for the `/scroll` (pager) overlay search and expansion.
*
* 预留：/scroll overlay 未接线——parseScrollbackTranscript 当前无消费端，仅登记 API。
*
* 解析策略（保守启发式）：
* - 按行扫描，识别消息起始标记。
* - 用户消息：行首（去 ANSI 后）为 `▌` 或 `❯`。
* - 工具结果：行首（去 ANSI 后）为工具卡 bullet 之一（`›` 成功 / `✗` 失败 /
*   `⠋` 进行中 / `?` 待答 / `●` live 卡）。
* - 其余连续行归为一个 assistant/system 块。
* - 截断检测：交给 truncation-marker.ts 的共享正则（同时认中文与历史英文标记）。
*/
const ANSI_RE = /\x1B\[[0-9;]*[a-zA-Z]/g;
function stripAnsi(s) {
	return s.replace(ANSI_RE, "");
}
const TOOL_BULLETS = [
	"●",
	"›",
	"✗",
	"⠋",
	"? "
];
function detectRole(strippedFirstLine) {
	const trimmed = strippedFirstLine.trimStart();
	if (trimmed.startsWith("▌") || trimmed.startsWith("❯")) return "user";
	if (TOOL_BULLETS.some((b) => trimmed.startsWith(b))) return "tool";
	if (trimmed.startsWith("┌─") || trimmed.startsWith("╭─")) return "system";
	return null;
}
function isTruncatedMessage(lines) {
	return lines.some((line) => TRUNCATION_MARKER_RE.test(stripAnsi(line)));
}
function makeSummary(_role, firstLine) {
	const stripped = stripAnsi(firstLine).trimStart();
	const maxLen = 80;
	if (stripped.length > maxLen) return stripped.slice(0, maxLen - 1) + "…";
	return stripped;
}
/**
* 解析 scrollback 内容为消息列表。
* @param content - CommitEngine 累积的 scrollback 全文（可含 ANSI）。
* @returns 消息列表（空白内容返回空数组）。
*/
function parseScrollbackTranscript(content) {
	if (!content.trim()) return [];
	const allLines = content.split("\n");
	const messages = [];
	let currentStart = 0;
	let currentRole = "assistant";
	let currentLines = [];
	function flush(end) {
		if (currentLines.length === 0) return;
		const firstLine = currentLines[0];
		/* v8 ignore next 1 -- unreachable: currentLines.length > 0 已在上方守卫，firstLine 恒有值 */
		if (firstLine === void 0) return;
		messages.push({
			startLine: currentStart,
			endLine: end,
			role: currentRole,
			summary: makeSummary(currentRole, firstLine),
			lines: currentLines,
			isTruncated: isTruncatedMessage(currentLines),
			rawContent: currentLines.map(stripAnsi).join("\n").toLowerCase()
		});
	}
	for (let i = 0; i < allLines.length; i++) {
		/* v8 ignore next 1 -- unreachable: split('\n') 数组无 hole，i < length 时 allLines[i] 恒非 undefined */
		const line = allLines[i] ?? "";
		const role = detectRole(stripAnsi(line));
		if (role !== null) {
			flush(i);
			currentStart = i;
			currentRole = role;
			currentLines = [line];
		} else currentLines.push(line);
	}
	flush(allLines.length);
	return messages;
}
/**
* 在消息列表中搜索 query（大小写不敏感）。
* @param messages - 消息列表。
* @param query - 查询串（trim 后为空返回空数组）。
* @returns 匹配的消息索引数组（升序）。
*/
function searchTranscript(messages, query) {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	const matches = [];
	for (let i = 0; i < messages.length; i++) {
		const message = messages[i];
		if (message !== void 0 && message.rawContent.includes(q)) matches.push(i);
	}
	return matches;
}
/**
* 找到下一个匹配索引，循环（末尾之后绕回首个匹配）。
* @param messages - 消息列表。
* @param current - 当前消息索引。
* @param query - 查询串。
* @returns 下一个匹配索引；无匹配返回 current。
*/
function findNextMatch(messages, current, query) {
	const matches = searchTranscript(messages, query);
	if (matches.length === 0) return current;
	const first = matches[0];
	/* v8 ignore next 1 -- unreachable: matches.length > 0 已在上方守卫，first 恒有值 */
	if (first === void 0) return current;
	return matches.find((idx) => idx > current) ?? first;
}
/**
* 找到上一个匹配索引，循环（开头之前绕回最后匹配）。
* @param messages - 消息列表。
* @param current - 当前消息索引。
* @param query - 查询串。
* @returns 上一个匹配索引；无匹配返回 current。
*/
function findPrevMatch(messages, current, query) {
	const matches = searchTranscript(messages, query);
	if (matches.length === 0) return current;
	const last = matches[matches.length - 1];
	/* v8 ignore next 1 -- unreachable: matches.length > 0 已在上方守卫，last 恒有值 */
	if (last === void 0) return current;
	return [...matches].reverse().find((idx) => idx < current) ?? last;
}
/**
* 估算某条消息在 overlay 中占多少显示行（粗略，折行按显示宽度向上取整）。
* @param message - 消息。
* @param columns - 终端列数（<1 按 1 处理）。
* @returns 估算显示行数（每逻辑行至少 1 行）。
*/
function estimateMessageRows(message, columns) {
	let rows = 0;
	for (const line of message.lines) {
		const w = displayWidth(line);
		rows += Math.max(1, Math.ceil(w / Math.max(1, columns)));
	}
	return rows;
}
/**
* 计算从第一条消息到指定消息起始处的累计显示行数。
* @param messages - 消息列表。
* @param targetIndex - 目标消息索引（不含自身；越界时累计到列表末尾）。
* @param columns - 终端列数。
* @returns 累计显示行数。
*/
function cumulativeRowsToMessage(messages, targetIndex, columns) {
	let rows = 0;
	for (let i = 0; i < targetIndex && i < messages.length; i++) {
		const message = messages[i];
		/* v8 ignore next 1 -- unreachable: i < messages.length 保证 message 恒非 undefined */
		if (message === void 0) continue;
		rows += estimateMessageRows(message, columns);
	}
	return rows;
}
//#endregion
//#region lib/types/gutter.js
/** Single-char gutter glyph + the theme color key used to render it. */
const GUTTER = {
	user: {
		glyph: "▍",
		colorKey: "userColor"
	},
	assistant: {
		glyph: "▍",
		colorKey: "assistantColor"
	},
	thinking: {
		glyph: "┊",
		colorKey: "muted"
	},
	tool: {
		glyph: "│",
		colorKey: "primary"
	},
	system: {
		glyph: "·",
		colorKey: "systemColor"
	}
};
/**
* 某语义类别的 gutter 字形（未知类别回退 system 档）。
* @param kind - gutter 语义类别。
* @returns 单字符 gutter 字形。
*/
function gutterGlyph(kind) {
	return (GUTTER[kind] ?? GUTTER.system).glyph;
}
//#endregion
//#region lib/types/ui-glyphs.js
/**
* 高频 UI chrome 的宽度稳定字形。
*
* 核心界面不使用彩色 emoji：它们由宿主字体决定颜色与字面，通常占两列，
* 会让主题语义色失效。legacy 终端继续走纯 ASCII 降级。
*/
const UNICODE_GLYPHS = {
	sideQuestion: "◇",
	planSubmitted: "◈",
	planApproved: "✓",
	planRejected: "✗",
	planExecuted: "◆"
};
const ASCII_GLYPHS = {
	sideQuestion: "?",
	planSubmitted: "-",
	planApproved: "+",
	planRejected: "x",
	planExecuted: "*"
};
/**
* 当前终端应使用的字形集。
* @returns legacy 终端为 ASCII 降级档，其余为 Unicode 档。
*/
function uiGlyphs() {
	return useAsciiGlyphs() ? ASCII_GLYPHS : UNICODE_GLYPHS;
}
//#endregion
//#region lib/types/index.js
/**
* @deepseek-ai/dsh-tianshu-tui — interactive terminal UI profile bundle. The bundle
* patch rides over dsh-base and inserts this runner under the stable
* `tui-runner` id. Render core: the terminal rendering engine ported from
* `.rivet/tui-source/tui/` (Apache-2.0 source; see SOURCE-MAP.md for the
* per-file mapping). The engine is pure presentation — all agent state arrives
* via {@link TuiPort}.
*
* @module @deepseek-ai/dsh-tianshu-tui
*/
/** Stable Cordis plugin name the bundle patch inserts. */
const name = "tui-runner";
/**
* Mount the terminal UI runner.
* @param ctx - plugin context; the render core wires its services here.
* @param config - stream injection and starting session (defaults to process).
*/
function apply(ctx, config = {}) {
	if (config.workflowHistoryLimit !== void 0 && (!Number.isInteger(config.workflowHistoryLimit) || config.workflowHistoryLimit <= 0)) throw new Error(`[tui-runner] workflowHistoryLimit must be a positive integer, got ${config.workflowHistoryLimit}`);
	const stdin = config.stdin ?? process.stdin;
	const stdout = config.stdout ?? process.stdout;
	ctx.inject([
		"sessions",
		"agents",
		"agentDefaultModel",
		"goals",
		"subagents"
	], (runtimeCtx) => {
		const teardown = async () => {
			await app.dispose();
		};
		const onSigint = () => {
			teardown();
		};
		const app = new TuiApp({
			ctx: runtimeCtx,
			stdin,
			stdout,
			onExit: () => {
				teardown();
			},
			...config.initialSessionId === void 0 ? {} : { initialSessionId: config.initialSessionId },
			...config.editorKey === void 0 ? {} : { editorKey: config.editorKey },
			...config.vimEnabled === void 0 ? {} : { vimEnabled: config.vimEnabled },
			...config.vision === void 0 ? {} : { vision: config.vision },
			...config.workflowHistoryLimit === void 0 ? {} : { workflowHistoryLimit: config.workflowHistoryLimit }
		});
		stdin.on("SIGINT", onSigint);
		ctx.effect(() => () => {
			stdin.off("SIGINT", onSigint);
			return teardown();
		});
		app.attach().catch((err) => {
			app.dispose().finally(() => {
				console.error("[tui-runner] attach failed:", err);
			});
		});
	});
}
//#endregion
export { ANSI, BUILTIN_COMMAND_NAMES, BlockStreamWriter, CommitEngine, FALLBACK_EDGE, FALLBACK_QUALITY, GUTTER, IMAGE_TEMP_DIR_PREFIX, INPUT_BOX_CHARS, InputController, InputHandler, InputLine, JPEG_QUALITY, LiveEngine, MAX_EDGE, MAX_IMAGES, MAX_IMAGE_BYTES, MIN_FRAME_INTERVAL_MS, OverlayEngine, QUERY_CURSOR_POS, QUERY_TERMINAL_SIZE, ResizeHandler, SLASH_MRU_MAX, SlashCommandRegistry, StatusLineRunner, StreamRenderer, THEMES, THEME_NAMES, THEME_PALETTES, TRUNCATION_MARKER_RE, TuiPerfMonitor, WorkflowStatusLine, WriteBatcher, ambiguousWideEnabled, ambiguousWidthMode, appendStreamWindow, apply, applyWorkflowEvent, autoThemeFor, bg, boxCharsFor, boxInnerWidth, boxOuterWidth, brailleSpinnerFrame, capLiveTail, capLiveTailMarkdownSafe, circleSpinnerFrame, clearCustomThemes, color, createBuiltinCommands, createRingBuffer, cumulativeRowsToMessage, cursorBack, cursorDown, cursorForward, cursorTo, cursorToCol, cursorUp, customThemesDir, detectHyperlinkSupport, detectImageMime, detectImageProtocol, detectTerminalBackground, displayRowsForText, displayWidth, emptyWorkflowView, encodeIterm2Image, encodeKittyImage, encodeTermImage, estimateMessageRows, fg, fileLink, findNextMatch, findPrevMatch, findStableBoundary, formatStatusLine, getActiveThemeBackground, getActiveThemeName, getTheme, gutterGlyph, hexToRgb, hyperlink, imageProtocol, inferPhaseFromTool, isCjkLocale, isCompletePng, isLegacyCjkConsole, isLegacyWindowsConsole, isTuiPerfEnabled, listCustomThemes, loadCustomThemes, loadImageAttachment, looksLikeImagePath, makeImageTempDir, name, osc52Clipboard, padDynamicRegion, parseColorFgBg, parseCustomThemeJson, parseImageDataUrl, parseOsc11Luminance, parseScrollbackTranscript, prepareTermImage, prepareTermImageForCommit, probeImageSize, registerCustomTheme, removeImageTempDir, resetTermCapsCache, resetWidthModeCache, resizeCandidates, resizeJpegCandidates, resolveSlashCommand, resolveThemeEntry, rgbToXterm256, runImageTool, searchTranscript, setHyperlinksEnabled, setImageProtocol, setImageToolRunner, setTermImagePreparer, setTheme, sweepStaleImageTempDirs, toPngCandidates, truncateToDisplayWidth, truncationHint, uiGlyphs, useAsciiBorders, useAsciiGlyphs, wrapToDisplayWidth };
