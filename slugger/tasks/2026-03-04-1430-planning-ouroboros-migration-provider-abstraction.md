# Planning: Ouroboros Migration - Provider Abstraction

**Status**: NEEDS_REVIEW
**Created**: 2026-03-04 14:30

## Goal
Replace the global provider singleton with a per-agent provider abstraction while preserving current Azure/MiniMax behavior, then add Anthropic setup-token auth support and OpenAI Codex OAuth subscription support as final integration steps, with explicit auth-failure hard-stop behavior and a clean secrets/state path boundary.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Replace `src/heart/core.ts` provider singleton selection (`getClient/getProvider/getModel`) with provider interface + registry.
- Keep Azure and MiniMax runtime behavior parity during the refactor.
- Move provider-specific streaming/input state handling out of the engine loop into provider implementations.
- Add Anthropic provider integration as a final step with setup-token auth profile support (OpenClaw-compatible flow: `claude setup-token` then token paste).
- Add OpenAI Codex provider integration as a final step with OAuth subscription auth profile support (OpenClaw-compatible `openai-codex` flow).
- Update config and agent/provider resolution paths so provider selection is explicit and per-agent.
- Keep `providers` and `teams` blocks in per-agent `config.json` (secrets/config file).
- Move `context` block from `config.json` into each agent's `agent.json` alongside `phrases` and other agent-level runtime settings.
- Reorganize local machine directories so secrets live in `~/.agentsecrets/<agent>/`, while runtime/session/log/PII/test artifacts live in `~/.agentstate/<agent>/` or `~/.agentstate/test-runs/<repo_slug>/`.
- Include one-time migration handling so existing `~/.agentconfigs` data on other machines is migrated safely with explicit operator-visible guidance.
- Add one-time migration behavior for pulled branches on other machines:
  - move legacy `~/.agentconfigs/<agent>/config.json` to `~/.agentsecrets/<agent>/config.json` (providers/teams retained),
  - move legacy runtime directories (`sessions`, `logs`, `friends`, test-run artifacts) into `~/.agentstate/...`,
  - run explicit migration once and then require new paths only (no runtime fallback path support).
- Add a repo migration runbook at `cross-agent-docs/agent-storage-migration-playbook.md` for other agents/Claude to follow after pulling changes.
- Add/adjust tests to maintain 100% coverage on all new code and preserve existing behavior contracts.

### Out of Scope
- OpenRouter integration.
- OpenAI API-key provider integration (deferred follow-up after this task).
- Any ad-hoc reverse-engineered auth hacks outside the documented OpenClaw-compatible setup-token/OAuth profile flows.
- Budget enforcement, dollar-cost accounting, or quota policy changes.
- Daemon/gateway, multi-replica routing, or non-provider architecture expansion.

## Completion Criteria
- [ ] Provider abstraction is in place and engine no longer branches on hardcoded provider names in the request path.
- [ ] Azure and MiniMax behavior is preserved with passing regression tests.
- [ ] Anthropic provider is integrated behind the same provider interface with setup-token auth profile support.
- [ ] OpenAI Codex provider is integrated behind the same provider interface with OAuth auth profile support.
- [ ] Provider selection is per-agent and config-driven (no global singleton lock-in).
- [ ] Secrets/state boundary is enforced (`~/.agentsecrets` for secrets only; runtime/session/log/PII/test artifacts moved to `~/.agentstate`).
- [ ] `config.json` retains `providers` + `teams`; `context` is loaded from `agent.json`.
- [ ] Missing/expired provider credentials fail fast with explicit re-auth guidance; no silent fallback.
- [ ] A migration runbook exists in-repo for cross-machine post-pull reorganization of legacy `~/.agentconfigs` data.
- [ ] Legacy `~/.agentconfigs` data migrates via explicit one-time migration (no runtime back-compat branches in normal execution code), with no data loss and clear operator messages.
- [ ] All relevant docs are updated for the new provider/config/storage contracts (including `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, and `cross-agent-docs/agent-storage-migration-playbook.md`).
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
- [x] OpenAI API-key provider now or deferred: deferred to a follow-up task.
- [x] Config/auth-profile/state boundary: keep `providers` + `teams` in `config.json`; move `context` to `agent.json`; split local storage into `~/.agentsecrets` (secrets) and `~/.agentstate` (runtime/session/log/PII/test artifacts).
- [x] Usage accounting changes in this task: deferred.

## Decisions Made
- No OpenRouter in this task.
- Keep Azure/MiniMax as first-class existing providers and preserve behavior before adding new providers.
- Anthropic setup-token auth flow is explicitly in-scope and modeled after existing OpenClaw behavior.
- OpenAI subscription path is explicitly in-scope via OpenAI Codex OAuth (`openai-codex`) flow.
- Follow repo configuration policy: no environment variables.
- `config.json` keeps `providers` and `teams` blocks; `context` moves into `agent.json`.
- Migration support for other machines is mandatory: legacy `~/.agentconfigs` must be handled with a documented, agent-executable runbook.
- Migration must be safe and deterministic on other machines: no destructive deletes during first migration; prefer move-with-fallback or copy-then-verify semantics.
- Runtime code must stay lean: no long-lived back-compat reads/writes for legacy `~/.agentconfigs` paths after migration.
- Missing/expired credentials must hard-fail with explicit operator/user guidance; no silent fallback behavior.

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
- `/Users/arimendelow/Projects/openclaw/README.md`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/README.md`

## Notes
Keep scope disciplined: runtime provider abstraction + provider integrations only, no additional architecture expansion.

## Progress Log
- 2026-03-04 14:30 Created
- 2026-03-04 14:37 Updated scope to OpenClaw-compatible Anthropic setup-token + OpenAI Codex OAuth flows; set status to NEEDS_REVIEW
- 2026-03-04 14:46 Incorporated user decisions: defer OpenAI API-key, enforce no-silent-fallback auth failures, and split secrets/state paths (`.agentsecrets` + `.agentstate`)
- 2026-03-04 14:54 Locked config layout decisions (`providers` + `teams` stay in config.json; `context` moves to agent.json) and added explicit cross-machine migration runbook requirement
- 2026-03-04 14:55 Added explicit first-run migration semantics for legacy `~/.agentconfigs` on other machines and fixed runbook location for Claude pickup
- 2026-03-04 14:56 Re-scoped migration to one-time only; removed runtime back-compat expectation for legacy `~/.agentconfigs` paths
- 2026-03-04 15:01 Added completion criterion requiring all relevant repo docs to be updated for new config/storage/provider contracts
