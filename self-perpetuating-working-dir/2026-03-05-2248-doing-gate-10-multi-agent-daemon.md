# Doing: Gate 10 Multi-Agent Daemon

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-05 22:48
**Planning**: ./self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md
**Artifacts**: ./self-perpetuating-working-dir/2026-03-05-2248-doing-gate-10-multi-agent-daemon/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Stand up a multi-agent daemon that keeps agents alive with crash recovery, exposes `ouro` CLI controls, runs recurring cron jobs, routes inter-agent messages, maintains isolated per-agent repo workspaces, and emits tiered health alerts.

## Completion Criteria
- [ ] Daemon supervises agent processes with crash recovery
- [ ] `ouro` CLI works for daemon and agent management
- [ ] Cron scheduling triggers recurring tasks
- [ ] Inter-agent messaging delivers between agents
- [ ] Each agent works in its own repo clone (isolated git state, synced with upstream)
- [ ] Health monitoring with tiered alert routing
- [ ] Agents stay up unless explicitly stopped
- [ ] `npm test` green
- [ ] 100% coverage on new code

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values
- Use integration-style tests with real child processes and short timeouts for restart behavior

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

### ✅ Unit 0: Baseline + daemon surface mapping
**What**: Map current supervisor/entrypoint/runtime touchpoints and define Gate 10 target file surfaces for daemon, CLI, scheduler, routing, and workspace isolation.
**Output**: `unit-0-baseline.md`.
**Acceptance**: Artifact names concrete implementation/test files and command surfaces used for Gate 10.
Validated touchpoints:
- `src/supervisor.ts` + `src/supervisor-entry-core.ts` (existing restart/lifecycle baseline)
- `src/repertoire/tools-base.ts` (possible daemon/coding tool exposure seam)
- `src/identity.ts` (`~/AgentBundles` source of truth + agent identity resolution)
- `package.json` scripts (`supervisor` baseline and new `ouro` command surface)

### ✅ Unit 1a: Process manager + workspace isolation tests (Red)
**What**: Add failing tests for daemon process lifecycle (start/stop/restart/backoff) and per-agent workspace clone/sync behavior.
**Output**: Red tests + `unit-1a-red.log`.
**Acceptance**: Tests fail before implementation and encode crash recovery + isolated workspace requirements.

### ✅ Unit 1b: Process manager + workspace implementation (Green)
**What**: Implement daemon process manager with restart/backoff and workspace clone manager that ensures `~/AgentWorkspaces/<agent>/` exists and syncs from upstream.
**Output**: Implementation + `unit-1b-green.log` + `unit-1b-tsc.log`.
**Acceptance**: Unit 1a tests pass and process/workspace modules compile cleanly.
Expected target files:
- `src/daemon/process-manager.ts`
- `src/daemon/workspaces.ts`
- `src/__tests__/daemon/process-manager.test.ts`

### ✅ Unit 1c: Process/workspace coverage hardening
**What**: Close branch/error-path coverage gaps in process/workspace modules and refactor for deterministic behavior.
**Output**: `unit-1c-coverage.log`.
**Acceptance**: 100% coverage on Unit 1 modules with suite green.

### ✅ Unit 2a: Daemon command plane tests (Red)
**What**: Add failing tests for daemon command socket protocol and `ouro` CLI commands (`start`, `stop`, `status`, `agent start/stop/restart`, `cron list/trigger`, `health`), including invalid-command and malformed-payload branches.
**Output**: Red tests + `unit-2a-red.log`.
**Acceptance**: Tests fail before implementation and capture daemon/CLI command contract.

### ✅ Unit 2b: Daemon core + `ouro` CLI implementation (Green)
**What**: Implement daemon runtime, command socket handlers, and CLI adapter/entrypoint for daemon and per-agent management.
**Output**: Implementation + `unit-2b-green.log` + `unit-2b-tsc.log`.
**Acceptance**: Unit 2a tests pass and `ouro` command surface is operational in tests.
Expected target files:
- `src/daemon/daemon.ts`
- `src/daemon/daemon-cli.ts`
- `src/daemon/daemon-entry.ts`
- `src/__tests__/daemon/daemon-cli.test.ts`
- `package.json` (`ouro` script)

### ✅ Unit 2c: Command plane coverage + refactor
**What**: Close daemon/CLI coverage gaps (including malformed command and socket edge branches) and simplify command handling internals.
**Output**: `unit-2c-coverage.log`.
**Acceptance**: 100% coverage for daemon command plane code.

### ✅ Unit 3a: Cron/router/health tests (Red)
**What**: Add failing tests for cron trigger execution, inter-agent inbox delivery, and tiered health alert routing.
**Output**: Red tests + `unit-3a-red.log`.
**Acceptance**: Tests fail before implementation and encode recurring-task and alert-routing behavior.

### ⬜ Unit 3b: Cron/router/health implementation (Green)
**What**: Implement cron scheduler, file-based message router, and health monitor integration with warn/critical routing semantics.
**Output**: Implementation + `unit-3b-green.log` + `unit-3b-tsc.log`.
**Acceptance**: Unit 3a tests pass and modules integrate with daemon runtime.
Expected target files:
- `src/daemon/cron-scheduler.ts`
- `src/daemon/message-router.ts`
- `src/daemon/health-monitor.ts`
- `src/__tests__/daemon/cron-router-health.test.ts`

### ⬜ Unit 3c: Cron/router/health coverage hardening
**What**: Cover all remaining branches and error paths in scheduler/router/health modules and refactor for maintainability.
**Output**: `unit-3c-coverage.log`.
**Acceptance**: 100% coverage on Unit 3 code and full suite remains green.

### ⬜ Unit 4a: End-to-end daemon lifecycle tests (Red)
**What**: Add failing end-to-end tests covering daemon startup, agent restart behavior, command interactions, cron trigger path, and message flow.
**Output**: Red tests + `unit-4a-red.log`.
**Acceptance**: E2E tests fail before final integration completion.

### ⬜ Unit 4b: End-to-end lifecycle implementation + verification (Green)
**What**: Implement any remaining integration glue, verify completion criteria behavior, and run gate-level verification.
**Output**: `unit-4b-green.log` + `unit-4b-npm-test.log` + `unit-4b-tsc.log`.
**Acceptance**: E2E lifecycle passes with `npm test` green and `npx tsc --noEmit` clean.

### ⬜ Unit 4c: Final coverage + checklist sync
**What**: Run coverage gate, capture artifacts, and sync Gate 10 completion checklists in doing/planning docs.
**Output**: `unit-4c-coverage.log` + doc updates.
**Acceptance**: 100% coverage on new code with traceable completion evidence.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each unit
- Push after each unit complete
- Run full test suite before marking implementation units done
- **All artifacts**: Save outputs/logs under `./self-perpetuating-working-dir/2026-03-05-2248-doing-gate-10-multi-agent-daemon/`
- **Fixes/blockers**: Spawn sub-agent for simple fix loops; only stop for real requirement blockers
- **Decision updates**: Record daemon/command/workspace contracts in docs immediately

## Progress Log
- 2026-03-05 22:48 Created from Gate 10 section of approved planning doc
- 2026-03-05 22:49 Granularity pass: added concrete baseline touchpoints and command-plane branch expectations
- 2026-03-05 22:50 Validation pass: pinned Gate 10 target implementation and test files to existing repo conventions
- 2026-03-05 22:50 Quality pass: confirmed emoji headers, testable acceptance criteria, and coverage requirements for every unit
- 2026-03-05 22:53 Unit 0 complete: captured supervisor baseline and concrete daemon module/test target map
- 2026-03-05 22:53 Unit 1a complete: added failing process-manager/workspace-isolation tests and captured red log
- 2026-03-05 22:55 Unit 1b complete: implemented daemon process manager and workspace clone/sync with green tests and clean compile
- 2026-03-05 22:59 Unit 1c complete: added branch/error/default-dependency tests and reached 100% coverage for Unit 1 daemon modules
- 2026-03-05 23:00 Unit 2a complete: added failing daemon command-plane/CLI protocol tests and captured red log
- 2026-03-05 23:03 Unit 2b complete: implemented daemon command server + `ouro` CLI entry/scripts with green tests and clean compile
- 2026-03-05 23:12 Unit 2c complete: expanded command-plane branch tests and reached 100% coverage for daemon/CLI modules
- 2026-03-05 23:13 Unit 3a complete: added failing cron scheduler/message router/health monitor tests and captured red log
