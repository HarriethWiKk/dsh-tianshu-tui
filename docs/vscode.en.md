# Using dsh-tianshu-tui in VS Code

dsh-tianshu-tui is a terminal application and runs directly in the VS Code integrated terminal. There is currently no official VS Code extension; this page covers recommended terminal settings and common issues.

## Launch

1. Install the plugin (see [Getting started](getting-started.en.md)).
2. Open the VS Code integrated terminal (Terminal → New Terminal) and run:

```sh
npx -y @deepseek-ai/dsh --profile tui
```

## Recommended Terminal Settings

The integrated terminal works out of the box; these `settings.json` tweaks improve the experience:

```jsonc
{
  // Image rendering: with terminal-graphics protocol support, clipboard images render inline
  "terminal.integrated.enableImages": true,
  // Truecolor support is the default in the integrated terminal
  "terminal.integrated.minimumContrastRatio": 1,
  // Wide terminals give the top bar / tool cards more room
  "terminal.integrated.defaultProfile.osx": "zsh",
  // Font: monospace + CJK-friendly (e.g. JetBrains Mono / Sarasa Mono SC)
  "terminal.integrated.fontFamily": "JetBrains Mono, 'Sarasa Mono SC', monospace"
}
```

## Troubleshooting

**Image paste does not work**
Integrated-terminal image support depends on the VS Code version and protocol (kitty graphics / iTerm2 inline images). Make sure `terminal.integrated.enableImages` is on; otherwise fall back to text paste (`Ctrl+Shift+V`).

**Colors differ from an external terminal**
The TUI auto-detects terminal capabilities and degrades (16-color/ASCII); the integrated terminal usually supports truecolor, so nothing to do. If a custom theme clashes with your VS Code theme, switch with `/theme` (see [Themes](themes.en.md)).

**Terminal leftovers after exit**
`Ctrl+Q` / `/exit` restores the hardware cursor and gives the TTY back to the shell (since 0.1.2-rc.6). If an abnormal exit leaves the terminal garbled, run `reset` in VS Code.

**Keybinding conflicts**
VS Code intercepts some combinations (e.g. `Ctrl+W` closes the terminal, `Ctrl+K` is the shortcut panel). The TUI's keymap avoids these (core keys are Ctrl+N/S/Q/P/F/O/E/T and `Ctrl+.`); if you still hit a conflict, rebind the combination to `workbench.action.terminal.sendSequence` in VS Code keybindings.
