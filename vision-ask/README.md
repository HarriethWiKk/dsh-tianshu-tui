# @deepseek-ai/dsh-vision-ask

English | [中文](README.zh.md)

**Vision co-pilot plugin**: a session-scoped image registry plus the `ask_image` tool for the dsh harness. When a user attaches images (any entry point — TUI, subagent, tool-injected messages), their durable attachment references are registered under short ids (`img_1`, …); the main model can then re-interrogate any retained image any number of times, from different angles, without the user re-sending it.

## Why a dedicated adapter

The public baseline's `llm-deepseek` wire route is text-only and rejects image blocks explicitly. This plugin registers its own llm provider route (`vision-ask` by default) with an OpenAI-compatible adapter that serializes image blocks — read back from the attachment service — as `image_url` content parts. Description calls therefore ride the standard `ctx.llm.stream` path: retry/error/cancel semantics preserved, and the description text lands in the tool result and the session log (Model-visible ⟺ logged).

## Config

```yaml
- id: vision-ask
  name: '@deepseek-ai/dsh-vision-ask'
  config:
    model: deepseek-vl           # vision model id (required)
    provider: vision-ask         # provider route this plugin registers (default)
    baseUrl: https://api.deepseek.com  # optional; OpenAI-compatible endpoint
    apiKeyEnv: DEEPSEEK_API_KEY   # optional; env var holding the API key
    maxTokens: 1024              # optional; description output cap (default 1024)
    primarySupportsVision: false # optional; force forwarding / describing
    registryMaxImages: 8         # optional; images kept per session
    registryMaxBytes: 25165824   # optional; total byte cap per session (24 MiB)
```

`model` is required (fail loud at mount). `primarySupportsVision` is optional: when omitted, the tool resolves the calling agent's model capability dynamically via `inputModalities`; when set, it overrides the dynamic check (true = always forward the original image to the primary, false = always describe).

## Key properties

- **Session-scoped registry with hard boundaries** — images are keyed by session id; entries hold only durable `ImageAttachmentRef`s (opaque ids; the bytes stay with the attachment service). The registry never enters the session log and never persists; LRU eviction bounds it (8 images / 24 MiB per session by default).
- **Automatic registration, zero TUI changes** — the plugin listens on `session/event` for `user/message` events and registers image blocks as they arrive, covering every image entry point.
- **Two answer paths** — a multimodal primary receives the original image back as an image content block and sees the pixels itself; a text-only primary gets a targeted description from the configured vision model. Repeated same-angle asks hit the per-image description cache (zero extra vision calls; the cache key normalizes the question text).
- **Failures are visible, never fatal** — no retained image, unknown image id, missing vision route, and vision-model failures all surface as structured tool errors with actionable messages; the model sees the reason and can act on it.

## Model Experience

### What the model sees

`ask_image(question, imageId?)` is available in every session that has sent at least one image. A multimodal primary gets `[text hint] + [original image block]`; a text-only primary gets the description text (with a `（缓存）` marker on cache hits). Sessions without images get a structured error telling the model to ask the user for an image first.

### Token effect

Each non-cached ask costs one auxiliary model call (`maxTokens` cap, default 1024); the description text enters the primary context as the tool result. Cache hits cost zero tokens.

### KV Cache effect

The description call is a separate one-shot request (`purpose` unset), independent of the primary session prefix; the tool result appends like any other tool result.

## Verification

```sh
# behavior suite (runs against the workspace monorepo; the plugin's
# attachment imports are type-only, so the suite runs wherever dsh-llm /
# dsh-tools resolve)
vitest run tests/
```

## Known Limitations and Deferred Work

- **No visionAutoBridge** — the baseline's model catalog has no `supportsVision` field, so the vision model must be configured explicitly (`model` + optional `fallback` is a follow-up); automatic selection arrives with a later baseline.
- **Per-image description cache is in-memory only** — descriptions are not persisted across restarts; a resumed session re-describes on the first non-cached ask.
- **The registry is not user-visible in the TUI** — image ids are surfaced through the tool's error messages and answers; a TUI badge listing retained images is follow-up work.
- **The vision adapter speaks a minimal OpenAI-compatible dialect** — text/image inputs, text output, streaming; reasoning streams and tool calls are out of scope for description calls.
