# TUI 层 workflow 观察面改造实施计划(3 项)

日期:2026-08-16
范围:全部在本仓(`dsh-tui`)内,零 harness 依赖,不碰 seam 契约。
背景调研:见 `docs/2026-08-15-dsh-kernel-collab-design.md`(workflow 部分)与本次对
`deepseek-harness/packages/workflow/{workflow,workflow-worker-thread,tool-workflow}` 的源码调研。

## 机制结论(调研摘要)

- Harness 侧 `WorkflowEngine` 是抽象 Service,事件全部 `emit`(observe-only),
  seam 契约明确 **"never expose run control"**——TUI 拿不到 run handle、拿不到
  result value(事件刻意不含),控制面为零。
- TUI 可改造空间 = **更丰富的观察面**:log 事件未消费、meta 块被丢弃、elapsed 填错。
- 六个事件:start / phase / log / agent-start / agent-end / end。TUI 现订阅五个,漏 `workflow/log`。

## 改动 1:elapsed bug 修复(纯 bug)

**问题**:`src/ui/app.ts` L1931(`toWorkflowRunView`,已完成 run)与 L3049(运行中 run)
都填 `elapsedMs: Date.now()`——时间戳被面板 `formatElapsed` 当毫秒时长格式化,
任何 run 显示约 "490000hXXm" 荒谬时长。对照 subagent 正确写法 `Date.now() - startedAt`(L1827)。

**改法**:
1. `WorkflowRunState`(L178-184)加 `startedAt: number`
2. `workflow/start` 订阅(L1842-1845)创建 state 时记 `startedAt: Date.now()`
3. L1931 与 L3049 改 `elapsedMs: Date.now() - run.startedAt`

**测试**(`tests/app.spec.ts` T2.2 段落):fake timers——start 时 T0,渲染时 T0+80s,
断言面板行含 `1m20s`。

## 改动 2:meta 块补全(信息丢失)

**问题**:`workflow/start` 事件 payload 带完整 meta(name/description/phases),
wire 类型(L160-175)只取 `id`;state 无 meta;视图构建 L1919/L3042 用
`name: run.phase ?? run.id`——当前阶段标题被当 run 名,description 恒空,phases 计数丢失。

**改法**:
1. `WorkflowRunInfoWire` 加**可选** `meta?: { name: string; description?: string; phases?: { title: string }[] }`
   ——兼容旧形状 `{ id }` 事件(现有测试与潜在装配方),缺省 fallback `{ name: id, description: '' }`
2. `WorkflowRunState` 加 `meta`(fallback 后形状)
3. `workflow/start` 订阅存 meta
4. L1919 改 `name: run.meta.name ?? run.id`、description 透传;L3042 同改 + phases 透传
   (面板 `projectListRow` 已有 phases 渲染,会自动显示 "N 阶段")

**测试**:app.spec.ts——fire start 带 meta 断言面板行含 `[name]`/描述/阶段数;不带 meta 断言回退 id。

## 改动 3:消费 workflow/log 事件(功能空白)

**问题**:引擎发 `workflow/log`(脚本 `log(message)` 叙述行),TUI 未订阅,叙述无处可见。

**改法**:
1. `WorkflowRunState` 加 `logs: string[]`;订阅数组(L1841)追加 `workflow/log`:
   push + **cap 20**(drop-oldest 防刷屏)+ `renderBatcher.schedule()`
2. `WorkflowRunView`(`src/workflow-panel.ts` L59-67)加 `logs?: string[]`
3. `projectWorkflow` 展开分支(L197-200)追加 `projectLogRows` 纯函数:缩进 log 行,
   截断复用 `truncateByWidth`
4. `toWorkflowRunView`(L1917)与运行中视图(L3040)透传 `logs`
5. **计划偏差(执行中发现)**:`expanded` 此前从未接线(`live-panels.ts` 调
   `projectWorkflow` 不传 expanded → roster/终态/log 行全部不渲染)。log 可见性
   依赖展开,故在 `renderWorkflowPanel` 把**运行中 run**(result 未结算)自动展开
   ——叙述行与 roster 是运行期唯一可见面;已完成 run 保持折叠(只显示列表行)。

**测试**:
- `tests/workflow-panel.spec.ts`:log 行渲染 / 无 logs 不显示 / 超长截断
- `tests/app.spec.ts`:fire `workflow/log`(第二参裸 string,与 `workflow/phase` 测试同构)
  展开面板断言 log 文本;监听器泄漏回归测试(L4568)按 `workflow/` 前缀收集,自动涵盖,无需改

## 实施顺序与验证

1. 改动 1 → `npx vitest run tests/app.spec.ts`(T2.2 段落)
2. 改动 2 → 同上 + `tests/workflow-panel.spec.ts`
3. 改动 3 → 两个 spec + `tests/live-panels.spec.ts`
4. 全量:`npm run typecheck`(含 vision-ask)+ `npm test`

## 风险点

- `workflow/log` payload 形状以 harness 实测为准(裸 string 第二参,与 phase 同构)
- logs cap 20 防脚本刷屏;meta 可选防旧形状事件破版
- 不改任何 harness 文件、不动 `WorkflowRunInfo` 契约

## 范围外(不纳入本次)

- `agentsStarted` 改用事件值(现为本地计数 `run.agents.length`)
- 面板折叠排序、展开交互按键
- run 控制面(start/cancel/dispose)——seam 硬边界,TUI 不可为
