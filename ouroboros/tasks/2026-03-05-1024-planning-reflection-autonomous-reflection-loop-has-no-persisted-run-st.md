# Reflection Proposal: Autonomous reflection loop has no persisted run state, so interruptions can leave work half-done with no safe resume path.

**Generated:** 2026-03-05T10:24:07.782Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Autonomous reflection loop has no persisted run state, so interruptions can leave work half-done with no safe resume path.

## Proposal
Add lightweight “run state persistence + resume” support to the reflection autonomous loop so a crash/kill/restart can continue from the last completed stage instead of restarting (and potentially duplicating branches/PRs or repeating actions).

Implementation steps:
1. **Define a run state model**
   - Create `src/reflection/run-state.ts` with types like:
     - `RunState { runId, startedAt, stages: { name, status, startedAt, endedAt, artifacts? }[] }`
     - Status enum: `pending|running|succeeded|failed|skipped`
2. **Persist state to disk after each stage boundary**
   - In `src/reflection/autonomous-loop.ts`, add a small persistence layer:
     - Default directory: `.ouroboros/runs/`
     - Write `runId.json` after: stage start, stage end (success/failure)
     - Record artifacts (e.g., branch name, PR URL) when produced.
3. **Add CLI support to resume**
   - Update `src/reflection/loop-entry.ts` to accept e.g. `--resume <runId>` (and optionally `--runs-dir <path>` for testing/dev).
   - When resuming, load the JSON state and skip stages already marked `succeeded`, continuing from the first `pending/failed` stage.
4. **Make resume safe by default**
   - If a stage is marked `running` (crash mid-stage), treat it as `failed` on resume and re-run it (or prompt a clear error message and require `--force`—pick one behavior and document it).
5. **Tests**
   - Add `src/__tests__/reflection/run-state.test.ts` covering:
     - State file is created and updated across stage transitions.
     - Resume correctly skips completed stages and continues execution order.
     - “Running → resume” behavior is deterministic.
   - Use a temp directory and mock stage runners (do not invoke real git/gh).
6. **Documentation**
   - Add a short section to `ARCHITECTURE.md` (reflection module) describing run state files, their location, and how to resume a run.

Why this is impactful: it reduces duplicated work and avoids messy partial side effects (dangling branches/PRs) when the autonomous loop is interrupted, without changing heart/core provider flow or mind/prompt assembly.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
