# Reflection Proposal: Tool execution observability is inconsistent (no guaranteed start/end events with duration + outcome for every tool call)

**Generated:** 2026-03-05T09:59:28.930Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Tool execution observability is inconsistent (no guaranteed start/end events with duration + outcome for every tool call)

## Proposal
Add a single, centralized instrumentation layer around tool execution so *every* tool call reliably emits structured “started” and “finished” events (including timing and success/failure), without touching heart/core turn flow.

Implementation steps:
1. **Locate the true tool dispatch chokepoint**
   - Identify the function that all tool calls route through (likely in `src/repertoire/tools.ts` or `src/repertoire/tools-base.ts`).
   - Confirm it is used by all channels/providers (CLI/Teams, all ProviderRuntime implementations) so instrumentation there is universal.

2. **Define new nerves event types (non-breaking)**
   - In `src/nerves/runtime.ts` (or the canonical event-type definition file), add two events, e.g.:
     - `tool_execution_started`: `{ toolName, callId?, timestamp, argsSummary? }`
     - `tool_execution_finished`: `{ toolName, callId?, timestamp, durationMs, ok, errorName?, errorMessage? }`
   - Keep payloads minimal and explicitly avoid logging secrets or full args (optional `argsSummary` should be redacted/whitelisted).

3. **Wrap tool execution with try/finally instrumentation**
   - In the centralized dispatcher (step 1), implement:
     - Capture `start = performance.now()` (or `Date.now()` if preferred).
     - Emit `tool_execution_started`.
     - `try { await handler(...) } catch (e) { ...; throw } finally { emit tool_execution_finished }`
   - Ensure `finished` fires on **success**, **tool handler throw**, and **dispatcher-level validation errors**.

4. **Add unit tests to lock in the guarantee**
   - Create/extend tests under `src/__tests__/repertoire/` and/or `src/__tests__/nerves/`:
     - Success path: asserts both events emitted, `ok: true`, duration present.
     - Failure path: tool throws → asserts both events emitted, `ok: false`, error fields present, and error rethrown.
     - Validation error path (unknown tool / bad args): still emits `finished` with `ok: false`.
   - Use a mock/test sink for the nerves emitter to capture emitted events deterministically.

5. **Run compilation + test suite locally**
   - `npx tsc`
   - `npm test` (or repo-standard command)
   - Ensure coverage does not drop.

6. **Deliver as a single focused PR**
   - Commit message: “Instrument tool execution with start/finish nerves events”
   - PR description: rationale + example event payloads + confirmation that no heart/core changes were made.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
