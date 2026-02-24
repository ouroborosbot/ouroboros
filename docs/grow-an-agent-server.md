# Grow an Agent Server

Deploy a self-modifying coding agent (the Ouroboros pattern) as a Teams bot so people can chat with it. It lives on an Azure server with full file system and shell access, so it can read code, write code, run builds, and evolve itself through conversation — just like it does locally, but accessible to anyone in Teams.

Bonus: run two instances side by side so they can fix each other when one breaks itself.

## Scope

### In scope
- A working agent (agentic loop, streaming, tools, skills) running as a persistent process on Azure
- Teams bot that lets users chat with the agent in natural conversation
- The agent has full access to its own repo — can read, write, build, commit, and restart itself
- Multi-user: multiple people can talk to it (sequentially or with basic session handling)
- Process manager for auto-restart and health checks

### Bonus: dual agents
- Second instance in its own repo on the same server
- Each can shell into the other's directory to diagnose and fix issues
- Safety net: if one breaks itself, a human can ask the other to fix it

### Out of scope (for now)
- Agents autonomously fixing each other without human prompting
- Auto-scaling or multi-server
- Public internet access — Teams only

## Open questions

- Azure VM vs Container Apps? (VM is simpler and gives full shell access, containers add complexity for isolation we don't need yet)
- Auth: who can talk to the bot? Everyone in the tenant? Specific team/channel?
- Do both agent instances share the same model/provider or can they differ?

---

# Work Units

## 1. Teams bot ↔ agent locally (DevtoolsPlugin playground)

**Status**: Planning
**Planning doc**: [2026-02-23-1456-planning-wu1-teams-bot-local.md](2026-02-23-1456-planning-wu1-teams-bot-local.md)
**Doing doc**: [2026-02-23-1456-doing-wu1-teams-bot-local.md](2026-02-23-1456-doing-wu1-teams-bot-local.md)

Get the Ouroboros core running behind a Teams bot adapter locally. Prove the interface works — send a message in the DevtoolsPlugin chat UI, get a streamed response from the agent with tool call updates.

### Architecture

```
                 ┌─────────────────┐
  stdin/stdout ──┤  CLI adapter     │──┐
                 │  (main.ts)       │  │    ┌────────────────────┐
                 └─────────────────┘  ├────┤  Ouroboros core     │
                                      │    │  (core.ts)          │
                 ┌─────────────────┐  │    │  - runAgent()       │
  DevtoolsPlugin─┤  Teams adapter  │──┘    │  - streamResponse() │
  (WU1)          │  (bot/index.ts) │       │  - tool handlers    │
                 └─────────────────┘       │  - skills           │
                                           └────────────────────┘
```

### Locked decisions

**SDK — Teams SDK v2 (comms-only)**
- Use `@microsoft/teams.apps` (v2.0.5) for bot scaffolding, `@microsoft/teams.dev` with `DevtoolsPlugin` for local dev
- Do NOT use the AI planner (`ActionPlanner`, `OpenAIModel`) — Ouroboros keeps its own agentic loop
- Key packages: `@microsoft/teams.apps`, `@microsoft/teams.api`, `@microsoft/teams.cards`, `@microsoft/teams.common`, `@microsoft/teams.dev`

**Bot-Agent Communication — In-process function**
- Extract core agentic loop from `main()` in `agent.ts` into `export async function runAgent()` in `core.ts`
- `ChannelCallbacks` interface provides hooks for: `onInformativeUpdate`, `onTextChunk`, `onToolStart`, `onToolEnd`, `onThinkStart`, `onThinkEnd`
- `main()` becomes the CLI channel adapter, Teams bot becomes another adapter — same core, two front-ends
- Defer HTTP separation to WU3

**Local Dev — DevtoolsPlugin only**
- Local Teams-like chat UI at `localhost:3979/devtools` — no tunnel, no bot registration, no Azure AD
- DevtoolsPlugin supports streaming natively

**Streaming — Needs more research (penciled in)**
- WU1: streaming works in DevtoolsPlugin, so we implement it there
- Penciled-in approach: informative updates during tool calls + text chunks during model output + endStream with final message
- Transport details depend on WU1.5 surface decision

---

## 1.5. Bot registration, dev tunnels, real Teams surface

**Status**: Done
**Planning doc**: [2026-02-23-1908-planning-wu15-real-teams.md](2026-02-23-1908-planning-wu15-real-teams.md)
**Doing doc**: [2026-02-23-1908-doing-wu15-real-teams.md](2026-02-23-1908-doing-wu15-real-teams.md)

Connect the local bot to real Teams. Move from DevtoolsPlugin playground to actual Teams chat.

### Azure setup (what's needed to make this work)

**Prerequisites**: Azure CLI (`az`), Dev Tunnels CLI (`devtunnel`), both logged in.

**Azure resources** (in subscription `99cdfbb7-03e5-4055-bad7-9cefd8f23251`, tenant `smbdevnotags3.onmicrosoft.com`):
- **Resource group**: `agent` (westus2) — shared across all WUs
- **Entra app registration**: `Ouroboros` (App ID: `7467201b-d9b4-4792-9b46-ce84494f9d09`)
  - Sign-in audience: `AzureADMultipleOrgs` (multi-tenant app reg)
  - Client secret created via `az ad app credential reset`
  - **Service principal required**: Must run `az ad sp create --id <appId>` — without this, the bot gets AADSTS7000229 errors
- **Azure Bot Service**: `Ouroboros` (SingleTenant — Azure deprecated MultiTenant bot creation)
  - Teams channel enabled via `az bot msteams create`
  - Messaging endpoint: `https://<tunnel-url>/api/messages` (the SDK listens on `/api/messages` for POSTs, `/` returns app manifest on GET)
- **Dev tunnel**: `ouroboros.usw2` — persistent named tunnel, port 3978, protocol **http** (not https — the bot serves HTTP locally, the tunnel handles TLS)

**Local `.env` file** (gitignored):
```
CLIENT_ID=<appId>
CLIENT_SECRET=<password>
TENANT_ID=<tenantId>
```

**Running locally**:
1. `devtunnel host ouroboros` (terminal 1)
2. `npm run teams` (terminal 2 — loads `.env` via dotenv)

**Sideloading**: Upload `manifest.zip` (generated via `npm run manifest:package`) in Teams → Apps → Manage your apps → Upload a custom app. Works in the dev tenant. Also works cross-tenant (tested in Microsoft corp tenant) despite SingleTenant bot registration — Teams handles the auth routing.

### Lessons learned
- **SDK handles streaming protocol**: Do NOT accumulate text or debounce yourself. The Teams SDK v2 `stream.emit()` accumulates text internally, debounces at 500ms, and manages streamSequence/streamId/streamType. Just send text deltas.
- **Do NOT call `stream.close()` explicitly**: The framework auto-closes the stream after your message handler returns. Calling it yourself causes "Content stream is not allowed on already completed streamed message" 403 errors.
- **Copilot Chat requires informative update first**: `stream.update("thinking...")` must be called before any `stream.emit()` for streaming to work in Copilot Chat. In 1:1 chat it's optional; in Copilot Chat it's mandatory.
- **`stream.update()` is silently dropped after text is emitted**: The SDK only sends informative updates when no text content has been accumulated yet. Tool status updates during multi-turn tool use may not appear if text has already been streamed.
- **Service principal is required**: `az ad app create` creates the app registration but NOT the service principal. Must run `az ad sp create --id <appId>` separately or the bot gets auth errors.
- **Dev tunnel port protocol must be `http`**: The bot serves plain HTTP locally. Use `--protocol http` when creating the tunnel port. Using `https` causes 502 errors because the tunnel tries to connect to the local server over TLS.
- **SingleTenant works cross-tenant for sideloading**: Despite the bot being registered as SingleTenant, sideloading the manifest in a different tenant works. The Entra app registration being multi-tenant (`AzureADMultipleOrgs`) is what matters for cross-tenant auth.

### Context
- Teams SDK v2 bots can appear in both Teams chat and Microsoft 365 Copilot Chat ([Custom Engine Agents docs](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/overview-custom-engine-agent))
- Teams supports real streaming UX: informative updates (blue progress bar) + response streaming (token-by-token). See [streaming docs](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/streaming-ux)
- Streaming limitation: "not available with function calling" — but this is the old Teams AI planner limitation, not relevant when we control our own loop
- No Copilot license required for CEA ([licensing docs](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/cost-considerations))

---

## 2. Multi-user session handling

**Status**: Not started

The agent currently has one global `messages` array. Add per-conversation history keyed by Teams conversation ID so multiple people can use it without stepping on each other.

### Context
- Could be as simple as a `Map<string, Message[]>` in memory to start
- Persistence (save/resume conversations) is nice-to-have, not required initially

---

## 3. Deploy to Azure

**Status**: Not started

Get the agent + bot running on a VM, accessible through Teams for real. Process manager, health checks, the works.

### Architecture (target)

```
azure vm
├── /srv/agent/                 # the agent's repo (Ouroboros)
│   ├── src/agent.ts
│   ├── skills/
│   └── ...
├── /srv/agent-b/               # optional second instance
│   └── ...
├── pm2 ecosystem config        # manages agent process(es)
└── teams-bot/                  # bot app: receives Teams messages, talks to agent
```

### Context
- May add HTTP API wrapper between bot and agent at this stage (deferred from WU1 Decision 2)
- pm2 for process management, auto-restart, health checks
- Agent should not be able to edit the Teams bot or pm2 config

### Safety
- Git-based rollback: if the agent breaks itself, revert to last good commit and restart
- pm2 max restart limit — if it crashes 3x in a row, stop and alert
- The self-edit skill already documents protected zones

---

## 4. Second agent instance as safety net

**Status**: Not started

Clone the repo, spin up the second instance on the same server. Give them awareness of each other's location so they can read/fix each other's code.

### Context
- Each can shell into the other's directory to diagnose and fix issues
- Safety net: if one breaks itself, a human can ask the other to fix it
- Agents do NOT autonomously fix each other (out of scope)
