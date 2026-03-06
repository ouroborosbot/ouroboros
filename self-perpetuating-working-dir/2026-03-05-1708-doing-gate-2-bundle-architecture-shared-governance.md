# Doing: Gate 2 Bundle Architecture + Shared Governance

**Status**: drafting
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
- [ ] `ouroboros.ouro/` bundle exists following the spec
- [ ] `slugger.ouro/` bundle exists following the spec
- [ ] Governance docs relocated to repo root
- [ ] `getAgentRoot()` resolves to `.ouro` bundle path
- [ ] All code/tests referencing old `ouroboros/` path updated
- [ ] `.gitignore` excludes entire `*.ouro/` directories from harness repo
- [ ] Bundle git init works for self-backup (nested inside gitignored directory)
- [ ] Bundles pushed to private GitHub repos (`arimendelow/ouroboros.ouro`, `arimendelow/slugger.ouro`)
- [ ] `psyche/memory/` directory structure scaffolded in bundles
- [ ] Agent preflight loads governance docs (tested)
- [ ] `npm test` green
- [ ] 100% coverage on new code
- [ ] All tests pass
- [ ] No warnings

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

### ⬜ Unit 0: Baseline + Migration Plan Snapshot
**What**: Capture current state of `ouroboros/`, `ouroboros.ouro/`, `slugger/`, and `slugger.ouro/` plus repo-root governance files to drive deterministic migration choices.
**Output**: `baseline-migration-snapshot.md` artifact.
**Acceptance**: Snapshot documents source/destination mapping, confirms `.ouro` pre-existence from Gate 1, and identifies required move/merge actions.

### ⬜ Unit 1: Runtime Path Migration to `.ouro`
**What**: Update `getAgentRoot()` and all affected fixtures/tests/import assumptions so runtime resolves `.<agent>.ouro` paths.
**Output**: Updated code/tests with passing path contracts.
**Acceptance**: Tests prove `.ouro` root resolution and no stale `ouroboros/` assumptions remain in active runtime paths.

### ⬜ Unit 2: Governance Relocation + Preflight Enforcement
**What**: Restore/relocate `ARCHITECTURE.md` and `CONSTITUTION.md` to repo root and enforce governance preflight loading behavior.
**Output**: Governance docs at repo root and tested preflight loader path.
**Acceptance**: Preflight test(s) verify governance docs must load before work starts.

### ⬜ Unit 3: Bundle Structure Finalization
**What**: Finalize `ouroboros.ouro/` and `slugger.ouro/` structure per Gate 2 scope (manifest rename, TACIT naming, memory scaffold correctness).
**Output**: Updated bundle trees committed in harness repo.
**Acceptance**: Bundle trees match Gate 2 spec and include required memory scaffold paths.

### ⬜ Unit 4: Bundle Git Ignore + Nested Git Backup
**What**: Add `*.ouro/` to `.gitignore`, initialize nested git repos in bundles, and push to private GitHub repos.
**Output**: `.gitignore` update plus nested-git and remote-push evidence in artifacts.
**Acceptance**: Both bundles have initialized nested git repos and remote push success (or explicit idempotent handling if repos already exist).

### ⬜ Unit 5: Gate Verification
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
