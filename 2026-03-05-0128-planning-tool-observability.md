# Planning: Tool Execution Observability (Correlated Spans)

**Status**: drafting
**Created**: 2026-03-05 01:28

## Goal
Improve tool execution observability by emitting correlated start/end/error telemetry for each `execTool()` invocation, including a per-invocation trace ID, duration, and safe argument summaries.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Add a per-invocation `trace_id` and timing to `execTool()`.
- Emit consistent `tool.start`, `tool.error`, and guaranteed terminal `tool.end` events with shared `trace_id`.
- Ensure failures still produce a `tool.end` event (`success: false`).
- Add automated tests that lock in the event contract and correlation behavior.
- Ensure new code meets 100% coverage requirements.

### Out of Scope
- Broad redesign of Nerves logging/telemetry infrastructure beyond the events emitted by `execTool()`.
- Persisting traces to an external APM system.
- Adding per-tool custom metrics beyond what is needed for correlation (trace_id), duration, and minimal output sizing.
- Retrofitting legacy tool callers outside `execTool()`.

## Completion Criteria
- [ ] Each `execTool()` invocation emits exactly one `tool.start` and exactly one `tool.end` event.
- [ ] `tool.start`, `tool.error` (when applicable), and `tool.end` share the same per-invocation `trace_id`.
- [ ] `tool.end` is emitted from a `finally`-style path even when `execTool()` throws.
- [ ] `tool.end.meta.duration_ms` is present and is a number ≥ 0.
- [ ] `tool.start.meta.args_summary` uses a safe summary (no raw args / no secret leakage).
- [ ] On success, `tool.end.meta.output_chars_full` reflects the returned string length (or an agreed representation); on failure it is omitted or 0 (as decided).
- [ ] New tests cover both success and failure cases and validate correlation and terminal events.
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions
- [ ] What is the canonical event shape for Nerves log events (field names like `trace_id`, `meta`, `name`)? Confirm existing conventions.
- [ ] Does `createTraceId()` already exist and is it the right source for tool correlation IDs? If not, what is the preferred ID generator?
- [ ] Does `summarizeArgs(name, args)` exist today? If not, should it be implemented in `src/repertoire/tools.ts` or elsewhere?
- [ ] Is tool output always a string (`result.length`)? If output may be non-string, what is the correct "output size" metric?
- [ ] Where should `integration` be sourced from in the resolved `ToolDefinition`, and what should the field be named if missing?
- [ ] Should the docs update (event contract) be required for this change, or optional?

## Decisions Made
- Emit a per-invocation `trace_id` and duration as part of tool telemetry to enable correlation and performance visibility.
- Use an args summary (not raw args) in `tool.start` to reduce the chance of leaking secrets.

## Context / References
- `src/repertoire/tools.ts` — `execTool()` implementation (target for telemetry)
- `src/nerves/index.ts` — expected source of `createTraceId()`
- Proposed event names: `tool.start`, `tool.error`, `tool.end`
- Proposed test location: `src/__tests__/repertoire/tools-observability.test.ts`

## Notes
Keep telemetry events consistent and safe by default; tests should assert correlation and terminal-event guarantees.

## Progress Log
- 2026-03-05 01:28 Created
- 2026-03-05 01:29 Set Created timestamp
