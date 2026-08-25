/**
 * activity-band — 统一活动带（CC 对标：活跃进度收敛为输入轨上方的高度封顶固定带）。
 * 回流自 tianshu-public（上游 src/format/activity-band.ts）。
 *
 * `foldActivityItems` 把三类活跃活动（subagent 运行项 / workflow run / 后台任务）
 * 折叠为统一 `ActivityItem[]`（新 `startedAt` 在前）；`formatActivityBand` 渲染为
 * 封顶带：分组计数头 + 每 item 恒 1 行 + 仅最新活跃 subagent 一条 `⎿` 子行 +
 * 常驻入口尾行。纯函数层：同一输入恒返回同一行序列，无 I/O、无时钟副作用
 * （`now`/`tick` 经 opts 注入）。完成项（done/failed）不进带——它们塌成一行
 * commit 进 scrollback（format/subagent-line 与 workflow/end 摘要承担）。
 *
 * 高度约束（防跳）：计数头 ≤1 行、item 行 ≤ maxRows、`⎿` 子行 ≤1 行（仅最新
 * 活跃 subagent）、入口尾行恒 1 行——带高只随「活跃 item 数」变化，数字原地
 * 更新不换行。
 *
 * @module dsh-tui/format/activity-band
 */
import type { RivetTheme } from '../theme.js';
/** 活动类别（统一模型三来源）。 */
export type ActivityKind = 'subagent' | 'workflow' | 'task';
/** 统一活动项（CC 招2 的 `{id,kind,label,...}` 形状，DSH 纯函数层 fold）。 */
export interface ActivityItem {
    id: string;
    kind: ActivityKind;
    label: string;
    status: 'running' | 'done' | 'failed';
    /** running 起计（排序与 elapsed 数据源；缺失排序垫底）。 */
    startedAt?: number;
    /** subagent 工具计数（>0 才渲染；缺失 = 无投影源）。 */
    toolCalls?: number;
    /** subagent 最新 token 数（>0 才渲染；缺失 = 无投影源）。 */
    tokensUsed?: number;
    /** subagent 最近工具名（`⎿` 子行文本）。 */
    lastTool?: string;
    /** workflow 当前 phase 标题（无 phase 事件时缺省）。 */
    phase?: string;
    /** workflow 已启动的 agent() 调用数（>0 才渲染）。 */
    agents?: number;
}
/** subagent 运行项的 fold 输入（child 投影缓存快照可选——缺失则统计段省略）。 */
export interface SubagentRunInput {
    runId: string;
    label: string;
    startedAt?: number;
    /** child 会话 `subagentProgress` 投影快照（结构兼容；out-of-process 无投影源则缺省）。 */
    progress?: {
        toolCalls: number;
        tokensUsed: number;
        lastTool?: string;
    };
}
/** workflow run 的 fold 输入。 */
export interface WorkflowRunInput {
    id: string;
    name: string;
    description: string;
    phase: string | null;
    agentCount: number;
    startedAt?: number;
}
/** 活跃后台任务的 fold 输入（tasks.list() 的运行中/停止中项）。 */
export interface ActiveTaskInput {
    id: string;
    kind: string;
    label: string;
    startedAt?: number;
}
/** foldActivityItems 的输入（全部来自 TuiApp 既有缓存，零新机制）。 */
export interface FoldActivityInput {
    subagentRuns: SubagentRunInput[];
    workflowRuns: WorkflowRunInput[];
    tasks: ActiveTaskInput[];
}
/** 渲染选项。 */
export interface ActivityBandOptions {
    /** 终端列数（行截断预算）。 */
    width: number;
    /** item 行数封顶（正整数；渲染层再钳到 ≥1）。 */
    maxRows: number;
    /** 当前墙钟（epoch 毫秒）；缺失时不渲染 elapsed 段。 */
    now?: number;
    /** spinner 帧计数（subagent 字形随 tick 旋转）。 */
    tick?: number;
    /** ascii 降级（subagent 字形 → `-`/`|` 轮转）。 */
    ascii?: boolean;
    /** 着色主题；缺省输出纯文本（单测友好）。 */
    theme?: RivetTheme;
}
/**
 * 折叠三类活跃活动为统一活动项（仅 running；新 startedAt 在前，缺省垫底）。
 * @param input - subagent 运行项 / workflow run / 活跃后台任务。
 * @returns 统一活动项数组（running 项，startedAt 降序）。
 */
export declare function foldActivityItems(input: FoldActivityInput): ActivityItem[];
/**
 * 渲染统一活动带：分组计数头（活跃 >1 时）+ 每 item 恒 1 行 + 仅最新活跃
 * subagent 一条 `⎿` 子行 + 常驻入口尾行。done/failed 项跳过；超 maxRows 折叠
 * 为 `+N` 尾行（新 startedAt 优先——折叠排序已保证）。空输入/无 running 项
 * 返回空数组（不渲染带）。
 * @param items - 统一活动项（foldActivityItems 输出或等价形状）。
 * @param opts - 行宽、封顶、墙钟、帧与主题。
 * @returns 面板行数组（计数头 ≤1 + item ≤maxRows + 子行 ≤1 + 尾行 1）。
 */
export declare function formatActivityBand(items: ActivityItem[], opts: ActivityBandOptions): string[];
