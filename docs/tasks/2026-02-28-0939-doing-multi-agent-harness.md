# Doing: Multi-Agent Harness Reorganization

**Status**: drafting
**Execution Mode**: direct
**Created**: 2026-02-28
**Planning**: ./2026-02-28-0939-planning-multi-agent-harness.md
**Artifacts**: ./2026-02-28-0939-doing-multi-agent-harness/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Reorganize the ouroboros codebase so two agents (ouroboros and slugger) can share the harness (`src/`) while keeping personality, docs, skills, and manifest in separate `{agent}/` directories. The harness dynamically loads identity, psyche, phrases, skills, and config paths based on a required `--agent` CLI argument.

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

## TDD Requirements
**Strict TDD -- no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation
2. **Verify failure**: Run tests, confirm they FAIL (red)
3. **Minimal implementation**: Write just enough code to pass
4. **Verify pass**: Run tests, confirm they PASS (green)
5. **Refactor**: Clean up, keep tests green
6. **No skipping**: Never write implementation without failing test first

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

### ⬜ Unit 1a: Identity module -- Tests
**What**: Create `src/__tests__/identity.test.ts` with failing tests for the new `src/identity.ts` module. Test:
- `getAgentName()` parses `--agent <name>` from `process.argv`; errors when missing
- `getAgentRoot()` returns `path.join(repoRoot, agentName)`
- `loadAgentConfig()` reads `{agentRoot}/agent.json`, returns parsed config (name, configPath, phrases)
- `loadAgentConfig()` returns defaults when `agent.json` missing or malformed
- `resetIdentity()` clears cached state
- `getRepoRoot()` works from both `src/` (dev via tsx) and `dist/` (compiled JS)
**Output**: `src/__tests__/identity.test.ts` with all tests failing
**Acceptance**: Tests exist and FAIL (red) -- `npx vitest run src/__tests__/identity.test.ts` shows failures

### ⬜ Unit 1b: Identity module -- Implementation
**What**: Create `src/identity.ts` implementing:
- `getAgentName()`: parse `--agent <name>` from `process.argv`, throw if missing
- `getAgentRoot()`: `path.join(getRepoRoot(), getAgentName())`
- `loadAgentConfig()`: read `{agentRoot}/agent.json`, deep-merge with defaults (name, configPath, phrases with thinking/tool/followup arrays)
- `resetIdentity()`: clear all cached module state
- `getRepoRoot()`: resolve repo root from `__dirname`, handling both `src/` and `dist/` paths
**Output**: `src/identity.ts` passing all tests
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 1c: Identity module -- Coverage & Refactor
**What**: Verify 100% coverage on `src/identity.ts`, add any missing branch tests, refactor if needed
**Acceptance**: 100% coverage on `src/identity.ts`, tests still green

### ⬜ Unit 2a: Config path from agent.json -- Tests
**What**: Update `src/__tests__/config.test.ts` with failing tests:
- `loadConfig()` uses config path from `loadAgentConfig().configPath` instead of env var
- `defaultConfigPath()` removed or made to read from identity module
- `getSessionDir()` uses agent name from identity module (e.g. `~/.agentconfigs/{agentName}/sessions`)
- `OUROBOROS_CONFIG_PATH` env var no longer used
- Auto-create config directory when it doesn't exist
**Output**: Updated `src/__tests__/config.test.ts` with new failing tests
**Acceptance**: New tests exist and FAIL (red)

### ⬜ Unit 2b: Config path from agent.json -- Implementation
**What**: Update `src/config.ts`:
- Import `loadAgentConfig`, `getAgentName` from `./identity`
- Replace `defaultConfigPath()` to use `loadAgentConfig().configPath` (resolve `~` to `os.homedir()`)
- Remove `process.env.OUROBOROS_CONFIG_PATH` reference from `loadConfig()`
- Update `getSessionDir()` to use `getAgentName()` instead of hardcoded `"ouroboros"`
- Auto-create config directory (from configPath) if it doesn't exist (`fs.mkdirSync` with `recursive: true`)
**Output**: Updated `src/config.ts` passing all tests
**Acceptance**: All tests PASS (green), no warnings, zero `process.env` in `src/config.ts`

### ⬜ Unit 2c: Config -- Coverage & Refactor
**What**: Verify 100% coverage on `src/config.ts` changes, add any missing branch tests
**Acceptance**: 100% coverage on config changes, tests still green

### ⬜ Unit 3a: Phrases from agent.json -- Tests
**What**: Update `src/__tests__/repertoire/phrases.test.ts` with failing tests:
- Phrase pools loaded from `loadAgentConfig().phrases` (thinking, tool, followup arrays)
- Fallback to current hardcoded defaults when agent.json has no phrases
- `getPhrases()` or equivalent function returns the agent's phrase pools
**Output**: Updated phrases test file with new failing tests
**Acceptance**: New tests exist and FAIL (red)

### ⬜ Unit 3b: Phrases from agent.json -- Implementation
**What**: Update `src/repertoire/phrases.ts`:
- Import `loadAgentConfig` from `../identity`
- Replace hardcoded `THINKING_PHRASES`, `TOOL_PHRASES`, `FOLLOWUP_PHRASES` exports with functions that read from `loadAgentConfig().phrases`
- Keep hardcoded arrays as defaults when agent.json has no phrases
- Export `getPhrases()` returning `{ thinking, tool, followup }` arrays
**Output**: Updated `src/repertoire/phrases.ts` passing all tests
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 3c: Phrases -- Coverage & Refactor
**What**: Verify 100% coverage on phrases changes. Update all consumers of the old phrase exports (`src/channels/cli.ts`, `src/channels/teams.ts`) to use the new API.
**Acceptance**: 100% coverage, all consumers updated, tests still green

### ⬜ Unit 4a: Skills from agent directory -- Tests
**What**: Update `src/__tests__/repertoire/skills.test.ts` with failing tests:
- `SKILLS_DIR` now comes from `getAgentRoot()/skills/` instead of project-root `skills/`
- `listSkills()` reads from `{agentRoot}/skills/`
- `loadSkill()` loads from `{agentRoot}/skills/`
**Output**: Updated skills test file with new failing tests
**Acceptance**: New tests exist and FAIL (red)

### ⬜ Unit 4b: Skills from agent directory -- Implementation
**What**: Update `src/repertoire/skills.ts`:
- Import `getAgentRoot` from `../identity`
- Replace module-level `SKILLS_DIR` constant with a function `getSkillsDir()` that returns `path.join(getAgentRoot(), "skills")`
- Update `listSkills()` and `loadSkill()` to use `getSkillsDir()`
**Output**: Updated `src/repertoire/skills.ts` passing all tests
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 4c: Skills -- Coverage & Refactor
**What**: Verify 100% coverage on skills changes, add any missing branch tests
**Acceptance**: 100% coverage on skills changes, tests still green

### ⬜ Unit 5a: Prompt system (psyche + runtime info) -- Tests
**What**: Update `src/__tests__/mind/prompt.test.ts` with failing tests:
- Psyche files loaded lazily from `{agentRoot}/docs/psyche/` (not module-level `__dirname`)
- `isOwnCodebase()` removed
- `selfAwareSection()` replaced with `runtimeInfoSection()` that always injects runtime info (no conditional on package.json name)
- Personality text from old `selfAwareSection()` moved to psyche docs (verified content exists in IDENTITY.md or similar)
- `buildSystem()` uses lazy-loaded psyche sections
**Output**: Updated prompt test file with new failing tests
**Acceptance**: New tests exist and FAIL (red)

### ⬜ Unit 5b: Prompt system -- Implementation
**What**: Update `src/mind/prompt.ts`:
- Import `getAgentRoot` from `../identity`
- Replace module-scope `fs.readFileSync` calls with lazy-loading function `loadPsyche()` that reads from `path.join(getAgentRoot(), "docs", "psyche")`
- Cache loaded psyche text (reset on `resetIdentity()` or add `resetPsycheCache()`)
- Remove `isOwnCodebase()` function entirely
- Replace `selfAwareSection(channel)` with `runtimeInfoSection(channel)` that always includes:
  - Channel behavior (cli vs teams)
  - Self-awareness info (can read/modify source, load skills, spawn instances)
  - Relevant skills list
- Move ouroboros personality text from `selfAwareSection()` into `docs/psyche/IDENTITY.md` (append to existing file)
**Output**: Updated `src/mind/prompt.ts` passing all tests
**Acceptance**: All tests PASS (green), no warnings, `isOwnCodebase` gone, personality text preserved in psyche docs

### ⬜ Unit 5c: Prompt system -- Coverage & Refactor
**What**: Verify 100% coverage on prompt changes, add any missing branch tests. Ensure psyche loading handles missing files gracefully.
**Acceptance**: 100% coverage on prompt changes, tests still green

### ⬜ Unit 6a: CLI dynamic greeting and exit command -- Tests
**What**: Update `src/__tests__/channels/cli-main.test.ts` and `src/__tests__/repertoire/commands.test.ts` with failing tests:
- CLI greeting uses agent name: `"{agentName} (type /commands for help)"`
- Exit command description uses agent name: `"quit {agentName}"`
- CLI bye message on exit
**Output**: Updated test files with new failing tests
**Acceptance**: New tests exist and FAIL (red)

### ⬜ Unit 6b: CLI dynamic greeting and exit command -- Implementation
**What**: Update:
- `src/channels/cli.ts` line 338: change `"ouroboros (type /commands for help)"` to use `getAgentName()`
- `src/repertoire/commands.ts` line 66: change `"quit ouroboros"` to use `getAgentName()`
**Output**: Updated files passing all tests
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 6c: CLI and commands -- Coverage & Refactor
**What**: Verify 100% coverage on CLI and commands changes
**Acceptance**: 100% coverage, tests still green

### ⬜ Unit 7a: Teams adapter rename -- Tests
**What**: Update `src/__tests__/channels/teams.test.ts` with failing tests:
- `OuroborosHandler` renamed to `AgentHandler` / `__agentHandler`
- `teams-entry.ts` comment is generic (not hardcoded ouroboros path)
**Output**: Updated test file with new failing tests
**Acceptance**: New tests exist and FAIL (red)

### ⬜ Unit 7b: Teams adapter rename -- Implementation
**What**: Update:
- `src/channels/teams.ts`: rename `OuroborosHandler` interface to `AgentHandler`, rename `__ouroboros` marker to `__agentHandler`
- `src/teams-entry.ts`: update comment from `~/.agentconfigs/ouroboros/config.json` to generic `config.json path from agent.json`
**Output**: Updated files passing all tests
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 7c: Teams adapter -- Coverage & Refactor
**What**: Verify 100% coverage on teams changes
**Acceptance**: 100% coverage, tests still green

### ⬜ Unit 8a: Package.json and agent.json -- Tests
**What**: Write tests (or verify via integration) that:
- `package.json` name is `ouroboros-agent-harness`
- `package.json` scripts use `--agent ouroboros`
- `ouroboros/agent.json` exists with correct structure (name, configPath, phrases)
**Output**: Tests or validation scripts
**Acceptance**: Tests exist and FAIL (red) or validation defined

### ⬜ Unit 8b: Package.json and agent.json -- Implementation
**What**: Update:
- `package.json`: name to `ouroboros-agent-harness`, scripts add `--agent ouroboros` to dev/teams commands, add `dev:slugger` script
- Create `ouroboros/agent.json` with:
  ```json
  {
    "name": "ouroboros",
    "configPath": "~/.agentconfigs/ouroboros/config.json",
    "phrases": {
      "thinking": [...current THINKING_PHRASES...],
      "tool": [...current TOOL_PHRASES...],
      "followup": [...current FOLLOWUP_PHRASES...]
    }
  }
  ```
**Output**: Updated `package.json`, new `ouroboros/agent.json`
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 8c: Package.json and agent.json -- Coverage & Refactor
**What**: Verify all changes work together, run full test suite
**Acceptance**: 100% coverage maintained, all tests pass

### ⬜ Unit 9: Directory moves
**What**: Use `git mv` to move agent-specific directories under `ouroboros/`:
- `git mv docs/psyche ouroboros/docs/psyche`
- `git mv docs/tasks ouroboros/docs/tasks`
- `git mv skills ouroboros/skills`
- `git mv manifest ouroboros/manifest`
- Verify `docs/OAUTH-SETUP.md` stays at `docs/` (shared infrastructure)
- Update any path references that break after moves
- Run full test suite to catch path breakage
**Output**: Directories moved, all paths working
**Acceptance**: All tests PASS (green), `git status` shows clean renames, `docs/OAUTH-SETUP.md` still at `docs/`

### ⬜ Unit 10: Full integration verification
**What**: Final verification pass:
- Run `npx vitest run` -- all 816+ tests pass
- Run `npx vitest run --coverage` -- 100% coverage
- Verify zero `process.env` references in `src/` (excluding test files)
- Verify `npm run dev` would work with `--agent ouroboros`
- Verify missing `--agent` produces clear error
**Output**: Clean test run, coverage report
**Acceptance**: All tests pass, 100% coverage, no warnings, zero env vars in src

### ⬜ Unit 11: README rewrite
**What**: Delete existing `README.md` and rewrite from scratch. The work-doer should research the codebase and psyche docs thoroughly when writing it. Structure:
1. **Brief intro for anyone** -- what this is, why it exists, why the name (both Ouroboroses), project structure. Short, evergreen.
2. **Agent onboarding** -- the bulk. Everything a new agent needs to set itself up and understand its own runtime:
   - Your directory: `agent.json`, `docs/psyche/`, `skills/`, `manifest/`, `docs/tasks/`
   - The psyche system: what each file does (SOUL, IDENTITY, LORE, FRIENDS), how they load into the prompt, how to write your own
   - Your runtime: engine loop, channels, tools, kicks, context/session management
   - What you can modify (your `{agent}/` dir) vs shared harness (`src/`)
   - Self-contained -- no cross-referencing needed
**Output**: New `README.md`
**Acceptance**: README exists, covers both sections, is agent-first but human-readable, no stale references

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-02-28-0939-doing-multi-agent-harness/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-02-28 Created from planning doc
