# Planning: Multi-Agent Harness Reorganization

**Status**: drafting
**Created**: 2026-02-28

## Goal
Reorganize the ouroboros codebase so two agents (ouroboros and slugger) can share the harness (`src/`) while keeping personality, docs, skills, and manifest in separate `{agent}/` directories. The harness dynamically loads identity, psyche, phrases, skills, and config paths based on a required `AGENT_NAME` env var.

## Scope

### In Scope
- New `src/identity.ts` module: `getAgentName()`, `getAgentRoot()`, `loadAgentConfig()`, `resetIdentity()`, `getRepoRoot()`
- Agent-aware config paths in `src/config.ts`: `~/.agentconfigs/{AGENT_NAME}/config.json` with auto-create
- Env var rename: `OUROBOROS_*` to `AGENT_*` (clean break, no backward compat)
- Phrases loaded from `{agent}/agent.json` with fallback to defaults
- Skills loaded from `{agent}/skills/` instead of root `skills/`
- Prompt system: lazy psyche loading from `{agent}/docs/psyche/`, replace `isOwnCodebase()` with always-on `runtimeInfoSection()`
- Move ouroboros personality text from `selfAwareSection()` into psyche docs
- CLI dynamic greeting and exit using agent name
- Directory moves via `git mv`: `docs/psyche/`, `docs/tasks/`, `skills/`, `manifest/` into `ouroboros/`
- Create `ouroboros/agent.json` with name and phrases
- `package.json`: name becomes `ouroboros-agent-harness`, scripts include `AGENT_NAME=ouroboros`
- README.md documenting harness name, multi-agent setup, `agent.json` format, `AGENT_NAME` requirement
- Full test coverage on all new/modified code

### Out of Scope
- Creating the `slugger/` agent directory (that comes later when slugger is set up)
- Changing the `OuroborosConfig` interface name (internal, cosmetic churn)
- Modifying the engine (`src/engine/`) -- it has no agent-specific code
- Modifying `src/mind/context.ts` -- session/token management is agent-agnostic
- Teams adapter logic changes (only greeting/marker cosmetics affected)

## Completion Criteria
- [ ] `AGENT_NAME=ouroboros npm run dev` loads ouroboros psyche, phrases, skills, sessions
- [ ] `AGENT_NAME=slugger npm run dev` loads slugger psyche, phrases, skills (once slugger dir exists)
- [ ] Missing `AGENT_NAME` produces a clear error message at startup
- [ ] Personality text from `selfAwareSection()` moved to psyche docs, not deleted
- [ ] `isOwnCodebase()` replaced with always-on runtime info section
- [ ] Phrases loaded from `{agent}/agent.json`, not hardcoded
- [ ] Skills loaded from `{agent}/skills/`, not root `skills/`
- [ ] Config path uses `~/.agentconfigs/{AGENT_NAME}/`
- [ ] Env vars renamed: `OUROBOROS_*` to `AGENT_*`
- [ ] `package.json` name is `ouroboros-agent-harness`
- [ ] Directory moves complete: `docs/psyche/`, `docs/tasks/`, `skills/`, `manifest/` all under `ouroboros/`
- [ ] README.md documents the harness name and multi-agent setup
- [ ] 100% test coverage on all new code
- [ ] All tests pass (770+ tests)
- [ ] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions
- (none -- all resolved in prior planning)

## Decisions Made
- `AGENT_NAME` env var is required with no default -- harness errors if unset
- `agent.json` in repo for non-secret config (name, phrases); secrets in `~/.agentconfigs/{AGENT_NAME}/config.json`
- Package name: `ouroboros-agent-harness` (the harness is named after the agent that built it)
- Env var rename is a clean break: `OUROBOROS_*` to `AGENT_*`, old names dropped
- `OuroborosConfig` interface name stays (internal, not user-facing)
- `isOwnCodebase()` is deleted and replaced with `runtimeInfoSection()` that always injects runtime info
- Auto-create `~/.agentconfigs/{AGENT_NAME}/` directory on first run
- `docs/OAUTH-SETUP.md` stays at `docs/` (shared infrastructure documentation)

## Context / References
- Existing plan: `~/.claude/plans/steady-gliding-taco.md`
- Existing doing doc: `ouroboros/docs/tasks/2026-02-28-doing-multi-agent-harness.md`
- Key files to modify: `src/config.ts`, `src/mind/prompt.ts`, `src/repertoire/phrases.ts`, `src/repertoire/skills.ts`, `src/channels/cli.ts`, `src/repertoire/commands.ts`, `src/channels/teams.ts`, `package.json`
- New file: `src/identity.ts`
- Test files: `src/__tests__/identity.test.ts` (new), plus updates to `config.test.ts`, `prompt.test.ts`, `phrases.test.ts`, `skills.test.ts`, `cli-main.test.ts`, `commands.test.ts`, `teams.test.ts`
- Current test count: 770+ tests
- Test runner: `npx vitest run`

## Notes
The existing doing doc at `ouroboros/docs/tasks/2026-02-28-doing-multi-agent-harness.md` contains detailed work units with file signatures and line numbers. This content will be validated and used during conversion to the official doing doc.

## Progress Log
- 2026-02-28 Created from existing plan at steady-gliding-taco.md
