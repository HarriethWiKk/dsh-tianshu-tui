# Contributing

Thank you for considering a contribution to dsh-tianshu-tui! This document is the shared development contract for `@huiliyi37/dsh-tianshu-tui`, applying to everyone working in this repository (humans and coding agents alike).

This repo contains two independent plugins: the root `@huiliyi37/dsh-tianshu-tui` (terminal UI) and `@deepseek-ai/dsh-vision-ask` under `vision-ask/` (vision copilot). This document covers both.

## How to Contribute

- **Report a bug or request a feature**: open an issue with a clear reproduction and your terminal environment.
- **Open a PR**: base against `main`. Keep changes focused — one logical change per PR. Describe motivation, changes, and how you verified.
- **Run the verification matrix below before requesting review** — CI runs exactly these commands.
- New features should come with or extend a focused test (prefer pure-function layers: render/fold logic in `format/`-style modules, where tests are cheapest).

## Verification Matrix

```sh
npm run typecheck   # tsc --noEmit (src + tests) + vision-ask's own tsconfig
npm test            # vitest run (main repo) + vitest run --root vision-ask
```

- The main repo and vision-ask each have their own test suite; run whichever you touch, full suite before committing.
- New `src/` files must add a `SOURCE-MAP.md` entry (a test guard enforces it).
- Changing the README (either language) requires syncing the other side and updating the `README.i18n.yaml` hashes:

```sh
git hash-object README.md README.en.md
```

## Code Conventions

- Types first: `noUncheckedIndexedAccess` is on — guard index access explicitly; `exactOptionalPropertyTypes` is on — use conditional spreads for optional fields, never pass explicit `undefined`.
- Pure-function discipline: render/fold functions touch no I/O and no global time (inject or parameterize).
- Naming and comments follow the existing Chinese-comment style (module-header JSDoc stating responsibility and data source).
- High-risk command discipline and sensitive-file rules: see [AGENTS.md](AGENTS.md) (required reading for agents; applies to humans too).

## Architecture Boundaries (read before changing)

- Pure-presentation contract: register no prompts/tools/context surfaces; never mutate requests; no workflow control. The full boundary and the "deliberately not done" list: [ADAPTER.md](ADAPTER.md).
- Pending interactions go into controllers (question/approval/btw); rendering goes into pure `format/` functions; event folds are pure folds — do not pile state machines into the `ui/app.ts` monolith (~3.6k lines; the C4 split is ongoing).
- Service dependencies: the required inject set is only sessions/agents/agentDefaultModel; new service dependencies must be optional + `reflect.get` + fail loud (missing plugins must not block TUI startup — an existing hard constraint).

## Documentation Conventions

- User-facing docs live in `docs/` (getting-started / architecture / configuration / interaction / themes / plugins / vscode); the README is the feature-table entry point.
- Internal engineering docs (RELEASE/PUBLISH-PLAN/plan records) also live in `docs/`, distinguished by filename and content.
- Keep docs in sync with code: when interaction/config/command behavior changes, update the corresponding doc and the `/help` description.

## Releasing

Releases follow only [docs/RELEASE.md](docs/RELEASE.md): version bump, bundle rebuild + track, README release notes (both languages), test gate, tag, dual-remote push (github + omdsh), npm publish (`--tag latest`), GitHub Release. Hard constraints: never push `origin` (local bundle), never commit tokens, never force-push `main`.

## Community

- Main repo: https://github.com/huiliyi37/dsh-tianshu-tui (Issues / Releases live here)
- Org fork: https://github.com/omdsh-dev/dsh-tianshu-tui (mirrors code and tags)
- Related projects: see the README's friendly-links section
