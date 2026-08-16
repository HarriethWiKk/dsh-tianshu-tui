# Plugin Ecosystem & Extensions

dsh-tianshu-tui is itself a plugin for the official DeepSeek Harness; on top of it sit **companion plugins** and **extension points**. This repo ships two independent plugins: the root `@huiliyi37/dsh-tianshu-tui` and `@deepseek-ai/dsh-vision-ask` under `vision-ask/`.

## Companion Plugins

| Plugin | Package | Capability | Assembly |
|---|---|---|---|
| Vision copilot | `@deepseek-ai/dsh-vision-ask` (this repo's `vision-ask/`) | Sent images are registered under short ids (`img_1` …); the model can ask repeatedly via `ask_image`; same-image same-angle questions hit a per-image description cache | Separate assembly; details in [vision-ask/README.md](../vision-ask/README.md) |
| LSP model tool surface | `omdsh-dev/dsh-lsp` (community repo) | Model-callable `lsp_goto_definition` / `lsp_find_references` / `lsp_diagnostics`; once assembled, the TUI display bridge consumes its `lsp` service, sharing the same LSP server set with the model tool surface | `dsh plugin --profile tui add github:omdsh-dev/dsh-lsp` |
| Vision bridge | `dsh-vision-bridge` (harness side) | When the primary model cannot see images, an independent vision model describes them before submission | Provides a `visionBridge` service; the TUI auto-detects it |

The TUI display bridge probes LSP diagnostics sources in order: community plugin service (getDiagnostics shape) → official `ctx.lsp` seam → built-in bridge fallback.

## Extension Points

### 1. Slash Command Registry (`tui.commands` service)

The TUI registers its registry as the `tui.commands` service at construction. External plugins can:

```ts
const registry = ctx.tui.commands  // or via ctx.reflect.get('commands')
registry.register({
  name: 'mycmd',
  description: 'My command',
  argsHint: '<arg>',
  run: async ({ text, echo, ctx, sessionId }) => { echo('hello') },
})
```

- Command shape: `name` (lowercase, must not share a prefix with existing commands) / `description` / `argsHint?` / `run`
- Minimal-unique-prefix resolution: ambiguous or unknown names are rejected, never guessed
- `/help` and the command palette pick new commands up automatically (single source of truth)

### 2. Overlay Registration

`OverlayController` exposes a registration surface; external plugins can implement the `render(width, height): string[]` contract to register their own full-screen overlay (alt-screen enter/exit, Esc close, scrollback flush all handled automatically).

### 3. Event Consumption

The session events and workflow/subagent/approval events the TUI subscribes to (see the ADAPTER.md list) can be consumed by external plugins simultaneously — events are broadcast, not exclusive.

### 4. Themes

Built-in palettes live in `src/theme-palettes.ts`; `custom:<name>` supports runtime custom themes. New built-in themes must carry a `description` (single source of truth for the `/theme` picker).

## Service Dependencies (Consumption Side)

The host services the TUI consumes split into required and optional; when an optional service is missing, the related commands and panels fail loud (⚠ warning) — never silent, and never blocking TUI startup. Full list: [ADAPTER.md](../ADAPTER.md).

## Packaging & Releases

- This repo produces two packages: root `@huiliyi37/dsh-tianshu-tui` and `vision-ask/` (own package.json/tsconfig/tests).
- `lsp/` is historical source (migrated to the community repo omdsh-dev/dsh-lsp); no longer shipped with this repo.
- Release flow: [RELEASE.md](RELEASE.md); `lib/index.js` must be tracked.

## Contributing a New Plugin

Want to contribute a new plugin to the ecosystem? First:

1. Check the capability boundary: what the presentation layer can/cannot do is in [ADAPTER.md](../ADAPTER.md) (can: new commands, new overlays, event consumption, themes; cannot: request-body rewriting, workflow control, approval patches).
2. Start with the `tui.commands` registry + the overlay contract; keep pure render logic in `format/`-style modules.
3. New files must add a `SOURCE-MAP.md` entry (CI guard).
