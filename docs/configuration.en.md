# Configuration

dsh-tianshu-tui has three configuration layers: **assembly config** (`TuiRunnerConfig`, injected by the host), **environment variables** (process level), and **runtime config** (commands/panels inside the TUI).

## Assembly Config (TuiRunnerConfig)

All fields are optional and injected by whoever assembles the plugin:

| Field | Default | Description |
|---|---|---|
| `stdin` / `stdout` | process streams | Keyboard input stream / render output stream (used for test doubles) |
| `initialSessionId` | new session | Session id to attach to on startup |
| `editorKey` | `ctrl_e` | External-editor trigger key (`ctrl+o` is reserved for reasoning expansion) |
| `vimEnabled` | `false` | Enable Vim keybindings |
| `vision.supportsVision` | auto-refreshed from the llm catalog | Whether the primary model sees images natively (images sent directly) |
| `vision.bridgeEnabled` | auto-detected from the host `visionBridge` service | Whether a separate vision-bridge model is configured |
| `vision.bridgeSource` | — | Bridge source (configured / auto / none) |
| `workflowHistoryLimit` | `50` | Settled-run cache cap for the `/workflow` panel (drop-oldest) |
| `activityBand` | `true` | Unified activity band above the input track; `false` restores per-run spinner rows |
| `activityBandMaxRows` | `5` | Activity-band item-row cap (positive integer; overflow folds to `+N`) |
| `lsp.enabled` | `true` | LSP diagnostics toggle (local language-service bridge) |
| `lsp.timeoutMs` | `2000` | Per-diagnostics-fetch timeout |

## Environment Variables

| Variable | Description |
|---|---|
| `DEEPSEEK_API_KEY` | API key (welcome page / status line check it via credentials layering) |
| `DSH_TUI_SKIP_UPDATE` | `1` skips the startup npm update check |
| `EDITOR` / `VISUAL` | Command for the `Ctrl+E` external editor (`.cmd`/`.bat` supported on Windows) |
| `HTTP_PROXY` / `HTTPS_PROXY` | Network proxy (self-update and other network operations) |

## Runtime Configuration

### `/config` Panel

`/config` opens the settings panel with three sections:

- **settings**: output of the host settings service's `describe`
- **permission**: permission-preset selector (composes `dsh-permission`'s `PermissionSelect`; the section is omitted when the service is missing)
- **credentials**: credential presence (existence only, never plaintext)

### Common Runtime Setting Commands

| Command | Effect |
|---|---|
| `/theme [name] [default]` | Switch theme (Enter/args=this session; S or trailing `default`=startup default) |
| `/density [default]` | Toggle compact rendering (toggle=this session; `/density default`=startup default) |
| `/model [target] [effort] [default]` | View/switch model (Enter/args=this session; S or `default`=startup default) |
| `/effort off\|high\|max\|auto\|default` | Reasoning effort (args=this session; S or `default`=startup default) |
| `/preset [name] [default]` | Switch agent preset (args=this session; trailing `default`=new-session startup default) |
| `/yolo [on\|off]` | Always-approve mode (equivalent to Shift+Tab into always-approve) |
| `Shift+Tab` | Mode cycle: normal → plan → always-approve |

### Persistence

- Model/effort startup defaults persist through `agentDefaultModel.saveSelection` (picker S or trailing `default`); typed switches only hot-apply the current session. always-approve is a session-local state that resets on switch/exit.
- On session restore, input history and the session list come from the host persistence (`sessionPersistence`).
