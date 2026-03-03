# Doing: Ouroboros Migration — Single-Replica Runtime Hardening

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-03 14:43
**Planning**: ./2026-03-03-1430-planning-ouroboros-migration-single-replica-runtime-hardening.md
**Artifacts**: ./2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Define and lock runtime hardening requirements for single-replica preview so request-path behavior remains non-blocking and resilient under concurrent real-world usage.

## Completion Criteria
- [ ] Runtime hardening contract is implemented for single-replica preview and applied to active request-path code.
- [x] Request-path logging and persistence sinks are non-blocking in practice for expected preview concurrency.
- [x] Tool-surface runtime posture is enforced according to agreed preview policy.
- [x] Remote channels cannot execute local CLI/file/git/gh tools, and denial UX explains multi-user safety rationale with a clear alternative path.
- [ ] Concurrency guardrails (limits/timeouts/backpressure behavior) are implemented and covered by tests.
- [ ] System-prompt rebuild path has explicit safety behavior (freshness + consistency) covered by tests.
- [ ] Load-validation artifacts exist and demonstrate agreed preview thresholds: 10 concurrent remote conversations, p95 first-feedback <= 2s, p95 final <= 9s for simple no-tool turns, p95 final <= 30s for tool/external turns, and error rate < 1%.
- [ ] CI gate fails when runtime-hardening contract checks regress.
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

### ✅ Unit 0: Setup/Research
**What**: Re-baseline runtime hardening against current repo state (`src/heart`, `src/senses`, `src/repertoire`, `src/mind`, `src/nerves`) and produce a concrete contract matrix for remote tool posture, request-path blocking points, prompt rebuild safety, and concurrency SLO obligations.
**Output**: Baseline matrix at `./2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-0-runtime-baseline.md`.
**Acceptance**: Matrix lists current behavior, target behavior, and exact file/test touchpoints required for implementation.

### ✅ Unit 1a: Remote Tool-Surface Safety — Tests
**What**: Add failing tests that enforce remote-channel tool restrictions (no local CLI/file/git/gh tools in remote channel capabilities) and required denial messaging language for blocked operations.
**Output**: Red test artifact at `./2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-1a-red-run.txt`.
**Acceptance**: Tests fail before implementation and explicitly show remote local-tool exposure/denial-message gaps.

### ✅ Unit 1b: Remote Tool-Surface Safety — Implementation
**What**: Implement channel-aware tool allowlisting and denial-path messaging so remote users get safe alternatives instead of opaque refusal.
**Output**: Updated runtime/tool routing code and passing targeted tests.
**Acceptance**: Remote channels cannot execute local CLI/file/git/gh tools; responses explain multi-user safety rationale and next-step alternatives.

### ✅ Unit 1c: Remote Tool-Surface Safety — Coverage & Refactor
**What**: Backfill tests for edge/error paths of remote tool gating and denial UX contract.
**Output**: Coverage artifact at `./2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-1c-coverage-run.txt`.
**Acceptance**: New/changed code for remote tool gating is fully covered and tests remain green.

### ✅ Unit 2a: Request-Path Non-Blocking Contract — Tests
**What**: Add failing tests for non-blocking request-path behavior in logging/prompt/config surfaces (no hot-path blocking sink behavior, non-blocking degradation under sink failure/pressure).
**Output**: Red test artifact at `./2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-2a-red-run.txt`.
**Acceptance**: Tests fail and identify current blocking/hot-path assumptions.

### ✅ Unit 2b: Request-Path Non-Blocking Contract — Implementation
**What**: Implement request-path hardening changes so runtime remains responsive under sink/file pressure and prompt-path activity.
**Output**: Updated nerves/prompt/runtime code and passing tests.
**Acceptance**: Request-path logging/prompt behavior follows non-blocking contract with safe fallback behavior under I/O issues.

### ✅ Unit 2c: Request-Path Non-Blocking Contract — Coverage & Refactor
**What**: Cover sink error branches, fallback paths, and pressure cases; refactor for clarity while preserving behavior.
**Output**: Coverage artifact at `./2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-2c-coverage-run.txt`.
**Acceptance**: Non-blocking/fallback paths are fully covered and stable.

### ✅ Unit 3a: Concurrency Guardrails and Prompt-Rebuild Safety — Tests
**What**: Add failing tests for per-conversation and global guardrails (in-flight/queue/timeout posture) and prompt-rebuild freshness/consistency safety.
**Output**: Red test artifact at `./2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-3a-red-run.txt`.
**Acceptance**: Tests fail before implementation and capture missing guardrail/freshness behavior.

### ⬜ Unit 3b: Concurrency Guardrails and Prompt-Rebuild Safety — Implementation
**What**: Implement guardrails and prompt-path safety behavior aligned to single-replica preview requirements.
**Output**: Updated engine/channel/prompt runtime code and passing tests.
**Acceptance**: Concurrency and prompt consistency behavior are enforced and observable in runtime/tests.

### ⬜ Unit 3c: Concurrency Guardrails and Prompt-Rebuild Safety — Coverage & Refactor
**What**: Cover boundary conditions (limit reached, timeout, degraded fallback) and refactor for maintainability.
**Output**: Coverage artifact at `./2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-3c-coverage-run.txt`.
**Acceptance**: New guardrail and prompt-safety paths are fully covered.

### ⬜ Unit 4a: Load-Validation and CI Gate Contract — Tests
**What**: Add failing tests/scripts for load-validation artifact schema and CI contract enforcement, including split SLO metrics and typed required-actions.
**Output**: Red artifact at `./2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-4a-red-run.txt`.
**Acceptance**: Tests fail for missing/incorrect load-validation contract behavior.

### ⬜ Unit 4b: Load-Validation and CI Gate Contract — Implementation
**What**: Implement load-validation harness/artifacts and wire CI to fail on runtime hardening contract regressions.
**Output**: Validation outputs and CI wiring notes at `./2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/unit-4b-load-validation.md`.
**Acceptance**: Artifacts report 10-conversation target and SLO metrics; CI gate is enforced.

### ⬜ Unit 4c: Final Verification and Completion Audit
**What**: Run final verification (`npm run test`, `npm run test:coverage`, `npm run build`, hardening validation checks), then audit completion criteria line-by-line.
**Output**: Final audit at `./2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/final-audit.md` plus run artifacts in the task artifacts directory.
**Acceptance**: All completion criteria are satisfied with explicit evidence and no warnings.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-03-1430-doing-ouroboros-migration-single-replica-runtime-hardening/` directory
- **Fixes/blockers**: Spawn sub-agent immediately — don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- [2026-03-03 14:43] Created from planning doc.
- [2026-03-03 14:44] Granularity pass complete: units confirmed atomic and testable with explicit What/Output/Acceptance for each phase.
- [2026-03-03 14:45] Validation pass complete: verified referenced runtime/workflow paths in current repo and confirmed doing assumptions align with present code layout.
- [2026-03-03 14:46] Quality pass complete: checklist/testability/emoji-header requirements verified; status set to READY_FOR_EXECUTION.
- [2026-03-03 14:47] Unit 0 complete: captured current-state runtime hardening contract matrix and target touchpoints in `unit-0-runtime-baseline.md`.
- [2026-03-03 14:49] Unit 1a complete: added failing remote tool-safety tests and captured red evidence for local-tool exposure and missing denial UX contract.
- [2026-03-03 14:51] Unit 1b complete: implemented remote-channel local-tool filtering/denial messaging, updated contract tests, and verified full test + build green.
- [2026-03-03 14:53] Unit 1c complete: verified 100% coverage and clean build after remote tool-safety changes (`unit-1c-coverage-run.txt`, `unit-1c-build-run.txt`).
- [2026-03-03 14:54] Unit 2a complete: added failing non-blocking sink contract tests and captured red evidence for sink-failure throw behavior.
- [2026-03-03 14:57] Unit 2b complete: implemented non-blocking sink fanout/file behavior with resilient error handling and verified full test + build green (`unit-2b-test-run.txt`, `unit-2b-build-run.txt`).
- [2026-03-03 14:58] Unit 2c complete: verified 100% coverage and clean build after non-blocking sink hardening (`unit-2c-coverage-run.txt`, `unit-2c-build-run.txt`).
- [2026-03-03 15:01] Unit 3a complete: added failing tests for global in-flight Teams guardrails and prompt-refresh safety/consistency; captured red evidence in `unit-3a-red-run.txt`.
