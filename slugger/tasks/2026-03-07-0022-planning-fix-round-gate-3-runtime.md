# Planning: Fix Round Gate 3 Runtime Core

**Status**: approved
**Created**: 2026-03-07 00:22

## Goal
Implement the Gate 3 runtime architecture changes so daemon operations, agent process orchestration, coding session spawning, and task-driven scheduling follow the unified event-driven contract from the master planning doc.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Unified agent runtime entrypoint and event model wiring for chat/messages/task poke handling
- Daemon CLI surface rewrite to primary command contract (`up`, `stop`, `status`, `logs`, `chat`, `msg`, `hatch` stub)
- `ouro msg` + `ouro poke` command plumbing through daemon command plane/message router
- Coding spawner contract rewrite (`--cd`, stream-json for claude, no subagent arg, richer failure diagnostics)
- Coding session persistence so manager state survives restart
- Task-driven schedule reconciliation using task frontmatter (`cadence`, `scheduledAt`, `lastRun`) with OS scheduler hook points
- Nerves operator-observability fixes: human-readable terminal formatting and configurable sink wiring
- Subagent auto-installation from `subagents/` to detected CLI skill directories on `ouro up`
- Runtime and contract tests for all changed surfaces

### Out of Scope
- Gate 4 trust/memory tool additions (`memory_save`, `get_friend_note`, stranger gating)
- Gate 5 source tree reorganization moves
- Gate 6 first-run/adoption specialist/hatchling creation flow
- Gate 7 docs deliverables and skipped-tests audit finalization

## Completion Criteria
- [ ] `ouro up`, `ouro stop`, `ouro status` operate on the new command plane and pass tests
- [ ] `ouro msg` and `ouro poke` commands route through daemon and are validated end-to-end in tests
- [ ] Unified agent entrypoint/event loop path replaces inner-worker-only contract
- [ ] Coding spawner uses Gate 3 runner args and diagnostics contract (no `subagent` argument)
- [ ] Coding session manager persists session state and reload behavior is covered
- [ ] Task-driven scheduling reconciliation surfaces are implemented and tested
- [ ] Terminal logging is human-readable and sink configuration is runtime-selectable
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions
- [x] None. Gate 3 decisions are fixed by the master planning doc and subsystem audit.

## Decisions Made
- Treat the master planning doc execution-gate contract as authoritative for all runtime behavior changes.
- Keep Gate 3 focused on runtime architecture and operator interfaces; defer non-runtime scope to subsequent gates.

## Context / References
- /Users/arimendelow/AgentBundles/slugger.ouro/tasks/2026-03-06-1505-planning-hands-on-fix-round-and-post-fix-validation.md (Subsystem Audit + Gate 3 section)
- src/daemon/{daemon-cli.ts,daemon.ts,daemon-entry.ts,message-router.ts,process-manager.ts}
- src/inner-worker-entry.ts and src/senses/{inner-dialog-worker.ts,inner-dialog.ts}
- src/coding/{spawner.ts,manager.ts,types.ts,tools.ts}
- src/tasks/{scanner.ts,index.ts,types.ts}
- src/nerves/{index.ts,runtime.ts} and src/senses/cli-logging.ts

## Notes
Gate 3 has the highest runtime blast radius; execute with small TDD slices and keep daemon/CLI protocol assertions explicit in tests before implementation changes.

## Progress Log
- 2026-03-07 00:22 Created and approved for execution per pre-approved gate plan.
