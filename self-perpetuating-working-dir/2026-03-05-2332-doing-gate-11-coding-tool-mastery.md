# Doing: Gate 11 Coding Tool Mastery

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-05 23:32
**Planning**: ./self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md
**Artifacts**: ./self-perpetuating-working-dir/2026-03-05-2332-doing-gate-11-coding-tool-mastery/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Teach agents to use external coding tools (Claude Code/Codex) by implementing coding session orchestration, runtime tools, monitoring/recovery, and an end-to-end pipeline proving the agent can run work-planner → work-doer → work-merger through spawned coding sessions.

## Completion Criteria
- [ ] Coding session orchestration implemented (spawn, monitor, manage)
- [ ] Coding tools exposed and callable by the model
- [ ] Sessions monitored for progress, stalls, completion, and blockers
- [ ] Agent manages spawned session context effectively (scoped tasks, state files)
- [ ] Failure recovery works (crash restart, stall detection, resume)
- [ ] Agent successfully completes a real coding task end-to-end: work-planner → work-doer → work-merger pipeline orchestrated through external coding tools (Claude Code/Codex)
- [ ] `npm test` green
- [ ] 100% coverage on new code

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

### ⬜ Unit 0: Baseline + orchestration contract map
**What**: Map existing tool/runtime seams and define the Gate 11 target surfaces for coding session orchestration and tool exposure.
**Output**: `unit-0-baseline.md`.
**Acceptance**: Artifact lists concrete implementation/test files and integration seams for coding tool orchestration.

### ⬜ Unit 1a: Coding session lifecycle tests (Red)
**What**: Add failing tests for session spawn/register/kill, status transitions, and branch-aware workdir constraints.
**Output**: Red tests + `unit-1a-red.log`.
**Acceptance**: Tests fail before implementation and encode the core session manager contract.

### ⬜ Unit 1b: Spawner + manager implementation (Green)
**What**: Implement coding session types/spawner/manager with process registry, lifecycle state, and non-env-var runtime defaults.
**Output**: Implementation + `unit-1b-green.log` + `unit-1b-tsc.log`.
**Acceptance**: Unit 1a tests pass and coding session lifecycle compiles cleanly.
Expected target files:
- `src/coding/types.ts`
- `src/coding/spawner.ts`
- `src/coding/manager.ts`
- `src/coding/index.ts`
- `src/__tests__/coding/session-manager.test.ts`

### ⬜ Unit 1c: Session lifecycle coverage hardening
**What**: Cover branch/error/edge cases in lifecycle code (unknown session IDs, spawn failures, duplicate starts) and refactor for determinism.
**Output**: `unit-1c-coverage.log`.
**Acceptance**: 100% coverage for Unit 1 modules.

### ⬜ Unit 2a: Coding tools surface tests (Red)
**What**: Add failing tests for `coding_spawn`, `coding_status`, `coding_send_input`, and `coding_kill` tool contracts and argument validation.
**Output**: Red tests + `unit-2a-red.log`.
**Acceptance**: Tests fail before implementation and define callable model-facing coding tools.

### ⬜ Unit 2b: Coding tools implementation + registry wiring (Green)
**What**: Implement coding tools and wire them into harness tool registry/runtime entrypoints without breaking existing tools.
**Output**: Implementation + `unit-2b-green.log` + `unit-2b-tsc.log`.
**Acceptance**: Unit 2a tests pass and coding tools are callable in tests.
Expected target files:
- `src/coding/tools.ts`
- `src/repertoire/tools-base.ts`
- `src/repertoire/tools.ts`
- `src/__tests__/coding/tools-coding.test.ts`

### ⬜ Unit 2c: Coding tools coverage hardening
**What**: Close remaining validation/error-path coverage in coding tools and registry integration.
**Output**: `unit-2c-coverage.log`.
**Acceptance**: 100% coverage for Unit 2 modules.

### ⬜ Unit 3a: Monitoring + recovery tests (Red)
**What**: Add failing tests for output/activity monitoring, stall detection, completion markers, and crash/stall recovery triggers.
**Output**: Red tests + `unit-3a-red.log`.
**Acceptance**: Tests fail before implementation and capture monitoring + recovery expectations.

### ⬜ Unit 3b: Monitor/reporter/recovery implementation (Green)
**What**: Implement monitor/reporter/recovery logic, including resumable state for restarted coding sessions.
**Output**: Implementation + `unit-3b-green.log` + `unit-3b-tsc.log`.
**Acceptance**: Unit 3a tests pass and monitoring/recovery behavior is observable in tests.
Expected target files:
- `src/coding/monitor.ts`
- `src/coding/reporter.ts`
- `src/coding/manager.ts`
- `src/__tests__/coding/monitor-recovery.test.ts`

### ⬜ Unit 3c: Monitoring/recovery coverage hardening
**What**: Cover all monitor/recovery branches (idle, blocked, stalled, crash restart, exhausted retries).
**Output**: `unit-3c-coverage.log`.
**Acceptance**: 100% coverage for Unit 3 modules.

### ⬜ Unit 4a: End-to-end coding pipeline test (Red)
**What**: Add failing integration test that drives a simulated coding session through planner → doer → merger orchestration flow and verifies progress reporting.
**Output**: Red tests + `unit-4a-red.log`.
**Acceptance**: End-to-end orchestration test fails before final integration.

### ⬜ Unit 4b: End-to-end orchestration implementation + verification (Green)
**What**: Implement remaining integration glue for full coding pipeline orchestration and recovery semantics.
**Output**: `unit-4b-green.log` + `unit-4b-npm-test.log` + `unit-4b-tsc.log`.
**Acceptance**: End-to-end pipeline passes and global verification commands are green.

### ⬜ Unit 4c: Final coverage + checklist sync
**What**: Run final coverage gate and sync Gate 11 completion checklists in doing/planning docs.
**Output**: `unit-4c-coverage.log` + doc updates.
**Acceptance**: 100% coverage on all new Gate 11 code with traceable artifacts.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each unit
- Push after each unit complete
- Run full test suite before marking implementation units done
- **All artifacts**: Save outputs/logs under `./self-perpetuating-working-dir/2026-03-05-2332-doing-gate-11-coding-tool-mastery/`
- **Fixes/blockers**: Spawn sub-agent for simple fix loops; only stop for real requirement blockers
- **Decision updates**: Record coding session orchestration/tool contracts in docs immediately

## Progress Log
- 2026-03-05 23:32 Created from Gate 11 section of approved planning doc
- 2026-03-05 23:33 Granularity pass: verified each unit is atomic, testable, and scoped to a single session
- 2026-03-05 23:33 Validation pass: confirmed existing wiring seams (`src/repertoire/tools-base.ts`, `src/repertoire/tools.ts`, `src/tasks/index.ts`) and target new `src/coding/` module surfaces
- 2026-03-05 23:33 Quality pass: verified checklist/testability completeness and emoji status headers across all units
