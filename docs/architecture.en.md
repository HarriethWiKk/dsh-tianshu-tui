# Architecture

dsh-tianshu-tui is a Cordis plugin (`tui-runner`) mounted on the official DeepSeek Harness. Core principle: **pure presentation** — it registers no prompts, tools, or context surfaces, and every piece of rendered state derives from the session event stream. The full boundary contract lives in [ADAPTER.md](../ADAPTER.md).

## Layer Overview

```
src/
├── index.ts                Plugin entry: declares dependencies, wires TuiRunnerConfig, mounts TuiApp
├── ui/app.ts               Core monolith (~3.6k lines): assembly, event subscriptions, key arbitration, render composition
├── ui/render.ts            Transcript rendering: messages → scrollback rows (markdown/thinking blocks/tool cards)
├── adapter/                Session-event-stream adapters (fold into display views)
│   ├── transcript.ts       Message/tool/reasoning folding (TextBlock → render rows)
│   ├── sessions.ts         Session list/restore (incl. title fold)
│   ├── send.ts / tool-view.ts / live.ts / session-title.ts
├── engine/                 Terminal rendering engine and input
│   ├── live-engine.ts      Live-region incremental redraw (ticker-driven, CPR self-heal)
│   ├── commit-engine.ts    Scrollback commits
│   ├── input-handler.ts / input-controller.ts / input-line.ts   Keyboard and input line
│   ├── stream-renderer.ts  Streaming text block writing
│   ├── overlay-engine.ts / overlay-controller.ts  Overlay lifecycle
│   ├── clipboard-image.ts / image-attach.ts / image-tool.ts / term-image.ts   Image pipeline
│   └── resize-handler.ts / write-batcher.ts / perf-monitor.ts
├── controllers/            Pending-interaction state machines
│   ├── question-controller.ts  Structured questions
│   ├── approval-controller.ts  Approvals (always-approve local state)
│   ├── btw-controller.ts       Background ask
│   └── session-manager.ts      Session management
├── format/                 Pure render functions (no I/O, all unit-testable)
│   ├── markdown.ts / diff.ts / tool-card.ts / tool-group.ts / tool-family.ts
│   ├── glance-bar.ts / top-bar.ts / prompt-footer.ts / welcome.ts
│   ├── reasoning.ts / turn-summary.ts / spinner-status.ts
│   ├── approval-card.ts / permission-diff.ts / question-related
│   ├── workflow-panel.ts / delegation-panel.ts / status-panel.ts / config-panel.ts
│   ├── pricing.ts / history-search-overlay.ts / keymap-panel.ts ...
├── render/                 Live snapshot and panel projection (live-panels / live-snapshot)
├── lsp/                    LSP diagnostics bridge (lazy server spawn; display-local cache only)
├── picker.ts               Interactive picker (issue #31)
├── command-palette.ts      Command palette
├── theme.ts / theme-palettes.ts / theme-detect.ts / theme-custom.ts   Themes
├── statusline.ts / restore-session.ts / self-update.ts / external-editor.ts
└── completion/             @ path completion
```

## Data Flow

```
Session events (session/event)                    workflow/* / subagent/* / approval/request
      │                                                      │
      ▼                                                      ▼
adapter/transcript.ts (fold)                    app.ts subscription caches (workflowRuns / delegation tree / approvals)
      │
      ▼
Transcript view (messages / tools / reasoning / usage folds)
      │
      ├── settled content → commit-engine → scrollback (main screen)
      └── in-flight content → renderLive → live region (bottom dynamic area, 120ms ticker redraw)
```

- **Scrollback**: settled, stable content, written incrementally to the main screen.
- **Live region**: in-flight tool cards, reasoning header lines, subagent run lines, question/approval cards, input rail, footer, metrics line. Row tracking is wrapping-aware; the cursor resides at the region's last line; a CPR probe self-heals foreign writes.
- **Event folds are pure functions**: transcript/turn-summary/summary-state folds only read events and never write state back (testable, replayable).

## Projection Layer

Some panel data arrives through the host `sessionProjections` bus (goal/todos/plan). When the bus is missing, local folds back it up (turn summaries, session-totals section). Wiring status: `docs/projection-layer.md`.

## Controllers

Pending interactions are explicit **state machines** (not scattered across render callbacks):

- **QuestionController**: question → options → settlement; overlap protection; plan-review feedback mode.
- **ApprovalController**: approval card y/N/a; always-approve local short-circuit; non-current-session delegation.
- **BtwController**: background-ask lifecycle (Esc folds the answer into the scrollback).
- **SessionManager**: create/fork/switch/resume.

## Overlay System

Full-screen overlays (command palette, keymap, history search, rewind, memory browser, picker) are managed by `OverlayController`: open enters the alt screen, activate a renderer, Esc/Ctrl+C closes, deferred scrollback is flushed on close, and the live region is redrawn in sync.

## Themes & Terminal Adaptation

Two-stage: palette definitions (`theme-palettes.ts`, semantic tokens → color values + background + description) → semantic resolution (`theme.ts`). Auto terminal detection + 16-color degradation + ASCII degradation.

## Key Design Decisions

- **Single-logical-line contract**: every live-region line is one logical line; embedded newlines are normalized (stable display-width math).
- **Bounded caches**: settled workflow runs capped at `workflowHistoryLimit` (default 50); at most 3 in-flight tool cards (`LIVE_TOOL_CARD_MAX`), overflow collapses.
- **Honest degradation**: missing data → segment omitted (no fake 0% cache rate, no price guessing for unknown models); missing services → ⚠ warning, fails loud, never silent.
- **app.ts monolith** (~3.6k lines): pending state machines are controller-based; render composition and key arbitration remain in app.ts. The C4 split (pure-function panel sections) is ongoing — most panel sections already live in `format/`.
