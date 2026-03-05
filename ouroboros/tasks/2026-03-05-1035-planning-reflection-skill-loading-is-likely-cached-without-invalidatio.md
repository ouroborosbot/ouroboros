# Reflection Proposal: Skill loading is likely cached without invalidation, so edits to `.md` skills during a long-running session don’t take effect until restart.

**Generated:** 2026-03-05T10:35:03.152Z
**Effort:** small
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Skill loading is likely cached without invalidation, so edits to `.md` skills during a long-running session don’t take effect until restart.

## Proposal
Implement mtime-aware cache invalidation for skills in `src/repertoire/skills.ts` (and any related helper used by `list_skills` / `load_skill`), so the agent reliably sees updated skill content after self-modification without requiring a full restart.

Implementation steps:
1. Inspect current skill loading path (`src/repertoire/skills.ts` and where `list_skills` / `load_skill` are implemented) to confirm whether a process-level cache exists and how it’s keyed.
2. Add a cache entry shape like `{ content: string; mtimeMs: number }` keyed by skill name (and resolved file path).
3. On `load_skill(name)`:
   - `stat()` the underlying skill file to get `mtimeMs`
   - If cached and `mtimeMs` unchanged, return cached content
   - If changed (or missing), re-read file, update cache, return new content
4. On `list_skills()`:
   - Keep it simple (directory listing); do not force-read all skills
   - Optionally include an internal “cache warm” helper but avoid changing tool output format
5. Add unit tests in `src/__tests__/repertoire/`:
   - Create a temporary skill file, `load_skill` → assert content
   - Modify file contents + ensure mtime changes, `load_skill` again → assert updated content
   - Verify no reload occurs when file is unchanged (can be done by spying on `readFile` / counting reads if the code structure supports it)
6. Ensure `npx tsc` and test suite pass; commit with a focused message (e.g., “Repertoire: invalidate skill cache on mtime change”).

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
