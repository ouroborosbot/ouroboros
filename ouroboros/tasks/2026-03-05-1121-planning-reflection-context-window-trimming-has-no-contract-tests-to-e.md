# Reflection Proposal: Context-window trimming has no contract tests to ensure it preserves critical message invariants (system + tool-call coherence), risking subtle “broken context” failures under long conversations.

**Generated:** 2026-03-05T11:21:56.495Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Context-window trimming has no contract tests to ensure it preserves critical message invariants (system + tool-call coherence), risking subtle “broken context” failures under long conversations.

## Proposal
Add automated, invariant-focused tests (and light runtime assertions) for `mind/context.ts` trimming logic so long-turn behavior stays reliable as the codebase evolves.

Implementation steps:
1. Inspect `src/mind/context.ts` and identify the public trimming entrypoints (e.g., `trimMessages`) and any helper functions that decide what to drop/keep.
2. Define an explicit “trimming contract” as test invariants (documented in the test file), such as:
   - System messages are never removed (or: only removed under an explicit flag, if supported).
   - Message ordering is preserved.
   - The most recent user message is preserved.
   - Tool call coherence is preserved: if an assistant message contains a tool call, the corresponding tool result message(s) are retained (no orphaned tool results; no dangling tool calls).
   - No invalid role sequences are created (e.g., tool result without preceding tool call).
3. Create a new test suite (e.g., `src/__tests__/mind/context.test.ts`) with:
   - Targeted unit tests for known edge cases (many system messages, alternating roles, long tool chains, nested tool usage, etc.).
   - A small fuzz/property-style test that generates random valid conversations (including tool-call/result pairs), runs trimming at various limits, and checks invariants.
4. (Optional but recommended) Add minimal runtime assertions in `context.ts` behind a dev/debug guard (e.g., `process.env.OUROBOROS_ASSERT_CONTEXT === "1"`) to validate invariants post-trim during local debugging—no behavior change in production by default.
5. Run `npx tsc` + full test suite; ensure coverage increases or remains stable.
6. Add a brief note to `ARCHITECTURE.md` (or a small inline doc comment in `context.ts`) describing the trimming contract so future changes don’t accidentally violate it.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
