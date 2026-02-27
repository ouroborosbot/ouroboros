# Planning: OAuth Authentication for Graph API and Azure DevOps API

**Status**: drafting
**Created**: 2026-02-27 12:32

## Goal
Add OAuth/SSO authentication to the Ouroboros Teams bot so the LLM agent can call Microsoft Graph API and Azure DevOps API on behalf of the user, enabling access to emails, calendar, files, Teams messages, user profile, work items, repos/PRs, and pipelines.

## Scope

### In Scope
- Document Azure/Entra app registration setup steps (manual, not code)
- Add `webApplicationInfo` to the Teams manifest
- Configure OAuth connection name in the App constructor
- Thread the user token from the Teams activity context through to the agent loop
- Create a Graph API client utility that uses the user's token from the SDK's `userGraph` or raw token
- Create an ADO API client utility for Azure DevOps REST API calls with the user's token
- Add LLM-callable tools for Graph (emails, calendar, files, Teams messages, user profile) and ADO (work items, repos/PRs, pipelines)
- Wire tools into the existing tool definitions in `src/engine/tools.ts`
- Handle the "not signed in" case: when the bot needs auth but the user hasn't consented, trigger `ctx.signin()` and inform the user
- Unit tests for all new code (auth flow, API clients, tools)
- Document local testing approach (dev tunnels)

### Out of Scope
- Actually performing the Azure portal / Entra setup (that's a manual step, we document it)
- Admin consent flows or multi-tenant support
- Caching/refreshing tokens (the SDK handles this)
- Graph API calls using app-only permissions (we use delegated/user tokens only)
- UI customization of the OAuth card
- Rate limiting or throttling for Graph/ADO calls
- Proactive messaging (bot-initiated, not user-initiated)

## Completion Criteria
- [ ] Azure/Entra setup steps documented in a markdown file
- [ ] Manifest includes `webApplicationInfo` with correct structure
- [ ] OAuth connection name configurable via config.json / env var
- [ ] User token from Teams SDK context is available to the agent's tool handlers
- [ ] Graph API client utility exists and can make authenticated calls
- [ ] ADO API client utility exists and can make authenticated calls
- [ ] At least these tools are available to the LLM: `graph_user_profile`, `graph_emails`, `graph_calendar`, `graph_files`, `ado_work_items`, `ado_pull_requests`
- [ ] When user is not signed in and a Graph/ADO tool is called, the bot triggers signin and informs the user
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
- [ ] What should the OAuth connection name be? The SDK defaults to `graph` -- should we use one connection for both Graph and ADO, or separate connections? (ADO typically needs a different resource/scope)
- [ ] For ADO: should the bot use the same Entra app registration with ADO scopes added, or a separate OAuth connection? ADO uses `499b84ac-1321-427f-aa17-267ca6975798` as its resource ID
- [ ] What specific Graph scopes are needed? Suggested: `User.Read`, `Mail.Read`, `Calendars.Read`, `Files.Read.All`, `Chat.Read`, `Sites.Read.All`
- [ ] What specific ADO scopes are needed? Suggested: `vso.work` (work items), `vso.code` (repos/PRs), `vso.build` (pipelines)
- [ ] Should the bot proactively prompt for signin on first message, or only when a Graph/ADO tool is actually needed?
- [ ] Is there an ADO organization URL that should be configurable (e.g., `https://dev.azure.com/{org}`)?
- [ ] Should tool results include raw JSON or should they be formatted as human-readable text for the LLM?

## Decisions Made
- Use the Teams AI Library v2's built-in OAuth support (`ctx.signin()`, `ctx.userToken`, `ctx.userGraph`) rather than implementing custom OAuth
- The SDK's `app.process.js` already calls `getUserToken` on every activity and populates `isSignedIn` and `userToken` on the context -- we need to thread this through to tool handlers
- Graph calls can use the SDK's `userGraph` (GraphClient from `@microsoft/teams.graph`) for standard endpoints, plus raw fetch for any custom calls
- ADO calls will use raw fetch with the user's token against the ADO REST API
- Tools will be added to the existing `tools` array in `src/engine/tools.ts` following the established pattern
- The `handleTeamsMessage` function in `teams.ts` needs to be refactored to receive the full activity context (not just `text`, `stream`, `conversationId`) so that `userToken` and `isSignedIn` are available

## Context / References
- `src/channels/teams.ts` -- Teams adapter, `handleTeamsMessage`, `createTeamsCallbacks`, `startTeamsApp`
- `src/engine/core.ts` -- agent loop (`runAgent`), `ChannelCallbacks` interface
- `src/engine/tools.ts` -- tool definitions (`tools` array), `execTool`, `toolHandlers`
- `src/config.ts` -- configuration loading, `getTeamsConfig`, `loadConfig`
- `manifest/manifest.json` -- Teams app manifest (v1.25, has copilot scope)
- `node_modules/@microsoft/teams.apps/dist/app.d.ts` -- App class with `oauth` option, `getUserToken`, `graph` property
- `node_modules/@microsoft/teams.apps/dist/contexts/activity.d.ts` -- `IActivityContext` with `signin()`, `signout()`, `isSignedIn`, `userToken`, `userGraph`
- `node_modules/@microsoft/teams.apps/dist/oauth.d.ts` -- `OAuthSettings` with `defaultConnectionName`
- `node_modules/@microsoft/teams.graph/dist/index.d.ts` -- `GraphClient` with `call()` method
- Teams AI Library v2 handles token exchange/verify state automatically via `app.oauth.js`

## Notes
The SDK's `app.process.js` automatically attempts `getUserToken` on every inbound activity. If the user has previously consented and a valid token is cached, `userToken` is populated and `isSignedIn` is true. If not, `userToken` is undefined and `isSignedIn` is false. The `ctx.signin()` method sends an OAuth card to the user prompting for consent. After consent, the SDK emits a `signin` event with the token.

Key architecture change: currently `handleTeamsMessage(text, stream, conversationId)` receives only basic args. The `app.on("message")` handler has access to the full `ctx` (activity context) which includes `userToken`, `isSignedIn`, `userGraph`, and `signin()`. We need to thread relevant parts through.

## Progress Log
- 2026-02-27 12:32 Created
