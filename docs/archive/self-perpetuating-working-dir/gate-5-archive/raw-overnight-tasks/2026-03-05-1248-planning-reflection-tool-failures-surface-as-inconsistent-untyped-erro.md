# Reflection Proposal: Tool failures surface as inconsistent, untyped errors (raw exceptions/strings), making it hard to produce good user hints, make retry decisions, and debug failures uniformly.

**Generated:** 2026-03-05T12:48:13.739Z
**Effort:** medium
**Constitution check:** requires-review
**Source:** Autonomous reflection cycle

## Gap
Tool failures surface as inconsistent, untyped errors (raw exceptions/strings), making it hard to produce good user hints, make retry decisions, and debug failures uniformly.

## Proposal
Implement a small, shared “tool error taxonomy” and adopt it across core tools so every tool failure has a consistent shape (`code`, `toolName`, `retryable`, `cause`, `details`), plus a human-readable hint.

Implementation steps:
1. **Add structured error types**
   - Create `src/repertoire/tool-errors.ts` exporting:
     - `ToolErrorCode` enum (e.g., `TIMEOUT`, `NOT_FOUND`, `PERMISSION_DENIED`, `INVALID_INPUT`, `NON_ZERO_EXIT`, `RATE_LIMITED`, `NETWORK`, `UNKNOWN`)
     - `ToolExecutionError extends Error` with fields: `toolName`, `code`, `retryable`, `hint?`, `details?`, `cause?`
     - Helper `toToolExecutionError(toolName, err, context)` that normalizes common Node/process errors (`ENOENT`, `EACCES`, exit codes, JSON parse errors, etc.).
2. **Wrap core tool implementations to always throw `ToolExecutionError`**
   - Update `src/repertoire/tools-base.ts` (and any other core tool file where errors currently bubble raw):
     - `shell`: map non-zero exit to `NON_ZERO_EXIT` with captured `exitCode` and truncated `stderr`; mark retryable only for certain codes (e.g., 124/ETIMEDOUT-like cases if you implement timeouts later).
     - `read_file`: map `ENOENT`→`NOT_FOUND`, `EACCES`→`PERMISSION_DENIED`.
     - `write_file`: map path/permission errors similarly.
     - `git_commit` / `gh_cli`: map common auth / rate limit / not-a-repo cases where detectable.
3. **(Optional but low-risk) Normalize tool error rendering**
   - Add a small formatter `formatToolError(e)` to produce a concise, consistent message the agent can include in responses without dumping noisy stacks.
4. **Add tests**
   - Create `src/__tests__/repertoire/tool-errors.test.ts` covering:
     - `ENOENT` → `NOT_FOUND` with correct `toolName`
     - shell non-zero exit → `NON_ZERO_EXIT` includes `exitCode`
     - unknown error → `UNKNOWN` preserves `cause`
   - Add targeted tests for one or two tools (e.g., `read_file` missing path; `shell` running `exit 2`) asserting the thrown error is `ToolExecutionError`.
5. **Adopt incrementally**
   - Ensure all existing callers still work (errors are still `throw`n) but are now machine-classifiable; avoid changing public interfaces beyond error type enrichment.
6. **Document**
   - Add a short section to `ARCHITECTURE.md` (or a small doc under `src/repertoire/`) describing the taxonomy and when to mark errors `retryable`.

This is within-bounds: it’s a reliability/diagnostics improvement in `repertoire/` with tests, without restructuring `heart/` or changing provider contracts.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
