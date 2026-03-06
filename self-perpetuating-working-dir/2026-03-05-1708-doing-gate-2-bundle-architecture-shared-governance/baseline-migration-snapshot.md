# Gate 2 Baseline Migration Snapshot

## Current State Summary

| Path | Current state | Target state for Gate 2 | Required action |
| --- | --- | --- | --- |
| `ouroboros/` | Active runtime content (`agent.json`, `manifest/`, `psyche/`, `skills/`, `tasks/`) | Folded into `ouroboros.ouro/` | Migrate content and retire root runtime dependency |
| `ouroboros.ouro/` | Gate 1 skeleton only | Active bundle root for Ouroboros | Merge in active content from `ouroboros/` and enforce spec naming |
| `slugger/` | Mostly `tasks/` only | No active runtime content expected in Gate 2 | Keep historical tasks, avoid Gate 7 psyche migration scope |
| `slugger.ouro/` | Gate 1 skeleton (includes psyche stubs) | Recognizable bundle root with stub identity | Keep scope-limited scaffold; ensure harness recognizes agent |
| Root governance docs | Missing (`ARCHITECTURE.md`, `CONSTITUTION.md` absent) | Present at repo root | Restore/relocate canonical governance docs to root |
| `src/identity.ts#getAgentRoot()` | Resolves `<repo>/<agent>` | Must resolve `<repo>/<agent>.ouro` | Update implementation + tests/fixtures |
| `.gitignore` | Does not include `*.ouro/` | Must ignore full `*.ouro/` directories | Add ignore rule before nested git init |
| Nested git inside bundles | Not initialized | Initialized and backed up to private repos | `git init` per bundle + remote push |

## Immediate Gate 2 Work Plan

1. Add red tests for `.ouro` root resolution and governance preflight.
2. Update runtime path resolution to `.ouro` and fix dependent tests/fixtures.
3. Restore root governance docs and enforce preflight governance load behavior.
4. Migrate active Ouroboros bundle content from `ouroboros/` into `ouroboros.ouro/` with required renames.
5. Keep Slugger bundle scope-limited (stub identity + scaffold only).
6. Add `*.ouro/` to `.gitignore` before nested git initialization.
7. Initialize nested git repos and push to private GitHub remotes with idempotent handling.
8. Run full verification (`npm test`, `npm run test:coverage:vitest`, `npx tsc`).
