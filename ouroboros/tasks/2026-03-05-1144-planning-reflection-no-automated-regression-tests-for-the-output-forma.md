# Reflection Proposal: No automated regression tests for the output-formatting layer (wardrobe), so tone/markdown formatting can silently regress

**Generated:** 2026-03-05T11:44:22.308Z
**Effort:** small
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
No automated regression tests for the output-formatting layer (wardrobe), so tone/markdown formatting can silently regress

## Proposal
Add a focused snapshot/contract test suite for `wardrobe/` to lock in formatting invariants (markdown structure, code block handling, list formatting, and “no banned filler phrases” constraints), preventing accidental tone/format drift when editing `format.ts` or `phrases.ts`.

Implementation steps:
1. Inspect current formatting entrypoints:
   - Identify the exported functions used by the main agent to render responses (likely in `src/wardrobe/format.ts` and any helpers in `phrases.ts`).
2. Add a new test file (no deletions):
   - Create `src/__tests__/wardrobe/format.test.ts`.
3. Write snapshot/expectation tests for key invariants:
   - Markdown formatting: headings/lists/code fences remain stable given representative inputs.
   - “Plain text mode” (if supported): no markdown artifacts leak through.
   - Edge cases: empty content, very long lines, mixed code + prose, nested lists.
4. Add phrase-table stability checks:
   - Assert phrase categories referenced by code exist (no missing keys).
   - Assert phrase arrays are non-empty where required.
   - Add a simple guard test that output does not contain known unwanted acknowledgement openers (e.g., “Great question”, “Short answer”) if the wardrobe layer is responsible for those (or if there’s a single place where these are injected).
5. Run the full test suite and TypeScript compile:
   - `npm test` (or repo-standard command)
   - `npx tsc`
6. Commit as a single, descriptive commit:
   - Example message: `test(wardrobe): add snapshot/contract coverage for formatting + phrase tables`

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
