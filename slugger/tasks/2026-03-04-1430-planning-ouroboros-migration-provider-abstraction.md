# Planning: Ouroboros Migration - Provider Abstraction

**Status**: NEEDS_REVIEW
**Created**: 2026-03-04 14:30

## Goal
Replace the global provider singleton with a per-agent provider abstraction while preserving current Azure/MiniMax behavior, then add Anthropic setup-token auth support and OpenAI Codex OAuth subscription support as final integration steps.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Replace `src/heart/core.ts` provider singleton selection (`getClient/getProvider/getModel`) with provider interface + registry.
- Keep Azure and MiniMax runtime behavior parity during the refactor.
- Move provider-specific streaming/input state handling out of the engine loop into provider implementations.
- Add Anthropic provider integration as a final step with setup-token auth profile support (OpenClaw-compatible flow: `claude setup-token` then token paste).
- Add OpenAI Codex provider integration as a final step with OAuth subscription auth profile support (OpenClaw-compatible `openai-codex` flow).
- Update config and agent/provider resolution paths so provider selection is explicit and per-agent.
- Add/adjust tests to maintain 100% coverage on all new code and preserve existing behavior contracts.

### Out of Scope
- OpenRouter integration.
- Any ad-hoc reverse-engineered auth hacks outside the documented OpenClaw-compatible setup-token/OAuth profile flows.
- Budget enforcement, dollar-cost accounting, or quota policy changes.
- Daemon/gateway, multi-replica routing, or non-provider architecture expansion.

## Completion Criteria
- [ ] Provider abstraction is in place and engine no longer branches on hardcoded provider names in the request path.
- [ ] Azure and MiniMax behavior is preserved with passing regression tests.
- [ ] Anthropic provider is integrated behind the same provider interface with setup-token auth profile support.
- [ ] OpenAI Codex provider is integrated behind the same provider interface with OAuth auth profile support.
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
- [ ] Confirm whether OpenAI API-key provider is included now or deferred, since current approved scope targets OpenAI Codex OAuth subscription flow.
- [ ] Confirm final provider config/auth-profile shape for Anthropic setup-token and OpenAI Codex OAuth in `config.json` + agent-level settings (no env-var requirement for operation).
- [ ] Confirm whether usage accounting changes are explicitly deferred in this task even if touched code surfaces easy hooks.

## Decisions Made
- No OpenRouter in this task.
- Keep Azure/MiniMax as first-class existing providers and preserve behavior before adding new providers.
- Anthropic setup-token auth flow is explicitly in-scope and modeled after existing OpenClaw behavior.
- OpenAI subscription path is explicitly in-scope via OpenAI Codex OAuth (`openai-codex`) flow.
- Follow repo configuration policy: no environment variables.

## Context / References
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/provider-abstraction.md`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/heart/core.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/heart/streaming.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/config.ts`
- `/Users/arimendelow/Projects/openclaw/src/commands/auth-choice.apply.anthropic.ts`
- `/Users/arimendelow/Projects/openclaw/src/commands/auth-token.ts`
- `/Users/arimendelow/Projects/openclaw/src/commands/openai-codex-oauth.ts`
- `/Users/arimendelow/Projects/openclaw/src/commands/auth-choice.apply.openai.ts`
- `/Users/arimendelow/Projects/openclaw/src/agents/model-forward-compat.ts`

## Notes
Keep scope disciplined: runtime provider abstraction + provider integrations only, no additional architecture expansion.

## Progress Log
- 2026-03-04 14:30 Created
- 2026-03-04 14:37 Updated scope to OpenClaw-compatible Anthropic setup-token + OpenAI Codex OAuth flows; set status to NEEDS_REVIEW
