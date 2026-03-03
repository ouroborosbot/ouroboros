# Planning: Multi-Agent Harness Reorganization

**Status**: approved
**Created**: 2026-02-28
**Updated**: 2026-02-28 (post env-var consolidation)

## Goal
Reorganize the ouroboros codebase so two agents (ouroboros and slugger) can share the harness (`src/`) while keeping personality, docs, skills, and manifest in separate `{agent}/` directories. The harness dynamically loads identity, psyche, phrases, skills, and config paths based on a required `--agent` CLI argument.

## Scope

### In Scope
- New `src/identity.ts` module: `getAgentName()`, `getAgentRoot()`, `loadAgentConfig()`, `resetIdentity()`, `getRepoRoot()`
- Agent name passed via `--agent <name>` CLI argument (parsed from `process.argv`), no env vars
- Agent-aware config paths in `src/config.ts`: config path from `agent.json` `configPath` field, with auto-create of target directory
- Remove `OUROBOROS_CONFIG_PATH` env var entirely — zero env vars in the harness
- Rename `OuroborosHandler` to `AgentHandler` / `__agentHandler` in `src/channels/teams.ts`
- Update `src/teams-entry.ts` comment to be generic (not hardcoded ouroboros path)
- Phrases loaded from `{agent}/agent.json` with fallback to defaults
- Skills loaded from `{agent}/skills/` instead of root `skills/`
- Prompt system: lazy psyche loading from `{agent}/docs/psyche/`, replace `isOwnCodebase()` with always-on `runtimeInfoSection()`
- Move ouroboros personality text from `selfAwareSection()` into psyche docs
- CLI dynamic greeting and exit using agent name
- Directory moves via `git mv`: `docs/psyche/`, `docs/tasks/`, `skills/`, `manifest/` into `ouroboros/`
- Create `ouroboros/agent.json` with name, configPath, and phrases
- `package.json`: name becomes `ouroboros-agent-harness`, scripts use `--agent ouroboros`
- Delete existing README.md and rewrite from scratch (short, evergreen — code is the truth)
- Full test coverage on all new/modified code

### Out of Scope
- Creating the `slugger/` agent directory (that comes later when slugger is set up)
- Changing the `OuroborosConfig` interface name (internal, cosmetic churn)
- Modifying the engine (`src/engine/`) -- it has no agent-specific code
- Modifying `src/mind/context.ts` -- session/token management is agent-agnostic
- Teams adapter logic changes (only greeting/marker cosmetics affected)

## Completion Criteria
- [ ] `npm run dev` (which runs `--agent ouroboros`) loads ouroboros psyche, phrases, skills, sessions
- [ ] `npm run dev:slugger` (which runs `--agent slugger`) loads slugger config (once slugger dir exists)
- [ ] Missing `--agent` argument produces a clear error message at startup
- [ ] Zero `process.env` references in `src/` (excluding tests)
- [ ] Personality text from `selfAwareSection()` moved to psyche docs, not deleted
- [ ] `isOwnCodebase()` replaced with always-on runtime info section
- [ ] Phrases loaded from `{agent}/agent.json`, not hardcoded
- [ ] Skills loaded from `{agent}/skills/`, not root `skills/`
- [ ] Config path from `agent.json` `configPath` field (e.g. `~/.agentconfigs/ouroboros/config.json`)
- [ ] `OuroborosHandler` renamed to `AgentHandler` in teams.ts
- [ ] `teams-entry.ts` comment updated to be generic
- [ ] `package.json` name is `ouroboros-agent-harness`
- [ ] Directory moves complete: `docs/psyche/`, `docs/tasks/`, `skills/`, `manifest/` under `ouroboros/`
- [ ] README.md rewritten: agent-first (onboarding + runtime understanding), human-readable intro
- [ ] 100% test coverage on all new code
- [ ] All tests pass (816+ tests)
- [ ] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions
- (none -- all resolved in prior planning)

## Implementation Notes
- `getRepoRoot()` must work from both `src/` (dev via tsx) and `dist/` (compiled JS). `__dirname` differs — handle both paths.
- `getAgentName()` parses `--agent <name>` from `process.argv`, not from env vars
- Entry points (`cli-entry.ts`, `teams-entry.ts`) pass `--agent` through to the harness; npm scripts bake in the agent name

## Decisions Made
- `--agent` CLI argument is required with no default -- harness errors if missing
- `agent.json` in repo for non-secret config (name, configPath, phrases); secrets at the path specified by `configPath`
- Package name: `ouroboros-agent-harness` (the harness is named after the agent that built it)
- Env var consolidation complete: all env vars removed. `OUROBOROS_CONFIG_PATH` also removed — config path comes from `agent.json` `configPath` field. Zero env vars in the harness.
- `OuroborosConfig` interface name stays (internal, not user-facing)
- `isOwnCodebase()` is deleted and replaced with `runtimeInfoSection()` that always injects runtime info
- Auto-create config directory (from `configPath` in `agent.json`) on first run
- `docs/OAUTH-SETUP.md` stays at `docs/` (shared infrastructure documentation)

## Context / References
- Key files to modify: `src/config.ts`, `src/mind/prompt.ts`, `src/repertoire/phrases.ts`, `src/repertoire/skills.ts`, `src/channels/cli.ts`, `src/repertoire/commands.ts`, `src/channels/teams.ts`, `package.json`
- New file: `src/identity.ts`
- Test files: `src/__tests__/identity.test.ts` (new), plus updates to `config.test.ts`, `prompt.test.ts`, `phrases.test.ts`, `skills.test.ts`, `cli-main.test.ts`, `commands.test.ts`, `teams.test.ts`
- Current test count: 816 tests
- Test runner: `npx vitest run`

## Prerequisite: Env Var Consolidation (DONE)
The env var consolidation task (`docs/tasks/2026-02-28-0934-doing-config-consolidation.md`) is complete:
- All `process.env` fallbacks removed from config getters — `config.json` is the only config source
- `setTestConfig()` exists for test setup (no more `process.env` manipulation in tests)
- `getTeamsChannelConfig()` added (skipConfirmation, disableStreaming, port)
- `getIntegrationsConfig()` added (perplexityApiKey)
- Only remaining env var: `OUROBOROS_CONFIG_PATH` in `src/config.ts:130` (to be removed in this task)
- 816 tests passing, 100% coverage

## Current Hardcoded "ouroboros" References in src/
```
src/config.ts:106          defaultConfigPath() → "ouroboros" in path
src/config.ts:130          OUROBOROS_CONFIG_PATH env var
src/config.ts:201          getSessionDir() → "ouroboros" in path
src/mind/prompt.ts:20      isOwnCodebase() checks pkg.name === "ouroboros"
src/repertoire/commands.ts:66   "quit ouroboros"
src/channels/cli.ts:338    "ouroboros (type /commands for help)"
src/channels/teams.ts:378  OuroborosHandler interface (internal marker)
src/teams-entry.ts:5       comment referencing ouroboros config path
```

## README.md

Delete existing README and rewrite. The primary audience is agents — this is the first file an agent reads when pointed at the harness. Humans can read it fine too; agents just need different information, not different language.

Structure:
1. **Brief intro for anyone** — what this is, why it exists, why the name (both Ouroboroses), project structure. Short, evergreen.
2. **Agent onboarding** — the bulk. Everything a new agent needs to set itself up and understand its own runtime.

Hints for intro (research codebase and psyche docs to expand):
- The name: self-reference, self-modification, context window as tail-eating (session trim/rebuild), persistence through layered memory
- Two Ouroboroses: the harness and its first agent

Hints for agent onboarding:
- Your directory: `agent.json`, `docs/psyche/`, `skills/`, `manifest/`, `docs/tasks/`
- The psyche system: what each file does (SOUL, IDENTITY, LORE, FRIENDS), how they load into the prompt, how to write your own (the existing ones are examples, not templates)
- Your runtime: engine loop, channels, tools, kicks, context/session management — so the agent understands its own mechanics
- What you can modify (your `{agent}/` dir) vs shared harness (`src/`)
- Self-contained — no cross-referencing needed

## Progress Log
- 2026-02-28 09:39 Created from existing plan at steady-gliding-taco.md
- 2026-02-28 11:15 Updated post env-var consolidation: removed stale env var rename scope (already done), updated test count to 816, added prerequisite status, added current hardcoded reference audit
- 2026-02-28 16:21 Status approved, proceeding to doing doc conversion
- 2026-02-28 16:30 Replaced AGENT_NAME env var with --agent CLI argument — zero env vars in harness
