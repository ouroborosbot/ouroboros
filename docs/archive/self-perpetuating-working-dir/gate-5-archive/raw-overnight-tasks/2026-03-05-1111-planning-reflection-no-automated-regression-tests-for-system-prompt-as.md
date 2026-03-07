# Reflection Proposal: No automated regression tests for system prompt assembly (psyche loading, ordering, caching), so subtle prompt changes can slip in unnoticed

**Generated:** 2026-03-05T11:11:07.414Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
No automated regression tests for system prompt assembly (psyche loading, ordering, caching), so subtle prompt changes can slip in unnoticed

## Proposal
Add a focused test suite that locks down the behavior of `mind/prompt.ts` without changing its core logic, catching accidental changes to what goes into the system prompt and in what order.

Implementation steps:
1. Create `src/__tests__/mind/prompt.test.ts` covering:
   - `buildSystem()` (or equivalent exported builder) includes the expected psyche sections (SOUL/IDENTITY/LORE/FRIENDS/SELF-KNOWLEDGE, etc.) and emits them in a stable, documented order.
   - Missing psyche files fail with a clear error (or produce an explicit placeholder), matching current intended behavior.
2. Add a snapshot-style assertion (or structured string assertions) that verifies:
   - Presence of section headers/markers for each psyche file.
   - No duplicates when prompt assembly is invoked multiple times in one process (catches caching bugs).
3. Add a small caching test:
   - Call the builder twice; assert file reads are not repeated if caching is intended (using a mocked filesystem layer or a spy around the existing loader).
4. Document the contract:
   - Add a short section to `ARCHITECTURE.md` (or a nearby doc) describing “System prompt assembly invariants” (which files, ordering, and caching expectations), so future edits have an explicit target.
5. Run `npx tsc` + test suite + coverage gate to ensure the added tests increase coverage and don’t require modifying `mind/prompt.ts` logic (keeping this within autonomous bounds).

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
