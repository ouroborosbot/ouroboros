# Doing: Add durable run provenance bundles for reflection + autonomous loop

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct

## Objective
Create durable, run-scoped provenance artifacts for reflection/autonomous-loop executions (prompt, raw model outputs, parsed objects, stage I/O, and conservative environment metadata) to make debugging and regression analysis possible without changing heart/ or mind/ core logic.

## Completion Criteria
- [ ] Each reflection/loop run creates a run directory at `ouroboros/runs/<runId>/` (under the agent root)
- [ ] Reflection stage artifacts are written: `reflection-prompt.md`, `reflection-response.txt`, `reflection-proposal.json`, and `reflection-parser-errors.json` when parsing is malformed
- [ ] Autonomous loop writes per-stage inputs/outputs artifacts and a `run-summary.json` even on early exit (dry-run / gated)
- [ ] Minimal, non-secret provenance recorded (git HEAD/branch when available; config file paths/names) without dumping env vars
- [ ] Writes are path-safe (no traversal) and confined under the run directory
- [ ] `ARCHITECTURE.md` documents how to inspect `ouroboros/runs/` for post-mortems
- [ ] `ouroboros/runs/` is gitignored to avoid polluting PRs
- [ ] All new code has tests
- [ ] All tests pass

## Work Units

### ⬜ Unit 1a: `reflection/run-artifacts` helper — Tests
**What**: Add unit tests for a new run artifact writer helper.
**Files**:
- `src/__tests__/reflection/run-artifacts.test.ts` (new)
**Acceptance**: Tests exist and FAIL (red)

Test cases (minimum):
- `createRunDir()` creates `agentRoot/runs/<runId>/` using deterministic `now` + `shortSha`.
- `writeArtifact()` writes nested paths and creates parent directories.
- `writeJsonArtifact()` writes pretty JSON + trailing newline.
- Path traversal is rejected (e.g. `../escape.txt`, absolute paths) and does not write outside the run dir.

### ⬜ Unit 1b: `reflection/run-artifacts` helper — Implementation
**What**: Implement the run directory convention and safe artifact writers.
**Files**:
- `src/reflection/run-artifacts.ts` (new)
**Acceptance**: Unit 1a tests PASS (green)

Implementation notes:
- Run root: `<agentRoot>/runs/`
- Run ID format: `YYYYMMDD-HHMMSS-<shortSha>` (UTC is fine). If no sha is provided, use a conservative placeholder like `nogit`.
- `writeArtifact(relPath, content)` must:
  - Reject absolute paths
  - Reject any path that resolves outside `runDir` after `path.resolve()`
  - `mkdirSync(dirname, { recursive: true })` before write
- `writeJsonArtifact(relPath, obj)` should use `JSON.stringify(obj, null, 2) + "\n"`

### ⬜ Unit 2a: Autonomous loop provenance bundle — Tests
**What**: Extend autonomous loop tests to assert that a run provenance bundle is written with expected artifacts.
**Files**:
- `src/__tests__/reflection/autonomous-loop.test.ts` (modify)
**Acceptance**: New/updated tests exist and FAIL (red)

Test cases (minimum):
- Within-bounds full pipeline run writes:
  - `ouroboros/runs/<runId>/reflection-prompt.md`
  - `ouroboros/runs/<runId>/reflection-response.txt`
  - `ouroboros/runs/<runId>/reflection-proposal.json`
  - `ouroboros/runs/<runId>/stage-1-reflect-inputs.json` and `stage-1-reflect-output.txt`
  - `ouroboros/runs/<runId>/stage-2-plan-inputs.json` and `stage-2-plan-output.md` (or `.txt`), plus the final doing doc captured (if applicable)
  - `ouroboros/runs/<runId>/run-summary.json`
- Gated run (`requires-review`) still writes `run-summary.json` + reflection artifacts.
- Parser error heuristic: when the reflection output is malformed (e.g., missing `GAP:`), `reflection-parser-errors.json` is written.

Determinism guidance for tests:
- Use `vi.useFakeTimers()` + `vi.setSystemTime(new Date("2026-03-05T01:02:03.000Z"))` so `<runId>` is predictable.
- Either:
  - Keep git unavailable and assert `<shortSha>` becomes `nogit`, **or**
  - Initialize a minimal git repo in `projectRoot` (`git init -b main`, commit one file) and assert the sha-based suffix.

### ⬜ Unit 2b: Autonomous loop provenance bundle — Implementation
**What**: Instrument `runAutonomousLoop()` to create a run dir and write stage artifacts + summary.
**Files**:
- `src/reflection/autonomous-loop.ts` (modify)
**Acceptance**: Unit 2a tests PASS (green)

Implementation requirements:
- At loop start:
  - Create run dir using the new helper under `config.agentRoot`.
  - Record conservative environment provenance:
    - `projectRoot`, `agentRoot`
    - If available (non-fatal): `git rev-parse HEAD`, `git rev-parse --abbrev-ref HEAD`
    - If readable: `agentRoot/agent.json` path + selected provider field + configPath string (do not read secrets.json)
- For each stage (reflect → plan → do → merge):
  - Write `stage-<n>-<name>-inputs.json` with:
    - stage name/number
    - trace id
    - system prompt source (subagent file path or “reflection prompt”)
    - user message (string)
    - provider/model identifiers when safely obtainable (at minimum provider name from agent.json)
  - Write `stage-<n>-<name>-output.*` with the raw stage output
- Reflection-specific artifacts:
  - `reflection-prompt.md` = exact system prompt string used for reflection stage
  - `reflection-response.txt` = raw model output for reflection stage
  - `reflection-proposal.json` = parsed proposal object
  - `reflection-parser-errors.json` when parsing is malformed (heuristic is fine; e.g., if `proposal.gap === "unknown"` or missing required header matches)
- Summary:
  - Ensure `run-summary.json` is written on **all** exits (success, gated, dry-run, error). Use a `try/catch/finally` or a single return path that always writes summary.
  - Include: `runId`, `traceId`, `stagesCompleted`, `success` boolean, `error` (if any), and elapsed time per stage.

### ⬜ Unit 3a: Single reflection cycle provenance bundle (`npm run reflect`) — Tests
**What**: Add tests for reflection-cycle provenance writing (non-loop path).
**Files**:
- `src/__tests__/reflection/trigger.test.ts` (modify) **or** add a new focused test file that exercises the reflection runner logic without using the excluded `*-entry.ts`.
**Acceptance**: Tests exist and FAIL (red)

Note: Because `src/reflection/reflect-entry.ts` is excluded from coverage, implement provenance writing in a testable module/function (not only in the entry file).

### ⬜ Unit 3b: Single reflection cycle provenance bundle — Implementation
**What**: Ensure the non-loop reflection path also writes the same core artifacts (prompt/response/proposal/parser-errors) into a run dir.
**Files** (choose one approach; prefer minimal churn):
- Option A (preferred): create a small exported helper in `src/reflection/trigger.ts` or a new `src/reflection/runner.ts` that `reflect-entry.ts` and `autonomous-loop.ts` can share.
- Option B: implement directly in `reflect-entry.ts` (but then add a testable wrapper module to satisfy coverage).
**Acceptance**: Unit 3a tests PASS (green)

Constraints:
- Do not modify heart/ or mind/ core logic.
- Keep provenance capture conservative (no env var dumps, no secrets file contents).

### ⬜ Unit 4a: Documentation + repo hygiene — Tests
**What**: Add minimal tests for any new pure functions introduced while updating docs/ignore rules (if applicable).
**Files**:
- Only if new code is introduced beyond Units 1–3.
**Acceptance**: Tests exist and FAIL (red) (only if needed)

### ⬜ Unit 4b: Documentation + repo hygiene — Implementation
**What**: Document the new run provenance bundles and gitignore the artifacts directory.
**Files**:
- `ouroboros/ARCHITECTURE.md` (modify)
- `.gitignore` (modify)
**Acceptance**:
- `ARCHITECTURE.md` mentions `ouroboros/runs/<runId>/` under `reflection/` and describes what files to inspect for post-mortems
- `.gitignore` excludes `ouroboros/runs/`

## Progress Log
- 2026-03-05 Created from reflection proposal
