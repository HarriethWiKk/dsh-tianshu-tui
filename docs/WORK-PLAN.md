# dsh-tianshu-tui 遗留工作实施计划

来源：2026-08-15 全仓功能核查 + 投影层接线后的遗留清单（当日已完成的：视觉桥探测、goals/subagents 可选化、面板 fails-loud 提示、/clear 真清屏、键位表补全、it.todo 翻绿、构建管线两段化、typecheck 门禁）。

使用方式：按优先级表排期；每项自带验收标准。预估为单人净编码+测试时间，不含评审。

## 优先级总表

| # | 项 | 预估 | 阻塞/依赖 | 状态 |
|---|---|---|---|---|
| P0-1 | 宿主视觉桥契约对齐 | 0.5d（宿主仓） | dsh-vision-bridge 所在仓 | 待排期（本仓侧已落地：resolveVisionBridge 探测 + 单测） |
| P1-1 | 平台层静默降级 → 可见提示 | 0.5d | 无 | ✅ 已完成（2e3a2de / 55f3dd0） |
| P1-2 | 仓卫生（CI / lockfile / scratch 目录） | 1d | 无 | 部分完成（lockfile 已跟踪 adc6155；CI 已加 23f4df2；scratch 处置待确认） |
| P1-3 | 文档承诺模块处置 | 0.5h | 无 | ✅ 已完成（e546796） |
| P2-1 | activity-status / activity-store 接线 | 1d | 需真实消费方（决策点） | 暂缓 |
| P2-2 | vision-ask 伴生包改进 | 各自独立 | 见项内 | 待排期 |
| P2-3 | app.ts 拆分（C4 后续波次） | 3-5d | P1-2 的 CI 先行（CI 已就位） | 待排期（可提前） |

---

## P0-1 宿主视觉桥契约对齐（跨仓）

**现状**：本仓已修复 TUI 侧——未注入 `vision` 配置时按宿主 `visionBridge` 服务存在性自动探测（`src/ui/app.ts` `resolveVisionBridge()`），契约已写入 README 装配节，带单测回归。

**待做（宿主 harness 仓，不在本仓）**：dsh-vision-bridge 插件 `provide('visionBridge')`（服务体可为现有 describe 面）；或在 tui profile 的 cordis patch 显式传 `config.vision`。两条路任选，前者免配置。

**验收**：默认 npm 装配 + 桥插件时，text-only 主控发图走桥、气泡显示「经识图桥」；无桥时行为不变（警告图片未发送）。真机 e2e 需 API key。

## P1-1 平台层静默降级 → 可见提示（本仓）

现状均为"失败时用户无任何感知"，统一改为回显一行 `⚠`（复用 `TuiApp.echoWarn`）：

| 路径 | 现状证据 | 改法 |
|---|---|---|
| `Ctrl+V` 剪贴板读图 | 全平台工具链缺失时按键无反应（`src/engine/clipboard-image.ts:133` 返回 null → `src/ui/app.ts` 文本回退分支） | 无图且无文本时回显「剪贴板读图不可用（需 osascript / wl-paste / xclip / PowerShell）」 |
| `Ctrl+E` 外部编辑器 | spawn 失败返回 null 后无任何提示（`src/external-editor.ts:69` → `src/ui/app.ts` 编辑器分支） | 回显「外部编辑器启动失败（$EDITOR=…）：原因」 |
| OSC52 复制 | 终端不支持时序列被无害忽略（`src/engine/ansi.ts` OSC52 组装处） | 每会话首次 `Alt+W` 且终端不支持时提示一次（检测走 `src/term-caps.ts`），后续静默 |
| 自更新失败 | 只在 updated 时通知，failed 完全静默（`src/index.ts:110`） | failed 时在 attach 后写一行 warning（附 `DSH_TUI_SKIP_UPDATE=1` 提示） |

**验收**：每条路径一个行为测试；全量测试绿；不改变降级本身（只是可见）。

## P1-2 仓卫生（本仓）

- **无 CI**：仓内无 `.github/workflows`。新增最小 CI：node `^22.19 || >=24` 矩阵跑 `npm run typecheck && npm test && npm run build`（三门禁均已本地化）。
- **lockfile 未跟踪**：`package-lock.json` 自抽取起未入库，`npm ci` 不可复现。决策点：跟踪它（现状 npm 流）或迁 pnpm 删 lock。建议跟踪 package-lock.json（与现有 scripts/CI 一致）。
- **scratch 目录**：`.superpowers/`、`docs/superpowers/`、`.code-review-graph/` 未跟踪。其中有持续价值的文档（如 C4 拆分方案、kernel 协作设计）归档进 `docs/`，其余移出仓或加 .gitignore。

**验收**：CI 绿；干净 clone 后 `npm ci && npm test` 可复现；`git status` 无意外未跟踪项。

## P1-3 文档承诺模块处置（本仓）

`docs/projection-layer.md` 记录的"设计曾承诺、至今未落地"模块：`cache-telemetry.ts`、`cache-panel-source.ts`、`history-replay.ts`、`adapter/projections.ts`。

**建议**：无当前需求方，从文档移除承诺（历史留在 git）；若任一模块将来有主，再从零设计而非补旧账。README 已知限制节同步。

**验收**：全仓 grep 无残留引用；文档与代码一致。

## P2-1 activity-status / activity-store 接线（决策点，暂缓）

**现状**：模型与 spec 就绪；刻意未接线（`docs/projection-layer.md` 接线现状表已记录理由：statusline 是自包含投影，替换无收益；activity-store 无消费方）。

**触发条件**（满足其一再排期）：
- 出现真实消费方（如 `/activity` 活动面板、委派树活动列）。
- statusline 统一迁移到 activity-status fold（收益是 phase 语义单一来源；成本是过 `tests/statusline*` 全部现有规格）。

**预估**：消费方确定后约 1d。

## P2-2 vision-ask 伴生包改进（独立包，各自独立排期）

- **visionAutoBridge 自动选模**：baseline 模型目录无 `supportsVision` 字段，目前必须显式配 `model`。依赖 harness 侧目录字段落地（跨仓阻塞）。
- **描述缓存持久化**：per-image 缓存现仅内存（`vision-ask/src/registry.ts`），重启重描述。改 `.dsh` 磁盘缓存，约 0.5d。
- **注册表 TUI 可见性**：已登记图片的 badge/列表 surface，依赖 TUI 侧配合（与本仓面板体系对齐）。
- **vision adapter 方言扩展**：现仅最小 OpenAI 方言（不支持 reasoning stream / tool calls），按需扩展。

## P2-3 app.ts 拆分（C4 后续波次）

**现状**：~3.2k 行单体；挂起状态机已控制器化（question/approval），渲染组合（renderLive 面板段编排）与键仲裁（handleKey）仍在 app.ts。C4 方案现存于 `docs/superpowers/`（需先随 P1-2 归档）。

**建议波次**（每波独立可交付、独立过门禁）：
1. 面板段纯函数收尾（render/ 已成形的 7 面板模式推广到剩余段）。
2. 键仲裁表驱动化（handleKey 的 if 链 → 键位→动作表，与 KEYMAP_ENTRIES 单一来源）。
3. 控制器外移收尾（session 切换/投影装配出 app.ts）。

**验收**：app.ts < 1.5k 行；全量测试不回归；P1-2 的 CI 先行（拆分没有 CI 兜底风险大）。

## 杂项（随时可带）

- README 快捷键表补审批卡 `a` 与历史搜索 `p/P` 行 ✅ 已完成（e546796）。
- `docs/2026-08-15-dsh-kernel-collab-design.md`（已归档）的 spark 推理尾部截断协议「本仓尚未接通」——属未来 kernel 协作功能，跟随 harness 侧排期，不在本计划内单列。
