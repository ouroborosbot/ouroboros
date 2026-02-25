# Planning: Sliding Context Window with Session Persistence

**Status**: drafting
**Created**: 2026-02-25 08:23

## Goal
Implement a sliding context window for the ouroboros agent so that extended conversations do not exceed the model's context limit. Older messages are simply dropped (no summarization) while keeping recent context. The conversation state persists to disk so users have continuity across sessions (process restarts). The philosophy is to embrace the LLM's short memory and encourage the model to take notes on its work and check those notes when unsure.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- **Token counting**: Approximate token count for a messages array using character-count / 4 heuristic. No external dependencies. Conservative safety margin.
- **Sliding window trimming**: When the messages array exceeds a configurable threshold, drop older messages while preserving the system prompt and recent context. No summarization -- simply drop old messages. The model is expected to take notes on its work and check those notes when unsure.
- **Session persistence (CLI)**: Save the messages array to disk (e.g., JSON file in `.ouroboros/sessions/`) after each turn. Single global session (not per-directory). On startup, load the previous session so the conversation continues where it left off.
- **Session persistence (Teams)**: Save the messages array to disk per conversation key. On incoming message, load the session for that conversation. On process restart, conversations resume. (Keying strategy TBD -- see Open Questions.)
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
- [ ] **Teams conversation keying strategy** -- see options analysis below. User to decide.
- [ ] What default token limit? Conservative default of 80k tokens seems reasonable for most models. Configurable via env var.

### Teams Conversation Keying Options

The Teams SDK `activity` object provides several identifiers that could be used to key sessions. Here are the options with trade-offs:

**Option A: Per conversation ID (`activity.conversation.id`)**
- The `conversation.id` uniquely identifies a conversation thread in Teams. In 1:1 chats, each user-to-bot pair gets a unique conversation ID. In group chats, the group chat gets one conversation ID. In channels, each channel gets a conversation ID (with thread replies sharing it).
- Pros: Natural Teams primitive. One conversation = one session. Matches how users think about "a conversation."
- Cons: In a channel, everyone shares the same context window. If user A asks about topic X and user B asks about topic Y, they see each other's context (which is arguably correct -- it IS a shared channel conversation).
- Best for: Most use cases. This is the standard approach.

**Option B: Per user (`activity.from.id`)**
- The `from.id` (or `from.aadObjectId`) uniquely identifies the user who sent the message.
- Pros: Each user gets their own private context window regardless of which channel or chat they message from. Clean isolation.
- Cons: If the same user talks to the bot from a 1:1 chat AND a group chat, both share the same context. This may be confusing -- context from a private 1:1 leaking into group chat responses. Also loses the "shared conversation" feel in group chats.
- Best for: Strict per-user isolation (uncommon for team bots).

**Option C: Per conversation ID + user ID (composite key)**
- Key is `${activity.conversation.id}:${activity.from.id}`.
- Pros: Each user gets their own context window within each conversation. No cross-contamination between users in channels. No cross-contamination between conversations for the same user.
- Cons: In a group chat or channel, users lose the shared context that makes group chat useful. User A's question and the bot's answer would not be in user B's context. The bot would respond to each person as if the others don't exist.
- Best for: Privacy-sensitive scenarios (uncommon).

**Option D: Per conversation type (hybrid)**
- 1:1 chats (`conversationType === "personal"`): key by conversation ID (which is already unique per user-bot pair)
- Group chats / channels: key by conversation ID (shared context)
- This is effectively the same as Option A, since conversation ID is already unique per user in 1:1 and shared in groups.

**Recommendation: Option A (per conversation ID).** It is the simplest, most natural, and matches Teams semantics. The `activity.conversation.id` is available on every message and is the standard keying approach for Teams bots.

## Decisions Made
- **No summarization**: Simply drop old messages when the context window is exceeded. The philosophy is to embrace the LLM's short memory and encourage the model to take notes and check them when unsure. Summarization often confuses the model more than it helps.
- **Simple token counting**: Character count / 4 heuristic. No external tokenizer dependency. Conservative safety margin to avoid hitting actual limits.
- **Single global CLI session**: Not per-directory. One session file for the CLI adapter.
- **Session reset command**: CLI supports "new" to clear the session and start fresh.
- **Teams keying**: TBD -- awaiting user decision on keying options above.

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
