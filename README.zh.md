# dsh-tui — DeepSeek Harness 终端 UI

[English](README.md) | 中文

`@deepseek-ai/dsh-tui` 是官方 DeepSeek Harness（`dsh`）之上的交互式终端 UI 层，以可插拔 profile bundle 挂载——官方代码零改动（`dsh plugin --profile tui add @deepseek-ai/dsh-tui`，随后 `dsh --profile tui`）。渲染核心移植自天枢终端引擎（Apache-2.0；逐文件来源见 [SOURCE-MAP.md](SOURCE-MAP.md)）。UI 是纯展示层：所有 agent 状态都来自会话事件流，因此实时转录与恢复转录渲染完全一致，任何到达模型请求的内容都必然已被日志记录。

## 亮点

- **终端内的完整会话工作区** — 实时渲染、只增滚动转录、启动时会话恢复、`/fork` 探索分支、`/rewind` 回退（会话截断 + 可选文件回退）、`/export` 导出 Markdown 转录。
- **图片端到端** — 剪贴板粘贴（`Ctrl+V` / 终端菜单粘贴）、以终端图形协议内联渲染（kitty / iTerm2）、经 harness 附件服务投递、让具备视觉能力的模型真正看见——主模型不识图时自动经独立视觉模型把图片转成描述（视觉桥）。
- **终端内交互面** — 结构化提问面板（数字键选择、plan-review 反馈模式）、带内联 `diff` 预览的挂起审批卡片、命令面板、按键表 overlay。
- **推理过程可视化** — think 通道以实时头行流动、在滚动区折叠为紧凑行（`✻ 思考 (3.2s) · 12 行`）、`Ctrl+O` 原位展开（对标竞品：默认折叠）。
- **个性化 harness 集成** — `/doctor` 终端诊断、`/memory` 项目记忆浏览器、`/btw` 后台 agent 侧问、`/model` + `/effort` 热切换（当前会话立即生效）。
- **构造上可审计** — TUI 自身不注册任何 prompt、工具或上下文面；用户输入成为普通日志消息，所有渲染状态都派生自会话事件。

## 功能

### 会话管理

| 能力 | 说明 |
|---|---|
| `/session new\|list\|switch` | 新建、列出、切换会话；恢复时经同一渲染桥重放完整转录 |
| 恢复面板 | 启动时把可恢复会话列表写入滚动区 |
| `/fork [directive]` · `/branch` | 分叉当前会话（历史复制到新子会话），可选带起始指令 |
| `/rewind` | 回退到指定消息——会话截断和/或文件回退到边界前快照 |
| `/export` | 把当前会话转录导出为 Markdown 文件 |
| `/clear` | 清空当前会话滚动区视图 |

### 输入面

- **剪贴板与图片粘贴** — `Ctrl+V` 读取剪贴板图片（回退到文本）；终端菜单粘贴检测图片；看起来像图片的粘贴路径按附件加载；`Alt+W` / vim yank 经 OSC52 把选区复制到系统剪贴板。
- **图片提交** — 附件图片显示 `📎 N images` 标记，提交时在用户气泡下方以内联图形渲染，并经附件服务到达模型；气泡携带识图提示（已转发 / 经视觉模型桥接 / 未发送）。
- **编辑** — vim 键位（可选）、外部编辑器（`Ctrl+E`）、Tab 文件补全、`@mention` 展开、输入历史、多行输入。
- **图片再询问暂缓**（见 Known Limitations）。

### 渲染与投影

- **工具卡实时结算** — 已结算的工具结果按 harness presenter 意图渲染为滚动区卡片：`diff` 结果渲染结构化红/绿文件差异（与审批预览共用）、`terminal` 结果带命令标题 + cwd + 退出/信号徽标、其余折叠为文本卡片。
- **推理通道** — 思考中实时 shimmer 头行、段末折叠滚动行、`Ctrl+O` 在 live 区展开全文。
- **流利度折叠** — 重复的例行工具流量在 quiet 策略下折叠；compact 模式只保留头行。
- **轮次状态** — braille spinner + 阶段文本状态行、workflow 运行汇总、委派树、任务窗格、config/skills 面板作为 live-region 面板。
- **主题** — 内置调色板 + `custom:<name>`；自动终端检测与 16 色降级。

### 交互面板

- **结构化提问** — 数字键选择、`Esc` 取消、重叠保护；plan-review 反馈模式（`f` 进入、`Enter` 提交 Keep planning + 自定义反馈）。
- **审批卡片** — `y`/`N`/`Ctrl+C` 结算挂起审批；工具可 diff 时内联差异预览；diff 不可见时盲批提示；非当前会话请求委托给下一个监听者。
- **命令面板 / 按键表 / 历史搜索 overlay**。

### 模型与视觉

- `/model` — 查看并切换模型（默认 + 当前会话热切；`spark-flash` / `spark-pro` 别名一键切换）。
- `/effort` — 设置推理等级（`off` / `high` / `max`；`auto` 回模型默认），当前会话热切。
- **视觉桥** — 主模型不识图时，自动选定的视觉模型在提交前生成图片描述（一次性路径；见 Known Limitations）。
- `/mcp` — 列出已连接 MCP server 与工具数；`tools <name>` 查看某 server 的工具清单。

### 其他命令

`/theme` · `/config` · `/skills` · `/goal` · `/tasks` · `/subagents` · `/workflow` · `/btw` · `/remember` · `/memory` · `/doctor` · `/compact` · `/clear`

## 安装

```sh
dsh plugin --profile tui add @deepseek-ai/dsh-tui
dsh --profile tui
```

宿主需要官方 `@deepseek-ai/*` 包（`^0.0.1-rc.2` 版本线）与 `@deepseek-ai/cordis`（`^4.0.1-rc.1`）。

## 装配

bundle patch 在 `dsh-base` 之上插入 `tui-runner` 插件：

```yaml
- id: tui-runner
  name: '@deepseek-ai/dsh-tui'
```

`TuiRunnerConfig`（均可选）：`stdin`/`stdout`（流注入，缺省走进程流）、`initialSessionId`、`editorKey`（缺省 `ctrl_o`）、`vimEnabled`（缺省 `false`）、`vision`（supportsVision / bridgeEnabled / bridgeSource，由视觉桥插件配置派生）、`workflowHistoryLimit`（缺省 `50`）。

服务依赖：`sessions`/`agents`/`agentDefaultModel` 必需；`goals`/`subagents`/`memory`/`compact` 可选——未装配的服务 fails loud 报不可用，绝不静默吞。

## 验证

```sh
NO_COLOR=1 pnpm vitest run packages/tui/tui/tests/
```

## Model Experience

无——TUI 渲染已记录的会话事件并转发普通用户输入；不注册任何 prompt、工具或上下文面。

#### KV Cache 影响

无直接影响；经 TUI 提交的用户输入成为普通日志消息，其请求影响归属 session 与 loop 包。

## 已知限制与待办

- **图片再询问暂缓** — opencode-tui 的 ask_image 工具、图片注册表与视觉描述缓存未移植：已发送的图片无法再次询问，同角度重复描述会再次调用视觉模型。视觉桥覆盖一次性提交时描述路径。
- **app.ts 单体（约 2.2k 行）** — 挂起状态机已控制器化（question/approval），渲染组合与键仲裁仍在 app.ts；C4 拆分方案（纯函数面板段）持续推进。
- **引擎 I/O 文件覆盖率豁免** — input-line/live-engine 等终端边界文件在 vitest.config.ts 的豁免清单上（`TODO(tui)` 注释），随真实组合测试线成熟逐步消化。
- **投影模型尚未接线** — 四个纯折叠模型 activity-status/activity-store/turn-summary/summary-state 已带规格落地，App 主体尚未驱动它们。当前状态记录于 [docs/projection-layer.md](docs/projection-layer.md)。

## 许可与来源

Apache-2.0。终端渲染引擎移植自天枢终端 UI 引擎（Apache-2.0）；逐文件来源与修改声明见 [SOURCE-MAP.md](SOURCE-MAP.md) 与 [NOTICE](NOTICE)。
