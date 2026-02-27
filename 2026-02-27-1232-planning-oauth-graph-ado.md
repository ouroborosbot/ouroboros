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
- Configure two OAuth connection names (`graph` and `ado`) in config, both configurable
- Thread two tokens (`graphToken`, `adoToken`) and a `signin(connectionName)` callback from the Teams activity context through to tool handlers
- Minimal Graph client: one method (`getProfile`)
- Minimal ADO client: one method (`queryWorkItems`)
- Two tools only: `graph_profile` and `ado_work_items`
- On-demand signin flow per connection (tool detects missing token for its service, returns `AUTH_REQUIRED` for that specific connection, LLM explains, signin card presented with the correct connection name)
- Channel-conditional tool registration (these two tools only appear on Teams channel)
- ADO multi-org config (list of organizations in config, `organization` param on ADO tool)
- Error handling: 401/403/429 mapped to LLM-readable messages, no silent retries
- Unit tests for all Phase 1 code
- Manual smoke test: run locally with dev tunnel, sign in to both connections, verify `graph_profile` returns real data, verify `ado_work_items` returns real data

**Phase 2 -- Full Read Tools**
- Full Graph client with methods for all read endpoints
- Full ADO client with methods for all read endpoints
- All 10 read tools wired and functional
- Unit tests for all Phase 2 code

**Phase 3 -- Write Tools + Muscle Memory**
- All 6 write tools
- Harness-level "muscle memory" confirmation system: agent loop intercepts write tools, presents action to user, waits for explicit consent before executing
- Confirmation state persisted using the SDK's `IStorage` interface (available on `App` constructor and activity context)
- Unit tests for all Phase 3 code (including confirmation system)

### Out of Scope
- Actually performing the Azure portal / Entra setup (that's a manual step, we document it)
- Admin consent flows or multi-tenant support
- Caching/refreshing tokens (the SDK handles this)
- Graph API calls using app-only permissions (we use delegated/user tokens only)
- UI customization of the OAuth card
- Rate limiting or throttling for Graph/ADO calls (we report 429 to the LLM but don't retry)
- Proactive messaging (bot-initiated, not user-initiated)
- Proactive signin on first message (signin is on-demand only)
- CLI channel support for Graph/ADO tools (Teams only)
- Deployment to Azure (managed identity, different tenant, Azure Bot Service hosting) -- local dev only
- Managed identity authentication -- only client secret auth (existing app registration)

## Completion Criteria

**Phase 1 (smoke test gate -- must pass before Phase 2 begins):**
- [ ] Azure/Entra setup steps documented in `docs/OAUTH-SETUP.md`
- [ ] Manifest includes `webApplicationInfo` with correct structure
- [ ] Two OAuth connection names (`graph`, `ado`) configurable via config.json / env vars
- [ ] ADO organizations configurable as a list in config.json / env vars
- [ ] `graphToken` and `adoToken` from Teams SDK context are available to tool handlers independently
- [ ] `graph_profile` tool works end-to-end (returns real user profile data)
- [ ] `ado_work_items` tool works end-to-end with organization parameter (returns real work items)
- [ ] On-demand signin flow works per connection: tool returns auth-needed for its specific connection, LLM explains, signin card appears with correct connection name
- [ ] `graph_profile` and `ado_work_items` only appear on Teams channel, not CLI
- [ ] Error handling: 401 triggers re-signin, 403 reports permission denied, 429 reports throttled
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
- [ ] Confirmation state persisted via SDK `IStorage` across messages
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
- **Two OAuth connections**: Graph and ADO use different token audiences (`https://graph.microsoft.com` vs `https://app.vso.com`). Two separate OAuth connections on the Azure Bot resource: `graph` (for Graph scopes) and `ado` (for ADO scopes). Both connection names are configurable via config/env vars. `ToolContext` carries two optional tokens: `graphToken` and `adoToken`. Each tool knows which token it needs; if its token is missing, it returns `AUTH_REQUIRED` for that specific connection. `ctx.signin({ connectionName })` is called with the right connection name. The SDK's default `getUserToken` (in `app.process.js` line 21) only fetches the default connection's token -- we fetch tokens for both connections explicitly in the message handler.
- **On-demand signin with LLM explanation, per connection**: When a Graph tool is called without `graphToken`, it returns `AUTH_REQUIRED:graph` with context about what it wants to do. Same for ADO tools and `adoToken`. The LLM explains to the user why signin is needed for that specific service. The signin card targets the correct OAuth connection. The user may need to sign in twice (once for Graph, once for ADO) if they use tools from both services.
- **Read AND write permissions**: Graph scopes include read and write (`Mail.ReadWrite`, `Calendars.ReadWrite`, etc.). ADO scopes include read and write (`vso.work_write`, `vso.code_write`, etc.).
- **Harness-level confirmation for writes ("muscle memory")**: All write/mutating tool calls are intercepted in the agent loop before execution. The harness pauses, sends the proposed action details to the user via the stream, and waits for explicit confirmation before executing. This is enforced at the code level in `core.ts`, not via prompt engineering. The LLM cannot bypass this. Implementation: write tools are tagged with a `requiresConfirmation` flag; the tool execution loop in `runAgent` checks this flag and delegates to a `ChannelCallbacks.onConfirmAction` callback that handles the UX. (Phase 3)
- **Channel-conditional tools built on existing infrastructure**: `runAgent` already receives `channel` as its third parameter (line 155 of `core.ts`) and uses it for system prompt building (line 165-167). Tools are currently a flat static array (`tools` in `tools.ts` line 6) selected on line 187 of `core.ts`. We extend this by replacing the static `tools` import with a `getToolsForChannel(channel)` call that returns base tools for CLI and base + Graph/ADO tools for Teams. The `channel` parameter is already threaded through -- we only need to use it for tool selection too.
- **Multi-org ADO support**: Config stores a list of organizations. Config shape: `ado: { organizations: ["org1", "org2"], connectionName: "ado" }`. ADO tools accept an `organization` parameter so the LLM can target a specific org. The tool description lists available orgs from config. Env var: `ADO_ORGANIZATIONS` (comma-separated). Config interface: `AdoConfig { organizations: string[], connectionName: string }`.
- **Error handling strategy -- no silent retries**: All API errors are returned as LLM-readable messages so the LLM can communicate them to the user. 401 (Unauthorized) returns `AUTH_REQUIRED` (same as missing token, triggers re-signin flow). 403 (Forbidden) returns "permission denied: you don't have access to [resource]. ask your admin to grant [scope]." 429 (Too Many Requests) returns "throttled: Microsoft is rate-limiting requests. try again in a moment." All other errors return a brief error description. No silent retries -- the LLM decides whether to retry or explain.
- **Tool output format**: Summarized human-readable text with key fields (not raw JSON). Keeps token usage efficient while giving the LLM enough to answer.
- **Phased delivery**: Phase 1 = smoke test (2 tools, prove OAuth works end-to-end for both connections), Phase 2 = all read tools, Phase 3 = write tools + confirmation system. Each phase must be fully complete and tested before the next begins.
- **Local dev only**: The bot runs locally using the existing app registration with client secret. Dev tunnel is required for the OAuth redirect URI. Deployment to Azure (managed identity, different tenant, Azure Bot Service hosting) is explicitly a separate future effort. No managed identity code in this plan.
- **Session/confirmation state via SDK IStorage**: The `App` constructor accepts an `IStorage` option (confirmed in `app.d.ts` line 71) and the activity context exposes `storage` (confirmed in `contexts/activity.d.ts` line 38). Phase 3 will use this `IStorage` interface to persist pending confirmation state across messages. Default implementation is `LocalStorage` (in-memory Map from `@microsoft/teams.common`).
- Use the Teams AI Library v2's built-in OAuth support (`ctx.signin()`, `ctx.userToken`, `ctx.userGraph`) rather than implementing custom OAuth
- The SDK's `app.process.js` already calls `getUserToken` on every activity but only for the default connection (line 389 of `app.js`: `connectionName: this.oauth.defaultConnectionName`). For two connections, we explicitly fetch tokens for both `graph` and `ado` connections in the message handler using the SDK's `api.users.token.get` API, passing each connection name.
- ADO calls will use raw fetch with the user's ADO token against the ADO REST API (`https://dev.azure.com/{org}/_apis/...`)
- The `handleTeamsMessage` function in `teams.ts` needs to be refactored to receive the full activity context (including tokens for both connections, `signin()`) so these are available to tool handlers
- Graph calls can use the SDK's `userGraph` (GraphClient from `@microsoft/teams.graph`) for standard endpoints, or raw fetch with `graphToken` for flexibility
- The `execTool` function signature needs to accept an optional `ToolContext` parameter that provides `graphToken`, `adoToken`, `signin(connectionName)`, and `adoOrganizations` to Graph/ADO tool handlers

### Tool List

**Phase 1 (smoke test -- 2 tools):**
1. `graph_profile` -- get user profile (name, email, job title, etc.) [needs `graphToken`]
2. `ado_work_items` -- query/list work items (params: organization, query, project, ids) [needs `adoToken`]

**Phase 2 (remaining read tools -- 8 more):**
3. `graph_emails` -- list/search emails (params: folder, query, count) [needs `graphToken`]
4. `graph_calendar` -- list calendar events (params: start, end, count) [needs `graphToken`]
5. `graph_files` -- list/search files in OneDrive/SharePoint (params: path, query) [needs `graphToken`]
6. `graph_teams_messages` -- list recent messages in a Teams channel/chat (params: chatId, count) [needs `graphToken`]
7. `graph_search` -- search across Microsoft 365 content (params: query, entity types) [needs `graphToken`]
8. `ado_repos` -- list repos or get repo details (params: organization, project, repoName) [needs `adoToken`]
9. `ado_pull_requests` -- list/get PRs (params: organization, project, repo, status) [needs `adoToken`]
10. `ado_pipelines` -- list/get pipeline runs (params: organization, project, pipelineId) [needs `adoToken`]

**Phase 3 (write tools -- 6 more):**
11. `graph_send_email` -- send an email (params: to, subject, body) [needs `graphToken`] [REQUIRES CONFIRMATION]
12. `graph_create_event` -- create a calendar event (params: subject, start, end, attendees) [needs `graphToken`] [REQUIRES CONFIRMATION]
13. `graph_upload_file` -- upload a file to OneDrive/SharePoint (params: path, content) [needs `graphToken`] [REQUIRES CONFIRMATION]
14. `ado_create_work_item` -- create a work item (params: organization, project, type, title, description, assignedTo) [needs `adoToken`] [REQUIRES CONFIRMATION]
15. `ado_update_work_item` -- update a work item (params: organization, id, fields to update) [needs `adoToken`] [REQUIRES CONFIRMATION]
16. `ado_create_pr_comment` -- add a comment to a PR (params: organization, project, repo, prId, comment) [needs `adoToken`] [REQUIRES CONFIRMATION]

### Signin Flow Detail (Two Connections)

```
User: "What's on my calendar today?"
  |
  v
LLM decides to call graph_calendar tool
  |
  v
Tool handler checks: graphToken available?
  |
  +-- YES: execute Graph API call, return results
  |
  +-- NO: return structured message:
        "AUTH_REQUIRED:graph -- I need access to your Microsoft 365
         calendar to check today's events. Please sign in when prompted."
        |
        v
      LLM receives this, explains to user:
        "I'd like to check your calendar. To do this, I need you to
         sign in to your Microsoft 365 account."
        |
        v
      Signin card is presented (via ctx.signin({ connectionName: "graph" }))
        |
        v
      User signs in -> SDK handles token exchange -> graphToken cached
        |
        v
      Next user message triggers the tool again, this time with graphToken

---

User: "Show me my open work items in org1"
  |
  v
LLM decides to call ado_work_items tool
  |
  v
Tool handler checks: adoToken available?
  |
  +-- YES: execute ADO API call, return results
  |
  +-- NO: return structured message:
        "AUTH_REQUIRED:ado -- I need access to your Azure DevOps
         account to query work items. Please sign in when prompted."
        |
        v
      ctx.signin({ connectionName: "ado" })
```

Note: if a user asks something that requires both Graph and ADO in one turn, the LLM may call tools needing different tokens. If one token is missing, that tool returns `AUTH_REQUIRED` for its connection while the other tool executes normally. The LLM can explain which service still needs signin.

### Error Handling

All API errors are returned as LLM-readable messages. No silent retries.

| HTTP Status | Tool Returns | LLM Action |
|---|---|---|
| 401 Unauthorized | `AUTH_REQUIRED:{connection}` -- same as missing token | Explains to user, triggers `signin({ connectionName })` |
| 403 Forbidden | `PERMISSION_DENIED: You don't have access to [resource]. Your admin may need to grant [scope].` | Relays to user |
| 429 Too Many Requests | `THROTTLED: Microsoft is rate-limiting requests. Try again in a moment.` | Tells user to wait and retry |
| 5xx Server Error | `SERVICE_ERROR: [service] is temporarily unavailable.` | Relays to user |
| Network/timeout | `NETWORK_ERROR: Could not reach [service].` | Relays to user |

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

The confirmation callback on the Teams channel sends the action summary via `stream.emit()` / `stream.update()`, then waits for the next user message in the conversation. This requires the agent loop to yield control back and resume when the user responds. Implementation approach: the write tool returns a "pending_confirmation" status, the agent loop breaks, the confirmation state is persisted in the SDK's `IStorage` (accessible via `ctx.storage`), and the next incoming message is checked for confirmation before resuming the agent.

### Architecture Changes Summary

**Phase 1 changes:**
1. **`src/config.ts`**: Add `AdoConfig` interface with `organizations: string[]` and `connectionName: string` fields. Add `OAuthConfig` interface with `graphConnectionName: string` and `adoConnectionName: string`. Add `ado` and `oauth` to `OuroborosConfig`. Add `getAdoConfig()` and `getOAuthConfig()` functions. Env vars: `ADO_ORGANIZATIONS` (comma-separated), `OAUTH_GRAPH_CONNECTION` (default `graph`), `OAUTH_ADO_CONNECTION` (default `ado`).
2. **`src/engine/tools.ts`**: Add `ToolContext` interface (`graphToken?: string`, `adoToken?: string`, `signin: (connectionName: string) => Promise<string | undefined>`, `adoOrganizations: string[]`). Modify `ToolHandler` type to accept optional `ToolContext`. Modify `execTool` to accept optional context and pass it through. Add `getToolsForChannel(channel)` that returns base `tools` for CLI and `[...tools, ...graphAdoTools]` for Teams. Note: currently `tools` is a flat static `const` array (line 6) and `activeTools` is built from it on line 187 of `core.ts` -- we replace this with the dynamic `getToolsForChannel` call.
3. **`src/engine/core.ts`**: Add `toolContext` to `RunAgentOptions`. Replace `tools` import with `getToolsForChannel(channel)` call on line 187. Pass `toolContext` through to `execTool` in the tool execution loop (lines 306-344).
4. **`src/channels/teams.ts`**: Refactor `app.on("message")` handler (line 203) to access full activity context. Fetch tokens for both connections explicitly using `api.users.token.get({ connectionName })` instead of relying on the SDK's single `userToken`. Refactor `handleTeamsMessage` signature to accept a `TeamsMessageContext` that includes `graphToken`, `adoToken`, `signin(connectionName)`, plus text/stream/conversationId. Build `ToolContext` and pass to `runAgent` via options. Pass `oauth: { defaultConnectionName: "graph" }` to `App` constructor.
5. **New `src/engine/graph-client.ts`**: Minimal Graph client -- `getProfile(token)` method only for Phase 1. Shared error-handling helper that maps HTTP status to `AUTH_REQUIRED`/`PERMISSION_DENIED`/`THROTTLED`/`SERVICE_ERROR`.
6. **New `src/engine/ado-client.ts`**: Minimal ADO client -- `queryWorkItems(token, org, query)` method only for Phase 1. Same shared error-handling helper.
7. **`manifest/manifest.json`**: Add `webApplicationInfo` section.
8. **New `docs/OAUTH-SETUP.md`**: Azure/Entra setup instructions covering both OAuth connections.

**Phase 2 changes:**
9. **`src/engine/graph-client.ts`**: Add remaining read methods (getEmails, getCalendar, getFiles, getTeamsMessages, search).
10. **`src/engine/ado-client.ts`**: Add remaining read methods (getRepos, getPullRequests, getPipelines).
11. **`src/engine/tools.ts`**: Add remaining 8 read tool definitions and handlers.

**Phase 3 changes:**
12. **`src/engine/tools.ts`**: Add 6 write tool definitions with `requiresConfirmation` metadata, add write handlers to Graph/ADO clients.
13. **`src/engine/core.ts`**: Add `onConfirmAction` to `ChannelCallbacks`, add confirmation interception in tool execution loop -- check `requiresConfirmation` flag before `execTool`, delegate to callback, handle pending/confirmed/cancelled states.
14. **`src/channels/teams.ts`**: Implement `onConfirmAction` callback in `createTeamsCallbacks` -- send confirmation message, persist pending state via SDK `IStorage` (`ctx.storage`).
15. **`src/engine/graph-client.ts`**: Add write methods (sendEmail, createEvent, uploadFile).
16. **`src/engine/ado-client.ts`**: Add write methods (createWorkItem, updateWorkItem, createPrComment).

## Context / References
- `src/channels/teams.ts` -- Teams adapter; line 203 `app.on("message", async ({ stream, activity })` needs to access full context including `api`, `signin`, `connectionName`; the SDK's `IActivityContext` provides all of these
- `src/engine/core.ts` -- agent loop; line 155 `channel` already passed to `runAgent`, line 165-167 used for system prompt; line 187 `activeTools` built from static `tools` import -- this is where `getToolsForChannel(channel)` replaces it; lines 306-344 tool execution loop is where `ToolContext` is passed to `execTool` and where confirmation interception goes (Phase 3)
- `src/engine/tools.ts` -- line 6 `tools` is a flat static `const` array; line 140 `ToolHandler` type is `(args) => string | Promise<string>` -- needs optional `ToolContext` param; line 253 `execTool` passes through to handlers
- `src/config.ts` -- `OuroborosConfig` (line 30) needs `ado: AdoConfig` and `oauth: OAuthConfig` added; follows same pattern as `getTeamsConfig()` for env var overrides
- `manifest/manifest.json` -- Teams app manifest (v1.25, has copilot scope)
- `node_modules/@microsoft/teams.apps/dist/contexts/activity.d.ts` -- `IActivityContext` with `signin(options?)`, `signout()`, `isSignedIn`, `userToken`, `userGraph`, `api`, `storage`
- `node_modules/@microsoft/teams.apps/dist/contexts/activity.js` -- line 53: `signin(options)` accepts `{ connectionName }` to target a specific OAuth connection; line 63: falls back to `this.connectionName` if not specified
- `node_modules/@microsoft/teams.apps/dist/app.js` -- line 385: `getUserToken` only fetches for `defaultConnectionName`; for two connections we call `api.users.token.get({ connectionName })` directly
- `node_modules/@microsoft/teams.apps/dist/oauth.d.ts` -- `OAuthSettings` with `defaultConnectionName` (defaults to `graph`)
- `node_modules/@microsoft/teams.apps/dist/app.d.ts` -- `AppOptions.storage?: IStorage` (line 71); `AppOptions.oauth?: OAuthSettings` (line 79)
- `node_modules/@microsoft/teams.common/dist/storage/storage.d.ts` -- `IStorage<TKey, TValue>` with `get`/`set`/`delete`; `LocalStorage` is the default in-memory implementation
- `node_modules/@microsoft/teams.graph/dist/index.d.ts` -- `GraphClient` with `call()` method
- Graph API: `https://graph.microsoft.com/v1.0/me`, `/me/messages`, `/me/calendarview`, `/me/drive/root/children`
- ADO REST API: `https://dev.azure.com/{org}/_apis/wit/wiql`, `/_apis/git/repositories`, `/_apis/git/pullrequests`, `/_apis/pipelines`

## Notes
The SDK's `app.process.js` automatically attempts `getUserToken` on every inbound activity, but only for the default connection (line 389 of `app.js`: `this.oauth.defaultConnectionName`). With two OAuth connections, we set the default to `graph` (since that's the more commonly needed one) and explicitly fetch the ADO token in the message handler using `ctx.api.users.token.get({ channelId, userId, connectionName: "ado" })`. Both tokens are then packaged into `ToolContext` for tool handlers.

The `ctx.signin({ connectionName })` method (activity.js line 53) supports specifying which connection to sign in to. If `connectionName` is omitted, it falls back to `this.connectionName` (the default). This means the on-demand signin flow can target either `graph` or `ado` independently.

For local development: the bot runs with `npm run teams` using the existing app registration (CLIENT_ID, CLIENT_SECRET, TENANT_ID from `.env`). A dev tunnel (e.g., `devtunnel host --port-numbers 3978 --allow-anonymous`) is required for the OAuth redirect URI and Bot Framework messaging endpoint. Both OAuth connections must be configured on the Azure Bot resource in the portal, each with their respective scopes. The dev tunnel URL must be registered as the messaging endpoint on the Azure Bot resource and in `manifest.json` `validDomains`.

For the confirmation system (Phase 3), the SDK's `IStorage` interface (`ctx.storage`) provides cross-request state persistence. The default `LocalStorage` is in-memory (lost on restart), which is acceptable for local dev. The pending confirmation state (tool name, args, tool_call_id) is stored keyed by conversation ID. The next incoming message for that conversation checks for pending confirmation before invoking the LLM. If yes, the tool executes and the result is injected back into the conversation. If no, the pending state is cleared and the user's message is processed normally.

## Progress Log
- 2026-02-27 12:32 Created
- 2026-02-27 12:33 Initial commit
- 2026-02-27 12:39 Finalized with user decisions: single OAuth, muscle memory, channel-conditional tools, 16 tools
- 2026-02-27 12:52 Incorporated feedback: 3-phase structure (smoke test first), multi-org ADO, noted existing channel infrastructure in core.ts
