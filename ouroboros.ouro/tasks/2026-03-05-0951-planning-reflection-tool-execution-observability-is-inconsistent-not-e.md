# Reflection Proposal: Tool execution observability is inconsistent (not every tool call reliably emits structured start/end/error events with timing + correlation).

**Generated:** 2026-03-05T09:51:38.391Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Tool execution observability is inconsistent (not every tool call reliably emits structured start/end/error events with timing + correlation).

## Proposal
Implement a single, consistent instrumentation wrapper for all tool executions so that every tool call emits `tool_start`, `tool_end`, and `tool_error` events (including duration, tool name, and a correlation id), without changing the heart/agent loop.

Implementation steps:
1. **Audit current tool dispatch path**
   - Locate the single choke-point where tool calls are executed (likely in `src/repertoire/tools.ts` or `src/repertoire/tools-base.ts`), and confirm all tools flow through it.
2. **Define/standardize event shapes in nerves**
   - In `src/nerves/runtime.ts` (or the existing event type module), add explicit event types for:
     - `tool_start` (toolName, callId, timestamp, sanitizedArgsSummary)
     - `tool_end` (toolName, callId, timestamp, durationMs, resultSummary)
     - `tool_error` (toolName, callId, timestamp, durationMs, errorType/message)
   - Ensure payloads avoid secrets by design (summaries, not raw args/results).
3. **Add a tool execution wrapper at the repertoire choke-point**
   - Wrap tool handler invocation with:
     - callId generation (monotonic counter or uuid already available in codebase)
     - `emit(tool_start)` before execution
     - `emit(tool_end)` on success (include duration)
     - `emit(tool_error)` on thrown error (include duration) and rethrow
   - Keep tool behavior identical (no swallowing errors, no output changes).
4. **Add tests (no deletions)**
   - Add a new test file under `src/__tests__/repertoire/` that:
     - Executes at least one successful tool call and asserts start/end events were emitted with same callId.
     - Executes a failing tool (or a dummy tool handler that throws) and asserts start/error events were emitted with same callId.
     - Asserts durations are present and non-negative.
5. **Update ARCHITECTURE.md (self-model)**
   - Add a note under `nerves/` or “Known Gaps” that tool execution observability is now standardized via the repertoire wrapper (and where it lives).
6. **Validate locally**
   - Run `npx tsc`, unit tests, and coverage gate.
7. **Commit**
   - One commit with a descriptive message, e.g. “Standardize tool execution observability events (start/end/error)”.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
