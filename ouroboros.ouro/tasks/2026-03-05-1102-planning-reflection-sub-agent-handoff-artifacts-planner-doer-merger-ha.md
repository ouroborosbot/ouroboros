# Reflection Proposal: Sub-agent handoff artifacts (planner → doer → merger) have no explicit, runtime-validated contract, so small format drift can silently break the autonomous loop downstream.

**Generated:** 2026-03-05T11:02:14.062Z
**Effort:** medium
**Constitution check:** requires-review
**Source:** Autonomous reflection cycle

## Gap
Sub-agent handoff artifacts (planner → doer → merger) have no explicit, runtime-validated contract, so small format drift can silently break the autonomous loop downstream.

## Proposal
Add lightweight, dependency-free contract validation for the documents/artifacts exchanged between sub-agents, and enforce it inside the existing orchestration flow (no new pipeline stages).

Implementation steps:
1. **Inventory current handoff artifacts**
   - Locate where the work-planner writes its “doing doc” (and any other files the doer/merger expects), and where the doer/merger read them (likely under `src/subagents/` and invoked by `src/reflection/autonomous-loop.ts`).
2. **Define a minimal contract (structure + required fields)**
   - Create `src/subagents/contracts/handoff.ts` exporting validators like:
     - `validatePlannerDoingDoc(markdown: string): { ok: true } | { ok: false; errors: string[] }`
     - `validateDoerResult(markdownOrJson: string): ...`
   - Contracts should be pragmatic: required headings/sections, required tokens/IDs, and any required “next step” markers your orchestrator relies on.
3. **Implement robust parsing without new dependencies**
   - Use simple regex/line scanning to assert required sections exist and are non-empty.
   - Prefer clear, actionable error messages (e.g., “Missing section: ## Implementation steps”).
4. **Enforce validation in the existing orchestration**
   - In `src/reflection/autonomous-loop.ts`, immediately after each sub-agent produces its artifact and before the next stage starts:
     - Validate the artifact.
     - If invalid: emit a clear failure summary (and stop the loop safely rather than proceeding with undefined behavior).
5. **Add unit tests with fixtures**
   - Add tests under `src/__tests__/subagents/contracts/` using a few “known-good” and “known-bad” sample docs to ensure:
     - Valid docs pass.
     - Common failure modes produce stable, readable error lists.
6. **Wire observability (optional but small)**
   - Emit a single “contract validation failed” event via `nerves/` (if there’s an existing event path convenient to call) with stage name + error list, to make debugging faster without changing tool observability semantics.

This keeps the pipeline structure the same, avoids new npm dependencies, and prevents a whole class of brittle downstream failures caused by slightly malformed sub-agent outputs.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
