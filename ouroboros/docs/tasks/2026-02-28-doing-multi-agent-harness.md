# Doing: Multi-Agent Harness Reorganization

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-02-28
**Planning**: (see ~/.claude/plans/steady-gliding-taco.md)
**Artifacts**: ./2026-02-28-doing-multi-agent-harness/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Reorganize the ouroboros codebase so two agents (ouroboros and slugger) can share the harness (`src/`) while keeping their personality/docs in separate `{agent}/` directories. The harness dynamically loads identity, psyche, phrases, skills, and config paths from `AGENT_NAME` env var.

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
- [ ] All tests pass (813+ tests)
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

---

### ⬜ Unit 1a: Identity module -- Tests
**What**: Create `src/__tests__/identity.test.ts` with failing tests for the new `src/identity.ts` module. Tests cover:
- `getAgentName()` returns `AGENT_NAME` env var value
- `getAgentName()` throws descriptive error when `AGENT_NAME` is unset/empty
- `getAgentRoot()` returns `path.join(repoRoot, agentName)` (where repoRoot is resolved from `__dirname` going up to the repo root)
- `loadAgentConfig()` reads and parses `{agentRoot}/agent.json`
- `loadAgentConfig()` caches result after first load (same reference on second call)
- `loadAgentConfig()` throws descriptive error when `agent.json` is missing
- `loadAgentConfig()` throws descriptive error when `agent.json` has invalid JSON
- `resetIdentity()` clears the cache so next call re-reads from disk
- `getRepoRoot()` returns the path two levels up from `src/identity.ts` (i.e., the repo root)
**Files**: `src/__tests__/identity.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `src/identity.ts` does not exist yet

### ⬜ Unit 1b: Identity module -- Implementation
**What**: Create `src/identity.ts` with:
- `getRepoRoot(): string` -- `path.resolve(__dirname, "..")` (from `dist/` or `src/` to repo root)
- `getAgentName(): string` -- reads `process.env.AGENT_NAME`, throws `"AGENT_NAME env var is required but not set"` if missing/empty
- `getAgentRoot(): string` -- `path.join(getRepoRoot(), getAgentName())`
- `loadAgentConfig(): AgentConfig` -- reads `{agentRoot}/agent.json`, parses JSON, caches in module-level `_cachedConfig`. Interface `AgentConfig` has `name: string` and `phrases?: { thinking?: string[]; tool?: string[]; followup?: string[] }`
- `resetIdentity(): void` -- sets `_cachedConfig = null`
**Files**: `src/identity.ts`
**Acceptance**: All Unit 1a tests PASS (green), no warnings

### ⬜ Unit 1c: Identity module -- Coverage & Refactor
**What**: Run `npm run test:coverage`, verify 100% on `src/identity.ts`. Refactor if needed.
**Acceptance**: 100% coverage on new code, tests still green

---

### ⬜ Unit 2a: Config agent-aware paths -- Tests
**What**: Update `src/__tests__/config.test.ts` with failing tests for agent-aware paths:
- `defaultConfigPath()` returns `~/.agentconfigs/{AGENT_NAME}/config.json` (mock identity module)
- `getSessionDir()` returns `~/.agentconfigs/{AGENT_NAME}/sessions`
- `loadConfig()` calls `fs.mkdirSync` with `{ recursive: true }` on the config directory before reading the file
- `AGENT_CONFIG_PATH` env var overrides config path (replaces `OUROBOROS_CONFIG_PATH`)
- `AGENT_MAX_TOKENS` env var overrides maxTokens (replaces `OUROBOROS_MAX_TOKENS`)
- `AGENT_CONTEXT_MARGIN` env var overrides contextMargin (replaces `OUROBOROS_CONTEXT_MARGIN`)
- `AGENT_MAX_TOOL_OUTPUT` env var overrides maxToolOutputChars (replaces `OUROBOROS_MAX_TOOL_OUTPUT`)
- `sessionPath()` uses agent-aware session dir
- Old `OUROBOROS_*` env vars are no longer recognized (clean break)

Note: The config interface name stays as `OuroborosConfig` for now (it is internal and changing it is cosmetic churn). The env var prefix is the user-facing change.
**Files**: `src/__tests__/config.test.ts`
**Acceptance**: Tests exist and FAIL (red) because config.ts still uses old paths/env vars

### ⬜ Unit 2b: Config agent-aware paths -- Implementation
**What**: Modify `src/config.ts`:
- Add `import { getAgentName } from "./identity"`
- `defaultConfigPath()`: `path.join(os.homedir(), ".agentconfigs", getAgentName(), "config.json")`
- `getSessionDir()`: `path.join(os.homedir(), ".agentconfigs", getAgentName(), "sessions")`
- In `loadConfig()`, before reading file: `const dir = path.dirname(configPath); fs.mkdirSync(dir, { recursive: true })`
- Replace env vars: `OUROBOROS_CONFIG_PATH` -> `AGENT_CONFIG_PATH`, `OUROBOROS_MAX_TOKENS` -> `AGENT_MAX_TOKENS`, `OUROBOROS_CONTEXT_MARGIN` -> `AGENT_CONTEXT_MARGIN`, `OUROBOROS_MAX_TOOL_OUTPUT` -> `AGENT_MAX_TOOL_OUTPUT`
**Files**: `src/config.ts`
**Acceptance**: All Unit 2a tests PASS (green), no warnings

### ⬜ Unit 2c: Config agent-aware paths -- Coverage & Refactor
**What**: Verify 100% coverage on modified `src/config.ts` code. Update any other test files that reference old `OUROBOROS_*` env vars (grep for them in test files: `core.test.ts` uses `OUROBOROS_CONFIG_PATH` and `OUROBOROS_MAX_TOOL_OUTPUT`; `teams.test.ts` uses `OUROBOROS_SKIP_CONFIRMATION`).

Note: `OUROBOROS_SKIP_CONFIRMATION` in `src/channels/teams.ts` line 259 should become `AGENT_SKIP_CONFIRMATION`. Update that reference and its tests too.
**Files**: `src/config.ts`, `src/channels/teams.ts`, `src/__tests__/config.test.ts`, `src/__tests__/engine/core.test.ts`, `src/__tests__/channels/teams.test.ts`
**Acceptance**: 100% coverage on modified code, all tests green

---

### ⬜ Unit 3a: Phrases from agent.json -- Tests
**What**: Update `src/__tests__/repertoire/phrases.test.ts` with failing tests:
- `getThinkingPhrases()` returns phrases from `loadAgentConfig().phrases.thinking` when present
- `getToolPhrases()` returns phrases from `loadAgentConfig().phrases.tool` when present
- `getFollowupPhrases()` returns phrases from `loadAgentConfig().phrases.followup` when present
- Each getter falls back to default hardcoded phrases when agent.json has no phrases section
- Each getter falls back to defaults when specific phrase category is missing
- `pickPhrase()` behavior remains unchanged (no modification needed)
- Existing `THINKING_PHRASES`, `TOOL_PHRASES`, `FOLLOWUP_PHRASES` exports become the defaults (or are replaced by getter functions)

Mock `../identity` in the test file to control `loadAgentConfig()`.
**Files**: `src/__tests__/repertoire/phrases.test.ts`
**Acceptance**: Tests exist and FAIL (red)

### ⬜ Unit 3b: Phrases from agent.json -- Implementation
**What**: Modify `src/repertoire/phrases.ts`:
- Import `loadAgentConfig` from `../identity`
- Keep existing arrays as `DEFAULT_THINKING_PHRASES`, `DEFAULT_TOOL_PHRASES`, `DEFAULT_FOLLOWUP_PHRASES`
- Add `getThinkingPhrases(): readonly string[]` -- returns `loadAgentConfig().phrases?.thinking ?? DEFAULT_THINKING_PHRASES` (with try/catch fallback if agent.json can't be loaded)
- Add `getToolPhrases(): readonly string[]` -- same pattern
- Add `getFollowupPhrases(): readonly string[]` -- same pattern
- Export the getter functions alongside the defaults
- `pickPhrase()` unchanged
**Files**: `src/repertoire/phrases.ts`
**Acceptance**: All Unit 3a tests PASS (green), no warnings

### ⬜ Unit 3c: Phrases from agent.json -- Coverage & Refactor
**What**: Verify 100% coverage. Update all callers that reference `THINKING_PHRASES`, `TOOL_PHRASES`, `FOLLOWUP_PHRASES` directly to use the getter functions instead:
- `src/channels/cli.ts` lines 5, 249, 283 -- change imports to use getters
- `src/channels/teams.ts` lines 8, 101, 214 -- change imports to use getters
- Update corresponding test files that import the phrase constants directly:
  - `src/__tests__/channels/cli.test.ts` line 3 -- update import
  - `src/__tests__/channels/teams.test.ts` -- update any phrase constant references

The default arrays can remain exported for backward compatibility in tests that just check "pool is non-empty", but production code should use getters.
**Files**: `src/repertoire/phrases.ts`, `src/channels/cli.ts`, `src/channels/teams.ts`, test files
**Acceptance**: 100% coverage on modified code, all tests green

---

### ⬜ Unit 4a: Skills agent-aware dir -- Tests
**What**: Update `src/__tests__/repertoire/skills.test.ts` with failing tests:
- `listSkills()` reads from `{agentRoot}/skills/` instead of root `skills/`
- `loadSkill()` reads from `{agentRoot}/skills/{name}.md`
- Mock `../identity` to control `getAgentRoot()`
**Files**: `src/__tests__/repertoire/skills.test.ts`
**Acceptance**: Tests exist and FAIL (red)

### ⬜ Unit 4b: Skills agent-aware dir -- Implementation
**What**: Modify `src/repertoire/skills.ts`:
- Import `getAgentRoot` from `../identity`
- Replace module-scope `SKILLS_DIR` constant with a function: `function getSkillsDir(): string { return path.join(getAgentRoot(), "skills") }`
- Update `listSkills()` and `loadSkill()` to call `getSkillsDir()` instead of using `SKILLS_DIR`
**Files**: `src/repertoire/skills.ts`
**Acceptance**: All Unit 4a tests PASS (green), no warnings

### ⬜ Unit 4c: Skills agent-aware dir -- Coverage & Refactor
**What**: Verify 100% coverage on modified `src/repertoire/skills.ts`.
**Acceptance**: 100% coverage, tests still green

---

### ⬜ Unit 5a: Prompt system -- psyche loading & self-awareness -- Tests
**What**: Update `src/__tests__/mind/prompt.test.ts` with failing tests:

**Psyche loading changes:**
- `buildSystem()` loads psyche files from `{agentRoot}/docs/psyche/` instead of `../../docs/psyche/` relative to `__dirname`
- Mock `../identity` to control `getAgentRoot()`

**Self-awareness changes (replace `isOwnCodebase()`):**
- Remove all tests for `isOwnCodebase()` (function deleted)
- `buildSystem()` always includes a runtime info section with:
  - `process.cwd()` (absolute path to codebase)
  - Agent name (from `getAgentName()`)
  - Channel (cli/teams)
  - A note: "i can read and modify my own source code"
- The section does NOT include any ouroboros-specific personality text ("snake eating its own tail", etc.)
- The "i am in my own codebase" conditional block is gone; runtime info is always present

**Channel behavior unchanged:**
- CLI channel still includes "i introduce myself on boot"
- Teams channel still includes "Microsoft Teams" context
**Files**: `src/__tests__/mind/prompt.test.ts`
**Acceptance**: Tests exist and FAIL (red)

### ⬜ Unit 5b: Prompt system -- psyche loading & self-awareness -- Implementation
**What**: Modify `src/mind/prompt.ts`:

**Psyche loading:**
- Import `getAgentRoot, getAgentName` from `../identity`
- Replace module-scope `readFileSync` calls with lazy-cached loader:
  ```
  let _psycheCache: { soul: string; identity: string; lore: string; friends: string } | null = null
  function loadPsyche() {
    if (_psycheCache) return _psycheCache
    const psycheDir = path.join(getAgentRoot(), "docs", "psyche")
    _psycheCache = {
      soul: fs.readFileSync(path.join(psycheDir, "SOUL.md"), "utf-8").trim(),
      identity: fs.readFileSync(path.join(psycheDir, "IDENTITY.md"), "utf-8").trim(),
      lore: fs.readFileSync(path.join(psycheDir, "LORE.md"), "utf-8").trim(),
      friends: fs.readFileSync(path.join(psycheDir, "FRIENDS.md"), "utf-8").trim(),
    }
    return _psycheCache
  }
  ```
- Update `soulSection()`, `identitySection()`, `loreSection()`, `friendsSection()` to call `loadPsyche()`
- Export `resetPsycheCache()` for tests

**Self-awareness rewrite:**
- Delete `isOwnCodebase()` function
- Replace `selfAwareSection(channel)` with `runtimeInfoSection(channel)`:
  ```
  function runtimeInfoSection(channel: Channel): string {
    const lines: string[] = []
    lines.push(`## runtime`)
    lines.push(`- cwd: ${process.cwd()}`)
    lines.push(`- agent: ${getAgentName()}`)
    lines.push(`- channel: ${channel}`)
    lines.push(`- i can read and modify my own source code`)
    if (channel === "cli") {
      lines.push(`- i introduce myself on boot with a fun random greeting.`)
    } else {
      lines.push(`- i am responding in Microsoft Teams. i keep responses concise. i use markdown formatting. i do not introduce myself on boot.`)
    }
    return lines.join("\n")
  }
  ```
- Update `buildSystem()` to call `runtimeInfoSection` instead of `selfAwareSection`

**Move personality text to psyche:**
- Append the following to `ouroboros/docs/psyche/SOUL.md` (or create a new section):
  ```
  ## Self-Modification
  i am Ouroboros -- a snake eating its own tail. i can read and modify my own source code. this is weird but powerful.

  ### what i can do
  - edit src/*.ts source files
  - load skills with load_skill tool to learn specialized workflows
  - use the claude tool to spawn another instance of myself for code review

  ### relevant skills
  - self-edit: for safely editing my own source code
  - self-query: for using the claude tool to get outside perspective on my code

  ### remember
  - edits to source files won't take effect until i restart
  - use git diff to see what i changed
  - when in doubt, ask another instance of myself for a second opinion
  ```
**Files**: `src/mind/prompt.ts`, `ouroboros/docs/psyche/SOUL.md`
**Acceptance**: All Unit 5a tests PASS (green), no warnings

### ⬜ Unit 5c: Prompt system -- Coverage & Refactor
**What**: Verify 100% coverage on modified `src/mind/prompt.ts`. Ensure no dead code from old `isOwnCodebase()` path remains.
**Acceptance**: 100% coverage, tests still green

---

### ⬜ Unit 6a: CLI dynamic greeting & exit -- Tests
**What**: Update test files with failing tests:

**`src/__tests__/channels/cli-main.test.ts`:**
- Banner message uses agent name from `getAgentName()` instead of hardcoded "ouroboros" (line 338 in cli.ts: `console.log("\nouroboros (type /commands for help)\n")`)
- Mock `../identity` to return a test agent name

**`src/__tests__/repertoire/commands.test.ts`:**
- `/exit` description includes dynamic agent name: `"quit {agentName}"` instead of `"quit ouroboros"`
- Mock `../identity` to return a test agent name
**Files**: `src/__tests__/channels/cli-main.test.ts`, `src/__tests__/repertoire/commands.test.ts`
**Acceptance**: Tests exist and FAIL (red)

### ⬜ Unit 6b: CLI dynamic greeting & exit -- Implementation
**What**: Modify source files:

**`src/channels/cli.ts` line 338:**
- Import `getAgentName` from `../identity`
- Change `console.log("\nouroboros (type /commands for help)\n")` to `console.log(\`\n${getAgentName()} (type /commands for help)\n\`)`

**`src/repertoire/commands.ts` line 66:**
- Import `getAgentName` from `../identity`
- Change `description: "quit ouroboros"` to `description: \`quit ${getAgentName()}\``
**Files**: `src/channels/cli.ts`, `src/repertoire/commands.ts`
**Acceptance**: All Unit 6a tests PASS (green), no warnings

### ⬜ Unit 6c: CLI dynamic greeting & exit -- Coverage & Refactor
**What**: Verify 100% coverage on changes. Check that all callers still work.
**Acceptance**: 100% coverage, tests still green

---

### ⬜ Unit 7: Directory moves
**What**: Move agent-specific files to the `ouroboros/` directory:
- `docs/psyche/` -> `ouroboros/docs/psyche/` (SOUL.md, IDENTITY.md, LORE.md, FRIENDS.md)
- `docs/tasks/` -> `ouroboros/docs/tasks/` (all existing task docs)
- `skills/` -> `ouroboros/skills/` (code-review.md, explain.md, README.md, toolmaker.md, self-query.md, self-edit.md)
- `manifest/` -> `ouroboros/manifest/` (manifest.json, color.png, outline.png)
- `docs/OAUTH-SETUP.md` stays at `docs/` (shared infra docs)

Use `git mv` to preserve history. Verify no broken references in source code (all paths should now use identity module, not relative paths).

Create `ouroboros/agent.json`:
```json
{
  "name": "ouroboros",
  "phrases": {
    "thinking": [
      "chewing on that",
      "consulting the chaos gods",
      "untangling neurons",
      "snake eating its own thoughts",
      "brewing something dangerous",
      "calculating optimal chaos",
      "loading personality module",
      "summoning the answer demons"
    ],
    "tool": [
      "rummaging through files",
      "poking around in there",
      "doing science",
      "hold my semicolons",
      "the snake is in the codebase",
      "performing surgery"
    ],
    "followup": [
      "digesting results",
      "processing the chaos",
      "connecting the dots",
      "almost done being clever"
    ]
  }
}
```
**Files**: All moved files, new `ouroboros/agent.json`
**Acceptance**: `git status` shows renames, not deletes+creates. All test paths resolve correctly. `npm test` passes.

---

### ⬜ Unit 8: Package.json & scripts
**What**: Update `package.json`:
- `"name": "ouroboros-agent-harness"`
- `"dev": "tsc && AGENT_NAME=ouroboros node dist/cli-entry.js"`
- `"teams": "tsc && AGENT_NAME=ouroboros node dist/teams-entry.js"`
- `"teams:no-stream": "tsc && AGENT_NAME=ouroboros node dist/teams-entry.js --disable-streaming"`
- `"manifest:package": "cd ouroboros/manifest && zip -r ../../manifest.zip manifest.json color.png outline.png"`

Update `src/mind/prompt.ts` `isOwnCodebase()` references if any remain -- by this point the function should already be deleted (Unit 5b), but verify the package name check in test mocks is removed too.

Update test mocks in `src/__tests__/mind/prompt.test.ts` that set up `package.json` mock reads with `name: "ouroboros"` -- these are for the deleted `isOwnCodebase()` tests and should already be removed in Unit 5a.
**Files**: `package.json`, verify test files
**Acceptance**: `npm run build` succeeds, `npm test` passes

---

### ⬜ Unit 9: README.md
**What**: Create `README.md` at repo root documenting:
- Project name: Ouroboros Agent Harness
- What it is: a shared harness for running multiple AI agents with distinct personalities
- The `{agent}/` directory convention (agent.json, docs/psyche/, skills/, manifest/)
- `agent.json` format (name, phrases)
- `AGENT_NAME` env var requirement
- Config file split: repo `agent.json` for personality, `~/.agentconfigs/{name}/config.json` for secrets
- How to add a new agent
- npm scripts
**Files**: `README.md`
**Acceptance**: README exists, is accurate, `npm test` still passes

---

### ⬜ Unit 10: Integration validation
**What**: Run full validation:
1. `npm run build` -- TypeScript compiles with no errors
2. `npm test` -- all 813+ tests pass
3. `npm run test:coverage` -- 100% coverage on all new/modified code
4. Verify `AGENT_NAME=ouroboros` env var is set in npm scripts
5. Verify agent.json is well-formed and matches phrase arrays from old hardcoded values
6. Verify all `git mv` renames are clean
7. Grep for any remaining hardcoded "ouroboros" in src/ that should be dynamic (excluding package.json name, README references, and test mock data)
8. Grep for any remaining `OUROBOROS_` env var references in src/ (should be zero; all replaced with `AGENT_*`)
9. Verify no broken imports or missing files
**Output**: Clean build, clean test run, coverage report
**Acceptance**: All checks pass, no warnings, no hardcoded agent references in harness code

---

## Key Reference: Current File Signatures

These are the exact current signatures and line numbers that units will modify. Verify before each unit.

### `src/mind/prompt.ts`
- Line 8-11: Module-scope `readFileSync` for psyche files (path: `../../docs/psyche/`)
- Line 14-23: `isOwnCodebase()` -- checks `package.json` name === "ouroboros"
- Line 43-76: `selfAwareSection(channel)` -- conditional block with ouroboros personality text
- Line 140-156: `buildSystem()` -- composes all sections

### `src/config.ts`
- Line 85-87: `defaultConfigPath()` -- hardcoded `"ouroboros"` in path
- Line 110: `OUROBOROS_CONFIG_PATH` env var
- Line 166-168: `OUROBOROS_MAX_TOKENS`, `OUROBOROS_CONTEXT_MARGIN`, `OUROBOROS_MAX_TOOL_OUTPUT` env vars
- Line 195-197: `getSessionDir()` -- hardcoded `"ouroboros"` in path

### `src/repertoire/phrases.ts`
- Lines 4-29: Hardcoded `THINKING_PHRASES`, `TOOL_PHRASES`, `FOLLOWUP_PHRASES` arrays
- Line 32-40: `pickPhrase()` -- unchanged

### `src/repertoire/skills.ts`
- Line 5: Module-scope `SKILLS_DIR = path.join(__dirname, "..", "..", "skills")`

### `src/channels/cli.ts`
- Line 338: `console.log("\nouroboros (type /commands for help)\n")`
- Lines 5: Imports `THINKING_PHRASES, TOOL_PHRASES, FOLLOWUP_PHRASES` directly

### `src/repertoire/commands.ts`
- Line 66: `description: "quit ouroboros"`

### `src/channels/teams.ts`
- Line 8: Imports `THINKING_PHRASES, FOLLOWUP_PHRASES` directly
- Line 259: `process.env.OUROBOROS_SKIP_CONFIRMATION`

### `package.json`
- Line 2: `"name": "ouroboros"`
- Lines 6-12: Scripts without `AGENT_NAME`

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c, etc.)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-02-28-doing-multi-agent-harness/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-02-28 Created doing doc from plan
