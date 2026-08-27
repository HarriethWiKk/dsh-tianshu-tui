# 架构

dsh-tianshu-tui 是 Cordis 插件(`tui-runner`),挂在官方 DeepSeek Harness 之上。
核心原则:**纯展示层**——不注册任何 prompt/工具/上下文面,所有渲染状态派生自
会话事件流。完整边界见 [ADAPTER.md](../ADAPTER.md)。

## 分层总览

```
src/
├── index.ts                插件入口:声明依赖、装配 TuiRunnerConfig、挂载 TuiApp
├── ui/app.ts               核心单体(约 3.6k 行):装配、事件订阅、键盘仲裁、渲染组合
├── ui/render.ts            转录渲染:消息 → 滚动区行(markdown/思考块/工具卡)
├── adapter/                会话事件流适配(fold 成展示视图)
│   ├── transcript.ts       消息/工具/推理折叠(TextBlock → 渲染行)
│   ├── sessions.ts         会话列表/恢复(含标题 fold)
│   ├── send.ts / tool-view.ts / live.ts / session-title.ts
├── engine/                 终端渲染引擎与输入
│   ├── live-engine.ts      live 区增量重绘(ticker 驱动、CPR 自愈)
│   ├── commit-engine.ts    滚动区提交
│   ├── input-handler.ts / input-controller.ts / input-line.ts  键盘与输入行
│   ├── stream-renderer.ts  流式文本块写
│   ├── overlay-engine.ts / overlay-controller.ts  overlay 生命周期
│   ├── clipboard-image.ts / image-attach.ts / image-tool.ts / term-image.ts  图片链路
│   └── resize-handler.ts / write-batcher.ts / perf-monitor.ts
├── controllers/            挂起状态机
│   ├── question-controller.ts  结构化提问
│   ├── approval-controller.ts  审批(always-approve 本地态)
│   ├── btw-controller.ts       侧问
│   └── session-manager.ts      会话管理
├── actions/                键位动作注册表(handleKey 动作化;keymap/footer 提示与审批梯度同源投影)
├── format/                 纯渲染函数(无 I/O,全部可单测)
│   ├── markdown.ts / diff.ts / tool-card.ts / tool-group.ts / tool-family.ts
│   ├── glance-bar.ts / top-bar.ts / prompt-footer.ts / welcome.ts
│   ├── reasoning.ts / turn-summary.ts / spinner-status.ts
│   ├── approval-card.ts / permission-diff.ts / question 相关
│   ├── workflow-panel.ts / delegation-panel.ts / status-panel.ts / config-panel.ts
│   ├── pricing.ts / history-search-overlay.ts / keymap-panel.ts ...
├── render/                 live 快照与面板投影(live-panels / live-snapshot)
├── lsp/                    LSP 诊断桥(懒启动 server,纯展示本地缓存)
├── picker.ts               交互式选择器(issue #31)
├── command-palette.ts      命令面板
├── theme.ts / theme-palettes.ts / theme-detect.ts / theme-custom.ts  主题
├── statusline.ts / restore-session.ts / self-update.ts / external-editor.ts
└── completion/             @ 路径补全
```

## 数据流

```
会话事件(session/event)                          workflow/* / subagent/* / approval/request
      │                                                      │
      ▼                                                      ▼
adapter/transcript.ts(fold)                    app.ts 订阅缓存(workflowRuns / 委派树 / 审批)
      │
      ▼
Transcript 视图(消息 / 工具 / 推理 / usage 折叠)
      │
      ├── 已落定内容 → commit-engine → 滚动区(主屏)
      └── 进行中内容 → renderLive → live 区(底部动态区域,120ms ticker 重绘)
```

- **滚动区**(scrollback):已提交的稳定内容,增量写入主屏。
- **live 区**:进行中的工具卡、推理头行、subagent 运行行、提问/审批卡、输入轨、
  footer、metrics 行。行数追踪 wrapping-aware,光标常驻区域末行,CPR 探针自愈。
- **事件折叠是纯函数**:transcript/turn-summary/summary-state 等 fold 只读事件,
  不写回任何状态(可测、可重放)。

## 投影层

部分面板数据经宿主 `sessionProjections` 总线(goal/todos/plan 三域);总线缺失时
本地 fold 兜底(轮次摘要、会话汇总段)。接线状态见 `docs/projection-layer.md`。

## 控制器

挂起交互都是**显式状态机**(不散落在渲染回调里):

- **QuestionController**:提问 → 选项 → 结算;重叠保护;plan-review 反馈模式。
- **ApprovalController**:审批卡决策梯度 y/p/t/a/n/f/esc(p 命令前缀白名单、f 拒绝附反馈);
  always-approve 本地短路;非当前会话委托。
- **BtwController**:侧问生命周期(Esc 折叠答案入滚动区)。
- **SessionManager**:新建/分叉/切换/恢复。

键位仲裁也已动作化:`src/actions/` 的 ActionRegistry 持有全部内置键位动作(含 approval
域梯度),`Ctrl+.` 键位表与 footer 提示从动作表同源投影(`actions/projections.ts`),
不再各画一份。

## Overlay 体系

全屏 overlay(命令面板、键位表、历史搜索、rewind、记忆浏览器、选择器)经
`OverlayController` 管理:打开进 alt screen、激活渲染器、Esc/Ctrl+C 关闭、
关闭后补写暂存 scrollback、同步重绘 live 区。

## 主题与终端适配

两段式:调色板定义(`theme-palettes.ts`,语义 token → 颜色值 + background +
description)→ 语义解析(`theme.ts`)。自动终端检测 + 16 色降级 + ASCII 降级。

## 关键设计决策

- **单逻辑行契约**:live 区每行单逻辑行,嵌入换行会被 normalize 展开
  (display-width 计算稳定)。
- **有界缓存**:workflow 已结算 run 限 `workflowHistoryLimit`(缺省 50);
  工具卡最多同时展示 3 张(LIVE_TOOL_CARD_MAX),超限折叠。
- **诚实降级**:数据缺失 → 对应段省略(缓存% 未报不显示 0%、未知模型不猜价),
  服务缺失 → ⚠ 警告,fails loud 不静默。
- **app.ts 单体**(约 3.6k 行):挂起状态机已控制器化,渲染组合与键仲裁仍在
  app.ts;C4 拆分方案持续推进(纯函数面板段已大部抽出到 format/)。
