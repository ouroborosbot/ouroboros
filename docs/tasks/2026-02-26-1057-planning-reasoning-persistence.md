# Planning: Reasoning Item Persistence and API-Reported Token Usage

**Status**: approved
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
- **Context overflow auto-recovery** -- when the API returns a context_length_exceeded error (Azure: `error.code === "context_length_exceeded"`, MiniMax: error message contains "context window exceeds limit"), automatically trim the oldest messages and retry the API call. The user should never see this error -- it is handled transparently. Log the event so the user knows trimming happened (e.g., "context trimmed, retrying...")
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
- [ ] Context overflow errors from both providers are caught and trigger automatic trim + retry
- [ ] User is informed when auto-trim happens (log message, not an error)
- [ ] Retry succeeds after trimming (or surfaces the error if trimming can't help)
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
- **Context overflow recovery**: Automatic and transparent to the user. Different error detection per provider: Azure uses `error.code === "context_length_exceeded"`, MiniMax uses error message containing "context window exceeds limit". A simple log message informs the user when auto-trim happens. Neither provider returns usage data on overflow errors.

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
- Session file observed at 223KB with 188 messages; `estimateTokens` reports 44,195 tokens vs actual API-reported 58,566 tokens -- off by 14,371 tokens (1.33x undercounting)
- **Azure usage format** (`response.completed` event): `{ input_tokens, input_tokens_details: { cached_tokens }, output_tokens, output_tokens_details: { reasoning_tokens }, total_tokens }`
- **MiniMax usage format** (final streaming chunk with `stream_options: { include_usage: true }`): `{ total_tokens, prompt_tokens, completion_tokens, completion_tokens_details: { reasoning_tokens } }`
- `scripts/test-session-tokens.ts` -- sent actual CLI session to Azure, measured 58,566 actual vs 44,195 estimated (1.33x undercounting)
- `scripts/test-context-overflow.ts` -- Azure overflow error: `context_length_exceeded` (type: `invalid_request_error`, no HTTP status, no usage data)
- `scripts/test-context-overflow-minimax.ts` -- MiniMax overflow error: "context window exceeds limit" (code 2013, type: `bad_request_error`, no HTTP status, no usage data)
- **Azure overflow error shape**: `{ type: "invalid_request_error", code: "context_length_exceeded", message: "Your input exceeds the context window...", param: "input" }`
- **MiniMax overflow error shape**: `{ type: "bad_request_error", message: "invalid params, context window exceeds limit (2013)", http_code: "400" }`

## Notes
The root cause is that `azureInput` in `runAgent` is a local variable. Reasoning items collected during a turn exist there, but when the assistant message is built and pushed to `messages`, only `content` and `tool_calls` are preserved. On the next turn, `toResponsesInput` rebuilds `azureInput` from `messages` -- but reasoning items are gone.

The token estimation gap compounds this: `estimateTokens` only measures `msg.content` and `msg.tool_calls`, so even if reasoning items were somehow present, they would not be counted. The estimate says ~44K tokens while real context (including reasoning) is much higher. Trimming never triggers, and the model runs out of context mid-turn.

Live API testing confirmed both providers return actual token counts in streaming responses. Azure returns usage in the `response.completed` event; MiniMax returns it in the final streaming chunk when `stream_options: { include_usage: true }` is set. This eliminates the need for any estimation heuristic -- we can use real numbers. In the MiniMax test, reasoning tokens were 46 out of 95 total (nearly half), confirming that reasoning is a significant portion of token usage that must be accounted for.

Session token comparison: sending the actual CLI session (188 messages, 215KB) to Azure showed `estimateTokens` reported 44,195 tokens while the API reported 58,566 -- undercounting by 14,371 tokens (1.33x). The chars/4 heuristic consistently undercounts, which means trimming triggers too late or not at all.

Root cause clarification for the original "out of juice" incident: examining the session messages showed the model only used 3 out of 10 allowed tool rounds before stopping. It was not hitting context limits -- it got stuck in a text-only loop after a large test failure output (25K chars). The model confabulated "out of juice" / "per-turn execution limit" as explanations. The `MAX_NO_TOOL_TURNS` feature (being implemented in that very session) addresses that specific symptom. However, the underlying bugs (reasoning persistence + token estimation) remain real and will cause actual context overflow as sessions grow.

Context overflow testing: both providers return distinct error shapes on overflow but neither returns usage data. Azure returns `context_length_exceeded` (type: `invalid_request_error`), MiniMax returns "context window exceeds limit" (code 2013, type: `bad_request_error`). Neither returns an HTTP status code in the error object. Recovery strategy: catch the error, trim oldest messages, and retry transparently.

## Progress Log
- 2026-02-26 15:42 Created
- 2026-02-26 16:20 Live tested both providers -- both return streaming usage data. Azure via `response.completed` event, MiniMax via final chunk with `stream_options: { include_usage: true }`. Decision: delete estimateTokens, use real API counts.
- 2026-02-26 16:23 Resolved cold-start and trim-timing questions. Trim retroactively after API responds, during user typing dead time. No pre-call estimation needed. Store usage in session for observability.
- 2026-02-26 16:36 Sent actual CLI session to Azure API. estimateTokens reported 44,195; actual was 58,566 (1.33x off, undercounting by 14K tokens).
- 2026-02-26 16:36 Tested context overflow errors on both providers. Azure: context_length_exceeded. MiniMax: "context window exceeds limit" (code 2013). Neither returns usage data on overflow.
- 2026-02-26 16:36 Root cause clarification: the "out of juice" incident was the model getting stuck in a text-only loop (3/10 tool rounds used), not context overflow. MAX_NO_TOOL_TURNS addresses this. But underlying estimation/persistence bugs remain.
- 2026-02-26 16:36 Added context overflow auto-recovery to scope: catch overflow error, trim, retry transparently.
- 2026-02-26 16:40 Approved
