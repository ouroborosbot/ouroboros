# Planning: WU1.5 -- Bot Registration, Dev Tunnels, Real Teams Surface

**Status**: drafting
**Created**: 2026-02-23

## Goal

Connect the ouroboros agent to real Teams -- move from the DevtoolsPlugin playground (WU1) to actual Teams chat. Register an Azure Bot, set up dev tunnels for local development, create an app manifest, and verify streaming works in both 1:1 Teams chat and Microsoft 365 Copilot Chat (Custom Engine Agent).

## Scope

### In Scope

- Install and configure Azure CLI (`az`) for the user's Azure subscription
- Register an Azure Bot Service resource via `az` CLI (App ID, client secret)
- Install and configure Microsoft Dev Tunnels CLI (`devtunnel`) for macOS
- Create a persistent named dev tunnel forwarding to `localhost:3978`
- Update `teams.ts` to support both DevtoolsPlugin (local dev) and real Bot Service (production) modes, switched by environment variables
- Configure the `App` constructor with `clientId`, `clientSecret`, `tenantId` from environment (the SDK reads `CLIENT_ID`, `CLIENT_SECRET`, `TENANT_ID` env vars automatically)
- Create Teams app manifest (`manifest.json`) with:
  - Bot registration (`bots[]` with `botId`, `personal` scope)
  - Custom Engine Agent declaration (`copilotAgents.customEngineAgents[]` -- requires `devPreview` manifest version)
  - App icons (color 192x192, outline 32x32 -- simple placeholder icons for now)
- Sideload the app into the user's Teams tenant (via Teams admin or developer portal)
- Verify streaming works end-to-end in 1:1 Teams bot chat (informative updates + response streaming)
- Verify the agent appears and works in Microsoft 365 Copilot Chat as a Custom Engine Agent
- Add a `teams:dev` npm script that starts the tunnel + bot together for local development
- Streaming buffer/throttle: ensure text chunks are buffered to respect the 1 req/sec throttle (Teams constraint) -- the current `stream.emit()` per token will likely hit rate limits
- Handle the "stop streaming" signal from Teams (user clicks stop button) -- currently not handled
- 100% test coverage on all new code
- All tests pass
- No warnings

### Out of Scope

- Multi-user session handling (WU2 -- still uses single global messages array)
- Azure VM deployment (WU3)
- OAuth/SSO for the bot (auth is "everyone in the tenant" for now)
- Adaptive cards or rich formatting (plain text streaming only, same as WU1)
- Production-grade app icons or branding
- App store / org-wide publishing (sideloading only)
- Modifying the core agentic loop or tool handlers

## Completion Criteria

- [ ] Azure Bot Service resource exists with App ID and client secret
- [ ] Dev tunnel is configured and persistent (same URL across sessions)
- [ ] Bot messaging endpoint is set to `https://<tunnel-url>/api/messages`
- [ ] `teams.ts` works in both DevtoolsPlugin mode (no env vars) and real bot mode (with `CLIENT_ID`, `CLIENT_SECRET`, `TENANT_ID`)
- [ ] App manifest is valid and sideloaded into Teams
- [ ] Sending a message in 1:1 Teams bot chat triggers the agent and streams a response
- [ ] Sending a message via Copilot Chat (CEA) triggers the agent and streams a response
- [ ] Informative updates appear during tool execution in both surfaces
- [ ] Streaming respects the 1 req/sec throttle (buffered, not per-token)
- [ ] Stop-streaming signal from Teams is handled gracefully
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

- [ ] The installed Teams SDK manifest type (`@microsoft/teams.apps` v2.0.5) defines `copilotAgents` with only `declarativeAgents`, not `customEngineAgents`. The `customEngineAgents` field requires `devPreview` manifest version. Do we need to upgrade the SDK, or can we use a manually-crafted manifest.json file outside the SDK's type system?
- [ ] Does the `IStreamer` interface in the SDK automatically handle the streaming protocol (streamId, streamSequence, informative vs streaming types), or do we need to implement the REST API protocol manually when not using ActionPlanner?
- [ ] The streaming docs say "streaming is not available with function calling" -- this refers to the Teams SDK's built-in ActionPlanner function calling. Need to confirm our custom loop approach (calling tools ourselves, streaming text ourselves) is not affected by this limitation.
- [ ] What Teams tenant/M365 license does the user have? Copilot Chat CEA support requires Microsoft 365 Copilot licenses.
- [ ] Does the dev tunnel need to be HTTPS with a trusted cert, or does the Teams service accept the dev tunnel's auto-generated HTTPS?

## Decisions Made

- **Support both surfaces**: The bot will appear in both 1:1 Teams chat and Copilot Chat (CEA). Same bot, same code -- the manifest declares both `bots[]` and `copilotAgents.customEngineAgents[]`.
- **CEA is the recommended model**: Microsoft's current guidance positions Custom Engine Agents as the way to bring your own LLM/orchestration into M365 Copilot. We align with this.
- **Streaming is supported in both**: Streaming works in 1:1 chats (both Teams and Copilot Chat, since CEA interactions are 1:1). The constraint "only for one-on-one chats" does not block us.
- **Dev tunnels (not ngrok)**: Use Microsoft Dev Tunnels (`devtunnel` CLI) for local development. Persistent named tunnel so the URL stays the same across sessions.
- **Environment-variable-driven mode switching**: No env vars = DevtoolsPlugin mode (existing WU1 behavior). Set `CLIENT_ID` + `CLIENT_SECRET` + `TENANT_ID` = real bot mode. No code changes needed to switch.
- **Azure CLI for all setup**: Bot registration, resource group creation, and all Azure operations done via `az` CLI commands so the agent can automate them.
- **Manifest version `devPreview`**: Required for `copilotAgents.customEngineAgents[]`. The SDK's built-in manifest type only supports 1.19 with `declarativeAgents`, so we'll need to handle the manifest file separately or extend the type.

## Context / References

- Predecessor: WU1 doing doc `/Users/microsoft/code/ouroboros/docs/2026-02-23-1456-doing-wu1-teams-bot-local.md` (completed)
- Current Teams adapter: `/Users/microsoft/code/ouroboros/src/teams.ts` (114 lines, DevtoolsPlugin only)
- Teams SDK App constructor: accepts `clientId`, `clientSecret`, `tenantId` (falls back to `CLIENT_ID`, `CLIENT_SECRET`, `TENANT_ID` env vars) -- from `@microsoft/teams.apps` v2.0.5 type defs
- Teams SDK IStreamer interface: `emit(activity)`, `update(text)`, `close()` -- `/Users/microsoft/code/ouroboros/node_modules/@microsoft/teams.apps/dist/types/streamer.d.ts`
- Streaming docs: https://learn.microsoft.com/en-us/microsoftteams/platform/bots/streaming-ux -- covers REST API protocol (streamId, streamSequence, informative/streaming/final types), 1 req/sec throttle, 2-minute time limit, content must be append-only
- CEA UX features: https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/ux-custom-engine-agent -- streaming, citations, AI labels, feedback loop all supported
- CEA overview: https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/overview-custom-engine-agent
- Adding CEA to Copilot Chat: https://www.developerscantina.com/p/copilot-chat-custom-engine-agents/ -- manifest requires `devPreview` version, add `copilotAgents.customEngineAgents[{type:"bot", id:"<botId>"}]`
- Azure Bot CLI: https://learn.microsoft.com/en-us/cli/azure/bot -- `az bot create --app-type SingleTenant --appid <id> --name <name> --resource-group <rg>`
- Dev tunnels debug guide: https://learn.microsoft.com/en-us/azure/bot-service/bot-service-debug-channel-devtunnel -- `devtunnel host -p 3978 --protocol http --allow-anonymous`
- Streaming constraints: 1:1 chats only, 1 req/sec throttle, 2-minute time limit, content must be append-only, informative messages max 1KB/1000 chars
- `StreamingResponse` class (Custom Planner section): `queueInformativeUpdate()`, `queueTextChunk()`, `endStream()` -- for custom model/planner development
- Manifest `CopilotAgents` type in SDK: currently only has `declarativeAgents[]`, NOT `customEngineAgents[]` -- SDK type needs extending or manifest crafted manually

## Notes

Key technical observations from research:

- The `App` constructor in Teams SDK v2 automatically reads `CLIENT_ID`, `CLIENT_SECRET`, `TENANT_ID` from environment. When none are set and DevtoolsPlugin is provided, it works in local-only mode. This means our mode-switching can be purely environment-driven.

- The streaming REST API protocol requires: (1) start with `type: "typing"` + `streamInfo` entity with `streamSequence: 1`, get back `streamId`; (2) continue with incrementing `streamSequence`, referencing `streamId`; (3) final message uses `type: "message"` + `streamType: "final"` with NO `streamSequence`. The `IStreamer` interface in the SDK likely abstracts this, but we need to verify.

- Current `teams.ts` calls `stream.emit(output)` for every text chunk from the model. At LLM token speeds (~50-100 tokens/sec), this would blow past the 1 req/sec throttle. We need a buffering layer that accumulates chunks and flushes at most once per ~1.5-2 seconds.

- Streaming content must be append-only -- each `stream.emit()` must contain all previous content plus new content. Our current implementation sends incremental chunks, not cumulative text. This needs to change.

- The stop-streaming error (`403 ContentStreamNotAllowed "Content stream was canceled by user"`) needs to be caught so the agent stops generating when a user clicks the stop button.

## Progress Log

