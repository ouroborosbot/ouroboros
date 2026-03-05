# Reflection Proposal: Tool execution observability is incomplete (no per-invocation correlation ID, no duration/output metrics, and failures don’t emit a terminal “end” event).

**Generated:** 2026-03-05T09:28:02.169Z
**Effort:** small
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Tool execution observability is incomplete (no per-invocation correlation ID, no duration/output metrics, and failures don’t emit a terminal “end” event).

## Proposal
Improve tool-level telemetry by turning each `execTool()` call into a correlated, timed “span” in Nerves logs, with consistent start/end/error events and safe argument summaries.

Implementation steps:
1. **Add per-invocation trace ID + timing in `execTool`**
   - File: `src/repertoire/tools.ts`
   - At function entry, generate `const toolTraceId = createTraceId()` (import from `src/nerves/index.ts`) and `const startedAt = Date.now()`.
   - Emit `tool.start` with `trace_id: toolTraceId` and `meta` including:
     - `name`
     - `args_summary: summarizeArgs(name, args)` (avoid raw args to reduce secret leakage)
     - `integration` (from the resolved `ToolDefinition`, if present)
     - `channel` (from `ctx?.context?.channel?.channel`, if present)

2. **Emit a guaranteed terminal event**
   - Still emit `tool.error` on exceptions, but also ensure a `tool.end` is emitted in a `finally` block with:
     - `success: true|false`
     - `duration_ms: Date.now() - startedAt`
     - `output_chars_full` (on success: `result.length`; on failure: omit or set to 0)
   - Ensure `tool.start`, `tool.error`, and `tool.end` share the same `trace_id` for easy correlation.

3. **Add tests to lock the behavior**
   - New file: `src/__tests__/repertoire/tools-observability.test.ts`
   - Use `setRuntimeLogger()` with a capturing sink to collect emitted events.
   - Success case: call `execTool("list_directory", { path: <tempDir> })` and assert:
     - exactly one `tool.start` and one `tool.end`
     - same `trace_id` on both
     - `tool.end.meta.duration_ms` is a number ≥ 0
     - `tool.start.meta.args_summary` is present and does not include unexpected raw data
   - Failure case: call `execTool("read_file", { path: "definitely-missing" })`, catch the throw, and assert:
     - a `tool.error` event exists
     - a `tool.end` event exists with `success: false`
     - same `trace_id` across the invocation’s events

4. **(Optional, still within-bounds) Document the event contract**
   - Add a short note to `ARCHITECTURE.md` (or a Nerves docs snippet) describing `tool.start/tool.end/tool.error` required fields so future tools stay consistent.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
