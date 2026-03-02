# Doing: Ouroboros Migration — Observability (Phase 2)

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-02 15:50
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

### ⬜ Unit 1a: Observability Core Module — Red
**What**: Add failing tests for structured logger/trace primitives, required envelope fields, NDJSON shape, and `logging.level` behavior (new `src/__tests__/observability/*.test.ts`).
**Output**: New failing observability tests and red run log at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-1a-red.log`.
**Acceptance**: Tests fail for missing `src/observability/` module and missing required envelope/config behavior.

### ⬜ Unit 1b: Observability Core Module — Green
**What**: Implement `src/observability/` logger and trace helpers (factory + event helpers) to satisfy Unit 1a tests.
**Output**: New module files under `src/observability/` and updated tests.
**Acceptance**: Unit 1a tests pass with required envelope fields and configurable `logging.level`.

### ⬜ Unit 1c: Observability Core Module — Coverage & Refactor
**What**: Refactor if needed and verify 100% coverage for new observability module code.
**Output**: Coverage verification note at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-1c-coverage.md`.
**Acceptance**: New observability module code is fully covered and tests remain green.

### ⬜ Unit 2a: Trace Propagation (Entrypoints/Core) — Red
**What**: Add failing tests proving trace IDs are created at turn entry boundaries in `src/channels/cli.ts` and `src/channels/teams.ts` and propagated into `src/engine/core.ts`.
**Output**: Failing trace propagation tests (channel + core suites) and red log at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-2a-red.log`.
**Acceptance**: Tests fail before implementation and explicitly show missing trace propagation behavior.

### ⬜ Unit 2b: Trace Propagation (Entrypoints/Core) — Green
**What**: Implement trace ID generation and propagation through `src/channels/cli.ts`, `src/channels/teams.ts`, and `src/engine/core.ts`.
**Output**: Updated runtime code and passing trace propagation tests.
**Acceptance**: Tests confirm trace IDs are generated once per turn and propagated through execution.

### ⬜ Unit 2c: Trace Propagation (Entrypoints/Core) — Coverage & Refactor
**What**: Refactor trace plumbing as needed and verify coverage for new paths.
**Output**: Coverage note at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-2c-coverage.md`.
**Acceptance**: Trace propagation code paths are fully covered and tests remain green.

### ⬜ Unit 3a: Engine/Mind/Tools Instrumentation — Red
**What**: Add failing tests for required event emissions (`*.start`, `*.end`, `*.error`) and envelope compliance in `src/engine/core.ts`, `src/mind/context.ts`, `src/mind/prompt.ts`, and `src/engine/tools*.ts`.
**Output**: Failing tests (engine/mind/tool suites) and red log at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-3a-red.log`.
**Acceptance**: Tests fail and identify missing event-level instrumentation for engine/mind/tools.

### ⬜ Unit 3b: Engine/Mind/Tools Instrumentation — Green
**What**: Implement structured event logging for engine, mind, and tools with required envelope and no sensitive payload dumps.
**Output**: Updated `src/engine/core.ts`, `src/mind/context.ts`, `src/mind/prompt.ts`, `src/engine/tools.ts`, `src/engine/tools-base.ts`, `src/engine/tools-teams.ts` and passing tests.
**Acceptance**: Required engine/mind/tools catalog events are emitted with required fields and tests pass.

### ⬜ Unit 3c: Engine/Mind/Tools Instrumentation — Coverage & Refactor
**What**: Refactor instrumentation helpers/call sites and verify full coverage on new code.
**Output**: Coverage note at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-3c-coverage.md`.
**Acceptance**: New instrumentation paths are fully covered and tests remain green.

### ⬜ Unit 4a: Channel Instrumentation Contract — Red
**What**: Add failing tests for CLI/Teams ensuring user-facing output remains channel-native while diagnostics route through structured logger (`src/__tests__/channels/cli*.test.ts`, `src/__tests__/channels/teams.test.ts`).
**Output**: Failing channel contract tests and red log at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-4a-red.log`.
**Acceptance**: Tests fail before implementation and demonstrate contract violations.

### ⬜ Unit 4b: Channel Instrumentation Contract — Green
**What**: Implement channel instrumentation to satisfy cross-channel contract and event catalog expectations.
**Output**: Updated channel code and passing tests.
**Acceptance**: Tests confirm channel UX remains native and operational diagnostics are structured logger events.

### ⬜ Unit 4c: Channel Instrumentation Contract — Coverage & Refactor
**What**: Refactor channel instrumentation and verify coverage on newly introduced branches/error paths.
**Output**: Coverage note at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-4c-coverage.md`.
**Acceptance**: Channel instrumentation new code is fully covered and tests remain green.

### ⬜ Unit 5a: Config/Identity/Clients/Repertoire Instrumentation — Red
**What**: Add failing tests for minimum event catalog coverage in `src/config.ts`, `src/identity.ts`, `src/engine/ado-client.ts`, `src/engine/graph-client.ts`, and `src/repertoire/*`.
**Output**: Failing tests (`src/__tests__/config.test.ts`, `src/__tests__/identity.test.ts`, `src/__tests__/engine/*client.test.ts`, `src/__tests__/repertoire/*.test.ts`) and red log at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-5a-red.log`.
**Acceptance**: Tests fail and enumerate missing component-level events before implementation.

### ⬜ Unit 5b: Config/Identity/Clients/Repertoire Instrumentation — Green
**What**: Implement required structured event logging for config, identity, client requests, and repertoire load paths.
**Output**: Updated `src/config.ts`, `src/identity.ts`, `src/engine/ado-client.ts`, `src/engine/graph-client.ts`, `src/repertoire/commands.ts`, `src/repertoire/phrases.ts`, `src/repertoire/skills.ts` and passing tests.
**Acceptance**: Required component events are emitted with required envelope and tests pass.

### ⬜ Unit 5c: Config/Identity/Clients/Repertoire Instrumentation — Coverage & Refactor
**What**: Refactor for consistency and verify complete coverage on new code paths.
**Output**: Coverage note at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-5c-coverage.md`.
**Acceptance**: New config/identity/clients/repertoire instrumentation code is fully covered and tests remain green.

### ⬜ Unit 6a: End-to-End Event Catalog Verification
**What**: Run targeted and full test suites validating minimum event catalog coverage and required envelope fields across components.
**Output**: Verification matrix at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-6a-event-catalog-verify.md`.
**Acceptance**: Matrix confirms each required event is covered by tests with no unresolved gaps.

### ⬜ Unit 6b: Final Quality Gate & Completion Audit
**What**: Run `npm run test`, `npm run test:coverage`, and `npm run build`, then audit completion criteria line-by-line.
**Output**: Final logs (`final-test.log`, `final-coverage.log`, `final-build.log`) and audit checklist at `./2026-03-02-1501-doing-ouroboros-migration-observability/final-audit.md`.
**Acceptance**: All completion criteria are explicitly marked met with evidence and no warnings.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./[task-name]/` directory
- **Fixes/blockers**: Spawn sub-agent immediately — don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- [2026-03-02 15:50] Created from planning doc
- [2026-03-02 15:51] Granularity pass: split implementation into atomic red/green/coverage units by subsystem
- [2026-03-02 15:52] Validation pass: aligned units to concrete runtime/test files and current repo structure
- [2026-03-02 15:53] Quality pass: verified template completeness, acceptance coverage, and emoji headers; set status to READY_FOR_EXECUTION
