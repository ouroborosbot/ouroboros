# Reflection Proposal: Skills are loaded from markdown without structural validation, so malformed/duplicated skills can silently degrade tool/skill selection and prompt assembly.

**Generated:** 2026-03-05T10:17:19.258Z
**Effort:** small
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Skills are loaded from markdown without structural validation, so malformed/duplicated skills can silently degrade tool/skill selection and prompt assembly.

## Proposal
Add a lightweight “skills registry + validator” layer so every skill file is parseable, uniquely named, and meets a minimal required structure—catching problems early via unit tests (no new dependencies, no CI/build changes).

Implementation steps:
1. **Define a minimal skill contract** in `src/repertoire/skills.ts` (or a new `src/repertoire/skills-registry.ts`):
   - Required fields: `name` (from filename), `title` (first heading), `purpose` (must include a “Purpose” section or equivalent marker), and `body`.
   - Optional fields: tags/notes if already supported.
2. **Implement parsing + validation**:
   - Load all `ouroboros/skills/*.md`.
   - Parse first `# ...` as `title`.
   - Validate presence of a “Purpose” section (e.g., `## Purpose` heading) and non-empty body.
   - Enforce **unique skill names** and stable ordering for determinism.
   - On validation failure, return a structured error list (file, reason).
3. **Integrate registry into existing skill listing/loading**:
   - Keep the current public API stable (no caller changes beyond internal wiring).
   - Ensure `list_skills` uses the registry results (validated set).
4. **Add tests** in `src/__tests__/repertoire/`:
   - “All existing skills validate” (golden test across repository files).
   - Duplicate-name detection (fixture directory).
   - Missing Purpose section detection (fixture markdown).
5. **Developer ergonomics**:
   - Add a small helper function (exported) like `validateAllSkills()` that can be invoked by future tooling, but do not modify CI or add npm scripts in this task.
6. **Documentation**:
   - Update `ARCHITECTURE.md` (or a short note in `ouroboros/skills/README.md` if it exists) describing the minimal required skill markdown structure so new skills don’t break validation.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
