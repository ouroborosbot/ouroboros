# Doing: Ouroboros Migration — Observability (Phase 2)

**Status**: drafting
**Execution Mode**: direct
**Created**: 2026-03-02 15:01
**Planning**: ./2026-03-02-1501-planning-ouroboros-migration-observability.md
**Artifacts**: ./2026-03-02-1501-doing-ouroboros-migration-observability/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Introduce a structured observability foundation (logger + trace IDs) so turn execution, tool behavior, and key engine/channel events are diagnosable without relying on ad-hoc `console` output.

## Completion Criteria
- [ ] `src/observability/` module exists with reusable logger + trace ID primitives.
- [ ] NDJSON (`json`) is the canonical log format with configurable `logging.level` and stderr sink for this phase.
- [ ] All structured events use required envelope fields: `ts`, `level`, `event`, `trace_id`, `component`, `message`, `meta`.
- [ ] Runtime paths across `src/` emit event-level structured logs with no chunk-level or sensitive-payload dumps.
- [ ] Minimum component event catalog is implemented and exercised in tests (entrypoints/channels/engine/mind/tools/config/identity/clients/repertoire).
- [ ] Trace IDs are generated at turn entry and propagated through core execution.
- [ ] Existing ad-hoc operational logging in scoped runtime files is replaced or wrapped by structured logging.
- [ ] Tests cover new observability code and instrumentation behavior.
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
**What**: Audit current runtime logging behavior and map required structured events, envelope fields, and target files under `src/`.
**Output**: Baseline event/instrumentation matrix at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-0-baseline-matrix.md`.
**Acceptance**: Matrix covers required envelope, minimum event catalog, and target runtime files before code changes.

### ⬜ Unit 1: Observability Foundation
**What**: Introduce shared observability primitives under `src/observability/` for machine-first NDJSON logging with configurable `logging.level` and trace helpers.
**Output**: New observability module plus baseline tests.
**Acceptance**: Logger/trace module compiles and targeted tests pass.

### ⬜ Unit 2: Trace Propagation
**What**: Generate trace IDs at turn entrypoints and propagate through execution flow.
**Output**: Entry and engine integration updates with tests.
**Acceptance**: Tests prove trace IDs are generated and propagated through core turn execution.

### ⬜ Unit 3: Runtime Instrumentation Coverage
**What**: Add event-level structured instrumentation across runtime components in scope while preserving channel-native user output.
**Output**: Instrumented runtime files and subsystem tests.
**Acceptance**: Required components emit structured events using required envelope fields without chunk-level/sensitive payload logging.

### ⬜ Unit 4: Verification & Completion Audit
**What**: Run full validation (test/build/coverage), verify event-catalog coverage, and audit completion criteria.
**Output**: Final verification artifacts and completion audit.
**Acceptance**: Completion criteria are fully met with linked evidence artifacts.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./[task-name]/` directory
- **Fixes/blockers**: Spawn sub-agent immediately — don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- [2026-03-02 15:01] Created from planning doc
