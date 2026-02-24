# Grow an Agent Server

Deploy a self-modifying coding agent (the ouroboros pattern) as a Teams bot so people can chat with it. It lives on an Azure server with full file system and shell access, so it can read code, write code, run builds, and evolve itself through conversation — just like it does locally, but accessible to anyone in Teams.

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
**Planning doc**: [2026-02-23-1456-planning-wu1-teams-bot-local.md](planning/2026-02-23-1456-planning-wu1-teams-bot-local.md)

Get the ouroboros core running behind a Teams bot adapter locally. Prove the interface works — send a message in the DevtoolsPlugin chat UI, get a streamed response from the agent with tool call updates.

### Architecture

```
                 ┌─────────────────┐
  stdin/stdout ──┤  CLI adapter     │──┐
                 │  (main.ts)       │  │    ┌────────────────────┐
                 └─────────────────┘  ├────┤  ouroboros core     │
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
- Do NOT use the AI planner (`ActionPlanner`, `OpenAIModel`) — ouroboros keeps its own agentic loop
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

**Status**: Not started

Connect the local bot to real Teams. Move from DevtoolsPlugin playground to actual Teams chat.

### Open questions
- Which Teams surface: 1:1 bot chat vs Copilot Chat?
- Does streaming work the same on both surfaces? (Teams streaming docs say 1:1 only — need to verify for Copilot Chat)
- Bot registration process (Azure Bot Service, App ID, etc.)
- Dev tunnel setup (`msft devtunnel`)
- App manifest / sideloading

### Context
- Teams SDK v2 bots can appear in both Teams chat and Microsoft 365 Copilot Chat ([Custom Engine Agents docs](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/overview-custom-engine-agent))
- Teams supports real streaming UX: informative updates (blue progress bar) + response streaming (token-by-token). See [streaming docs](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/streaming-ux)
- Streaming limitation: "not available with function calling" — but this is the old Teams AI planner limitation, not relevant when we control our own loop
- Streaming constraints: 1:1 chats only, 1 req/sec throttle, 2-minute time limit, content must be append-only

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
├── /srv/agent/                 # the agent's repo (ouroboros)
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
