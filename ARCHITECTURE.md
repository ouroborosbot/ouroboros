# Architecture

This document describes the current runtime shape of the Ouroboros harness.

## Core Runtime Model

The harness is daemon-centered.

- `npx ouro.bot` is the bootstrap entrypoint.
- `ouro` is the installed launcher used after bootstrap.
- `ouro up` starts the daemon from the installed production version, repairs stale wrapper state, installs workflow helpers, and replaces the daemon if needed.
- `ouro dev` starts the daemon from a local repo build (for development — skips update checker, always force-restarts).
- The daemon discovers bundles from `~/AgentBundles/*.ouro`.
- Enabled bundles become managed runtime participants.

The important design goal is one coherent runtime truth:

- launcher truth
- daemon truth
- bundle truth
- sense truth

## Runtime Topology

1. Human enters through `npx ouro.bot` or `ouro`.
2. CLI setup verifies launcher, bundle registration, and helper installs.
3. `ouro up` starts the daemon from the installed version; `ouro dev` starts from a local repo build.
4. Daemon discovers bundles under `~/AgentBundles`.
5. Daemon reports:
   - discovered agents
   - senses
   - workers
   - runtime version
   - last updated time
6. Agent work arrives through:
   - `ouro chat`
   - `ouro msg`
   - `ouro poke`
   - daemon-managed senses like Teams and BlueBubbles

## External State Layout

### Agent bundles

`~/AgentBundles/<agent>.ouro/`

Bundle contents are enforced by `src/mind/bundle-manifest.ts`.

Canonical paths:

- `agent.json`
- `bundle-meta.json`
- `psyche/SOUL.md`
- `psyche/IDENTITY.md`
- `psyche/LORE.md`
- `psyche/TACIT.md`
- `psyche/ASPIRATIONS.md`
- `diary/` — durable facts, conclusions, things worth recalling (renamed from `psyche/memory/`; legacy path still works as fallback)
- `journal/` — thinking-in-progress, working notes, drafts (the agent's desk)
- `habits/` — autonomous rhythms: heartbeat, reflections, check-ins (extracted from `tasks/habits/`)
- `friends/`
- `state/`
- `tasks/` — one-shots and ongoing work (habits no longer live here)
- `skills/`
- `senses/`
- `senses/teams/`

### Secrets

`~/.agentsecrets/<agent>/secrets.json`

Secrets stay out of bundles and out of the repo.

### Machine-scoped runtime/test spillover

`~/.agentstate/...`

This is for machine-level artifacts, not bundle-owned identity.

## Bundle Truth

`agent.json` is the runtime-facing contract for:

- provider selection
- phrases
- context settings
- sense enablement
- `configPath`

`bundle-meta.json` tracks the runtime version that last touched the bundle and supports version-aware behavior on startup.

## Senses

Current senses:

- `cli`
- `teams`
- `bluebubbles`

Sense status model:

- `interactive`
- `disabled`
- `needs_config`
- `ready`
- `running`
- `error`

The daemon manages daemon-hosted senses and reports them in `ouro status`. CLI remains `interactive` rather than daemon-hosted.

### BlueBubbles-specific behavior

BlueBubbles now uses:

- one persisted chat trunk per chat
- current-turn lane metadata for thread awareness
- agent-chosen outbound lane targeting
- typing/read behavior coordinated through the sense transport

Threads are treated as routing/context metadata, not as separate long-lived memory worlds.

## Subsystems

- `src/heart/`
  Core engine, provider runtimes, identity/config loading, daemon, bootstrap, and entrypoints.
- `src/mind/`
  Prompt assembly, sessions, bundle manifest, diary (memory), journal indexing, phrases, formatting, and friend identity.
- `src/repertoire/`
  Tool registry, coding orchestration, task tooling, and integration clients.
- `src/senses/`
  CLI, Teams, BlueBubbles, activity transport, trust gating, inner-dialog worker logic, and contextual heartbeat.
- `src/nerves/`
  Structured runtime events and deterministic audit coverage.

## Tools

Tool access is channel-aware and trust-aware.

- CLI gets the full local harness surface.
- Trusted one-to-one remote contexts can use the feasible local tool surface.
- Shared or untrusted remote contexts stay more constrained.

The metacognitive tool vocabulary:

- **settle** — deliver a response to a friend (outer sessions)
- **ponder** — "I need to think about this" (takes thought inward, or continues thinking)
- **rest** — "I'm putting this down" (inner dialog only, ends the turn)
- **surface** — share a thought outward from inner dialog
- **observe** — stay quiet in group chats
- **diary_write** — record something to the diary for later recall
- **recall** — search both diary and journal for relevant facts and notes

Other important tools include coding session orchestration, bridge management, and BlueBubbles reply-target selection.

## Habits And Rhythms

Habits are the agent's autonomous rhythms — recurring patterns that fire independently.

- Habits live at `~/AgentBundles/<agent>.ouro/habits/` as simple markdown files.
- Each habit has: title, cadence (e.g., `"30m"`, `"1d"`), status (`active`/`paused`), lastRun, created, and a body (the agent's instructions to themselves).
- The `HabitScheduler` registers each active habit as an OS cron entry (launchd on macOS, crontab on Linux).
- When a cron fires, it pokes the daemon, which routes it to the agent's inner dialog.
- The agent sees their own habit body as the prompt, plus an "also due" line showing other overdue habits.
- `lastRun` is updated in the habit's frontmatter after each turn.
- `fs.watch` + CLI notifications provide event-driven discovery (no polling).
- On daemon startup, the scheduler auto-migrates any old `tasks/habits/` files and fires overdue habits.

The heartbeat is just one habit among many — the agent's breathing. But agents can create any rhythm they want.

## Inner Dialog

The inner dialog is the agent's private thinking space.

- **ponder**: From any conversation, the agent can *ponder* something — it goes to inner dialog with the thought as context. From inner dialog, *ponder* triggers another turn (the wheel keeps turning).
- **rest**: When thinking is done, the agent *rests*. The wheel stops until the next habit fires.
- **surface**: From inner dialog, the agent can *surface* thoughts outward to friends.
- **settle**: In outer conversations, the agent *settles* on a response (not available in inner dialog).
- **observe**: In group chats, the agent can choose to stay quiet.

The inner dialog session is continuous — different habits and delegations are different prompts into the same stream of thought.

## Diary And Journal

- **Diary** (`diary/`): The agent's permanent record. `diary_write` saves entries with embeddings for associative recall. `recall` searches both diary and journal.
- **Journal** (`journal/`): The agent's desk. Freeform files the agent writes with `write_file`. The heartbeat shows a journal index (recent files, previews) so the agent sees where they left off.

Both are searchable. The diary is the shelf; the journal is the desk.

## Scheduling And Messaging

- Task markdown supports `scheduledAt` and `cadence` for one-shot timed events.
- The daemon task scheduler reconciles those into OS jobs that call `ouro poke`.
- Habits have their own scheduler (see above) — they don't go through the task system.
- `ouro msg` routes messages through the daemon and falls back to pending delivery when needed.

## Version And Update Model

- Package version comes from `package.json`.
- Runtime metadata exposes `version` and `lastUpdated`.
- `ouro up` replaces stale daemons rather than preserving split-brain launcher/runtime behavior. `ouro dev` always force-restarts.
- Dev mode suppresses the npm update checker. Production mode checks every 30 minutes.
- Update hooks run against bundles using `bundle-meta.json`.
- The bootstrap wrapper and installed launcher are designed to converge on the same runtime channel.

## Adoption Specialist

`AdoptionSpecialist.ouro/` is shipped with the package and used by `ouro hatch`.

The specialist:

- interviews the human
- helps define the new agent
- scaffolds a canonical bundle
- writes secrets to `~/.agentsecrets/<agent>/secrets.json`
- hands the new agent off into the normal bundle/runtime model

## Repository Layout

Top-level repo layout:

- `src/`
- `subagents/`
- `AdoptionSpecialist.ouro/`
- `docs/`
- `scripts/teams-sense/`
- `packages/ouro.bot/`

Task docs are intentionally not part of this repo’s long-lived architecture. They live with the owning agent bundle.

## Quality Gates

- `npm test`
- `npx tsc --noEmit`
- `npm run test:coverage`

Production runtime logging must go through `emitNervesEvent()`, and nerves audit rules enforce structural coverage over those events.
