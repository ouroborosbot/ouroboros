# Doing: Fix Round Gate 2 Schema And Data Model

**Status**: in_progress
**Execution Mode**: direct
**Created**: 2026-03-06 23:47
**Planning**: ./2026-03-06-2347-planning-fix-round-gate-2-schema.md
**Artifacts**: ./2026-03-06-2347-doing-fix-round-gate-2-schema/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Implement Gate 2 schema and data-model contracts end-to-end: task lifecycle/frontmatter simplification, `agent.json` schema changes, unified friend store data model, psyche canonical cuts, and bundle-manifest detection primitives with updated contract tests.

## Completion Criteria
- [ ] Task schema updates complete (statuses, transitions, frontmatter)
- [ ] Agent config/identity schema updates complete
- [ ] Friend store unified file contract complete
- [ ] Psyche canonical cuts reflected in prompt and tests
- [ ] Canonical bundle manifest + non-canonical detection implemented
- [ ] Bundle skeleton contract test rewritten to Gate 2 expectations
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## TDD Requirements
**Strict TDD — no exceptions:**
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

### ⬜ Unit 0: Baseline Contract Snapshot
**What**: Capture Gate 2 baseline references for status enums, config schema usage, friend-store shape, and bundle contract checks.
**Output**: Baseline artifact files under artifacts directory.
**Acceptance**: Artifact set exists and maps every Gate 2 target surface.

### ⬜ Unit 1: Task Schema Simplification
**What**: Apply task status/transition/frontmatter changes (`validating`, `validator`, `requester`, `cadence`, `scheduledAt`, `lastRun`) across task modules and tests.
**Output**: Updated tasks runtime + passing task/repertoire/prompt tests.
**Acceptance**: No `validating:slugger` or `validating:ari` references remain in source/tests.

### ⬜ Unit 2: Agent Identity/Config Schema Update
**What**: Remove `name`/`configPath` from runtime contract, add `version`/`enabled`, derive agent identity from bundle directory, and enforce conventional secrets path.
**Output**: Updated `identity.ts`/`config.ts` with passing identity/config/auth-adjacent tests.
**Acceptance**: Agent config loading no longer depends on `agent.json.configPath` or `agent.json.name`.

### ⬜ Unit 3: Friend Store PII Collapse
**What**: Refactor friend record schema + file store to single-path storage with merged fields and new relationship metadata.
**Output**: Updated friend types/store/resolver/sense store wiring and tests.
**Acceptance**: `FileFriendStore` has single root path and all friend tests pass.

### ⬜ Unit 4: Psyche Canonical Cuts
**What**: Remove FRIENDS/CONTEXT psyche prompt injection and align canonical psyche usage with Gate 2 cuts.
**Output**: Updated prompt assembly and prompt/core tests.
**Acceptance**: Prompt system no longer loads `FRIENDS.md` or `CONTEXT.md` as canonical psyche sources.

### ⬜ Unit 5: Canonical Bundle Manifest + Contract Rewrite
**What**: Introduce canonical bundle path manifest and non-canonical file detection helper; rewrite bundle skeleton contract test for Gate 2 structure (`senses/teams`, no skills stubs, no FRIENDS/CONTEXT requirements).
**Output**: New manifest/detection module + updated bundle contract tests.
**Acceptance**: Contract test reflects Gate 2 canonical manifest decisions and passes.

### ⬜ Unit 6: Verification
**What**: Run full validation (`npm test`, `npm run build`, `npm run test:coverage`) and stale-reference scans for removed schema artifacts.
**Output**: Verification logs + stale reference scan artifacts.
**Acceptance**: Full suite/build/coverage pass with no warnings.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each unit completion
- Push after each unit complete
- Run full relevant tests before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-06-2347-doing-fix-round-gate-2-schema/` directory
- **Fixes/blockers**: Resolve autonomously; only block on hard external impossibility

## Progress Log
- 2026-03-06 23:47 Created from planning doc.
