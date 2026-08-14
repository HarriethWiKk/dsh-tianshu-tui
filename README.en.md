# dsh-tianshu-tui — Terminal UI for DeepSeek Harness

[![npm](https://img.shields.io/npm/v/@huiliyi37/dsh-tianshu-tui.svg)](https://www.npmjs.com/package/@huiliyi37/dsh-tianshu-tui)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@huiliyi37/dsh-tianshu-tui.svg)](https://www.npmjs.com/package/@huiliyi37/dsh-tianshu-tui)
[![release](https://img.shields.io/github/v/release/huiliyi37/dsh-tianshu-tui?include_prereleases)](https://github.com/huiliyi37/dsh-tianshu-tui/releases)

[中文](README.md) | English

![dsh-tianshu-tui](docs/tui-screenshot.jpg)

**dsh-tianshu-tui** (`@huiliyi37/dsh-tianshu-tui`) is the interactive terminal UI plugin for the official [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). The render core evolved from [Tianshu-Tui](https://github.com/huiliyi37/Tianshu-Tui) (Apache-2.0; file-by-file provenance in [SOURCE-MAP.md](SOURCE-MAP.md)). The UI is a pure presentation layer: every piece of agent state arrives through the session event stream.

## Install

This package is not a standalone app. You need the official CLI [`@deepseek-ai/dsh`](https://www.npmjs.com/package/@deepseek-ai/dsh) (`0.1.0-rc.6`). `npm i` of this package alone will not run.

### 1. Prerequisites

- [Node.js](https://nodejs.org/) `^22.19 || >=24`
- [`pnpm`](https://pnpm.io/installation) on PATH (`dsh plugin` forwards to it)

**Do not type `dsh` by itself.** An older `dsh` on PATH (for example `~/.local/bin/dsh`, where `dsh --version` is not `0.1.0-rc.6`) will hit a local staging tree and fail with `ERR_FS_EISDIR` / `Path is a directory .../@deepseek-ai/dsh`. Always use the `npx` commands below.

### 2. Add this plugin to the tui profile

```sh
npx -y @deepseek-ai/dsh plugin --profile tui add @huiliyi37/dsh-tianshu-tui
```

pnpm may warn about missing peers; ignore that. Peers come from the official `dsh` host.

After an npm install, each launch checks npm `latest` and writes a newer version into the profile, then asks you to restart. Set `DSH_TUI_SKIP_UPDATE=1` to skip the check. `github:` / `link:` installs are left alone.

You can also install from Git: `npx -y @deepseek-ai/dsh plugin --profile tui add github:huiliyi37/dsh-tianshu-tui` (the repository ships `lib/index.js`; no rebuild).

### 3. Start

```sh
npx -y @deepseek-ai/dsh --profile tui
```

Success looks like a welcome screen branded **dsh-tianshu-tui**. Quit with `Ctrl+Q`.

If the official CLI is installed globally and `dsh --version` is `0.1.0-rc.6`, you can use `dsh` in place of `npx -y @deepseek-ai/dsh`.

If `npx` still raises `ERR_FS_EISDIR`, stale install fallbacks under `~/.dsh/profiles/node_modules` are colliding with the official CLI. Use a clean home:

```sh
DSH_HOME=/tmp/dsh-tianshu npx -y @deepseek-ai/dsh plugin --profile tui add @huiliyi37/dsh-tianshu-tui
DSH_HOME=/tmp/dsh-tianshu npx -y @deepseek-ai/dsh --profile tui
```

Do not run tsdown for this package from the DeepSeek Harness workspace root: it rewrites imports to unpublished `@deepseek-ai/dsh-root`, and loading fails.

The companion vision plugin lives in `vision-ask/` if you need image re-interrogation.

## Release notes

Current npm `latest`: [`@huiliyi37/dsh-tianshu-tui@0.1.1-rc.6`](https://www.npmjs.com/package/@huiliyi37/dsh-tianshu-tui) ([GitHub Release](https://github.com/huiliyi37/dsh-tianshu-tui/releases/tag/v0.1.1-rc.6)).

### 0.1.1-rc.6 (2026-08-14)

On launch the plugin checks npm `latest`, writes a newer version into the profile, and asks you to restart.

**Upgrading from `0.1.0-rc.6`:** that build has no self-update. Add the plugin once more to pick up the new logic:

```sh
npx -y @deepseek-ai/dsh plugin --profile tui add @huiliyi37/dsh-tianshu-tui
npx -y @deepseek-ai/dsh --profile tui
```

Later releases write themselves into the profile on launch. Restart after you see `插件已更新到 …，请重启 dsh 后生效`. Set `DSH_TUI_SKIP_UPDATE=1` to skip the check. `github:` / `link:` installs are left alone.

This release also includes display-layer fixes already on `main`:

- New sessions write `meta.cwd`, so the Web UI can list TUI sessions
- Welcome / status line judge the API key via credentials
- After `/model`, the footer glance and vision capability follow the real model
- `Ctrl+S` can restore a session from disk

The first public baseline is recorded in [docs/BASELINE-v0.1.0-rc.6.md](docs/BASELINE-v0.1.0-rc.6.md).

## Highlights

- **Full session workspace in a terminal** — live rendering, append-only scrollback, session restore on startup, `/fork` exploration branches, `/rewind` rollback (session truncation + optional file rollback), `/export` to Markdown transcripts, and mid-turn steering (`/steer` / `Ctrl+T`).
- **End-to-end images** — paste from clipboard (`Ctrl+V` / terminal-menu paste), render as inline terminal graphics (kitty / iTerm2), deliver through the harness attachment service, and let a vision-capable model actually see them — with an automatic vision bridge that describes the image through a separate vision model when the main model cannot see.
- **A complete input surface** — grok-style slash dropdown menu (fuzzy prefix matching, MRU ordering, ghost previews), `@`-path Tab completion and `@mention` expansion, bracketed paste, optional vim keybindings, external editor (`Ctrl+E`), history search (`Ctrl+F`) — and a full keymap overlay behind `Ctrl+.`.
- **In-terminal interaction surfaces** — structured question panels (numeric selection, plan-review feedback mode), pending approval cards with inline `diff` previews, mode cycle (`Shift+Tab`: normal → plan → always-approve), command palette, and live panels for status / config / skills / tasks / delegation / workflow.
- **Reasoning made visible** — the think channel streams as a live header, folds into a compact scrollback line (`✻ 思考 (3.2s) · 12 行`), and expands in place with `Ctrl+O` (competitor-aligned: collapsed by default).
- **Personalized harness integrations** — `/doctor` terminal diagnostics, `/memory` project-memory browser, `/btw` side questions to a background agent, `/model` + `/effort` hot-switching that takes effect on the current session immediately.
- **Auditable by construction** — the TUI registers no prompt, tool, or context surface of its own; user input becomes ordinary logged messages, and every rendered state derives from session events.
- **Co-evolved with the harness** — built in lockstep with harness-side capabilities on the 2026-08-09 baseline snapshot (250+ commits): the image/vision pipeline, DeepSeek Spark model engineering, session persistence and file snapshots, memory, the validation gate and failure routing, code intelligence, and the git tool. See the next section.

## Co-evolved harness capabilities (since the 2026-08-09 baseline)

The terminal UI evolved from [Tianshu-Tui](https://github.com/huiliyi37/Tianshu-Tui) (Apache-2.0; per-file provenance in [SOURCE-MAP.md](SOURCE-MAP.md)). This bundle then developed in lockstep with harness-side work on the DeepSeek Harness baseline snapshot `snapshots/20260809T140917Z` — 250+ commits between 2026-08-10 and 2026-08-13. The capabilities below live in the host harness (separate packages, not shipped in this bundle); the TUI is their primary interactive surface:

- **Image pipeline & vision bridge** — the `image` ContentBlock joins the merge-extensible content vocabulary and `dsh-llm-deepseek` serializes user image blocks as OpenAI-style `image_url` content parts, so user images reach the wire end-to-end (clipboard → input line → session → model request). Models declare `supportsVision` (`LlmModelInfo` + llm-deepseek catalog). `dsh-vision-bridge` covers text-only main models: at `agent/pre-step` it describes image attachments through a separate vision model (`visionAutoBridge` auto-selects the first vision-capable model when provider/model are omitted; fallback model + data URL validation; the prompt auto-selects between general structure and OCR-level transcription based on UI/error keywords), injecting the description as a plugin-source user message — Model-visible ⟺ logged; bridge failure degrades to a visible hint, never a failed turn.
- **DeepSeek Spark aliases** — the official API has no `spark` model and this host does not register a `deepseek-spark` provider. `/model spark-flash` / `spark-pro` map onto the registered `deepseek-official` route with wire ids `deepseek-v4-flash` / `deepseek-v4-pro`.
- **Session persistence & file snapshots** — `Session.truncate` rewinds the event log and resets derived state; persistence backends gained `deleteFrom` plus a truncate coordinator, so rollback survives reload; `dsh-fs-snapshot` ports FileHistory (trackEdit / rewindToBoundary) and snapshots before write-tool execution. TUI surface: `/rewind` (conversation truncation + optional file rollback).
- **Memory** — `dsh-memory` (MemoryService + Markdown file backend, non-git fallback) and `tool-memory` (`memory_save` / `memory_search` + memory-digest injection) provide cross-session recall. TUI surface: `/memory`, `/remember`.
- **Validation gate & failure routing** — `dsh-evidence-gate` enforces RED-first verification: obligation state machine, edit/verify counters, TDD gate (`enforce` mode), probe suggestions with cooldown, and an L2 final-review gate, natively wired into `str_replace_editor` and the headless-agent assembly. `dsh-agent-router` predicts step failure from turn history and routes work — verification-subagent dispatch and per-profile tool restriction — with real-turn e2e coverage.
- **Code intelligence & retrieval** — `dsh-semantic-index` (BM25 + salience/RRF/vector fusion, incremental updates) exposed as the `semantic_search` tool; `dsh-meridian` code index (node:sqlite schema, tree-sitter parsers for TypeScript/Python/Go, graph/impact/flow queries, behavioral signals, background backfill) exposed as `repo_graph` and the `<codebase-index>` digest; `dsh-pheromone` file-level pheromones with atomic JSON persistence, surfaced through `file_info` and the read tool's `focus` semantics.
- **Git service & tool** — `dsh-git` service seam (GitLocal CLI provider, service-class-as-plugin) plus `dsh-tool-git`, a single model-facing git tool with an operation discriminator (status / diff / log / commit), assembled in the base bundle.

## Features

### Session management

| Capability | Description |
|---|---|
| `/session new\|list\|switch` | Create, list, and switch sessions; resume replays the full transcript through the same render bridge |
| Restore panel | Recoverable sessions are listed in scrollback at startup |
| `/fork [directive]` · `/branch` | Fork the current session (history copied to a new child session) and optionally start it with a directive |
| `/rewind` | Roll back to a chosen message — conversation truncation and/or file rollback to the pre-boundary snapshot |
| `/export` | Export the current session transcript to a Markdown file |
| `/clear` | Clear the scrollback view of the current session |

### Input surface

- **Slash command menu** — typing `/` opens a dropdown with fuzzy prefix matching, `↑↓` / `PageUp` / `PageDown` selection, `Tab` accept, `Enter` submit, MRU ordering, argument-placeholder ghosts, and an input-line ghost preview.
- **Clipboard & image paste** — `Ctrl+V` reads a clipboard image (falling back to text); terminal-menu paste detects images; pasted paths that look like images are loaded as attachments; `Alt+W` / vim yank copies selection to the system clipboard via OSC52.
- **Image submission** — attached images show a `📎 N images` marker, render inline under the user bubble on submit, and reach the model through the attachment service; the bubble carries a vision hint (forwarded / bridged via a vision model / not sent). Oversized pastes are adaptively compressed before send: 1568px long-edge clamp (PNG keeps transparency), degrading JPEG 0.82 → 0.55 → 1024px + 0.55 until under the provider cap, never upscaling.
- **Editing** — vim keybindings (optional), external editor (`Ctrl+E`), Tab file completion, `@mention` expansion, input history, multi-line input, and bracketed paste (multi-line / long pastes land in the input line as one block instead of submitting line by line); the input line is drawn as a full rounded frame.
- **Image re-interrogation** — the companion `@deepseek-ai/dsh-vision-ask` plugin registers sent images and answers targeted model questions via `ask_image` (see [vision-ask](vision-ask/README.md)).

### Rendering & projection

- **Conversation stream** — markdown rendering, tool-family coloring with per-tool timing, and parallel tool calls folded into groups.
- **Tool cards commit in real time** — settled tool results render as scrollback cards consuming the harness presenter intent: `diff` results as structured red/green file diffs (shared with the approval preview), `terminal` results with command title + cwd + exit/signal badge, everything else as folding cards.
- **Reasoning channel** — shimmer live header while thinking, folded scrollback line at segment end, `Ctrl+O` expands the full text in the live area.
- **Fluency folding** — repetitive routine tool traffic collapses under a quiet strategy; compact mode (`/density`) keeps header-only lines.
- **Turn status** — braille spinner + phase text status line, workflow-run summaries, delegation tree, task pane, config/skills panels as live-region panels.
- **Subagent runs** — a live spinner line per run; terminal states commit to scrollback as `✓`/`✗`/`◌` entries.
- **Window chrome** — welcome page (brand header, friendly short session ids, environment check line), top bar (cwd + git branch + model), and a three-line bottom area: input line (mode-colored bottom edge) → footer (mode badge + key hints) → metrics line (model / token usage / cache hit rate).
- **Themes** — built-in palettes plus `custom:<name>`; auto terminal detection and 16-color fallbacks.

### Interaction panels

- **Structured questions** — numeric selection, `Esc` cancels, overlap protection; plan-review feedback mode (`f` to enter, `Enter` submits Keep-planning + custom feedback).
- **Approval cards** — `y`/`N`/`Ctrl+C` settle pending approvals; inline diff previews when the tool is diffable; blind-approval hint when the diff is invisible; non-current-session requests delegate to the next listener.
- **Mode cycle** — `Shift+Tab` cycles normal → plan → always-approve; the plan state drives the footer badge, and always-approve is session-local (resets on switch/exit).
- **Live panels** — `/status` (5-domain projection snapshot), `/config` (settings / permission / credentials), `/skills` browser, `/tasks` pane, `/subagents` delegation tree, `/workflow` runs.
- **Command palette (`Ctrl+P`) / keymap (`Ctrl+.`) / history search (`Ctrl+F`) overlays**.

### Models & vision

- `/model` — view and switch the model (default + hot-switch for the current session); `spark-flash` / `spark-pro` aliases map to `deepseek-official` + the official wire ids `deepseek-v4-flash` / `deepseek-v4-pro`. `/model <provider/model|alias> [off|high|max]` sets the reasoning effort in the same command.
- `/effort` — set the reasoning effort (`off` / `high` / `max`; `auto` returns to the model default), hot-switched for the current session.
- **Vision bridge** — vision capability is declared per model (`supportsVision`) and drives the bubble hint; when the main model cannot see images, an automatically selected vision model describes them before submission (one-shot path; see Known Limitations).
- **Vision co-pilot** — with the companion `@deepseek-ai/dsh-vision-ask` plugin (same repository), every sent image is registered under a short id (`img_1`, …) and the model can re-interrogate it with `ask_image` — targeted questions, different angles, any number of times; repeated same-angle asks hit the per-image description cache. Details and config in the [vision-ask README](vision-ask/README.md).
- `/mcp` — list connected MCP servers and tool counts; `tools <name>` inspects a server's tool list.

### Commands

| Command | What it does |
|---|---|
| `/session new\|list\|switch` | Session management |
| `/fork [directive]` · `/branch` | Fork the current session, optionally with a starting directive |
| `/rewind` | Two-phase rollback (message list → granularity) |
| `/export [path]` | Export the transcript to Markdown |
| `/clear` | Clear the scrollback view |
| `/compact` | Compact the session context |
| `/steer <text>` | Mid-turn steering (correct course without interrupting) |
| `/model [target] [effort]` | View/switch model (aliases: `spark-flash`, `spark-pro`) |
| `/effort off\|high\|max\|auto` | Set reasoning effort (hot-switched) |
| `/theme [name]` | Switch theme |
| `/density` | Toggle compact tool-card rendering |
| `/status` | Toggle the status panel (5-domain projection snapshot) |
| `/config` | Toggle the settings panel (settings / permission / credentials) |
| `/skills` | Toggle the skills browser |
| `/tasks` | Task pane (background tasks) |
| `/goal` | Goal management (create / pause / resume / complete / block) |
| `/subagents` | Delegation tree panel |
| `/workflow` | Workflow runs panel |
| `/btw <question>` | Side question to a background agent |
| `/remember <text>` | Save a memory |
| `/memory` | Memory browser (list / filter / delete / preview) |
| `/doctor` | Terminal diagnostics + fix guidance |
| `/mcp [tools <name>]` | List MCP servers; inspect a server's tools |

### Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl+N` | New session |
| `Ctrl+S` | Restore the most recent session |
| `Ctrl+Q` | Quit |
| `Ctrl+P` | Command palette |
| `Ctrl+.` | Keymap overlay |
| `Ctrl+F` | History search (`n`/`N` to jump) |
| `Ctrl+O` | Expand/collapse the latest reasoning block |
| `Ctrl+E` | Open the input line in `$EDITOR` (configurable via `editorKey`) |
| `Ctrl+T` | Mid-turn steering |
| `Ctrl+V` | Paste clipboard image (falls back to clipboard text) |
| `Alt+W` | Copy selection to the system clipboard (OSC52) |
| `Shift+Tab` | Mode cycle: normal → plan → always-approve |
| `Tab` | `@`-path completion; accept the slash-menu selection |
| `↑`/`↓` | Input history (selection while the slash menu is open) |
| `PageUp`/`PageDown` | Slash menu paging |
| `Esc` | Close menu/overlay; cancel a pending question |

## Assembly

The bundle patch inserts the `tui-runner` plugin over `dsh-base`:

```yaml
- id: tui-runner
  name: '@huiliyi37/dsh-tianshu-tui'
```

`TuiRunnerConfig` (all optional): `stdin`/`stdout` (stream injection, defaults to process streams), `initialSessionId`, `editorKey` (default `ctrl_e`; `ctrl+o` is reserved for reasoning expansion), `vimEnabled` (default `false`), `vision` (supportsVision / bridgeEnabled / bridgeSource, derived from the vision-bridge plugin), `workflowHistoryLimit` (default `50`).

Service dependencies: `sessions`/`agents`/`agentDefaultModel` required; `goals`/`subagents`/`memory`/`compact` optional — unassembled services degrade fails-loud with an availability message, never silently.

## Verification

```sh
NO_COLOR=1 pnpm vitest run packages/tui/tui/tests/
```

## Model Experience

None, as the TUI renders logged session events and forwards ordinary user input; it registers no prompt, tool, or context surface.

#### KV Cache effect

None directly; user input submitted through the TUI becomes ordinary logged messages whose request effects belong to the session and loop packages.

## Known Limitations and Deferred Work

- **Image re-interrogation requires the companion plugin** — the `ask_image` tool and the session image registry live in `@deepseek-ai/dsh-vision-ask` (same repository, separate package); the TUI bundle itself does not ship them. Without the plugin, an already-sent image cannot be re-queried and repeated same-angle descriptions re-call the vision model; the vision bridge still covers the one-shot submit-time description path.
- **app.ts monolith (~2.2k lines)** — the pending-state state machines are controller-ized (question/approval), while render composition and key arbitration remain in app.ts; the C4 split plan (pure-function panel segments) keeps advancing.
- **Engine I/O file coverage exemptions** — terminal-boundary files such as input-line/live-engine sit on the coverage exemption list in vitest.config.ts (`TODO(tui)` comments), to be digested gradually as the real composition-test line matures.
- **Projection models not yet wired** — the four pure fold models activity-status/activity-store/turn-summary/summary-state landed with specs, but the App body does not drive them yet. Current state is recorded in [docs/projection-layer.md](docs/projection-layer.md).

## License & Provenance

Apache-2.0. The terminal render engine evolved from [Tianshu-Tui](https://github.com/huiliyi37/Tianshu-Tui) (Apache-2.0); per-file provenance and modification statements live in [SOURCE-MAP.md](SOURCE-MAP.md) and [NOTICE](NOTICE).

## Friends

- [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) — Plugin and skin collection for DSH Web UI
- [dshfind](https://dshfind.com/zh) — Chinese learning and sharing community for DeepSeek Harness
- [deepseek-harness-ux](https://github.com/ayuanwong/deepseek-harness-ux) — Long agent tasks without transcript clutter: focused progress, auto-folded history
