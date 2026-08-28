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
 * 单个文件解析失败只跳过该文件（警告走 onWarning 回调/stderr 出口），不影响其他主题与启动。
 */
import { type CustomThemeInput } from './theme.js';
/**
 * 自定义主题目录。
 * @param base - 根目录（测试注入）；缺省 `~/.dsh-tui`。
 * @returns `<base>/themes` 路径。
 */
export declare function customThemesDir(base?: string): string;
/**
 * 解析单个自定义主题 JSON → CustomThemeInput。结构非法返回 null。
 * @param text - 主题文件的原始 JSON 文本。
 * @returns 过滤掉非法字段后的主题输入；JSON 或顶层结构非法时为 null。
 */
export declare function parseCustomThemeJson(text: string): CustomThemeInput | null;
/**
 * 扫描并注册全部自定义主题。返回成功注册的裸名列表。
 * 目录不存在 → 空列表（不是错误）。
 * 解析失败/低对比警告：onWarning 注入时路由给回调（TUI 装配收集后落 scrollback），
 * 缺省写 process.stderr（pre-TUI / 独立调用保持可见）。
 * @param baseDir - 根目录（测试注入）；缺省 `~/.dsh-tui`。
 * @param onWarning - 警告收集回调；缺省写 stderr（`[theme] ` 前缀，对齐历史文案）。
 * @returns 成功注册的主题裸名（不含 `custom:` 前缀）。
 */
export declare function loadCustomThemes(baseDir?: string, onWarning?: (message: string) => void): string[];
/**
 * 当前生效主题导出为自定义主题模板（/theme export；P1）。
 * 全量 dump truecolor ColorSet + overrides，base 取内置同名或按背景朝向回退；
 * 写盘成功后就地注册（当场 `/theme custom:<name>` 可用），编辑文件后重启生效。
 * @param nameArg - 目标主题裸名（缺省 `exported-<当前名>`）；非法字符净化为 `-`。
 * @param baseDir - 根目录（测试注入）；缺省 `~/.dsh-tui`。
 * @returns 回显消息（成功含路径；失败含原因）。
 */
export declare function exportCurrentTheme(nameArg?: string, baseDir?: string): string;
