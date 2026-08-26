# 交互手册

dsh-tianshu-tui 的全部交互:快捷键、命令、输入面与交互面板。

## 快捷键

### 会话与全局

| 按键 | 作用 |
|---|---|
| `Ctrl+N` | 新会话 |
| `Ctrl+S` | 恢复最近会话 |
| `Ctrl+Q` | 退出(同 `/exit`;Ctrl+C 连按两次也可退出——有草稿时第一次清空草稿再按一次退出,打断中第二次直接退出) |
| `Ctrl+.` | 键位表 overlay(随时呼出) |
| `Ctrl+P` | 命令面板(模糊搜索 + Enter 回填) |
| `Ctrl+F` | 历史搜索(`n`/`N` 下一个,`p`/`P` 上一个) |

多会话切换走 `/session list|switch`(或 `Ctrl+S` 恢复最近)。

### 输入

| 按键 | 作用 |
|---|---|
| `Ctrl+E` | 用 `$EDITOR` 打开输入行(可经 `editorKey` 配置) |
| `Ctrl+T` | 中轮转向(不中断地纠正方向) |
| `Ctrl+V` | 粘贴剪贴板图片(无图时回退剪贴板文本) |
| `Alt+W` | 把选区复制到系统剪贴板(OSC52) |
| `Tab` | `@`-路径补全;接受 slash 菜单选中项 |
| `↑`/`↓` | 输入历史(slash 菜单打开时为选择) |
| `PageUp`/`PageDown` | slash 菜单翻页;长草稿输入视窗翻页 |
| `Esc` | 关闭菜单/overlay/检查面板;取消挂起提问 |

### 回复与工具

| 按键 | 作用 |
|---|---|
| `Ctrl+C` | 打断在途回合(即时) |
| `Esc`(在途) | 打断在途回合(对齐 Claude Code 单次 Esc;lone ESC 80ms 防误触;overlay/菜单/检查面板打开时仍先关闭) |
| `Esc`(检查面板) | 关闭 `/config` `/skills` `/status` `/lsp` `/tasks`(有草稿也关,不布防 rewind) |
| `Esc`+`Esc`(空闲) | 打开 rewind 回退面板(Claude Code 的 Esc+Esc 时间回溯;1s 双击窗口,同 `/rewind`) |
| `Ctrl+O` | 展开/收起最近推理块 |
| `Enter`(空输入) | 切换最后一张进行中工具卡的展开(显示参数 JSON) |
| `Shift+Tab` | 模式循环:normal → plan → always-approve |

输入轨上方默认是统一活动带(`◐ N 子代理 · M 工作流` + 每项一行统计,封顶 `activityBandMaxRows`):子代理结束塌成 `✓ {label} · N 工具 · X tok · 12s`,工作流结束再提交一行摘要。`activityBand: false` 回退为每条运行中子代理一行 spinner。

### 交互面板

| 按键 | 作用 |
|---|---|
| `y` / `N` / `Ctrl+C` | 审批卡:允许 / 拒绝 / 取消 |
| `a` | 审批卡:本会话放行(always-approve + 结算当前请求) |
| `f` → `Enter` | plan-review 反馈模式(Keep planning + 自定义反馈) |
| 数字键 | 结构化提问面板选项 |
| 选择器中:`↑`/`↓`(j/k)选择、`Enter` 应用(本会话)、`S` 设为默认、`Esc`/`q` 关闭 | `/model` `/theme` `/effort` 选择器(会话/`/key` 选择器无 S) |
| 会话列表:按今天/昨天/本周/更早分组后逐行打印 | `/session list` |
| 会话选择器:`↑`/`↓` 滚动(跳过分组头) | `/session` 无参选择器(今天/昨天/本周/更早 + 标题/相对年龄，不分页) |

## 命令全表(29 条)

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
| `/model [target] [effort] [default]` | 查看/切换模型(无参打开选择器; Enter=本会话, S 或末尾 `default`=启动默认; 别名 `spark-flash`/`spark-pro`) |
| `/effort off\|high\|max\|auto\|default` | 设置推理等级(无参打开选择器; Enter/带参=本会话, S 或 `default`=启动默认; `auto` 回模型默认) |
| `/preset [name] [default]` | 查看/切换 agent 预设(本包已挂官方花名册;带参=本会话整套 agent 面; 末尾 `default`=新会话启动默认; 仅空白会话可换) |
| `/yolo [on\|off]` | 全放行模式 |
| `/density [default]` | 切换紧凑工具卡渲染(开关=本会话; `/density default`=启动默认) |
| `/glance [segment]` | 切换 footer metrics 段显隐(如 `/glance cost`;无参查看现状) |

### 面板

| 命令 | 作用 |
|---|---|
| `/status` | 状态面板(goal/todos/plan 投影 + 会话汇总) |
| `/todos [all]` | 待办卡画在输入轨上方(无参显隐; `all` 看全表)。默认列出进行中置顶的最多 5 条;全完成缩回一行。模型首次写入非空待办会自动出现;关掉或 `/clear` 后本会话不再自动开 |
| `/config [notify [on\|off]]` | 设置面板(终端通知/密度置顶;空输入 `n`/`d`。检查面板互斥,Esc 关闭) |
| `/skills` | 技能浏览(空输入 ↑↓/j/k 展开选中详情) |
| `/tasks [kill <id>]` | 任务窗格 |
| `/goal` | 目标管理(创建/暂停/恢复/完成/阻塞) |
| `/subagents` | 委派树活区卡(进行中第二行、失败态;宿主有外部 run 时追加「⤷ 外部子代理」) |
| `/workflow` | workflow 运行面板(roster 在 childId 命中委派树时追加子会话 label / 运行态) |
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
| `/theme [name] [default]` | 切换主题(无参打开选择器,含 `custom:`; Enter/带参=本会话, S 或末尾 `default`=启动默认);`auto` 随终端明暗;`export [name]` 导出当前主题为自定义模板 |
| `/steer <text>` | 中轮转向 |
| `/restart` | 重启当前 dsh 进程(同命令重新启动;插件更新后生效) |
| `/exit` | 退出 TUI |

## 输入面

- **Slash 菜单**:输入 `/` 打开;模糊前缀匹配、MRU 排序、Tab 接受、Enter 提交、
  参数 ghost 预览。**userInvocable 技能也进菜单**(`🧭` 标记,数据源 `ctx.skills.list`
  按 `invocation.userInvocable` 过滤;技能目录变化经 `skills/change` 事件自动刷新)。
  空输入框 `Tab` 打开的命令菜单(`/` 全集)同样包含技能条目。
- **技能手势**:消息文本中任意词边界的 `/技能名`(kebab-case,如 `/find-skills`)由
  harness 的 tool-skill 钩子识别为「用户显式技能调用」——命中 userInvocable 技能时
  其指令体注入当轮上下文(转录侧显示为 `🧭 使用技能: <name>` 摘要行),未知名保持
  普通文本。提交 `/技能名` 不会落「未知命令」;已知命令优先于同名技能(命令命名
  空间客户端先行解析)。
- **@ 引用**:`@` 触发路径补全(Tab),提交时展开为文件摘要(@mention),带 cwd 边界
  与截断降级。
- **图片粘贴**:`Ctrl+V` 或终端菜单粘贴;超大图提交前自适应压缩(长边 1568px 封顶,
  逐级 JPEG 降质)。
- **多行输入与 bracketed paste**:粘贴多行/长文本整段进输入行,不逐行提交。
  长草稿编辑:输入视窗最多 16 行(超出折叠「… 上/下 N 行」),`↑↓` 按软折行
  移动、`PageUp/Down` 翻页、`Home/End/Ctrl+U/K` 以逻辑行为范围;超过
  100 行/10000 字的超大粘贴收纳为 `[paste #N]` 标记(提交时展开)。
- **Vim 键位**:可选(`vimEnabled`);Alt+W/yank 经 OSC52 复制选区。

## 交互面板

- **审批卡**:挂起审批内联 diff 预览(y/N/a/esc);工具可 diff 时红绿渲染,不可见时
  盲批提示;非当前会话请求委托下一个监听者。
- **提问面板**:数字键选择、Esc 取消、重叠保护;plan-review 反馈模式。
- **选择器(issue #31)**:`/model` `/theme` `/effort` `/session` 无参打开,当前值 ● 高亮,
  启动默认 ★。`/model` `/theme` `/effort`：Enter 仅本会话, S 应用并写启动默认。
  会话与 `/key` 选择器不加 S。**主题选择器支持实时预览**:↑↓ 移动即切换主题,
  Enter 落定(不写 prefs)、S 写启动默认、Esc 还原打开前主题。
- **命令面板(Ctrl+P)**:命令模糊搜索 + 子序列匹配,Enter 回填 `/cmd `。
- **键位表(Ctrl+.)**:完整快捷键清单,随时呼出。
- **历史搜索(Ctrl+F)**:滚动区消息快照搜索,`n`/`N` 跳转。

## Overlay 体系

全屏 overlay(命令面板、键位表、历史搜索、rewind、记忆浏览器、选择器)共享同一套
生命周期:打开进 alt screen、Esc/Ctrl+C 关闭、关闭后补写暂存 scrollback。流式输出
不会盖住打开的 overlay。
