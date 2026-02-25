# Planning: Improve Reasoning/Thinking Display Across All Surfaces

**Status**: drafting
**Created**: (pending initial commit)

## Goal
Improve how model reasoning/thinking tokens are displayed so that both CLI and Teams/Copilot users get meaningful, surface-appropriate feedback during the thinking phase, for both MiniMax (inline `<think>` tags in content) and Azure (separate `reasoning_content` field) providers.

## Scope

### In Scope
- Add a dedicated `onReasoningChunk` callback to `ChannelCallbacks` so channels can handle reasoning distinctly from content
- Refactor `core.ts` `runAgent` to call `onReasoningChunk` instead of wrapping reasoning in synthetic `<think>` tags via `onTextChunk`
- CLI adapter: display reasoning in dim text with a "thinking" header/prefix, clearly separated from the answer content
- Teams adapter: show a meaningful streaming status during reasoning (e.g., summarize or show a progress indicator with reasoning token count) instead of a static "thinking..." message that provides no visibility
- Handle both provider patterns uniformly:
  - Azure (DeepSeek-R1 etc.): reasoning arrives via `delta.reasoning_content`
  - MiniMax: reasoning arrives inline in `delta.content` wrapped in `<think>...</think>` tags
- Update all existing tests and add new tests for the new callback and both adapter behaviors
- Maintain 100% test coverage on all new and changed code

### Out of Scope
- Changing how reasoning tokens are stored in the conversation history (messages array)
- Adding user-configurable reasoning display preferences (e.g., hide/show toggle)
- Persisting or logging reasoning content
- Changes to the tool execution display (spinners, tool start/end)
- Supporting additional model providers beyond MiniMax and Azure

## Completion Criteria
- [ ] `ChannelCallbacks` interface has `onReasoningChunk(text: string): void` callback
- [ ] `core.ts` `runAgent` emits `onReasoningChunk` for Azure `reasoning_content` tokens directly (no synthetic `<think>` tag wrapping)
- [ ] `core.ts` `runAgent` detects inline `<think>` tags in MiniMax `content` and routes them to `onReasoningChunk` instead of `onTextChunk`
- [ ] CLI adapter dims reasoning text and clearly separates it from answer content (current behavior preserved but through new callback)
- [ ] Teams adapter shows meaningful progress during reasoning phase (not just static "thinking...")
- [ ] All existing tests updated to reflect new callback structure
- [ ] New tests cover: both providers, both adapters, edge cases (split chunks, empty reasoning, reasoning-only responses)
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
- [ ] For Teams: what should the reasoning progress look like? Options: (a) show word/token count updating as reasoning streams in, (b) show truncated reasoning text in the status bar, (c) show elapsed time, (d) show a brief summary. Current thinking: option (a) or (b) seems most informative.
- [ ] For MiniMax inline `<think>` tag parsing in `core.ts`: should this be done in `runAgent` (core responsibility) or should each adapter handle it? Current thinking: core should parse it since the pattern is provider-specific, not channel-specific.
- [ ] Should `onReasoningChunk` also receive a metadata argument (e.g., provider name, whether it's opening/closing) or just the raw text?
- [ ] For MiniMax, think tags can be split across streaming chunks. The current `onTextChunk` approach just passes raw chunks through and lets adapters handle parsing. With `onReasoningChunk`, core would need to maintain a state machine for inline tag detection. Is this acceptable complexity in core?

## Decisions Made
- (none yet)

## Context / References
- `src/core.ts` lines 414-463: current reasoning handling in `runAgent` -- wraps `reasoning_content` in `<think>` tags and sends via `onTextChunk`
- `src/core.ts` lines 378-385: `ChannelCallbacks` interface definition
- `src/agent.ts` lines 103-153: `createCliCallbacks` -- CLI adapter with think-tag dimming in `onTextChunk` flush loop
- `src/teams.ts` lines 31-127: `createTeamsCallbacks` -- Teams adapter with think-tag stripping and "thinking..." status
- `src/teams.ts` lines 14-15: `stripThinkTags` utility (regex-based, used for non-streaming contexts)
- Azure provider: sends `delta.reasoning_content` as a separate field (e.g., DeepSeek-R1 via Azure AI)
- MiniMax provider: sends reasoning inline in `delta.content` wrapped in `<think>...</think>` tags
- Both providers use OpenAI-compatible streaming API via the `openai` npm package

## Notes
Current architecture: `runAgent` in core.ts handles streaming and normalizes Azure `reasoning_content` into synthetic `<think>` tags. Both CLI and Teams adapters then independently parse these tags from the `onTextChunk` stream -- CLI dims them, Teams strips them. This means reasoning handling is duplicated across adapters and the abstraction is leaky (adapters must know about `<think>` tag protocol).

## Progress Log
- (pending initial commit)
