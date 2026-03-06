# Doing: Gate 2 Bundle Architecture + Shared Governance

**Status**: COMPLETED
**Execution Mode**: direct
**Created**: 2026-03-05 17:08
**Planning**: ./self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md
**Artifacts**: ./self-perpetuating-working-dir/2026-03-05-1708-doing-gate-2-bundle-architecture-shared-governance/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Implement Gate 2 bundle architecture and governance relocation: migrate active agent roots onto `.ouro`, update path resolution/runtime references, initialize bundle self-backup repos, and enforce governance preflight.

## Completion Criteria
- [x] `ouroboros.ouro/` bundle exists following the spec
- [x] `slugger.ouro/` bundle exists following the spec
- [x] Governance docs relocated to repo root
- [x] `getAgentRoot()` resolves to `.ouro` bundle path
- [x] All code/tests referencing old `ouroboros/` path updated
- [x] `.gitignore` excludes entire `*.ouro/` directories from harness repo
- [x] Bundle git init works for self-backup (nested inside gitignored directory)
- [x] Bundles pushed to private GitHub repos (`arimendelow/ouroboros.ouro`, `arimendelow/slugger.ouro`)
- [x] `psyche/memory/` directory structure scaffolded in bundles
- [x] Agent preflight loads governance docs (tested)
- [x] `npm test` green
- [x] 100% coverage on new code
- [x] All tests pass
- [x] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## TDD Requirements
**Strict TDD -- no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation
2. **Verify failure**: Run tests, confirm they FAIL (red)
3. **Minimal implementation**: Write just enough code to pass
4. **Verify pass**: Run tests, confirm they PASS (green)
5. **Refactor**: Clean up, keep tests green
6. **No skipping**: Never write implementation without failing test first

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

**CRITICAL: Every unit header MUST start with status emoji (⬜ for new units).**

### ✅ Unit 0: Baseline + Migration Plan Snapshot
**What**: Capture current state of `ouroboros/`, `ouroboros.ouro/`, `slugger/`, and `slugger.ouro/` plus repo-root governance files to drive deterministic migration choices.
**Output**: `baseline-migration-snapshot.md` artifact.
**Acceptance**: Snapshot documents source/destination mapping, confirms `.ouro` pre-existence from Gate 1, and identifies required move/merge actions.

### ✅ Unit 1a: `.ouro` Root Resolution Tests (Red)
**What**: Add failing tests for `getAgentRoot()` and any hardcoded path assumptions that must now resolve to `<agent>.ouro`.
**Output**: New/updated failing tests capturing `.ouro` root expectation.
**Acceptance**: Tests fail before path migration is implemented.

### ✅ Unit 1b: `.ouro` Root Resolution Implementation (Green)
**What**: Update `getAgentRoot()` (currently `path.join(getRepoRoot(), getAgentName())`) and impacted runtime/test fixtures to resolve `.ouro` roots.
**Output**: Updated runtime path resolution and fixture paths.
**Acceptance**: `.ouro` root tests pass and no active runtime references depend on old `ouroboros/` root.

### ✅ Unit 1c: Path Migration Refactor/Coverage
**What**: Verify coverage and compile after path migration; clean up any stale assumptions discovered by grep/tests.
**Output**: Coverage + compile evidence in artifacts.
**Acceptance**: New/modified code has 100% coverage and `npx tsc` stays green.

### ✅ Unit 2a: Governance Preflight Tests (Red)
**What**: Add failing tests for governance preflight requirement (must load root `ARCHITECTURE.md` and `CONSTITUTION.md` before startup).
**Output**: Failing test coverage for governance preflight behavior.
**Acceptance**: Tests fail before governance relocation/enforcement implementation.

### ✅ Unit 2b: Governance Relocation + Enforcement (Green)
**What**: Relocate governance docs to repo root and implement preflight loading enforcement (restoring content from preserved history if needed because root governance files are currently absent).
**Output**: Root `ARCHITECTURE.md` and `CONSTITUTION.md` plus runtime enforcement code.
**Acceptance**: Preflight tests pass and root governance files are the canonical load target.

### ✅ Unit 2c: Governance Refactor/Coverage
**What**: Harden governance preflight behavior (error paths and missing-file handling) and verify full coverage.
**Output**: Additional tests/logs as needed for full branch/error coverage.
**Acceptance**: Governance preflight code paths have 100% coverage and compile cleanly.

### ✅ Unit 3a: Bundle Content Migration (`ouroboros` -> `ouroboros.ouro`)
**What**: Perform in-place conversion of active `ouroboros/` content into `ouroboros.ouro/` (including `manifest` -> `teams-app` and `SELF-KNOWLEDGE` -> `TACIT` alignment) while preserving Gate 1 scaffolding additions.
**Output**: Updated `ouroboros.ouro/` with migrated runtime content.
**Acceptance**: Runtime-required bundle assets exist under `ouroboros.ouro/` and legacy layout dependencies are removed/updated.

### ✅ Unit 3b: Slugger Bundle Alignment
**What**: Ensure `slugger.ouro/` matches Gate 2 requirements (skeleton + stub `agent.json`, no unintended psyche population beyond scope).
**Output**: `slugger.ouro/` adjusted to scope-compliant baseline.
**Acceptance**: Slugger bundle is recognized by harness without importing Gate 7 migration content.

### ✅ Unit 4a: Gitignore Ordering + Nested Git Init
**What**: Add `*.ouro/` ignore rule (currently missing) before nested git setup, then initialize bundle-local git repos.
**Output**: `.gitignore` update and nested repo init evidence.
**Acceptance**: Bundle directories are ignored by harness git while nested git repos initialize correctly.

### ✅ Unit 4b: Private GitHub Backup Push
**What**: Create or reuse private repos (`arimendelow/ouroboros.ouro`, `arimendelow/slugger.ouro`) and push nested bundle histories.
**Output**: Remote URLs and push outcomes captured in artifacts.
**Acceptance**: Both bundle repos have successful push state (idempotent handling if repos already exist).

### ✅ Unit 4c: Memory Scaffold + Backup Verification
**What**: Verify required `psyche/memory/` scaffolding in both bundles and validate nested git state after push.
**Output**: Directory and git-state verification artifact.
**Acceptance**: Memory scaffold and nested backup criteria are both satisfied.

### ✅ Unit 5: Gate Verification
**What**: Run `npm test`, `npm run test:coverage:vitest`, and `npx tsc`, then update checklist status from verified evidence.
**Output**: Verification logs in artifacts and synced planning/doing checkboxes.
**Acceptance**: All Gate 2 completion criteria are satisfied and both docs reflect completion state.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./self-perpetuating-working-dir/2026-03-05-1708-doing-gate-2-bundle-architecture-shared-governance/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-05 17:08 Created from planning doc
- 2026-03-05 17:09 Granularity pass: split migration, governance, and backup work into atomic red/green/refactor units
- 2026-03-05 17:10 Validation pass: confirmed current gaps (`getAgentRoot` still points to `<repo>/<agent>`, root governance files missing, `.gitignore` missing `*.ouro/`, nested git not initialized)
- 2026-03-05 17:10 Quality pass: verified emoji-prefixed units, acceptance completeness, and checklist hygiene; marked READY_FOR_EXECUTION
- 2026-03-05 17:11 Unit 0 complete: baseline migration snapshot captured with explicit source->target mapping
- 2026-03-05 17:11 Unit 1a complete: added failing tests requiring `<repo>/<agent>.ouro` root resolution
- 2026-03-05 17:13 Unit 1b complete: updated `getAgentRoot()` to resolve `<repo>/<agent>.ouro` and captured green test/tsc/coverage evidence
- 2026-03-05 17:15 Unit 1c complete: cleaned stale root-path wording, reconfirmed 100% coverage for `src/identity.ts`, and revalidated `npm test` + `npx tsc`
- 2026-03-05 17:17 Unit 2a complete: added failing governance preflight tests requiring root `ARCHITECTURE.md` and `CONSTITUTION.md` before startup
- 2026-03-05 17:20 Unit 2b complete: added root governance docs, implemented `runGovernancePreflight`, and enforced governance loading before `runAgent` turn execution
- 2026-03-05 17:22 Unit 2c complete: expanded governance preflight tests to cover success + error paths and verified 100% coverage for `src/governance/loader.ts`
- 2026-03-05 17:26 Unit 3a complete: migrated active `ouroboros/` runtime assets into `ouroboros.ouro/`, aligned `manifest`->`teams-app` and `SELF-KNOWLEDGE`->`TACIT`, and captured green test/tsc evidence
- 2026-03-05 17:30 Unit 3b complete: added Slugger bundle contract checks, replaced empty `slugger.ouro/agent.json` with a scope-safe stub based on Ouroboros config shape, and reconfirmed `npm test` + `npx tsc`
- 2026-03-05 17:33 Unit 4a complete: enforced `*.ouro/` gitignore contract with red/green tests, added `.gitignore` rule, initialized nested git repos in both bundles, and reconfirmed `npm test` + `npx tsc`
- 2026-03-05 17:34 Unit 4b complete: committed initial nested bundle histories, created private GitHub repos (`arimendelow/ouroboros.ouro`, `arimendelow/slugger.ouro`), configured origins, and pushed `main` for both bundles
- 2026-03-05 17:35 Unit 4c complete: verified required `psyche/memory/` scaffold paths in both bundles and confirmed local/remote main HEAD parity for nested backup repos
- 2026-03-05 17:36 Unit 5 complete: captured final gate verification (`npm test`, `npm run test:coverage:vitest`, `npx tsc`) with 100% coverage report and synced completion checklists
