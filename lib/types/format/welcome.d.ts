import type { RivetTheme } from '../theme.js';
/** formatBrandWelcome 的渲染输入。 */
export interface FormatBrandWelcomeInput {
    width: number;
    /** 品牌名（缺省 'dsh-tianshu-tui'）。 */
    brand?: string;
    /** 副标题（缺省 'DeepSeek Harness'）。 */
    subtitle?: string;
    /** 插件版本号（提供时副标题行追加 ` · v<version>`；缺省不追加）。 */
    version?: string;
    /** 水平对齐；hero 左栏用 left，窄屏叠放用 center（缺省）。 */
    align?: 'center' | 'left';
}
/**
 * 欢迎页品牌区：主标 brand（BOLD brandColor）+ 副标题（muted），各一行。
 * @param input - 宽度、品牌名、副标题与对齐。
 * @param theme - 当前主题（主标 brandColor BOLD，副标题 muted）。
 * @returns 两行 ANSI；width ≤ 0 返回空数组。
 */
export declare function formatBrandWelcome(input: FormatBrandWelcomeInput, theme: RivetTheme): string[];
/**
 * 首次启动环境检查结果，供欢迎页环境行使用。
 */
export interface WelcomeEnvCheck {
    /** API key 是否已配置（env / credentials 文件 / .env 分层，非仅环境变量）。 */
    hasApiKey: boolean;
    /** 当前目录是否为 git 仓库（git status 可执行）。 */
    isGitRepo: boolean;
    /** 当前主题引用名（如 'graphite'，环境行首段展示）。 */
    themeName: string;
    /** 终端列数（宽度预算）。 */
    cols: number;
    /** 水平对齐；hero 左栏用 left，窄屏叠放用 center（缺省）。 */
    align?: 'center' | 'left';
}
/**
 * 环境检查紧凑行（欢迎页常驻）：`graphite · API Key ✓ · Git ✓`。
 * 缺 API key 时该段换 warning 色并携带可行动提示（设 DEEPSEEK_API_KEY）；
 * git ✗ 仅信息性展示。用「API Key」措辞（非 footer 的「API ✗」）。
 * @param env - 环境检查结果（主题名/API key/git/对齐）。
 * @param theme - 当前主题（muted；缺 key 段 warning）。
 * @returns 单行 ANSI；cols ≤ 0 返回空数组。
 */
export declare function formatEnvCheckLine(env: WelcomeEnvCheck, theme: RivetTheme): string[];
/** 欢迎页 Tips 一项（快捷键 + 说明；不可用项整行 muted）。 */
export interface WelcomeTipItem {
    /** 快捷键（如 'ctrl+n'、'/'）。 */
    keyHint: string;
    /** 说明（如 '新会话'）。 */
    label: string;
    /** 可用性；false 时整行 muted（如无可恢复会话）。 */
    available?: boolean;
}
/** formatWelcomeTips 的渲染输入。 */
export interface FormatWelcomeTipsInput {
    width: number;
    items: readonly WelcomeTipItem[];
    /** 水平对齐；宽屏右栏 left，窄屏叠放 center（缺省 left）。 */
    align?: 'center' | 'left';
}
/**
 * 欢迎页右栏 Tips：标题 + 快捷键列对齐 + 说明。
 * 不可用项整行 muted 且仍显示 keyHint（与旧菜单不同：tips 要让用户知道键还在）。
 * 空 items 仍渲染标题（调用方恒有一组默认 tips）。
 * @param input - 宽度、tips 项与对齐。
 * @param theme - 当前主题（标题 brandColor，hint secondary，说明 muted）。
 * @returns ANSI 行数组。
 */
export declare function formatWelcomeTips(input: FormatWelcomeTipsInput, theme: RivetTheme): string[];
/** 宽屏左品牌 / 右 tips 的最小列数。 */
export declare const WELCOME_HERO_WIDE_MIN = 72;
/** 欢迎区 / live chrome 左侧留白（列）。避免鲸鱼、品牌、输入轨贴边。 */
export declare const CHROME_GUTTER = 2;
/** formatWelcomeHero 的渲染输入。 */
export interface FormatWelcomeHeroInput {
    width: number;
    /** 已渲染的鲸鱼行（可能为空：窄屏/无色/legacy 降级）。 */
    whale: readonly string[];
    env: WelcomeEnvCheck;
    tips: readonly WelcomeTipItem[];
    /** 插件版本号（透传 formatBrandWelcome 副标题行）。 */
    version?: string;
}
/**
 * 欢迎英雄区：宽屏左鲸鱼/品牌/环境 + 右 Tips zip；窄屏垂直居中叠放。
 * @param input - 终端宽、鲸鱼行、环境检查、tips 项。
 * @param theme - 当前主题。
 * @returns ANSI 行数组；width ≤ 0 返回空数组。
 */
export declare function formatWelcomeHero(input: FormatWelcomeHeroInput, theme: RivetTheme): string[];
