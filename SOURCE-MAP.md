# dsh-tianshu-tui source map

本包渲染核心移植自天枢（Tianshu，曾用代号 Rivet）终端 UI 引擎，Apache License 2.0：

- 上游：https://github.com/huiliyi37/Tianshu-Tui（`src/tui/` 子树）
- port 时点：本仓提交 `b26ebed`（2026-08-10）自上游 `src/tui` @ `bc2aa2a0c` 移植；上游快照不随仓分发
- 上游版权：Apache License 2.0, Copyright 2025-2026 Tianshu Contributors（许可全文见 `LICENSE`；再分发与修改声明见 `NOTICE`）

状态图例（封闭枚举；`tests/source-map.spec.ts` 校验 src 全覆盖与取值合法，不做同一性核验）：

- `ported` — 自上游对应文件移植，port 后无本地改动。**不主张字节同一性**：上游快照不在仓内，无法机械核验；port 期的 lint 适配若产生差异则该文件归 `modified`。
- `modified` — 移植后为 dsh 接缝适配过；Apache §4(b) 的修改声明集中记录于本表与 `NOTICE`。
- `new` — dsh 原创，非上游作品的一部分（与本包其余部分同按 Apache-2.0 分发）。

## src/ ↔ 上游映射

上游列 `—` 表示无上游对应文件（`new`）。

| Target (this package) | Upstream (Tianshu src/tui/) | Status |
|---|---|---|
| src/activity-status.ts | activity-status.ts | modified |
| src/activity-store.ts | activity-store.ts | modified |
| src/adapter/live.ts | — | new |
| src/adapter/send.ts | — | new |
| src/adapter/session-title.ts | — | new（/session list 会话标题展示：官方 log-backed session/title 事件 fold → 确定性 fallback → 「新对话」；纯函数只读，不调 API、不写 sidecar） |
| src/adapter/sessions.ts | — | new |
| src/adapter/tool-view.ts | — | new（presenter 桥：镜像 apiproxy viewFor 的 presentCall/presentResult 软降级消费） |
| src/adapter/transcript.ts | — | new |
| src/block-stream-writer.ts | block-stream-writer.ts | modified |
| src/box-chars.ts | box-chars.ts | ported |
| src/braille-spinner.ts | braille-spinner.ts | modified |
| src/command-palette.ts | command-palette.ts | modified |
| src/commands/registry.ts | — | new |
| src/completion/file-completer.ts | file-completer.ts | modified（目录重排 src/tui/ → src/completion/；`resolveFileCompletion` Tab 协调入口为 dsh 新增） |
| src/config-panel.ts | — | new |
| src/controllers/approval-controller.ts | — | new |
| src/controllers/btw-controller.ts | — | new |
| src/controllers/question-controller.ts | — | new |
| src/controllers/session-manager.ts | — | new |
| src/controllers/skill-surface.ts | — | new（#39 技能展示面：快照缓存 + userInvocable 过滤 + slash 菜单投影 + 手势 MRU + skills/change 订阅，从 ui/app.ts 提取） |
| src/delegation-panel.ts | — | new |
| src/engine/ansi.ts | engine/ansi.ts | modified（新增 DECSCUSR 光标形状常量：稳态竖条 + 默认恢复，overlay 输入光标用） |
| src/engine/clipboard-image.ts | engine/clipboard-image.ts | modified（移除未声明的 @mariozechner/clipboard native 路径，保留 shell 链 + 注入点；readText 注入测试密封化） |
| src/engine/commit-engine.ts | engine/commit-engine.ts | modified |
| src/engine/image-attach.ts | engine/image-attach.ts | modified（三级自适应压缩：1568px 保透明 PNG / JPEG 0.82 → JPEG 0.55 → 1024px+0.55，语义对齐上游 desktop 子树 image-compress.ts 的 compressImageSafe；probeImageSize 头部解析为 dsh 新增） |
| src/engine/image-tool.ts | engine/image-tool.ts | modified（新增 resizeJpegCandidates——长边缩放 + JPEG 质量候选链，win32 脚本含 EncoderParameter 质量参数；语义对齐上游 desktop 子树 image-compress.ts；resize 链 sips 显式 -s format png） |
| src/engine/input-controller.ts | engine/input-controller.ts | modified（类型内联；`tabComplete` Tab 补全状态机驱动） |
| src/engine/input-handler.ts | engine/input-handler.ts | modified |
| src/engine/input-line.ts | engine/input-line.ts | modified（多行 ↑↓ 导航 grapheme 列保持——CJK/emoji 跨行不拆簇；2026-08 天枢长文本优化整文件同步：charDisplayWidth 折行缓存（10 万字符草稿按键 ~1.3s→~10ms）+ 粘贴折叠阈值 100 行/10000 字 + 输入视窗 16 行上限（… 上/下 N 行）+ Home/End/Ctrl+U/K 逻辑行域 + PageUp/Down 翻页 + ↑↓ 软折行视觉导航 + 换行模式粘贴并入草稿） |
| src/engine/live-engine.ts | engine/live-engine.ts | modified |
| src/engine/metrics-glance-controller.ts | engine/metrics-glance-controller.ts | modified |
| src/engine/overlay-controller.ts | engine/overlay-controller.ts | modified |
| src/engine/overlay-engine.ts | engine/overlay-engine.ts | modified（caret 钩子：输入类 overlay 硬件光标 + DECSCUSR 稳态竖条，caret 写不受空 diff 短路；退出恢复光标形状） |
| src/engine/perf-monitor.ts | engine/perf-monitor.ts | modified |
| src/engine/resize-handler.ts | engine/resize-handler.ts | ported |
| src/engine/stream-renderer.ts | engine/stream-renderer.ts | modified |
| src/engine/term-image.ts | engine/term-image.ts | modified |
| src/engine/write-batcher.ts | engine/write-batcher.ts | ported |
| src/external-editor.ts | external-editor.ts | modified |
| src/fluency-hook.ts | fluency-hook.ts | modified |
| src/format/activity-labels.ts | format/activity-labels.ts | modified |
| src/format/approval-card.ts | — | new（审批卡：圆角轨 + diff 体 + y/n/a/esc 键位，纯渲染） |
| src/format/btw-panel.ts | — | new |
| src/format/chrome-colors.ts | — | new（输入轨/footer 雾蓝 chrome token，对齐 dsh-cc-tui Gentle Mist Blue） |
| src/format/collapsed-bash.ts | format/collapsed-bash.ts | modified |
| src/format/diff.ts | format/diff.ts | modified |
| src/format/doctor-report.ts | — | new |
| src/format/export.ts | — | new（/export 会话导出：事件日志 → Markdown 转录，纯渲染） |
| src/format/fluency-policy.ts | fluency-policy.ts | modified（目录重排：上游根 → src/format/） |
| src/format/glance-bar.ts | format/glance-bar.ts | modified（hideSegments 段过滤：prefs.glance.hideSegments 透传，model/stalled 永不可隐藏） |
| src/format/glance-metrics.ts | — | new（glance metrics 投影：app 缓存字段 → formatGlanceBar 输入；C4 自 ui/app.ts 提取，时间注入可测） |
| src/format/lsp-diagnostics.ts | — | new（诊断展示纯函数：工具卡徽标 + /lsp 面板段，severity 语义色） |
| src/format/hidden-lines.ts | format/hidden-lines.ts | ported |
| src/format/history-search-overlay.ts | — | new |
| src/format/input-frame.ts | — | new（输入轨：上下圆角横线 ╭─╮/╰─╯，左右不封，纯渲染） |
| src/format/keymap-panel.ts | — | new |
| src/format/markdown.ts | format/markdown.ts | modified |
| src/format/memory-overlay.ts | — | new |
| src/format/permission-diff.ts | format/permission-diff.ts | modified |
| src/format/pricing.ts | — | new（成本估算：内置 $/MTok 定价表 + estimateCost 纯函数，$cost 段数据源） |
| src/format/prompt-footer.ts | — | new（C4 概念稿底部 footer：模式徽标 + 快捷键提示，纯渲染） |
| src/format/reasoning.ts | — | new（think 推理两态渲染：live shimmer 头行 + 尾巴、结算全文块，纯渲染） |
| src/format/rewind-overlay.ts | — | new |
| src/format/separator.ts | separator.ts | modified（目录重排：上游根 → src/format/） |
| src/format/session-cost.ts | — | new（/cost 会话成本汇总：usage 按模型分桶累计 + 报告渲染，纯函数） |
| src/format/shimmer.ts | — | new（光带扫过动画：tick 驱动逐字符插值，样式源用户提供的 deep-diving.gif） |
| src/format/slash-menu.ts | — | new（grok slash_dropdown 移植：slash 命令下拉菜单，纯渲染） |
| src/format/subagent-line.ts | — | new（grok SubagentBlock 移植：subagent 对话流状态行，纯渲染） |
| src/format/spinner-status.ts | format/spinner-status.ts | modified |
| src/format/steer-message.ts | — | new |
| src/format/task-panel.ts | — | new |
| src/format/tool-card.ts | format/tool-card.ts | modified |
| src/format/tool-family.ts | tool-family.ts | modified（目录重排：上游根 → src/format/） |
| src/format/tool-group.ts | — | new |
| src/format/tool-view-card.ts | — | new（presenter 结算卡：diff/terminal 结构化渲染 + generic 回落；renderFileDiff 与审批预览共用） |
| src/format/tool-meta.ts | — | new |
| src/format/turn-summary.ts | turn-summary.ts | modified（上游单文件拆为模型+渲染，此为渲染半；模型半见 src/turn-summary.ts） |
| src/format/turn-status.ts | — | new（C4 概念稿 turn_status：spinner/◆ + 阶段文本，纯渲染） |
| src/format/user-message.ts | format/user-message.ts | modified |
| src/format/welcome.ts | format/welcome.ts | modified |
| src/format/whale.ts | — | new（欢迎页鲸鱼品牌像素画：半块字符双色渲染，品牌固定色 + 色深/宽度档降级，纯渲染） |
| src/gutter.ts | gutter.ts | ported |
| src/git-status.ts | — | new（git 仓库探测三函数：isGitRepo/gitBranch/gitDirtyCount，exec 注入；C4 自 ui/app.ts 提取） |
| src/index.ts | — | new |
| src/input-history.ts | — | new（输入历史持久化：~/.dsh-tui/input-history.json，1000 条上限、进程内追加队列 + 重读合并原子写；上游 history.ts 模式，去重语义取本仓更强的全列表去重） |
| src/lsp/lsp-bridge.ts | — | new（LSP 诊断桥：懒生命周期 + 展示层诊断缓存；扩展名不支持/server 未安装一次标记；per-file 合并与冷却） |
| src/lsp/manager.ts | lsp/manager.ts | modified（initialize 竞速进程早夭：rpc 无超时，进程死掉时 pending 请求永不 settle → error/close settle 入 catch，防 ensure() 永久挂起） |
| src/lsp/multi-manager.ts | lsp/multi-manager.ts | modified（spawn 简化：弃上游 spawnHidden/resolve-node-cli 桌面 bundle 适配，用 node:child_process spawn 直连；win32 经 cmd.exe /d /c 派发 .cmd——npx 不经 shell 直接 spawn 抛 EINVAL） |
| src/lsp/rpc.ts | lsp/rpc.ts | ported（JSON-RPC over stdio：Content-Length 帧编解码 + 请求/通知分发） |
| src/lsp/server-registry.ts | lsp/server-registry.ts | ported（语言 → server 映射：typescript 经 npx / pyright / gopls / rust-analyzer / clangd / jdtls + which 探测） |

独立插件 `@deepseek-ai/dsh-lsp`（omdsh-dev/dsh-lsp 独立仓，源码镜像于本仓 lsp/）复用
同一批移植文件（rpc/manager/multi-manager/server-registry 复制自本包 src/lsp/，同源
Apache-2.0）；`service.ts`（LspService 封装）、`tools.ts`（三个模型工具）、`index.ts`
（插件入口）为 `new`。TUI 展示桥经 `ctx.reflect.get('lsp')` 探测消费该插件服务。
| src/invariant.ts | — | new |
| src/live-tail-cap.ts | live-tail-cap.ts | modified |
| src/mention-expand.ts | — | new |
| src/mention-parser.ts | mention-parser.ts | modified |
| src/pi/latex-block.ts | pi/latex-block.ts | modified |
| src/pi/latex-to-unicode.ts | pi/latex-to-unicode.ts | modified |
| src/prefs.ts | — | new（本地偏好持久化：~/.dsh-tui/prefs.json——theme/density/常驻面板/glance 段；容错解析 + 原子写 + VITEST 密封门） |
| src/picker.ts | — | new（Issue #31 交互式选择器：纯状态机 + 渲染 + PickerController，/model /theme /session 无参打开） |
| src/port.ts | — | new |
| src/preset-surface.ts | — | new（agent 预设展示面纯投影：preset 名 = header 创建值 + agent-preset/selected 切换值 fold（官方 resolveSessionPreset 等价）；wire 工具面 = 最近 request/header 的 tools 集合（foldRequestHeader）；只消费日志事实，不重放 preset 插件私有晋升逻辑） |
| src/question-panel.ts | — | new |
| src/render/live-panels.ts | — | new |
| src/render/live-snapshot.ts | — | new |
| src/restore-session.ts | restore-session.ts | modified |
| src/ring-buffer.ts | ring-buffer.ts | modified |
| src/scrollback-transcript.ts | scrollback-transcript.ts | modified |
| src/self-update.ts | — | new（启动自更新：对照 npm latest 写 profile，dsh 原创；1h 磁盘缓存免每启联网——~/.dsh-tui/update-cache.json 原子写；registry 镜像回退链 npmjs→npmmirror + DSH_TUI_UPDATE_REGISTRY 覆盖，#43） |
| src/session-label.ts | — | new（会话 id 显示短标签：剥离 `session-` 前缀后截 8 位，消除空壳 label；PR #37 的同类截断点统一） |
| src/restart.ts | — | new（#34：同命令行重启原语——argv 重放 + stdio inherit + POSIX detached；/restart 命令与更新后自动重启共用） |
| src/skill-panel.ts | — | new |
| src/status-panel.ts | — | new |
| src/statusline.ts | statusline.ts | modified（追加工作流投影层 + WorkflowStatusLine） |
| src/stream-window.ts | stream-window.ts | ported |
| src/summary-state.ts | summary-state.ts | modified |
| src/term-caps.ts | term-caps.ts | modified |
| src/theme-custom.ts | theme-custom.ts | modified（自定义主题根路径重指到本包 home；exportCurrentTheme：当前主题导出为自定义模板 + 就地注册） |
| src/theme-detect.ts | theme-detect.ts | modified（pause 对称恢复：仅在进入时为暂停态才 `pause()`） |
| src/theme-palettes.ts | theme-palettes.ts | modified |
| src/format/top-bar.ts | — | new（C4 概念稿顶部栏：cwd + 分支 + 模型，纯渲染） |
| src/theme.ts | theme.ts | ported |
| src/tool-status.ts | tool-status.ts | modified |
| src/truncation-marker.ts | truncation-marker.ts | ported |
| src/turn-summary.ts | turn-summary.ts | modified（上游单文件拆为模型+渲染，此为模型半；渲染半见 src/format/turn-summary.ts） |
| src/ui-glyphs.ts | ui-glyphs.ts | ported |
| src/ui/app.ts | — | new（角色对应上游 engine/app.ts，为面向 dsh cordis 服务的独立装配实现，非逐行移植） |
| src/ui/render.ts | — | new |
| src/width.ts | width.ts | modified（+charDisplayWidth：单字符宽度两档有界缓存，输入框折行热路径专用，与 displayWidth 恒等） |
| src/workflow-panel.ts | — | new |

验证命令（映射覆盖护栏，随 tui 包测试执行）：

    pnpm vitest run packages/tui/tui/tests/source-map.spec.ts
