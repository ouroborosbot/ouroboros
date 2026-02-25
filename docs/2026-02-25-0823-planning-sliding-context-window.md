# Planning: Sliding Context Window with Session Persistence

**Status**: approved
**Created**: 2026-02-25 08:23

## Goal
Implement a sliding context window for the ouroboros agent so that extended conversations do not exceed the model's context limit. Older messages are simply dropped (no summarization) while keeping recent context. The conversation state persists to disk so users have continuity across sessions (process restarts). The philosophy is to embrace the LLM's short memory and encourage the model to take notes on its work and check those notes when unsure.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- **Token counting**: Approximate token count for a messages array using character-count / 4 heuristic. No external dependencies. Conservative safety margin.
- **Sliding window trimming**: When the messages array exceeds a configurable threshold, drop older messages while preserving the system prompt and recent context. No summarization -- simply drop old messages. The model is expected to take notes on its work and check those notes when unsure.
- **Session persistence (CLI)**: Save the messages array to disk (e.g., JSON file in `.ouroboros/sessions/`) after each turn. Single global session (not per-directory). On startup, load the previous session so the conversation continues where it left off.
- **Session persistence (Teams)**: Save the messages array to disk keyed by `activity.conversation.id`. On incoming message, load the session for that conversation. On process restart, conversations resume.
- **Configurable limits**: Token limit and recent-messages-to-keep should be configurable via environment variables (with sensible defaults).
- **Integration with `runAgent`**: The sliding window logic runs before each `runAgent` call, ensuring the messages array passed to the API is within limits.
- **Session reset command**: CLI supports typing "new" to clear the current session and start fresh.
- **100% test coverage on all new code**

### Out of Scope
- Database-backed persistence (we use simple file-based storage for now)
- Multi-user session isolation beyond what Teams conversation IDs provide
- Encryption or security of persisted session files
- Migration tooling for session format changes
- UI for browsing or managing past sessions
- Changes to the provider architecture or tool system
- Streaming or chunked persistence (we persist after each complete turn)

## Completion Criteria
- [ ] Token counting function exists and returns approximate token count for a messages array (char/4 heuristic)
- [ ] Sliding window drops old messages when token count exceeds configurable threshold (no summarization)
- [ ] System prompt is always preserved (never trimmed)
- [ ] Most recent N messages are always preserved (never trimmed)
- [ ] CLI adapter persists single global session to disk after each turn
- [ ] CLI adapter loads previous session on startup (graceful fallback if no session or corrupt file)
- [ ] CLI supports "new" command to clear session and start fresh
- [ ] Teams adapter persists conversation per conversation key to disk after each turn
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

## Open Questions
- (all resolved)

## Decisions Made
- **No summarization**: Simply drop old messages when the context window is exceeded. The philosophy is to embrace the LLM's short memory and encourage the model to take notes and check them when unsure. Summarization often confuses the model more than it helps.
- **Simple token counting**: Character count / 4 heuristic. No external tokenizer dependency. Conservative safety margin to avoid hitting actual limits.
- **Single global CLI session**: Not per-directory. One session file for the CLI adapter.
- **Session reset command**: CLI supports "new" to clear the session and start fresh.
- **Teams keying**: Per conversation ID (`activity.conversation.id`). Simplest approach, matches natural Teams semantics. 1:1 chats are unique per user-bot pair; group chats/channels share context (correct behavior).

## Context / References
- `src/core.ts` lines 673-767: `runAgent()` -- the agent loop. Takes `messages` array, appends to it during execution. This is where sliding window would need to integrate (before the API call).
- `src/core.ts` lines 185-234: `toResponsesInput()` -- converts messages to Responses API format. Must operate on the already-trimmed messages array.
- `src/agent.ts` line 154: CLI creates `messages` array in `main()` -- ephemeral, lost on exit. Persistence load/save integrates here.
- `src/agent.ts` lines 196-223: CLI main loop -- `messages.push({ role: "user", content: input })` then `runAgent(messages, ...)`. Save-after-turn goes after `runAgent` returns. "new" command handling goes in the input check.
- `src/teams.ts` lines 96-98: Teams global `messages` array -- currently single conversation, no persistence. Needs per-conversation keying and persistence.
- `src/teams.ts` lines 101-107: `handleTeamsMessage()` -- pushes user message, calls `runAgent`. Load/save integrates here. Needs `activity` parameter added for conversation keying.
- `src/teams.ts` line 135: `app.on("message", ...)` handler -- `activity` object available with: `activity.conversation.id` (string), `activity.conversation.conversationType` ("personal" | "groupChat" | string), `activity.from.id` (string), `activity.from.aadObjectId` (string), `activity.from.name` (string).
- Teams `ConversationAccount` type: `{ id: string, tenantId?: string, conversationType: "personal" | "groupChat" | string, name?: string, isGroup?: boolean }`
- Teams `Account` type: `{ id: string, aadObjectId?: string, role: Role, name: string }`
- Provider token limits: Azure OpenAI varies by deployment. MiniMax varies by model. Need configurable default (recommend 80k).

## Notes
The current architecture has no concept of conversation lifecycle or bounds. Both adapters grow the messages array unboundedly. For long conversations (especially in Teams where the server runs continuously), this will eventually hit the model's context limit and fail. This feature addresses that gap.

The Teams adapter currently uses a single global messages array ("WU1 simplification"). This feature will move to per-conversation storage, which is a prerequisite for both persistence and multi-conversation support.

Design philosophy: the model should take notes on its work (via write_file tool) and check those notes when unsure. This is more reliable than LLM-generated summarization of old context, which often confuses the model with hallucinated or imprecise summaries.

## Progress Log
- 2026-02-25 08:25 Created
- 2026-02-25 08:36 Applied user decisions (no summarization, char/4 heuristic, single global CLI session, "new" command). Added Teams keying options analysis.
