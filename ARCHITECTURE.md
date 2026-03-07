# ARCHITECTURE

This document describes the post-fix-round architecture for the Ouroboros agent harness.

## Core Model

The harness runs as a daemon-centered, event-driven system:

- One daemon process manages discovery, lifecycle, routing, and scheduling.
- Each enabled agent bundle maps to one runtime agent process.
- Agents process work from chat, `ouro msg`, task board changes, and heartbeat-style task events.
- Work is task-driven; scheduling is derived from task frontmatter and delivered as `ouro poke` triggers.

## Runtime Topology

1. `ouro up` ensures the daemon is running (idempotent startup + stale socket cleanup).
2. Daemon discovers bundles under `~/AgentBundles/*.ouro`.
3. Enabled bundles become managed agent processes.
4. Chat (`ouro chat`), coder/agent messages (`ouro msg`), and pokes (`ouro poke`) are routed to running agents.
5. Daemon and agents emit structured nerves events for observability and coverage audit.

Supervisor layering is removed; daemon is the runtime entrypoint.

## Body-Metaphor Subsystems

- `heart/`: core model loop, provider integration, streaming, tool execution, bootstrap identity/config loading.
- `mind/`: prompt assembly, memory, friend store, bundle canonical-manifest enforcement.
- `senses/`: interaction adapters and inner-dialog worker/turn orchestration.
- `nerves/`: runtime logging/event schema and deterministic coverage audits.
- `repertoire/`: tools, coding orchestration, and task board/state machinery.
- `daemon/`: process manager, command plane, message router, task scheduler, hatch flow, first-run UX.

## Primary CLI Surface

Public operator commands:

- `ouro` / `ouro up`
- `ouro status`
- `ouro logs`
- `ouro stop`
- `ouro hatch`
- `ouro chat <agent>`
- `ouro msg --to <agent> [--session <id>] [--task <ref>] <message>`
- `ouro poke <agent> --task <task-id>`
- `ouro link <agent> --friend <id> --provider <provider> --external-id <external-id>`

`npx ouro.bot` is the first-run wrapper that delegates to the canonical CLI runtime.

## Scheduling + Messaging

- Scheduler reads task markdown (`cadence` / `scheduledAt`) and reconciles jobs into `ouro poke` commands.
- Triggered work updates task `lastRun` metadata.
- `ouro msg` uses daemon routing for coder<->parent and inter-agent communication.
- Message fallback persistence exists so messages survive temporary daemon outages.

## Bundle Contract

Agent bundle root: `~/AgentBundles/<Agent>.ouro/`

`agent.json` is the runtime source of truth and includes:

- `version` (integer schema)
- `enabled` (daemon autostart flag)
- `provider`
- `context`
- `phrases`

Secrets are not stored in bundles:

- Provider credentials: `~/.agentsecrets/<agent>/secrets.json`

Canonical bundle manifest is enforced (`mind/bundle-manifest.ts`), including:

- `agent.json`
- `psyche/SOUL.md`
- `psyche/IDENTITY.md`
- `psyche/LORE.md`
- `psyche/TACIT.md`
- `psyche/ASPIRATIONS.md`
- `psyche/memory/`
- `friends/`
- `tasks/`
- `skills/`
- `senses/teams/` (under `senses/`)

Non-canonical bundle paths are detected and surfaced for cleanup/distillation.

## Repository Layout

Top-level source layout:

- `src/daemon`
- `src/heart`
- `src/mind`
- `src/senses`
- `src/nerves`
- `src/repertoire`
- `src/__tests__` mirroring runtime domains

## Removed / Cut Systems

The fix round removed legacy or duplicate systems, including:

- standalone supervisor runtime
- cron scheduler dependency as primary scheduler model
- governance subsystem directory and other stale pipeline/workspace wiring
- non-canonical bundle-era assumptions (for example repo-root bundle ownership)

## Quality Gates

- ESLint and TypeScript must pass.
- Test suite and coverage gate must pass.
- New code requires full branch/line/function coverage.
- Nerves coverage audits enforce logging structure and runtime observability contracts.

## Ownership

This document is shared architecture guidance for maintainers and coding agents. Update it whenever runtime contracts or subsystem boundaries materially change.
