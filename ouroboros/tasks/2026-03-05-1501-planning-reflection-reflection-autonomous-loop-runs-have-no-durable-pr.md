# Reflection Proposal: Reflection/autonomous-loop runs have no durable “provenance bundle” (prompt + model/config + parsed outputs), making debugging and regression analysis hard when a run behaves unexpectedly.

**Generated:** 2026-03-05T15:01:33.193Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Reflection/autonomous-loop runs have no durable “provenance bundle” (prompt + model/config + parsed outputs), making debugging and regression analysis hard when a run behaves unexpectedly.

## Proposal
Add run-level provenance artifacts for the reflection pipeline so every reflection/loop execution writes a self-contained snapshot of what it saw and what it produced (without changing heart/ or mind/ core logic).

Implementation steps:
1. **Define a run directory convention**
   - Create `ouroboros/runs/<runId>/` where `runId = YYYYMMDD-HHMMSS-<shortSha>` (or similar).
   - Add a small helper in `src/reflection/run-artifacts.ts`:
     - `createRunDir()`
     - `writeArtifact(relPath, content)`
     - `writeJsonArtifact(relPath, obj)`
2. **Capture reflection trigger inputs/outputs**
   - In `src/reflection/trigger.ts` (or where the reflection prompt is constructed/executed):
     - Write `reflection-prompt.md` (the exact prompt sent to the model).
     - Write `reflection-response.txt` (raw model output).
     - Write `reflection-proposal.json` (the parsed/structured proposal object your parser produces).
     - Write `reflection-parser-errors.json` if parsing fails (instead of only logging).
3. **Capture autonomous loop stage outputs**
   - In `src/reflection/autonomous-loop.ts`, for each stage (reflect → plan → do → merge):
     - Write `stage-<n>-<name>-inputs.json` (what was fed to the stage: key paths, selected provider/model, etc.).
     - Write `stage-<n>-<name>-output.md|json` (primary artifact produced, e.g., the planner “doing doc”).
     - Write `run-summary.json` at the end (success/failure, elapsed time per stage, git branch, commit SHAs created).
4. **Add minimal environment provenance (non-secret)**
   - Record `git rev-parse HEAD`, current branch, and relevant config filenames used (but do **not** dump raw env vars).
   - Keep it intentionally conservative to avoid accidental secret capture.
5. **Tests**
   - Add unit tests under `src/__tests__/reflection/` that:
     - Run the artifact writer against a temp directory and assert expected files are created.
     - Verify deterministic naming and that writes are confined under `ouroboros/runs/` (no path traversal).
6. **Documentation**
   - Update `ARCHITECTURE.md` (self-model) to mention “run provenance artifacts” under `reflection/` and how to inspect a run for post-mortems.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
