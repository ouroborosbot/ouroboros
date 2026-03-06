# Reflection Proposal: Reflection can repeatedly propose essentially the same task because there’s no deduplication against existing `ouroboros/tasks/` artifacts or recent proposals.

**Generated:** 2026-03-05T12:40:54.273Z
**Effort:** small
**Constitution check:** requires-review
**Source:** Autonomous reflection cycle

## Gap
Reflection can repeatedly propose essentially the same task because there’s no deduplication against existing `ouroboros/tasks/` artifacts or recent proposals.

## Proposal
Implement lightweight “proposal deduplication” in the reflection task writer so new proposals are either (a) skipped with a clear note, or (b) automatically renamed/linked when they match an existing task.

Implementation steps:
1. **Add a normalization + fingerprint helper** in `src/reflection/` (e.g., `task-dedupe.ts`) that:
   - normalizes a proposed task title (lowercase, collapse whitespace, strip punctuation/stopwords as needed)
   - produces a stable fingerprint (e.g., normalized string + optional short hash)
2. **Index existing tasks** by scanning `ouroboros/tasks/` in `src/reflection/trigger.ts` (or a helper) to collect:
   - existing filenames + extracted titles (from filename and/or first heading in file)
   - their fingerprints
3. **Gate `writeProposalTask()`** (in `src/reflection/trigger.ts`) so that before writing a new proposal it:
   - checks for fingerprint collision / strong match
   - on match: either skip writing and emit a structured log/event (preferred), or write with a `DUPLICATE_OF:` reference to the existing task
4. **Add unit tests** under `src/__tests__/reflection/` to cover:
   - exact duplicate title → skipped/linked
   - near-duplicate (minor punctuation/case changes) → detected
   - genuinely new proposal → written normally
5. **Documentation touch-up**: update `ARCHITECTURE.md` (self-model section for reflection) to mention dedup behavior so future changes don’t accidentally remove it.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
