# Planning: Sliding Context Window with Session Persistence

**Status**: drafting
**Created**: 2026-02-25 08:23

## Goal
Implement a sliding context window for the ouroboros agent so that extended conversations do not exceed the model's context limit. Older messages are trimmed or summarized to keep recent context. The conversation state persists to disk so users have continuity across sessions (process restarts).

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- **Token counting**: Count tokens in the messages array to know when we are approaching the context limit. Use a lightweight approximation (e.g., character-based heuristic or tiktoken-compatible library) since exact token counts vary by model.
- **Sliding window trimming**: When the messages array exceeds a configurable threshold, trim older messages while preserving the system prompt and recent context. The trimming strategy should keep the most recent N messages intact and either drop or summarize older ones.
- **Summarization of trimmed context** (stretch): Before dropping old messages, generate a brief summary and inject it as a "context summary" message so the agent retains awareness of earlier conversation topics. This requires an extra LLM call and may be deferred -- see Open Questions.
- **Session persistence (CLI)**: Save the messages array to disk (e.g., JSON file in a well-known location like `.ouroboros/sessions/`) after each turn. On startup, load the previous session so the conversation continues where it left off.
- **Session persistence (Teams)**: Save the messages array to disk per conversation. On incoming message, load the session for that conversation. On process restart, conversations resume.
- **Configurable limits**: Token limit and recent-messages-to-keep should be configurable via environment variables (with sensible defaults).
- **Integration with `runAgent`**: The sliding window logic runs before each `runAgent` call, ensuring the messages array passed to the API is within limits.
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
- [ ] Token counting function exists and returns approximate token count for a messages array
- [ ] Sliding window trims messages when token count exceeds configurable threshold
- [ ] System prompt is always preserved (never trimmed)
- [ ] Most recent N messages are always preserved (never trimmed)
- [ ] CLI adapter persists conversation to disk after each turn
- [ ] CLI adapter loads previous session on startup (with graceful fallback if no session exists or file is corrupt)
- [ ] Teams adapter persists conversation per-conversation-ID to disk after each turn
- [ ] Teams adapter loads session on incoming message (with graceful fallback)
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
- [ ] Should we summarize trimmed messages (extra LLM call) or simply drop them? Summarization adds latency and cost but preserves context awareness. Option: start with simple drop + a "conversation was trimmed" system message, add summarization later.
- [ ] What token limit defaults make sense? Azure OpenAI models vary (128k for GPT-4o, 64k for some deployments). MiniMax limits are different. Should we detect from model or use a conservative default (e.g., 80k tokens)?
- [ ] For CLI persistence, should sessions be keyed by working directory (so each project gets its own conversation) or a single global session?
- [ ] For Teams persistence, the conversation ID is available from `activity.conversation.id` -- is this sufficient for keying, or do we need to consider thread IDs?
- [ ] Should there be a CLI command to clear/reset the session (e.g., typing "reset" or "new")?
- [ ] What is the right token counting approach? Options: (a) character count / 4 heuristic, (b) a lightweight tokenizer library like `js-tiktoken`, (c) use the API's token count from response headers. Each has tradeoffs in accuracy vs. dependency weight.

## Decisions Made
- (none yet -- awaiting discussion)

## Context / References
- `src/core.ts` lines 673-767: `runAgent()` -- the agent loop. Takes `messages` array, appends to it during execution. This is where sliding window would need to integrate (before the API call).
- `src/core.ts` lines 185-234: `toResponsesInput()` -- converts messages to Responses API format. Must operate on the already-trimmed messages array.
- `src/agent.ts` line 154: CLI creates `messages` array in `main()` -- ephemeral, lost on exit. This is where persistence load/save would integrate.
- `src/agent.ts` lines 206-213: CLI main loop -- `messages.push({ role: "user", content: input })` then `runAgent(messages, ...)`. Save-after-turn would go after `runAgent` returns.
- `src/teams.ts` lines 96-98: Teams global `messages` array -- currently single conversation, no persistence. Needs per-conversation keying.
- `src/teams.ts` lines 101-107: `handleTeamsMessage()` -- pushes user message, calls `runAgent`. Load/save would integrate here.
- `src/teams.ts` line 135: `app.on("message", ...)` handler -- `activity` object has `activity.conversation.id` for conversation keying.
- Provider token limits: Azure OpenAI varies by deployment. MiniMax varies by model. Need configurable default.

## Notes
The current architecture has no concept of conversation lifecycle or bounds. Both adapters grow the messages array unboundedly. For long conversations (especially in Teams where the server runs continuously), this will eventually hit the model's context limit and fail. This feature addresses that gap.

The Teams adapter currently uses a single global messages array ("WU1 simplification"). This feature will need to move to per-conversation storage, which is a prerequisite for both persistence and multi-conversation support.

## Progress Log
- 2026-02-25 08:23 Created
