# 在 VS Code 中使用

dsh-tianshu-tui 是终端应用,在 VS Code 内置终端中直接运行即可。当前没有官方
VS Code 扩展;本文给出推荐的终端配置与常见问题。

## 启动

1. 安装插件(见[快速开始](getting-started.md))。
2. 在 VS Code 内置终端(Terminal → New Terminal)运行:

```sh
npx -y @deepseek-ai/dsh --profile tui
```

## 推荐终端设置

VS Code 内置终端默认即可用;以下设置可提升体验(`settings.json`):

```jsonc
{
  // 图片渲染:内置终端支持终端图形协议时,剪贴板图片可内联显示
  "terminal.integrated.enableImages": true,
  // 高对比下 TUI 颜色更准;按你的主题选择
  "terminal.integrated.minimumContrastRatio": 1,
  // 宽终端(顶部栏/工具卡有更多空间)
  "terminal.integrated.defaultProfile.osx": "zsh",
  // 字体:等宽 + 中文兼容(如 JetBrains Mono / Sarasa 更纱黑体)
  "terminal.integrated.fontFamily": "JetBrains Mono, 'Sarasa Mono SC', monospace"
}
```

## 常见问题

**图片粘贴不生效**
VS Code 内置终端的图片支持取决于版本与协议(kitty graphics / iTerm2 内联)。
确认 `terminal.integrated.enableImages` 已开;仍不行时用文本粘贴(`Ctrl+Shift+V`)。

**颜色与外部终端不一致**
TUI 会自动检测终端能力并降级(16 色/ASCII);VS Code 终端通常支持真彩色,无需
处理。若自定义主题与你的 VS Code 主题冲突,用 `/theme` 切换(见[主题](themes.md))。

**退出后终端残留**
`Ctrl+Q` / `/exit` 退出会恢复硬件光标并把 TTY 还给 shell(0.1.2-rc.6 起)。
若异常退出导致终端错乱,在 VS Code 里执行 `reset` 即可。

**快捷键冲突**
VS Code 会拦截部分组合键(如 `Ctrl+W` 关闭终端、`Ctrl+K` 快捷键面板)。
TUI 的键位设计避开了这些(核心键是 Ctrl+N/S/Q/P/F/O/E/T 与 Ctrl+.);
若仍有冲突,可在 VS Code 键位绑定里把对应组合改为 `terminal.sendSequence`
或 `workbench.action.terminal.sendSequence` 转发。
