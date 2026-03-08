# Doing: Adoption Specialist First-Run Experience

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-07 22:40
**Planning**: ./2026-03-07-2234-planning-adoption-specialist.md
**Artifacts**: ./2026-03-07-2234-doing-adoption-specialist/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Build the end-to-end first-run onboarding flow: when a user runs `ouro` with no agents, the Adoption Specialist (an ephemeral LLM agent with a random snake identity) conducts an interview, hatches a new agent, and hands off to the hatchling in a single seamless session.

## Completion Criteria
- [ ] Running `ouro` with no agents in `~/AgentBundles/` launches the specialist session
- [ ] Provider selection and credential entry happen before the LLM chat
- [ ] Credentials are verified (provider runtime created successfully) before starting the specialist chat
- [ ] Specialist loads SOUL.md + a random identity from the bundled `AdoptionSpecialist.ouro/`
- [ ] Specialist can call `hatch_agent` tool to create a new agent bundle
- [ ] Hatch animation displays after successful `hatch_agent` call
- [ ] After specialist session ends, the hatchling's CLI session starts automatically
- [ ] Specialist secrets are written to `~/.agentsecrets/AdoptionSpecialist/secrets.json` using the user's chosen provider credentials
- [ ] Hatchling secrets are written to `~/.agentsecrets/{hatchlingName}/secrets.json`
- [ ] The AdoptionSpecialist.ouro bundle is NEVER copied to `~/AgentBundles/`
- [ ] All existing tests continue to pass
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

### ✅ Unit 0: Baseline Verification
**Depends on**: nothing
**What**: Run full test suite to confirm green baseline before any changes.
**Output**: All 1962 tests passing, 100% coverage, clean tsc build.
**Acceptance**: `npm test` passes with no failures and no warnings. Record pass count in progress log.

---

### ✅ Unit 1a: identity.ts -- setAgentConfigOverride -- Tests
**What**: Write tests for a new `setAgentConfigOverride(config | null)` function on `identity.ts`. When set to a non-null `AgentConfig`, `loadAgentConfig()` should return the override instead of reading from disk. When set to `null`, normal disk-based loading resumes. `resetIdentity()` should also clear the override.
**Files**: `src/__tests__/heart/identity.test.ts` (add tests to existing file)
**Tests to write**:
- `setAgentConfigOverride(config)` causes `loadAgentConfig()` to return the override
- `setAgentConfigOverride(null)` restores disk-based loading
- `resetIdentity()` clears the override
- Override takes precedence over cached disk config
**Acceptance**: Tests exist and FAIL (red) because `setAgentConfigOverride` does not exist yet.

### ✅ Unit 1b: identity.ts -- setAgentConfigOverride -- Implementation
**What**: Add `setAgentConfigOverride(config: AgentConfig | null): void` to `identity.ts`. Add a `_agentConfigOverride` module-level variable. Modify `loadAgentConfig()` to check the override first. Modify `resetIdentity()` to clear it.
**Files**: `src/heart/identity.ts`
**Acceptance**: All tests PASS (green), no warnings. Existing identity tests still pass.

### ✅ Unit 1c: identity.ts -- setAgentConfigOverride -- Coverage & Refactor
**What**: Verify 100% coverage on new code. Refactor if needed.
**Acceptance**: 100% coverage on `setAgentConfigOverride` and modified `loadAgentConfig()` paths. Tests still green.

---

### ✅ Unit 2a: core.ts -- resetProviderRuntime -- Tests
**What**: Write tests for a new `resetProviderRuntime()` function on `core.ts`. When called, the cached `_providerRuntime` singleton should be cleared so the next call to `getProviderRuntime()` re-creates it from current config.
**Files**: `src/__tests__/heart/core.test.ts` (add tests to existing file or create if needed)
**Tests to write**:
- `resetProviderRuntime()` clears the cached provider so next access re-creates it
- After `resetProviderRuntime()`, provider picks up new config values (e.g., different provider in agent config)
**Acceptance**: Tests exist and FAIL (red) because `resetProviderRuntime` does not exist yet.

### ✅ Unit 2b: core.ts -- resetProviderRuntime -- Implementation
**What**: Add `export function resetProviderRuntime(): void` to `core.ts` that sets `_providerRuntime = null`.
**Files**: `src/heart/core.ts`
**Acceptance**: All tests PASS (green), no warnings.

### ✅ Unit 2c: core.ts -- resetProviderRuntime -- Coverage & Refactor
**What**: Verify 100% coverage on `resetProviderRuntime`.
**Acceptance**: 100% coverage, tests still green.

---

### ✅ Unit 3a: hatch-flow.ts -- Export writeSecretsFile -- Tests
**What**: Write tests verifying `writeSecretsFile` can be imported and called directly (it is currently private). Tests should verify it writes a valid secrets.json for each provider type to a given path.
**Files**: `src/__tests__/heart/daemon/hatch-flow.test.ts` (add tests)
**Tests to write**:
- `writeSecretsFile("TestAgent", "anthropic", { setupToken: "..." }, secretsRoot)` creates correct file
- `writeSecretsFile("TestAgent", "azure", { apiKey: "...", endpoint: "...", deployment: "..." }, secretsRoot)` creates correct file
- Returns the path to the written secrets file
**Acceptance**: Tests FAIL because `writeSecretsFile` is not exported.

### ✅ Unit 3b: hatch-flow.ts -- Export writeSecretsFile -- Implementation
**What**: Change `writeSecretsFile` from a private function to an exported function in `hatch-flow.ts`. No logic changes -- just add `export` keyword.
**Files**: `src/heart/daemon/hatch-flow.ts`
**Acceptance**: All tests PASS (green). Existing hatch-flow tests still pass.

### ✅ Unit 3c: hatch-flow.ts -- Export writeSecretsFile -- Coverage & Refactor
**What**: Verify coverage. The function was already covered by existing tests calling `runHatchFlow`. New direct tests add additional coverage paths.
**Acceptance**: 100% coverage on `writeSecretsFile`, tests still green.

---

### ✅ Unit 4a: Hatch Animation -- Tests
**What**: Write tests for a `playHatchAnimation(hatchlingName: string, writer?: (text: string) => void)` function. The function prints egg emoji, pauses, prints snake emoji + name. Tests use a mock writer to capture output.
**Files**: `src/__tests__/heart/daemon/hatch-animation.test.ts` (new file)
**Tests to write**:
- Animation writes egg emoji, then snake emoji + hatchling name
- Custom writer receives all output chunks
- Output contains the hatchling name
**Acceptance**: Tests FAIL because the module does not exist yet.

### ✅ Unit 4b: Hatch Animation -- Implementation
**What**: Create `src/heart/daemon/hatch-animation.ts` with `playHatchAnimation(hatchlingName, writer?)`. Uses `setTimeout` for timing (~1-2 seconds total). Default writer is `process.stderr.write`. Sequence: egg emoji -> animated dots -> snake emoji + name with ANSI color.
**Files**: `src/heart/daemon/hatch-animation.ts` (new file)
**Acceptance**: All tests PASS (green).

### ✅ Unit 4c: Hatch Animation -- Coverage & Refactor
**What**: Verify 100% coverage on the animation module. Ensure default writer branch is covered.
**Acceptance**: 100% coverage, tests still green.

---

### ✅ Unit 5a: Specialist System Prompt Builder -- Tests
**What**: Write tests for `buildSpecialistSystemPrompt(soulText, identityText, existingBundles)` that assembles the specialist's system prompt. The prompt should be first-person, include SOUL.md content, identity content, list of existing bundles, and instructions about available tools.
**Files**: `src/__tests__/heart/daemon/specialist-prompt.test.ts` (new file)
**Tests to write**:
- Prompt includes SOUL.md text
- Prompt includes identity text
- Prompt includes existing bundle names when provided
- Prompt is empty-safe (handles no bundles, empty SOUL, empty identity gracefully)
- Prompt includes tool usage guidance (hatch_agent, final_answer, read_file, list_directory)
**Acceptance**: Tests FAIL because the module does not exist yet.

### ✅ Unit 5b: Specialist System Prompt Builder -- Implementation
**What**: Create `src/heart/daemon/specialist-prompt.ts` with `buildSpecialistSystemPrompt(soulText: string, identityText: string, existingBundles: string[]): string`. Assembles first-person prompt from the inputs.
**Files**: `src/heart/daemon/specialist-prompt.ts` (new file)
**Acceptance**: All tests PASS (green).

### ✅ Unit 5c: Specialist System Prompt Builder -- Coverage & Refactor
**What**: Verify 100% coverage.
**Acceptance**: 100% coverage, tests still green.

---

### ⬜ Unit 6a: Specialist Tool Definitions -- Tests
**What**: Write tests for `getSpecialistTools(deps)` that returns the specialist's tool schema array. Should include: `hatch_agent` (with `name` string param, required), `final_answer` (with `answer` string param), `read_file` (from base tools), `list_directory` (from base tools).
**Files**: `src/__tests__/heart/daemon/specialist-tools.test.ts` (new file)
**Tests to write**:
- Returns exactly 4 tool schemas
- `hatch_agent` tool has `name` required parameter
- `final_answer` tool has `answer` parameter
- `read_file` and `list_directory` tools match their base tool schemas
- Tool names are correct
**Acceptance**: Tests FAIL because the module does not exist yet.

### ⬜ Unit 6b: Specialist Tool Definitions -- Implementation
**What**: Create `src/heart/daemon/specialist-tools.ts`. Define `hatch_agent` tool schema. Re-export `read_file` and `list_directory` schemas from `tools-base.ts`. Re-export `finalAnswerTool`. Provide `getSpecialistTools()` that returns the array. Provide `execSpecialistTool(name, args, deps)` that dispatches tool calls -- `hatch_agent` calls `runHatchFlow` + `playHatchAnimation`, `read_file`/`list_directory` call the base handlers, `final_answer` is handled inline by the session loop (not dispatched here).
**Files**: `src/heart/daemon/specialist-tools.ts` (new file)
**Acceptance**: All tests PASS (green).

### ⬜ Unit 6c: Specialist Tool Execution -- Tests
**What**: Write tests for `execSpecialistTool(name, args, deps)`.
**Files**: `src/__tests__/heart/daemon/specialist-tools.test.ts` (add to existing)
**Tests to write**:
- `hatch_agent` with valid name calls `runHatchFlow` and `playHatchAnimation`, returns description of what was created
- `hatch_agent` with missing name returns error
- `read_file` delegates to base handler and returns file content
- `list_directory` delegates to base handler and returns listing
- Unknown tool name returns "unknown" error
**Acceptance**: Tests PASS (green).

### ⬜ Unit 6d: Specialist Tools -- Coverage & Refactor
**What**: Verify 100% coverage on specialist tools module.
**Acceptance**: 100% coverage, tests still green.

---

### ⬜ Unit 7a: Specialist Session Loop -- Tests
**What**: Write tests for `runSpecialistSession(deps)` -- the main conversation loop. This is the core of the feature. The session loop: reads user input, calls the provider's `streamTurn`, handles tool calls, handles `final_answer`, supports Ctrl-C abort.
**Files**: `src/__tests__/heart/daemon/specialist-session.test.ts` (new file)

**Dependencies to inject** (via `SpecialistSessionDeps` interface):
- `providerRuntime: ProviderRuntime` -- mock provider that returns scripted responses
- `systemPrompt: string` -- the specialist's system prompt
- `tools: OpenAI.ChatCompletionFunctionTool[]` -- tool schemas
- `execTool: (name, args) => Promise<string>` -- tool executor
- `readline: { question: () => Promise<string>, close: () => void }` -- mock readline
- `callbacks: ChannelCallbacks` -- mock callbacks
- `signal?: AbortSignal` -- for abort support

**Tests to write**:
- Session sends system prompt + user message to provider
- Provider response with text is displayed via callbacks
- Provider response with `final_answer` tool call ends the session
- Provider response with `hatch_agent` tool call executes the tool and continues
- Provider response with `read_file` tool call executes and continues
- Ctrl-C (abort signal) cleanly exits the session
- Session returns the hatchling name if `hatch_agent` was called, null otherwise
- Empty user input is skipped (prompt re-displayed)
**Acceptance**: Tests FAIL because the module does not exist yet.

### ⬜ Unit 7b: Specialist Session Loop -- Implementation
**What**: Create `src/heart/daemon/specialist-session.ts` with `runSpecialistSession(deps: SpecialistSessionDeps): Promise<SpecialistSessionResult>`.

The loop:
1. Initialize messages with system prompt
2. Loop: prompt user -> add to messages -> call `streamTurn` -> process result
3. If result has no tool calls: push assistant message, re-prompt
4. If result has `final_answer` sole call: extract answer, emit via callbacks, done
5. If result has other tool calls: execute each, push tool results, continue loop
6. On abort signal: clean exit
7. Return `{ hatchedAgentName: string | null }` -- name from `hatch_agent` if called

**Files**: `src/heart/daemon/specialist-session.ts` (new file)
**Acceptance**: All tests PASS (green).

### ⬜ Unit 7c: Specialist Session Loop -- Coverage & Refactor
**What**: Verify 100% coverage. Add edge case tests if needed (e.g., malformed final_answer, tool execution error, mixed final_answer with other tools).
**Acceptance**: 100% coverage, tests still green.

---

### ⬜ Unit 8a: Specialist Orchestrator -- Tests
**What**: Write tests for `runAdoptionSpecialist(deps)` -- the top-level orchestrator that wires everything together. This function:
1. Picks a random identity from the bundled `AdoptionSpecialist.ouro/`
2. Reads SOUL.md from the bundled copy
3. Lists existing bundles from `~/AgentBundles/`
4. Builds the system prompt
5. Sets up the provider (setAgentName, setAgentConfigOverride, writeSecretsFile, resetProviderRuntime, resetConfigCache, resetIdentity state)
6. Runs the specialist session
7. Cleans up identity/config overrides afterward
8. Returns the hatchling name

**Files**: `src/__tests__/heart/daemon/specialist-orchestrator.test.ts` (new file)
**Tests to write**:
- Orchestrator reads SOUL.md and picks a random identity from bundled AdoptionSpecialist.ouro
- Orchestrator sets agent name to "AdoptionSpecialist" and overrides agent config
- Orchestrator writes specialist secrets via writeSecretsFile
- Orchestrator resets provider runtime before creating specialist provider
- Orchestrator builds system prompt with soul, identity, and existing bundles
- Orchestrator runs the specialist session and returns hatchling name
- Orchestrator restores identity/config state after session (cleanup)
- Cleanup runs even if session throws
**Acceptance**: Tests FAIL because the module does not exist yet.

### ⬜ Unit 8b: Specialist Orchestrator -- Implementation
**What**: Create `src/heart/daemon/specialist-orchestrator.ts` with `runAdoptionSpecialist(deps: AdoptionSpecialistDeps): Promise<string | null>`.

**Deps interface** should include:
- `bundleSourceDir: string` -- path to the bundled `AdoptionSpecialist.ouro/` (from repo/npm package)
- `bundlesRoot: string` -- `~/AgentBundles/` for listing existing bundles
- `secretsRoot: string` -- `~/.agentsecrets/` for writing specialist secrets
- `provider: AgentProvider` -- chosen by user
- `credentials: HatchCredentialsInput` -- from auth flow
- `humanName: string` -- from auth flow
- `random?: () => number` -- for deterministic testing
- `createReadline: () => readline interface` -- injectable for testing
- `callbacks: ChannelCallbacks` -- from createCliCallbacks
- `signal?: AbortSignal`

**Files**: `src/heart/daemon/specialist-orchestrator.ts` (new file)
**Acceptance**: All tests PASS (green).

### ⬜ Unit 8c: Specialist Orchestrator -- Coverage & Refactor
**What**: Verify 100% coverage. Test cleanup-on-error path. Test edge cases.
**Acceptance**: 100% coverage, tests still green.

---

### ⬜ Unit 9a: daemon-cli.ts Integration -- Tests
**What**: Write tests for the modified `runOuroCli` flow. When zero agents are discovered AND `runHatchFlow` dep is available, the CLI should route to the specialist orchestrator instead of the old interactive `resolveHatchInput` flow.
**Files**: `src/__tests__/heart/daemon/daemon-cli.test.ts` (add tests to existing file)
**Tests to write**:
- Zero discovered agents triggers specialist session (calls `runAdoptionSpecialist` dep)
- Specialist returns hatchling name -> daemon starts -> `startChat` called with that name
- Specialist returns null (aborted) -> exits cleanly without starting chat
- The old `resolveHatchInput` prompts still work for `ouro hatch --agent X --provider Y` (explicit hatch command with args)
**Acceptance**: Tests FAIL because the integration code does not exist yet.

### ⬜ Unit 9b: daemon-cli.ts Integration -- Implementation
**What**: Modify `runOuroCli` in `daemon-cli.ts`:
- Add `runAdoptionSpecialist` to `OuroCliDeps` as an optional dep
- When `args.length === 0` and `discovered.length === 0`: if `runAdoptionSpecialist` dep exists, call it with an `AdoptionSpecialistDeps` object
- The auth flow (provider selection + credential prompting) runs first (reuse existing `resolveHatchInput` logic for provider/credentials only, NOT agent name/human name)
- Then call `runAdoptionSpecialist`
- On success (hatchling name returned): install subagents, register UTI, ensure daemon, start chat with hatchling
- On null (aborted): exit cleanly
- Update `createDefaultOuroCliDeps` to wire in the real orchestrator

**Files**: `src/heart/daemon/daemon-cli.ts`
**Acceptance**: All tests PASS (green). Existing daemon-cli tests still pass.

### ⬜ Unit 9c: daemon-cli.ts Integration -- Coverage & Refactor
**What**: Verify 100% coverage on modified code paths. Ensure no regressions.
**Acceptance**: 100% coverage, tests still green.

---

### ⬜ Unit 10: Full Test Suite Verification
**What**: Run the complete test suite. Verify all tests pass, 100% coverage maintained, no warnings, clean tsc build.
**Output**: Test results summary in progress log.
**Acceptance**: All tests pass. Coverage at 100% (statements, branches, functions, lines). `npx tsc --noEmit` clean.

---

### ⬜ Unit 11: E2E Validation Checklist
**What**: Manual verification checklist (not automated -- requires real provider credentials).
**Output**: Checklist results documented in artifacts directory.
**Acceptance**: All items checked.

**Checklist**:
- [ ] `ouro` with empty `~/AgentBundles/` prompts for provider selection
- [ ] After selecting provider and entering credentials, specialist LLM session starts
- [ ] Specialist greets user in character (random identity each run)
- [ ] Specialist can use `read_file` and `list_directory` when relevant
- [ ] User can ask specialist to hatch an agent by name
- [ ] Specialist calls `hatch_agent` tool
- [ ] Hatch animation plays (egg -> snake + name)
- [ ] Specialist continues chatting after hatch (explains what was created)
- [ ] Specialist calls `final_answer` to end session
- [ ] Hatchling CLI session starts automatically
- [ ] `~/AgentBundles/{name}.ouro/` exists with correct structure
- [ ] `~/.agentsecrets/{name}/secrets.json` exists with correct credentials
- [ ] `~/.agentsecrets/AdoptionSpecialist/secrets.json` exists
- [ ] No `AdoptionSpecialist.ouro` in `~/AgentBundles/`
- [ ] Ctrl-C during specialist session exits cleanly
- [ ] Running `ouro` again (with agents existing) goes to normal chat, not specialist

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (Xa, Xb, Xc)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-07-2234-doing-adoption-specialist/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-07 22:40 Created from planning doc
- 2026-03-07 22:43 Passes complete (granularity, validation, quality). Status: READY_FOR_EXECUTION
- 2026-03-07 22:46 Unit 0 complete: 2046 tests passing, 18 skipped, 100% coverage, clean tsc build
- 2026-03-07 22:49 Unit 1 complete: setAgentConfigOverride added to identity.ts, 4 new tests, 100% coverage
- 2026-03-07 22:50 Unit 2 complete: resetProviderRuntime added to core.ts, 2 new tests, 100% coverage
- 2026-03-07 22:51 Unit 3 complete: writeSecretsFile exported from hatch-flow.ts, 3 new tests, 100% coverage
- 2026-03-07 22:53 Unit 4 complete: hatch-animation.ts created, 4 tests, 100% coverage
