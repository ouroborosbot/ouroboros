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
Remove Teams hard reject-on-cap behavior and replace silent same-conversation waiting with model-visible steering behavior, using a channel-agnostic turn coordinator for turn ownership.

## Completion Criteria
- [ ] Teams no longer hard-rejects messages based on a static concurrent-turn cap.
- [ ] `teamsChannel.maxConcurrentConversations` is fully removed from config schema/defaults/accessors and call sites.
- [ ] A shared turn coordinator exists and is used by Teams for per-conversation serialization.
- [ ] Same-conversation follow-up messages during active turns are all preserved and injected into the active turn between model calls.
- [ ] No steering follow-up dedupe/idempotency layer is introduced in this task.
- [ ] Steering follow-ups are injected as ordered discrete user messages (not dropped, reordered, or collapsed with lost boundaries).
- [ ] Steering injection occurs only at model-call boundaries; no in-flight model-call mutation occurs.
- [ ] Buffered follow-ups that miss a boundary are carried into the next turn for the same conversation.
- [ ] No steering-specific buffer cap is introduced; steering follow-ups use existing context/window and trimming behavior.
- [ ] Steering path introduces no adapter-authored plain-text acknowledgement messages to users.
- [ ] Model receives all follow-up user messages for steering (none dropped).
- [ ] Single active-turn ownership per conversation is preserved; different conversations remain parallelizable.
- [ ] Tests are updated to cover coordinator contract, steering injection contract, and removed cap behavior.
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
**What**: Lock baseline callsites and contracts for migration from Teams-local lock/cap to shared turn coordinator + steering injection path; enumerate references to `withConversationLock`, `_inFlightTeamsTurns`, `maxConcurrentConversations`, and current same-conversation follow-up handling points. Identify exact model-call boundaries in `heart/core.ts` that are safe steering injection points.
**Output**: `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/unit-0-baseline.md`
**Acceptance**: Baseline inventory covers runtime/test callsites, safe injection boundary map, and explicit contract cases (ordering, carry-forward, no-dedupe scope).

### ⬜ Unit 1a: Turn Coordinator & Cap Removal — Tests
**What**: Write failing tests for the refactor contract:
- shared coordinator serializes same key and permits parallel different keys
- Teams path no longer emits cap-reject overload message or checks in-flight cap gate
- Teams path preserves all same-conversation mid-turn follow-up messages and injects them between model calls
- Coordinator preserves and forwards follow-up messages as received (no idempotency/dedupe layer)
- Teams path preserves message boundaries/order when injecting follow-ups (discrete user messages in chronological order)
- Teams path carries buffered follow-ups into next turn when no boundary consumed them in the active turn
- Teams path does not emit adapter-authored plain-text steering acknowledgements
- `teamsChannel.maxConcurrentConversations` removed from config/types/defaults/tests
**Output**: `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/unit-1a-red-run.txt`
**Acceptance**: New/updated tests fail on current behavior before implementation.

### ⬜ Unit 1b: Turn Coordinator & Cap Removal — Implementation
**What**: Implement shared turn coordinator, migrate Teams to use it, add preserve-all steering injection handling for same-conversation mid-turn follow-ups, and remove cap-gate/config field and related runtime code/tests. Implement steering buffer entry shape `{ conversationId, text, receivedAt }`.
**Output**:
- `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/unit-1b-test-run.txt`
- `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/unit-1b-build-run.txt`
**Acceptance**: Unit 1a tests pass; Teams turn handling uses coordinator ownership semantics, preserves+injects all follow-up messages for model visibility with ordered discrete boundaries, uses boundary-only injection with carry-forward, adds no steering-specific buffer cap, emits no adapter-authored steering plain text, avoids hard cap rejection, and removes `maxConcurrentConversations`.

### ⬜ Unit 1c: Turn Coordinator & Cap Removal — Coverage & Refactor
**What**: Run coverage gate, backfill any uncovered branches introduced by coordinator/cap-removal changes, and refactor for clarity.
**Output**:
- `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/unit-1c-coverage-run.txt`
- `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/unit-1c-build-run.txt`
**Acceptance**: 100% coverage on changed code, tests green, build green, no warnings.

### ⬜ Unit 2a: Steering Safety Regression Validation
**What**: Validate steering path safety after coordinator migration (same-conversation ownership, preserve-all follow-up injection behavior, no-dedupe contract, boundary-only injection, and carry-forward behavior).
**Output**: `./2026-03-03-2217-doing-ouroboros-migration-turn-coordinator-locking-refactor/unit-2a-test-run.txt`
**Acceptance**: Steering-related Teams tests pass with coordinator path active and no ordering or boundary regressions.

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
- 2026-03-04 10:54 Updated doing scope to include explicit steering follow-up behavior and related regression coverage.
- 2026-03-04 11:19 Updated doing contract to preserve+inject all steering follow-ups and prohibit adapter-authored steering plain-text acknowledgements.
- 2026-03-04 11:39 Expanded doing contract details: dedupe by `activity.id`, ordered discrete injection, boundary-only injection, carry-forward semantics, and confirmation explicitly out of scope.
- 2026-03-04 11:53 Generalized doing dedupe contract to channel message identity and locked no steering-specific buffer cap (existing context trimming/window applies).
- 2026-03-04 12:21 Removed follow-up dedupe/idempotency from doing scope to match locked no-scope-expansion direction.
