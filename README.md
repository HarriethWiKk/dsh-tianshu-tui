# dsh-tianshu-tui — DeepSeek Harness coding 终端 

[![npm](https://img.shields.io/npm/v/@huiliyi37/dsh-tianshu-tui.svg)](https://www.npmjs.com/package/@huiliyi37/dsh-tianshu-tui)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@huiliyi37/dsh-tianshu-tui.svg)](https://www.npmjs.com/package/@huiliyi37/dsh-tianshu-tui)
[![release](https://img.shields.io/github/v/release/huiliyi37/dsh-tianshu-tui?include_prereleases)](https://github.com/huiliyi37/dsh-tianshu-tui/releases)
[![dshfind](https://dshfind.com/api/badge/huiliyi37/dsh-tianshu-tui?lang=zh)](https://dshfind.com/zh/plugins/huiliyi37/dsh-tianshu-tui?ref=badge)

中文 | [English](README.en.md)

![dsh-tianshu-tui](docs/promo.png)

**dsh-tianshu-tui**（`@huiliyi37/dsh-tianshu-tui`）是官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 上的交互式终端 UI 插件。渲染核心为自研的 ANSI 极简引擎（由作者自己的开源项目 [天枢 Tianshu-Tui](https://github.com/huiliyi37/Tianshu-Tui) 演进而来，Apache-2.0；逐文件来源见 [SOURCE-MAP.md](SOURCE-MAP.md)），渲染轻量不打断，使用体验流畅。UI 是纯展示层：所有 agent 状态都来自会话事件流。在此之上做了 harness 工程层的个性化改造，如图像与视觉桥接、代码智能检索、记忆与跨会话召回等。


> [!WARNING]
> **生态边界（Ecosystem boundary）**：本插件属于官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`@deepseek-ai/*` 生态）——peerDependencies 与代码 import 均指向 `@deepseek-ai/*`。**不要把它装配进 oh-my-tianshu（`@huiliyi37` 生态，CLI 为 `@huiliyi37/dsh-tianshu`）的 tui profile**。oh-my-tianshu 的官方 TUI 是 `@huiliyi37/dsh-tui`：两者同源（共享 109/117 个 TUI 源文件）但生态不同，混装会让插件在运行时靠 `~/.dsh/profiles/node_modules` 中指向官方 dsh 的旧符号链接兜底解析 `@deepseek-ai/*`，形成跨生态脆弱耦合。

## 文档

| 文档 | 说明 |
|---|---|
| [快速开始](docs/getting-started.md) | 安装、启动与常见问题 |
| [交互手册](docs/interaction.md) | 快捷键与命令全表 |
| [配置](docs/configuration.md) | 装配选项、环境变量与运行时配置 |
| [架构](docs/architecture.md) | 分层、数据流与设计决策 |
| [主题](docs/themes.md) | 16 个内置主题与自定义 |
| [插件生态](docs/plugins.md) | 伴生插件与扩展点 |
| [VS Code](docs/vscode.md) | 在 VS Code 中使用 |
| [ADAPTER.md](ADAPTER.md) | TUI ↔ harness 边界契约 |
| [贡献指南](CONTRIBUTING.md) | PR 规范与验证矩阵 |
| [开发说明](DEVELOPING.md) | 结构、构建与发布 |

## 安装

本包不是独立程序。须先有官方 CLI [`@deepseek-ai/dsh`](https://www.npmjs.com/package/@deepseek-ai/dsh)（npm `latest`，当前 `0.1.1-rc.2`；需 ≥ `0.1.0-rc.8`，peer 依赖对齐）。只 `npm i` 本包跑不起来。

**一键安装（推荐）**：仓库自带跨平台脚本，自动检测 Node/pnpm、经 pnpm 安装官方 CLI + 装配本插件并启动（国内网络默认走 npmmirror 镜像）：

```sh
# macOS / Linux（bash）
bash <(curl -fsSL https://raw.githubusercontent.com/huiliyi37/dsh-tianshu-tui/main/scripts/install-tui.sh)
# 只安装不启动：
bash <(curl -fsSL https://raw.githubusercontent.com/huiliyi37/dsh-tianshu-tui/main/scripts/install-tui.sh) --no-launch

# Windows（PowerShell）
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/huiliyi37/dsh-tianshu-tui/main/scripts/install-tui.ps1 | iex"
# 只安装不启动：
powershell -ExecutionPolicy Bypass -File scripts\install-tui.ps1 -NoLaunch   # 克隆仓库后本地跑
```

### 1. 准备环境

- [Node.js](https://nodejs.org/) `^22.19 || >=24`
- [`pnpm`](https://pnpm.io/installation)（`dsh plugin` 会转发给它；没有时 `corepack enable` 即可——Node 自带 corepack）

> ⚠ **npm 11 的 OOM 坑**：官方 CLI `@deepseek-ai/dsh` 依赖树较大（60+ 子包），**npm 11（Node 24 自带）安装时会 JavaScript heap out of memory**（卡住数分钟后 OOM，实测复现）。请用 pnpm（下方命令）。若你已经在用 `npx -y @deepseek-ai/dsh` 且卡住/报 heap OOM，切到 pnpm 即可。

**不要直接敲 `dsh`。** 若 PATH 上已有旧的 `dsh`（例如 `~/.local/bin/dsh`，`dsh --version` 低于 `0.1.0-rc.8`），会走到本地 staging，出现 `ERR_FS_EISDIR` / `Path is a directory .../@deepseek-ai/dsh`。请始终用下面的 `pnpm dlx` 命令。

### 2. 把本插件装进 tui profile

```sh
pnpm dlx @deepseek-ai/dsh plugin --profile tui add @huiliyi37/dsh-tianshu-tui
```

pnpm 可能提示 peer missing，可忽略：peer 由官方 `dsh` 宿主提供，不必另装。没有 pnpm 也可以 `npx -y pnpm dlx @deepseek-ai/dsh plugin --profile tui add @huiliyi37/dsh-tianshu-tui`。

从 npm 安装后，每次启动会对照 npm `latest`：有新版本就写入 profile，提示重启后生效。也可在 TUI 里敲 `/update` 手动检查（只查不装，给出更新命令）。不想联网检查时设 `DSH_TUI_SKIP_UPDATE=1`。`github:` / `link:` 安装不会改写成 npm 包。

也可以从 Git 装：`pnpm dlx @deepseek-ai/dsh plugin --profile tui add github:huiliyi37/dsh-tianshu-tui`（仓库已包含 `lib/index.js`，不必再打包）。

### 3. 启动

```sh
pnpm dlx @deepseek-ai/dsh --profile tui
```

看到欢迎页品牌 **dsh-tianshu-tui** 即成功。`Ctrl+Q` 或 `/exit` 退出。

已全局安装官方 CLI（`pnpm add -g @deepseek-ai/dsh`）且 `dsh --version` 不低于 `0.1.0-rc.8` 时，把上面的 `pnpm dlx @deepseek-ai/dsh` 换成 `dsh` 即可。

### 4. agent 预设（`/preset`）

命令是 `/preset`（没有 `/presets`）。本包 bundle 对标官方 web：关掉 host 上的 agent 面，挂上 `@deepseek-ai/dsh-agent-presets`（依赖钉死 `0.1.1-rc.2`，npm `latest` 仍停在过时的 `0.0.1-rc.1`）。`plugin add` 本包即连带装上花名册；新会话在 `setup` 里 `mount`，`/preset` 换的是官方 shipped 面（标准 / PTC / 极简 / 创造），不是叠在 `dsh-base` 工具上。

用法：

- `/preset` —— 列出全部预设与当前项（`*` 标记），并附当前工具面（wire）摘要
- `/preset <id>` —— 切换到指定预设（仅空白会话可换：先 `/session new` 再切）

若 `npx` 仍报 `ERR_FS_EISDIR`，是 `~/.dsh/profiles/node_modules` 里旧的安装 fallback 与官方 CLI 冲突。换干净目录再启动：

```sh
DSH_HOME=/tmp/dsh-tianshu pnpm dlx @deepseek-ai/dsh plugin --profile tui add @huiliyi37/dsh-tianshu-tui
DSH_HOME=/tmp/dsh-tianshu pnpm dlx @deepseek-ai/dsh --profile tui
```

不要在 DeepSeek Harness 工作区根目录对本包跑 tsdown：会把未发布的 `@deepseek-ai/dsh-root` 写进 bundle，加载必失败。

## 与其他发行版共存

本插件运行在官方 DeepSeek Harness（`@deepseek-ai/dsh`）之上，数据 home 为 `~/.dsh`。
独立集成发行 **oh-my-tianshu**（原 tianshu-public，`@huiliyi37/dsh-tianshu`，自带 `tianshu`
CLI 的完整 harness）是另一条独立发行线，使用独立的 `$DSH_HOME`（默认值独立化落地后为
`~/.dsh-tianshu`）——两套系统 home 隔离，**可同时安装、互不干扰**（会话 / profile /
settings 各自独立）。共存时 tianshu 侧设 `export DSH_HOME=~/.dsh-tianshu` 即可。

**命名备忘（防止混淆）**：

| 名字 | 是什么 |
|---|---|
| `dsh-tianshu-tui`（本插件） | 官方 dsh 的 TUI 插件（本仓库） |
| `oh-my-tianshu` / `@huiliyi37/oh-my-tianshu`（原 tianshu-public） | 独立集成发行，自带 CLI（命令 `oh-my-tianshu`） |
| `Tianshu-Tui`（上游） | 本插件渲染核心的 Apache-2.0 来源（天枢） |

> 2026-08-16 已改名：原 `@huiliyi37/dsh-tianshu`（命令 `tianshu`）统一为
> `@huiliyi37/oh-my-tianshu`（命令 `oh-my-tianshu`），与仓库名一致；旧包已
> deprecate，请迁移安装。

需要图片再询问能力时，再装配同仓伴生包 `vision-ask/`；需要 LSP 模型工具面（模型可调 `lsp_goto_definition` / `lsp_find_references` / `lsp_diagnostics`）时装配社区插件 [`omdsh-dev/dsh-lsp`](https://github.com/omdsh-dev/dsh-lsp)（`npx -y @deepseek-ai/dsh plugin --profile tui add github:omdsh-dev/dsh-lsp`）——装配后 TUI 展示桥自动消费其 `lsp` 服务（与模型工具面共享同一 LSP server 集，不双份 spawn）。TUI 桥的诊断源探测顺序：社区插件服务（getDiagnostics 形状）→ 官方 `ctx.lsp` seam（deepseek-harness 的 dsh-lsp，经 query(getDiagnostics) 适配）→ 内置桥降级。

## 更新说明

当前 npm `latest`：[`@huiliyi37/dsh-tianshu-tui@0.1.2-rc.18`](https://www.npmjs.com/package/@huiliyi37/dsh-tianshu-tui)（[GitHub Release](https://github.com/huiliyi37/dsh-tianshu-tui/releases/tag/v0.1.2-rc.18)）。

### 未发布（main）

- **glance 上下文占用条** — `上下文 N%` 后跟 8 格占用/剩余条（`▓`/`░`；ascii 回退 `[====----]`）
- **`/session` 按日历分组** — 选择器与 `/session list` 按今天 / 昨天 / 本周 / 更早分组；↑↓ 跳过分组头
- **系统通知** — 子代理 / 工作流 / 任务完成弹系统气泡（不打断 `turn/end`）；`DSH_TUI_SKIP_NOTIFY`、SSH、CI、测试环境静默
- **`/config` 终端段** — 面板置顶系统通知（空输入 `n`）与紧凑渲染（空输入 `d`，写入 `prefs.json`）；`/config notify [on|off]` 仍可用。无宿主设置/凭据不再占位
- **检查面板交互** — `/config` `/skills` `/status` `/lsp` `/tasks` 互斥（打开一项关掉其余）；`Esc` 先关检查面板（有草稿也关，不布防 rewind）；`/skills` 空输入 ↑↓/j/k 展开选中详情
- **TUI 按 web 组 agent 面（[#47](https://github.com/huiliyi37/dsh-tianshu-tui/issues/47)）** — 本包 bundle 挂官方 `agent-presets` 并关掉 host agent 面；`plugin add` 本包即可 `/preset` 切换官方 shipped 预设，不必手改 profile `cordis.patch.yml`

### 0.1.2-rc.18（2026-08-26）

待办卡离开思考区：挪到输入轨上方，默认列出条目。

- **待办卡贴输入轨上方** — 从 glance/思考上方挪到 chrome（活动带之下、提问/审批/输入轨之上）；小窗口从顶裁动态段时不再把待办裁掉，也不跟思考抢视线
- **默认列出条目** — 有进行中/待办时计数头 + 条目（进行中置顶），最多 5 条，超出 `└ …(+N)`；全完成仍一行；`/todos all` 看全表不封 5 条。计数头不再带 `· 当前项`

### 0.1.2-rc.17（2026-08-25）

活动带与启动默认语义版本：子代理/工作流改走统一活动带，启动项区分「仅本会话」与「写默认」，待办首写自动弹卡，`/fork` `/branch` 修复。

- **子代理/工作流统一活动带** — 输入轨上方默认收敛为活动带（`◐ N 子代理 · M 工作流`）：进行中每项一行统计（封顶 `activityBandMaxRows`，默认 5，超限折叠为 `+N`），子代理结束塌成 `✓ {label} · N 工具 · X tok · 12s`，工作流结束再提交一行摘要；`activityBand: false` 回退为每条运行中子代理一行 spinner。`/subagents` 活区卡显示进行中第二行与失败态，宿主有外部 run 时追加「⤷ 外部子代理」；`/workflow` roster 在 childId 命中委派树时追加子会话 label / 运行态
- **启动项拆成「仅本会话」与「写默认」** — 选择器 Enter / 带参命令只热切当前会话；选择器按 `S` 或命令末尾 `default` 才写入 `prefs.json` 作为新会话启动默认（`/theme` `/model` `/effort` `/density` `/preset`）；回显点名差异，不再分不清默认与本会话
- **模型首次写入待办自动弹紧凑卡** — live 默认不画 todos 投影；模型第一次写入非空待办时自动弹出紧凑卡，手动关掉或 `/clear` 后本会话不再自动开
- **`/fork` `/branch` 修复** — 改用 `agents.create({ seed })` 一次铸 child，不再 resume live 子会话（官方 `persistence.prepare` 对已在内存的会话抛 `cannot prepare while it is live`，此前 fork 后必炸）

### 0.1.2-rc.16（2026-08-25）

`/preset` 注入降级版本。

- **`/preset` 不再 `without inject`（[#46](https://github.com/huiliyi37/dsh-tianshu-tui/issues/46)）** — 未挂上 `agentPresets` 时，经 `reflect.get('agentPresets', false)` 读可选服务，回显「服务不可用」而不抛 `cannot get property "agentPresets" without inject`（与 `/compact` `/goal` 同款）；跟仓 `lib/index.js` 已对齐，`github:` 安装也会吃到修复。要真正启用预设，见上方「启用 agent 预设」：装包 **并且** 写入 profile `cordis.patch.yml`（[#47](https://github.com/huiliyi37/dsh-tianshu-tui/issues/47)）

### 0.1.2-rc.15（2026-08-25）

手动更新 + 启动会话复用版本。

- **`/update` 手动更新检查** — 对照 npm `latest` 只查不装：发现新版本回显版本对与手动更新命令（`npx -y @deepseek-ai/dsh plugin --profile tui add @huiliyi37/dsh-tianshu-tui@latest`，或重启走启动自更新）；已最新回显当前版本；网络失败回显原因不抛。绕过 `DSH_TUI_SKIP_UPDATE`（显式要求检查时不尊重"不想联网"开关），复用启动自更新的 1h 缓存管线
- **启动复用空会话 id（社区 PR #45）** — 插件启动且 live store 为空时复用最近一个无内容会话的 id（不再每次铸造新 id），header.cwd 重绑启动目录；跨/同目录先清旧 artifact 再重建（规避后端 adopt 前缀校验拒绝）
- **`/session` 选择器摘要（社区 PR #45）** — 无参选择器展示会话摘要行（#短id · 标题 · 相对年龄；标题 = title 事件 fold → 首条真人消息 → 「新对话」），`/session list` 保持旧版直接打印
- **真机 e2e 资产（社区 PR #45）** — `scripts/e2e-tui.{sh,exp}` + `npm run e2e:tui`：expect 驱动 pty 里的官方 dsh CLI（独立 DSH_HOME），覆盖启动复用（含 adopt 错误回归）与 /session 两种形态
- **README 安装段修复** — 安装命令不再固定宿主 CLI `@0.1.0-rc.8`（npm latest 已到 `0.1.1-rc.2`），统一无版本（peer 依赖 `^0.1.0-rc.8` 兼容）

### 0.1.2-rc.14（2026-08-25）

tianshu-public 交互面回流版本：/key 模型供应商密钥配置 + 图片发送预览 + 交互面增量（三波全量落地）。

- **`/key` `/login` 配置模型供应商 API 密钥** — 选择供应商（默认置首、已配置 ✓）→ 掩码输入（≤8 全显 •，>8 露末 4 位）→ 联网验证三分类（ok 直接落盘 / invalid 拒存回输入 / unknown 可强存）→ 落盘即生效（无需重启，欢迎行与 footer API ✓ 实时翻转）；`llm-deepseek` 段走官方端点探测，pi-ai 路由保存后自动补写 profile 让路由即刻注册；进程环境遮蔽（writable=false）与凭据存储缺席都有对应说明态；首启缺 key 时 TTY 自动弹一次（Esc 可跳过）
- **图片发送预览（半块字符缩略图）** — 附件挂上后输入轨显示最后一张图的降采样真彩预览（游程合并，毫秒级异步解码）；无图形协议终端发送图片后 scrollback 以半块字符回退渲染（每行都是真实滚动行，无残影）；sharp 懒加载、解码失败静默降级纯文本
- **交互面增量** — 统一活动带（`format/activity-band`：subagent/workflow/后台任务三来源折叠、分组计数头、⎿ 子行、封顶折叠）与消息面底色垫宽（`format/bg-block`）纯函数层入库，供后续接线
- **上游回流基准** — 相对 8-22 截止点后 22 个新提交经侦察判定无可回流 tui 内容（intent-bridge 出厂关闭=本仓现状）；宿主 seam（llm 目录/discoverModels/credentials.set/settings.mutate）四件套实测对齐

### 0.1.2-rc.13（2026-08-22）

tianshu-public 修复回流版本：上游 8 月中旬以来 10 项 fix(tui) 全量回流——会话安全 + 输入/粘贴语义 + 模型路由正确性（B 批 UI 行为变化为本版头条）。

- **会话切换不再产生幽灵状态** — 切到不可恢复的会话时停留原会话并回显「⚠ 会话切换失败 + 原因」；Ctrl+S / 会话选择器等触发点不再逃逸 unhandled rejection，启动路径保持响亮失败
- **剪贴板大图不再静默丢失** — Ctrl+V 与右键粘贴位图走与文件路径同一条预算管线：超限截图要么自动压缩进预算、要么响亮失败并区分原因（无工具 / 仍超限），不再「挂上 📎 却在提交时被丢弃」；overlay 关闭后 1s 内 Ctrl+V 只走文本（焦点去抖接线）
- **slash 菜单不再顶推输入框** — 菜单行计入动态段高水位记账：开合、过滤全程输入框行位钉住，欢迎首帧不凭空垫白
- **rewind 面板可退出、只列真人消息** — Ctrl+C 第一次即关闭（不再被面板吞掉）、Esc 分阶段处理（选粒度时先回列表）；插件注入行与空助手行不再进检查点列表；无可回退消息时回显原因
- **/model 目录校验** — 拼写错误当场拒绝：未知 provider 硬拒并列已注册路由，目录外模型给至多三条就近建议（advisory 契约：空目录放行、llm 未装配跳过）；spark 别名目标未注册时响亮失败，不再静默保存死路由
- **含斜杠模型 id 不再截断** — openrouter 风格 `stealth/ox-alpha` 一类 id 按首个斜杠分割，选择器确认与 /model 实参都不再把 model 截成首段
- **输入框重影根修** — CPR 污染检测在输入增行/折行后作废基线：合法几何变化不再误判为外来写入触发欠回顶（旧帧顶部残留成「多一行」）
- **/clear 一并收起命令面板** — /config /skills 等 live 面板清屏后不再原样画回，需重新打开
- **Alt+控制键可达 + 空行 Alt+⌫ 删附件** — ESC+控制码组合（如 Alt+Backspace）正确路由；空行快捷移除末张图片附件（📎 行同步消失并提示键位），非空行仍是词删除
- **fork 会话标题不再撞父会话** — 标题认 `session/end-seed` 边界，优先展示 fork 自有标题或首条真人消息；未活跃 fork 与老日志行为不变

### 0.1.2-rc.12（2026-08-20）

输入体验大版本：长文本性能 + 交互语义修复 + 界面语言统一（天枢同源优化三波）。

- **输入框长文本性能** — 折行逐字符量宽走缓存（10 万字符草稿每次按键 ~1.3s → ~10ms）；粘贴可编辑阈值抬至 100 行/10000 字（此前 10 行即收成标记）；输入视窗 16 行上限（超出折叠「… 上/下 N 行」）；`Home/End/Ctrl+U/K` 以逻辑行为范围、`PageUp/Down` 翻页、`↑↓` 按软折行移动；换行模式下粘贴并入草稿不提交
- **Ctrl+C 连按退出无死角** — 窗口内第二次恒退出（有草稿时第一次清空、`Ctrl+Z` 可恢复）；打断中第二次直接退出不用等落定；`vim` normal 下 Esc 空操作不再误弹 rewind；Kitty 键盘协议 CSI u 完整解码（Ctrl+C=CSI 99;5u、release 事件去重）
- **活区卡片语言统一** — 工具卡/委派树/后台任务一套符号：进行中 `⠋`、成功 `›`、失败 `✗`、正文 `⎿`；终态行后退（muted）；正在跑的子代理和 build 终于长得像同类对象
- **会话 tab 栏退场** — 常驻 tab 栏与 Ctrl+X/Alt+数字切换移除（多会话走 `/session` 与 `Ctrl+S`），界面少占一行
- **更新提示可操作化** — 自更新失败给出三行引导（重启重试/手动更新命令/关闭提示）；成功提示写明 `/restart` 用法

### 0.1.2-rc.11（2026-08-20）

生态对齐 rc.8 + 个性化持久化 + Windows 修复大版本。

- **官方生态对齐 `^0.1.0-rc.8`** — 逐项核验 rc.6→rc.8 消费面：事件全为加法（`assistant/message` 新增 `interrupted`、新增 `team/*` 事件）；图片单图本地预算 10MB→3.5MB 对齐宿主新准入默认（避免原样放行的图被附件存储拒绝）；rc.8 官方 bash 提速（宿主侧工具调用 ~7s→0.3s）自动受益。安装需宿主 `0.1.0-rc.8`（`npx -y @deepseek-ai/dsh`）
- **本地偏好持久化（`~/.dsh-tui/prefs.json`）** — `/theme`、`/density`、`/subagents` `/workflow` 面板显隐、`/glance` metrics 段开关、系统通知（`notifyOs`）全部重启保留；`/theme auto` 可回退自动档；`/theme export [name]` 当前主题一键导出为自定义模板；主题选择器列出 `custom:` 主题
- **输入历史持久化** — `~/.dsh-tui/input-history.json` 上限 1000 条，Ctrl+P/N 跨重启可用（内容为输入原文，删文件即清空）
- **输入框多行导航修复** — 含 emoji/组合字符的长文本 ↑↓ 跨行不再拆簇错位（grapheme 列保持）
- **Windows 修复** — LSP 诊断启动修复（`.cmd` 派发）、12 处子进程补 `windowsHide`（不再闪控制台窗口）、剪贴板读图测试注入
- **自更新可靠性（#43）** — 官方 npm 源超时自动回退 `registry.npmmirror.com` 镜像；新增 `DSH_TUI_UPDATE_REGISTRY` 自定义源链；更新检查 1 小时磁盘缓存免每启联网
- **技能展示面（#39）** — `/` 菜单、Tab 菜单与 Ctrl+P 面板可见 userInvocable 技能（🧭），转录技能调用渲染为 chip
- **会话短标签修复（#37/#38）** — tab 栏/欢迎页/委派树等处不再显示 `[session-]` 空壳
- **主题切换即时重放（#40）** — 切主题后滚动区历史按新配色即时重绘；生态边界警告（#33）置顶 README

### 0.1.2-rc.10（2026-08-16）

更新一步到位 + Windows 平台兼容 + 命令输入容错。

- **更新后自动重启（[#34](https://github.com/huiliyi37/dsh-tianshu-tui/issues/34)）** — 启动自更新落盘后自动重启生效（会话未开始工作时；已工作时只提示不打断）；`/restart` 命令手动重启同一进程（更新后不用再 `/exit` + 手动重跑）
- **自更新按锁文件选包管理器** — pnpm/npm/yarn 管理的 profile 各自走对应安装器，不再硬编码 pnpm（npm/yarn 用户不再混入 pnpm 锁文件）
- **`/help` 修复（[#36](https://github.com/huiliyi37/dsh-tianshu-tui/issues/36)）** — 此前一直报 `cannot get property "tui" without inject`，现经命令工厂注入正常列出全部命令
- **Tab 命令菜单（[#31](https://github.com/huiliyi37/dsh-tianshu-tui/issues/31) 跟进）** — 空输入框按 Tab 弹出全部命令菜单，选命令回车直接执行（`/model` `/theme` `/session` 直接进选择器），省去输入命令名一步（参考 Claude Code）
- **Windows/PowerShell 兼容** — Ctrl+C 打断不再触发「输入框消失」（0x03 字节与 SIGINT 双触发去重 + SIGINT 双注册 + 退出时终端兜底恢复）
- **`/` 开头文件路径容错** — `/src/main.ts`、`~/xxx`、Windows 盘符 `C:\...` 等路径不再被误判为 slash 命令报「未知命令」
- **打断恢复加固** — abort 时强制释放全屏 overlay（命令面板/搜索等），主屏输入框下一帧必然恢复；补「打断后输入框可见」回归测试

已装 `0.1.x-rc.6` 的用户下次启动会自动写入 profile。看到「插件已更新到 …，请重启 dsh 后生效」后重启即可（新版本会自动重启或输入 `/restart`）。

### 0.1.2-rc.9（2026-08-16）

交互体验大补强:Esc 打断与双击回退、会话 tab 栏、成本汇总、主题实时预览。

- **Esc 双语义(对齐 Claude Code)** — 在途输出时单次 `Esc` 打断(与 Ctrl+C 同路径,80ms 防误触);空闲时 `Esc`+`Esc`(1s 窗口)打开 **rewind 回退面板**
- **rewind 时间线界面** — 消息列表升级:类型标记(❯ 用户/✦ 助手)+ 相对时间 + turn 分隔线 + 滚动窗口跟随选中(可滚到更早消息)
- **会话 tab 栏** — 多会话时输入轨上方常驻显示短 id 列表(当前 ● 高亮,窄宽折叠 `+N`);`Ctrl+X` 循环切换、`Alt+1`~`Alt+9` 直接跳转
- **`/cost` 会话成本汇总** — usage 按模型分桶累计,输出每模型明细(输入/缓存读/写/输出/推理)+ 合计 $ 估算
- **主题选择器实时预览** — `/theme` 选择器 ↑↓ 移动即切换主题,Enter 落定、Esc 还原
- 工程:`lib` bundle 随版本重建跟仓

已装 `0.1.x-rc.6` 的用户下次启动会自动写入 profile。看到「插件已更新到 …，请重启 dsh 后生效」后重启即可。

### 0.1.2-rc.8（2026-08-16）

交互式选择器、Claude Code 对标补强、workflow 观察面、审计修复。

- **交互式选择器（[#31](https://github.com/huiliyi37/dsh-tianshu-tui/issues/31)）** — `/theme` `/model` `/session` 无参数回车即打开选择器：↑/↓（j/k）选择、PageUp/PageDown 翻页、Enter 确认、Esc 关闭，当前值 ● 高亮；模型列表来自 llm 目录，有参数用法不变
- **成本与上下文水位** — footer 新增 $ 成本估算（flash/pro 内置定价表，未知模型不猜价）；上下文占用 ≥95% 前缀 ⚠
- **git 未提交提示** — footer 显示 `●N`（未提交文件数，回合边界刷新）
- **`/help` 命令** — 注册表驱动的全部命令清单（`/help <cmd>` 单条详情）
- **工具卡手动展开** — 空输入 Enter 切换最后一张进行中工具卡，展开显示参数 JSON
- **workflow 面板观察面** — 运行时长改真实差值（此前误显时间戳）、meta 补全（run 名/描述/阶段数）、`workflow/log` 叙述行进展开视图
- **审计修复（[#30](https://github.com/huiliyi37/dsh-tianshu-tui/issues/30)）** — `dsh.runtime: "host"` 声明 + 4 处 subprocess 固定 argv 化（execSync → execFileSync）
- 工程：`lib` bundle 随版本重建跟仓

已装 `0.1.x-rc.6` 的用户下次启动会自动写入 profile。看到「插件已更新到 …，请重启 dsh 后生效」后重启即可。

### 0.1.2-rc.7（2026-08-15）

功能核查大修：视觉桥可探测、服务缺失不再静默、投影层接线出轮次摘要；平台降级全部可见化。

- 主模型不识图且未注入 vision 配置时，按宿主 `visionBridge` 服务存在性自动探测识图桥（桥插件契约见装配节）
- 缺 goal/subagent 插件时整个 TUI 不再静默不启动（goals/subagents 改为可选服务）
- `/tasks` `/subagents` `/workflow` `/status` `/config` `/skills` 面板与 plan 模式在 backing 服务缺失时回显 ⚠ 警告，不再空白无提示
- `/clear` 真清屏（此前只清内部缓冲）；`Ctrl+.` 键位表补全到 20 条并修窄宽破版
- 投影层接线：回合结束落 `turn N · 读X 改Y · 耗时` 摘要行；`/status` 新增会话汇总段（宿主投影服务缺失时仍有数据）
- 平台降级可见化：剪贴板读图工具链缺失、外部编辑器启动失败、OSC52 终端不支持、自更新失败均有明确提示
- 修复：切会话/退出时挂起的审批与提问正确结算；fiber 重挂载不再抛 DUPLICATE_PROVIDER（组合测试拦截）
- 工程：构建两段化（tsc → tsdown，杜绝旧产物重打包）、typecheck 门禁、CI、vision-ask 对齐 rc.6 类型面

已装 `0.1.x-rc.6` 的用户下次启动会自动写入 profile。看到「插件已更新到 …，请重启 dsh 后生效」后重启即可。

### 0.1.2-rc.6（2026-08-14）

退出时恢复终端光标并把 TTY 还给 shell；新增 `/exit`。

- `Ctrl+Q` / `/exit` 退出后恢复硬件光标，经宿主退出把终端还给 shell（[#22](https://github.com/huiliyi37/dsh-tianshu-tui/issues/22)）
- 无 launcher 宿主服务时 TUI 不再静默卡死
- 全屏 overlay 不再被流式输出盖住；Esc/Ctrl+C 关闭命令面板时不误提交
- 空闲空输入需连按两次 Ctrl+C 才退出；等待回复提示不再在回合结束后误显示

已装 `0.1.1-rc.6` 的用户下次启动会自动写入 profile。看到「插件已更新到 …，请重启 dsh 后生效」后重启即可。

### 0.1.1-rc.6（2026-08-14）

启动时对照 npm `latest`，把 profile 里的本包升到新版本，提示重启后生效。

**从 `0.1.0-rc.8` 升级：** 那一版还没有自更新，需要手动加一次才会带上新逻辑：

```sh
npx -y @deepseek-ai/dsh plugin --profile tui add @huiliyi37/dsh-tianshu-tui
npx -y @deepseek-ai/dsh --profile tui
```

之后再发新版本，启动时会自动写入 profile。看到「插件已更新到 …，请重启 dsh 后生效」后重启即可。不想联网检查时设 `DSH_TUI_SKIP_UPDATE=1`。`github:` / `link:` 安装不会改写成 npm 包。

本版本还包含此前已上 `main` 的显示层对齐：

- 创建会话写入 `meta.cwd`，Web UI 能列出 TUI 会话
- 欢迎页 / 状态行按 credentials 分层判断 API key
- `/model` 后 footer glance 与视觉能力跟实际模型走
- `Ctrl+S` 可恢复磁盘上的会话

第一版本基线见 [docs/BASELINE-v0.1.0-rc.8.md](docs/BASELINE-v0.1.0-rc.8.md)。

## 亮点

- **终端内的完整会话工作区** — 实时渲染、只增滚动转录、启动时会话恢复、`/fork` 探索分支、`/rewind` 回退（会话截断 + 可选文件回退）、`/export` 导出 Markdown 转录、中轮转向（`/steer` / `Ctrl+T`）。
- **图片端到端** — 剪贴板粘贴（`Ctrl+V` / 终端菜单粘贴）、以终端图形协议内联渲染（kitty / iTerm2）、经 harness 附件服务投递、让具备视觉能力的模型真正看见——主模型不识图时自动经独立视觉模型把图片转成描述（视觉桥）。
- **完整输入面** — grok 风格 slash 下拉菜单（模糊前缀匹配、MRU 排序、ghost 预览）、`@`-路径 Tab 补全与 `@mention` 展开、bracketed paste、可选 vim 键位、外部编辑器（`Ctrl+E`）、历史搜索（`Ctrl+F`）——`Ctrl+.` 随时调出完整键位表。
- **终端内交互面** — 结构化提问面板（数字键选择、plan-review 反馈模式）、带内联 `diff` 预览的挂起审批卡片、模式循环（`Shift+Tab`：normal → plan → always-approve）、命令面板，以及 status / config / skills / tasks / 委派树 / workflow 实时面板。
- **推理过程可视化** — think 通道以实时头行流动、在滚动区折叠为紧凑行（`✻ 思考 (3.2s) · 12 行`）、`Ctrl+O` 原位展开（对标竞品：默认折叠）。
- **个性化 harness 集成** — `/doctor` 终端诊断、`/memory` 项目记忆浏览器、`/btw` 后台 agent 侧问、`/model` + `/effort` 热切换（当前会话立即生效）。
- **构造上可审计** — TUI 自身不注册任何 prompt、工具或上下文面；用户输入成为普通日志消息，所有渲染状态都派生自会话事件。
- **与 harness 协同演化** — 在 2026-08-09 基线快照之上与 harness 侧能力同步开发（250+ 提交）：图片/视觉链路、DeepSeek Spark 模型工程、会话持久化与文件快照、记忆、验证门与失败路由、代码智能、git 工具。见下一节。

## 与 harness 协同演化的能力（2026-08-09 基线以来）

终端 UI 从 [天枢 Tianshu-Tui](https://github.com/huiliyi37/Tianshu-Tui) 演进而来（Apache-2.0；逐文件来源见 [SOURCE-MAP.md](SOURCE-MAP.md)）。本 bundle 随后在 DeepSeek Harness 基线快照 `snapshots/20260809T140917Z` 之上与 harness 侧工作同步开发——2026-08-10 至 2026-08-13 共 250+ 提交。下列能力位于宿主 harness（独立包，不随本 bundle 分发）；TUI 是它们的主要交互面：

- **图片链路与视觉桥** — `image` ContentBlock 加入 merge-extensible 内容词汇，`dsh-llm-deepseek` 把用户图片 block 序列化为 OpenAI 风格 `image_url` content parts——用户图片端到端可达 wire（剪贴板 → 输入行 → 会话 → 模型请求）。模型经 `supportsVision` 声明识图能力（`LlmModelInfo` + llm-deepseek catalog）。`dsh-vision-bridge` 覆盖 text-only 主控：`agent/pre-step` 时经独立视觉模型描述图片附件（`visionAutoBridge` 在未指定 provider/model 时自动选首个识图模型；备用模型 fallback + data URL 校验；prompt 按 UI/报错关键词在通用结构与 OCR 级精确转写间自动选择），描述作为 plugin-source user message 注入——Model-visible ⟺ logged；桥失败降级为可见提示，绝不整轮 failed。
- **DeepSeek Spark 别名** — 官方 API 没有 `spark` 模型，本宿主也不注册 `deepseek-spark` provider。`/model spark-flash` / `spark-pro` 映射到已注册的 `deepseek-official` 路由，wire 模型分别为 `deepseek-v4-flash` / `deepseek-v4-pro`。
- **会话持久化与文件快照** — `Session.truncate` 回卷事件日志并重置派生状态；持久化后端新增 `deleteFrom` 与 truncate 协调器，回滚跨重载存活；`dsh-fs-snapshot` 移植 FileHistory（trackEdit / rewindToBoundary），在写入工具执行前快照。TUI 入口：`/rewind`（会话截断 + 可选文件回退）。
- **记忆** — `dsh-memory`（MemoryService + Markdown 文件后端、非 git 兜底）与 `tool-memory`（`memory_save` / `memory_search` + 记忆摘要注入）提供跨会话召回。TUI 入口：`/memory`、`/remember`。
- **验证门与失败路由** — `dsh-evidence-gate` 强制执行 RED-first 验证：义务状态机、编辑/验证计数、TDD 门（`enforce` 模式）、探针建议 + 冷却、L2 终审门，原生接入 `str_replace_editor` 与 headless-agent 装配。`dsh-agent-router` 依据回合历史预测步骤失败并路由工作——含验证子代理调度与按 profile 工具限制——带真实回合 e2e 覆盖。
- **代码智能与检索** — `dsh-semantic-index`（BM25 + salience/RRF/向量融合、增量更新）以 `semantic_search` 工具暴露；`dsh-meridian` 代码索引（node:sqlite schema、TypeScript/Python/Go 三语言 tree-sitter 解析器、graph/impact/flow 查询、行为信号、后台回填）以 `repo_graph` 与 `<codebase-index>` 摘要暴露；`dsh-pheromone` 文件级信息素 + 原子 JSON 持久化，经 `file_info` 与 read 工具 `focus` 语义上屏。
- **Git 服务与工具** — `dsh-git` 服务接缝（GitLocal CLI provider，服务类即插件）+ `dsh-tool-git` 面向模型的单一 git 工具（operation 判别：status / diff / log / commit），装配进 base bundle。

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

- **Slash 命令菜单** — 输入 `/` 打开下拉菜单：模糊前缀匹配、`↑↓` / `PageUp` / `PageDown` 选择、`Tab` 接受、`Enter` 提交、MRU 排序、参数占位 ghost 与输入行 ghost 预览。
- **剪贴板与图片粘贴** — `Ctrl+V` 读取剪贴板图片（回退到文本）；终端菜单粘贴检测图片；看起来像图片的粘贴路径按附件加载；`Alt+W` / vim yank 经 OSC52 把选区复制到系统剪贴板。
- **图片提交** — 附件图片显示 `📎 N images` 标记，提交时在用户气泡下方以内联图形渲染，并经附件服务到达模型；气泡携带识图提示（已转发 / 经视觉模型桥接 / 未发送）。超大图发送前自适应压缩：长边 1568px 封顶（PNG 保留透明），逐级 JPEG 0.82 → 0.55 → 1024px + 0.55 直到低于 provider 上限，全程只缩不放。
- **编辑** — vim 键位（可选）、外部编辑器（`Ctrl+E`）、Tab 文件补全、`@mention` 展开、输入历史、多行输入、bracketed paste（多行/长文本粘贴整段进输入行，不逐行提交）；输入行绘制为完整圆角框体。
- **图片再询问** — 同仓伴生插件 `@deepseek-ai/dsh-vision-ask` 登记已发送图片，并经 `ask_image` 回答模型的定向问题（见 [vision-ask](vision-ask/README.md)）。

### 渲染与投影

- **对话流** — markdown 渲染、工具族着色 + 逐工具计时、并行工具调用折叠为组。
- **工具卡实时结算** — 已结算的工具结果按 harness presenter 意图渲染为滚动区卡片：`diff` 结果渲染结构化红/绿文件差异（与审批预览共用）、`terminal` 结果带命令标题 + cwd + 退出/信号徽标、其余折叠为文本卡片。
- **推理通道** — 思考中实时 shimmer 头行、段末折叠滚动行、`Ctrl+O` 在 live 区展开全文。
- **流利度折叠** — 重复的例行工具流量在 quiet 策略下折叠；compact 模式（`/density`）只保留头行。
- **轮次状态** — braille spinner + 阶段文本状态行、workflow 运行汇总、委派树、任务窗格、config/skills 面板作为 live-region 面板；turn 结束（非中断）且有工具调用时落 dim 摘要行（`turn N · 读X 改Y · 耗时`）。
- **Subagent 运行** — 每个运行一条 live spinner 行；终态以 `✓`/`✗`/`◌` 条目落入滚动区。
- **窗口 chrome** — 欢迎页（品牌头、友好会话短 id、环境检查行）、顶部栏（cwd + git 分支 + 模型）、底部三行区：输入行（底边线随模式着色）→ footer（模式徽标 + 快捷键提示）→ metrics 行（模型 / token 用量 / 缓存命中率）。
- **主题** — 内置调色板 + `custom:<name>`；自动终端检测与 16 色降级。

### 交互面板

- **结构化提问** — 数字键选择、`Esc` 取消、重叠保护；plan-review 反馈模式（`f` 进入、`Enter` 提交 Keep planning + 自定义反馈）。
- **审批卡片** — `y`/`N`/`Ctrl+C` 结算挂起审批；工具可 diff 时内联差异预览；diff 不可见时盲批提示；非当前会话请求委托给下一个监听者。
- **模式循环** — `Shift+Tab` 循环 normal → plan → always-approve；plan 状态驱动 footer 徽标，always-approve 为会话级本地态（切换/退出时复位）。
- **实时面板** — `/status`（goal/todos/plan 投影快照；subagent 域见 `/subagents`）、`/config`（终端通知/紧凑渲染 + 宿主 settings / permission / credentials）、`/skills` 浏览（↑↓ 详情）、`/tasks` 窗格、`/subagents` 委派树、`/workflow` 运行。检查类面板互斥，`Esc` 关闭。宿主服务未装配时对应段折叠；`/config` 的终端段不依赖宿主。其它面板在 backing 服务缺失时回显 `⚠` 警告（不静默空白）。
- **命令面板（`Ctrl+P`）/ 键位表（`Ctrl+.`）/ 历史搜索（`Ctrl+F`）overlay**。

### 模型与视觉

- `/model` — 查看并切换模型（默认 + 当前会话热切）；`spark-flash` / `spark-pro` 别名映射到 `deepseek-official` + 官方 wire id `deepseek-v4-flash` / `deepseek-v4-pro`。`/model <provider/model|alias> [off|high|max]` 同一条命令内设置推理等级。
- `/effort` — 设置推理等级（`off` / `high` / `max`；`auto` 回模型默认），当前会话热切。
- **视觉桥** — 识图能力按模型声明（`supportsVision`，经 llm catalog 自动刷新）并驱动气泡提示；主模型不识图时，自动选定的视觉模型在提交前生成图片描述（一次性路径；见已知限制）。桥可用性来源：装配方传入 `vision.bridgeEnabled`，或宿主视觉桥插件 provide `visionBridge` 服务（TUI 提交图片前按服务存在性自动探测）；两者皆无则图片不发送并警告。
- **视觉副驾** — 装配同仓伴生插件 `@deepseek-ai/dsh-vision-ask` 后，每张已发送图片被登记为短 id（`img_1` …），模型可经 `ask_image` 反复询问——定向问题、换角度、不限次数；同图同角度重复提问命中 per-image 描述缓存。细节与配置见 [vision-ask README](vision-ask/README.md)。
- `/mcp` — 列出已连接 MCP server 与工具数；`tools <name>` 查看某 server 的工具清单。

### 命令

| 命令 | 作用 |
|---|---|
| `/session new\|list\|switch` | 会话管理（list/选择器按今天/昨天/本周/更早分组） |
| `/fork [directive]` · `/branch` | 分叉当前会话，可选带起始指令 |
| `/rewind` | 两阶段回滚（消息列表 → 粒度） |
| `/export [path]` | 导出转录为 Markdown |
| `/clear` | 清空滚动区视图 |
| `/compact` | 压缩会话上下文 |
| `/steer <text>` | 中轮转向（不中断地纠正方向） |
| `/model [target] [effort]` | 查看/切换模型（别名：`spark-flash`、`spark-pro`） |
| `/effort off\|high\|max\|auto` | 设置推理等级（热切） |
| `/theme [name]` | 切换主题 |
| `/density` | 切换紧凑工具卡渲染 |
| `/lsp` | 切换 LSP 诊断面板（agent 触碰文件时自动拉取该文件诊断；诊断徽标上工具卡） |
| `lsp_goto_definition` · `lsp_find_references` · `lsp_diagnostics` | LSP 模型工具面（伴生插件 `lsp/` 注册；定义跳转 / 引用查找 / 文件诊断） |
| `/status` | 切换状态面板（goal/todos/plan 投影 + 会话汇总段） |
| `/config [notify [on\|off]]` | 切换设置面板（空输入 `n` 通知、`d` 密度）。无参开关面板 |
| `/skills` | 切换技能浏览面板 |
| `/tasks` | 任务窗格（后台任务） |
| `/goal` | 目标管理（创建 / 暂停 / 恢复 / 完成 / 阻塞） |
| `/subagents` | 委派树面板 |
| `/workflow` | workflow 运行面板 |
| `/btw <question>` | 向后台 agent 侧问 |
| `/remember <text>` | 保存一条记忆 |
| `/memory` | 记忆浏览器（列表 / 过滤 / 删除 / 预览） |
| `/doctor` | 终端诊断 + 修复指引 |
| `/mcp [tools <name>]` | 列出 MCP server；查看某 server 的工具 |

### 快捷键

| 按键 | 作用 |
|---|---|
| `Ctrl+N` | 新会话 |
| `Ctrl+S` | 恢复最近会话 |
| `Ctrl+Q` | 退出（同 `/exit`） |
| `Ctrl+P` | 命令面板 |
| `Ctrl+.` | 键位表 overlay |
| `Ctrl+F` | 历史搜索（`n`/`N` 下一个，`p`/`P` 上一个） |
| `Ctrl+O` | 展开/收起最近推理块 |
| `Ctrl+E` | 用 `$EDITOR` 打开输入行（可经 `editorKey` 配置） |
| `Ctrl+T` | 中轮转向 |
| `Ctrl+C` | 打断在途回合（空闲时空输入双击退出） |
| `Ctrl+V` | 粘贴剪贴板图片（无图时回退剪贴板文本） |
| `Alt+W` | 把选区复制到系统剪贴板（OSC52） |
| `Shift+Tab` | 模式循环：normal → plan → always-approve |
| `Tab` | `@`-路径补全；接受 slash 菜单选中项 |
| `↑`/`↓` | 输入历史（slash 菜单打开时为选择） |
| `PageUp`/`PageDown` | slash 菜单翻页 |
| `Esc` | 关闭菜单/overlay/检查面板；取消挂起提问；空闲双击 rewind |
| `a` | 审批卡：本会话放行（always-approve + 结算当前请求） |

## 装配

bundle patch 在 `dsh-base` 之上插入 `tui-runner` 插件：

```yaml
- id: tui-runner
  name: '@huiliyi37/dsh-tianshu-tui'
```

`TuiRunnerConfig`（均可选）：`stdin`/`stdout`（流注入，缺省走进程流）、`initialSessionId`、`editorKey`（缺省 `ctrl_e`；`ctrl+o` 保留给推理展开）、`vimEnabled`（缺省 `false`）、`vision`（supportsVision / bridgeEnabled / bridgeSource；未传入时 supportsVision 经 llm catalog 自动刷新、bridgeEnabled 按宿主 `visionBridge` 服务存在性自动探测——视觉桥插件装配时应 provide 该服务）、`workflowHistoryLimit`（缺省 `50`）、`lsp`（enabled / timeoutMs；缺省启用、单次拉取超时 2000ms——本地语言服务桥：agent 触碰文件时按扩展名懒启动 LSP server（typescript 经 npx 默认可用，pyright/gopls/rust-analyzer/clangd/jdtls 按 PATH 探测）拉取诊断，展示于工具卡徽标与 `/lsp` 面板；诊断只进 TUI 本地展示缓存，不写会话事件、不注册任何模型面）。

服务依赖：`sessions`/`agents`/`agentDefaultModel` 必需（必选 inject）；`goals`/`subagents`/`memory`/`compact`/`tasks`/`skills`/`sessionProjections`/`workflowEngine`/`planMode` 可选——未装配时相关命令与面板 fails loud 报不可用，绝不静默吞，也不阻塞 TUI 启动。

## 验证

```sh
npm test
```

## Model Experience

无——TUI 渲染已记录的会话事件并转发普通用户输入；不注册任何 prompt、工具或上下文面。

#### KV Cache 影响

无直接影响；经 TUI 提交的用户输入成为普通日志消息，其请求影响归属 session 与 loop 包。

## 已知限制与待办

- **图片再询问需伴生插件** — `ask_image` 工具与会话图片注册表位于 `@deepseek-ai/dsh-vision-ask`（同仓独立包）；TUI bundle 本体不携带它们。未装配插件时，已发送图片无法再次询问，同角度重复描述会再次调用视觉模型；视觉桥仍覆盖一次性提交时描述路径。
- **LSP 为展示层本地桥** — 诊断只上屏（工具卡徽标 + `/lsp` 面板），不提供给模型工具面（如天枢 edit-diff 的 diagnostics-narrowing）；模型侧接入属 harness 侧未来工作。server 初始化慢于超时（默认 2s）时静默无诊断，下次触碰文件重拉；大仓库 tsserver 常驻内存（懒启动缓解，无空闲回收）；切会话不重启 server（rootUri 沿用首会话 cwd）。
- **app.ts 单体（约 3.2k 行）** — 挂起状态机已控制器化（question/approval），渲染组合与键仲裁仍在 app.ts；C4 拆分方案（纯函数面板段）持续推进。
- **投影层部分接线** — 四个纯折叠模型中 turn-summary（turn/end 摘要行）与 summary-state（`/status` 会话汇总段，宿主投影总线缺失时仍有数据）已接线；activity-status/activity-store 有意保留未接线（statusline 是自包含投影，替换无收益；activity-store 暂无消费方）。当前状态记录于 [docs/projection-layer.md](docs/projection-layer.md)。

## 许可与来源

Apache-2.0。终端渲染引擎从 [天枢 Tianshu-Tui](https://github.com/huiliyi37/Tianshu-Tui) 演进而来（Apache-2.0）；逐文件来源与修改声明见 [SOURCE-MAP.md](SOURCE-MAP.md) 与 [NOTICE](NOTICE)。

## 友情链接

| 项目 | 简介 |
|---|---|
| [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) | DSH Web UI 插件与皮肤合集 |
| [dshfind](https://dshfind.com/zh) | DeepSeek Harness 中文学习与分享社区 |
| [deepseek-harness-ux](https://github.com/ayuanwong/deepseek-harness-ux) | 长任务不刷屏：关键进度清晰可见，完成后自动折叠 |
| [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) | Claude Code 风格全屏交互终端插件 |
| [DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) | 侧边栏完整工作台：第三方 Tab、文件/终端/Git/子代理 |
| [DSH Desktop](https://github.com/anywhere-labs/deepseek-harness-desktop) | DeepSeek Harness 社区桌面端（Electron，Windows x64 / macOS Apple Silicon 安装包），下载即用、免配置命令行环境。内置本地 Harness 宿主与插件系统，支持 iOS/Android 远程下发任务、跟踪 agent 进度。 |
| [dsh-whale-report](https://github.com/SenmuuuuW/dsh-whale-report) | 把 session、token、cost、tool call 与风险异常转成可读的 Agent 报告 |
