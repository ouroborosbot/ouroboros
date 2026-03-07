# Reflection Proposal: Reflection outputs aren’t schema-validated, so malformed proposals can silently break the autonomous loop downstream.

**Generated:** 2026-03-05T10:06:56.205Z
**Effort:** medium
**Constitution check:** requires-review
**Source:** Autonomous reflection cycle

## Gap
Reflection outputs aren’t schema-validated, so malformed proposals can silently break the autonomous loop downstream.

## Proposal
Add a strict proposal schema + validator to the reflection pipeline so every reflection result is guaranteed to be parseable, complete, and compliant with required fields before it’s written or consumed.

Implementation steps:
1. **Define a proposal schema** (e.g., `src/reflection/proposal-schema.ts`):
   - Required top-level fields: `gap`, `constitution_check`, `effort`, `proposal` (and any existing internal fields your loop expects).
   - Enforce allowed enums for `constitution_check` (`within-bounds|requires-review`) and `effort` (`small|medium|large`).
2. **Implement `validateProposal()`**:
   - Accept the parsed reflection output object/string.
   - Return a normalized, typed object (trim strings, normalize casing, reject unknown enum values).
   - On failure, return a structured error that includes *exactly what’s missing/invalid*.
3. **Wire validation into `src/reflection/trigger.ts`**:
   - After parsing the model’s reflection output and before `writeProposalTask()`, call `validateProposal()`.
   - If invalid: fail fast with an actionable error message (optionally include the raw output in debug logs only).
4. **Add unit tests** in `src/__tests__/reflection/`:
   - Valid proposal passes and normalizes correctly.
   - Missing `GAP:` or invalid enum values fails with precise diagnostics.
   - Extra/unexpected sections don’t break parsing (either ignored or explicitly rejected—choose one behavior and test it).
5. **(Optional but valuable) Add a “repair” pass** limited to formatting only:
   - If parsing fails due to formatting (not content), reformat into the canonical structure; otherwise fail.
   - Keep this conservative to avoid masking real issues.
6. Ensure `npx tsc` passes and tests pass; no changes to `CONSTITUTION.md`, no pipeline restructuring.

Why this is impactful: it hardens the reflect → plan → do → merge loop by preventing “garbage in” from propagating, making failures immediate, diagnosable, and less likely to waste cycles.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
