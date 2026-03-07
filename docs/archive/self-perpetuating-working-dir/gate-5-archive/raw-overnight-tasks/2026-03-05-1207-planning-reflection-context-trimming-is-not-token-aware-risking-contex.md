# Reflection Proposal: Context trimming is not token-aware, risking context overflows or over-trimming depending on provider/model.

**Generated:** 2026-03-05T12:07:09.926Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Context trimming is not token-aware, risking context overflows or over-trimming depending on provider/model.

## Proposal
Implement token-budget–aware context management in `mind/context.ts` (without adding new npm dependencies) so the agent trims history based on estimated token usage rather than message count/size heuristics.

Implementation steps:
1. **Audit current behavior**
   - Review `src/mind/context.ts` `trimMessages` logic to confirm it trims by message count/length rather than an explicit token budget.
2. **Add a lightweight token estimator (no new deps)**
   - Create `estimateTokensForMessage(msg)` and `estimateTokensForMessages(msgs)` in `src/mind/context.ts` (or a small helper like `src/mind/token-estimate.ts`).
   - Use a conservative heuristic (e.g., `ceil(chars / 4)`) plus a small per-message overhead for role/metadata to reduce overflow risk.
3. **Make trimming explicitly budget-driven**
   - Update `trimMessages` to accept a `maxContextTokens` (or reuse existing context limit config if already present).
   - Trim oldest *non-critical* messages first while preserving invariants (at minimum: system message(s) + most recent turns + any tool-call/response pairs that must remain coherent).
4. **Provider/model safety margin**
   - Add a configurable safety margin (e.g., keep usage under `maxContextTokens * 0.9`) to account for estimator error and provider-specific hidden tokens.
5. **Contract tests**
   - Add tests under `src/__tests__/mind/context.test.ts` verifying:
     - The trimmed set stays under the budget (by estimator).
     - System messages are preserved.
     - Recent messages are preserved preferentially.
     - Tool-call + tool-result coherence is preserved (don’t drop one without the other).
6. **Telemetry hook (optional, within existing patterns)**
   - If `nerves/` already logs context events, add a small debug event (estimated tokens before/after trim) to make future debugging easier—without changing public interfaces.
7. **Run gates**
   - Ensure `npx tsc` passes, unit tests pass, and coverage does not drop.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
