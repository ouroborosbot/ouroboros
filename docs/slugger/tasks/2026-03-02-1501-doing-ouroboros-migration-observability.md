# Doing: Ouroboros Migration — Observability (Phase 2)

**Status**: drafting
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
- [ ] NDJSON (`json`) is the canonical log format with configurable `logging.level` and dual sinks for this phase (`stderr` + session-style file).
- [ ] All structured events use required envelope fields: `ts`, `level`, `event`, `trace_id`, `component`, `message`, `meta`.
- [ ] Sink abstraction exists and routes each event to configured sinks without instrumentation-site changes.
- [ ] File sink persists append-only NDJSON events at `~/.agentconfigs/<agent>/logs/<channel>/<sanitizeKey(key)>.ndjson` without truncating per turn, using session-key parity (CLI=`session`, Teams=`conversationId`).
- [ ] Runtime paths across `src/` emit event-level structured logs with no chunk-level or sensitive-payload dumps.
- [ ] Minimum component event catalog is implemented and exercised in tests (entrypoints/channels/engine including `src/engine/kicks.ts`/mind/tools/config/identity/clients/repertoire).
- [ ] Trace IDs are generated at turn entry and propagated through core execution.
- [ ] Existing ad-hoc operational logging in scoped runtime files is replaced or wrapped by structured logging.
- [ ] Tests cover new observability code and instrumentation behavior.
- [ ] `npm run audit:observability` exists and fails when required event coverage, schema/policy checks, or declared logpoint coverage is incomplete.
- [ ] Observability coverage report artifact is produced with measurable results for: event-catalog coverage, schema/redaction compliance, and logpoint coverage.
- [ ] CI enforces `npm run audit:observability` as a required gate for this phase.
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
**What**: Audit current runtime logging behavior and map required structured events, envelope fields, sink abstraction/fan-out design, and target files under `src/` (`stderr` + session-style file pathing).
**Output**: Baseline event/instrumentation matrix at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-0-baseline-matrix.md`.
**Acceptance**: Matrix covers required envelope, minimum event catalog, target runtime files (including merged `src/wardrobe/phrases.ts` and `src/wardrobe/format.ts`), and file sink path/key contract `~/.agentconfigs/<agent>/logs/<channel>/<sanitizeKey(key)>.ndjson` (CLI=`session`, Teams=`conversationId`).

### ⬜ Unit 1a: Observability Core Module — Red
**What**: Add failing tests for structured logger/trace primitives, required envelope fields, NDJSON shape, `logging.level`, sink abstraction behavior, and sink fan-out (`stderr` + append-only file sink) in `src/__tests__/observability/*.test.ts`.
**Output**: New failing observability tests and red run artifact at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-1a-red-run.txt`.
**Acceptance**: Tests fail for missing `src/observability/` module and missing envelope/config/sink persistence behavior.

### ⬜ Unit 1b: Observability Core Module — Green
**What**: Implement `src/observability/` logger and trace helpers (factory + event helpers) with sink abstraction and fan-out to `stderr` and append-only file persistence.
**Output**: New module files under `src/observability/` and updated tests.
**Acceptance**: Unit 1a tests pass with required envelope fields, configurable `logging.level`, sink abstraction, and append-only file writes to the session-style path.

### ⬜ Unit 1c: Observability Core Module — Coverage & Refactor
**What**: Refactor if needed and verify 100% coverage for new observability module code.
**Output**: Coverage verification note at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-1c-coverage.md`.
**Acceptance**: New observability module code is fully covered and tests remain green.

### ⬜ Unit 2a: Trace Propagation (Entrypoints/Core) — Red
**What**: Add failing tests proving trace IDs are created at turn entry boundaries in `src/channels/cli.ts` and `src/channels/teams.ts` and propagated into `src/engine/core.ts`.
**Output**: Failing trace propagation tests (channel + core suites) and red run artifact at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-2a-red-run.txt`.
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
**What**: Add failing tests for required event emissions (`*.start`, `*.end`, `*.error`) and envelope compliance in `src/engine/core.ts`, `src/engine/kicks.ts`, `src/mind/context.ts`, `src/mind/prompt.ts`, and `src/engine/tools*.ts`.
**Output**: Failing tests (engine/mind/tool suites, including `src/__tests__/engine/kicks.test.ts`) and red run artifact at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-3a-red-run.txt`.
**Acceptance**: Tests fail and identify missing event-level instrumentation for engine (core + kicks), mind, and tools.

### ⬜ Unit 3b: Engine/Mind/Tools Instrumentation — Green
**What**: Implement structured event logging for engine, mind, and tools with required envelope and no sensitive payload dumps.
**Output**: Updated `src/engine/core.ts`, `src/engine/kicks.ts`, `src/mind/context.ts`, `src/mind/prompt.ts`, `src/engine/tools.ts`, `src/engine/tools-base.ts`, `src/engine/tools-teams.ts` and passing tests.
**Acceptance**: Required engine/mind/tools catalog events are emitted with required fields (including `src/engine/kicks.ts`) and tests pass.

### ⬜ Unit 3c: Engine/Mind/Tools Instrumentation — Coverage & Refactor
**What**: Refactor instrumentation helpers/call sites and verify full coverage on new code.
**Output**: Coverage note at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-3c-coverage.md`.
**Acceptance**: New instrumentation paths are fully covered and tests remain green.

### ⬜ Unit 4a: Channel Instrumentation Contract — Red
**What**: Add failing tests for CLI/Teams ensuring user-facing output remains channel-native while diagnostics route through structured logger (`src/__tests__/channels/cli*.test.ts`, `src/__tests__/channels/teams.test.ts`, `src/__tests__/wardrobe/format.test.ts`).
**Output**: Failing channel contract tests and red run artifact at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-4a-red-run.txt`.
**Acceptance**: Tests fail before implementation and demonstrate contract violations.

### ⬜ Unit 4b: Channel Instrumentation Contract — Green
**What**: Implement channel instrumentation to satisfy cross-channel contract and event catalog expectations.
**Output**: Updated `src/channels/cli.ts`, `src/channels/teams.ts`, `src/wardrobe/format.ts` and passing tests.
**Acceptance**: Tests confirm channel UX remains native, operational diagnostics are structured logger events, and `src/wardrobe/format.ts` emits `component=channels` events.

### ⬜ Unit 4c: Channel Instrumentation Contract — Coverage & Refactor
**What**: Refactor channel instrumentation and verify coverage on newly introduced branches/error paths.
**Output**: Coverage note at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-4c-coverage.md`.
**Acceptance**: Channel instrumentation new code is fully covered and tests remain green.

### ⬜ Unit 5a: Config/Identity/Clients/Repertoire/Wardrobe Instrumentation — Red
**What**: Add failing tests for minimum event catalog coverage in `src/config.ts`, `src/identity.ts`, `src/engine/ado-client.ts`, `src/engine/graph-client.ts`, `src/repertoire/*`, and `src/wardrobe/phrases.ts`.
**Output**: Failing tests (`src/__tests__/config.test.ts`, `src/__tests__/identity.test.ts`, `src/__tests__/engine/*client.test.ts`, `src/__tests__/repertoire/*.test.ts`, `src/__tests__/wardrobe/phrases.test.ts`) and red run artifact at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-5a-red-run.txt`.
**Acceptance**: Tests fail and enumerate missing component-level events before implementation.

### ⬜ Unit 5b: Config/Identity/Clients/Repertoire/Wardrobe Instrumentation — Green
**What**: Implement required structured event logging for config, identity, client requests, and repertoire load paths, including config helpers needed for session-style logs directory/path resolution.
**Output**: Updated `src/config.ts`, `src/identity.ts`, `src/engine/ado-client.ts`, `src/engine/graph-client.ts`, `src/repertoire/commands.ts`, `src/repertoire/skills.ts`, `src/wardrobe/phrases.ts` and passing tests.
**Acceptance**: Required component events are emitted with required envelope, session-style log path resolution works, `src/wardrobe/phrases.ts` emits `component=repertoire` events, and tests pass.

### ⬜ Unit 5c: Config/Identity/Clients/Repertoire/Wardrobe Instrumentation — Coverage & Refactor
**What**: Refactor for consistency and verify complete coverage on new code paths.
**Output**: Coverage note at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-5c-coverage.md`.
**Acceptance**: New config/identity/clients/repertoire instrumentation code is fully covered and tests remain green.

### ⬜ Unit 6a: Observability Coverage Gate — Red
**What**: Add failing tests/fixtures for observability coverage auditing (missing required events/logpoints, schema violations, redaction violations) and baseline `audit:observability` failure behavior.
**Output**: Failing audit evidence at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-6a-red-run.txt`.
**Acceptance**: Audit fails before implementation and clearly reports failing dimensions (event-catalog, schema/redaction, logpoint coverage).

### ⬜ Unit 6b: Observability Coverage Gate — Green
**What**: Implement machine-readable coverage contract and audit pipeline (`src/observability/coverage/*` + `npm run audit:observability`) and integrate with CI workflow.
**Output**: Coverage contract/audit tooling plus CI workflow update and implementation notes at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-6b-audit-gate.md`.
**Acceptance**: `npm run audit:observability` passes with full required coverage dimensions and CI contains an explicit audit step.

### ⬜ Unit 6c: Observability Coverage Gate — Verify
**What**: Run the observability audit and produce parseable metrics artifact for automated consumers.
**Output**: Observability coverage report at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-6c-observability-coverage.json` and verification note.
**Acceptance**: Report includes measurable values for event-catalog coverage, schema/redaction compliance, and logpoint coverage; no unresolved gaps.

### ⬜ Unit 7a: End-to-End Event Catalog Verification
**What**: Run targeted and full test suites validating minimum event catalog coverage, required envelope fields, and persisted append-only NDJSON outputs.
**Output**: Verification matrix at `./2026-03-02-1501-doing-ouroboros-migration-observability/unit-7a-event-catalog-verify.md`.
**Acceptance**: Matrix confirms each required event is covered by tests, persisted files are parseable NDJSON, and no unresolved gaps remain.

### ⬜ Unit 7b: Final Quality Gate & Completion Audit
**What**: Run `npm run test`, `npm run test:coverage`, and `npm run build`, then audit completion criteria line-by-line.
**Output**: Final run artifacts (`final-test-output.txt`, `final-coverage-output.txt`, `final-build-output.txt`) and audit checklist at `./2026-03-02-1501-doing-ouroboros-migration-observability/final-audit.md`.
**Acceptance**: All completion criteria are explicitly marked met with evidence and no warnings.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./[task-name]/` directory
- Artifact files listed in this doc are execution evidence only and are not runtime log sinks.
- Runtime observability sinks for this phase are `stderr` and session-style append-only NDJSON files; collision hardening remains out of scope.
- Persisted log key mapping is locked to session parity: CLI=`session`, Teams=`conversationId`.
- Observability coverage gating must run as `npm run audit:observability` and pass before unit/final completion.
- **Fixes/blockers**: Spawn sub-agent immediately — don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- [2026-03-02 15:50] Created from planning doc
- [2026-03-02 15:51] Granularity pass: split implementation into atomic red/green/coverage units by subsystem
- [2026-03-02 15:52] Validation pass: aligned units to concrete runtime/test files and current repo structure
- [2026-03-02 15:53] Quality pass: verified template completeness, acceptance coverage, and emoji headers; set status to READY_FOR_EXECUTION
- [2026-03-02 15:58] Clarified that artifact run files are evidence outputs only; runtime logging sink remains stderr-only in this phase
- [2026-03-02 16:05] Updated units/criteria for session-style append-only NDJSON persistence with dual sinks (`stderr` + file)
- [2026-03-02 16:12] Consistency cleanup: required sink abstraction + explicit key mapping; reset status to drafting pending re-review
- [2026-03-02 16:19] Pass 1 (first draft refresh): incorporated merged `origin/main` runtime/test path changes into work units
- [2026-03-02 16:17] Pass 2 (granularity): clarified Unit 5 ownership to include wardrobe scope without additional unit splits
- [2026-03-02 16:18] Pass 3 (validation): aligned wardrobe component mapping in acceptance criteria with planning decisions and merged codebase
- [2026-03-02 16:18] Pass 4 (quality): verified template completeness, acceptance coverage, and emoji headers; set status to READY_FOR_EXECUTION
- [2026-03-02 16:37] Explicitly added `src/engine/kicks.ts` + `src/__tests__/engine/kicks.test.ts` to Unit 3 and completion criteria
- [2026-03-02 16:56] Added explicit observability-coverage gate units (`audit:observability`, CI enforcement, machine-readable coverage report) and reset status to drafting for re-review
