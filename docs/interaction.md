# 交互手册

dsh-tianshu-tui 的全部交互:快捷键、命令、输入面与交互面板。

## 快捷键

### 会话与全局

| 按键 | 作用 |
|---|---|
| `Ctrl+N` | 新会话 |
| `Ctrl+S` | 恢复最近会话 |
| `Ctrl+X` | 会话 tab 栏:切到下一个会话(循环) |
| `Alt+1`~`Alt+9` | 会话 tab 栏:直接跳第 N 个会话 |
| `Ctrl+Q` | 退出(同 `/exit`;空闲时空输入连按两次 Ctrl+C 也可退出) |
| `Ctrl+.` | 键位表 overlay(随时呼出) |
| `Ctrl+P` | 命令面板(模糊搜索 + Enter 回填) |
| `Ctrl+F` | 历史搜索(`n`/`N` 下一个,`p`/`P` 上一个) |

会话数 >1 时,输入轨上方显示**会话 tab 栏**(短 id 列表,当前 ● 高亮;
窄宽丢旧会话 + `+N` 折叠)。

### 输入

| 按键 | 作用 |
|---|---|
| `Ctrl+E` | 用 `$EDITOR` 打开输入行(可经 `editorKey` 配置) |
| `Ctrl+T` | 中轮转向(不中断地纠正方向) |
| `Ctrl+V` | 粘贴剪贴板图片(无图时回退剪贴板文本) |
| `Alt+W` | 把选区复制到系统剪贴板(OSC52) |
| `Tab` | `@`-路径补全;接受 slash 菜单选中项 |
| `↑`/`↓` | 输入历史(slash 菜单打开时为选择) |
| `PageUp`/`PageDown` | slash 菜单翻页 |
| `Esc` | 关闭菜单/overlay;取消挂起提问 |

### 回复与工具

| 按键 | 作用 |
|---|---|
| `Ctrl+C` | 打断在途回合(即时) |
| `Esc`(在途) | 打断在途回合(对齐 Claude Code 单次 Esc;lone ESC 80ms 防误触;overlay/菜单打开时仍先关闭面板) |
| `Esc`+`Esc`(空闲) | 打开 rewind 回退面板(Claude Code 的 Esc+Esc 时间回溯;1s 双击窗口,同 `/rewind`) |
| `Ctrl+O` | 展开/收起最近推理块 |
| `Enter`(空输入) | 切换最后一张进行中工具卡的展开(显示参数 JSON) |
| `Shift+Tab` | 模式循环:normal → plan → always-approve |

### 交互面板

| 按键 | 作用 |
|---|---|
| `y` / `N` / `Ctrl+C` | 审批卡:允许 / 拒绝 / 取消 |
| `a` | 审批卡:本会话放行(always-approve + 结算当前请求) |
| `f` → `Enter` | plan-review 反馈模式(Keep planning + 自定义反馈) |
| 数字键 | 结构化提问面板选项 |
| 选择器中:`↑`/`↓`(j/k)选择、`Enter` 确认、`Esc`/`q` 关闭 | `/model` `/theme` `/session` 无参选择器 |

## 命令全表(28 条)

### 会话

| 命令 | 作用 |
|---|---|
| `/session new\|list\|switch <id>` | 会话管理(无参打开会话选择器) |
| `/fork [directive]` · `/branch` | 分叉当前会话(历史复制到新子会话) |
| `/rewind` | 两阶段回滚(会话截断 + 可选文件回退) |
| `/export [path]` | 导出转录为 Markdown |
| `/clear` | 清空滚动区视图 |
| `/compact` | 压缩会话上下文(需 compact 服务) |

### 模型与模式

| 命令 | 作用 |
|---|---|
| `/model [target] [effort]` | 查看/切换模型(无参打开选择器;别名 `spark-flash`/`spark-pro`) |
| `/effort off\|high\|max\|auto` | 设置推理等级(热切) |
| `/preset [name]` | 查看/切换 agent 预设模式 |
| `/yolo [on\|off]` | 全放行模式 |
| `/density` | 切换紧凑工具卡渲染 |

### 面板

| 命令 | 作用 |
|---|---|
| `/status` | 状态面板(goal/todos/plan 投影 + 会话汇总) |
| `/config` | 设置面板(settings / permission / credentials) |
| `/skills` | 技能浏览面板 |
| `/tasks [kill <id>]` | 任务窗格 |
| `/goal` | 目标管理(创建/暂停/恢复/完成/阻塞) |
| `/subagents` | 委派树面板 |
| `/workflow` | workflow 运行面板 |
| `/lsp` | LSP 诊断面板 |

### 记忆与诊断

| 命令 | 作用 |
|---|---|
| `/remember <text>` | 保存一条项目记忆 |
| `/memory [delete <id>]` | 记忆浏览器 |
| `/btw <question>` | 向后台 agent 侧问 |
| `/doctor` | 终端诊断 + 修复指引 |
| `/mcp [tools <name>]` | 列出 MCP server 与工具 |
| `/help [cmd]` | 命令帮助 |
| `/cost` | 当前会话累计用量与成本估算(按模型分桶) |

### 其他

| 命令 | 作用 |
|---|---|
| `/theme [name]` | 切换主题(无参打开选择器) |
| `/steer <text>` | 中轮转向 |
| `/exit` | 退出 TUI |

## 输入面

- **Slash 菜单**:输入 `/` 打开;模糊前缀匹配、MRU 排序、Tab 接受、Enter 提交、
  参数 ghost 预览。
- **@ 引用**:`@` 触发路径补全(Tab),提交时展开为文件摘要(@mention),带 cwd 边界
  与截断降级。
- **图片粘贴**:`Ctrl+V` 或终端菜单粘贴;超大图提交前自适应压缩(长边 1568px 封顶,
  逐级 JPEG 降质)。
- **多行输入与 bracketed paste**:粘贴多行/长文本整段进输入行,不逐行提交。
- **Vim 键位**:可选(`vimEnabled`);Alt+W/yank 经 OSC52 复制选区。

## 交互面板

- **审批卡**:挂起审批内联 diff 预览(y/N/a/esc);工具可 diff 时红绿渲染,不可见时
  盲批提示;非当前会话请求委托下一个监听者。
- **提问面板**:数字键选择、Esc 取消、重叠保护;plan-review 反馈模式。
- **选择器(issue #31)**:`/model` `/theme` `/session` 无参打开,当前值 ● 高亮,
  上下键选择、回车确认。**主题选择器支持实时预览**:↑↓ 移动即切换主题,
  Enter 落定、Esc 还原打开前主题。
- **命令面板(Ctrl+P)**:命令模糊搜索 + 子序列匹配,Enter 回填 `/cmd `。
- **键位表(Ctrl+.)**:完整快捷键清单,随时呼出。
- **历史搜索(Ctrl+F)**:滚动区消息快照搜索,`n`/`N` 跳转。

## Overlay 体系

全屏 overlay(命令面板、键位表、历史搜索、rewind、记忆浏览器、选择器)共享同一套
生命周期:打开进 alt screen、Esc/Ctrl+C 关闭、关闭后补写暂存 scrollback。流式输出
不会盖住打开的 overlay。
