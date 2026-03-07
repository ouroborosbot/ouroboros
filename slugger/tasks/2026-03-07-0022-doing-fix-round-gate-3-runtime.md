# Doing: Fix Round Gate 3 Runtime Core

**Status**: in_progress
**Execution Mode**: direct
**Created**: 2026-03-07 00:22
**Planning**: ./2026-03-07-0022-planning-fix-round-gate-3-runtime.md
**Artifacts**: ./2026-03-07-0022-doing-fix-round-gate-3-runtime/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Implement Gate 3 runtime-core architecture: unified agent process entrypoint, daemon CLI command-plane rewrite, `ouro msg`/`ouro poke` routing, coding spawner + session persistence updates, task-driven scheduler reconciliation, and observability upgrades.

## Completion Criteria
- [x] Daemon CLI command surface matches Gate 3 contract (`up`, `stop`, `status`, `logs`, `chat`, `msg`, `hatch`)
- [x] Daemon command plane supports `chat.connect`, `message.send`, `message.poll`, and `task.poke` paths used by new CLI commands
- [x] Unified agent entrypoint replaces inner-worker-only startup contract
- [ ] Coding spawner removes `subagent`, uses `--cd` for codex, stream-json flags for claude, and richer failure diagnostics
- [ ] Coding session manager persists and reloads session state
- [ ] Task-driven schedule reconciliation + `ouro poke` forwarding implemented with tests
- [ ] Human-readable terminal logging + configurable sink wiring implemented
- [ ] Subagent auto-installation on `ouro up` implemented and tested
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

### ✅ Unit 0: Baseline Runtime Snapshot
**What**: Capture Gate 3 baseline snapshots for daemon CLI command parsing, daemon command handlers, coding spawn contract, and agent entrypoint paths.
**Output**: Baseline artifact files under artifacts directory.
**Acceptance**: Baseline artifacts clearly map pre-change behavior for each Gate 3 surface.

### ✅ Unit 1: Daemon CLI And Command Plane Rewrite
**What**: Rewrite daemon CLI parsing/default flows and daemon command dispatch to Gate 3 contract (`up/stop/status/logs/chat/msg/hatch`, `chat.connect`, `task.poke`), including idempotent `up` and reliable `stop` response handling.
**Output**: Updated daemon CLI + daemon command handling with focused tests.
**Acceptance**: Daemon CLI and daemon command-plane suites pass and enforce new contract.

### ✅ Unit 2: Unified Agent Entry And Event Sources
**What**: Rework inner-worker entry path into unified agent process entry behavior (chat/messages/task poke/heartbeat wake model), preserving deterministic startup and wiring needed by daemon.
**Output**: Updated entrypoint/runtime integration with tests covering event-source handling.
**Acceptance**: Runtime starts through unified entrypoint and can process poke/message triggers in tests.

### ✅ Unit 3: `ouro msg` Routing + Pending Fallback
**What**: Implement `ouro msg` daemon routing with fallback to pending inbox file when socket is unavailable, plus daemon boot-drain behavior.
**Output**: CLI/daemon/message-router updates and tests for success/fallback/drain scenarios.
**Acceptance**: Message command is deterministic and fallback path is covered by tests.

### ⬜ Unit 4: Coding Spawner + Session Persistence Rewrite
**What**: Update coding request schema/tooling to remove `subagent`, patch runner args (`--cd`, stream-json), include richer failure diagnostics, and persist/reload coding session manager state.
**Output**: Updated coding types/tools/spawner/manager with tests.
**Acceptance**: Coding suites validate new request contract, spawn args, and persisted session recovery.

### ⬜ Unit 5: Task-Driven Scheduling + `ouro poke`
**What**: Implement task frontmatter schedule reconciliation hooks and `ouro poke` forwarding from daemon to agent process, including `lastRun` updates.
**Output**: Scheduling/reconciliation modules and daemon integration tests.
**Acceptance**: Habit/scheduled task frontmatter drives scheduling actions in tests; poke path is verified.

### ⬜ Unit 6: Observability + Subagent Auto-Install
**What**: Add human-readable terminal log formatting and configurable sink selection; implement `ouro up` subagent auto-installation for detected Claude/Codex CLIs.
**Output**: Logger/runtime/daemon wiring + install helper tests.
**Acceptance**: Terminal formatting and installer behavior are covered and passing.

### ⬜ Unit 7: Full Verification
**What**: Run full validation (`npm test`, `npm run build`, `npm run test:coverage`) and stale-reference scans for removed Gate 3 contracts (`subagent` arg, `--cwd`, old CLI commands).
**Output**: Verification logs + stale reference scan artifacts.
**Acceptance**: Full suite/build/coverage pass with no warnings and no stale Gate 3 contract references in production code.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each unit completion
- Push after each unit complete
- Run full relevant tests before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-07-0022-doing-fix-round-gate-3-runtime/` directory
- **Fixes/blockers**: Resolve autonomously; only block on hard external impossibility

## Progress Log
- 2026-03-07 00:22 Created from planning doc.
- 2026-03-07 00:24 Unit 0 complete: Captured baseline daemon CLI/command-plane, coding spawn contract, and runtime entrypoint snapshots.
- 2026-03-07 00:30 Unit 1 complete: Rewrote CLI command parsing/execution to Gate 3 primary surface (`up/stop/status/logs/chat/msg/poke/hatch`), added idempotent liveness checks + stale socket cleanup, and added daemon command handlers for `daemon.logs`, `chat.connect`, `task.poke`, and `hatch.start` with passing daemon suites.
- 2026-03-07 00:33 Unit 2 complete: Added unified `heart/agent-entry` runtime entrypoint, switched daemon-managed agents to `heart/agent-entry.js`, and extended worker event handling so `poke`/`chat`/`message` inputs trigger active turn cycles.
- 2026-03-07 00:36 Unit 3 complete: Added `ouro msg` socket-failure fallback to `<bundle>/inbox/pending.jsonl`, extended routed message schema with `sessionId`/`taskRef`, and added daemon startup drain of pending bundle inbox lines back into the live message router.
