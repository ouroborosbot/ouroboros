# Reflection Proposal: No automated “tool registry contract” checks to prevent duplicate tool names, missing handlers, or malformed tool schemas from silently breaking tool execution.

**Generated:** 2026-03-05T10:52:55.520Z
**Effort:** small
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
No automated “tool registry contract” checks to prevent duplicate tool names, missing handlers, or malformed tool schemas from silently breaking tool execution.

## Proposal
Add a focused test suite that validates the integrity of the registered tool set at build/CI time, catching common failure modes (name collisions, incomplete schemas, or a tool definition that is exported but not actually executable).

Implementation steps:
1. Create `src/__tests__/repertoire/tools-registry.contract.test.ts`.
2. Import the canonical tool registry (e.g., `allDefinitions` from `src/repertoire/tools.ts`, plus whatever export represents the handler/dispatcher map).
3. Add contract assertions:
   - **Uniqueness:** every tool has a non-empty `name`; all names are unique (fail with a helpful diff listing duplicates).
   - **Schema sanity:** each tool has a non-empty `description`; parameters schema is an object; reject obviously broken shapes (e.g., missing `type`, non-object `properties` when `type: "object"`).
   - **Executability:** for every registered definition name, verify a corresponding handler exists in the tool execution layer (or that the dispatcher can resolve it). This prevents “registered-but-unhandled” tools.
4. Add a snapshot (optional) of the sorted tool name list to make unintended tool surface changes visible in PRs (helps detect accidental registration/removal).
5. Run `npm test` and ensure the new test is stable and provides actionable failure messages.
6. Commit with a message like: `test(repertoire): add tool registry contract checks`.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
