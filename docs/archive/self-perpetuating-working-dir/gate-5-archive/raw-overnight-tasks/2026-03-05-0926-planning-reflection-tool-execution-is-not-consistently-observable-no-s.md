# Reflection Proposal: Tool execution is not consistently observable (no standardized start/end/duration/error events across all tools), making debugging and performance tuning hard.

**Generated:** 2026-03-05T09:26:48.389Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Tool execution is not consistently observable (no standardized start/end/duration/error events across all tools), making debugging and performance tuning hard.

## Proposal
Add first-class “tool execution telemetry” to the `nerves/` event system and wire it through the tool dispatch layer so every tool call emits structured start/end/error events (with timing and minimal metadata). This improves debuggability without changing core architecture (no provider interface changes, no `heart/core.ts` restructuring).

Implementation steps:
1. **Define new event types**
   - Update `src/nerves/runtime.ts` to add event typings (or equivalents) for:
     - `tool:begin` (toolName, callId, timestamp, argSize/keys summary)
     - `tool:end` (toolName, callId, timestamp, durationMs, resultSize summary)
     - `tool:error` (toolName, callId, timestamp, durationMs, errorName/message)
2. **Emit events from the tool execution path**
   - Identify the common tool dispatch/handler invocation point (likely in `src/repertoire/tools-base.ts` or wherever tool handlers are centrally executed).
   - Wrap tool invocation with timing:
     - emit `tool:begin`
     - try execute
     - emit `tool:end` on success
     - emit `tool:error` on failure, then rethrow
   - Ensure summaries do not log secrets: record only sizes/keys, not raw args/results.
3. **Add tests**
   - Add a new test file in `src/__tests__/nerves/` (e.g. `tool-telemetry.test.ts`).
   - Use a stub tool handler to verify:
     - correct event ordering (begin → end)
     - duration is recorded and non-negative
     - errors produce begin → error and rethrow
4. **Add a small developer-facing utility (optional but cheap)**
   - Add a simple CLI/debug function (e.g. in `src/nerves/coverage/` or a new `src/nerves/debug/`) that prints a per-tool count + avg duration summary when running in dev mode.
5. **Documentation update**
   - Update `ARCHITECTURE.md` (nerves section) to mention tool telemetry events and how to consume them.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
