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
 * @param baseDir - 根目录（测试注入）；缺省 `~/.dsh-tui`。
 * @returns 成功注册的主题裸名（不含 `custom:` 前缀）。
 */
export declare function loadCustomThemes(baseDir?: string): string[];
