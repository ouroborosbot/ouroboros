# Planning: Sliding Context Window with Session Persistence

**Status**: approved
**Created**: 2026-02-25 08:23

## Goal
Implement a sliding context window for the ouroboros agent so that extended conversations do not exceed the model's context limit. Older messages are simply dropped (no summarization) while keeping recent context. The conversation state persists to disk so users have continuity across sessions (process restarts). The philosophy is to embrace the LLM's short memory and encourage the model to take notes on its work and check those notes when unsure.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- **Token counting**: Approximate token count for a messages array using character-count / 4 heuristic. No external dependencies. Conservative safety margin.
- **Sliding window trimming**: When the messages array exceeds the `maxTokens` threshold, drop the oldest messages (after the system prompt) one at a time until under the limit. System prompt is always preserved. No summarization -- simply drop old messages. The model is expected to take notes on its work and check those notes when unsure.
- **Session persistence (CLI)**: Save the messages array to disk at `~/.agentconfigs/ouroboros/sessions/cli/session.json` after each turn. Single global session (not per-directory). On startup, load the previous session so the conversation continues where it left off.
- **Session persistence (Teams)**: Save the messages array to disk at `~/.agentconfigs/ouroboros/sessions/teams/<conversation-id>.json`. On incoming message, load the session for that conversation. On process restart, conversations resume.
- **JSON config file**: Move all configuration (including API keys and provider settings) from environment variables into `~/.agentconfigs/ouroboros/config.json`. Structure with sections for provider config (credentials, model, endpoint) and agent config (token limits, etc.). Sessions live at `~/.agentconfigs/ouroboros/sessions/`. Env vars still override for CI/testing (precedence: env var > config.json > defaults). The `.env` file and `AZURE_*`/`MINIMAX_*`/`CLIENT_*` env vars become optional — config.json is the primary source.
  ```json
  {
    "providers": {
      "azure": {
        "apiKey": "...",
        "endpoint": "...",
        "deployment": "...",
        "modelName": "...",
        "apiVersion": "2025-04-01-preview"
      },
      "minimax": {
        "apiKey": "...",
        "model": "..."
      }
    },
    "teams": {
      "clientId": "...",
      "clientSecret": "...",
      "tenantId": "..."
    },
    "context": {
      "maxTokens": 80000
    }
  }
  ```
- **Integration with `runAgent`**: The sliding window logic runs before each `runAgent` call, ensuring the messages array passed to the API is within limits.
- **Slash command system**: Replace the current ad-hoc command handling (`exit` as hardcoded string check) with a proper slash-command dispatcher. Commands use `/` prefix (e.g., `/exit`, `/new`). A shared command registry defines available commands with names, descriptions, and handlers. Each adapter surfaces commands in its native way:
  - **CLI**: Parse `/command` from user input before sending to agent. Show available commands via `/commands`.
  - **Teams**: Add `commandLists` to the bot manifest so commands appear natively in the compose box with descriptions. Parse `/command` from message text in the handler before sending to agent.
- **Initial commands**: `/exit` (CLI only — quit the process), `/new` (both — clear session and start fresh), `/commands` (both — list available commands). `/exit` is not registered in Teams — you can't quit a bot.
- **100% test coverage on all new code**

### Out of Scope
- Database-backed persistence (we use simple file-based storage for now)
- Multi-user session isolation beyond what Teams conversation IDs provide
- Encryption or security of persisted session files
- Migration tooling for session format changes
- UI for browsing or managing past sessions
- Changes to the tool system or agent loop logic (beyond trimming integration)
- Streaming or chunked persistence (we persist after each complete turn)

## Completion Criteria
- [ ] Token counting function exists and returns approximate token count for a messages array (char/4 heuristic)
- [ ] Sliding window drops old messages when token count exceeds configurable threshold (no summarization)
- [ ] System prompt is always preserved (never trimmed)
- [ ] Oldest messages (after system prompt) are dropped until under maxTokens
- [ ] CLI adapter persists single global session to disk after each turn
- [ ] CLI adapter loads previous session on startup (graceful fallback if no session or corrupt file)
- [ ] Shared command registry exists with name, description, and handler for each command
- [ ] CLI dispatches `/command` input through the registry before sending to agent
- [ ] CLI `/exit` quits the process, `/new` clears session, `/commands` lists commands
- [ ] Teams manifest includes `commandLists` with descriptions for `/new` and `/commands`
- [ ] Teams handler dispatches `/command` input through the registry before sending to agent
- [ ] Teams `/new` clears the conversation session, `/commands` lists commands
- [ ] Existing `exit` plain-text command replaced by `/exit` slash command
- [ ] Teams adapter persists conversation per conversation key to disk after each turn
- [ ] Teams adapter loads session on incoming message (graceful fallback)
- [ ] Config loaded from `~/.agentconfigs/ouroboros/config.json` with provider credentials, model settings, and context window settings
- [ ] Env vars override config.json values (precedence: env var > config.json > defaults)
- [ ] `getClient()` / `getProvider()` reads from config.json as primary source, falls back to env vars
- [ ] Sessions stored at `~/.agentconfigs/ouroboros/sessions/<channel>/` (e.g., `sessions/cli/session.json`, `sessions/teams/<conv-id>.json`)
- [ ] Graceful fallback if config.json missing or malformed (use env vars, then defaults)
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
- **Slash commands**: All user-facing commands use `/` prefix. Shared registry so both adapters use the same command definitions. Teams surfaces them natively via manifest `commandLists`.
- **Teams keying**: Per conversation ID (`activity.conversation.id`). Simplest approach, matches natural Teams semantics. 1:1 chats are unique per user-bot pair; group chats/channels share context (correct behavior).
- **No `/exit` in Teams**: Can't quit a bot — `/exit` is CLI only.
- **JSON config over env vars**: All config (including API keys) moves to `~/.agentconfigs/ouroboros/config.json`. Env vars are no more secure than a JSON file — they're already stored in `.zshrc` or `.env`. JSON gives us structured sections for providers. Env vars still override for CI/testing.

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
- `manifest/manifest.json`: Teams bot manifest. Currently has no `commandLists`. The bot schema supports `commandLists` array on bot entries to surface commands natively in the Teams compose box with descriptions.
- `src/agent.ts` line 221: Current `exit` command is a plain string check (`input.toLowerCase() === "exit"`). No slash prefix, no command framework.
- `src/core.ts` lines 10-48: `getClient()` reads provider config entirely from env vars (`AZURE_OPENAI_*`, `MINIMAX_*`). This will need to read from config.json first, with env var fallback.
- `src/teams-entry.ts`: Loads `dotenv` for Teams env vars (`CLIENT_ID`, `CLIENT_SECRET`, `TENANT_ID`). These move to config.json `teams` section.

## Notes
The current architecture has no concept of conversation lifecycle or bounds. Both adapters grow the messages array unboundedly. For long conversations (especially in Teams where the server runs continuously), this will eventually hit the model's context limit and fail. This feature addresses that gap.

The Teams adapter currently uses a single global messages array ("WU1 simplification"). This feature will move to per-conversation storage, which is a prerequisite for both persistence and multi-conversation support.

Design philosophy: the model should take notes on its work (via write_file tool) and check those notes when unsure. This is more reliable than LLM-generated summarization of old context, which often confuses the model with hallucinated or imprecise summaries.

## Progress Log
- 2026-02-25 08:25 Created
- 2026-02-25 08:36 Applied user decisions (no summarization, char/4 heuristic, single global CLI session, "new" command). Added Teams keying options analysis.
- 2026-02-25 Scope update: replaced ad-hoc commands with slash-command system. Shared command registry, `/exit` `/new` `/commands`. Teams manifest `commandLists` for native surfacing.
- 2026-02-25 Scope update: moved all config (including API keys, provider settings) from env vars to `~/.agentconfigs/ouroboros/config.json`. Structured sections for providers. Env vars still override for CI.
- 2026-02-25 Removed keepRecent config — trimming simply drops oldest messages until under maxTokens.
