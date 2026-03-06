# Doing: Gate 6 Hardening

**Status**: in-progress
**Execution Mode**: direct
**Created**: 2026-03-05 20:55
**Planning**: ./self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md
**Artifacts**: ./self-perpetuating-working-dir/2026-03-05-2055-doing-gate-6-hardening/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Implement Gate 6 hardening by adding explicit interruption/resume checkpoint awareness to inner dialog turns and calibrating constitution classification so additive hardening defaults to `within-bounds` while structural changes remain `requires-review`.

## Completion Criteria
- [x] Resume state: agent recovers cleanly from interruption, orienting faster than cold start (tested with simulated interruption)
- [ ] Classification calibrated and validated against representative proposals (at least 5 test cases: 3 within-bounds, 2 requires-review)
- [ ] `npm test` green
- [ ] 100% coverage on new code
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

### ✅ Unit 0: Baseline + target verification
**What**: Confirm Gate 6 target files and existing behavior for inner dialog resume/state and governance classification APIs.
**Output**: `unit-0-baseline.md` artifact with verified file paths and behavior notes.
**Acceptance**: Artifact captures current behavior and validated target touchpoints.
Validated target touchpoints:
- `src/senses/inner-dialog.ts`
- `src/__tests__/senses/inner-dialog.test.ts`
- `src/governance/convention.ts`
- `src/__tests__/governance/convention.test.ts`

### ✅ Unit 1a: Resume checkpoint awareness tests (Red)
**What**: Add failing tests proving resumed inner-dialog turns include checkpoint-orientation context derived from prior autonomous work.
**Output**: Red tests + `unit-1a-red-test.log`.
**Acceptance**: New tests fail against current behavior and specifically assert checkpoint awareness during resumed turns.

### ✅ Unit 1b: Resume checkpoint awareness implementation (Green)
**What**: Implement checkpoint-aware resume state in inner-dialog runtime/instinct flow so restart orientation is faster than cold start.
**Output**: Updated runtime code + `unit-1b-green-test.log` + `unit-1b-tsc.log`.
**Acceptance**: Unit 1a tests pass, `npx tsc --noEmit` is clean, and checkpoint context persists through session history.

### ✅ Unit 1c: Resume checkpoint coverage + refactor
**What**: Refine checkpoint parsing/formatting and close any uncovered branches.
**Output**: `unit-1c-coverage.log`.
**Acceptance**: 100% coverage on new checkpoint logic; tests remain green.

### ⬜ Unit 2a: Classification calibration tests (Red)
**What**: Add failing tests for at least five representative governance proposals (3 `within-bounds`, 2 `requires-review`) against the queryable convention calibration logic.
**Output**: Red tests + `unit-2a-red-test.log`.
**Acceptance**: All new calibration tests fail before implementation and cover both classes.
Representative proposals:
1. Add shell timeout guards to tool execution (`within-bounds`)
2. Add schema validation for reflection artifacts (`within-bounds`)
3. Improve checkpoint resume prompts for inner dialog (`within-bounds`)
4. Rewrite governance ownership workflow for all agents (`requires-review`)
5. Replace bundle root/location strategy across the harness (`requires-review`)

### ⬜ Unit 2b: Classification calibration implementation (Green)
**What**: Implement calibrated constitution classification logic for representative proposal summaries while preserving existing convention query behavior.
**Output**: Updated governance classification code + `unit-2b-green-test.log` + `unit-2b-tsc.log`.
**Acceptance**: Calibration tests pass, defaults remain additive→`within-bounds`, structural cases return `requires-review`, and `npx tsc --noEmit` stays clean.

### ⬜ Unit 2c: Classification coverage + refactor
**What**: Refactor classification heuristics and close branch coverage gaps.
**Output**: `unit-2c-coverage.log`.
**Acceptance**: 100% coverage on new classification logic and all relevant tests green.

### ⬜ Unit 3: Final verification + Gate 6 checklist sync
**What**: Run full verification suite and sync Gate 6 completion checklists in planning/doing docs.
**Output**: `unit-3-verification.md` + verification logs.
**Acceptance**: `npm test` green, `npx tsc --noEmit` green, completion criteria evidence captured.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each unit
- Push after each unit complete
- Run full test suite before marking implementation units done
- **All artifacts**: Save outputs/logs under `./self-perpetuating-working-dir/2026-03-05-2055-doing-gate-6-hardening/`
- **Fixes/blockers**: Spawn sub-agent for simple fix loops; only stop for real requirement blockers
- **Decision updates**: Record classification and resume-state decisions in docs immediately

## Progress Log
- 2026-03-05 20:55 Created from Gate 6 section of approved planning doc
- 2026-03-05 20:58 Granularity pass: clarified representative proposal set for calibration tests
- 2026-03-05 20:58 Validation pass: verified Gate 6 target files and existing convention/session interfaces
- 2026-03-05 20:59 Quality pass: confirmed emoji unit headers, acceptance criteria, and execution readiness
- 2026-03-05 20:58 Unit 0 complete: captured baseline behavior and verified Gate 6 target files
- 2026-03-05 20:59 Unit 1a complete: added failing resume-checkpoint test proving missing checkpoint context on resumed turns
- 2026-03-05 21:00 Unit 1b complete: implemented checkpoint-aware instinct prompts and validated with green tests + clean `npx tsc --noEmit`
- 2026-03-05 21:04 Unit 1c complete: closed checkpoint-logic coverage to 100% with full `test:coverage:vitest` and clean `npx tsc --noEmit`
