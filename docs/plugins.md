# 插件生态与扩展

dsh-tianshu-tui 本身是官方 DeepSeek Harness 的插件;在其之上还有**伴生插件**与
**扩展点**两层。本仓同时包含两个独立插件:根目录的 `@huiliyi37/dsh-tianshu-tui`
与 `vision-ask/` 子目录的 `@deepseek-ai/dsh-vision-ask`。

## 伴生插件

| 插件 | 包名 | 能力 | 装配 |
|---|---|---|---|
| 视觉副驾 | `@deepseek-ai/dsh-vision-ask`(同仓 `vision-ask/`) | 已发送图片登记为短 id(`img_1` …),模型可经 `ask_image` 反复询问;同图同角度命中 per-image 描述缓存 | 独立装配,细节见 [vision-ask/README.md](../vision-ask/README.md) |
| LSP 模型工具面 | `omdsh-dev/dsh-lsp`(社区独立仓) | 模型可调 `lsp_goto_definition` / `lsp_find_references` / `lsp_diagnostics`;装配后 TUI 展示桥自动消费其 `lsp` 服务,与模型工具面共享同一 LSP server 集 | `dsh plugin --profile tui add github:omdsh-dev/dsh-lsp` |
| 视觉桥 | `dsh-vision-bridge`(harness 侧) | 主模型不识图时,提交前经独立视觉模型生成图片描述 | provide `visionBridge` 服务;TUI 按服务存在性自动探测 |

TUI 展示桥的 LSP 诊断源探测顺序:社区插件服务(getDiagnostics 形状)→ 官方
`ctx.lsp` seam → 内置桥降级。

## 扩展点

### 1. Slash 命令注册表(`tui.commands` 服务)

TUI 构造时把注册表注册为 `tui.commands` 服务。外部插件可以:

```ts
const registry = ctx.tui.commands  // 或经 ctx.reflect.get('commands')
registry.register({
  name: 'mycmd',
  description: '我的命令',
  argsHint: '<arg>',
  run: async ({ text, echo, ctx, sessionId }) => { echo('hello') },
})
```

- 命令对象:`name`(小写,不与既有命令互为前缀)/ `description` / `argsHint?` / `run`
- 最小唯一前缀解析:歧义或未知名拒绝,不猜命令
- `/help` 与命令面板自动收录新命令(单一事实来源)

### 2. Overlay 注册

`OverlayController` 暴露注册面,外部插件可实现 `render(width, height): string[]`
契约注册自己的全屏 overlay(进出 alt screen、Esc 关闭、scrollback 补写都自动处理)。

### 3. 事件消费

TUI 订阅的会话事件与 workflow/subagent/approval 事件(见 ADAPTER.md 清单)都可被
外部插件同时消费——事件是广播的,不互斥。

### 4. 主题

内置调色板在 `src/theme-palettes.ts`;`custom:<name>` 支持运行时自定义。
新增内置主题必须带 `description`(`/theme` 选择器的单一事实来源)。

## 服务依赖(消费面)

TUI 消费的宿主服务分必选/可选,可选服务缺失时相关命令与面板 fails loud
(⚠ 警告),绝不静默空白,也不阻塞 TUI 启动。完整清单见 [ADAPTER.md](../ADAPTER.md)。

## 打包与发布

- 本仓同时产出两个包:根 `@huiliyi37/dsh-tianshu-tui` 与 `vision-ask/`
  (独立 package.json/tsconfig/tests)。
- `lsp/` 目录是历史源码(已迁出为社区独立仓 omdsh-dev/dsh-lsp),不再随本仓发布。
- 发版流程见 [RELEASE.md](RELEASE.md);`lib/index.js` 必须跟仓。

## 贡献新插件

想为 TUI 生态贡献新插件,建议:

1. 先确认能力边界:展示层能做什么/不能做什么见 [ADAPTER.md](../ADAPTER.md)
   (能:新命令、新 overlay、事件消费、主题;不能:改请求体、workflow 控制、审批 patch)。
2. 用 `tui.commands` 注册表 + overlay 契约起步,纯函数渲染层放 `format/` 风格模块。
3. 新文件必须补 `SOURCE-MAP.md` 条目(CI 护栏)。
