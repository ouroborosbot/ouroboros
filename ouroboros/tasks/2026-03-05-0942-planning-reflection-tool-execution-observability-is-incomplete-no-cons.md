# Reflection Proposal: Tool execution observability is incomplete (no consistent per-tool start/stop, duration, and error metadata emitted to nerves)

**Generated:** 2026-03-05T09:42:23.073Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Tool execution observability is incomplete (no consistent per-tool start/stop, duration, and error metadata emitted to nerves)

## Proposal
Add first-class, standardized tool execution telemetry emitted from the repertoire tool execution layer (not heart/core), so every tool call produces a consistent “start → end” event pair (or a single span-like event) with duration, status, and sanitized error info.

Implementation steps:
1. **Define a canonical event shape in nerves**
   - Add a new event type (e.g., `tool.execution`) in `src/nerves/runtime.ts` (or wherever event types are declared) with fields like:
     - `toolName`, `callId` (if available), `startedAt`, `endedAt`, `durationMs`
     - `status: "ok" | "error"`
     - `errorName`, `errorMessage` (sanitized/truncated), optional `errorStack` (guarded)
     - `argsSummary` (optional, size-limited; never raw secrets)
2. **Instrument the tool runner in repertoire**
   - In the central tool execution path (likely `src/repertoire/tools.ts` or `tools-base.ts`, wherever a tool is invoked), wrap execution:
     - Emit `tool.execution` start (or record start time)
     - `try/catch/finally` to emit end with `status` + timing
   - Ensure this wrapper is used by *all* tools (core + integrations) without modifying each tool handler individually.
3. **Add safety guards**
   - Add argument/result summarization helpers that:
     - Truncate large strings/objects
     - Avoid logging file contents, auth headers, tokens, etc.
   - Ensure telemetry never includes tool return payloads by default (metadata only).
4. **Tests**
   - Add unit tests under `src/__tests__/repertoire/` validating:
     - Success path emits an “ok” event with duration
     - Error path emits an “error” event with sanitized message
     - Large args are truncated/summarized
5. **Developer ergonomics**
   - Update any existing coverage/audit tooling in `src/nerves/coverage/` (if applicable) to optionally report tool execution counts and failure rates per run.
6. **Documentation**
   - Briefly document the new event in `ARCHITECTURE.md` (observability section) and/or a small note in the relevant module README/comments.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
