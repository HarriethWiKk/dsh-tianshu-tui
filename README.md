# dsh-tui — Terminal UI for DeepSeek Harness

English | [中文](README.zh.md)

`@deepseek-ai/dsh-tui` is the interactive terminal UI layer for the official DeepSeek Harness (`dsh`), mounted as a pluggable profile bundle — the official codebase stays untouched (`dsh plugin --profile tui add @deepseek-ai/dsh-tui`, then `dsh --profile tui`). The render core is ported from the Tianshu terminal engine (Apache-2.0; file-by-file provenance in [SOURCE-MAP.md](SOURCE-MAP.md)). The UI is a pure presentation layer: every piece of agent state arrives through the session event stream, so live and restored transcripts render identically and nothing reaches a model request that is not already logged.

## Highlights

- **Full session workspace in a terminal** — live rendering, append-only scrollback, session restore on startup, `/fork` exploration branches, `/rewind` rollback (session truncation + optional file rollback), and `/export` to Markdown transcripts.
- **End-to-end images** — paste from clipboard (`Ctrl+V` / terminal-menu paste), render as inline terminal graphics (kitty / iTerm2), deliver through the harness attachment service, and let a vision-capable model actually see them — with an automatic vision bridge that describes the image through a separate vision model when the main model cannot see.
- **In-terminal interaction surfaces** — structured question panels (numeric selection, plan-review feedback mode), pending approval cards with inline `diff` previews, command palette, and keymap overlay.
- **Reasoning made visible** — the think channel streams as a live header, folds into a compact scrollback line (`✻ 思考 (3.2s) · 12 行`), and expands in place with `Ctrl+O` (competitor-aligned: collapsed by default).
- **Personalized harness integrations** — `/doctor` terminal diagnostics, `/memory` project-memory browser, `/btw` side questions to a background agent, `/model` + `/effort` hot-switching that takes effect on the current session immediately.
- **Auditable by construction** — the TUI registers no prompt, tool, or context surface of its own; user input becomes ordinary logged messages, and every rendered state derives from session events.

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

- **Clipboard & image paste** — `Ctrl+V` reads a clipboard image (falling back to text); terminal-menu paste detects images; pasted paths that look like images are loaded as attachments; `Alt+W` / vim yank copies selection to the system clipboard via OSC52.
- **Image submission** — attached images show a `📎 N images` marker, render inline under the user bubble on submit, and reach the model through the attachment service; the bubble carries a vision hint (forwarded / bridged via a vision model / not sent).
- **Editing** — vim keybindings (optional), external editor (`Ctrl+E`), Tab file completion, `@mention` expansion, input history, multi-line input.
- **Image re-interrogation is deferred** (see Known Limitations).

### Rendering & projection

- **Tool cards commit in real time** — settled tool results render as scrollback cards consuming the harness presenter intent: `diff` results as structured red/green file diffs (shared with the approval preview), `terminal` results with command title + cwd + exit/signal badge, everything else as folding cards.
- **Reasoning channel** — shimmer live header while thinking, folded scrollback line at segment end, `Ctrl+O` expands the full text in the live area.
- **Fluency folding** — repetitive routine tool traffic collapses under a quiet strategy; compact mode keeps header-only lines.
- **Turn status** — braille spinner + phase text status line, workflow-run summaries, delegation tree, task pane, config/skills panels as live-region panels.
- **Themes** — built-in palettes plus `custom:<name>`; auto terminal detection and 16-color fallbacks.

### Interaction panels

- **Structured questions** — numeric selection, `Esc` cancels, overlap protection; plan-review feedback mode (`f` to enter, `Enter` submits Keep-planning + custom feedback).
- **Approval cards** — `y`/`N`/`Ctrl+C` settle pending approvals; inline diff previews when the tool is diffable; blind-approval hint when the diff is invisible; non-current-session requests delegate to the next listener.
- **Command palette / keymap / history search overlays**.

### Models & vision

- `/model` — view and switch the model (default + hot-switch for the current session; `spark-flash` / `spark-pro` aliases switch in one keystroke).
- `/effort` — set the reasoning effort (`off` / `high` / `max`; `auto` returns to the model default), hot-switched for the current session.
- **Vision bridge** — when the main model cannot see images, an automatically selected vision model describes them before submission (one-shot path; see Known Limitations).
- `/mcp` — list connected MCP servers and tool counts; `tools <name>` inspects a server's tool list.

### Additional commands

`/theme` · `/config` · `/skills` · `/goal` · `/tasks` · `/subagents` · `/workflow` · `/btw` · `/remember` · `/memory` · `/doctor` · `/compact` · `/clear`

## Install

```sh
dsh plugin --profile tui add @deepseek-ai/dsh-tui
dsh --profile tui
```

Requires the official `@deepseek-ai/*` packages (the `^0.0.1-rc.2` line) and `@deepseek-ai/cordis` (`^4.0.1-rc.1`) on the host.

## Assembly

The bundle patch inserts the `tui-runner` plugin over `dsh-base`:

```yaml
- id: tui-runner
  name: '@deepseek-ai/dsh-tui'
```

`TuiRunnerConfig` (all optional): `stdin`/`stdout` (stream injection, defaults to process streams), `initialSessionId`, `editorKey` (default `ctrl_o`), `vimEnabled` (default `false`), `vision` (supportsVision / bridgeEnabled / bridgeSource, derived from the vision-bridge plugin), `workflowHistoryLimit` (default `50`).

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

- **Image re-interrogation deferred** — the opencode-tui ask_image tool, image registry, and vision description cache are not ported: an already-sent image cannot be re-queried, and repeated same-angle descriptions re-call the vision model. The vision bridge covers the one-shot submit-time description path.
- **app.ts monolith (~2.2k lines)** — the pending-state state machines are controller-ized (question/approval), while render composition and key arbitration remain in app.ts; the C4 split plan (pure-function panel segments) keeps advancing.
- **Engine I/O file coverage exemptions** — terminal-boundary files such as input-line/live-engine sit on the coverage exemption list in vitest.config.ts (`TODO(tui)` comments), to be digested gradually as the real composition-test line matures.
- **Projection models not yet wired** — the four pure fold models activity-status/activity-store/turn-summary/summary-state landed with specs, but the App body does not drive them yet. Current state is recorded in [docs/projection-layer.md](docs/projection-layer.md).

## License & Provenance

Apache-2.0. The terminal render engine is ported from the Tianshu terminal UI engine (Apache-2.0); per-file provenance and modification statements live in [SOURCE-MAP.md](SOURCE-MAP.md) and [NOTICE](NOTICE).
