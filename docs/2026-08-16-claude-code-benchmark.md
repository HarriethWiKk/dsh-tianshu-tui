# Claude Code TUI 对标与本仓补强清单

日期:2026-08-16
性质:调研报告(纯分析,未改代码)。对照对象:[Claude Code](https://code.claude.com/docs)(Anthropic 终端 agent)。
范围:补强方向限定「插件侧可做 + 与官方(deepseek-harness)联动」,遵守 TUI 纯展示契约
(不注册 prompt/工具/上下文面;事件 observe-only;workflow 无控制权)。

## 一、Claude Code TUI 工作机制(调研摘要)

| 机制 | Claude Code 行为 |
|---|---|
| 状态行 | 可定制脚本([官方 statusline 文档](https://code.claude.com/docs/en/statusline)):model、git 状态、上下文占用 %、成本 $、耗时、mode 徽标 |
| Diff 审批 | 文件改动前内联展示 diff,终端内**键盘编辑**(hjkl 等),y/N/部分接受后应用 |
| Plan mode | Shift+Tab 循环 normal → auto-accept → plan;plan 展示结构化计划,approve 后执行 |
| Subagents | 运行卡片(任务/进度/结果;曾显示 context/token/cost,[后移除](https://github.com/anthropics/claude-code/issues/71642)) |
| 权限 | 工具调用弹权限提示(允许一次/始终/拒绝);/permissions 浏览 allow 规则 |
| 上下文 | /compact;auto-compact 近满自动压缩;checkpoint 快照 + /rewind 回滚 |
| 会话 | --resume 交互选择;会话列表;fork |
| 输入 | / 命令菜单、@ 引用(文件/目录/agents)、多行、Ctrl+R 历史、vim、外部编辑器 |
| 工具可视化 | 工具调用行展开/折叠、bash 输出切换、耗时 |
| 杂项 | git 未提交提示与 commit 建议、/cost、/mcp、/help、通知、主题 |

## 二、本仓对照(已核实代码事实)

✅ = 已有 · ◐ = 部分 · ✗ = 缺

| Claude Code 机制 | 本仓现状 |
|---|---|
| 状态行 | ✅ glance-bar 全接线:model / effort / 缓存% / **上下文%** / tokens / turn / elapsed(`app.ts glanceMetrics`);git 分支在顶部栏(`gitBranch()` spawn git) |
| 成本 $ | ✗ glance-bar 有 `cost` 段但**无数据源**(harness usage 无 cost 字段) |
| Diff 审批 | ◐ 审批卡内联 diff 预览 + y/N/a/esc;✗ **无 diff 编辑** |
| Plan mode | ✅ Shift+Tab 三态循环;plan 投影在 /status;plan-review 反馈(f + Enter Keep planning) |
| Subagents | ✅ 委派树面板 + 运行行 + 终态行含耗时(`subagent-line elapsedMs`);◐ 无卡片式进度/上下文 |
| 权限 | ◐ /config 权限预设选择器;✗ 无 allow 规则浏览(/permissions 式) |
| 上下文 | ✅ /compact;✗ **无 auto-compact/近满提示**;✅ /rewind 两阶段 + 文件快照 |
| 会话 | ✅ /session new\|list\|switch、恢复面板、Ctrl+S、/fork、/export |
| 输入面 | ✅ / 菜单、@ 补全+mention 展开、多行、Ctrl+F 历史搜索、vim 可选、Ctrl+E 外部编辑器 |
| 工具可视化 | ✅ 工具卡(diff/terminal/文本、折叠组、逐工具计时);◐ live 区只有**最新一张自动展开**,无手动展开键 |
| git 集成 | ◐ 顶部栏分支;✗ 无未提交改动提示/commit 建议 |
| 帮助 | ◐ Ctrl+. 键位表;✗ 无 /help 命令 |
| 其他 | ✅ 推理折叠 Ctrl+O、主题、/density、轮次摘要、/memory、/doctor、/btw、自更新 |

## 三、补强清单(按可行性分级)

### A 级:插件侧直接可做(现有数据/服务已够,不碰 harness)

1. **$cost 段接线** — glance-bar 段已存在,只需内置定价表(deepseek-v4-flash/pro $/MTok)+ billed tokens(已有)。与 CC 成本显示对齐,零依赖。
2. **上下文水位预警** — contextRatio 已有;≥80% 底部行提示「上下文 N%,建议 /compact」,≥95% 强化。auto-compact 提示的插件侧版本。
3. **git 未提交提示** — `gitBranch()` 已有 spawn git 先例;加 `git status --short` 计数,有改动时顶部栏/状态行显示「● N」。与 CC git 段对齐。
4. **/help 命令** — 命令注册表是单一事实来源(27 命令),可生成分类帮助 overlay(命令 + 参数 + 快捷键)。Ctrl+. 已有键位表,补命令侧。
5. **工具卡手动展开/折叠** — live-engine 现只自动展开最新一张;加展开键(如 Enter/`e`)切换任意工具卡。

### B 级:需 harness 配合(官方联动点,官方不扩展则无解)

1. **审批 diff 编辑后应用** — 已核实 `ApprovalRequest`(user-approval)只有 agent/toolName/callId/reason/signal,**无 diff/patch 字段**,结算也无内容回传。对齐 CC 的 diff 编辑需 harness 扩展审批契约(请求带 patch、结算带修改后 patch)。这是与 CC 最大的交互差距,但属 harness 侧工作。
2. **权限规则浏览** — /permissions 式 allow 列表浏览/管理,需 permission 服务暴露规则清单(现 /config 只有预设选择器)。
3. **subagent 卡片上下文/成本** — subagent/end 事件无 usage 数据;需 harness 事件扩展(耗时已可本地算,A 级已覆盖)。
4. **checkpoint 时间线** — /rewind 有,但 checkpoint 历史浏览需 checkpoint 服务数据面。

### C 级:契约硬边界/不该做

- plan mode 的强制只读(harness planMode 服务职责)
- auto-compact 自动触发(主动调 compact 服务越展示层边界;提示属 A 级)
- 工具执行控制、会话/权限安全边界、workflow 控制面(seam 无控制权)

## 四、Top 推荐(按性价比)

1. **$cost 段**(A1)— 零依赖,对齐 CC 成本显示
2. **上下文水位提示**(A2)— 数据已有,纯展示
3. **git 未提交提示**(A3)— spawn git 先例
4. **/help 命令**(A4)— 注册表驱动
5. **工具卡手动展开**(A5)— 交互补强
6. **审批 diff 编辑**(B1)— 最大交互差距,但需先确认官方是否扩展审批契约

## 五、遗留与前提

- B 级各项需先与官方(deepseek-harness)确认契约扩展意愿——按本仓历史(官方不接受社区 PR),
  大概率走「本地分支存档参考实现」或放弃,同 spark 截断与 LSP diagnostics 模式。
- 本报告未改任何代码;实施时按单条 A 级项拆小计划,各自带测试。
