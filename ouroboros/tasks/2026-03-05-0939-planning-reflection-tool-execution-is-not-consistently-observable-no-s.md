# Reflection Proposal: Tool execution is not consistently observable (no standardized start/stop/error events with timing + correlation) across all tools/providers.

**Generated:** 2026-03-05T09:39:13.285Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Tool execution is not consistently observable (no standardized start/stop/error events with timing + correlation) across all tools/providers.

## Proposal
Add a uniform “tool span” observability layer in `repertoire/` that emits structured events to `nerves/` for every tool invocation (start, success, failure), including duration, tool name, call id, and a per-turn correlation id. This improves debuggability (hangs, slow tools, flaky integrations) without changing the heart/mind architecture.

Implementation steps:
1. **Inventory current dispatch point**
   - Locate the single chokepoint where tool calls are executed (likely `src/repertoire/tools.ts` or the tool execution wrapper used by `tools-base.ts` definitions).
   - Confirm how `nerves/` events are currently emitted (if any) and what event types exist in `src/nerves/runtime.ts`.

2. **Define new event types in nerves**
   - In `src/nerves/runtime.ts`, add three event types (names illustrative):
     - `tool_call_started` { toolName, callId, turnId, timestamp, argsSize? }
     - `tool_call_finished` { toolName, callId, turnId, timestamp, durationMs, resultSize? }
     - `tool_call_failed` { toolName, callId, turnId, timestamp, durationMs, errorType, errorMessageSafe }
   - Ensure payloads avoid secrets (only sizes/metadata; never raw args/results by default).

3. **Implement a wrapper that instruments tool execution**
   - In the central tool execution function (in `src/repertoire/tools.ts` or equivalent), wrap each tool handler invocation:
     - Emit `*_started` immediately before execution.
     - Measure duration with a monotonic clock (`performance.now()` or `process.hrtime.bigint()`).
     - Emit `*_finished` on success or `*_failed` on error, rethrowing the error afterward to preserve behavior.

4. **Add correlation identifiers**
   - Create/propagate a lightweight `turnId` (or `traceId`) sourced from the existing turn coordinator context if available; otherwise generate one per agent turn at the tool-dispatch boundary.
   - Thread it through the tool execution context without modifying provider interfaces.

5. **Tests**
   - Add unit tests under `src/__tests__/repertoire/` verifying:
     - Start+finish events fire exactly once for successful tool calls.
     - Start+failed events fire exactly once for throwing tool calls.
     - Duration is present and non-negative.
     - No raw args/results are emitted (only metadata fields).
   - If `nerves/` has a test harness or mock emitter, use it; otherwise introduce a minimal mock event sink for tests.

6. **Developer-facing documentation**
   - Update `ARCHITECTURE.md` (or a short `nerves/` README if it exists) with the new event contract and guidance for adding new tools (i.e., “do not emit events in each tool; rely on the wrapper”).

7. **Smoke check**
   - Run `npx tsc`, unit tests, and the coverage gate to ensure no regressions and coverage does not drop.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
