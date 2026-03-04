# Planning: Ouroboros Migration - Provider Abstraction

**Status**: drafting
**Created**: 2026-03-04 14:30

## Goal
Replace the global provider singleton with a per-agent provider abstraction while preserving current Azure/MiniMax behavior, then add Anthropic and OpenAI providers through explicit config-driven integration.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Replace `src/heart/core.ts` provider singleton selection (`getClient/getProvider/getModel`) with provider interface + registry.
- Keep Azure and MiniMax runtime behavior parity during the refactor.
- Move provider-specific streaming/input state handling out of the engine loop into provider implementations.
- Add Anthropic provider integration as a final step, using supported API-based authentication configured via repo-approved config files (no env vars).
- Add OpenAI provider integration as a final step, using supported API-based authentication configured via repo-approved config files (no env vars).
- Update config and agent/provider resolution paths so provider selection is explicit and per-agent.
- Add/adjust tests to maintain 100% coverage on all new code and preserve existing behavior contracts.

### Out of Scope
- OpenRouter integration.
- Any token/session spoofing, reverse-engineering, or reuse of consumer web/app subscriptions as API credentials.
- Budget enforcement, dollar-cost accounting, or quota policy changes.
- Daemon/gateway, multi-replica routing, or non-provider architecture expansion.

## Completion Criteria
- [ ] Provider abstraction is in place and engine no longer branches on hardcoded provider names in the request path.
- [ ] Azure and MiniMax behavior is preserved with passing regression tests.
- [ ] Anthropic provider is integrated behind the same provider interface and can be selected via config.
- [ ] OpenAI provider is integrated behind the same provider interface and can be selected via config.
- [ ] Provider selection is per-agent and config-driven (no global singleton lock-in).
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
- [ ] Confirm auth contract for new providers: official API credential paths only, with no consumer-session spoofing.
- [ ] Confirm final provider config shape for Anthropic/OpenAI fields in `config.json` and `agent.json` (including model selection).
- [ ] Confirm whether usage accounting changes are explicitly deferred in this task even if touched code surfaces easy hooks.

## Decisions Made
- No OpenRouter in this task.
- Keep Azure/MiniMax as first-class existing providers and preserve behavior before adding new providers.
- Follow repo configuration policy: no environment variables.

## Context / References
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/provider-abstraction.md`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/heart/core.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/heart/streaming.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/config.ts`

## Notes
Keep scope disciplined: runtime provider abstraction + provider integrations only, no additional architecture expansion.

## Progress Log
- 2026-03-04 14:30 Created
