# Planning: Kick Mechanism & tool_choice Required Mode

**Status**: drafting
**Created**: [pending initial commit]

## Goal
Fix the agent proactivity bug where the model narrates tool-use intent ("let me read that file") but fails to produce actual `tool_calls`. Implement two complementary mechanisms: (1) a "kick" that detects narrated intent and re-prompts the model, and (2) an optional `tool_choice: "required"` mode with a sentinel "done" tool for graceful text-only responses.

## Scope

### In Scope
- **Feature 1 -- Kick mechanism** (in `src/engine/core.ts`):
  - After the model responds with text but no `tool_calls`, scan the text for tool-intent phrases ("let me", "I'll", "I will", "going to", "I'm going to", etc.)
  - If intent detected: do NOT save the malformed assistant message to history, inject a user-role self-correction message, and loop again
  - Cap kick attempts at a configurable max (default 2) to prevent infinite loops
  - Kick attempts count against the existing `MAX_TOOL_ROUNDS` budget
  - New `onKick` callback in `ChannelCallbacks` so channels can display kick status
- **Feature 2 -- `tool_choice: "required"` mode** (across engine):
  - Add a `final_answer` tool to `src/engine/tools.ts` that accepts `{ answer: string }` and signals the model wants to produce a text-only response
  - Add `toolChoiceRequired` flag to `runAgent` options (or a new options object) that toggles `tool_choice: "required"` on API calls
  - When enabled, pass `tool_choice: "required"` through both the Chat Completions path (MiniMax) and the Responses API path (Azure)
  - When `final_answer` is called, extract the answer text and treat it as a normal text response (push as assistant content, set `done = true`)
  - The mode should be togglable at runtime via a new `/tool-required` slash command in the CLI channel
- **Integration**:
  - Both features coexist: kick mechanism is always active, `tool_choice: "required"` is opt-in
  - Update system prompt (in `src/mind/prompt.ts`) with a new tool-behavior section explaining the `final_answer` tool when the mode is active
- **Tests**: 100% coverage on all new code in `core.ts`, `tools.ts`, `streaming.ts`, `prompt.ts`, `cli.ts`, and `commands.ts`

### Out of Scope
- Changes to psyche files (`SOUL.md`, `IDENTITY.md`, etc.) -- prompt-level behavioral fixes are tracked in the existing `2026-02-26-1816-planning-proactivity-fix.md`
- Changes to the Teams channel adapter (Teams can adopt the toggle later)
- Changing the `MAX_TOOL_ROUNDS` constant value (currently 10)
- Persisting the `tool_choice: "required"` toggle across sessions
- UI/UX for the kick in the Teams channel (only CLI for now)

## Completion Criteria
- [ ] Kick mechanism detects tool-intent phrases in text-only responses and re-prompts
- [ ] Kick mechanism does not save the malformed assistant message to conversation history
- [ ] Kick attempts are capped (default 2) and count against `MAX_TOOL_ROUNDS`
- [ ] `onKick` callback fires on each kick so the CLI can show feedback
- [ ] `final_answer` tool exists with `{ answer: string }` schema
- [ ] `tool_choice: "required"` is passed to both Azure Responses API and MiniMax Chat Completions API when enabled
- [ ] Calling `final_answer` extracts the text and terminates the loop cleanly
- [ ] `/tool-required` slash command toggles the mode on/off in CLI
- [ ] System prompt includes `final_answer` tool guidance when mode is active
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
- [ ] Should the kick correction message be a `user` role message or a `system` role message? (User's request says user-role, CrewAI-inspired, written in first person.)
- [ ] What exact tool-intent phrases should trigger a kick? Proposed list: "let me", "I'll", "I will", "I'm going to", "going to", "I am going to", "I would like to", "I want to". Should this be configurable or hardcoded?
- [ ] Should the `final_answer` tool appear in the tools list always (ignored when mode is off) or only be injected when `tool_choice: "required"` mode is active?
- [ ] For `runAgent`, should we add an options object parameter (breaking change) or add `toolChoiceRequired` as an additional optional parameter?
- [ ] What should the exact self-correction message text be? Proposed: "I made an error. I described using a tool instead of actually calling it. Let me correct this and make the actual tool call now."

## Decisions Made
- The kick mechanism is always active (no toggle needed) since narrating tool intent without follow-through is always a bug.
- `tool_choice: "required"` mode is opt-in (default off) because it changes the model's behavior significantly and may cause issues with some models.
- The `final_answer` tool is the escape hatch for `tool_choice: "required"` mode -- without it, the model could never produce a text-only response.
- Both features are in `core.ts` (the agent loop) rather than in channel adapters, keeping the logic centralized.
- Kick detection uses regex pattern matching on the response text, not an LLM call, to keep it fast and deterministic.

## Context / References
- `src/engine/core.ts` -- `runAgent()` function, lines 205-206 is the termination check (`if (!result.toolCalls.length) done = true`), line 80 defines `MAX_TOOL_ROUNDS = 10`
- `src/engine/tools.ts` -- tool definitions array and `execTool()` dispatcher
- `src/engine/streaming.ts` -- `streamChatCompletion()` takes `createParams` (line 88-99), `streamResponsesApi()` takes `createParams` (line 230-239); `tool_choice` would be added to these params
- `src/mind/prompt.ts` -- `buildSystem()` assembles system prompt, `toolsSection()` lists tools
- `src/channels/cli.ts` -- `createCliCallbacks()` (line 147), `main()` function, slash command handling
- `src/repertoire/commands.ts` -- command registry for slash commands
- `src/__tests__/engine/core.test.ts` -- 2565 lines, existing runAgent tests
- `src/__tests__/engine/tools.test.ts` -- 520 lines, existing tool tests
- CrewAI kick approach: inject user-role first-person self-correction message

## Notes
The existing `runAgent` signature is `runAgent(messages, callbacks, channel?, signal?)`. Adding `toolChoiceRequired` needs consideration -- an options object would be cleaner but is a larger refactor. The simplest approach may be to make `runAgent` accept an options bag as a 5th parameter or restructure to `runAgent(messages, callbacks, options?)`.

For Azure Responses API, `tool_choice` maps to the `tool_choice` parameter in the responses.create call. For MiniMax Chat Completions, it maps to the standard `tool_choice` field in chat.completions.create.

The `final_answer` tool handler in `execTool` should never actually be called -- it should be intercepted in the `runAgent` loop before execution. This is a special sentinel, similar to how some frameworks handle "finish" tools.

## Progress Log
