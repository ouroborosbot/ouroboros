# Reflection Proposal: Reflection/sub-agent artifacts are never pruned, so `ouroboros/tasks/` (and related run output folders) can grow without bound and gradually degrade UX/perf (slow directory scans, large repos, noisy PR diffs).

**Generated:** 2026-03-05T11:50:00.298Z
**Effort:** medium
**Constitution check:** requires-review
**Source:** Autonomous reflection cycle

## Gap
Reflection/sub-agent artifacts are never pruned, so `ouroboros/tasks/` (and related run output folders) can grow without bound and gradually degrade UX/perf (slow directory scans, large repos, noisy PR diffs).

## Proposal
Implement a safe artifact retention policy for reflection/autonomous-loop outputs, with tests.

Implementation steps:
1. **Locate artifact roots** used by reflection + sub-agent pipeline (e.g., wherever `trigger.ts` writes proposal task files and where loop stages write run outputs).
2. Add a small utility module, e.g. `src/reflection/retention.ts`, that:
   - Lists candidate artifact directories/files under a configured root.
   - Sorts by timestamp encoded in name (or falls back to mtime).
   - Keeps the newest **N** items and deletes the rest.
   - Enforces **path safety**: only delete inside the known artifact root; refuse symlinks and `..` traversal; only delete entries matching expected naming patterns (e.g., `YYYY-MM-DD-HHMM-*`).
3. Wire retention into the **end of the loop** (e.g., `src/reflection/autonomous-loop.ts` or the stage finalizer) so pruning happens only after a successful run completion (or after each stage, if safer for partial failures).
4. Add a CLI override (non-breaking) such as `--retain-artifacts N` to `src/reflection/loop-entry.ts` with a conservative default (e.g., keep last 50).
5. Add unit tests in `src/__tests__/reflection/retention.test.ts` using a temp test directory:
   - Creates fake artifact dirs with timestamped names.
   - Verifies only the newest N remain after pruning.
   - Verifies it refuses to delete unexpected names and anything outside the root.
6. Ensure `npx tsc` + full test suite pass; commit as a single focused change.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
