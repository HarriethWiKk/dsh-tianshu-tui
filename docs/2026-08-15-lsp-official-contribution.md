# LSP getDiagnostics 贡献记录——官方 PR 推送不支持，社区插件落地

日期：2026-08-15
状态：已归档（官方路线本地存档 + 社区插件落地 + TUI 适配完成）

## 背景

官方 harness 主仓（`deepseek-ai/deepseek-harness`，web 端本体）已有完整 LSP 家族
（`packages/lsp/`，rc.5）：

| 官方包 | 角色 |
|---|---|
| `@deepseek-ai/dsh-lsp` | `ctx.lsp` seam：`goToDefinition` / `findReferences` / `goToImplementation` / `hover`（四操作，无 JSON-RPC 逃生门） |
| `@deepseek-ai/dsh-lsp-stdio` | 通用 stdio provider（`ctx.fs`/`ctx.subprocess`，transient-open 查询） |
| `@deepseek-ai/dsh-tool-lsp` | 模型工具 `lsp`（四操作、会话 cwd、60s 超时预算） |

官方 seam **没有 diagnostics 操作**（只有导航四操作）——文件诊断拉取是明确空白。

## 我们做的：getDiagnostics 完整参考实现

在官方仓本地分支 `feat/lsp-diagnostics`（commit `f77ec69`，未推送）完整实现：

- **dsh-lsp seam**：`LspOperation` 加第五操作 `getDiagnostics`；`LspQueryRequest` /
  `LspProviderQuery` 变判别联合（导航操作带 `position`、诊断不带）；`LspQueryResult`
  加 `{ kind: 'diagnostics' }` 分支；`LspDiagnostic` 类型（白名单字段：
  range/severity/message/code/source；severity 协议默认 1）
- **dsh-lsp-stdio**：`textDocument/diagnostic` 请求映射 + `diagnosticProvider` 能力检查
  + `normalizeDiagnostics`（full/unchanged/null 报告处理、malformed 防御、severity 默认）
- **dsh-tool-lsp**：`lsp` 工具加 `getDiagnostics` 操作（schema enum、导航专用坐标、
  `formatDiagnostics` 渲染、诊断输出分支、无坐标 presentCall）
- 测试：223 例全绿（translate 归一化、instance 端到端经 fixture server、tool 解析/
  渲染/执行）；oxlint 0 错误；`docs/subsystems/lsp.md` 已更新

## 官方不支持 PR 推送（事实记录）

1. 直接推送官方仓被拒：`Permission to deepseek-ai/deepseek-harness.git denied to huiliyi37`（403）
2. fork 推送（`huiliyi37/deepseek-harness`）被 lefthook pre-push typecheck 拦截
   （全仓类型检查未通过——环境依赖未全构建，非本改动问题）
3. **用户确认：官方不接受社区 PR 推送**——官方路线按官方自己的节奏演进

结论：**社区贡献不走官方 PR**。官方仓 `feat/lsp-diagnostics` 分支保留本地存档
（参考实现；官方未来若采纳，直接引用该分支或重新提 PR）。

## 社区插件落地（omdsh-dev/dsh-lsp）

官方参考实现的契约改进已回灌社区插件
[`omdsh-dev/dsh-lsp`](https://github.com/omdsh-dev/dsh-lsp)（commit `6634206`）：

- severity 协议默认 1/error（undefined 防御）
- `LspDiagnostic` 扩展 `code`/`source` 白名单字段（服务端透传）
- `lsp_diagnostics` 工具输出补 `code`/`source` 可选字段

社区插件定位：独立 LSP 客户端（天枢移植 rpc/manager/multi-manager/server-registry）+
模型工具面（`lsp_goto_definition` / `lsp_find_references` / `lsp_diagnostics`）+
`provide('lsp')` 服务。装配：

```sh
npx -y @deepseek-ai/dsh plugin --profile tui add github:omdsh-dev/dsh-lsp
```

## TUI 桥双形状探测（本仓）

`ensureLspBridge` 诊断源探测顺序（语义同视觉桥 resolveVisionBridge）：

1. 社区插件 `provide('lsp')` 服务（`getDiagnostics` 形状直连——与模型工具面共享 server 集）
2. 官方 `ctx.lsp` seam（`query(getDiagnostics)` 适配——官方 seam 未含该操作时恒空，
   **未来官方采纳后自动生效**，无需改动）
3. 内置桥降级（未装配任何插件时保持现状行为）

相关提交（本仓）：`9dd0cef`（LSP 上屏）/ `dedf783`（伴生包）/ `b7c36c0`（迁出独立仓）/
`70cb50c` + `1e85552`（官方 seam 适配）/ `326adb7`（双形状探测）。

## 未来动作（如需）

- 官方若开放贡献：从 `feat/lsp-diagnostics` 分支提 PR（改动已就绪、测试全绿）
- 社区插件迭代：天枢的编辑后诊断收窄（`computeChangedLineRanges` +
  `filterDiagnosticsForEdit`）可作第二版
