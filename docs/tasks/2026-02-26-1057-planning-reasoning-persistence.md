# Planning: Reasoning Item Persistence and API-Reported Token Usage

**Status**: drafting
**Created**: 2026-02-26 15:42

## Goal
Fix two bugs that cause the sliding context window to fail when using Azure Responses API reasoning models (gpt-5.2-chat) with `store: false`. Reasoning items are lost between turns (breaking reasoning continuity) and reasoning tokens are invisible to the token estimator (preventing context trimming from triggering). Replace the chars/4 token estimation heuristic with actual API-reported usage data from both providers.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Store reasoning items from `result.outputItems` on assistant messages (e.g., as `_reasoning_items` field) so they persist in session JSON across turns
- Restore reasoning items in `toResponsesInput` when rebuilding `azureInput` from a loaded session
- **Delete `estimateTokens`** -- replace the chars/4 heuristic with actual API-reported token usage from both providers
- **Capture usage from Azure Responses API** -- add `response.completed` handler in `streamResponsesApi` to capture `input_tokens`, `output_tokens`, `reasoning_tokens`. Return usage data in `TurnResult`
- **Capture usage from MiniMax Chat Completions** -- add `stream_options: { include_usage: true }` to `streamChatCompletion` and capture `chunk.usage` from the final streaming chunk. Return usage data in `TurnResult`
- **Rework `trimMessages`** -- use last-known actual token count from the API instead of calling `estimateTokens`. Trimming runs retroactively after API call returns, during user typing dead time (no pre-call trimming)
- **Store `lastUsage` in session JSON** -- persist the API-reported usage object alongside messages for observability/debugging and future use
- 100% test coverage on all new code

### Out of Scope
- Changes to MiniMax reasoning item handling (MiniMax reasoning is already in content via `<think>` tags; only token usage capture is in scope)
- `responses.compact` API (not yet available on Azure)
- Changes to `contextMargin` default (stays at 20%, configurable)

## Completion Criteria
- [ ] Reasoning items from `result.outputItems` are stored on assistant messages and persist through session save/load
- [ ] `toResponsesInput` restores reasoning items when rebuilding azureInput from loaded session messages
- [ ] Reasoning items emitted before assistant content in toResponsesInput (matching API item order)
- [ ] `estimateTokens` is deleted; all callers replaced with API-reported usage
- [ ] Azure streaming captures usage from `response.completed` event and returns it in `TurnResult`
- [ ] MiniMax streaming captures usage from final chunk (with `stream_options: { include_usage: true }`) and returns it in `TurnResult`
- [ ] `trimMessages` uses actual API-reported token count instead of estimated count
- [ ] Trimming runs retroactively after API call returns (not before the call)
- [ ] `lastUsage` is stored in session JSON alongside messages
- [ ] Context trimming triggers correctly for sessions with large reasoning payloads
- [ ] Cold start (no prior usage data) handled gracefully -- no pre-call trimming, API errors caught
- [ ] Within-turn reasoning accumulation in azureInput is preserved (existing behavior unchanged)
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
- (all resolved)

## Decisions Made
- `_reasoning_items` (underscore prefix) signals this is internal/private, not part of OpenAI types
- Reasoning items emitted BEFORE assistant content in `toResponsesInput` (matches API item order)
- Existing azureInput push behavior preserved (within-turn reasoning continuity stays as-is)
- `estimateTokens` will be deleted -- replaced by API-reported usage from both providers
- Per-message overhead question is RESOLVED (no longer relevant -- we use real counts, not estimation)
- chars/4 heuristic question is RESOLVED (we don't use it anymore -- real API counts replace it)
- `responses.compact` is OUT OF SCOPE (not available on Azure yet)
- `contextMargin` default stays at 20% (configurable, no change needed)
- **Cold start**: No pre-call trimming. Send whatever we have on the first API call. If context is too large, the API will error -- handle that gracefully. On subsequent turns we have real usage data and trim retroactively.
- **Persist usage in session**: Store `lastUsage` (API-reported usage object) in session JSON alongside messages. NOT used for pre-call trimming on cold start -- stored for observability/debugging and future use.
- **Trim timing**: Trim AFTER the API call returns (retroactively), during user typing dead time. Flow: (1) user sends message, (2) call API with no pre-call trimming, (3) API returns response + usage, (4) store usage in session, (5) trim messages based on actual usage, (6) save trimmed session, (7) user is typing (trimming already done). This eliminates the need for any pre-call estimation entirely.

## Context / References
- `src/engine/core.ts` -- `runAgent` builds assistant messages at ~line 144-154, pushes outputItems to local azureInput at line 135-137
- `src/engine/streaming.ts` -- `toResponsesInput` at lines 10-59 converts messages to Responses API format; `TurnResult` interface at lines 4-8; `streamResponsesApi` collects outputItems at line 258
- `src/mind/context.ts` -- `estimateTokens` at lines 6-21 (TO BE DELETED), `trimMessages` at lines 45-76 (TO BE REWORKED)
- `src/config.ts` -- `contextMargin` default at line 59
- Existing test at `core.test.ts` line 1359 confirms reasoning item structure: `{ type: "reasoning", id: "r1", summary: [{ text: "thought", type: "summary_text" }], encrypted_content: "enc1" }`
- `scripts/test-usage-reporting.ts` -- live test script confirming both providers return streaming usage data
- Azure Responses API docs: https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/responses
- Azure docs state: "When using store: false, you must preserve reasoning context across conversation turns"
- OpenAI community discussion on encrypted_content: performance improvement is optional, not mandatory, but API guidance says to preserve them
- Session file observed at 223KB with 188 messages; `estimateTokens` reports only 44,195 tokens -- well under the 80K maxTokens threshold -- while model ran out of context mid-turn
- **Azure usage format** (`response.completed` event): `{ input_tokens, input_tokens_details: { cached_tokens }, output_tokens, output_tokens_details: { reasoning_tokens }, total_tokens }`
- **MiniMax usage format** (final streaming chunk with `stream_options: { include_usage: true }`): `{ total_tokens, prompt_tokens, completion_tokens, completion_tokens_details: { reasoning_tokens } }`

## Notes
The root cause is that `azureInput` in `runAgent` is a local variable. Reasoning items collected during a turn exist there, but when the assistant message is built and pushed to `messages`, only `content` and `tool_calls` are preserved. On the next turn, `toResponsesInput` rebuilds `azureInput` from `messages` -- but reasoning items are gone.

The token estimation gap compounds this: `estimateTokens` only measures `msg.content` and `msg.tool_calls`, so even if reasoning items were somehow present, they would not be counted. The estimate says ~44K tokens while real context (including reasoning) is much higher. Trimming never triggers, and the model runs out of context mid-turn.

Live API testing confirmed both providers return actual token counts in streaming responses. Azure returns usage in the `response.completed` event; MiniMax returns it in the final streaming chunk when `stream_options: { include_usage: true }` is set. This eliminates the need for any estimation heuristic -- we can use real numbers. In the MiniMax test, reasoning tokens were 46 out of 95 total (nearly half), confirming that reasoning is a significant portion of token usage that must be accounted for.

## Progress Log
- 2026-02-26 15:42 Created
- 2026-02-26 16:20 Live tested both providers -- both return streaming usage data. Azure via `response.completed` event, MiniMax via final chunk with `stream_options: { include_usage: true }`. Decision: delete estimateTokens, use real API counts.
- 2026-02-26 Resolved cold-start and trim-timing questions. Trim retroactively after API responds, during user typing dead time. No pre-call estimation needed. Store usage in session for observability.
