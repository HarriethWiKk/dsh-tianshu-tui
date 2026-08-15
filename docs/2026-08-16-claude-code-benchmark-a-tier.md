# A 级补强实施计划(Claude Code 对标 5 项)

日期:2026-08-16
依据:`docs/2026-08-16-claude-code-benchmark.md` A 级清单(插件侧直接可做,零 harness 改动)。
纪律:全部纯展示/交互层改动,遵守 TUI 纯展示契约;每项带测试;验证 typecheck + npm test。

## A1 — $cost 段接线

**现状**:glance-bar 有 `cost` 段(`$${cost}`)但(1)无数据源;(2)footer 调用处
(`app.ts` bottomMetrics 组装)不传 `density` → cost 段(仅 full 档渲染)实际永不显示。

**改法**:
1. 新文件 `src/format/pricing.ts`:内置定价表(deepseek-v4-flash/pro $/MTok,输入/输出/缓存读)
   + `estimateCost(modelName, usage): number | undefined`(未知模型 → undefined,诚实降级同缓存%)。
   billed 输入 = inputTokens + cacheRead + cacheWrite;cost = 输入×输入价 + 缓存读×缓存价 +
   缓存写×输入价 + 输出×输出价,除以 1e6。
2. `glance-bar.ts`:`cost` 段改为**有值即显示**(不再依赖 density full——footer 无 density,
   语义修正,更新 glance-bar.spec 相关断言)。
3. `app.ts glanceMetrics()`:usage 折叠存在且定价表命中时喂 `input.cost`(两位小数)。

**测试**:pricing.spec(flash/pro 计算、缓存字段缺省、未知模型 undefined);glance-bar.spec 更新。

## A2 — 上下文水位预警

**现状**:上下文段 `上下文 N%` 无条件渲染,无近满警告。

**改法**:`glance-bar.ts` 上下文段:ratio ≥ 0.95 → `⚠上下文 N%`(警告字形,与 CC 的
context 高水位提示对齐;0.8–0.95 保持现状)。纯函数改动,阈值常量导出。

**测试**:glance-bar.spec 增阈值用例(94% 无 ⚠ / 95% 有 ⚠)。

## A3 — git 未提交改动提示

**现状**:顶部栏只有分支(`gitBranch()` spawn git rev-parse);无未提交状态。

**改法**:
1. `top-bar.ts` 输入加 `dirty?: number`:分支段渲染 `(branch ●N)`(dirty > 0 时;●N 用
   warning 色)。有 dirty 但无分支时不渲染。
2. `app.ts`:`gitDirtyCount()`(spawn `git status --short`,统计非空行,失败/非仓库 → 0);
   缓存于 `this.gitDirty`,**attach/mountSession 时与 turn/end 事件时刷新**(case 'turn/end'
   已定位 L2904;每帧 spawn 太贵)。
3. 顶部栏组装处透传 dirty。

**测试**:top-bar.spec(dirty 段渲染/0 不渲染/窄宽丢弃);app.spec(gitDirtyCount 经 mock
  spawn 或直接断言 turn/end 后刷新——spawn 不易 mock,用 top-bar 纯函数测试 + app 侧
  验证透传存在即可,避免 spawn 依赖)。

## A4 — /help 命令

**现状**:无 /help;快捷键侧已有 Ctrl+. 键位表。

**改法**:
1. `BUILTIN_COMMAND_NAMES` 加 `'help'`;`createBuiltinCommands` 注册 help 命令:
   run 时经 `ctx.reflect.get('tui.commands')` 取注册表 `list()`,逐行 echo
   `/name argsHint — description`(argsHint 缺省省略),末尾提示「Ctrl+. 查看键位表」。
   注册表缺失时回显警告(与其他服务面同款 fails loud)。
2. 命令描述/argsHint 已存在于注册表(单一事实来源),无需重复元数据。

**测试**:commands.spec——/help 回显全部命令名与描述;注册表缺失时警告。

## A5 — 工具卡手动展开/收起

**现状**:live 区进行中工具卡只有最新一张显示 tail(`latest` 判定),无手动展开。

**改法**:
1. `app.ts` 加 `expandedToolCallId: string | null`;handleKey 增分支:
   `enter` 且输入行为空且存在 pendingTools → 切换「最后一张」展开/收起
   (expandedToolCallId = null ↔ latest.callId)。输入行非空时 Enter 仍是提交,不冲突。
2. live 工具卡渲染处(L3257 循环):`expanded = this.expandedToolCallId === tool.callId`
   时 `tailLines` 给大值(20),其余维持现状(latest 3/紧凑 1/其他 0)。
3. turn/end 时复位 expandedToolCallId(工具结算后无意义)。

**测试**:app.spec——空输入 Enter 展开最后一张(输出 tail 行出现),再按收起;
  输入行非空 Enter 不触发(仍提交)。

## 实施顺序与验证

1. A1(pricing.ts + glance-bar 语义 + 接线)→ pricing.spec + glance-bar.spec
2. A2(glance-bar 阈值)→ glance-bar.spec
3. A3(top-bar dirty + app 刷新)→ top-bar.spec + app.spec
4. A4(/help)→ commands.spec
5. A5(展开交互)→ app.spec
6. `npm run typecheck` + `npm test` 全量

## 风险

- A1 cost 段语义变更(不再依赖 density)是行为调整,更新既有 glance-bar 断言;
  窄宽 drop 顺序不变(cost 仍后 drop)。
- A3 spawn git 只在边界刷新(挂载/turn-end),不逐帧 spawn;spawn 失败静默降级。
- A5 Enter 仅在输入行为空时生效,不劫持提交;Esc 不参与(overlay 关闭优先)。

## 范围外

- B 级(审批 diff 编辑、权限规则浏览、subagent 卡片成本、checkpoint 时间线)待官方契约确认
- auto-compact 自动触发(越展示层边界)

## 执行记录与设计偏差(2026-08-16 实现后)

1. **A1**:`cost` 段语义从「仅 density full 档」改为「有值即显示」——footer 组装
   不传 density(此前 cost 段即使有数据也永不显示),此修正使成本在 footer 可见;
   `#turn` 保持 full 档不变。
2. **A3 显示位置偏差**:顶部栏是 attach 时渲染一次的静态启动行(commitToScrollback
   后不重绘),未提交提示改放 **footer 右段**(每帧重绘):`●N` 置于 metrics 前,
   窄宽先于 metrics 丢。数据源 `gitDirtyCount()`(spawn `git status --short`),
   attach + turn/end 边界刷新,不逐帧 spawn。
3. **A5 语义调整**:live 进行中工具卡无输出 tail(app 不传 outputTail,tail 区是
   占位行),「展开看输出」无内容可看。改为展开渲染**工具参数 JSON 行**
   (`formatToolCardLive` 新增 `expanded` 参数);切换键为空输入 Enter(`return`),
   输入行非空时 Enter 仍是提交不劫持;turn/end 复位。
4. 测试用 bootEventApp 无键盘链路(键盘注册在 attach)——A5 集成测试改用
   attach 模式构造(2466 同款)。
