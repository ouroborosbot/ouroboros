# Planning: Ouroboros Migration - Provider Abstraction

**Status**: NEEDS_REVIEW
**Created**: 2026-03-04 14:30

## Goal
Replace the global provider singleton with a per-agent provider abstraction while preserving current Azure/MiniMax behavior, then add Anthropic setup-token auth support and OpenAI Codex OAuth subscription support as final integration steps, with explicit auth-failure hard-stop behavior and a clean secrets/state path boundary.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Run storage/config refactor first so provider abstraction work targets final paths/contracts from the start.
- Replace `src/heart/core.ts` provider singleton selection (`getClient/getProvider/getModel`) with provider interface + registry.
- Keep Azure and MiniMax runtime behavior parity during the refactor.
- Move provider-specific streaming/input state handling out of the engine loop into provider implementations.
- Add a pre-Unit-5 provider maintainability pass that extracts provider-specific runtime logic from `src/heart/core.ts` into `src/heart/providers/{anthropic,azure,minimax}.ts` with no behavior change.
- Add a pre-Unit-5 logging channel separation pass so CLI user-facing text remains clean while nerves logs route to operator-native sinks (append-only NDJSON persistence under `~/.agentstate/<agent>/logs` and non-user-facing stderr sink behavior).
- Add Anthropic provider integration as a final step with setup-token auth profile support (OpenClaw-compatible flow: `claude setup-token` then token paste).
- Add OpenAI Codex provider integration as a final step with OAuth subscription auth profile support (OpenClaw-compatible `openai-codex` flow).
- Define mandatory manual validation gates for Anthropic setup-token and OpenAI Codex OAuth using real auth profiles, with operator-readable evidence artifacts.
- Update config and agent/provider resolution paths so provider selection is explicit and per-agent.
- Keep `providers` and `teams` blocks in per-agent `secrets.json` (secrets/config file).
- Move `context` block from `secrets.json` into each agent's `agent.json` alongside `phrases` and other agent-level runtime settings.
- Treat agent manifest path as explicit contract: `<repo>/<agent>/agent.json` (for example `/Users/arimendelow/Projects/ouroboros-agent-harness/slugger/agent.json`).
- Reorganize local machine directories so secrets live in `~/.agentsecrets/<agent>/`, while runtime/session/log/PII/test artifacts live in `~/.agentstate/<agent>/` or `~/.agentstate/test-runs/<repo_slug>/`.
- Treat secrets path as explicit contract: `agent.json.configPath = ~/.agentsecrets/<agent>/secrets.json`.
- Include one-time migration guidance so existing `~/.agentconfigs` data on other machines can be migrated safely with explicit operator-visible instructions.
- Define one-time migration instructions for pulled branches on other machines:
  - move legacy `~/.agentconfigs/<agent>/config.json` to `~/.agentsecrets/<agent>/secrets.json` (providers/teams retained),
  - move legacy runtime directories (`sessions`, `logs`, `friends`, test-run artifacts) into `~/.agentstate/...`,
  - run explicit manual migration once and then require new paths only (no runtime fallback path support).
- Add a repo migration runbook at `cross-agent-docs/agent-storage-migration-playbook.md` for other agents/Claude to follow after pulling changes.
- Migration delivery is docs-only: no migration script. The runbook must include explicit move instructions, rationale, and verification steps. Cleanup/removal of the playbook is decided by the other machine once migration is confirmed complete there.
- Lock provider identifiers for this task to: `azure`, `minimax`, `anthropic`, `openai-codex`.
- Model handling in this task is explicit but minimal: keep one configured model per provider in `secrets.json` (existing Azure/MiniMax parity + new Anthropic/OpenAI Codex fields); no additional model-selection feature work.
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
- [ ] Anthropic setup-token flow is manually validated end-to-end (real profile, not mocks) with evidence captured in task artifacts.
- [ ] OpenAI Codex OAuth flow is manually validated end-to-end (real profile, not mocks) with evidence captured in task artifacts.
- [ ] Provider selection is per-agent and config-driven (no global singleton lock-in).
- [ ] Provider-specific implementation logic is extracted from `src/heart/core.ts` into `src/heart/providers/*` modules before Unit 5 work, with behavior parity confirmed by tests.
- [ ] CLI channel output keeps user-visible plain text separate from nerves logs (no raw NDJSON log events interleaved in stdout model responses).
- [ ] Nerves logs remain machine-readable and persistent (append-only NDJSON) for multi-agent auditing and runtime validation.
- [ ] Secrets/state boundary is enforced (`~/.agentsecrets` for secrets only; runtime/session/log/PII/test artifacts moved to `~/.agentstate`).
- [ ] `secrets.json` retains `providers` + `teams`; `context` is loaded from `agent.json`.
- [ ] `agent.json.configPath` resolves to `~/.agentsecrets/<agent>/secrets.json`.
- [ ] Missing/expired provider credentials fail fast with explicit re-auth guidance; no silent fallback.
- [ ] A migration runbook exists in-repo for cross-machine post-pull reorganization of legacy `~/.agentconfigs` data.
- [ ] Legacy `~/.agentconfigs` migration is fully documented as a one-time manual operation for other machines (no runtime back-compat branches in normal execution code), with no data loss and clear operator guidance.
- [ ] Storage/config refactor executes before provider abstraction refactor work so implementation targets final storage/config contracts.
- [ ] Actual cross-machine data migration is out-of-band from this task's code execution and handled via the migration runbook instructions.
- [ ] Migration runbook is docs-only (no script) and includes explicit move/verify instructions for the other machine.
- [ ] Provider IDs are explicitly locked and implemented as `azure`, `minimax`, `anthropic`, `openai-codex`.
- [ ] Model fields are explicitly supported for each in-scope provider via `secrets.json` without introducing additional model-selection features.
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
- [x] Config/auth-profile/state boundary: keep `providers` + `teams` in `secrets.json`; move `context` to `agent.json`; split local storage into `~/.agentsecrets` (secrets) and `~/.agentstate` (runtime/session/log/PII/test artifacts).
- [x] Provider/model contract detail level: lock provider IDs and keep minimal per-provider model config support in `secrets.json` with no extra model-feature scope.
- [x] Usage accounting changes in this task: deferred.

## Decisions Made
- No OpenRouter in this task.
- Keep Azure/MiniMax as first-class existing providers and preserve behavior before adding new providers.
- Anthropic setup-token auth flow is explicitly in-scope and modeled after existing OpenClaw behavior.
- OpenAI subscription path is explicitly in-scope via OpenAI Codex OAuth (`openai-codex`) flow.
- Follow repo configuration policy: no environment variables.
- `secrets.json` keeps `providers` and `teams` blocks; `context` moves into `agent.json`.
- `agent.json` location is explicit and fixed per agent: `<repo>/<agent>/agent.json`.
- `agent.json.configPath` points to `~/.agentsecrets/<agent>/secrets.json`.
- Migration support for other machines is mandatory: legacy `~/.agentconfigs` must be handled with a documented, agent-executable runbook.
- Provider IDs in scope are fixed: `azure`, `minimax`, `anthropic`, `openai-codex`.
- Model support in scope is minimal: per-provider configured model fields in `secrets.json`, no additional model orchestration work.
- Runtime code must stay lean: no long-lived back-compat reads/writes for legacy `~/.agentconfigs` paths after migration.
- Migration is manual-doc guided (Claude executes instructions from markdown); no dedicated migration script will be added.
- Missing/expired credentials must hard-fail with explicit operator/user guidance; no silent fallback behavior.
- Anthropic setup-token and OpenAI Codex OAuth require explicit manual end-to-end validation gates before task completion is accepted.
- Before OpenAI Codex Unit 5 work, perform a focused maintainability pass to split provider-specific runtime code out of `src/heart/core.ts` into `src/heart/providers/*`, preserving current behavior.
- CLI observability is a cross-channel contract: user-facing text stays on channel-native output (stdout for CLI), while structured nerves logs go to operator-native sinks (append-only NDJSON persistence and non-user-facing stderr/file sinks), never as user-visible transcript text.

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
- 2026-03-04 15:08 Reordered work so migration happens first; constrained migration delivery to markdown instructions only (no script), including post-completion deletion of the migration playbook on target machine
- 2026-03-04 15:10 Made `agent.json` path explicit in plan (`<repo>/<agent>/agent.json`) to remove migration ambiguity
- 2026-03-04 15:16 Renamed config target to `secrets.json`, locked `agent.json.configPath`, and clarified minimal provider/model contract (`azure|minimax|anthropic|openai-codex`)
- 2026-03-04 15:25 User approved planning doc for conversion to doing
- 2026-03-04 15:32 Clarified that this task performs storage/config refactor before provider abstraction; legacy data migration itself is manual out-of-band via runbook
- 2026-03-04 15:35 Added mandatory manual validation gates for Anthropic setup-token and OpenAI Codex OAuth with artifact evidence requirements
- 2026-03-05 02:17 Added pre-Unit-5 planning scope for provider module extraction and CLI log/user-output separation; set status to NEEDS_REVIEW
