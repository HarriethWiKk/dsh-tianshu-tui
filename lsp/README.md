# dsh-lsp

DeepSeek Harness（DSH）LSP 插件：**模型工具面 + 共享服务**。

- 注册三个只读模型工具：`lsp_goto_definition` / `lsp_find_references` / `lsp_diagnostics`
- `provide('lsp')` 服务：多语言 LSP 客户端（懒 spawn、生命周期随插件）
  ——TUI 展示桥（如 `@huiliyi37/dsh-tianshu-tui`）探测到该服务时消费它，
  与模型工具面共享同一 LSP server 集，**不双份 spawn**；未装配本插件时
  TUI 回落内置桥。

## 安装

```sh
npx -y @deepseek-ai/dsh plugin --profile tui add github:omdsh-dev/dsh-lsp
npx -y @deepseek-ai/dsh --profile tui
```

或手工在 profile 的 `cordis.patch.yml` 追加：

```yaml
- insert:
    - id: lsp
      name: '@deepseek-ai/dsh-lsp'
```

## 工具

| 工具 | 参数 | 返回 |
|---|---|---|
| `lsp_goto_definition` | `file_path` / `line`（1-based）/ `column`（0-based） | 定义位置列表 `path:line:col` |
| `lsp_find_references` | 同上 | 引用位置列表 |
| `lsp_diagnostics` | `file_path` | 诊断列表（severity / 行列 / message） |

三个工具均带 `presentCall`（generic 卡片标题），TUI 工具卡零接线消费。

## 语言支持

| 扩展名 | server | 可用性 |
|---|---|---|
| `.ts .tsx .js .jsx .mjs .cjs` | `typescript-language-server`（经 `npx -y`） | 默认可用（首次触发时下载） |
| `.py .pyi` | `pyright-langserver` | PATH 探测 |
| `.go` | `gopls` | PATH 探测 |
| `.rs` | `rust-analyzer` | PATH 探测 |
| `.c .h .cpp .cc .cxx .hpp .hh` | `clangd` | PATH 探测 |
| `.java` | `jdtls` | PATH 探测 |

server 未安装时对应文件返回空结果（不报错）；拉取超时（默认 2s，可配
`timeoutMs`）静默返回空。

## 配置

| 键 | 缺省 | 说明 |
|---|---|---|
| `enabled` | `true` | 主开关 |
| `timeoutMs` | `2000` | 单次调用超时（毫秒） |
| `cwd` | `process.cwd()` | LSP server rootUri 基准 |

## 服务接口（`ctx.get('lsp')`）

```ts
interface LspService {
  getDiagnostics(filePath: string, timeoutMs?: number): Promise<LspDiagnostic[]>
  gotoDefinition(filePath: string, line: number, character: number): Promise<LspLocation[]>
  findReferences(filePath: string, line: number, character: number): Promise<LspLocation[]>
  changeFile(filePath: string): void
  isAvailable(): boolean
  dispose(): void
}
```

## 开发

```sh
npm install
npm run typecheck
npm test
npm run build
```

## 来源

LSP 客户端核心（rpc / manager / multi-manager / server-registry）移植自
[天枢 Tianshu](https://github.com/huiliyi37/Tianshu-Tui) `src/lsp/`
（Apache-2.0 上游；本包按 MIT 分发，上游许可声明见 `NOTICE`）。
