# Unit 0 Baseline: Gate 11 Coding Tool Mastery

## Existing seams validated
- `src/repertoire/tools-base.ts`: base tool schema + handler registry where `coding_*` tools will be added
- `src/repertoire/tools.ts`: channel-aware tool exposure + `execTool` runtime dispatch and arg summaries
- `src/tasks/index.ts`: task module hooks available for `taskRef` alignment and pipeline context
- `src/daemon/*`: process-management patterns available as reference for lifecycle/restart semantics

## Gate 11 target module surfaces
- `src/coding/types.ts`: session/request/status/result types
- `src/coding/spawner.ts`: external coding process spawn contract (`claude`/`codex`)
- `src/coding/manager.ts`: registry, lifecycle state, restart/stall recovery, context resume
- `src/coding/monitor.ts`: progress/stall/completion detection from stdout
- `src/coding/reporter.ts`: list/detail renderers for agent-facing status output
- `src/coding/tools.ts`: model-callable handlers (`coding_spawn`, `coding_status`, `coding_send_input`, `coding_kill`)
- `src/coding/index.ts`: singleton accessor and reset hook for runtime/tests

## Test plan surfaces
- `src/__tests__/coding/session-manager.test.ts`
- `src/__tests__/coding/tools-coding.test.ts`
- `src/__tests__/coding/monitor-recovery.test.ts`
- `src/__tests__/coding/pipeline-e2e.test.ts`

## Integration constraints carried forward
- No environment-variable-based feature toggles introduced
- All new executable files emit nerves events for audit expectations
- 100% coverage required on all new Gate 11 files
