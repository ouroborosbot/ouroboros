# Reflection Proposal: No automated “provider adapter conformance” tests, so changes to provider-specific role/tool-call/streaming mappings can silently break behavior across Azure/Anthropic/MiniMax/OpenAI-Codex.

**Generated:** 2026-03-05T11:33:32.000Z
**Effort:** medium
**Constitution check:** requires-review
**Source:** Autonomous reflection cycle

## Gap
No automated “provider adapter conformance” tests, so changes to provider-specific role/tool-call/streaming mappings can silently break behavior across Azure/Anthropic/MiniMax/OpenAI-Codex.

## Proposal
Build a provider conformance test harness that exercises the *shared behavioral contract* expected by `heart/core.ts` from each provider runtime, without requiring real network calls.

Implementation steps:
1. **Define a minimal conformance contract** (doc + types) for provider runtimes:
   - Expected input normalization (system/user/assistant/tool roles)
   - Tool-call request/response shape handling
   - Streaming termination semantics (finish reason, partial deltas)
   - Error mapping expectations (retryable vs fatal, surfaced message)
   - Location: `src/heart/providers/conformance.ts` (types + helper assertions) and a short doc in `ARCHITECTURE.md` (non-constitutional).
2. **Add deterministic fixtures** for common tricky turns:
   - Simple chat turn
   - Tool call + tool result + follow-up assistant response
   - Multi-tool sequence in one turn
   - Streaming with multiple deltas and a final stop
   - Location: `src/__tests__/fixtures/provider-conformance/*.json`
3. **Introduce a “mock transport” layer per provider adapter (test-only)**:
   - Without changing the `ProviderRuntime` interface, expose internal request-building and response-parsing helpers (or re-export them behind a `/** @internal */` boundary) so they can be unit-tested without live credentials.
   - Location: provider modules under `src/heart/providers/*` (small, additive exports only; no changes to `core.ts`).
4. **Write Jest/Vitest conformance tests** that run the same fixture suite against each provider’s build/parse functions:
   - Assert role mapping, tool-call serialization, tool-result reinjection, streaming assembly, and error normalization.
   - Location: `src/__tests__/heart/providers/conformance.test.ts`
5. **Add a CI-friendly “provider unit test” npm script** (if not already present) that runs without secrets and without network.
6. **Follow-up hardening (optional, still within-bounds):** add snapshot/golden assertions for the exact request payload shape each adapter produces, so future refactors show a clear diff instead of a runtime break.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
