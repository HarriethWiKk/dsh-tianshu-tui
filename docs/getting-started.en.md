# Getting Started

dsh-tianshu-tui is an interactive terminal UI plugin for the official DeepSeek Harness. This guide takes you from zero to a running TUI. The root README's Install section has the full installation details.

## Prerequisites

- [Node.js](https://nodejs.org/) `^22.19 || >=24`
- [`pnpm`](https://pnpm.io/installation) on your PATH (`dsh plugin` forwards to it)
- An API key to run models: `DEEPSEEK_API_KEY` (or the official CLI's login flow)

> **Do not type bare `dsh`.** If an old `dsh` is already on your PATH (e.g. `~/.local/bin/dsh` whose `dsh --version` is not `0.1.0-rc.6`), it will hit the local staging path and fail with `ERR_FS_EISDIR` / `Path is a directory .../@deepseek-ai/dsh`. Always use the `npx` commands below.

## Install

```sh
# 1. Add the plugin to the tui profile
npx -y @deepseek-ai/dsh plugin --profile tui add @huiliyi37/dsh-tianshu-tui

# 2. Launch
npx -y @deepseek-ai/dsh --profile tui
```

You are up when the welcome page shows the **dsh-tianshu-tui** brand. Exit with `Ctrl+Q` or `/exit`.

- pnpm may warn about missing peers — ignore it: peers are provided by the official `dsh` host.
- If the official CLI is installed globally with the right version, replace `npx -y @deepseek-ai/dsh` with `dsh`.
- Install from Git: `dsh plugin --profile tui add github:huiliyi37/dsh-tianshu-tui`.

## First Run

After launch you will see:

- **Welcome page**: brand header, friendly session short id, and an environment check (API key / git readiness)
- **Top bar**: `📁 cwd · model · (git branch ●uncommitted-count)`
- **Bottom three lines**: input line (rounded frame) → footer (mode badge + shortcut hints) → metrics line (model / cost / context% / tokens / elapsed)

Type a question and press Enter to start. Common operations:

| What you want | How |
|---|---|
| All shortcuts | `Ctrl+.` |
| Switch model | `/model` (pick with ↑↓) or `/model <provider/model>` |
| Switch theme | `/theme` (pick with ↑↓) |
| New session / resume | `Ctrl+N` / `Ctrl+S` |
| Interrupt the current reply | `Ctrl+C` |
| Exit | `Ctrl+Q` |

## Troubleshooting

**`ERR_FS_EISDIR` / `Path is a directory ...`**
A stale install fallback in `~/.dsh/profiles/node_modules` conflicts with the official CLI. Use a clean directory:

```sh
DSH_HOME=/tmp/dsh-tianshu npx -y @deepseek-ai/dsh plugin --profile tui add @huiliyi37/dsh-tianshu-tui
DSH_HOME=/tmp/dsh-tianshu npx -y @deepseek-ai/dsh --profile tui
```

**"插件已更新到 …，请重启 dsh 后生效" (plugin updated, please restart)**
The self-update mechanism bumped the profile's package to the new npm version; restart to apply.

**No network update check**
Set `DSH_TUI_SKIP_UPDATE=1`.

**Images fail to send / the model says it cannot see them**
When the primary model cannot see images, assemble a vision-bridge plugin (`dsh-vision-bridge`, which provides a `visionBridge` service) or inject vision config; with neither, images are not sent and a warning is shown (intentional fails-loud).

**Need a model-facing LSP tool surface**
Assemble the community plugin [`omdsh-dev/dsh-lsp`](https://github.com/omdsh-dev/dsh-lsp); the TUI display bridge consumes its `lsp` service automatically, sharing the same LSP server set with the model tool surface.

**`/preset` says "agent-presets service unavailable"**
Update to a build that assembles the agent plane (`plugin add` of this package pulls the official presets package). The command is `/preset`, not `/presets`. Existing profiles pick up the new dependency on self-update.

## Next Steps

- [Interaction](interaction.en.md): full keymap and command reference
- [Configuration](configuration.en.md): assembly options and environment variables
- [Architecture](architecture.en.md): how the TUI works
