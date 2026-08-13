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
import { type ColorSet, type ThemeName, type ThemeOverrides } from './theme-palettes.js';
export type { ThemeName, ColorSet, ThemeOverrides };
/** 解析后的主题：语义色 token（hex 或 chalk 命名色，随色深轨而定）+ 两个派生色函数。 */
export interface RivetTheme {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    error: string;
    dim: string;
    muted: string;
    pulseQuiet: string;
    pulseActive: string;
    pulseAlert: string;
    userColor: string;
    assistantColor: string;
    systemColor: string;
    /** 品牌词专用色（「天枢」字样、品牌星 ✦）。缺省 = primary。 */
    brandColor: string;
    toolColor: (toolName: string) => string;
    contextColor: (pct: number) => string;
}
/** 内置主题名列表（非空元组，供 /theme 补全与 config schema 枚举）。 */
export declare const THEME_NAMES: [ThemeName, ...ThemeName[]];
/** 一个主题的双色深轨解析结果 + picker 元数据。 */
export interface ThemeEntry {
    truecolor: RivetTheme;
    fallback: RivetTheme;
    /** 面向的终端背景（auto 检测选主题、亮色对比度决策用）。 */
    background: 'dark' | 'light';
    /** /theme picker 描述。 */
    description: string;
}
/** 全部内置主题（palette 定义解析为双轨 ThemeEntry）。 */
export declare const THEMES: Record<ThemeName, ThemeEntry>;
/** 自定义主题输入（theme-custom.ts 从 JSON 文件解析后传入）。 */
export interface CustomThemeInput {
    /** 语义 token 局部覆盖（truecolor 轨；hex）。缺省继承 base。 */
    colors?: Partial<ColorSet>;
    /** userColor/assistantColor/muted/systemColor 覆盖（hex）。 */
    overrides?: ThemeOverrides;
    /** 继承的内置主题。缺省按 background 选 cobalt（dark）/ paper（light）。 */
    base?: ThemeName;
    background?: 'dark' | 'light';
    description?: string;
}
/**
 * 注册自定义主题（不含 `custom:` 前缀的裸名）。覆盖同名旧注册。
 * @param name - 裸名（引用时加 `custom:` 前缀）。
 * @param input - 主题输入（未知 base 名回退按 background 选默认）。
 */
export declare function registerCustomTheme(name: string, input: CustomThemeInput): void;
/**
 * 已注册的自定义主题裸名列表（不含 `custom:` 前缀）。
 * @returns 裸名数组（注册顺序）。
 */
export declare function listCustomThemes(): string[];
/** 清空自定义主题注册表（测试用）。 */
export declare function clearCustomThemes(): void;
/**
 * 解析主题条目：内置名或 `custom:<name>`。未知名返回 undefined。
 * @param name - 主题引用名。
 * @returns 主题条目；未知名返回 undefined。
 */
export declare function resolveThemeEntry(name: string): ThemeEntry | undefined;
/**
 * 切换主题。接受内置名或 `custom:<name>`；未知名 no-op 并返回 false。
 * @param name - 主题引用名。
 * @returns 是否切换成功。
 */
export declare function setTheme(name: ThemeName | (string & {})): boolean;
/**
 * 当前激活的主题引用名（内置名或 `custom:<name>`）。
 * @returns 主题引用名。
 */
export declare function getActiveThemeName(): string;
/**
 * 当前主题面向的终端背景。
 * @returns 背景明暗（激活主题不可解析时落 'dark'）。
 */
export declare function getActiveThemeBackground(): 'dark' | 'light';
/**
 * 当前激活主题按色深分档解析：level >= 2 走 truecolor 轨，否则 fallback 轨。
 * @param colorLevel - 颜色能力等级（缺省 chalk.level）。
 * @returns 解析后的主题（激活名不可解析时落 cobalt）。
 */
export declare function getTheme(colorLevel?: number): RivetTheme;
