# Reflection Proposal: Tool execution observability is incomplete (no consistent start/end/error events with timing and correlation IDs for every tool call)

**Generated:** 2026-03-05T09:32:47.452Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Tool execution observability is incomplete (no consistent start/end/error events with timing and correlation IDs for every tool call)

## Proposal
Implement first-class tool execution telemetry in the repertoire layer so every tool call emits structured observability events (start/end/error) without touching `heart/core.ts`.

Implementation steps:
1. **Locate the single tool dispatch point** in `src/repertoire/` (likely `tools.ts` or a shared executor used by all tool handlers) and confirm where tool calls are invoked and results/errors are returned.
2. **Add a small telemetry wrapper** around tool execution:
   - Generate a `toolCallId` (uuid or deterministic counter) per invocation.
   - Record `toolName`, sanitized argument metadata (e.g., keys only, not full contents for sensitive fields), and a monotonic `startTime`.
   - Emit `nerves` events:
     - `tool.exec.start` `{ toolCallId, toolName, ts, argSummary }`
     - `tool.exec.end` `{ toolCallId, toolName, ts, durationMs, resultSummary }`
     - `tool.exec.error` `{ toolCallId, toolName, ts, durationMs, errorName, errorMessage }`
3. **Add result/argument summarizers** in `src/repertoire/` to avoid leaking secrets or huge payloads:
   - For file tools: log path(s) + byte counts, not file contents.
   - For shell: log command length + exit code, not full stdout/stderr by default.
   - For git/gh: log subcommand + status, not full response bodies unless already safe.
4. **Wire into existing `nerves/` runtime emitter** (whatever `emit()` abstraction exists) from the repertoire executor; do not add new dependencies.
5. **Add tests** under `src/__tests__/repertoire/`:
   - Verify `tool.exec.start` and `tool.exec.end` emitted on success (including durationMs present).
   - Verify `tool.exec.start` and `tool.exec.error` emitted on thrown/rejected tool execution.
   - Verify redaction/summarization rules (no raw file contents or full stdout logged).
6. **Update documentation**:
   - Add a short section to `ARCHITECTURE.md` under `nerves/` describing the new tool telemetry events and expected payload shape.
7. **Acceptance criteria**:
   - All tool invocations produce exactly one start and one terminal event (end or error).
   - No secrets or large payloads are emitted by default.
   - `npx tsc` passes and tests pass with no coverage regression.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
