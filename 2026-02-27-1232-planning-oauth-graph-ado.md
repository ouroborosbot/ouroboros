# Planning: OAuth Authentication for Graph API and Azure DevOps API

**Status**: NEEDS_REVIEW
**Created**: 2026-02-27 12:32

## Goal
Add OAuth/SSO authentication to the Ouroboros Teams bot so the LLM agent can call Microsoft Graph API and Azure DevOps API on behalf of the user, enabling read and write access to emails, calendar, files, Teams messages, user profile, work items, repos/PRs, and pipelines. Write/mutating actions are gated by a harness-level confirmation system ("muscle memory") that requires explicit user consent before execution.

## Scope

### In Scope
- Document Azure/Entra app registration setup steps (manual, not code)
- Add `webApplicationInfo` to the Teams manifest
- Configure single OAuth connection name (covering both Graph and ADO scopes) in the App constructor
- Thread the user token and signin callback from the Teams activity context through to the agent loop and tool handlers
- Create a Graph API client utility that uses the user's token
- Create an ADO API client utility for Azure DevOps REST API calls with the user's token
- Add ~16 LLM-callable tools (10 read + 6 write) for Graph and ADO, available only on the Teams channel
- Implement channel-conditional tool registration: Graph/ADO tools are injected only when `channel === "teams"`
- Implement on-demand signin flow: tool detects no token, returns auth-needed message to LLM, LLM explains to user why signin is needed, signin card is presented
- Implement harness-level "muscle memory" confirmation system for all write/mutating tool calls -- the agent loop intercepts write tools, pauses execution, presents the action to the user for confirmation, and only executes after explicit consent
- Add ADO organization URL to config
- Unit tests for all new code (auth flow, API clients, tools, confirmation system, channel-conditional registration)
- Document local testing approach (dev tunnels)

### Out of Scope
- Actually performing the Azure portal / Entra setup (that's a manual step, we document it)
- Admin consent flows or multi-tenant support
- Caching/refreshing tokens (the SDK handles this)
- Graph API calls using app-only permissions (we use delegated/user tokens only)
- UI customization of the OAuth card
- Rate limiting or throttling for Graph/ADO calls
- Proactive messaging (bot-initiated, not user-initiated)
- Proactive signin on first message (signin is on-demand only)
- CLI channel support for Graph/ADO tools (Teams only)

## Completion Criteria
- [ ] Azure/Entra setup steps documented in a markdown file in `docs/`
- [ ] Manifest includes `webApplicationInfo` with correct structure
- [ ] OAuth connection name configurable via config.json / env var
- [ ] ADO organization URL configurable via config.json / env var
- [ ] User token and signin callback from Teams SDK context are available to tool handlers
- [ ] Graph API client utility exists with methods for all supported endpoints
- [ ] ADO API client utility exists with methods for all supported endpoints
- [ ] All 16 tools are defined and functional (10 read, 6 write)
- [ ] Graph/ADO tools are only available when `channel === "teams"`, not on CLI
- [ ] On-demand signin flow works: tool returns auth-needed, LLM explains, signin card appears
- [ ] Harness-level confirmation system blocks all write tools until user confirms
- [ ] Confirmation system is enforced in the agent loop (not just in prompting)
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
(All resolved -- see Decisions Made)

## Decisions Made
- **Single OAuth connection**: One Entra app registration with both Graph and ADO scopes. Single connection name (default: `graph`). User consents to all scopes at once. Simpler setup, one signin flow.
- **On-demand signin with LLM explanation**: When a Graph/ADO tool is called and the user hasn't signed in, the tool returns a structured message (not an error) explaining auth is needed and what the tool wants to do. The LLM then explains to the user why it needs signin and the signin card is presented. The user sees context before the OAuth prompt.
- **Read AND write permissions**: Graph scopes include read and write (`Mail.ReadWrite`, `Calendars.ReadWrite`, etc.). ADO scopes include read and write (`vso.work_write`, `vso.code_write`, etc.).
- **Harness-level confirmation for writes ("muscle memory")**: All write/mutating tool calls are intercepted in the agent loop before execution. The harness pauses, sends the proposed action details to the user via the stream, and waits for explicit confirmation before executing. This is enforced at the code level in `core.ts`, not via prompt engineering. The LLM cannot bypass this. Implementation: write tools are tagged with a `requiresConfirmation` flag; the tool execution loop in `runAgent` checks this flag and delegates to a `ChannelCallbacks.onConfirmAction` callback that handles the UX.
- **Channel-conditional tools**: Graph/ADO tools are only registered when `channel === "teams"`. The `runAgent` function already receives `channel`; the tool list will be built dynamically based on channel. CLI gets the existing tools only.
- **Tool output format**: Summarized human-readable text with key fields (not raw JSON). Keeps token usage efficient while giving the LLM enough to answer.
- **ADO organization URL**: Configurable via `config.json` at `ado.organization` and env var `ADO_ORGANIZATION`.
- **Expanded tool set (~16 tools)**: 10 read tools + 6 write tools covering Graph and ADO (see tool list below).
- Use the Teams AI Library v2's built-in OAuth support (`ctx.signin()`, `ctx.userToken`, `ctx.userGraph`) rather than implementing custom OAuth
- The SDK's `app.process.js` already calls `getUserToken` on every activity and populates `isSignedIn` and `userToken` on the context -- we need to thread this through to tool handlers
- ADO calls will use raw fetch with the user's token against the ADO REST API (`https://dev.azure.com/{org}/_apis/...`)
- The `handleTeamsMessage` function in `teams.ts` needs to be refactored to receive the full activity context (including `userToken`, `isSignedIn`, `signin()`) so these are available to tool handlers
- Graph calls can use the SDK's `userGraph` (GraphClient from `@microsoft/teams.graph`) for standard endpoints, or raw fetch with `userToken` for flexibility
- The `execTool` function signature needs to accept an optional `ToolContext` parameter that provides `userToken`, `signin`, `isSignedIn`, and `adoOrganization` to Graph/ADO tool handlers

### Tool List

**Graph Read Tools (6):**
1. `graph_profile` -- get user profile (name, email, job title, etc.)
2. `graph_emails` -- list/search emails (params: folder, query, count)
3. `graph_calendar` -- list calendar events (params: start, end, count)
4. `graph_files` -- list/search files in OneDrive/SharePoint (params: path, query)
5. `graph_teams_messages` -- list recent messages in a Teams channel/chat (params: chatId, count)
6. `graph_search` -- search across Microsoft 365 content (params: query, entity types)

**Graph Write Tools (3):**
7. `graph_send_email` -- send an email (params: to, subject, body) [REQUIRES CONFIRMATION]
8. `graph_create_event` -- create a calendar event (params: subject, start, end, attendees) [REQUIRES CONFIRMATION]
9. `graph_upload_file` -- upload a file to OneDrive/SharePoint (params: path, content) [REQUIRES CONFIRMATION]

**ADO Read Tools (4):**
10. `ado_work_items` -- query/list work items (params: query, project, ids)
11. `ado_repos` -- list repos or get repo details (params: project, repoName)
12. `ado_pull_requests` -- list/get PRs (params: project, repo, status)
13. `ado_pipelines` -- list/get pipeline runs (params: project, pipelineId)

**ADO Write Tools (3):**
14. `ado_create_work_item` -- create a work item (params: project, type, title, description, assignedTo) [REQUIRES CONFIRMATION]
15. `ado_update_work_item` -- update a work item (params: id, fields to update) [REQUIRES CONFIRMATION]
16. `ado_create_pr_comment` -- add a comment to a PR (params: project, repo, prId, comment) [REQUIRES CONFIRMATION]

### Signin Flow Detail

```
User: "What's on my calendar today?"
  |
  v
LLM decides to call graph_calendar tool
  |
  v
Tool handler checks: userToken available?
  |
  +-- YES: execute Graph API call, return results
  |
  +-- NO: return structured message:
        "AUTH_REQUIRED: I need access to your Microsoft 365 calendar
         to check today's events. Please sign in when prompted."
        |
        v
      LLM receives this, explains to user:
        "I'd like to check your calendar for today's events.
         To do this, I need you to sign in to your Microsoft 365
         account. You should see a sign-in prompt below."
        |
        v
      Signin card is presented (via ctx.signin())
        |
        v
      User signs in -> SDK emits 'signin' event -> token cached
        |
        v
      Next user message triggers the tool again, this time with token
```

### Write Confirmation Flow Detail ("Muscle Memory")

```
User: "Send an email to Alice about the meeting"
  |
  v
LLM decides to call graph_send_email tool with:
  { to: "alice@contoso.com", subject: "Meeting", body: "..." }
  |
  v
Agent loop (core.ts) sees tool has requiresConfirmation flag
  |
  v
Agent loop pauses execution, calls callbacks.onConfirmAction:
  "Ouroboros wants to SEND AN EMAIL:
   To: alice@contoso.com
   Subject: Meeting
   Body: ...

   Reply 'yes' to confirm or 'no' to cancel."
  |
  v
  +-- User says "yes": tool executes, result returned to LLM
  +-- User says "no": tool returns "cancelled by user", LLM acknowledges
  +-- Timeout: tool returns "cancelled (no response)", LLM acknowledges
```

The confirmation callback on the Teams channel sends the action summary via `stream.emit()` / `stream.update()`, then waits for the next user message in the conversation. This requires the agent loop to yield control back and resume when the user responds. Implementation approach: the write tool returns a "pending_confirmation" status, the agent loop breaks, the confirmation state is persisted in the session, and the next incoming message is checked for confirmation before resuming the agent.

### Architecture Changes Summary

1. **`src/config.ts`**: Add `AdoConfig` interface with `organization` field, `getAdoConfig()` function, env var `ADO_ORGANIZATION`
2. **`src/engine/tools.ts`**: Add `ToolContext` interface, modify `execTool` to accept optional context, add `requiresConfirmation` metadata to write tools, add `getToolsForChannel(channel)` function that returns base tools + Graph/ADO tools for Teams
3. **`src/engine/core.ts`**: Modify `runAgent` to accept `ToolContext` in options, use `getToolsForChannel(channel)` instead of static `tools`, add confirmation interception in tool execution loop, add `onConfirmAction` to `ChannelCallbacks`
4. **`src/channels/teams.ts`**: Refactor `handleTeamsMessage` to accept activity context (userToken, isSignedIn, signin), refactor `startTeamsApp` to pass context through, implement `onConfirmAction` callback in `createTeamsCallbacks`
5. **New `src/engine/graph-client.ts`**: Graph API client with methods for each endpoint, uses userToken for auth
6. **New `src/engine/ado-client.ts`**: ADO API client with methods for each endpoint, uses userToken for auth
7. **`manifest/manifest.json`**: Add `webApplicationInfo` section
8. **New `docs/OAUTH-SETUP.md`**: Azure/Entra setup instructions

## Context / References
- `src/channels/teams.ts` -- Teams adapter, `handleTeamsMessage`, `createTeamsCallbacks`, `startTeamsApp`; line 203 `app.on("message", async ({ stream, activity })` needs to also destructure `isSignedIn`, `userToken`, `signin`
- `src/engine/core.ts` -- agent loop (`runAgent`), `ChannelCallbacks` interface; lines 306-344 tool execution loop is where confirmation interception goes
- `src/engine/tools.ts` -- tool definitions (`tools` array), `execTool`, `toolHandlers`; `ToolHandler` type needs to accept optional `ToolContext`
- `src/config.ts` -- configuration loading; needs `AdoConfig` and `getAdoConfig()`
- `manifest/manifest.json` -- Teams app manifest (v1.25, has copilot scope)
- `node_modules/@microsoft/teams.apps/dist/contexts/activity.d.ts` -- `IActivityContext` with `signin()`, `signout()`, `isSignedIn`, `userToken`, `userGraph`
- `node_modules/@microsoft/teams.apps/dist/oauth.d.ts` -- `OAuthSettings` with `defaultConnectionName` (defaults to `graph`)
- `node_modules/@microsoft/teams.graph/dist/index.d.ts` -- `GraphClient` with `call()` method
- Teams AI Library v2 handles token exchange/verify state automatically via `app.oauth.js`
- Graph API reference: `https://graph.microsoft.com/v1.0/me`, `/me/messages`, `/me/calendarview`, `/me/drive/root/children`, etc.
- ADO REST API reference: `https://dev.azure.com/{org}/_apis/wit/wiql`, `/_apis/git/repositories`, `/_apis/git/pullrequests`, `/_apis/pipelines`

## Notes
The SDK's `app.process.js` automatically attempts `getUserToken` on every inbound activity. If the user has previously consented and a valid token is cached, `userToken` is populated and `isSignedIn` is true. If not, `userToken` is undefined and `isSignedIn` is false. The `ctx.signin()` method sends an OAuth card to the user prompting for consent.

The `app.on("message")` callback receives an `IActivityContext` which includes `signin`, `signout`, `isSignedIn`, `userToken`, `userGraph`, `stream`, `activity`, `send`, `reply`. Currently only `stream` and `activity` are destructured.

For the confirmation system, the key challenge is that the agent loop is synchronous within a single message turn. The confirmation needs to break out of the loop, persist state, and resume on the next message. This is similar to how some chatbots implement "slot filling" -- the session state tracks a pending confirmation, and the next user message is intercepted to check for yes/no before being passed to the LLM.

## Progress Log
- 2026-02-27 12:32 Created
- 2026-02-27 12:33 Initial commit
