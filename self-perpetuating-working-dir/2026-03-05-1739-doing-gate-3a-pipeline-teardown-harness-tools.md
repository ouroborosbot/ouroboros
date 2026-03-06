# Doing: Gate 3a Pipeline Teardown + Harness Tools

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-05 17:39
**Planning**: ./self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md
**Artifacts**: ./self-perpetuating-working-dir/2026-03-05-1739-doing-gate-3a-pipeline-teardown-harness-tools/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Remove any remaining puppet-pipeline assumptions and complete the harness-tool inversion for Gate 3a: dual-source protocol loading, teardown invariants, and constitution/gov checks as queryable conventions.

## Completion Criteria
- [ ] Harness tools implemented per Gate 1 design, with tests
- [ ] Protocols loadable from both sources: shared subagent protocols (`subagents/`) and agent-specific skills (`<agent>.ouro/skills/`)
- [ ] `autonomous-loop.ts` removed
- [ ] `loop-entry.ts` removed
- [ ] `autonomous-loop.test.ts` removed
- [ ] `package.json` scripts cleaned up (no references to removed files)
- [ ] Pipeline orchestration removed from `trigger.ts`
- [ ] Context-loading utilities preserved and tested
- [ ] Constitution compliance queryable as a tool/convention
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

### ✅ Unit 0: Baseline Teardown + Harness Tool Inventory
**What**: Capture current state of removed reflection files/scripts and current protocol-loading behavior to drive deterministic Gate 3a changes.
**Output**: `baseline-gate-3a-inventory.md` artifact.
**Acceptance**: Inventory confirms what is already removed/clean and what still needs implementation (dual-source protocol loading + queryable governance convention).

### ✅ Unit 1a: Dual-Source Protocol Loading Tests (Red)
**What**: Add failing tests for protocol loading order and fallback semantics: bundle-local mirror first (`<agent>.ouro/skills/protocols/*.md`) and canonical fallback (`subagents/*.md`) with explicit errors when both are missing.
**Output**: New failing tests in repertoire skill-loading test suite.
**Acceptance**: Tests fail against current single-source skills loader.

### ✅ Unit 1b: Dual-Source Protocol Loading Implementation (Green)
**What**: Implement protocol discovery/loading from both sources while preserving existing agent-skill behavior and observability events.
**Output**: Updated `src/repertoire/skills.ts` (and any supporting code) passing the new protocol-loading tests.
**Acceptance**: `list_skills`/`load_skill` support shared subagent protocols and bundle-local mirrors per Gate 1 convention.

### ✅ Unit 1c: Protocol Loader Coverage + Refactor
**What**: Add branch/error-path coverage for loader edge cases (missing mirror, missing canonical, read failures, deterministic ordering) and refactor for clarity.
**Output**: Coverage evidence for protocol loader changes.
**Acceptance**: 100% coverage on new/modified loader code and compile clean.

### ✅ Unit 2a: Queryable Governance Convention Tests (Red)
**What**: Add failing tests for a queryable governance/constitution convention exposed through harness tooling (not a hardcoded stage gate).
**Output**: New failing tests in repertoire tool tests.
**Acceptance**: Tests fail before tool/convention implementation.

### ✅ Unit 2b: Queryable Governance Convention Implementation (Green)
**What**: Implement a harness-queryable governance convention tool surface and wire it into existing tool registry/contracts.
**Output**: Tool implementation + registry wiring + passing tests.
**Acceptance**: Governance/constitution check can be queried as capability/tool convention.

### ✅ Unit 2c: Governance Tool Coverage + Contract Refactor
**What**: Close coverage gaps and refactor tool surface/contracts while preserving existing behavior.
**Output**: Coverage + regression evidence for new governance query surface.
**Acceptance**: New governance tool code has 100% coverage and no regressions.

### ⬜ Unit 3a: Teardown Invariants Contract
**What**: Add/refresh automated contract checks for teardown invariants (`src/reflection/*` removed, stale reflect scripts removed, trigger orchestration absent, context utilities still covered by tests).
**Output**: Contract test updates and/or audit checks with explicit assertions.
**Acceptance**: Gate 3a teardown criteria are machine-verified.

### ⬜ Unit 3b: Gate Verification
**What**: Run `npm test`, `npm run test:coverage:vitest`, and `npx tsc`, then sync Gate 3a checklist state in planning/doing docs.
**Output**: Verification logs in artifacts and checklist updates.
**Acceptance**: All Gate 3a completion criteria are satisfied and documented.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./self-perpetuating-working-dir/2026-03-05-1739-doing-gate-3a-pipeline-teardown-harness-tools/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-05 17:39 Created from planning doc
- 2026-03-05 17:40 Granularity pass: confirmed atomic TDD unit split (red/green/refactor + teardown verification units)
- 2026-03-05 17:41 Validation pass: confirmed `src/reflection/` is absent, reflect scripts already removed from `package.json`, and current protocol loading is still single-source (`src/repertoire/skills.ts`)
- 2026-03-05 17:42 Quality pass: verified completion criteria/testability coverage, emoji-prefixed units, and execution readiness
- 2026-03-05 17:43 Unit 0 complete: captured teardown/tooling baseline in `baseline-gate-3a-inventory.md` and confirmed Gate 3a implementation gaps
- 2026-03-05 17:44 Unit 1a complete: added failing tests for protocol mirror-first loading, canonical `subagents/` fallback, and explicit dual-path missing errors
- 2026-03-05 17:46 Unit 1b complete: implemented mirror-first + canonical fallback protocol loading in `src/repertoire/skills.ts` and reconfirmed green targeted/full test + `npx tsc`
- 2026-03-05 17:48 Unit 1c complete: captured 100% focused coverage evidence for `src/repertoire/skills.ts` and reconfirmed compile-clean with `npx tsc --noEmit`
- 2026-03-05 17:50 Unit 2a complete: added governance convention query tool red tests and captured expected failures (unknown tool + missing registry entries)
- 2026-03-05 17:53 Unit 2b complete: implemented `governance_convention` tool surface, updated registry contract snapshot, and reconfirmed full `npm test` + `npx tsc --noEmit`
- 2026-03-05 17:55 Unit 2c complete: refactored governance convention logic into `src/governance/convention.ts` with dedicated tests and 100% focused coverage evidence
