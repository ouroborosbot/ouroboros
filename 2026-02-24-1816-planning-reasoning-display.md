# Planning: Normalize and Improve Reasoning Display Across All Surfaces

**Status**: NEEDS_REVIEW
**Created**: 2026-02-24 18:17

## Goal
Normalize how reasoning/thinking tokens are handled at the model-calling level so that downstream adapters (CLI, Teams) receive a clean, provider-agnostic reasoning signal. Different models send reasoning differently (Azure: `reasoning_content` field, MiniMax: inline `<think>` tags in content) -- core should normalize this so adapters never deal with provider-specific reasoning formats.

## Scope

### In Scope
- **Normalize reasoning at the model layer**: `runAgent` in `core.ts` should present a single, uniform reasoning interface to adapters regardless of which provider produced the tokens. Today it half-normalizes (wraps Azure `reasoning_content` in synthetic `<think>` tags) but adapters still have to parse those tags. The goal is full normalization.
- **Clean adapter interface**: Adapters receive normalized reasoning signals and decide how to render them for their surface -- no parsing of provider-specific formats.
- **CLI adapter**: Continue displaying reasoning in dim text, clearly separated from answer content. Implementation may change but the user-visible behavior should be equivalent or better.
- **Teams adapter**: Send reasoning content as actual streamed content to the user (not stripped, not hidden behind a static "thinking..." status). The Teams/Copilot UI already implies the model is thinking -- we should send the reasoning text through the stream so users can see it.
- **Both provider patterns handled uniformly**:
  - Azure (DeepSeek-R1 etc.): reasoning arrives via `delta.reasoning_content`
  - MiniMax: reasoning arrives inline in `delta.content` wrapped in `<think>...</think>` tags
- **Update all existing tests** and add new tests for normalized reasoning behavior
- **100% test coverage** on all new and changed code

### Out of Scope
- Changing how reasoning tokens are stored in the conversation history (messages array)
- Adding user-configurable reasoning display preferences (e.g., hide/show toggle)
- Persisting or logging reasoning content separately
- Changes to the tool execution display (spinners, tool start/end)
- Supporting additional model providers beyond MiniMax and Azure
- Changing the Teams streaming protocol itself (we use the existing `emit`/`update`/`close` SDK interface)

## Completion Criteria
- [ ] Core normalizes reasoning from both providers into a single interface -- adapters never see `<think>` tags or `reasoning_content`
- [ ] CLI adapter displays reasoning in dim text, separated from answer content
- [ ] Teams adapter sends reasoning as streamed content visible to the user
- [ ] Both Azure `reasoning_content` and MiniMax inline `<think>` tag patterns are handled
- [ ] All existing tests updated to reflect new structure
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
- [ ] What is the best way to visually distinguish reasoning from answer content in Teams? Options: (a) send as plain text and let the UI handle it, (b) use markdown formatting like blockquote or italic, (c) prefix with a label. Needs experimentation with what actually renders well in Teams.
- [ ] Exact callback/interface shape for the normalized reasoning signal -- to be determined during implementation planning.
- [ ] Where exactly the MiniMax `<think>` tag parsing state machine lives (core vs. a provider-specific normalizer) -- implementation detail for doing doc.

## Decisions Made
- Reasoning should be normalized at the model-calling level so adapters are provider-agnostic
- Teams adapter should send reasoning content as visible streamed text, not strip it or hide it behind "thinking..."
- The Teams SDK `stream.emit()` method accepts string content and the SDK handles buffering/debouncing (500ms) and the streaming protocol (streamSequence, streamId, informative/streaming/final types) -- we just send deltas
- The Teams SDK `stream.update()` sends informative updates (blue progress bar) -- this is appropriate for tool status but not for reasoning content which should be visible text

## Context / References
- `src/core.ts` lines 378-385: `ChannelCallbacks` interface -- `onModelStart`, `onModelStreamStart`, `onTextChunk`, `onToolStart`, `onToolEnd`, `onError`
- `src/core.ts` lines 414-463: current reasoning handling -- wraps Azure `reasoning_content` in synthetic `<think>` tags via `onTextChunk`
- `src/agent.ts` lines 103-153: CLI adapter -- `createCliCallbacks` with think-tag dimming in `onTextChunk` flush loop
- `src/teams.ts` lines 31-127: Teams adapter -- `createTeamsCallbacks` with think-tag stripping and static "thinking..." status
- `src/teams.ts` lines 14-15: `stripThinkTags` utility (regex-based, non-streaming)
- Teams SDK `IStreamer` interface (`node_modules/@microsoft/teams.apps/dist/types/streamer.d.ts`): `emit(activity | string)`, `update(text)`, `close()`
- Teams SDK `HttpStream` implementation (`node_modules/@microsoft/teams.apps/dist/plugins/http/stream.js`): `emit()` queues content with 500ms debounce, `update()` sends informative typing activity with `streamType: 'informative'`, content accumulates across emits (cumulative text)
- Teams streaming docs: informative updates show as blue progress bar, streaming content shows as typing indicator with progressive text. Only text can be streamed. 1 req/sec throttle limit. 2 min max streaming time.
- Azure provider: `delta.reasoning_content` as separate field
- MiniMax provider: `<think>...</think>` inline in `delta.content`

## Notes
Current architecture leaks provider-specific reasoning format into adapters. Both CLI and Teams independently parse `<think>` tags from the `onTextChunk` stream. The core principle of this work is: normalize once at the model layer, render differently per surface.

Teams SDK `emit()` accumulates text -- each call appends to the total. So reasoning content emitted through `emit()` will appear as streamed text to the user, followed by the answer content. This is the desired behavior.

## Progress Log
- 2026-02-24 18:17 Created
- (pending) Refined scope based on user feedback and Teams SDK research
