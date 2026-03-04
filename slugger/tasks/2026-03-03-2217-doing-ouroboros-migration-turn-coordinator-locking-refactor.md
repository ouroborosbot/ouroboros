# Doing: Ouroboros Migration - Turn Coordinator Locking Refactor

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-04 10:49
**Planning**: ./2026-03-03-2217-planning-ouroboros-migration-turn-coordinator-locking-refactor.md
**Artifacts**: ./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Remove Teams hard reject-on-cap behavior and preserve ordered per-conversation execution by moving lock semantics into a channel-agnostic turn coordinator.

## Completion Criteria
- [ ] Teams no longer hard-rejects messages based on a static concurrent-turn cap.
- [ ] `teamsChannel.maxConcurrentConversations` is fully removed from config schema/defaults/accessors and call sites.
- [ ] A shared turn coordinator exists and is used by Teams for per-conversation serialization.
- [ ] Same-conversation turns remain serialized; different-conversation turns remain parallelizable.
- [ ] Existing confirmation flow remains deadlock-safe with the coordinator in place.
- [ ] Tests are updated to cover the new coordinator contract and removed cap behavior.
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

### ⬜ Unit 0: Setup/Research
**What**: Lock baseline callsites and contracts for migration from Teams-local lock/cap to shared turn coordinator; enumerate all references to `withConversationLock`, `_inFlightTeamsTurns`, and `maxConcurrentConversations` in runtime and tests.
**Output**: `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/unit-0-baseline.md`
**Acceptance**: Baseline inventory covers all active callsites and identifies exact tests/contracts to update.

### ⬜ Unit 1a: Turn Coordinator & Cap Removal — Tests
**What**: Write failing tests for the refactor contract:
- shared coordinator serializes same key and permits parallel different keys
- Teams path no longer emits cap-reject overload message or checks in-flight cap gate
- `teamsChannel.maxConcurrentConversations` removed from config/types/defaults/tests
**Output**: `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/unit-1a-red-run.txt`
**Acceptance**: New/updated tests fail on current behavior before implementation.

### ⬜ Unit 1b: Turn Coordinator & Cap Removal — Implementation
**What**: Implement shared turn coordinator, migrate Teams to use it, and remove cap-gate/config field and related runtime code/tests.
**Output**:
- `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/unit-1b-test-run.txt`
- `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/unit-1b-build-run.txt`
**Acceptance**: Unit 1a tests pass; Teams turn handling keeps per-conversation serialization without hard cap rejection; config no longer exposes `maxConcurrentConversations`.

### ⬜ Unit 1c: Turn Coordinator & Cap Removal — Coverage & Refactor
**What**: Run coverage gate, backfill any uncovered branches introduced by coordinator/cap-removal changes, and refactor for clarity.
**Output**:
- `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/unit-1c-coverage-run.txt`
- `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/unit-1c-build-run.txt`
**Acceptance**: 100% coverage on changed code, tests green, build green, no warnings.

### ⬜ Unit 2a: Confirmation Safety Regression Validation
**What**: Validate confirmation flow remains deadlock-safe after coordinator migration (pre-lock confirmation resolution and same-conversation sequencing behavior).
**Output**: `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/unit-2a-test-run.txt`
**Acceptance**: Confirmation-related Teams tests pass with coordinator path active and no deadlock regressions.

### ⬜ Unit 2b: Final Verification & Audit
**What**: Run final full verification and produce concise final audit mapping completion criteria to evidence artifacts.
**Output**:
- `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/unit-2b-test-run.txt`
- `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/unit-2b-coverage-run.txt`
- `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/unit-2b-build-run.txt`
- `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/final-audit.md`
**Acceptance**: All completion criteria satisfied with explicit artifact-backed evidence and no warnings.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./[task-name]/` directory
- **Fixes/blockers**: Spawn sub-agent immediately — don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-04 10:49 Created from planning doc
- 2026-03-04 10:50 Pass 2 complete: granularity review found unit boundaries already atomic and testable; no structural changes needed.
- 2026-03-04 10:51 Pass 3 complete: validated referenced runtime/test paths and current cap/lock callsites (`teams.ts`, `config.ts`, `teams.test.ts`, `config.test.ts`); no corrections required.
- 2026-03-04 10:51 Pass 4 complete: quality checks passed (emoji headers present, no TBDs, criteria testable) and status set to READY_FOR_EXECUTION.
