# Reflection Proposal: The kick system is implemented but disabled, so the agent lacks a built-in recovery mechanism for “stuck”/degraded turns (tool loops, low-progress responses, repeated failures).

**Generated:** 2026-03-05T10:07:23.364Z
**Effort:** medium
**Constitution check:** requires-review
**Source:** Autonomous reflection cycle

## Gap
The kick system is implemented but disabled, so the agent lacks a built-in recovery mechanism for “stuck”/degraded turns (tool loops, low-progress responses, repeated failures).

## Proposal
Re-enable and harden the kick system behind an explicit, off-by-default feature flag, with minimal and well-tested integration into the turn loop.

Implementation steps:
1. **Inventory existing kick logic**
   - Review `src/heart/kicks.ts` to document what “kicks” exist (e.g., retry, reprompt, degrade-mode, tool-call abort) and what signals they need (error types, token usage, repetition detection, max attempts).
2. **Add a config flag (off by default)**
   - Extend `ouroboros/agent.json` schema (and corresponding config loader) with something like:
     - `kicks.enabled: boolean`
     - `kicks.maxPerTurn: number`
     - `kicks.retryPolicy: { maxRetries, backoffMs }`
3. **Integrate into the agent loop (requires human review)**
   - In `src/heart/core.ts` (or `turn-coordinator.ts` if that’s the correct seam), insert a narrow hook:
     - After a failed provider call or tool error: allow `kicks.ts` to propose a bounded recovery action.
     - After repeated “no-progress” turns: allow a reprompt kick (e.g., “summarize state + ask clarifying question”).
   - Ensure strict limits: never infinite loops; enforce `maxPerTurn` and global “give up” behavior.
4. **Emit observability signals (optional but recommended)**
   - Add a small event in `src/nerves/runtime.ts` like `kick_applied` with reason + count, so debugging is possible.
5. **Add tests**
   - Unit tests for `kicks.ts` decision logic (given inputs → chosen kick / no kick).
   - Integration-style tests around the loop component touched (mock provider/tool failures; assert kicks occur and then terminate within limits).
6. **Documentation**
   - Update `ARCHITECTURE.md` (self-model) to mark kicks as enabled behind a flag and describe when they trigger.

Rationale: This is a resilience multiplier—when providers/tooling misbehave or the agent starts looping, kicks provide a controlled, auditable recovery path instead of silently degrading or burning turns.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
