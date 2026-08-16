# Adapter 边界与上游契约

本文档记录 dsh-tianshu-tui 与官方 DeepSeek Harness(`@deepseek-ai/*`)之间的边界规则、
服务面契约与"刻意不做"清单。任何改动都应先对照本文——违反边界的改动是设计错误,
不是功能缺失。

## 边界规则(纯展示契约)

TUI 是**纯展示层**:

- **不注册任何 prompt、工具或上下文面**——模型可见的内容必须已经记录在会话日志中
  ("Model-visible ⟺ logged")。
- **用户输入成为普通日志消息**——TUI 不拥有 agent 循环、不路由、不生成内容。
- **所有渲染状态派生自会话事件流**——不另起数据源、不写 sidecar(会话标题等少量
  只读纯函数 fallback 除外,见 SOURCE-MAP.md)。

违背边界的行为示例:在 TUI 里实现 AgentLoop、把路由/意图写进冻结 system prompt、
用 TUI 命令直接改 agent 请求体。

## 服务依赖面

### 必选(经 `ctx.inject`,缺则 TUI 不启动)

| 服务 | 用途 |
|---|---|
| `sessions` | 会话创建/切换/持久化 |
| `agents` | agent 铸造、会话恢复 |
| `agentDefaultModel` | 默认模型选择(读写) |

### 可选(经 `ctx.reflect.get`,缺则相关能力 fails loud,不阻塞启动)

| 服务 | 消费方 | 缺失行为 |
|---|---|---|
| `goals` | `/goal` | ⚠ 警告 |
| `subagents` | `/subagents` 委派树、subagent 运行行 | ⚠ 警告 |
| `memory` | `/remember` `/memory` | ⚠ 警告 |
| `compact` | `/compact` | ⚠ 警告 |
| `tasks` | `/tasks` 窗格 | ⚠ 警告 |
| `skills` | `/skills` 面板 | ⚠ 警告 |
| `sessionProjections` | `/status` 面板(goal/todos/plan) | ⚠ 警告(会话汇总段仍可用) |
| `workflowEngine` | `/workflow` 面板(事件订阅) | ⚠ 警告 |
| `planMode` | plan 模式状态 | 徽标不显示 |
| `llm` | 模型选择器目录、识图模态刷新 | ⚠ 警告 |
| `visionBridge` | 视觉桥自动探测 | 图片不发送并警告 |
| `userQuestions` | 结构化提问面板 | 降级 |
| `tools` | 工具卡 presenter 桥 | 软降级 |
| `sessionPersistence` | 会话恢复列表 | 降级 |
| `settings` / `permission` / `credentials` | `/config` 面板 | 对应段不渲染 |
| `lsp` | LSP 诊断徽标 | 内置桥降级 |
| `appExit` / `cmdlineArgs` | 退出 / --help | 降级 |
| `commands` | slash 注册表(tui.commands 服务) | /help 警告 |

## 事件订阅清单

TUI 只订阅、只读、从不发布以下事件(会话事件按 owner 过滤):

| 事件 | 用途 |
|---|---|
| `session/event` | 会话事件流(消息/工具/推理/usage/turn 边界) |
| `workflow/start` `phase` `log` `agent-start` `agent-end` `end` | workflow 运行面板 |
| `subagent/start` `subagent/end` | 委派树与运行行 |
| `approval/request` | 审批卡(waterfall 委托) |

## 能力边界(刻意不做,防重复踩坑)

以下方向经调研确认**不可行或越权**,不要再次尝试:

1. **请求体改写(spark 截断等)**:`agent/request` waterfall 只能替换
   `LlmCallConfig`(provider/model/effort 等),官方契约明确 *"this waterfall cannot
   mutate messages"*。wire 序列化在 harness `llm-deepseek` 内部,TUI 无 hook 面。
   结论:思维链截断等 wire 变换只能由 harness 侧实现(见 docs/2026-08-15-dsh-kernel-collab-design.md)。
2. **workflow 控制面**:`workflow/*` 事件 observe-only(seam 契约 *"never expose run
   control"*),TUI 拿不到 run handle、看不到 result value;启动/取消/销毁属
   holder 职责。
3. **审批 diff 编辑**:`ApprovalRequest` 无 diff/patch 字段,结算无内容回传——
   Claude Code 式"编辑 diff 再接受"需要 harness 扩展审批契约,当前不可做。
4. **路由/意图注入**:展示层不能成为路由权威;意图必须走 harness 侧插件。
5. **auto-compact 自动触发**:主动调 compact 服务越展示层边界;只做提示
   (上下文 ≥95% ⚠ 水位)。

## Bundle Patch

`cordis.patch.yml` 在 `dsh-base` 之上插入 `tui-runner` 插件:

```yaml
- id: tui-runner
  name: '@huiliyi37/dsh-tianshu-tui'
```

插件名固定 `tui-runner`(硬约束,勿改)。`lib/index.js` 是打包产物,必须跟仓
(见 docs/RELEASE.md)。

## 契约版本线

- peerDependencies:`@deepseek-ai/*` `^0.1.0-rc.6`、`@deepseek-ai/cordis` `^4.0.1`
- README 里的官方 CLI `0.1.0-rc.6` 是宿主版本,不是本包版本
- 宿主版本漂移时:先升级 peer 范围再发版,不静默容忍
