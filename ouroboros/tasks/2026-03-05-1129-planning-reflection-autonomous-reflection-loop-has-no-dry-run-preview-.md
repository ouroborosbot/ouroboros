# Reflection Proposal: Autonomous reflection loop has no “dry-run/preview” mode to generate proposals and plans without executing code changes.

**Generated:** 2026-03-05T11:29:21.497Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Autonomous reflection loop has no “dry-run/preview” mode to generate proposals and plans without executing code changes.

## Proposal
Add a dry-run capability to the reflection → plan → do → merge pipeline so an operator (or scheduled job) can safely inspect the proposed task and generated doing-doc artifacts before any code-modifying steps run.

Implementation steps:
1. **Add CLI flag plumbing**
   - Update `src/reflection/loop-entry.ts` to accept `--dry-run` (and reflect it in `--help` output).
   - Parse the flag into the options passed to the loop runner.

2. **Implement dry-run behavior in the orchestrator**
   - Update `src/reflection/autonomous-loop.ts` to support a `dryRun: boolean` option.
   - When `dryRun` is true:
     - Run stages: `reflect` → `plan`
     - Persist all normal artifacts (proposal task file, planning output, doing-doc if planner generates it).
     - **Skip** `do` and `merge` stages entirely.
     - Exit with a clear summary pointing to artifact paths.

3. **Add a small “run summary” artifact**
   - Write a `reflection-run-summary.json` (or `.md`) into the existing artifacts/output directory containing:
     - timestamp, dryRun=true, stages executed, paths to generated artifacts.

4. **Tests**
   - Add unit tests for `autonomous-loop.ts` ensuring stage selection changes correctly under `dryRun`.
   - Add a CLI parsing test for `loop-entry.ts` verifying `--dry-run` is recognized and propagated.
   - Keep tests hermetic by stubbing stage runners (no real tool execution).

5. **Documentation**
   - Update any README/docs that mention `npm run reflect:loop` to include an example:
     - `npm run reflect:loop -- --dry-run`
   - Briefly describe expected outputs and where to find them.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
