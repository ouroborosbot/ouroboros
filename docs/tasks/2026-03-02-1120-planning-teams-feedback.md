# Planning: Teams Channel Feedback — Multi-Message, Shared Formatting, Error Severity, Phrases Config

**Status**: APPROVED
**Created**: 2026-03-02 11:21

## Goal
Fix three Teams bot channel issues and improve the presentation architecture: (1) tool/kick results are ephemeral and vanish -- they should be separate persistent messages, (2) bare "Continuing." text doesn't trigger a narration kick, (3) text from successive loop iterations concatenates into one blob -- each iteration's output should be its own message bubble, (4) errors should be classified by severity so channels can render them appropriately, and (5) presentation code (phrases, formatting) should live in a dedicated shared directory with phrases required in agent config rather than hardcoded.

## Scope

### In Scope

**1. New `src/wardrobe/` directory** (confirmed):
- New directory for presentation/display code -- how the agent presents itself to users
- Move `src/repertoire/phrases.ts` to `src/wardrobe/phrases.ts`
- Create `src/wardrobe/format.ts` with `formatToolResult()`, `formatKick()`, `formatError()`
- `src/repertoire/` continues to hold agent capability code (`commands.ts`, `skills.ts`)
- Update all import paths across codebase and tests

**2. Phrases required in agent config**:
- Make `phrases` (and its `thinking`, `tool`, `followup` children) required in `AgentConfig` interface in `src/identity.ts`
- Remove hardcoded fallback arrays (`THINKING_PHRASES`, `TOOL_PHRASES`, `FOLLOWUP_PHRASES`) from `phrases.ts`
- In `loadAgentConfig()`: if phrases are missing from agent.json, print warning `"agent.json is missing phrases, added placeholders"` and write placeholder arrays to the agent.json file
- Placeholder arrays: `["working"]`, `["running tool"]`, `["processing"]`
- `getPhrases()` simplifies to just returning `config.phrases`
- Existing `ouroboros/agent.json` already has phrases -- no change needed

**3. Shared formatting layer** (`src/wardrobe/format.ts`):
- `formatToolResult(name, summary, success)` -- returns `"✓ name (summary)"` / `"✗ name: error"`
- `formatKick(attempt, maxKicks)` -- returns `"↻ kick"` or `"↻ kick N/M"`
- `formatError(error)` -- returns error display string
- Both CLI and Teams use these; each channel handles rendering (ANSI vs plain)

**4. Multi-message Teams output**:
- Tool results, kick indicators, and terminal errors sent as separate standalone messages via `sendMessage` callback (wraps `ctx.send()`)
- Model text continues to stream via `stream.emit()` as before
- `createTeamsCallbacks` gains a `sendMessage: (text: string) => Promise<void>` parameter

**5. Error severity on `onError`**:
- Change `ChannelCallbacks` interface: `onError(error: Error, severity: "transient" | "terminal"): void`
- All call sites in `src/engine/core.ts` pass correct severity
- Teams: transient = `stream.update()` (ephemeral), terminal = `sendMessage` (standalone)
- CLI: transient = spinner message + continue, terminal = permanent stderr line

**6. Teams `onKick` callback**:
- Sends kick indicator as standalone message via `sendMessage`

**7. "Continuing." kick pattern**:
- Add anchored `/^continuing\.?$/i` to `TOOL_INTENT_PATTERNS` in `src/engine/kicks.ts`

**8. CLI refactor**:
- CLI `onToolEnd`, `onKick`, `onError` use shared formatter from `src/wardrobe/format.ts`
- Behavior stays identical -- just sourced from shared module

**9. Early manual testing (Unit 0)**:
- Front-loaded in doing doc to verify `ctx.send()` alongside open stream in live Teams
- User participates to confirm message ordering and stream behavior
- Must complete before implementation units that depend on the answer

**10. Update documentation**:
- Update `README.md` and `CONTRIBUTING.md` to reflect the new `src/wardrobe/` directory, moved files, and updated project structure

**11. Tests**:
- Update all existing tests for new import paths, new `onError` signature
- Add new tests for all new code -- 100% coverage

### Out of Scope
- Redesigning the kick system for context-awareness (existing TODO in kicks.ts)
- Changing tool execution logic or agent loop control flow in `src/engine/core.ts` (only `onError` call sites change to pass severity)
- Changing the Teams SDK streaming protocol internals
- Agent self-explanation after errors (see Follow-up below)

### Follow-up: Agent Error Self-Explanation
After this task, terminal errors are shown to the user as permanent messages. The next step is making the agent acknowledge and explain these errors. This requires changes to the agent loop in core.ts:
- When a terminal error occurs and is shown to the user, inject a system message telling the model to explain what happened
- The model should produce a brief user-friendly explanation
- This affects the agent loop flow (core.ts), not channel rendering

Prompt for next work-planner:
"The onError callback now has severity (transient|terminal) and terminal errors are shown as permanent messages to users. Add agent self-explanation: when a terminal error is shown, the agent loop should do one more model call where the model acknowledges and explains the error to the user in plain language. See the error handling in src/engine/core.ts lines 270-410."

## Completion Criteria
- [ ] `src/wardrobe/` directory exists with `format.ts` and `phrases.ts`
- [ ] `src/repertoire/phrases.ts` removed; all imports updated to `src/wardrobe/phrases.ts`
- [ ] `src/repertoire/` retains only `commands.ts` and `skills.ts`
- [ ] `AgentConfig.phrases` (with `thinking`, `tool`, `followup`) is required in `src/identity.ts`
- [ ] `loadAgentConfig()` writes placeholder phrases + warning if missing from agent.json
- [ ] Hardcoded fallback arrays removed from `phrases.ts`; `getPhrases()` returns `config.phrases` directly
- [ ] `src/wardrobe/format.ts` has `formatToolResult()`, `formatKick()`, `formatError()`
- [ ] CLI `onToolEnd`, `onKick`, `onError` use shared formatter (identical visual output)
- [ ] `ChannelCallbacks.onError` signature updated to `onError(error: Error, severity: "transient" | "terminal"): void`
- [ ] All `callbacks.onError()` call sites in `src/engine/core.ts` pass correct severity
- [ ] Early manual testing with user confirms `ctx.send()` behavior alongside open stream
- [ ] Teams `onToolEnd` sends standalone message via `sendMessage` callback
- [ ] Teams `onToolStart` remains ephemeral via `stream.update()` only
- [ ] Teams `onKick` sends standalone message via `sendMessage` callback
- [ ] Teams `onError`: transient = ephemeral (`stream.update()`), terminal = standalone (`sendMessage`)
- [ ] Teams multi-message: tool results, kicks, terminal errors appear as separate chat bubbles
- [ ] `TOOL_INTENT_PATTERNS` includes anchored pattern for bare "Continuing." / "continuing"
- [ ] Existing false-negative texts like "the process is continuing as expected" still return false
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
- [x] Should `onError` also be a standalone message in Teams, or stay as `safeEmit` in the current stream? **Resolved**: Depends on severity. Transient = ephemeral via `stream.update()`. Terminal = standalone via `sendMessage`.
- [x] Stream lifecycle -- `ctx.send()` alongside open stream? **Resolved**: Will be answered via early manual testing with user (doing doc Unit 0). Approach 3 (don't close stream, send alongside) is preferred. Approach 2 (close-and-send) is fallback.
- [x] Where should shared display code live? **Resolved**: `src/wardrobe/` (confirmed). Not `src/channels/` (channel-specific), not `src/repertoire/` (agent capabilities), not `src/display/` (too technical).

## Decisions Made
- **`src/wardrobe/` directory** (confirmed): Presentation/display code lives here. `phrases.ts` moves from `src/repertoire/`, `format.ts` is new. The metaphor is the agent's "clothes" -- how it presents itself. `src/repertoire/` retains agent capability code (commands, skills).
- **Phrases required in config**: `AgentConfig.phrases` becomes required. No more hardcoded fallback arrays. `loadAgentConfig()` auto-writes placeholders + warning if missing. This makes agent personality explicit and configurable.
- **Multi-message over separators**: Tool results, kicks, and terminal errors are separate Teams messages via `ctx.send()`, not `\n\n`-separated text in one message.
- **Shared formatter**: A shared module generates display strings; each channel decides how to render them. Three functions, plain string output, no state.
- **Error severity on `onError`**: Interface changes from `onError(error)` to `onError(error, severity)`. Severity mapping: line 385 "context trimmed" = transient, line 392 "network error" = transient, lines 270/309 "tool loop limit" = terminal, line 406 catch-all = terminal.
- **`createTeamsCallbacks` gets `sendMessage`**: A `sendMessage: (text: string) => Promise<void>` callback instead of full `ctx` -- testable and decoupled.
- **CLI behavior unchanged**: Refactor only changes where format strings come from. Existing tests pass with updated import paths and new `onError` severity parameter.
- **"Continuing." pattern anchored**: `/^continuing\.?$/i` to avoid false positives.
- **onToolStart stays ephemeral**: `stream.update()` only, matching CLI's spinner.
- **Early manual testing**: Doing doc Unit 0 tests `ctx.send()` alongside open stream in live Teams with user participation. Preferred approach 3, fallback approach 2.

## Context / References

### Teams channel
- `src/channels/teams.ts` lines 48-189: `createTeamsCallbacks()` -- needs `sendMessage` param, `onToolEnd`/`onKick`/`onError` changes
- `src/channels/teams.ts` lines 81-87: `safeEmit()` -- permanent text to stream
- `src/channels/teams.ts` lines 91-98: `safeUpdate()` -- ephemeral status
- `src/channels/teams.ts` lines 145-157: current `onToolStart`/`onToolEnd` using `safeUpdate`
- `src/channels/teams.ts` lines 159-163: current `onError` -- calls `safeEmit()`
- `src/channels/teams.ts` line 340: `ctx` has `.send()` available but unused
- `src/channels/teams.ts` lines 230-299: `handleTeamsMessage()` -- creates callbacks
- Teams SDK `IBaseActivityContext.send(activity: ActivityLike)`: standalone message (ActivityLike = string | ActivityParams | IAdaptiveCard)
- Teams SDK `IStreamer`: `emit()`, `update()`, `close()`

### CLI channel
- `src/channels/cli.ts` lines 236-319: `createCliCallbacks()` -- tool/kick/error formatting
- `src/channels/cli.ts` lines 289-295: CLI `onToolEnd` -- `spinner.stop()` / `spinner.fail()`
- `src/channels/cli.ts` lines 297-300: CLI `onError` -- `spinner.fail()` + stderr
- `src/channels/cli.ts` lines 302-311: CLI `onKick` -- `"↻ kick"` with counter

### Engine
- `src/engine/core.ts` lines 75-85: `ChannelCallbacks` interface -- `onError` changing
- `src/engine/core.ts` line 270: `callbacks.onError(...)` -- terminal (tool loop limit, kick path)
- `src/engine/core.ts` line 309: `callbacks.onError(...)` -- terminal (tool loop limit, tool path)
- `src/engine/core.ts` line 385: `callbacks.onError(...)` -- transient (context trimmed)
- `src/engine/core.ts` line 392: `callbacks.onError(...)` -- transient (network retry)
- `src/engine/core.ts` line 406: `callbacks.onError(...)` -- terminal (catch-all)
- `src/engine/kicks.ts` lines 33-111: `TOOL_INTENT_PATTERNS` array

### Identity and phrases
- `src/identity.ts` lines 4-12: `AgentConfig` interface -- `phrases` currently optional
- `src/identity.ts` lines 57-81: `loadAgentConfig()` -- needs validation + placeholder write
- `src/repertoire/phrases.ts`: current location, exports `THINKING_PHRASES`, `TOOL_PHRASES`, `FOLLOWUP_PHRASES`, `getPhrases()`, `pickPhrase()` -- moving to `src/wardrobe/`
- `src/repertoire/commands.ts`: stays in `src/repertoire/`
- `src/repertoire/skills.ts`: stays in `src/repertoire/`
- `ouroboros/agent.json`: already has phrases, no change needed
- Import sites for `repertoire/phrases`: `cli.ts`, `teams.ts`, `cli.test.ts`, `teams.test.ts`, `phrases.test.ts` -- all need path updates

### Tests
- `src/__tests__/channels/teams.test.ts`: onToolEnd (lines 287-308), onError (lines 311-317) need updating
- `src/__tests__/channels/cli.test.ts` lines 616-634: onError tests need severity parameter
- `src/__tests__/engine/kicks.test.ts`: kick pattern tests
- `src/__tests__/engine/core.test.ts`: onError mock call sites need severity parameter
- `src/__tests__/repertoire/phrases.test.ts`: needs path update to `wardrobe/`, tests for removed fallback arrays

## Notes
The `src/wardrobe/` directory name is confirmed. The metaphor is the agent's "clothes" -- how it presents itself to users.

The phrases change is a config-level breaking change for agents that don't have phrases in their agent.json. The auto-placeholder + warning approach ensures existing deployments don't break -- they just get boring placeholder phrases and a console warning prompting the user to customize. `ouroboros/agent.json` already has phrases and is unaffected.

The `createTeamsCallbacks` signature grows from `(stream, controller, options?)` to also accept a `sendMessage` function. The call site in `handleTeamsMessage` wraps `ctx.send()`: `const sendMessage = (text: string) => ctx.send(text).then(() => {})`. This keeps the factory testable.

Error severity is a breaking change to `ChannelCallbacks.onError`. All callers and implementations must update together. The change is mechanical.

Stream lifecycle: approach 3 (don't close, send alongside) is preferred for simplicity. Approach 2 (close-and-send) is fallback. Unit 0 resolves this via live testing before implementation depends on the answer.

## Progress Log
- 2026-03-02 11:21 Created
- 2026-03-02 11:27 Resolved open questions, updated decisions
- 2026-03-02 11:28 Approved, converting to doing doc (previous attempt)
- 2026-03-02 11:55 Refreshed planning with updated scope and codebase verification
- 2026-03-02 12:02 Major scope change: multi-message + shared formatting layer
- 2026-03-02 12:24 Added error severity on onError, formatError(), follow-up section, resolved onError open question
- 2026-03-02 12:35 Final refinements: format.ts to src/repertoire/, resolved stream questions via manual testing
- 2026-03-02 12:57 Added src/wardrobe/ directory, phrases required in config, comprehensive scope rewrite
