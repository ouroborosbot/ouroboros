# Doing: Ouroboros Migration - Provider Abstraction

**Status**: drafting
**Execution Mode**: pending
**Created**: 2026-03-04 15:27
**Planning**: ./2026-03-04-1430-planning-ouroboros-migration-provider-abstraction.md
**Artifacts**: ./2026-03-04-1430-doing-ouroboros-migration-provider-abstraction/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Replace the global provider singleton with a per-agent provider abstraction while preserving current Azure/MiniMax behavior, then add Anthropic setup-token auth support and OpenAI Codex OAuth subscription support as final integration steps, with explicit auth-failure hard-stop behavior and a clean secrets/state path boundary.

## Completion Criteria
- [ ] Provider abstraction is in place and engine no longer branches on hardcoded provider names in the request path.
- [ ] Azure and MiniMax behavior is preserved with passing regression tests.
- [ ] Anthropic provider is integrated behind the same provider interface with setup-token auth profile support.
- [ ] OpenAI Codex provider is integrated behind the same provider interface with OAuth auth profile support.
- [ ] Provider selection is per-agent and config-driven (no global singleton lock-in).
- [ ] Secrets/state boundary is enforced (`~/.agentsecrets` for secrets only; runtime/session/log/PII/test artifacts moved to `~/.agentstate`).
- [ ] `secrets.json` retains `providers` + `teams`; `context` is loaded from `agent.json`.
- [ ] `agent.json.configPath` resolves to `~/.agentsecrets/<agent>/secrets.json`.
- [ ] Missing/expired provider credentials fail fast with explicit re-auth guidance; no silent fallback.
- [ ] A migration runbook exists in-repo for cross-machine post-pull reorganization of legacy `~/.agentconfigs` data.
- [ ] Legacy `~/.agentconfigs` data migrates via explicit one-time migration (no runtime back-compat branches in normal execution code), with no data loss and clear operator messages.
- [ ] Migration executes before provider abstraction refactor work so implementation targets final storage/config contracts.
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

## TDD Requirements
**Strict TDD — no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation
2. **Verify failure**: Run tests, confirm they FAIL (red)
3. **Minimal implementation**: Write just enough code to pass
4. **Verify pass**: Run tests, confirm they PASS (green)
5. **Refactor**: Clean up, keep tests green
6. **No skipping**: Never write implementation without failing test first

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

**CRITICAL: Every unit header MUST start with status emoji (⬜ for new units).**

### ⬜ Unit 0: Baseline and file map
**What**: Capture current branch baseline for provider/config/loading code paths and current tests before edits.
**Output**: Baseline notes file in artifacts directory with command outputs and touched-file map.
**Acceptance**: Baseline artifact exists and identifies all files to change for migration, provider abstraction, and provider integrations.

### ⬜ Unit 1a: Storage/config migration docs and contracts — Tests
**What**: Add/adjust tests that define required path and config contracts (`agent.json`, `secrets.json`, `.agentstate`) including failure cases for missing contracts.
**Acceptance**: New/updated tests exist and fail red against current behavior.

### ⬜ Unit 1b: Storage/config migration docs and contracts — Implementation
**What**: Implement path contract changes and config-loading updates; add `cross-agent-docs/agent-storage-migration-playbook.md` with explicit one-time migration instructions.
**Output**: Runtime/config loader updates plus migration runbook markdown.
**Acceptance**: Contract tests pass green; no runtime fallback to legacy `.agentconfigs` paths.

### ⬜ Unit 1c: Storage/config migration docs and contracts — Coverage & Refactor
**What**: Refactor for clarity and verify branch/error-path coverage on migration/config contract code.
**Acceptance**: 100% coverage on new migration/config code and tests remain green.

### ⬜ Unit 2a: Provider abstraction registry — Tests
**What**: Add failing tests defining provider interface/registry behavior and per-agent provider resolution without singleton coupling.
**Acceptance**: Tests fail red and prove engine no longer depends on hardcoded provider branching.

### ⬜ Unit 2b: Provider abstraction registry — Implementation
**What**: Implement provider abstraction + registry and rewire request path to use per-agent provider selection.
**Output**: Provider interface, registry wiring, engine integration changes.
**Acceptance**: Provider abstraction tests pass green and Azure/MiniMax regression tests remain passing.

### ⬜ Unit 2c: Provider abstraction registry — Coverage & Refactor
**What**: Refactor registry/selection code and cover all decision/error branches.
**Acceptance**: 100% coverage on new abstraction code with full related tests green.

### ⬜ Unit 3a: Provider-owned streaming/input behavior — Tests
**What**: Add failing tests that lock streaming/input behavior in provider implementations instead of engine-level provider branches.
**Acceptance**: Tests fail red against old flow.

### ⬜ Unit 3b: Provider-owned streaming/input behavior — Implementation
**What**: Move provider-specific streaming/input state handling into provider implementations.
**Output**: Provider implementation updates and simplified engine flow.
**Acceptance**: Streaming behavior tests pass green and parity holds for Azure/MiniMax.

### ⬜ Unit 3c: Provider-owned streaming/input behavior — Coverage & Refactor
**What**: Refactor provider-side streaming code and ensure all branches/error paths are covered.
**Acceptance**: 100% coverage on new provider-side streaming code and tests green.

### ⬜ Unit 4a: Anthropic setup-token integration — Tests
**What**: Add failing tests for Anthropic provider behavior, setup-token profile loading, and explicit auth-failure messaging.
**Acceptance**: Anthropic tests fail red before implementation.

### ⬜ Unit 4b: Anthropic setup-token integration — Implementation
**What**: Implement Anthropic provider behind the abstraction using setup-token auth profile flow and explicit fail-fast auth errors.
**Output**: Anthropic provider and auth profile integration.
**Acceptance**: Anthropic tests pass green with explicit re-auth guidance on auth failure.

### ⬜ Unit 4c: Anthropic setup-token integration — Coverage & Refactor
**What**: Refactor Anthropic provider code and cover all auth and response branches.
**Acceptance**: 100% coverage on new Anthropic integration code and tests green.

### ⬜ Unit 5a: OpenAI Codex OAuth integration — Tests
**What**: Add failing tests for `openai-codex` provider behavior, OAuth profile loading, and explicit auth-failure messaging.
**Acceptance**: OpenAI Codex tests fail red before implementation.

### ⬜ Unit 5b: OpenAI Codex OAuth integration — Implementation
**What**: Implement `openai-codex` provider behind the abstraction with OAuth auth profile flow and explicit fail-fast auth errors.
**Output**: OpenAI Codex provider and auth profile integration.
**Acceptance**: OpenAI Codex tests pass green with explicit re-auth guidance on auth failure.

### ⬜ Unit 5c: OpenAI Codex OAuth integration — Coverage & Refactor
**What**: Refactor OpenAI Codex provider code and cover all auth and response branches.
**Acceptance**: 100% coverage on new OpenAI Codex integration code and tests green.

### ⬜ Unit 6: Docs and contract alignment
**What**: Update `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, and related provider/config docs to reflect new contracts and migration policy.
**Output**: Documentation updates aligned to implemented behavior.
**Acceptance**: Documentation reflects final runtime behavior and migration instructions without contradictions.

### ⬜ Unit 7: Final verification and closure
**What**: Run full test suite, coverage checks, and static checks; assemble execution evidence in artifacts.
**Output**: Final verification log and summary artifact.
**Acceptance**: All tests pass, no warnings, new-code coverage is 100%, and completion criteria are all satisfied.

## Execution
- **TDD strictly enforced**: tests → red → implement → green → refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./[task-name]/` directory
- **Fixes/blockers**: Spawn sub-agent immediately — don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-04 15:27 Created from planning doc
