# Doing: Multi-Agent Harness Reorganization

**Status**: READY_FOR_EXECUTION
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

### ✅ Unit 1a: Identity module -- Tests
**What**: Create `src/__tests__/identity.test.ts` with failing tests for the new `src/identity.ts` module. Test:
- `getAgentName()` parses `--agent <name>` from `process.argv`; errors when missing
- `getAgentRoot()` returns `path.join(repoRoot, agentName)`
- `loadAgentConfig()` reads `{agentRoot}/agent.json`, returns parsed config (name, configPath, phrases)
- `loadAgentConfig()` throws descriptive error when `agent.json` missing or has invalid JSON
- `resetIdentity()` clears cached state
- `getRepoRoot()` works from both `src/` (dev via tsx) and `dist/` (compiled JS)
**Output**: `src/__tests__/identity.test.ts` with all tests failing
**Acceptance**: Tests exist and FAIL (red) -- `npx vitest run src/__tests__/identity.test.ts` shows failures

### ✅ Unit 1b: Identity module -- Implementation
**What**: Create `src/identity.ts` implementing:
- `getAgentName()`: parse `--agent <name>` from `process.argv`, throw if missing
- `getAgentRoot()`: `path.join(getRepoRoot(), getAgentName())`
- `loadAgentConfig()`: read `{agentRoot}/agent.json`, parse JSON, throw descriptive error if missing or malformed. Interface `AgentConfig` has `name: string`, `configPath: string`, `phrases?: { thinking?: string[]; tool?: string[]; followup?: string[] }`
- `resetIdentity()`: clear all cached module state
- `getRepoRoot()`: resolve repo root from `__dirname`, handling both `src/` and `dist/` paths
**Output**: `src/identity.ts` passing all tests
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 1c: Identity module -- Coverage & Refactor
**What**: Verify 100% coverage on `src/identity.ts`, add any missing branch tests, refactor if needed
**Output**: Coverage report showing 100% on `src/identity.ts`
**Acceptance**: 100% coverage on `src/identity.ts`, tests still green

### ✅ Unit 2a: Config path from agent.json -- Tests
**What**: Update `src/__tests__/config.test.ts` with failing tests:
- `loadConfig()` uses config path from `loadAgentConfig().configPath` instead of env var
- `defaultConfigPath()` removed or made to read from identity module
- `getSessionDir()` uses agent name from identity module (e.g. `~/.agentconfigs/{agentName}/sessions`)
- `OUROBOROS_CONFIG_PATH` env var no longer used
- Auto-create config directory when it doesn't exist
- Update hardcoded `"ouroboros"` path expectations in existing tests (lines 78, 311, 326, 335, 344)
- Also update `src/__tests__/engine/core.test.ts` which has `OUROBOROS_CONFIG_PATH` references at lines 2557-2631 -- these tests need to use `setTestConfig()` or mock identity instead
**Output**: Updated `src/__tests__/config.test.ts` and `src/__tests__/engine/core.test.ts` with new/updated failing tests
**Acceptance**: New tests exist and FAIL (red)

### ✅ Unit 2b: Config path from agent.json -- Implementation
**What**: Update `src/config.ts`:
- Import `loadAgentConfig`, `getAgentName` from `./identity`
- Replace `defaultConfigPath()` to use `loadAgentConfig().configPath` (resolve `~` to `os.homedir()`)
- Remove `process.env.OUROBOROS_CONFIG_PATH` reference from `loadConfig()`
- Update `getSessionDir()` to use `getAgentName()` instead of hardcoded `"ouroboros"`
- Auto-create config directory (from configPath) if it doesn't exist (`fs.mkdirSync` with `recursive: true`)
**Output**: Updated `src/config.ts` passing all tests
**Acceptance**: All tests PASS (green), no warnings, zero `process.env` in `src/config.ts`

### ✅ Unit 2c: Config -- Coverage & Refactor
**What**: Verify 100% coverage on `src/config.ts` changes, add any missing branch tests
**Output**: Coverage report showing 100% on `src/config.ts`
**Acceptance**: 100% coverage on config changes, tests still green

### ✅ Unit 3a: Phrases from agent.json -- Tests
**What**: Update `src/__tests__/repertoire/phrases.test.ts` with failing tests:
- Phrase pools loaded from `loadAgentConfig().phrases` (thinking, tool, followup arrays)
- Fallback to current hardcoded defaults when agent.json has no phrases
- `getPhrases()` or equivalent function returns the agent's phrase pools
**Output**: Updated phrases test file with new failing tests
**Acceptance**: New tests exist and FAIL (red)

### ✅ Unit 3b: Phrases from agent.json -- Implementation
**What**: Update `src/repertoire/phrases.ts`:
- Import `loadAgentConfig` from `../identity`
- Replace hardcoded `THINKING_PHRASES`, `TOOL_PHRASES`, `FOLLOWUP_PHRASES` exports with functions that read from `loadAgentConfig().phrases`
- Keep hardcoded arrays as defaults when agent.json has no phrases
- Export `getPhrases()` returning `{ thinking, tool, followup }` arrays
**Output**: Updated `src/repertoire/phrases.ts` passing all tests
**Acceptance**: All tests PASS (green), no warnings

### ✅ Unit 3c: Phrases -- Coverage & Refactor
**What**: Verify 100% coverage on phrases changes. Update all consumers of the old phrase exports (`src/channels/cli.ts`, `src/channels/teams.ts`) to use the new API.
**Output**: Coverage report showing 100% on `src/repertoire/phrases.ts`, updated consumer files
**Acceptance**: 100% coverage, all consumers updated, tests still green

### ✅ Unit 4a: Skills from agent directory -- Tests
**What**: Update `src/__tests__/repertoire/skills.test.ts` with failing tests:
- `SKILLS_DIR` now comes from `getAgentRoot()/skills/` instead of project-root `skills/`
- `listSkills()` reads from `{agentRoot}/skills/`
- `loadSkill()` loads from `{agentRoot}/skills/`
**Output**: Updated skills test file with new failing tests
**Acceptance**: New tests exist and FAIL (red)

### ✅ Unit 4b: Skills from agent directory -- Implementation
**What**: Update `src/repertoire/skills.ts`:
- Import `getAgentRoot` from `../identity`
- Replace module-level `SKILLS_DIR` constant with a function `getSkillsDir()` that returns `path.join(getAgentRoot(), "skills")`
- Update `listSkills()` and `loadSkill()` to use `getSkillsDir()`
**Output**: Updated `src/repertoire/skills.ts` passing all tests
**Acceptance**: All tests PASS (green), no warnings

### ⬜ Unit 4c: Skills -- Coverage & Refactor
**What**: Verify 100% coverage on skills changes, add any missing branch tests
**Output**: Coverage report showing 100% on `src/repertoire/skills.ts`
**Acceptance**: 100% coverage on skills changes, tests still green

### ⬜ Unit 5a: Move personality text to psyche docs
**What**: Before changing `prompt.ts`, move the personality text currently in `selfAwareSection()` (lines 56-73 of `src/mind/prompt.ts`) into `docs/psyche/IDENTITY.md` (append to existing file). This is the "i am in my own codebase" block:
```
i am Ouroboros -- a snake eating its own tail. i can read and modify my own source code...
### what i can do
- edit src/*.ts source files
- load skills with load_skill tool...
### relevant skills
- self-edit: for safely editing my own source code
- self-query: for using the claude tool...
### remember
- edits to source files won't take effect until i restart...
```
The content must be preserved -- not deleted -- so the agent's personality survives the refactor. Adapt the text slightly for the psyche doc format (it should read as identity, not as conditional prompt injection).
Note: psyche files are still at `docs/psyche/` at this point — they move to `ouroboros/docs/psyche/` in Unit 9.
**Output**: Updated `docs/psyche/IDENTITY.md` with personality text appended
**Acceptance**: IDENTITY.md contains the moved text, no content lost

### ⬜ Unit 5b: Prompt system (psyche + runtime info) -- Tests
**What**: Update `src/__tests__/mind/prompt.test.ts` with failing tests:
- Psyche files loaded lazily from `{agentRoot}/docs/psyche/` (not module-level `__dirname`)
- Remove `isOwnCodebase()` tests (lines 60-75 in current test file) -- export no longer exists
- Replace `selfAwareSection()` tests with `runtimeInfoSection()` tests -- always injects runtime info (no conditional on package.json name)
- `buildSystem()` uses lazy-loaded psyche sections (mock `getAgentRoot()` instead of `__dirname`)
- `resetPsycheCache()` clears cached psyche text
- Graceful handling when psyche files are missing (empty string, no crash)
- Current test mocks `fs.readFileSync` at module-level for psyche -- this pattern will change to lazy loading
**Output**: Updated prompt test file with new failing tests
**Acceptance**: New tests exist and FAIL (red)

### ⬜ Unit 5c: Prompt system -- Implementation
**What**: Update `src/mind/prompt.ts`:
- Import `getAgentRoot` from `../identity`
- Replace module-scope `fs.readFileSync` calls with lazy-loading function `loadPsyche()` that reads from `path.join(getAgentRoot(), "docs", "psyche")`
- Cache loaded psyche text, export `resetPsycheCache()` for test cleanup
- Remove `isOwnCodebase()` function entirely
- Replace `selfAwareSection(channel)` with `runtimeInfoSection(channel)` that always includes:
  - `process.cwd()` (absolute path to codebase)
  - Agent name (from `getAgentName()`)
  - Channel (cli/teams)
  - Note: "i can read and modify my own source code"
  - Channel-specific behavior (cli: introduce on boot; teams: concise, markdown, no intro)
- Handle missing psyche files gracefully (return empty string)
**Output**: Updated `src/mind/prompt.ts` passing all tests
**Acceptance**: All tests PASS (green), no warnings, `isOwnCodebase` gone

### ⬜ Unit 5d: Prompt system -- Coverage & Refactor
**What**: Verify 100% coverage on prompt changes, add any missing branch tests. Ensure all psyche loading paths (success, missing file, malformed) are covered.
**Output**: Coverage report showing 100% on `src/mind/prompt.ts`
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
**Output**: Coverage report showing 100% on `src/channels/cli.ts` and `src/repertoire/commands.ts`
**Acceptance**: 100% coverage, tests still green

### ⬜ Unit 7a: Teams adapter rename -- Tests
**What**: Update `src/__tests__/channels/teams.test.ts` with failing tests:
- `OuroborosHandler` renamed to `AgentHandler` / `__agentHandler`
- Tests currently reference `__ouroboros` marker (lines 1065-1143) -- update to `__agentHandler`
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
**Output**: Coverage report showing 100% on `src/channels/teams.ts`
**Acceptance**: 100% coverage, tests still green

### ⬜ Unit 8a: Create ouroboros/agent.json and update package.json
**What**:
- Create `ouroboros/agent.json` with name, configPath, and phrases (copy current hardcoded phrase arrays from `phrases.ts`)
- Update `package.json`: name to `ouroboros-agent-harness`, scripts add `--agent ouroboros` to dev/teams commands, add `dev:slugger` script
- Update entry points (`src/cli-entry.ts`, `src/teams-entry.ts`): ensure `--agent` is in `process.argv` before any `src/` code calls `getAgentName()`. Entry points should validate early and fail fast with a clear message if `--agent` is missing.
- This unit does not follow TDD pattern -- it's configuration file creation
- Validation: run full test suite to confirm identity module can load the new `agent.json`
**Output**: `ouroboros/agent.json` created, `package.json` updated
**Acceptance**: `ouroboros/agent.json` has correct structure, `package.json` name is `ouroboros-agent-harness`, full test suite passes

### ⬜ Unit 8b: Create ouroboros/docs/psyche directory structure
**What**: Create `ouroboros/docs/` directory structure so directory moves in Unit 9 have a target. At this point the psyche files still live at `docs/psyche/` -- they move in Unit 9.
- Create `ouroboros/docs/` (will receive `psyche/` and `tasks/` via git mv later)
- Verify `ouroboros/agent.json` is loadable by the identity module
**Output**: Directory structure ready for moves
**Acceptance**: `ouroboros/` directory exists with `agent.json` and `docs/` subdirectory, full test suite passes

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
- 2026-02-28 16:25 Created from planning doc (Pass 1: first draft)
- 2026-02-28 16:26 Pass 2: granularity -- split Unit 5 to separate psyche move, tightened Unit 8
- 2026-02-28 16:27 Pass 3: validation -- verified all file paths, line numbers, test references against codebase
- 2026-02-28 16:28 Pass 4: quality -- added Output fields to all coverage units, verified emoji headers
- 2026-02-28 16:36 Unit 1a complete: 16 failing tests for identity module (getAgentName, getRepoRoot, getAgentRoot, loadAgentConfig, resetIdentity)
- 2026-02-28 16:37 Unit 1b complete: identity module implemented, all 839 tests pass
- 2026-02-28 16:37 Unit 1c complete: identity.ts 100% coverage verified (stmts, branches, functions, lines)
- 2026-02-28 16:40 Unit 2a complete: 9 failing tests for identity-based config paths, core.test.ts updated to use setTestConfig()
- 2026-02-28 16:42 Unit 2b complete: config.ts uses identity module, all 842 tests pass, zero process.env in config.ts
- 2026-02-28 16:43 Unit 2c complete: config.ts 100% coverage verified
- 2026-02-28 16:44 Units 3a-3c complete: getPhrases() from agent.json with fallback defaults, 100% coverage, 845 tests pass
