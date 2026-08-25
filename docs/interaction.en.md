# Interaction Manual

All of dsh-tianshu-tui's interactions: shortcuts, commands, input surfaces, and interactive panels.

## Shortcuts

### Sessions & Global

| Key | Action |
|---|---|
| `Ctrl+N` | New session |
| `Ctrl+S` | Resume the most recent session |
| `Ctrl+X` | Session tab bar: switch to the next session (cyclic) |
| `Alt+1`~`Alt+9` | Session tab bar: jump to the Nth session |
| `Ctrl+Q` | Exit (same as `/exit`; when idle, two `Ctrl+C`s on an empty input also exit) |
| `Ctrl+.` | Keymap overlay (always available) |
| `Ctrl+P` | Command palette (fuzzy search + Enter to fill) |
| `Ctrl+F` | History search (`n`/`N` next, `p`/`P` previous) |

When there is more than one session, a **session tab bar** appears above the input rail (short-id list, current session marked ●; narrow widths drop the oldest tabs and fold into `+N`).

### Input

| Key | Action |
|---|---|
| `Ctrl+E` | Open the input line in `$EDITOR` (configurable via `editorKey`) |
| `Ctrl+T` | Steer mid-turn (correct direction without interrupting) |
| `Ctrl+V` | Paste a clipboard image (falls back to clipboard text when none) |
| `Alt+W` | Copy the selection to the system clipboard (OSC52) |
| `Tab` | `@`-path completion; accept the slash-menu selection |
| `↑`/`↓` | Input history (menu selection when the slash menu is open) |
| `PageUp`/`PageDown` | Page through the slash menu |
| `Esc` | Close menus/overlays; cancel a pending question |

### Replies & Tools

| Key | Action |
|---|---|
| `Ctrl+C` | Interrupt the in-flight turn (immediate) |
| `Esc` (in flight) | Interrupt the in-flight turn (Claude Code-style single Esc; lone ESC has an 80ms debounce; overlays/menus still close first when open) |
| `Esc`+`Esc` (idle) | Open the rewind panel (Claude Code's Esc+Esc time travel; 1s double-press window, same as `/rewind`) |
| `Ctrl+O` | Expand/collapse the most recent reasoning block |
| `Enter` (empty input) | Toggle expansion of the last in-flight tool card (shows argument JSON) |
| `Shift+Tab` | Mode cycle: normal → plan → always-approve |

Above the input track, running work folds into one activity band (`◐ N subagents · M workflows` plus one stats line per item, capped by `activityBandMaxRows`). A finished subagent commits `✓ {label} · N tools · X tok · 12s`; a finished workflow commits a one-line summary. Set `activityBand: false` to restore per-run spinner rows.

### Interactive Panels

| Key | Action |
|---|---|
| `y` / `N` / `Ctrl+C` | Approval card: allow / reject / cancel |
| `a` | Approval card: allow for this session (always-approve + settle the current request) |
| `f` → `Enter` | Plan-review feedback mode (Keep planning + custom feedback) |
| Digits | Structured-question panel options |
| In pickers: `↑`/`↓` (j/k) select, `Enter` apply (this session), `S` save default, `Esc`/`q` close | `/model` `/theme` `/effort` pickers (session/`/key` pickers have no S) |
| Session list: prints rows directly (legacy style, no interactive panel) | `/session list` |
| Session picker: `↑`/`↓` scroll through all sessions | No-arg `/session` picker (title + relative-age summary, not paginated) |

## Command Reference (29 commands)

### Sessions

| Command | Effect |
|---|---|
| `/session new\|list\|switch <id>` | Session management (no args opens the session picker) |
| `/fork [directive]` · `/branch` | Fork the current session (history copied to a new child) |
| `/rewind` | Two-stage rollback (session truncation + optional file rewind) |
| `/export [path]` | Export the transcript as Markdown |
| `/clear` | Clear the scrollback view |
| `/compact` | Compact session context (requires the compact service) |

### Models & Modes

| Command | Effect |
|---|---|
| `/model [target] [effort] [default]` | View/switch model (no args opens the picker; Enter=this session, S or trailing `default`=startup default; aliases `spark-flash`/`spark-pro`) |
| `/effort off\|high\|max\|auto\|default` | Set reasoning effort (no args opens the picker; Enter/args=this session, S or `default`=startup default; `auto` follows the model default) |
| `/preset [name] [default]` | View/switch agent preset (args=this session; trailing `default`=new-session startup default; blank sessions only) |
| `/yolo [on\|off]` | Always-approve mode |
| `/density [default]` | Toggle compact tool-card rendering (toggle=this session; `/density default`=startup default) |

### Panels

| Command | Effect |
|---|---|
| `/status` | Status panel (goal/todos/plan projection + session totals) |
| `/config` | Settings panel (settings / permission / credentials) |
| `/skills` | Skill browser panel |
| `/tasks [kill <id>]` | Task panel |
| `/goal` | Goal management (create/pause/resume/complete/block) |
| `/subagents` | Delegation-tree live cards (in-flight body, failed state; optional “⤷ external subagent” section) |
| `/workflow` | Workflow runs panel (roster appends the child-session label / running state when `childId` hits the tree) |
| `/lsp` | LSP diagnostics panel |

### Memory & Diagnostics

| Command | Effect |
|---|---|
| `/remember <text>` | Save a project memory |
| `/memory [delete <id>]` | Memory browser |
| `/btw <question>` | Ask a background agent (without interrupting) |
| `/doctor` | Terminal diagnostics + fix guide |
| `/mcp [tools <name>]` | List MCP servers and their tools |
| `/help [cmd]` | Command help |
| `/cost` | Current-session cumulative usage and cost estimate (per model) |

### Other

| Command | Effect |
|---|---|
| `/theme [name] [default]` | Switch theme (no args opens the picker; Enter/args=this session, S or trailing `default`=startup default) |
| `/steer <text>` | Steer mid-turn |
| `/restart` | Restart the current dsh process (same command re-launched; applies plugin updates) |
| `/exit` | Exit the TUI |

## Input Surfaces

- **Slash menu**: typing `/` opens it; fuzzy prefix matching, MRU ordering, Tab to accept, Enter to submit, argument ghost preview.
- **@ references**: `@` triggers path completion (Tab), expanding to file summaries on submit (@mention), with cwd boundary and truncation fallbacks.
- **Image paste**: `Ctrl+V` or the terminal menu; oversized images are adaptively compressed before sending (1568px long-edge cap, progressive JPEG downscaling).
- **Multiline input & bracketed paste**: pasting multiline/long text lands whole in the input line instead of submitting line by line.
- **Vim keybindings**: optional (`vimEnabled`); `Alt+W`/yank copies the selection via OSC52.

## Interactive Panels

- **Approval card**: pending approvals with inline diff preview (y/N/a/esc); red/green rendering when the tool is diffable, blind-approval hint otherwise; non-current-session requests are delegated to the next listener.
- **Question panel**: digit selection, Esc to cancel, overlap protection; plan-review feedback mode.
- **Pickers (issue #31)**: no-arg `/model` `/theme` `/effort` `/session` open a picker with the current value marked ● and the startup default ★. `/model` `/theme` `/effort`: Enter applies this session only; S applies and writes the startup default. Session and `/key` pickers have no S. **The theme picker previews live**: ↑/↓ switches the theme immediately, Enter settles without writing prefs, S writes the startup default, Esc restores the theme from before opening.
- **Command palette (Ctrl+P)**: fuzzy + subsequence command search, Enter fills `/cmd `.
- **Keymap panel (Ctrl+.)**: the full shortcut list, always one key away.
- **History search (Ctrl+F)**: searches the scrollback message snapshot, `n`/`N` to jump.

## Overlay System

Full-screen overlays (command palette, keymap, history search, rewind, memory browser, picker) share one lifecycle: opening enters the alt screen, Esc/Ctrl+C closes, and deferred scrollback is flushed on close. Streaming output never covers an open overlay.
