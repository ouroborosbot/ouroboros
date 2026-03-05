# Reflection Proposal: No deterministic “scripted runtime” harness to regression-test multi-turn tool-call flows (including streaming) without real providers/APIs

**Generated:** 2026-03-05T16:08:32.580Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
No deterministic “scripted runtime” harness to regression-test multi-turn tool-call flows (including streaming) without real providers/APIs

## Proposal
Add a test-only, deterministic replay harness that can simulate provider outputs (assistant text, tool calls, partial streaming chunks, and errors) and validate that the existing turn coordination + tool dispatch logic produces correct transcripts and tool invocation sequences. This closes a major reliability gap: today, many failures in multi-step tool flows are only catchable via live runs against real providers, which is slow, flaky, and hard to reproduce.

Implementation steps:
1. **Create a scripted “fake provider stream” utility (test-only)**
   - Add `src/__tests__/fixtures/scripted-provider.ts` (or `src/heart/testing/scripted-provider.ts` if you have a testing utilities folder).
   - Represent a provider turn as a sequence of events: `{type: "text"|"tool_call"|"tool_result"|"error"|"done", ...}` with optional streaming chunk boundaries.
2. **Add a lightweight tool-executor stub for tests**
   - In `src/__tests__/fixtures/scripted-tools.ts`, implement a predictable map of tool handlers (sync/async), including failure injection and call recording.
3. **Write regression tests for core interaction patterns (no real provider calls)**
   - Add `src/__tests__/heart/turn-coordinator.replay.test.ts`:
     - tool call emitted → tool executed → tool result returned → assistant continues
     - multiple tool calls in one turn (serial)
     - tool failure path (exception) produces consistent error surfacing
     - streaming text + tool call interleaving does not corrupt final assistant message ordering
4. **Add at least one “golden transcript” test**
   - Store an expected transcript snapshot (messages + tool invocations) and assert exact equality to catch subtle ordering regressions.
5. **Wire into existing test runner**
   - Ensure tests run under current `npm test`/CI path with no new dependencies.
6. **Document the harness**
   - Add a short README section in `src/__tests__/fixtures/README.md` describing how to author new scripted scenarios and what invariants to assert.

This stays within bounds because it adds test infrastructure and deterministic regression coverage without restructuring `heart/core.ts` or changing provider interfaces.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
