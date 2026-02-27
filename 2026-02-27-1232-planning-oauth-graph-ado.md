# Planning: OAuth Authentication for Graph API and Azure DevOps API

**Status**: NEEDS_REVIEW
**Created**: 2026-02-27 12:32

## Goal
Add OAuth/SSO authentication to the Ouroboros Teams bot so the LLM agent can call Microsoft Graph API and Azure DevOps API on behalf of the user, enabling read and write access to emails, calendar, files, Teams messages, user profile, work items, repos/PRs, and pipelines. Write/mutating actions are gated by a harness-level confirmation system ("muscle memory") that requires explicit user consent before execution. Delivered in three phases: smoke test first, then full read tools, then write tools with confirmation.

## Scope

### In Scope

**Phase 1 -- Smoke Test (minimal end-to-end proof)**
- Document Azure/Entra app registration setup steps (manual, not code)
- Add `webApplicationInfo` to the Teams manifest
- Configure single OAuth connection name in the App constructor
- Thread the user token and signin callback from the Teams activity context through to the agent loop and tool handlers
- Minimal Graph client: one method (`getProfile`)
- Minimal ADO client: one method (`queryWorkItems`)
- Two tools only: `graph_profile` and `ado_work_items`
- On-demand signin flow (tool returns auth-needed, LLM explains, signin card presented)
- Channel-conditional tool registration (these two tools only appear on Teams channel)
- ADO multi-org config (list of organizations in config, `organization` param on ADO tool)
- Unit tests for all Phase 1 code
- Manual smoke test: deploy, sign in, verify `graph_profile` returns real data, verify `ado_work_items` returns real data

**Phase 2 -- Full Read Tools**
- Full Graph client with methods for all read endpoints
- Full ADO client with methods for all read endpoints
- All 10 read tools wired and functional
- Unit tests for all Phase 2 code

**Phase 3 -- Write Tools + Muscle Memory**
- All 6 write tools
- Harness-level "muscle memory" confirmation system: agent loop intercepts write tools, presents action to user, waits for explicit consent before executing
- Confirmation state persisted in session for cross-message flow
- Unit tests for all Phase 3 code (including confirmation system)

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

**Phase 1 (smoke test gate -- must pass before Phase 2 begins):**
- [ ] Azure/Entra setup steps documented in `docs/OAUTH-SETUP.md`
- [ ] Manifest includes `webApplicationInfo` with correct structure
- [ ] OAuth connection name configurable via config.json / env var
- [ ] ADO organizations configurable as a list in config.json / env vars
- [ ] User token and signin callback from Teams SDK context are available to tool handlers
- [ ] `graph_profile` tool works end-to-end (returns real user profile data)
- [ ] `ado_work_items` tool works end-to-end with organization parameter (returns real work items)
- [ ] On-demand signin flow works: tool returns auth-needed, LLM explains, signin card appears
- [ ] `graph_profile` and `ado_work_items` only appear on Teams channel, not CLI
- [ ] 100% test coverage on all Phase 1 code
- [ ] All tests pass, no warnings

**Phase 2:**
- [ ] Graph client has methods for all read endpoints (profile, emails, calendar, files, Teams messages, search)
- [ ] ADO client has methods for all read endpoints (work items, repos, PRs, pipelines)
- [ ] All 10 read tools defined and functional
- [ ] All read tools only available on Teams channel
- [ ] 100% test coverage on all Phase 2 code
- [ ] All tests pass, no warnings

**Phase 3:**
- [ ] All 6 write tools defined and functional
- [ ] Harness-level confirmation system blocks all write tools until user confirms
- [ ] Confirmation system is enforced in the agent loop (not just in prompting)
- [ ] Confirmation state persisted in session across messages
- [ ] 100% test coverage on all Phase 3 code
- [ ] All tests pass, no warnings

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
- **Harness-level confirmation for writes ("muscle memory")**: All write/mutating tool calls are intercepted in the agent loop before execution. The harness pauses, sends the proposed action details to the user via the stream, and waits for explicit confirmation before executing. This is enforced at the code level in `core.ts`, not via prompt engineering. The LLM cannot bypass this. Implementation: write tools are tagged with a `requiresConfirmation` flag; the tool execution loop in `runAgent` checks this flag and delegates to a `ChannelCallbacks.onConfirmAction` callback that handles the UX. (Phase 3)
- **Channel-conditional tools built on existing infrastructure**: `runAgent` already receives `channel` as its third parameter (line 155 of `core.ts`) and uses it for system prompt building (line 165-167). Tools are currently a flat static array (`tools` in `tools.ts` line 6) selected on line 187 of `core.ts`. We extend this by replacing the static `tools` import with a `getToolsForChannel(channel)` call that returns base tools for CLI and base + Graph/ADO tools for Teams. The `channel` parameter is already threaded through -- we only need to use it for tool selection too.
- **Multi-org ADO support**: Instead of a single `ado.organization` string, config stores a list of organizations. Config shape: `ado: { organizations: ["org1", "org2"] }`. ADO tools accept an `organization` parameter so the LLM can target a specific org. The tool description lists available orgs from config. Env var: `ADO_ORGANIZATIONS` (comma-separated). Config interface: `AdoConfig { organizations: string[] }`.
- **Tool output format**: Summarized human-readable text with key fields (not raw JSON). Keeps token usage efficient while giving the LLM enough to answer.
- **Phased delivery**: Phase 1 = smoke test (2 tools, prove OAuth works end-to-end), Phase 2 = all read tools, Phase 3 = write tools + confirmation system. Each phase must be fully complete and tested before the next begins.
- Use the Teams AI Library v2's built-in OAuth support (`ctx.signin()`, `ctx.userToken`, `ctx.userGraph`) rather than implementing custom OAuth
- The SDK's `app.process.js` already calls `getUserToken` on every activity and populates `isSignedIn` and `userToken` on the context -- we need to thread this through to tool handlers
- ADO calls will use raw fetch with the user's token against the ADO REST API (`https://dev.azure.com/{org}/_apis/...`)
- The `handleTeamsMessage` function in `teams.ts` needs to be refactored to receive the full activity context (including `userToken`, `isSignedIn`, `signin()`) so these are available to tool handlers
- Graph calls can use the SDK's `userGraph` (GraphClient from `@microsoft/teams.graph`) for standard endpoints, or raw fetch with `userToken` for flexibility
- The `execTool` function signature needs to accept an optional `ToolContext` parameter that provides `userToken`, `signin`, `isSignedIn`, and `adoOrganizations` to Graph/ADO tool handlers

### Tool List

**Phase 1 (smoke test -- 2 tools):**
1. `graph_profile` -- get user profile (name, email, job title, etc.)
2. `ado_work_items` -- query/list work items (params: organization, query, project, ids)

**Phase 2 (remaining read tools -- 8 more):**
3. `graph_emails` -- list/search emails (params: folder, query, count)
4. `graph_calendar` -- list calendar events (params: start, end, count)
5. `graph_files` -- list/search files in OneDrive/SharePoint (params: path, query)
6. `graph_teams_messages` -- list recent messages in a Teams channel/chat (params: chatId, count)
7. `graph_search` -- search across Microsoft 365 content (params: query, entity types)
8. `ado_repos` -- list repos or get repo details (params: organization, project, repoName)
9. `ado_pull_requests` -- list/get PRs (params: organization, project, repo, status)
10. `ado_pipelines` -- list/get pipeline runs (params: organization, project, pipelineId)

**Phase 3 (write tools -- 6 more):**
11. `graph_send_email` -- send an email (params: to, subject, body) [REQUIRES CONFIRMATION]
12. `graph_create_event` -- create a calendar event (params: subject, start, end, attendees) [REQUIRES CONFIRMATION]
13. `graph_upload_file` -- upload a file to OneDrive/SharePoint (params: path, content) [REQUIRES CONFIRMATION]
14. `ado_create_work_item` -- create a work item (params: organization, project, type, title, description, assignedTo) [REQUIRES CONFIRMATION]
15. `ado_update_work_item` -- update a work item (params: organization, id, fields to update) [REQUIRES CONFIRMATION]
16. `ado_create_pr_comment` -- add a comment to a PR (params: organization, project, repo, prId, comment) [REQUIRES CONFIRMATION]

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

### Write Confirmation Flow Detail ("Muscle Memory") -- Phase 3

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

**Phase 1 changes:**
1. **`src/config.ts`**: Add `AdoConfig` interface with `organizations: string[]` field, add `ado` to `OuroborosConfig`, add `getAdoConfig()` function, env var `ADO_ORGANIZATIONS` (comma-separated)
2. **`src/engine/tools.ts`**: Add `ToolContext` interface (userToken, isSignedIn, signin callback, adoOrganizations), modify `ToolHandler` type to accept optional `ToolContext`, modify `execTool` to accept optional context and pass it through, add `getToolsForChannel(channel)` that returns base `tools` for CLI and `[...tools, ...graphAdoTools]` for Teams. Note: currently `tools` is a flat static `const` array (line 6) and `activeTools` is built from it on line 187 of `core.ts` -- we replace this with the dynamic `getToolsForChannel` call.
3. **`src/engine/core.ts`**: Add `toolContext` to `RunAgentOptions`, replace `tools` import with `getToolsForChannel(channel)` call on line 187, pass `toolContext` through to `execTool` in the tool execution loop (lines 306-344)
4. **`src/channels/teams.ts`**: Refactor `app.on("message")` handler (line 203) to destructure `isSignedIn`, `userToken`, `signin` from context. Refactor `handleTeamsMessage` signature to accept a `TeamsMessageContext` object that includes these plus text/stream/conversationId. Build `ToolContext` and pass to `runAgent` via options.
5. **New `src/engine/graph-client.ts`**: Minimal Graph client -- `getProfile(token)` method only for Phase 1
6. **New `src/engine/ado-client.ts`**: Minimal ADO client -- `queryWorkItems(token, org, query)` method only for Phase 1
7. **`manifest/manifest.json`**: Add `webApplicationInfo` section
8. **New `docs/OAUTH-SETUP.md`**: Azure/Entra setup instructions

**Phase 2 changes:**
9. **`src/engine/graph-client.ts`**: Add remaining read methods (getEmails, getCalendar, getFiles, getTeamsMessages, search)
10. **`src/engine/ado-client.ts`**: Add remaining read methods (getRepos, getPullRequests, getPipelines)
11. **`src/engine/tools.ts`**: Add remaining 8 read tool definitions and handlers

**Phase 3 changes:**
12. **`src/engine/tools.ts`**: Add 6 write tool definitions with `requiresConfirmation` metadata, add write handlers to Graph/ADO clients
13. **`src/engine/core.ts`**: Add `onConfirmAction` to `ChannelCallbacks`, add confirmation interception in tool execution loop -- check `requiresConfirmation` flag before `execTool`, delegate to callback, handle pending/confirmed/cancelled states
14. **`src/channels/teams.ts`**: Implement `onConfirmAction` callback in `createTeamsCallbacks` -- send confirmation card, persist pending state in session
15. **`src/engine/graph-client.ts`**: Add write methods (sendEmail, createEvent, uploadFile)
16. **`src/engine/ado-client.ts`**: Add write methods (createWorkItem, updateWorkItem, createPrComment)

## Context / References
- `src/channels/teams.ts` -- Teams adapter; line 203 `app.on("message", async ({ stream, activity })` needs to also destructure `isSignedIn`, `userToken`, `signin` from the `IActivityContext`
- `src/engine/core.ts` -- agent loop; line 155 `channel` already passed to `runAgent`, line 165-167 used for system prompt; line 187 `activeTools` built from static `tools` import -- this is where `getToolsForChannel(channel)` replaces it; lines 306-344 tool execution loop is where `ToolContext` is passed to `execTool` and where confirmation interception goes (Phase 3)
- `src/engine/tools.ts` -- line 6 `tools` is a flat static `const` array; line 140 `ToolHandler` type is `(args) => string | Promise<string>` -- needs optional `ToolContext` param; line 253 `execTool` passes through to handlers
- `src/config.ts` -- `OuroborosConfig` (line 30) needs `ado: AdoConfig` added; follows same pattern as `getTeamsConfig()` for env var overrides
- `manifest/manifest.json` -- Teams app manifest (v1.25, has copilot scope)
- `node_modules/@microsoft/teams.apps/dist/contexts/activity.d.ts` -- `IActivityContext` with `signin()`, `signout()`, `isSignedIn`, `userToken`, `userGraph`
- `node_modules/@microsoft/teams.apps/dist/oauth.d.ts` -- `OAuthSettings` with `defaultConnectionName` (defaults to `graph`)
- `node_modules/@microsoft/teams.graph/dist/index.d.ts` -- `GraphClient` with `call()` method
- Teams AI Library v2 handles token exchange/verify state automatically via `app.oauth.js`
- Graph API: `https://graph.microsoft.com/v1.0/me`, `/me/messages`, `/me/calendarview`, `/me/drive/root/children`
- ADO REST API: `https://dev.azure.com/{org}/_apis/wit/wiql`, `/_apis/git/repositories`, `/_apis/git/pullrequests`, `/_apis/pipelines`

## Notes
The SDK's `app.process.js` automatically attempts `getUserToken` on every inbound activity. If the user has previously consented and a valid token is cached, `userToken` is populated and `isSignedIn` is true. If not, `userToken` is undefined and `isSignedIn` is false. The `ctx.signin()` method sends an OAuth card to the user prompting for consent.

The `app.on("message")` callback receives an `IActivityContext` which includes `signin`, `signout`, `isSignedIn`, `userToken`, `userGraph`, `stream`, `activity`, `send`, `reply`. Currently only `stream` and `activity` are destructured (line 203 of `teams.ts`).

For the confirmation system (Phase 3), the key challenge is that the agent loop is synchronous within a single message turn. The confirmation needs to break out of the loop, persist state, and resume on the next message. The session state tracks a pending confirmation, and the next user message is intercepted to check for yes/no before being passed to the LLM.

## Progress Log
- 2026-02-27 12:32 Created
- 2026-02-27 12:33 Initial commit
- 2026-02-27 12:39 Finalized with user decisions: single OAuth, muscle memory, channel-conditional tools, 16 tools
