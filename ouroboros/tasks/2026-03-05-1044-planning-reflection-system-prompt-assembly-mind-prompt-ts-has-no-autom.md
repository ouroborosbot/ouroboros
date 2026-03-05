# Reflection Proposal: System prompt assembly (mind/prompt.ts) has no automated regression tests, so psyche-loading/order changes can silently degrade behavior.

**Generated:** 2026-03-05T10:44:05.314Z
**Effort:** small
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
System prompt assembly (mind/prompt.ts) has no automated regression tests, so psyche-loading/order changes can silently degrade behavior.

## Proposal
Add a focused test suite that snapshots/validates the assembled system prompt and verifies key invariants (presence + ordering of psyche sections, deterministic output), so future edits to psyche files or prompt builder can’t silently break the agent.

Implementation steps:
1. Inspect existing test harness (e.g., Jest/Vitest) and patterns in `src/__tests__/` to match conventions.
2. Add fixtures under something like `src/__tests__/fixtures/psyche/` containing minimal versions of `SOUL.md`, `IDENTITY.md`, `LORE.md`, `FRIENDS.md`, and `SELF-KNOWLEDGE.md`.
3. Write `src/__tests__/mind/prompt.test.ts` to:
   - Build the system prompt using the same entrypoint used in runtime (whatever `mind/prompt.ts` exports today).
   - Assert the prompt contains each psyche section (by unique header markers).
   - Assert section ordering is stable (e.g., SOUL precedes IDENTITY precedes LORE, etc.).
   - Snapshot the final prompt string (or structured chunks, if available) to catch unintended formatting/wording regressions.
4. If the prompt builder currently hardcodes paths, add a *small, non-architectural* test hook (e.g., optional base directory parameter or injectable loader) to allow pointing at fixture psyche files—keeping runtime defaults unchanged.
5. Add one negative test: missing/empty psyche file produces a clear error (or at least a deterministic fallback), preventing silent partial prompts.
6. Run `npx tsc` + full test suite locally; ensure coverage doesn’t drop.
7. Commit the tests (and any tiny testability hook) as a single PR-ready change.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
