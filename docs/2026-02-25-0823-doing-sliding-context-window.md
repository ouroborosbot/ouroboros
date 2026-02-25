# Doing: Sliding Context Window with Session Persistence

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-02-25 11:11
**Planning**: ./2026-02-25-0823-planning-sliding-context-window.md
**Artifacts**: ./2026-02-25-0823-doing-sliding-context-window/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Implement a sliding context window for the ouroboros agent so that extended conversations do not exceed the model's context limit. Older messages are simply dropped (no summarization) while keeping recent context. The conversation state persists to disk so users have continuity across sessions. All configuration moves from env vars to a JSON config file. A slash command system replaces ad-hoc command handling. Philosophy: embrace the LLM's short memory, encourage note-taking.

## Completion Criteria
- [ ] JSON config loaded from `~/.agentconfigs/ouroboros/config.json` with provider credentials, model settings, Teams creds, and context window settings
- [ ] Env vars override config.json values (precedence: env var > config.json > defaults)
- [ ] `getClient()` / `getProvider()` reads from config.json as primary source, falls back to env vars
- [ ] Graceful fallback if config.json missing or malformed (use env vars, then defaults)
- [ ] Token counting function exists and returns approximate token count for a messages array (char/4 heuristic)
- [ ] Sliding window drops old messages when token count exceeds configurable threshold (no summarization)
- [ ] System prompt is always preserved (never trimmed)
- [ ] Oldest messages (after system prompt) are dropped in a single slice, trimming down to `maxTokens * (1 - contextMargin/100)` (default 20% margin = trim to 64k at 80k limit) to create headroom for continued conversation
- [ ] Session files use versioned envelope `{ version: 1, messages }` for future-proofing
- [ ] CLI adapter persists single global session to disk after each turn
- [ ] CLI adapter loads previous session on startup (graceful fallback if no session or corrupt file)
- [ ] Teams adapter persists conversation per `activity.conversation.id` to disk after each turn
- [ ] Teams adapter loads session on incoming message (graceful fallback)
- [ ] Sessions stored at `~/.agentconfigs/ouroboros/sessions/<channel>/` (e.g., `sessions/cli/session.json`, `sessions/teams/<conv-id>.json`)
- [ ] Shared command registry exists with name, description, and handler for each command
- [ ] CLI dispatches `/command` input through the registry before sending to agent
- [ ] CLI `/exit` quits the process, `/new` clears session, `/commands` lists commands
- [ ] Teams manifest includes `commandLists` with descriptions for `/new` and `/commands`
- [ ] Teams handler dispatches `/command` input through the registry before sending to agent
- [ ] Teams `/new` clears the conversation session, `/commands` lists commands
- [ ] Existing `exit` plain-text command replaced by `/exit` slash command
- [ ] `/exit` is NOT registered in Teams
- [ ] Config is cached after first load (requires restart for changes)
- [ ] Per-conversation queue in Teams serializes messages for the same conversation
- [ ] `dotenv` dependency removed — config.json is primary source
- [ ] System prompt refreshed from `buildSystem()` with a 60-second debounce cache (stale for at most 1 minute after code changes)
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

### ✅ Unit 1a: Config Module -- Tests
**What**: Create `src/__tests__/config.test.ts` with failing tests for a new `src/config.ts` module. This module handles loading structured config from `~/.agentconfigs/ouroboros/config.json` with env var overrides. Tests cover:
- `loadConfig()`: reads and parses `~/.agentconfigs/ouroboros/config.json`. Returns typed config object.
- `loadConfig()`: returns defaults when file is missing (ENOENT).
- `loadConfig()`: returns defaults when file contains invalid JSON (graceful fallback).
- `loadConfig()`: merges partial config with defaults (e.g., only `providers.azure` present, rest defaults).
- `getAzureConfig()`: returns `{ apiKey, endpoint, deployment, modelName, apiVersion }` from config.json `providers.azure`, with env var overrides (`AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_MODEL_NAME`, `AZURE_OPENAI_API_VERSION`).
- `getMinimaxConfig()`: returns `{ apiKey, model }` from config.json `providers.minimax`, with env var overrides (`MINIMAX_API_KEY`, `MINIMAX_MODEL`).
- `getTeamsConfig()`: returns `{ clientId, clientSecret, tenantId }` from config.json `teams`, with env var overrides (`CLIENT_ID`, `CLIENT_SECRET`, `TENANT_ID`).
- `getContextConfig()`: returns `{ maxTokens, contextMargin }` from config.json `context`, with env var overrides (`OUROBOROS_MAX_TOKENS`, `OUROBOROS_CONTEXT_MARGIN`). Default maxTokens: 80000, default contextMargin: 20. contextMargin is the percentage of the context window to keep as margin when trimming (20 = maintain 20% margin, trim down to 80% of maxTokens).
- Env var precedence: when both config.json and env var are set, env var wins.
- Config path override via `OUROBOROS_CONFIG_PATH` env var (for testing).
- `getSessionDir()`: returns `~/.agentconfigs/ouroboros/sessions` (derived from config base dir).
- `sessionPath(channel, key)`: returns `<sessionDir>/<channel>/<key>.json` with key sanitized (slashes, colons replaced with underscores).
- Config caching: calling `loadConfig()` twice returns same object without re-reading disk. After `resetConfigCache()`, next call re-reads from disk.
**Output**: Test file that fails because `src/config.ts` does not exist yet
**Acceptance**: Tests exist and FAIL (red) -- module not found errors

### ✅ Unit 1b: Config Module -- Implementation
**What**: Create `src/config.ts` implementing all functions tested in 1a:
- Config file path: `~/.agentconfigs/ouroboros/config.json` (or `OUROBOROS_CONFIG_PATH` env var).
- `loadConfig()`: reads file with `readFileSync`, parses JSON, merges with defaults. Returns typed `OuroborosConfig`. On ENOENT or parse error, returns defaults. **Caches result after first call** — subsequent calls return cached config. Config changes require process restart. Export a `resetConfigCache()` for testing.
- `getAzureConfig()`: reads `providers.azure` from config, overlays env vars (`AZURE_OPENAI_API_KEY` overrides `config.providers.azure.apiKey`, etc.). Default apiVersion: `"2025-04-01-preview"`.
- `getMinimaxConfig()`: reads `providers.minimax` from config, overlays env vars.
- `getTeamsConfig()`: reads `teams` from config, overlays env vars.
- `getContextConfig()`: reads `context` from config, overlays `OUROBOROS_MAX_TOKENS` and `OUROBOROS_CONTEXT_MARGIN` env vars. Default maxTokens: `80000`, default contextMargin: `20`.
- `getSessionDir()`: returns `path.join(os.homedir(), ".agentconfigs", "ouroboros", "sessions")`.
- `sessionPath(channel, key)`: returns `path.join(getSessionDir(), channel, sanitize(key) + ".json")`.
- Export type `OuroborosConfig` with full structure.
**Output**: `src/config.ts` with all functions
**Acceptance**: All Unit 1a tests PASS (green), no warnings

### ✅ Unit 1c: Config Module -- Coverage & Refactor
**What**: Verify 100% coverage on `src/config.ts`. Add any missing edge case tests. Refactor if needed.
**Output**: 100% coverage report for config.ts
**Acceptance**: 100% coverage on new code, tests still green

### 🔄 Unit 2a: Token Counting & Sliding Window -- Tests
**What**: Create `src/__tests__/context.test.ts` with failing tests for token counting and sliding window functions in a new `src/context.ts` module. Tests cover:
- `estimateTokens(messages)`: returns total char-count / 4 for a messages array. Test with empty array (returns 0), single user message, multiple messages, messages with `tool_calls` (should count stringified function name + arguments), tool-result messages (count content).
- `cachedBuildSystem(channel, buildFn)`: returns cached system prompt string. On first call, calls `buildFn(channel)` and caches result + timestamp. On subsequent calls, returns cached result if less than 60 seconds old. If 60+ seconds, rebuilds and re-caches. Export `resetSystemPromptCache()` for testing. Tests: first call invokes buildFn, second call within 60s returns cached (buildFn not called again), call after 60s re-invokes buildFn, different channels get separate caches.
- `trimMessages(messages, maxTokens, contextMargin)`: when under limit (`estimateTokens(messages) <= maxTokens`), returns messages unchanged. When over limit, calculates the **trim target** as `maxTokens * (1 - contextMargin/100)` (e.g., 80000 * 0.8 = 64000 with contextMargin=20). Walks from index 1 forward accumulating dropped token costs until `totalTokens - droppedTokens <= trimTarget`, then slices once. This ensures each trim creates headroom for many more turns before the next trim, maintaining conversation coherence. System prompt (index 0) is always preserved. Returns new array (does not mutate input). Edge cases: only system prompt (nothing to trim), all messages trimmed except system prompt (system prompt alone exceeds limit — still kept), exact boundary (equal to maxTokens — no trim), contextMargin=0 (trim to exactly maxTokens, no extra headroom).
**Output**: Test file that fails because `src/context.ts` does not exist yet
**Acceptance**: Tests exist and FAIL (red) -- module not found errors

### ⬜ Unit 2b: Token Counting & Sliding Window -- Implementation
**What**: Create `src/context.ts` implementing:
- `estimateTokens(messages: OpenAI.ChatCompletionMessageParam[]): number` -- sums character lengths of all message content (including stringified tool_calls arguments and tool result content) divided by 4, rounded up.
- `cachedBuildSystem(channel: Channel, buildFn: (ch: Channel) => string): string` -- caches per channel, returns cached if less than 60s old, otherwise rebuilds. `resetSystemPromptCache()` clears cache for testing.
- `trimMessages(messages: OpenAI.ChatCompletionMessageParam[], maxTokens: number, contextMargin: number): OpenAI.ChatCompletionMessageParam[]` -- if `estimateTokens(messages) <= maxTokens`, return copy of messages. Otherwise: compute trim target as `maxTokens * (1 - contextMargin / 100)`. Compute per-message token costs, walk from index 1 forward accumulating tokens to drop until remaining total is under trim target, then return `[messages[0], ...messages.slice(cutIndex)]` in a single slice. No per-iteration re-estimation.
**Output**: `src/context.ts` with token counting and trimming functions
**Acceptance**: All Unit 2a tests PASS (green), no warnings

### ⬜ Unit 2c: Token Counting & Sliding Window -- Coverage & Refactor
**What**: Verify 100% coverage on `src/context.ts`. Add any missing edge case tests. Refactor if needed.
**Output**: 100% coverage report for context.ts
**Acceptance**: 100% coverage on new code, tests still green

### ⬜ Unit 3a: Session Persistence -- Tests
**Depends on**: Units 2a-2c (context.ts and context.test.ts must exist)
**What**: Add tests to `src/__tests__/context.test.ts` for session persistence functions in `src/context.ts` (same module as token counting/trimming). Tests cover:
- `saveSession(filePath, messages)`: writes JSON to disk as `{ version: 1, messages: [...] }` wrapper. Creates parent directories if needed (`mkdirSync` recursive).
- `loadSession(filePath)`: reads JSON from disk. Expects `{ version, messages }` envelope. Returns parsed messages array on success. Returns null if file missing (ENOENT). Returns null if file is corrupt JSON. Returns null if version is unrecognized (future-proofing). Returns null on other read errors.
- `deleteSession(filePath)`: removes session file. No-op if file missing (ENOENT).
**Output**: Failing tests for session persistence
**Acceptance**: Tests exist and FAIL (red)

### ⬜ Unit 3b: Session Persistence -- Implementation
**What**: Add session functions to `src/context.ts`:
- `saveSession(filePath: string, messages: OpenAI.ChatCompletionMessageParam[]): void` -- `mkdirSync(dirname, { recursive: true })`, `writeFileSync(filePath, JSON.stringify({ version: 1, messages }, null, 2))`.
- `loadSession(filePath: string): OpenAI.ChatCompletionMessageParam[] | null` -- try/catch around `readFileSync` + `JSON.parse`. Expects `{ version: 1, messages }` envelope. Return null on any error or unrecognized version.
- `deleteSession(filePath: string): void` -- try/catch around `unlinkSync`. No-op on ENOENT.
**Output**: Session persistence functions implemented
**Acceptance**: All Unit 3a tests PASS (green), no warnings

### ⬜ Unit 3c: Session Persistence -- Coverage & Refactor
**What**: Verify 100% coverage on session persistence code. Add any missing edge case tests.
**Output**: 100% coverage, tests still green
**Acceptance**: 100% coverage on new code, tests still green

### ⬜ Unit 4a: Slash Command System -- Tests
**What**: Create `src/__tests__/commands.test.ts` with failing tests for a new `src/commands.ts` module. Tests cover:
- Command registry: `createCommandRegistry()` returns a registry with `register(cmd)`, `get(name)`, `list()`, `dispatch(name, context)`.
- `register(cmd)`: adds a command with `{ name, description, handler, channels }`. `channels` is `["cli"]`, `["teams"]`, or `["cli", "teams"]`.
- `get(name)`: returns command definition or undefined.
- `list(channel)`: returns commands available for the given channel, filtered by `channels` field.
- `dispatch(name, context)`: calls handler, returns `{ handled: true, result }` or `{ handled: false }` if command not found.
- Default commands (registered by `registerDefaultCommands(registry)`):
  - `/exit`: channels `["cli"]`, handler returns `{ action: "exit" }`.
  - `/new`: channels `["cli", "teams"]`, handler returns `{ action: "new" }`.
  - `/commands`: channels `["cli", "teams"]`, handler returns formatted list of commands for the given channel.
- `/exit` does NOT appear in `list("teams")`.
- `/commands` output includes name and description for each command.
- Command names are stored/matched without the `/` prefix internally (register as `"exit"`, dispatch as `"exit"`).
- `parseSlashCommand` edge cases: `/` alone (returns null or empty command — decide), input with leading spaces (trimmed first), case insensitive (`/Exit` matches `exit`), `/unknown` (dispatch returns `{ handled: false }`), `//double` (not a valid command), regular text starting with `/` in the middle (e.g., `use /new to reset` — only match if `/` is at start).
**Output**: Test file that fails because `src/commands.ts` does not exist yet
**Acceptance**: Tests exist and FAIL (red)

### ⬜ Unit 4b: Slash Command System -- Implementation
**What**: Create `src/commands.ts` implementing:
- `Command` type: `{ name: string, description: string, channels: Channel[], handler: (ctx: CommandContext) => CommandResult }`.
- `CommandContext` type: `{ channel: Channel }` (extensible later). Note: `Channel` type (`"cli" | "teams"`) must be exported from `src/core.ts` (or extracted to a shared types file) so `commands.ts` can import it.
- `CommandResult` type: `{ action: "exit" | "new" | "response", message?: string }`.
- `createCommandRegistry()`: returns registry object with `register`, `get`, `list`, `dispatch` methods.
- `registerDefaultCommands(registry)`: registers `/exit` (CLI only), `/new` (both), `/commands` (both).
- `parseSlashCommand(input)`: if input starts with `/`, returns `{ command: name, args: rest }`. Otherwise returns null.
**Output**: `src/commands.ts` with command system
**Acceptance**: All Unit 4a tests PASS (green), no warnings

### ⬜ Unit 4c: Slash Command System -- Coverage & Refactor
**What**: Verify 100% coverage on `src/commands.ts`. Add any missing edge case tests.
**Output**: 100% coverage, tests still green
**Acceptance**: 100% coverage on new code, tests still green

### ⬜ Unit 5a: Core Module Config Integration -- Tests
**Depends on**: Units 1a-1c (config module must exist)
**What**: Add tests to `src/__tests__/core.test.ts` for the refactored `getClient()` that reads from config.json. Tests cover:
- `getClient()` uses `getAzureConfig()` when azure config has apiKey (from config.json or env var).
- `getClient()` uses `getMinimaxConfig()` when minimax config has apiKey.
- `getClient()` prefers azure when both are configured.
- `getClient()` falls back correctly when config.json is missing (existing env var behavior preserved).
- `getProvider()` and `getModel()` return correct values after initialization from config.
- Error case: neither provider configured -- exits with error message.
**Output**: Failing tests for config-based client initialization
**Acceptance**: Tests exist and FAIL (red)

### ⬜ Unit 5b: Core Module Config Integration -- Implementation
**What**: Modify `src/core.ts` `getClient()` to use `getAzureConfig()` and `getMinimaxConfig()` from `src/config.ts` instead of reading env vars directly. The `AZURE_REQUIRED` and `MINIMAX_REQUIRED` constants and `hasAll()` function are replaced by checking config objects (e.g., `azureConfig.apiKey` is truthy). The `AzureOpenAI` and `OpenAI` client construction uses config values. Env var override is handled inside `getAzureConfig()` / `getMinimaxConfig()` so `getClient()` just reads the merged config.
**Output**: Modified `src/core.ts` using config module
**Acceptance**: All Unit 5a tests PASS (green), existing core tests still pass, no warnings

### ⬜ Unit 5c: Core Module Config Integration -- Coverage & Refactor
**What**: Verify 100% coverage on modified `src/core.ts`. Ensure all existing core tests still pass. Add any missing edge case tests.
**Output**: 100% coverage, all tests green
**Acceptance**: 100% coverage on new code, tests still green

### ⬜ Unit 6a: CLI Integration -- Tests
**Depends on**: Units 1-4 (config, context, session, commands modules must exist)
**What**: Add tests to `src/__tests__/agent-main.test.ts` for CLI session persistence and slash command dispatch:
- On startup, `main()` calls `loadSession` to restore previous conversation. If session exists, messages array is pre-populated (no boot greeting).
- On startup, if no session exists, messages array starts fresh with system prompt and boot greeting runs.
- On startup, if session file is corrupt, messages array starts fresh (graceful fallback, boot greeting runs).
- After each turn (after `runAgent` returns), `saveSession` is called with current messages.
- After boot greeting, `saveSession` is called.
- `trimMessages` is called before `runAgent` to enforce context window.
- Context window integration test: with `OUROBOROS_MAX_TOKENS=100`, send several messages that exceed the limit. Verify that older messages are trimmed from the messages array passed to `runAgent`, system prompt is preserved, and the saved session reflects the trimmed state.
- Slash command `/exit`: quits the process (same as old `exit` behavior).
- Slash command `/new`: clears messages to just system prompt, calls `deleteSession`, prints confirmation, does NOT send to model.
- Slash command `/commands`: prints list of CLI commands, does NOT send to model.
- Old `exit` plain text is removed -- replaced entirely by `/exit` slash command.
- Boot message updated to show slash command hints.
- Session path uses `sessionPath("cli", "session")` from config module.
- System prompt refresh: when a session is loaded from disk, `messages[0]` is replaced with current `cachedBuildSystem("cli", buildSystem)` output (not the stale prompt from the saved session).
**Output**: Failing tests for CLI integration
**Acceptance**: Tests exist and FAIL (red)

### ⬜ Unit 6b: CLI Integration -- Implementation
**What**: Modify `src/agent.ts` `main()`:
- Import from `./config`: `getSessionDir`, `sessionPath`, `getContextConfig`.
- Import from `./context`: `loadSession`, `saveSession`, `deleteSession`, `trimMessages`, `cachedBuildSystem`.
- Import from `./commands`: `createCommandRegistry`, `registerDefaultCommands`, `parseSlashCommand`.
- On startup: compute session path via `sessionPath("cli", "session")`. Load session. If non-null and contains messages, use as messages array (skip boot greeting). If null, create fresh with system prompt and run boot greeting.
- Before each `runAgent` call: refresh system prompt via `messages[0] = { role: "system", content: cachedBuildSystem("cli", buildSystem) }`. Ensures prompt stays current (60s debounce).
- Create command registry, register defaults.
- In input loop: check `parseSlashCommand(input)`. If slash command found, dispatch through registry. Handle results: `exit` -> break, `new` -> reset messages + deleteSession + print confirmation, `response` -> print message. Skip `runAgent` for handled commands.
- After `messages.push({ role: "user", ... })` but before `runAgent`: call `trimMessages` and replace messages array contents. `const { maxTokens, contextMargin } = getContextConfig(); const trimmed = trimMessages(messages, maxTokens, contextMargin); messages.length = 0; messages.push(...trimmed);`.
- After `runAgent`: call `saveSession(path, messages)`.
- After boot greeting: call `saveSession(path, messages)`.
- Remove old `exit` plain-text check (replaced by `/exit`).
- Update boot message to show `(type /commands for help)`.
**Output**: Modified `src/agent.ts` with slash commands and session persistence
**Acceptance**: All Unit 6a tests PASS (green), no warnings

### ⬜ Unit 6c: CLI Integration -- Coverage & Refactor
**What**: Verify 100% coverage on modified `src/agent.ts`. Ensure all existing agent tests still pass. Add any missing edge case tests.
**Output**: 100% coverage, all tests green
**Acceptance**: 100% coverage on new code, tests still green

### ⬜ Unit 7a: Teams Integration -- Tests
**Depends on**: Units 1-4 (config, context, session, commands modules must exist)
**What**: Add tests to `src/__tests__/teams.test.ts` for Teams per-conversation persistence, slash commands, and manifest:
- `handleTeamsMessage` signature changes to `handleTeamsMessage(text, stream, conversationId)`.
- On each message: loads session for that conversation ID. If session exists, uses it. If not, creates fresh with system prompt.
- After `runAgent` returns: saves session for that conversation ID.
- `trimMessages` is called before `runAgent`.
- Context window integration test: with `OUROBOROS_MAX_TOKENS=100`, send several messages to a conversation. Verify older messages are trimmed, system prompt preserved, saved session reflects trimmed state.
- Multiple conversations: two different conversation IDs maintain separate message arrays.
- Graceful fallback: corrupt session file results in fresh conversation.
- The global `messages` array is removed (replaced by per-conversation load/save).
- Slash command `/new`: clears the conversation session, sends confirmation via stream (does NOT call runAgent).
- Slash command `/commands`: sends command list via stream (does NOT call runAgent).
- `/exit` is NOT available in Teams (not in registry for teams channel).
- `startTeamsApp` message handler passes `activity.conversation.id` to `handleTeamsMessage`.
- Per-conversation queue: `withConversationLock(convId, fn)` serializes messages for the same conversation. Two messages for the same conversation are processed sequentially (not concurrently). Two messages for different conversations run in parallel.
- Concurrent message test: two messages arrive for the same conversation — second waits for first to finish, both are saved correctly without data loss.
- Manifest `commandLists` validation: verify the manifest structure includes commands with titles and descriptions.
**Output**: Failing tests for Teams integration
**Acceptance**: Tests exist and FAIL (red)

### ⬜ Unit 7b: Teams Integration -- Implementation
**What**: Modify `src/teams.ts`:
- Import from `./config`: `getSessionDir`, `sessionPath`, `getContextConfig`, `getTeamsConfig`.
- Import from `./context`: `loadSession`, `saveSession`, `deleteSession`, `trimMessages`, `cachedBuildSystem`.
- Import from `./commands`: `createCommandRegistry`, `registerDefaultCommands`, `parseSlashCommand`.
- Remove the global `messages` array (line 122-124 currently).
- Change `handleTeamsMessage(text, stream)` to `handleTeamsMessage(text, stream, conversationId)`:
  - Check `parseSlashCommand(text)`. If slash command: dispatch. For `/new`: delete session, send "session cleared" via `stream.emit()`, return (SDK auto-closes stream after handler returns — do NOT call `stream.close()` manually). For `/commands`: send list via `stream.emit()`, return.
  - Compute session path: `sessionPath("teams", conversationId)`.
  - Load session: `loadSession(path) || [{ role: "system", content: cachedBuildSystem("teams", buildSystem) }]`.
  - Refresh system prompt: `messages[0] = { role: "system", content: cachedBuildSystem("teams", buildSystem) }` (60s debounce).
  - Push user message onto loaded messages.
  - Trim: `const { maxTokens, contextMargin } = getContextConfig(); const trimmed = trimMessages(messages, maxTokens, contextMargin); messages.length = 0; messages.push(...trimmed);`.
  - Call `runAgent(messages, callbacks, signal)`.
  - After runAgent: `saveSession(path, messages)`.
- In `startTeamsApp`: update `app.on("message", ...)` handler to wrap `handleTeamsMessage` in `withConversationLock(activity.conversation.id, fn)` to serialize messages per conversation.
- `withConversationLock(convId, fn)`: maintains a `Map<string, Promise<void>>`. Each new call chains onto the previous promise for that conversation ID. Ensures sequential processing per conversation while allowing parallel processing across conversations.
- Modify `startTeamsApp` to use `getTeamsConfig()` for `clientId`, `clientSecret`, `tenantId` instead of reading env vars directly.
- Update `manifest/manifest.json`: add `commandLists` to the bot entry with `/new` and `/commands` descriptions.
- Remove `dotenv` dependency: `src/teams-entry.ts` no longer calls `dotenv.config()`. All config comes from `config.json` (with env var overrides for CI). Remove `dotenv` from `package.json` dependencies.
**Output**: Modified `src/teams.ts`, `src/teams-entry.ts`, `manifest/manifest.json`, `package.json`
**Acceptance**: All Unit 7a tests PASS (green), no warnings

### ⬜ Unit 7c: Teams Integration -- Coverage & Refactor
**What**: Verify 100% coverage on modified `src/teams.ts`. Ensure all existing Teams tests still pass. Add any missing edge case tests.
**Output**: 100% coverage, all tests green
**Acceptance**: 100% coverage on new code, tests still green

### ⬜ Unit 8: Integration Validation
**Depends on**: All prior units (1-7) complete
**What**: Run full test suite (`npm test`). Verify no regressions across all test files. Run coverage report (`npm run test:coverage`). Verify 100% on all new/modified files (`src/config.ts`, `src/context.ts`, `src/commands.ts`, `src/agent.ts`, `src/teams.ts`). Fix any issues found.
**Output**: Clean test run, full coverage report saved to artifacts directory
**Acceptance**: All tests pass, 100% coverage on new code, no warnings

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c, etc.)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-02-25-0823-doing-sliding-context-window/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-02-25 11:11 Created from planning doc (fresh overwrite, Pass 1 first draft)
- 2026-02-25 11:18 Pass 2 granularity -- firmed up session module location, added dependency notes
- 2026-02-25 11:28 Pass 3 validation -- verified line numbers, patterns, paths against current codebase
- 2026-02-25 11:30 Pass 4 quality -- resolved TBD (exit replaced by /exit), verified all acceptance criteria present
- 2026-02-25 Post-review fixes: (1) session versioned envelope `{ version: 1, messages }`, (2) trimMessages uses single slice instead of one-at-a-time loop, (3) Teams slash commands don't call stream.close() manually (SDK auto-closes)
- 2026-02-25 Added: config caching (restart required), per-conversation queue in Teams, remove dotenv, slash command edge cases, system prompt 60s debounce cache
- 2026-02-25 Final pass: added Unit 3 dependency on Unit 2, fixed trimMessages result assignment in Unit 7b
- 2026-02-25 13:24 Unit 1a complete: 21 failing tests for config module (loadConfig, getAzureConfig, getMinimaxConfig, getTeamsConfig, getContextConfig, sessionPath)
- 2026-02-25 13:25 Unit 1b complete: config.ts implemented, all 21 tests pass, 308 total tests pass
- 2026-02-25 13:25 Unit 1c complete: 100% coverage on config.ts (stmts/branch/funcs/lines)
