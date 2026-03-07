# Doing: Fix Round Gate 1 Cuts And Cleanup

**Status**: in-progress
**Execution Mode**: direct
**Created**: 2026-03-06 23:18
**Planning**: ./2026-03-06-2318-planning-fix-round-gate-1-cuts.md
**Artifacts**: ./2026-03-06-2318-doing-fix-round-gate-1-cuts/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Delete dead subsystems and stale repository artifacts from Gate 1 so later gates build on a smaller, cleaner codebase with no dangling references.

## Completion Criteria
- [ ] All Gate 1 removals and file moves are complete
- [ ] No production or test references remain to deleted code
- [ ] `package.json` script surface matches Gate 1 requirements
- [ ] Root cleanup and docs consolidation are complete
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

### ✅ Unit 0: Setup And Baseline
**What**: Verify Gate 1 target files exist, capture baseline references, and prepare artifact logs.
**Output**: Baseline inventory + reference scan output in artifacts directory.
**Acceptance**: Artifact files exist and enumerate all Gate 1 removal/move targets.

### ⬜ Unit 1: Production Code Removals
**What**: Delete Gate 1 production files/directories and update all imports/exports/callers that reference removed code.
**Output**: Production tree with dead code removed and references fixed.
**Acceptance**: No compile-time references remain to deleted production code.

### ⬜ Unit 2: Test Suite Pruning
**What**: Delete tests that only cover deleted Gate 1 production code and update any test imports impacted by removals.
**Output**: Test tree aligned with remaining production surfaces.
**Acceptance**: No test references remain to removed modules.

### ⬜ Unit 3: Root Cleanup And Script Hygiene
**What**: Execute Gate 1 root cleanup moves/deletions, merge useful CONSTITUTION content into AGENTS, delete CONSTITUTION, update `.gitignore`, and update `package.json` scripts.
**Output**: Root layout and scripts match Gate 1 contract.
**Acceptance**: Required files moved/deleted and script surface constrained to required commands.

### ⬜ Unit 4: Verification
**What**: Run full repo verification (`npm test`, `npm run build`) and targeted scans confirming no references to deleted code remain.
**Output**: Verification logs in artifacts directory.
**Acceptance**: Tests pass, build succeeds, no warnings, and scans show no stale references.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-06-2318-doing-fix-round-gate-1-cuts/` directory
- **Fixes/blockers**: Spawn sub-agent immediately — don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-06 23:18 Created from planning doc
- 2026-03-06 23:20 Unit 0 complete: Captured baseline inventory, reference scans, and script snapshot artifacts.
