# Reflection Proposal: Tool execution (especially `shell`) has no built-in timeout/output limits, so a hung process or runaway output can stall the entire agent loop.

**Generated:** 2026-03-05T10:34:20.723Z
**Effort:** medium
**Constitution check:** requires-review
**Source:** Autonomous reflection cycle

## Gap
Tool execution (especially `shell`) has no built-in timeout/output limits, so a hung process or runaway output can stall the entire agent loop.

## Proposal
Implement defensive limits for the core `shell` tool (and optionally `gh_cli`) to prevent indefinite hangs and unbounded output growth.

Implementation steps:
1. **Locate tool implementation**
   - Inspect `src/repertoire/tools-base.ts` (or wherever `shell` is implemented/registered) to find the handler that executes commands.
2. **Extend tool schema (non-breaking)**
   - Add optional parameters to the `shell` tool definition:
     - `timeout_ms?: number` (default e.g. 120_000)
     - `max_output_chars?: number` (default e.g. 200_000)
   - Keep existing behavior when these are omitted (use defaults).
3. **Enforce timeout**
   - If `shell` uses `child_process.exec`/`execFile`, apply the Node timeout option and ensure the process is killed on timeout.
   - If it uses a streaming/spawn approach, implement manual timer + kill signal handling.
4. **Cap output size**
   - Truncate stdout/stderr to `max_output_chars` (and include a clear marker like `...[truncated]`).
   - Ensure truncation happens deterministically (e.g., keep last N chars or first N chars—pick one and document it).
5. **Improve error surface (no new observability system)**
   - On timeout, return a structured error message that clearly states:
     - command
     - timeout used
     - whether the process was killed
6. **Add tests (required)**
   - Unit test: a command that sleeps longer than `timeout_ms` results in a timeout error.
   - Unit test: a command that prints > `max_output_chars` returns truncated output with marker.
   - Unit test: default parameters are applied when none provided.
7. **Documentation**
   - Update any tool README/usage docs (if present) to describe `timeout_ms` and `max_output_chars`.
8. **Commit as one focused change**
   - One commit with a descriptive message (e.g., “Add timeout and output caps to shell tool”).

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
