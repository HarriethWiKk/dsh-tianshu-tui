/**
 * T9 纯 ANSI Markdown 格式化器。
 *
 * 从 `markdown-render.tsx` 提取：所有解析逻辑（parseBlocks、parseInline、
 * highlightLine、guessLang、keywordsForLang）保持不变，只将 React 渲染函数
 * 替换为纯 ANSI 字符串构建器。
 *
 * 零 React/Ink 依赖。输出为 ANSI 格式化字符串数组（每行一个元素）。
 */
import type { RivetTheme } from '../theme.js';
/** 行内格式化片段：文本 + 样式标记（bold/italic/code/链接等），渲染期映射为 ANSI。 */
export interface Segment {
    text: string;
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
    underline?: boolean;
    color?: string;
    dimmed?: boolean;
    /** OSC 8 超链接目标（markdown [text](url)）；不支持的终端纯文本降级。 */
    href?: string;
}
/** 块级元素类型（parseBlocks 的判别标签）。 */
export type BlockType = 'paragraph' | 'code' | 'header' | 'list' | 'blockquote' | 'hr' | 'table' | 'math';
/** 块级解析产物：类型 + 原始内容（code 附 language，header 附 level，list 附 items）。 */
export interface Block {
    type: BlockType;
    level?: number;
    language?: string;
    content: string;
    items?: string[];
}
/** 语言高亮配置：关键字集合 + 是否大小写不敏感匹配（SQL/Dockerfile）。 */
export interface LangConfig {
    keywords: Set<string>;
    caseInsensitive?: boolean;
}
/**
 * 语言名（含常见别名）→ 高亮关键字配置。
 * @param lang - 语言名或别名（如 ts/py/golang），大小写不敏感。
 * @returns 匹配的关键字配置；不认识的语言返回 null（不高亮）。
 */
export declare function keywordsForLang(lang: string): LangConfig | null;
/**
 * 单行行内 Markdown 分词：**bold**、*em*、`code`、[text](url) → Segment 序列。
 * 未闭合的分隔符按普通文本处理（不吞字符）。
 * @param text - 单行文本（不含换行）。
 * @returns 顺序覆盖整行的 Segment 数组。
 */
export declare function parseInline(text: string): Segment[];
/**
 * 多行 Markdown 块级解析：代码围栏、$$/\[ 数学块、标题、hr、引用、列表、
 * 表格与段落。未闭合的代码围栏/数学块收集到文末。
 * @param text - 完整 Markdown 文本（可多行）。
 * @returns 按出现序的 Block 数组。
 */
export declare function parseBlocks(text: string): Block[];
/**
 * 单行代码语法高亮：字符串/数字/关键字/类型名/函数调用/标点/注释分段着色。
 * @param line - 单行代码文本。
 * @param keywords - 语言关键字集合；null 时整行按普通文本返回（不高亮）。
 * @param caseInsensitive - 关键字匹配是否大小写不敏感（SQL/Dockerfile）。
 * @param theme - 当前主题；缺省时回退硬编码色。
 * @returns 顺序覆盖整行的 Segment 数组（带 color 标记）。
 */
export declare function highlightLine(line: string, keywords: Set<string> | null, caseInsensitive?: boolean, theme?: RivetTheme): Segment[];
/**
 * 从代码文本前 500 字符启发式猜测语言（typescript/python/go/rust/bash）。
 * @param text - 代码文本。
 * @returns 猜中的语言名；无法判定返回 undefined。
 */
export declare function guessLang(text: string): string | undefined;
/**
 * 快速判定文本是否含 Markdown/数学/链接语法（决定 formatMarkdown 是否走完整解析）。
 * @param text - 待检测文本。
 * @returns 含任一 Markdown 信号（强调/代码/标题/列表/引用/hr/数学分隔符/链接）时 true。
 */
export declare function hasMarkdown(text: string): boolean;
/**
 * 1. 尝试检测并格式化 Git Commit 提交标签行
 * 示例: "95454cd0  — 5 files, +70/-4。"
 * @param line - 待检测的单行文本（保留前导缩进）。
 * @param theme - 当前主题（hash/分隔符/增删计数分色）。
 * @returns 命中提交行格式时返回染色后的行；否则 null（调用方走普通渲染）。
 */
export declare function tryFormatGitCommitLine(line: string, theme: RivetTheme): string | null;
/**
 * 2. 高亮行首的代码序号（如 ①-⑩ / ❶-❿ / 1. 2. 等）
 * @param renderedLine - 已渲染的行（可含 ANSI；只改写行首序号段）。
 * @param theme - 当前主题（序号用 warning 色加粗）。
 * @returns 行首命中序号时返回改写后的行；否则原样返回。
 */
export declare function highlightCodeLineNumber(renderedLine: string, theme: RivetTheme): string;
/** formatMarkdown 的渲染输入。 */
export interface FormatMarkdownInput {
    text: string;
    /** 可选语言提示（用于语法高亮） */
    language?: string;
    /** 终端宽度 */
    columns: number;
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
export declare function formatMarkdown(input: FormatMarkdownInput, theme: RivetTheme): string[];
