# Doing: Persisted run state + resume support for autonomous reflection loop

**Status**: READY_FOR_EXECUTION  
**Execution Mode**: direct

## Objective
Add lightweight run state persistence to the autonomous reflection loop so interruptions (crash/kill/restart) can safely resume from the last completed stage instead of restarting and potentially duplicating side effects (branches/PRs).

## Completion Criteria
- [ ] A `RunState` model exists at `src/reflection/run-state.ts` with stage statuses and timestamps.
- [ ] The autonomous loop persists run state JSON to disk (default: `<projectRoot>/.ouroboros/runs/<runId>.json`) at stage start/end.
- [ ] `npm run reflect:loop -- --resume <runId>` resumes by skipping stages already marked `succeeded` and continues from the first `pending|failed` stage.
- [ ] On resume, any stage previously marked `running` is treated deterministically as `failed` and re-run.
- [ ] Artifacts needed for safe resume are persisted (at minimum: proposal task path and doing doc path; plus branch name once computed).
- [ ] `ARCHITECTURE.md` documents run state files and how to resume.
- [ ] All new code has tests
- [ ] All tests pass

## Work Units

### ⬜ Unit 1a: RunState model + persistence helpers — Tests
**What**: Add failing unit tests that define the contract for run state creation, persistence, and resume normalization.

**Files**:
- `src/__tests__/reflection/run-state.test.ts` (new)

**Acceptance**:
- Tests exist and FAIL (red) because `src/reflection/run-state.ts` does not exist yet (or exported functions are missing).
- Tests cover:
  - Creating a new run state with known stage names.
  - Persisting JSON to `<runsDir>/<runId>.json` and observing updates across stage start/end transitions.
  - Normalization on resume: any stage with status `running` becomes `failed` deterministically (and is the first eligible stage to run).

### ⬜ Unit 1b: RunState model + persistence helpers — Implementation
**What**: Implement `src/reflection/run-state.ts` with types and small helper functions used by the loop.

**Files**:
- `src/reflection/run-state.ts` (new)

**Implementation notes (keep small + testable)**:
- Types:
  - `RunStageStatus = "pending" | "running" | "succeeded" | "failed" | "skipped"`
  - `RunStageState { name: string; status: RunStageStatus; startedAt?: string; endedAt?: string; artifacts?: Record<string, unknown> }`
  - `RunState { runId: string; startedAt: string; updatedAt: string; stages: RunStageState[]; artifacts?: Record<string, unknown> }`
- Persistence helpers:
  - `getRunStatePath(runsDir, runId)`
  - `saveRunState(runsDir, state)` (mkdirp + atomic-ish write)
  - `loadRunState(runsDir, runId)`
- Mutation helpers (pure functions preferred; persist performed by caller):
  - `ensureStages(state, stageNames)`
  - `markStageStarted(state, stageName, atIso)`
  - `markStageEnded(state, stageName, status, atIso, artifacts?)`
  - `normalizeForResume(state, atIso)` — convert `running` → `failed` (and set `endedAt` if missing)

**Acceptance**:
- Unit 1a tests PASS (green).
- File format is stable JSON with timestamps in ISO strings.

### ⬜ Unit 2a: Autonomous loop persistence + resume — Tests
**What**: Extend/add tests to prove the autonomous loop writes run state and can resume by skipping succeeded stages.

**Files**:
- `src/__tests__/reflection/autonomous-loop.test.ts` (modify)

**Acceptance**:
- Tests exist and FAIL (red) until loop integration is implemented.
- Add/extend test coverage for:
  1) **Persists run state during full pipeline**
     - Run a within-bounds proposal through the mocked pipeline.
     - Assert a state file exists under `<projectRoot>/.ouroboros/runs/`.
     - Assert stage statuses include `reflect`, `plan`, `do`, `merge` as `succeeded`.
     - Assert persisted artifacts include (at minimum) the doing doc path and branch name.
  2) **Resume skips succeeded stages**
     - Precreate a run state JSON with `reflect` + `plan` succeeded, `do` pending.
     - Run `runAutonomousLoop({ resumeRunId: <id> })`.
     - Assert `runAgent` is called only for the remaining stages (do + merge), and not for reflect/plan.
  3) **Running → resume deterministic behavior**
     - Precreate a run state with `do` marked `running`.
     - Resume and assert the loop re-runs `do` (treating prior `running` as `failed`).

### ⬜ Unit 2b: Autonomous loop persistence + resume — Implementation
**What**: Integrate run-state persistence into `runAutonomousLoop`, and add a resume code path.

**Files**:
- `src/reflection/autonomous-loop.ts` (modify)
- `src/reflection/run-state.ts` (modify if needed)

**Implementation notes**:
- Extend `LoopConfig`:
  - `resumeRunId?: string`
  - `runsDir?: string` (optional override; default to `path.join(projectRoot, ".ouroboros", "runs")`)
- Determine `runId`:
  - If `resumeRunId` provided, use it.
  - Else create a new run id (timestamp + short random suffix is fine).
- Load/create state:
  - On new run: initialize state with stages `["reflect","plan","do","merge"]`.
  - On resume: load JSON, run `normalizeForResume` (turn any `running` into `failed`).
- Stage execution rules:
  - If stage status is `succeeded` → skip execution.
  - If `pending|failed` → execute.
  - If missing stage entry (older state) → treat as `pending`.
- Persist boundaries:
  - Immediately before executing a stage: mark `running` + save.
  - After successful completion: mark `succeeded` + save.
  - On error/throw: mark `failed` + save, then rethrow.
- Artifacts to persist (minimum viable):
  - After proposal task write: `{ proposalPath }` at run-level artifacts.
  - After planning: `{ doingDocPath }` at run-level artifacts.
  - Once computed: `{ branchName }` at run-level artifacts.
  - (Optional) stage-level artifacts for debugging: e.g. `{ outputSnippet }`.
- When resuming, reuse persisted artifacts when possible (e.g., do stage should prefer `branchName` from state rather than recomputing a different one).

**Acceptance**:
- Unit 2a tests PASS (green).
- Existing autonomous-loop tests still PASS, with updates only where the new behavior changes filesystem side effects.

### ⬜ Unit 3a: CLI resume flags (`loop-entry`) — Tests
**What**: Make CLI arg parsing testable by factoring it into a small module, and add tests for `--resume` and `--runs-dir`.

**Files**:
- `src/reflection/loop-args.ts` (new)
- `src/__tests__/reflection/loop-args.test.ts` (new)

**Acceptance**:
- Tests exist and FAIL (red) until implementation.
- Tests cover:
  - `--dry-run`, `--max-stages N`, `--resume <runId>`, `--runs-dir <path>` parsing.
  - Missing values for `--resume` / `--runs-dir` throws a clear error.

### ⬜ Unit 3b: CLI resume flags (`loop-entry`) — Implementation
**What**: Implement arg parsing and wire resume options into the loop entry.

**Files**:
- `src/reflection/loop-args.ts` (new)
- `src/reflection/loop-entry.ts` (modify)

**Implementation notes**:
- Keep the existing `--agent` requirement.
- Update usage string to mention:
  - `--resume <runId>`
  - `--runs-dir <path>`
- In `loop-entry.ts`, call `parseLoopArgs(process.argv)` and pass through to `runAutonomousLoop`.

**Acceptance**:
- Unit 3a tests PASS (green).
- `npm run reflect:loop -- --resume <runId>` reaches `runAutonomousLoop` with `resumeRunId` set.

### ⬜ Unit 4: Documentation — Run state files + resume
**What**: Document the run state persistence mechanism in `ARCHITECTURE.md` under the `reflection/` module section.

**Files**:
- `ouroboros/ARCHITECTURE.md` (modify)

**Acceptance**:
- Docs include:
  - Default location: `<projectRoot>/.ouroboros/runs/<runId>.json`
  - What is stored (stages + statuses + key artifacts)
  - Resume command example: `npm run reflect:loop -- --resume <runId>`
  - Clarification: on resume, any stage previously marked `running` is treated as `failed` and re-run.

## Progress Log
- 2026-03-05 Created from reflection proposal
