# Doing: Gate 0 Clean Baseline

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-05 16:25
**Planning**: ./self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md
**Artifacts**: ./self-perpetuating-working-dir/2026-03-05-1625-doing-gate-0-clean-baseline/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Restore `main` to a healthy state by reverting commits `e3ecc1c..448cfcd`, preserving the archive branch, and producing a commit map for Gate 5 salvage.

## Completion Criteria
- [ ] Archive branch `archive/self-perpetuating-run-2026-03-05` exists and contains overnight proposals
- [ ] Commit map documented at `self-perpetuating-working-dir/gate-0-commit-map.md` (reverted vs salvageable)
- [ ] `main` reverted via explicit revert commits
- [ ] `npm test` green on `main` post-revert
- [ ] No force-push, no history rewrite
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

### ⬜ Unit 0: Setup and Verification Baseline
**What**: Confirm archive branch exists on origin and collect commit metadata for `e3ecc1c..448cfcd`.
**Output**: Artifacts with git logs/stats in the gate artifacts directory.
**Acceptance**: Archive branch presence and commit-range metadata are captured.

### ⬜ Unit 1a: Commit Inventory
**What**: Enumerate every commit in `e3ecc1c..448cfcd` with hash, summary, and touched files.
**Output**: Structured inventory artifact in the gate artifacts directory.
**Acceptance**: Inventory includes every commit in the target range with no gaps.

### ⬜ Unit 1b: Commit Map for Salvage
**What**: Build `self-perpetuating-working-dir/gate-0-commit-map.md` listing each reverted commit with summary and salvageability classification.
**Output**: Commit map markdown file with per-commit decisions and rationale.
**Acceptance**: All commits in range are mapped and classified.

### ⬜ Unit 2: Revert Batch on Gate Branch
**What**: Run single-batch revert `git revert --no-commit e3ecc1c^..448cfcd` and commit with the specified message.
**Output**: One revert commit on `slugger/gate-0-clean-baseline`.
**Acceptance**: Revert commit exists and no history rewrite/force-push is used.

### ⬜ Unit 3: Validate and Prepare Merge
**What**: Run verification (`npm test`, `npx tsc`) and confirm gate completion criteria evidence before handoff to merger.
**Output**: Test/build logs captured under artifacts and updated doing criteria.
**Acceptance**: Test/build are green and criteria are satisfiable for merge.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./self-perpetuating-working-dir/2026-03-05-1625-doing-gate-0-clean-baseline/` directory
- **Fixes/blockers**: Spawn sub-agent immediately — don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-05 16:25 Created from planning doc
- 2026-03-05 16:26 Granularity pass: split commit-map work into inventory + classification units
- 2026-03-05 16:27 Validation pass: confirmed planning path, commit range, and archive branch references
- 2026-03-05 16:28 Quality pass: unit format and checklist completeness verified
