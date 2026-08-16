# 配置

dsh-tianshu-tui 的配置分三层:**装配时配置**(TuiRunnerConfig,插件注入)、
**环境变量**(进程级)、**运行时配置**(TUI 内命令/面板)。

## 装配时配置(TuiRunnerConfig)

插件装配方(TuiRunnerConfig,全部可选)经 `dsh plugin` 的配置面注入:

| 字段 | 缺省 | 说明 |
|---|---|---|
| `stdin` / `stdout` | 进程流 | 键盘输入流 / 渲染输出流(测试替身注入用) |
| `initialSessionId` | 新建会话 | 启动即切入的会话 id |
| `editorKey` | `ctrl_e` | 外部编辑器触发键(`ctrl+o` 保留给推理展开) |
| `vimEnabled` | `false` | 是否启用 Vim 键位 |
| `vision.supportsVision` | llm catalog 自动刷新 | 主控模型是否原生识图(图片直发) |
| `vision.bridgeEnabled` | 按宿主 `visionBridge` 服务存在性自动探测 | 是否配置独立识图桥模型 |
| `vision.bridgeSource` | — | 识图桥来源(configured / auto / none) |
| `workflowHistoryLimit` | `50` | `/workflow` 面板已结算 run 缓存上限(drop-oldest) |
| `lsp.enabled` | `true` | LSP 诊断拉取开关(本地语言服务桥) |
| `lsp.timeoutMs` | `2000` | 单次诊断拉取超时 |
| `autoRestartOnUpdate` | `true` | 启动自更新落盘后自动重启生效;`false` 时仅提示,手动 `/restart` |

## 环境变量

| 变量 | 说明 |
|---|---|
| `DEEPSEEK_API_KEY` | API key(欢迎页/状态行按 credentials 分层判断) |
| `DSH_TUI_SKIP_UPDATE` | `1` 时跳过启动时的 npm 更新检查 |
| `EDITOR` / `VISUAL` | `Ctrl+E` 外部编辑器的命令(Windows 上支持 `.cmd`/`.bat`) |
| `HTTP_PROXY` / `HTTPS_PROXY` | 网络代理(自更新等联网操作) |

> **自更新的包管理器适配**:启动自更新按 profile 锁文件自动选择包管理器
> (`pnpm-lock.yaml` → pnpm,`package-lock.json` → npm,`yarn.lock` → yarn,
> 无锁文件默认 pnpm)。无需手动配置;仍可用 `DSH_TUI_SKIP_UPDATE=1` 关闭。

## 运行时配置

### `/config` 面板

`/config` 打开设置面板,三段:

- **settings**:宿主 settings 服务 describe 输出
- **permission**:权限预设选择器(组合了 `dsh-permission` 的 PermissionSelect;
  服务缺失时该段不渲染)
- **credentials**:凭据状态(只显示存在性,不显示明文)

### 常用运行时设置命令

| 命令 | 作用 |
|---|---|
| `/theme [name]` | 切换主题(无参打开选择器;`custom:<name>` 自定义) |
| `/density` | 切换紧凑工具卡渲染 |
| `/model [target] [effort]` | 查看/切换模型(无参打开选择器;`spark-flash`/`spark-pro` 别名) |
| `/effort off\|high\|max\|auto` | 设置推理等级(当前会话热切) |
| `/preset [name]` | 查看/切换 agent 预设模式(标准 / PTC / 极简 / 创造) |
| `/yolo [on\|off]` | 全放行模式(等价 Shift+Tab 进 always-approve) |
| `Shift+Tab` | 模式循环:normal → plan → always-approve |

### 配置持久化

- 模型/effort 选择经 `agentDefaultModel` 服务持久化(会话默认);
  always-approve 是会话级本地态,切换/退出时复位。
- 会话恢复时,输入框历史、会话列表来自宿主持久化(`sessionPersistence`)。
