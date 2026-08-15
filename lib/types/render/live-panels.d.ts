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
import type { LiveSnapshot } from './live-snapshot.js';
/**
 * 渲染 glance 段：状态行 + 错误行。
 * 状态/错误行为纯文本（组合器按需着色）。metrics 行自 C4 概念稿 C 起移出
 * glance 面板——由 renderLive 在输入行下方常驻渲染（三行底部区），避免
 * 顶部/底部双份。
 * @param snapshot - 当前帧快照。
 * @returns 面板行数组（状态行恒存在；错误行按数据追加）。
 */
export declare function renderGlancePanel(snapshot: LiveSnapshot): string[];
/**
 * 渲染会话 tab 栏（P3 side conversation）：状态栏上方单行，全部 live 会话
 * 的缩略 tab。活跃会话 ▸ 前缀；运行中会话 ⏳ 后缀。单会话不渲染——tab 只在
 * 有多个目标可切换时才有信息量，单会话的随机短 id 白占一行（chrome 瘦身）。
 * @param snapshot - 当前帧快照。
 * @returns tab 栏行（0 或 1 行；纯文本，着色由组合器按整行处理）。
 */
export declare function renderSessionTabs(snapshot: LiveSnapshot): string[];
/**
 * 渲染任务面板：任务窗格（projectTaskPanel） + 后台任务区（taskSnapshots
 * 逐行）。面板隐藏 → 空数组；taskItems 为 null（服务缺失/未写入）→ 窗格不
 * 渲染，后台任务区独立渲染（与 renderLive 现状同语义）。
 * @param snapshot - 当前帧快照。
 * @returns 面板行数组（窗格行在前，后台任务区行在后）。
 */
export declare function renderTasksPanel(snapshot: LiveSnapshot): string[];
/**
 * 渲染 /config 设置面板（设置段 + 权限预设选择器 + 凭据徽章）。面板隐藏或
 * 投影为 null（服务缺失）→ 空数组。settings 契约是数组；违约形状（非数组，
 * 如单对象）归一为 descriptor 数组再渲染，避免 for...of 对非迭代对象抛错。
 * @param snapshot - 当前帧快照。
 * @returns 面板行数组。
 */
export declare function renderConfigPanel(snapshot: LiveSnapshot): string[];
/**
 * 渲染 /skills 技能面板（标题 + 列表行 + 命中的选中详情行）。面板隐藏 →
 * 空数组；空列表渲染标题 + 空态占位（由 projectSkillPanel 承担）。
 * @param snapshot - 当前帧快照。
 * @returns 面板行数组。
 */
export declare function renderSkillsPanel(snapshot: LiveSnapshot): string[];
/**
 * 渲染 /subagents 委派树面板（标题 + 每层委派一行）。面板隐藏或 entries 为
 * null（服务缺失/未预取）→ 空数组（降级不渲染）。
 * @param snapshot - 当前帧快照。
 * @returns 面板行数组。
 */
export declare function renderDelegationPanel(snapshot: LiveSnapshot): string[];
/**
 * 渲染 /workflow 运行态面板（列表行 + 终态汇总）。面板隐藏 → 空数组。
 * projectWorkflow 只消费 meta.name；本适配层把 run id 注入列表行
 * （meta.description 追加 "(id)" 后缀；name 已是 id 时不重复），使 run 标识
 * 在面板可见且不破坏 [name] 徽标形态。
 * @param snapshot - 当前帧快照。
 * @returns 面板行数组。
 */
export declare function renderWorkflowPanel(snapshot: LiveSnapshot): string[];
/**
 * 渲染 /status 状态面板（目标段 + 任务段 + 计划段 + 会话汇总段）。面板隐藏 →
 * 空数组。todos 为 null 时任务段渲染「（无任务）」占位（区别于 goal/plan 为
 * null 时对应段不渲染的语义——todos null = 已清空/未写入，面板打开即展示
 * 任务区）。会话段数据源是 TUI 本地 summary-state fold（不依赖宿主投影总线，
 * turns 为 0 时该段不渲染）。
 * @param snapshot - 当前帧快照。
 * @returns 面板行数组。
 */
export declare function renderStatusPanel(snapshot: LiveSnapshot): string[];
