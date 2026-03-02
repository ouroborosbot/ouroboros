# Planning: Teams Channel Feedback — Multi-Message + Shared Formatting + Error Severity

**Status**: drafting
**Created**: 2026-03-02 11:21

## Goal
Fix three Teams bot channel issues and improve error handling by introducing multi-message output, a shared formatting layer, and error severity: (1) tool/kick results are ephemeral and vanish -- they should be separate persistent messages, (2) bare "Continuing." text doesn't trigger a narration kick, (3) text from successive loop iterations concatenates into one blob -- each iteration's output should be its own message bubble, and (4) errors should be classified by severity so channels can render them appropriately (ephemeral for transient, permanent for terminal).

## Scope

### In Scope
- **Shared formatting layer**: Extract display-string generation for tool results, kick indicators, and errors into a shared module (`src/channels/format.ts`) so both CLI and Teams use the same "what to display" logic, and each channel only handles "how to display". Functions: `formatToolResult()`, `formatKick()`, `formatError()`
- **Multi-message Teams output**: Tool results, kick indicators, and terminal errors are sent as separate standalone messages in Teams via `ctx.send()` -- not appended to the streaming message
- **Error severity on `onError`**: Change the `ChannelCallbacks` interface -- `onError(error: Error, severity: "transient" | "terminal"): void`. All call sites in `src/engine/core.ts` pass the correct severity. Channels render by severity: transient = ephemeral status, terminal = permanent message
- **Teams `onToolEnd`**: Sends tool result as standalone message via `sendMessage` callback. Format: `✓ name (summary)` / `✗ name: error`
- **Teams `onKick`**: Sends kick indicator as standalone message via `sendMessage` callback. Format: `↻ kick` or `↻ kick N/M`
- **Teams `onError`**: Transient errors shown via `stream.update()` (ephemeral). Terminal errors sent as standalone message via `sendMessage` callback
- **Teams `onToolStart`**: Remains ephemeral via `stream.update()` (matching CLI's ephemeral spinner)
- **"Continuing." kick pattern**: Add anchored `/^continuing\.?$/i` to `TOOL_INTENT_PATTERNS` in `src/engine/kicks.ts`
- **CLI refactor**: CLI `onToolEnd`, `onKick`, and `onError` use the shared formatter for display strings (behavior stays identical, just sourced from shared module). CLI `onError`: transient = spinner message + continue, terminal = permanent stderr line
- Update all existing tests and add new tests for 100% coverage on all changes

### Out of Scope
- Redesigning the kick system for context-awareness (existing TODO in kicks.ts)
- Changing tool execution logic or the agent loop control flow in `src/engine/core.ts` (only the `onError` call sites change to pass severity)
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
- [ ] Shared formatter module `src/channels/format.ts` exists with `formatToolResult()`, `formatKick()`, and `formatError()` functions
- [ ] CLI `onToolEnd`, `onKick`, and `onError` use the shared formatter (identical visual output, verified by existing tests)
- [ ] `ChannelCallbacks.onError` signature updated to `onError(error: Error, severity: "transient" | "terminal"): void`
- [ ] All `callbacks.onError()` call sites in `src/engine/core.ts` pass correct severity
- [ ] Teams `onToolEnd` sends a standalone message (via `sendMessage` callback) with the formatted tool result
- [ ] Teams `onToolStart` remains ephemeral via `stream.update()` only (unchanged)
- [ ] Teams `onKick` sends a standalone message with the formatted kick indicator
- [ ] Teams `onError` renders transient errors as ephemeral status (`stream.update()`), terminal errors as standalone messages (`sendMessage`)
- [ ] CLI `onError` renders transient errors as spinner status/stderr, terminal errors as permanent stderr line
- [ ] Teams multi-message: tool results, kicks, and terminal errors appear as separate chat bubbles, not appended to the model text message
- [ ] `TOOL_INTENT_PATTERNS` includes anchored pattern for bare "Continuing." / "continuing" text
- [ ] Existing false-negative texts like "the process is continuing as expected" still return false from `hasToolIntent()`
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
- [x] Should `onError` also be a standalone message in Teams, or stay as `safeEmit` in the current stream? **Resolved**: Depends on severity. Transient errors (retrying) stay ephemeral via `stream.update()`. Terminal errors (fatal, loop limit) become standalone messages via `sendMessage`.
- [ ] When the stream has had no text emitted yet (model returned only tool calls, no content), should `stream.close()` still be called before `ctx.send()`? The SDK's `stream.close()` on an empty stream might behave unexpectedly -- needs testing
- [ ] Does `ctx.send()` work reliably mid-handler (before the message handler returns)? The SDK auto-closes the stream after handler return -- need to verify `ctx.send()` doesn't conflict with the open stream

## Decisions Made
- **Multi-message over separators**: Tool results, kicks, and terminal errors are separate Teams messages via `ctx.send()`, not `\n\n`-separated text in one message. This is cleaner and matches how a human would send status updates.
- **Shared formatter (Option B)**: A shared module generates display strings; each channel decides how to render them. This avoids duplicating format logic while keeping channel-specific rendering flexible.
- **Format strings are plain text**: The shared formatter returns plain strings (e.g., `"✓ read_file (package.json)"`). CLI wraps them in ANSI colors, Teams sends them as-is (or with markdown).
- **Error severity on `onError`**: The `ChannelCallbacks` interface changes from `onError(error: Error)` to `onError(error: Error, severity: "transient" | "terminal")`. Core.ts call sites pass severity: transient for "retrying" scenarios (context trim, network retry), terminal for fatal errors (tool loop limit, catch-all). Channels render accordingly: transient = ephemeral, terminal = permanent.
- **Error severity mapping in core.ts**: Line 385 "context trimmed" = transient, line 392 "network error, retrying" = transient, lines 270/309 "tool loop limit" = terminal, line 406 catch-all = terminal
- **`ctx.send` for standalone messages**: The Teams SDK's `IBaseActivityContext.send(activity)` accepts `ActivityLike` which can be a plain string. This sends a new activity to the conversation independent of the streaming message.
- **`createTeamsCallbacks` needs a `sendMessage` function**: Instead of passing the full `ctx` object, we pass a `sendMessage: (text: string) => Promise<void>` callback. This keeps the callbacks factory testable (mock the function) and decoupled from the SDK context.
- **CLI behavior unchanged**: The CLI refactor only changes where the format strings come from (shared module), not what they look like. Existing CLI tests should pass without modification (updated to pass the new severity parameter).
- **"Continuing." pattern anchored**: `/^continuing\.?$/i` to avoid false positives on mid-sentence "continuing"
- **onToolStart stays ephemeral**: `stream.update()` only, matching CLI's spinner pattern

## Context / References
- `src/channels/teams.ts` lines 48-189: `createTeamsCallbacks()` -- the main factory function that needs changes
- `src/channels/teams.ts` lines 81-87: `safeEmit()` -- emits permanent text to stream (currently used for model text)
- `src/channels/teams.ts` lines 91-98: `safeUpdate()` -- ephemeral status update
- `src/channels/teams.ts` lines 145-157: current `onToolStart`/`onToolEnd` using `safeUpdate` (ephemeral only)
- `src/channels/teams.ts` lines 159-163: current `onError` -- calls `safeEmit()` (permanent in stream)
- `src/channels/teams.ts` line 340: `const { stream, activity, api, signin } = ctx` -- `ctx.send()` is available but not currently used
- `src/channels/teams.ts` lines 230-299: `handleTeamsMessage()` -- creates callbacks, runs agent loop
- `src/channels/cli.ts` lines 236-319: `createCliCallbacks()` -- reference for tool/kick/error formatting
- `src/channels/cli.ts` lines 289-295: CLI `onToolEnd` -- `spinner.stop("name (summary)")` / `spinner.fail("name: error")`
- `src/channels/cli.ts` lines 297-300: CLI `onError` -- `spinner.fail("request failed")` + stderr red line
- `src/channels/cli.ts` lines 302-311: CLI `onKick` -- `"↻ kick"` with optional counter `" N/M"`
- `src/engine/core.ts` lines 75-85: `ChannelCallbacks` interface -- `onError` signature changing to add severity
- `src/engine/core.ts` line 270: `callbacks.onError(new Error("tool loop limit..."))` -- terminal
- `src/engine/core.ts` line 274: where `onKick?.()` is called
- `src/engine/core.ts` line 309: `callbacks.onError(new Error("tool loop limit..."))` -- terminal
- `src/engine/core.ts` line 385: `callbacks.onError(new Error("context trimmed..."))` -- transient
- `src/engine/core.ts` line 392: `callbacks.onError(new Error("network error..."))` -- transient
- `src/engine/core.ts` line 406: `callbacks.onError(e)` -- terminal (catch-all fatal)
- `src/engine/kicks.ts` lines 33-111: `TOOL_INTENT_PATTERNS` array
- `src/__tests__/channels/teams.test.ts`: existing Teams tests (onToolEnd at lines 287-308, onError at lines 311-317 need updating)
- `src/__tests__/channels/cli.test.ts` lines 616-634: existing CLI onError tests need severity parameter added
- `src/__tests__/engine/kicks.test.ts`: existing kick tests
- `src/__tests__/engine/core.test.ts`: existing core tests -- any onError mock call sites need severity parameter
- Teams SDK `IBaseActivityContext.send(activity: ActivityLike)`: sends standalone message to conversation (ActivityLike = ActivityParams | string | IAdaptiveCard)
- Teams SDK `IStreamer.close()`: finalizes the current streaming message

## Notes
The Teams SDK `ctx` provides both `stream` (for streaming a single message) and `send()` (for standalone messages). Currently only `stream` is used. The `send()` function accepts `ActivityLike` which includes plain strings -- `ctx.send("✓ tool done")` sends a separate chat bubble.

The `createTeamsCallbacks` signature needs to grow: it currently takes `(stream, controller, options?)`. It will need a `sendMessage` function to send standalone messages. Rather than passing the full `ctx`, we pass a focused callback for testability: `sendMessage: (text: string) => Promise<void>`. The call site in `handleTeamsMessage` wraps `ctx.send()` into this callback.

The shared formatter is intentionally minimal -- three functions that return strings. No classes, no state. CLI wraps the result in ANSI escape codes, Teams sends it raw. This keeps the shared layer thin and testable.

Error severity is a breaking change to the `ChannelCallbacks` interface -- `onError(error, severity)` instead of `onError(error)`. All callers and all implementations must be updated in the same unit. The severity type is `"transient" | "terminal"` -- two values, no need for an enum. The core.ts changes are mechanical: add the second argument to each `callbacks.onError()` call. The channel changes are also mechanical: add the severity parameter to the callback signature and branch on it.

Stream lifecycle in Teams multi-message: when `onToolEnd` fires, if model text was being streamed, we need to close that stream first before sending a standalone message. The `stream.close()` call finalizes the current message. Subsequent model text (next iteration) would need a new stream -- but the SDK gives one stream per handler invocation. This means after the first `stream.close()`, subsequent model text must also be sent via `ctx.send()`. This is a significant constraint that affects the architecture: once we close the stream, we can't re-open it.

Possible approaches to the stream lifecycle:
1. **Never close mid-handler**: Keep using `stream.emit()` for all model text, but send tool results/kicks via `ctx.send()` while the stream is still open. The stream finalizes on handler return as usual. Risk: interleaving streamed text with standalone messages might result in out-of-order display.
2. **Close-and-send**: Close the stream when a tool starts, send tool result as standalone, send subsequent model text as standalone too (no more streaming after first close). Downside: no streaming for second+ iterations.
3. **Don't close, just send**: Keep the stream open for model text throughout, and use `ctx.send()` for tool results/kicks alongside the open stream. The stream auto-closes on handler return. This is simplest but needs testing to confirm `ctx.send()` works alongside an open stream.

Approach 3 is preferred (simplest, least disruption). Open question is whether it works reliably.

## Progress Log
- 2026-03-02 11:21 Created
- 2026-03-02 11:27 Resolved open questions, updated decisions
- 2026-03-02 11:28 Approved, converting to doing doc (previous attempt)
- 2026-03-02 11:55 Refreshed planning with updated scope and codebase verification
- 2026-03-02 12:02 Major scope change: multi-message + shared formatting layer
