# Doing: Sliding Context Window with Session Persistence

**Status**: drafting
**Execution Mode**: pending
**Created**: 2026-02-25 08:38
**Planning**: ./2026-02-25-0823-planning-sliding-context-window.md
**Artifacts**: ./2026-02-25-0823-doing-sliding-context-window/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Implement a sliding context window for the ouroboros agent so that extended conversations do not exceed the model's context limit. Older messages are simply dropped (no summarization) while keeping recent context. The conversation state persists to disk so users have continuity across sessions. Philosophy: embrace the LLM's short memory, encourage note-taking.

## Completion Criteria
- [ ] Token counting function exists and returns approximate token count for a messages array (char/4 heuristic)
- [ ] Sliding window drops old messages when token count exceeds configurable threshold (no summarization)
- [ ] System prompt is always preserved (never trimmed)
- [ ] Most recent N messages are always preserved (never trimmed)
- [ ] CLI adapter persists single global session to disk after each turn
- [ ] CLI adapter loads previous session on startup (graceful fallback if no session or corrupt file)
- [ ] CLI supports "new" command to clear session and start fresh
- [ ] Teams adapter persists conversation per `activity.conversation.id` to disk after each turn
- [ ] Teams adapter loads session on incoming message (graceful fallback)
- [ ] Configurable via environment variables: max token threshold, recent messages to keep, session directory
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

### ⬜ Unit 1a: Context Window Module -- Tests
**What**: Create `src/__tests__/context.test.ts` with failing tests for a new `src/context.ts` module. This module will contain the pure logic: token estimation, sliding window trimming, session load/save. Tests cover:
- `estimateTokens(messages)`: returns char-count / 4 for a messages array. Test with empty array, single message, multiple messages, messages with tool_calls (should count stringified arguments).
- `trimMessages(messages, maxTokens, keepRecent)`: returns a new array with system prompt preserved (index 0), most recent `keepRecent` messages preserved, middle messages dropped. Test cases: under limit (no trim), over limit (trims middle), exact boundary, keepRecent larger than array (no trim), array with only system prompt.
- `getSessionDir()`: returns configured dir from `OUROBOROS_SESSION_DIR` env var, or default `~/.ouroboros/sessions`.
- `saveSession(filePath, messages)`: writes JSON to disk. Creates parent directory if needed.
- `loadSession(filePath)`: reads JSON from disk. Returns null if file missing. Returns null if file is corrupt JSON. Returns parsed messages array on success.
- `deleteSession(filePath)`: removes session file. No-op if file missing.
- `sessionPath(sessionDir, key)`: returns `${sessionDir}/${sanitizedKey}.json` where key is sanitized (slashes, colons replaced with underscores).
**Output**: Test file that fails because `src/context.ts` does not exist yet
**Acceptance**: Tests exist and FAIL (red) -- module not found errors

### ⬜ Unit 1b: Context Window Module -- Implementation
**What**: Create `src/context.ts` implementing all functions tested in 1a:
- `estimateTokens(messages: OpenAI.ChatCompletionMessageParam[]): number` -- sums character lengths of all message content (including stringified tool_calls and tool results) divided by 4.
- `trimMessages(messages: OpenAI.ChatCompletionMessageParam[], maxTokens: number, keepRecent: number): OpenAI.ChatCompletionMessageParam[]` -- if `estimateTokens(messages) <= maxTokens`, return messages as-is. Otherwise: keep messages[0] (system prompt), keep last `keepRecent` messages, drop everything in between. Return new array (do not mutate input).
- `getSessionDir(): string` -- returns `process.env.OUROBOROS_SESSION_DIR || path.join(os.homedir(), ".ouroboros", "sessions")`.
- `saveSession(filePath: string, messages: OpenAI.ChatCompletionMessageParam[]): void` -- `mkdirSync` parent, `writeFileSync` JSON.
- `loadSession(filePath: string): OpenAI.ChatCompletionMessageParam[] | null` -- try/catch around `readFileSync` + `JSON.parse`. Return null on any error.
- `deleteSession(filePath: string): void` -- try/catch around `unlinkSync`. No-op on ENOENT.
- `sessionPath(sessionDir: string, key: string): string` -- sanitize key, join with dir, add `.json`.
- Export config constants: `DEFAULT_MAX_TOKENS = 80000`, `DEFAULT_KEEP_RECENT = 20`.
- Env var names: `OUROBOROS_MAX_TOKENS`, `OUROBOROS_KEEP_RECENT`, `OUROBOROS_SESSION_DIR`.
**Output**: `src/context.ts` with all functions
**Acceptance**: All Unit 1a tests PASS (green), no warnings

### ⬜ Unit 1c: Context Window Module -- Coverage & Refactor
**What**: Verify 100% coverage on `src/context.ts`. Add any missing edge case tests. Refactor if needed.
**Output**: 100% coverage report for context.ts
**Acceptance**: 100% coverage on new code, tests still green

### ⬜ Unit 2a: CLI Session Persistence -- Tests
**What**: Add tests to `src/__tests__/agent-main.test.ts` (or a new `src/__tests__/cli-session.test.ts`) for CLI session persistence behavior:
- On startup, `main()` calls `loadSession` to restore previous conversation. If session exists, messages array is pre-populated.
- On startup, if no session exists (loadSession returns null), messages array starts fresh with system prompt only.
- On startup, if session file is corrupt, messages array starts fresh (graceful fallback).
- After each turn (after `runAgent` returns), `saveSession` is called with current messages array.
- After boot greeting, `saveSession` is called.
- "new" command: clears messages array back to just the system prompt, calls `deleteSession`, prints confirmation, does NOT send to model.
- "new" command: after reset, next message starts a fresh conversation.
- Boot message updated to show "(type 'exit' to quit, 'new' to reset)" hint.
**Output**: Failing tests for CLI session integration
**Acceptance**: Tests exist and FAIL (red)

### ⬜ Unit 2b: CLI Session Persistence -- Implementation
**What**: Modify `src/agent.ts` `main()` function:
- Import `loadSession`, `saveSession`, `deleteSession`, `getSessionDir`, `sessionPath`, `trimMessages`, `DEFAULT_MAX_TOKENS`, `DEFAULT_KEEP_RECENT` from `./context`.
- On startup: compute session file path via `sessionPath(getSessionDir(), "cli")`. Call `loadSession()`. If result is non-null, use it as the messages array (it already contains the system prompt from the previous session). If null, create fresh `[{ role: "system", content: buildSystem() }]`.
- After boot greeting: call `saveSession(path, messages)`.
- In the input loop, before `runAgent`: call `trimMessages(messages, maxTokens, keepRecent)` and replace the messages array contents. Read `maxTokens` from `parseInt(process.env.OUROBOROS_MAX_TOKENS || "") || DEFAULT_MAX_TOKENS` and `keepRecent` from `parseInt(process.env.OUROBOROS_KEEP_RECENT || "") || DEFAULT_KEEP_RECENT`.
- After `runAgent` returns (after `ctrl.restore()`): call `saveSession(path, messages)`.
- Handle "new" command: in the input loop, check `input.toLowerCase() === "new"`. If matched: reset messages to `[{ role: "system", content: buildSystem() }]`, call `deleteSession(path)`, print "session cleared", continue to next prompt (skip `runAgent`).
- Update boot message: `"\nouroboros (type 'exit' to quit, 'new' to reset)\n"`.
**Output**: Modified `src/agent.ts` with session persistence
**Acceptance**: All Unit 2a tests PASS (green), no warnings

### ⬜ Unit 2c: CLI Session Persistence -- Coverage & Refactor
**What**: Verify 100% coverage on modified `src/agent.ts`. Add any missing edge case tests. Ensure all existing agent tests still pass.
**Output**: 100% coverage, all tests green
**Acceptance**: 100% coverage on new code, tests still green

### ⬜ Unit 3a: Teams Session Persistence -- Tests
**What**: Add tests to `src/__tests__/teams.test.ts` for Teams session persistence:
- `handleTeamsMessage` signature changes to accept a `conversationId` parameter (or extract it from a new parameter).
- On each message: loads session for that conversation ID. If session exists, uses it. If not, creates fresh with system prompt.
- After `runAgent` returns: saves session for that conversation ID.
- Multiple conversations: two different conversation IDs maintain separate message arrays.
- `startTeamsApp` message handler passes `activity.conversation.id` to `handleTeamsMessage`.
- Graceful fallback: corrupt session file results in fresh conversation.
- The global `messages` array is removed (replaced by per-conversation load/save).
- `trimMessages` is called before `runAgent` to enforce context window limits.
**Output**: Failing tests for Teams session integration
**Acceptance**: Tests exist and FAIL (red)

### ⬜ Unit 3b: Teams Session Persistence -- Implementation
**What**: Modify `src/teams.ts`:
- Import `loadSession`, `saveSession`, `getSessionDir`, `sessionPath`, `trimMessages`, `DEFAULT_MAX_TOKENS`, `DEFAULT_KEEP_RECENT` from `./context`.
- Remove the global `messages` array.
- Change `handleTeamsMessage(text, stream)` to `handleTeamsMessage(text, stream, conversationId)`:
  - Compute session file path: `sessionPath(getSessionDir(), conversationId)`.
  - Load session: `loadSession(path) || [{ role: "system", content: buildSystem("teams") }]`.
  - Push user message onto loaded messages.
  - Trim: `trimMessages(messages, maxTokens, keepRecent)` (same env var reading as CLI).
  - Call `runAgent(messages, callbacks, signal)`.
  - After runAgent: `saveSession(path, messages)`.
- In `startTeamsApp`, update the `app.on("message", ...)` handler to pass `activity.conversation.id` to `handleTeamsMessage`.
**Output**: Modified `src/teams.ts` with per-conversation persistence
**Acceptance**: All Unit 3a tests PASS (green), no warnings

### ⬜ Unit 3c: Teams Session Persistence -- Coverage & Refactor
**What**: Verify 100% coverage on modified `src/teams.ts`. Add any missing edge case tests. Ensure all existing Teams tests still pass.
**Output**: 100% coverage, all tests green
**Acceptance**: 100% coverage on new code, tests still green

### ⬜ Unit 4: Integration Validation
**What**: Run full test suite (`npm test`). Verify no regressions across all test files. Run coverage report (`npm run test:coverage`). Verify 100% on all new/modified files. Fix any issues found.
**Output**: Clean test run, full coverage report
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
- 2026-02-25 08:38 Created from planning doc
