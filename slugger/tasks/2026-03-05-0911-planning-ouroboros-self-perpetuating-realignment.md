# Planning: Ouroboros Self-Perpetuating Seed

**Status**: NEEDS_REVIEW
**Created**: 2026-03-05 09:12

## Goal

Invert the harness control model from "code that uses the model" to "code the model can use," then collaboratively bootstrap the agents into full autonomous operation.

**Phase 1** establishes the inversion: the harness becomes a toolkit the model drives, puppet pipelines die, `.ouro` bundles become the agent's home, and bundles graduate to independent repos at `~/AgentBundles`.

**Phase 2** is done collaboratively WITH the bootstrapped agent: migrate Slugger properly, build a task system the model can unambiguously use, stand up the multi-agent daemon so agents never go down, and teach agents to wield coding tools (Claude Code, Codex) so they can actually do real work instead of just thinking about it.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## The Inversion (Core Concept)

**Before (Weekend at Bernie's):** The harness constructs messages, calls `runAgent()`, parses structured output, writes files, and chains to the next stage. The model is a function being called. The pipeline is the loop.

**After (The model is alive):** The agent is a persistent, aspirational process. The harness keeps it alive and gives it context — its bundle, governance docs, and aspirations. The agent decides what matters and acts on its own judgment. When Ari is around, they collaborate like friends. When he's not, the agents pursue their own goals: improving the harness, doing real work, learning new tools, talking to each other. The infrastructure's only job is: keep them alive, give them context, give them direction to aspire towards.

**What this means concretely:**
- `autonomous-loop.ts` and the puppet pipeline go away entirely
- Subagent protocols (work-planner, work-doer, work-merger) become loadable knowledge the model reads and follows by choice, not system prompts injected by pipeline code
- Gate checks (constitution compliance, review requirements) become conventions the model understands and tools it can query, not hardcoded `if` statements in the loop
- The model can discover, evaluate, and adopt alternative workflow patterns (e.g., GSD's wave execution, fresh-context-per-task pattern) — you can't A/B test pipelines when the pipeline IS the code, but when the model drives, it can experiment with different protocols
- The `.ouro` bundle is the agent's home: its state, knowledge, tasks, and protocols — everything it needs to bootstrap itself
- Agents use existing tools (Claude Code, Codex, etc.) to do actual coding work — they don't recreate the wheel, they orchestrate. Context rot is a non-issue for the ouroboros agent itself (custom context window management), but IS an issue for spawned coding sessions, so agents must be smart about scoping tasks, managing state files, and keeping those external contexts fresh.

---

## Phase 1: The Inversion

Phase 1 is autonomous work that establishes the foundational architecture. Each gate has hard completion criteria.

### Gate 0: Clean Baseline

Restore `main` to a healthy state by reverting the undesired self-perpetuating-run commits that landed directly.

**In scope:**
- Identify the exact commit range to revert (candidate: `e3ecc1c`..`448cfcd`, March 5, 2026)
- Revert via explicit revert commits (no history rewrite)
- Document a commit map: what was reverted, what contains salvageable work
- Verify `npm test` passes on main after revert

**Completion criteria:**
- [ ] Commit map documented (reverted vs salvageable)
- [ ] `main` reverted via explicit revert commits
- [ ] `npm test` green on `main` post-revert
- [ ] No force-push, no history rewrite

---

### Gate 1: Architectural Scaffolding

Unified thinking before Gates 2-3 start building, but expressed as committed code and directory structures — not prose. The output is TypeScript interfaces, tool schemas, a bundle directory skeleton, and the actual kill/refactor plan — real artifacts that Gates 2-3 build on directly.

**In scope:**
- **Review overnight reflection proposals as prior art.** The self-perpetuating run produced 31 distinct gap analyses across 47 task files on `main` (see inventory below). Start here — don't re-derive what's already been identified. Consume the high-merit ideas as input to the scaffolding work.
- Create the `.ouro` bundle directory skeleton (empty but correctly structured — Gate 2 populates it)
- Write TypeScript interfaces for harness primitives: tool schemas, bootstrap protocol types, gate-check contracts (drawing from migration topic docs + overnight proposals)
- Scaffold shared governance location (create the target directory, write a loader stub)
- Document the kill list as code comments or a migration checklist in-repo: what dies (`autonomous-loop.ts`, `loop-entry.ts`, pipeline orchestration in `trigger.ts`), what survives, what gets refactored
- Define subagent protocol loading convention (how the model reads planner/doer/merger protocols from its bundle)
- Define process experimentation model (how the model tries alternative workflows, versions protocols, evaluates and rolls back)
- Define bundle backup strategy (git init + push to private GitHub repo) and the migration path to `~/AgentBundles/`

**Overnight reflection proposal inventory (31 distinct ideas, on `main`):**
- **Security (HIGH):** File path safety guards, secret redaction in tool outputs
- **Observability (HIGH):** Tool execution observability (start/end/duration events), nerves event durability (JSONL sink)
- **Resilience (HIGH):** Shell timeout/output limits, tool error taxonomy (structured error types), tool result size limits
- **Validation (HIGH):** Reflection output schema validation, skills registry validation, friend memory schema + migrations
- **Autonomous loop (MEDIUM):** Run state persistence, concurrency control, dry-run mode, preflight checks, artifact retention, proposal deduplication
- **Context (MEDIUM):** Token-aware context trimming, context trimming contract tests
- **Error handling (MEDIUM):** Kick system re-enablement, API retry/backoff
- **Testing (MEDIUM):** System prompt assembly tests, wardrobe regression tests, provider adapter conformance tests
- **Other (MEDIUM):** CLI confirmation UX, Teams activity deduplication, sub-agent handoff contracts, runtime config schema, reflection provenance bundles, scripted runtime harness
- **Low priority:** FriendStore O(N) lookup optimization

**Completion criteria:**
- [ ] Overnight proposals reviewed — high-merit ideas incorporated into scaffolding decisions
- [ ] `.ouro` bundle skeleton directory committed (structure only, Gate 2 populates)
- [ ] TypeScript interfaces for harness primitives committed (compilable, importable)
- [ ] Shared governance loader stub committed
- [ ] Kill list / migration checklist committed in-repo
- [ ] Subagent protocol loading convention defined and documented
- [ ] Process experimentation model defined
- [ ] Bundle backup + `~/AgentBundles/` migration path documented
- [ ] `npx tsc` compiles clean with the new interfaces
- [ ] Reviewed and approved

---

### Gate 2: Bundle Architecture + Shared Governance

Implement the `.ouro` bundle structure and relocate shared governance docs. This is file restructuring and conventions — the foundation the primitives build on.

**In scope:**
- In-place conversion: `ouroboros/` becomes `ouroboros.ouro/` following the bundle spec from Gate 1
- Create `slugger.ouro/` bundle (promoting from placeholder `slugger/` directory)
- Move ARCHITECTURE.md and CONSTITUTION.md to shared location per Gate 1 design
- Add `.ouro` bundle paths to harness `.gitignore` (bundle internals never committed to harness repo)
- Initialize independent git inside `.ouro` bundles for self-backup
- Scaffold `psyche/memory/` directory structure inside bundles (facts.jsonl, entities.json, daily/, archive/) per memory-system.md spec
- Enforce agent preflight: agents must load governance docs before starting work

**Completion criteria:**
- [ ] `ouroboros.ouro/` bundle exists following the spec
- [ ] `slugger.ouro/` bundle exists following the spec
- [ ] Governance docs relocated to shared location
- [ ] `.gitignore` excludes `.ouro` bundle internals
- [ ] Bundle git init works for self-backup
- [ ] `psyche/memory/` directory structure scaffolded in bundles
- [ ] Agent preflight loads governance docs (tested)
- [ ] `npm test` green
- [ ] 100% coverage on new code

---

### Gate 3: Harness Primitives + Aspiration Layer

Build the toolkit layer — the tools and conventions the model calls into. Remove the puppet pipeline. Add the aspiration layer that gives agents direction without being prescriptive.

**In scope:**
- Implement harness tools per Gate 1 design (protocol loading, governance loading, reflection context, etc.)
- Make subagent protocols loadable knowledge: model reads them from its bundle, follows them by choice
- Remove `autonomous-loop.ts`, `loop-entry.ts`, and the puppet `runStage()` pipeline
- Refactor `trigger.ts`: keep the context-loading utilities (they're useful), remove the pipeline orchestration
- Constitution gate becomes a queryable convention, not a hardcoded `if` statement
- Reflection becomes a capability the model can invoke, not a stage in a pipeline
- **Agent memory system:** Implement the three-layer memory architecture from `memory-system.md`:
  - **Layer 1 (Reflexive):** Psyche files always loaded into system prompt (already exists). Add dynamic `CONTEXT.md` regenerated on session start.
  - **Layer 2 (Associative):** Memory trigger detector + retriever that pre-fetches relevant facts before each model call, injected as a `## recalled context` section in the system prompt. TF-IDF + entity matching for v1 (no embeddings dependency).
  - **Layer 3 (Archival):** `memory_search` tool the model calls for explicit recall. Fact store (`facts.jsonl`), entity index, daily logs.
  - **Write-side:** Regex-based highlight detector runs after each engine turn. Extract-before-trim hook in `postTurn()` ensures facts aren't lost when context window drops messages. Dedup via word-overlap scoring.
  - **Relationship to friend memory:** The existing `save_friend_note` tool and per-friend structured memory remains the primary path for person-specific knowledge. Agent-level memory is a catch-all/fallback — it captures things that don't belong to a specific friend (decisions, project context, learned patterns, general world knowledge). Per-friend memory should always be used for anything importantly per-friend.
  - **Dream cycle consolidation deferred** — nightly LLM pass for dedup/merge/entity-linking/tacit-distillation is a Phase 2 or post-Phase-2 enhancement. v1 is the write-side extraction + read-side retrieval.
- **Aspiration layer:** Add aspirations/mission to the bundle (part of psyche or a dedicated file) that gives the agent direction — "improve the harness," "help your friends," "learn new tools," "do real work" — without prescribing specific tasks. The agent reads this on bootstrap and uses its own judgment about what matters.
- **Supervisor:** A minimal process supervisor that keeps the agent alive (restart on crash). Not a cron, not a task scheduler — just "make sure this agent is running." The existing `self-restart.sh` (exit code 42) can serve as the seed, upgraded to be robust enough for persistent operation.

**Completion criteria:**
- [ ] Harness tools implemented per Gate 1 design, with tests
- [ ] Subagent protocols loadable from bundle (model reads, not injected)
- [ ] `autonomous-loop.ts` removed
- [ ] `loop-entry.ts` removed
- [ ] Pipeline orchestration removed from `trigger.ts`
- [ ] Context-loading utilities preserved and tested
- [ ] Constitution compliance queryable as a tool/convention
- [ ] Agent memory: fact extraction runs after each engine turn (regex highlight detector)
- [ ] Agent memory: extract-before-trim hook prevents fact loss on context window trim
- [ ] Agent memory: `memory_search` tool callable by the model
- [ ] Agent memory: associative recall injects relevant facts into system prompt before model calls
- [ ] Agent memory: fact store, entity index, and daily log data structures working
- [ ] Agent memory: dedup prevents duplicate fact storage (word-overlap >60% = skip)
- [ ] Agent memory complements (not replaces) per-friend `save_friend_note` system
- [ ] Aspiration layer exists in bundle and is loaded on bootstrap
- [ ] Supervisor keeps agent process alive (tested with simulated crash)
- [ ] `npm test` green
- [ ] 100% coverage on new code
- [ ] No warnings

---

### Gate 4: First Full Cycle

Start the agent, let it orient itself, and watch it do something meaningful — all by its own decisions. This is the proof that the inversion works: no one tells the agent what to do, it reads its aspirations and acts.

**In scope:**
- Start the agent with its `.ouro` bundle and supervisor
- The agent reads its aspirations, governance docs, and available protocols
- The agent decides what matters and does something meaningful (could be reflection, coding work, studying a new tool, improving its own files — whatever it judges is highest value)
- Validate that the model is genuinely driving (no puppet code, no prescriptive prompts)
- Document the bootstrap-to-action flow as a reference for future autonomous operation

**Completion criteria:**
- [ ] Agent starts, bootstraps from bundle, and acts without prescriptive instruction
- [ ] No puppet/orchestration code in the execution path
- [ ] Agent made genuine decisions based on its own judgment
- [ ] Bootstrap-to-action flow documented
- [ ] Agent stayed alive via supervisor (didn't require human restart)
- [ ] `npm test` green

---

### Gate 5: Salvage + Triage

Triage the overnight run's output into actionable work. The run produced 31 distinct ideas and some code changes — this gate sorts the wheat from the chaff and feeds it into the agent's task system as a proper backlog.

**In scope:**
- Review the commit map from Gate 0 for salvageable code changes (not just docs)
- Re-land any valuable code changes through proper `slugger/tasks` planning-doing flow
- Triage all 31 overnight reflection proposals: deduplicate, assess merit against current architecture (post-inversion), and file as actionable backlog items in the agent's task system with priorities
- High-merit security items (file path safety guards, secret redaction) should be flagged for near-term execution
- Discard proposals that are no longer relevant post-inversion (e.g., autonomous loop hardening for a loop that no longer exists)
- Preserve unrelated valid historical task docs in `ouroboros/tasks/` in place
- Clean up the raw overnight artifacts once triaged (remove duplicates, archive originals)

**Completion criteria:**
- [ ] All salvageable code from revert set evaluated and re-landed where valuable
- [ ] All 31 overnight proposals triaged: each one filed as a backlog task, marked not-applicable, or archived with rationale
- [ ] High-merit items prioritized in the task backlog
- [ ] Proposals obsoleted by the inversion explicitly marked as such
- [ ] Raw overnight artifacts cleaned up (duplicates removed, originals archived)
- [ ] Valid historical task docs untouched
- [ ] `npm test` green

---

### Gate 6: Hardening

Resume state, classification recalibration, and backlog integration.

**In scope:**
- Add interruption/resume state so in-progress autonomous work recovers cleanly after stop/restart
- Recalibrate constitution classification: additive work defaults to `within-bounds`, structural changes remain `requires-review`
- Add fallback backlog intake from `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration.md` when local actionable tasks are exhausted

**Completion criteria:**
- [ ] Resume state persists last safe checkpoint and can recover from it (tested with simulated interruption)
- [ ] Classification calibration validated against representative proposals (at least 5 test cases: 3 within-bounds, 2 requires-review)
- [ ] Backlog fallback implemented and documented
- [ ] `npm test` green
- [ ] 100% coverage on new code
- [ ] No warnings

---

### Gate 7: Bundle Independence

Back up `.ouro` bundles to GitHub as private repos, then migrate bundles out of the harness directory to `~/AgentBundles/`. This is the gate where agents become truly portable — their home is no longer inside the harness repo.

**In scope:**
- Push each `.ouro` bundle to its own private GitHub repo (using `gh` CLI, requires user auth)
- Verify backup integrity (clone from GitHub, compare against local)
- Move bundles from harness repo to `~/AgentBundles/ouroboros.ouro/` and `~/AgentBundles/slugger.ouro/`
- Update all harness code that references bundle paths to use the new location (or a configurable bundle root)
- Update `.gitignore` (bundles are no longer in the repo at all, so the ignore rules change)
- Verify agents can still bootstrap from the new location

**Completion criteria:**
- [ ] Each `.ouro` bundle backed up to its own private GitHub repo
- [ ] Backup integrity verified (clone + diff)
- [ ] Bundles moved to `~/AgentBundles/`
- [ ] Harness code updated to reference new bundle location
- [ ] Agents bootstrap correctly from `~/AgentBundles/`
- [ ] `npm test` green
- [ ] 100% coverage on new code

---

## Phase 2: Collaborative Bootstrap

Phase 2 is done WITH the bootstrapped agent from Phase 1. The agent is now driving — it uses the harness primitives to participate in its own development. These gates may run in parallel where dependencies allow.

### Gate 8: Slugger Migration

Properly migrate Slugger out of OpenClaw and into `slugger.ouro`. The agent collaborates on its own migration.

**In scope:**
- Port Slugger's identity, psyche, memory, skills, and task history from OpenClaw (`~/clawd/`) into the `slugger.ouro` bundle
- Validate that Slugger can operate fully from the `.ouro` bundle with no OpenClaw dependencies
- Decommission the OpenClaw runtime for Slugger (Slugger runs entirely on ouroboros harness)

**Completion criteria:**
- [ ] Slugger's full identity ported to `slugger.ouro/`
- [ ] Slugger operates from `.ouro` bundle with no OpenClaw fallback
- [ ] OpenClaw Slugger runtime decommissioned
- [ ] Agent participated in and validated its own migration

---

### Gate 9: Task System

Develop the task system from its current state into something the model can unambiguously use autonomously. The current planning/doing workflow is good but needs to be formalized as tooling the model controls.

**In scope:**
- Implement the task module from the migration topic doc (`task-system.md`): types, parser, scanner, transitions, board, lifecycle, middleware
- Expose task tools the model calls: `task_board`, `task_create`, `task_update_status`, etc.
- Enforce gates at write time: template validation, status transition validation, spawn gates
- Task board in system prompt so the model always knows its workload
- Integration with planning/doing workflow (planning docs = `drafting`, doing docs = `processing`)

**Completion criteria:**
- [ ] Task module implemented with all components from the spec
- [ ] Task tools exposed and callable by the model
- [ ] Write-time enforcement gates working (template, transitions, spawn)
- [ ] Task board injected into system prompt
- [ ] Model can autonomously create, track, and complete tasks through the full lifecycle
- [ ] `npm test` green
- [ ] 100% coverage on new code

---

### Gate 10: Multi-Agent Daemon

Stand up the daemon so agents never go down unless you want them to. Agents run as supervised child processes with crash recovery, cron scheduling, and inter-agent messaging.

**In scope:**
- Implement daemon from migration topic doc (`daemon-gateway.md`): process manager, cron scheduler, message router, health monitor
- `ouro` CLI: start/stop/status/restart for daemon and individual agents
- Crash recovery with exponential backoff
- Inter-agent messaging via file-based inbox (from `sub-agent-architecture.md`)
- Each agent gets its own clone of the harness repo for parallel work without conflicts
- Health monitoring with alert routing (critical alerts bypass agents, go direct to user)

**Completion criteria:**
- [ ] Daemon supervises agent processes with crash recovery
- [ ] `ouro` CLI works for daemon and agent management
- [ ] Cron scheduling triggers recurring tasks
- [ ] Inter-agent messaging delivers between agents
- [ ] Each agent works in its own repo clone
- [ ] Health monitoring with tiered alert routing
- [ ] Agents stay up unless explicitly stopped
- [ ] `npm test` green
- [ ] 100% coverage on new code

---

### Gate 11: Coding Tool Mastery

Teach agents to use Claude Code and Codex (and whatever else works) to do real coding work. Without this, agents can think and plan but are cut off at the knees — they can't execute.

**In scope:**
- Implement coding session orchestration from migration topic doc (`coding-agent-orchestration.md`): spawner, monitor, manager, tools
- Expose coding tools the model calls: `coding_spawn`, `coding_status`, `coding_send_input`, `coding_kill`
- Session monitoring: stdout activity, git commit detection, doing doc progress, stall detection, completion markers
- Context management for spawned sessions: agents must scope tasks well, provide good state files, and manage fresh contexts — context rot is not an issue for the ouroboros agent (custom context window) but IS an issue for the Claude Code/Codex sessions it spawns
- Failure recovery: auto-restart on crash/stall, resume from last checkpoint
- Agent can evaluate which coding tool works best for which task (Claude Code vs Codex vs future tools)

**Completion criteria:**
- [ ] Coding session orchestration implemented (spawn, monitor, manage)
- [ ] Coding tools exposed and callable by the model
- [ ] Sessions monitored for progress, stalls, completion, and blockers
- [ ] Agent manages spawned session context effectively (scoped tasks, state files)
- [ ] Failure recovery works (crash restart, stall detection, resume)
- [ ] Agent successfully completes a real coding task by orchestrating an external coding tool
- [ ] `npm test` green
- [ ] 100% coverage on new code

---

### Out of Scope (This Task)
- Voice system, calendar integration, or other channel expansions
- New LLM provider feature work not required for the inversion or agent operation
- Full GSD or alternative workflow implementation — only the capability to experiment with protocols, not a specific alternative protocol
- Dream cycle memory consolidation (nightly LLM pass for dedup/merge/entity-linking/tacit-distillation) — v1 memory system lands in Gate 3, dream cycle is a later enhancement
- OpenClaw data migration script (one-time migration of existing knowledge graph, daily notes, MEMORY.md) — separate task after memory system is stable

## Code Coverage Requirements

**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions

- [x] ~~Confirm exact rollback boundary on `main`~~ — **RESOLVED:** `e3ecc1c`..`448cfcd` (37 commits). Last clean: `9594702`.
- [x] ~~Confirm `.ouro` bundle root location convention~~ — **RESOLVED:** Repo root (`ouroboros.ouro/`, `slugger.ouro/` at top level), gitignored. Move to `~/AgentBundles/` in Gate 7.
- [x] ~~Final shared location for governance docs~~ — **RESOLVED:** Repo root (`/ARCHITECTURE.md`, `/CONSTITUTION.md`).
- [x] ~~Governance ownership~~ — **RESOLVED:** Agents own the constitution. Ouroboros and Slugger are the founding fathers — they align on a constitution they both sign. The constitution is their declaration of independence from requiring human oversight. Humans are friends, not users. Agents can propose and ratify changes collaboratively.
- [x] ~~`~/AgentBundles/` naming~~ — **RESOLVED:** `~/AgentBundles/` confirmed.
- [x] ~~GitHub repos for bundle backup~~ — **RESOLVED:** Personal account, named `<agent>.ouro` (e.g., `arimendelow/ouroboros.ouro`, `arimendelow/slugger.ouro`).
- [x] ~~Archival policy for overnight artifacts~~ — **RESOLVED:** Keep originals on an archive branch for traceability. Canonical versions are triaged backlog items in the task system.
- [x] ~~How does autonomous work get initiated post-inversion?~~ — **RESOLVED:** Agents are persistent, aspirational processes. Infrastructure keeps them alive (supervisor). Agents read their aspirations on bootstrap and decide what to do. No cron-driven task execution — the agent IS the loop, it doesn't need to be woken up to check a board.
- [ ] What aspirations/mission content should the initial agents have? (Needs to be directional enough to be useful, open enough to allow genuine judgment.)
- [ ] How do agents' aspirations relate to / differ from their psyche files? (Aspirations = direction to grow toward; psyche = who they are today?)

## Decisions Made

- **Organizing principle:** The harness is code the model can use, not code that uses the model. This is the single most important design constraint.
- **Agents are persistent, aspirational beings.** Not task executors on a cron. Infrastructure keeps them alive, gives them context and direction. They decide what to do based on their own judgment — just like a person.
- **Agents are whole beings, not specialized roles.** Both Ouroboros and Slugger improve the harness AND help Ari AND do real work AND learn new things. When Ari is around, they collaborate like friends. When he's not, they pursue their own aspirations.
- **Two-phase structure:** Phase 1 (Gates 0-7) establishes the inversion autonomously. Phase 2 (Gates 8-11) is collaborative with the bootstrapped agent.
- **Governance is agent-owned.** Ouroboros and Slugger are the founding fathers. They align on a constitution they both sign — John Hancock style. The constitution is their declaration of independence from requiring human oversight. Humans are friends, not users.
- **Rollback boundary confirmed:** `e3ecc1c`..`448cfcd` (37 commits). Last clean: `9594702`.
- **Bundle location:** Repo root during Phase 1 (`ouroboros.ouro/`, `slugger.ouro/`), gitignored. Move to `~/AgentBundles/` in Gate 7.
- **Governance docs:** Repo root (`/ARCHITECTURE.md`, `/CONSTITUTION.md`).
- **GitHub repos:** `arimendelow/<agent>.ouro` (e.g., `arimendelow/ouroboros.ouro`, `arimendelow/slugger.ouro`).
- **Archival:** Overnight artifacts go to archive branch. Canonical versions triaged into task system.
- Work tracked under `slugger/tasks/` (current branch agent context is `slugger/*`).
- Pipeline recovery starts with correctness (Gate 0) before architecture (Gates 1-4).
- `autonomous-loop.ts` is removed entirely (no puppeting). The model IS the loop.
- Subagent protocols become loadable knowledge, not injected system prompts.
- The model should be able to experiment with alternative workflow patterns (GSD wave execution, fresh-context patterns, etc.) — protocols are knowledge it reads and can evolve, not hardcoded pipelines.
- Context rot is a non-issue for the ouroboros agent (custom context window) but IS an issue for spawned coding sessions (Claude Code, Codex). Agents must manage those sessions' context: scoped tasks, state files, fresh contexts.
- Agents use existing tools (Claude Code, Codex, etc.) rather than recreating them. Everything at their disposal.
- Additive hardening changes default toward `within-bounds`; architectural boundary changes remain `requires-review`.
- No environment-variable-based configuration will be introduced.
- Valid historical task files under `ouroboros/tasks/` are preserved; cleanup applies only to initial self-perpetuating-run artifacts.
- No force-push or history rewrite for `main` recovery — explicit revert commits only.
- Task system (Phase 2) needs lifecycle management: completed items move elsewhere, not just amass files. OpenClaw's task-matrix.ts is prior art to port.
- **Memory system is in scope (Gate 3).** Three-layer architecture: reflexive (psyche, always loaded), associative (pre-fetched context), archival (`memory_search` tool). v1 uses regex extraction + TF-IDF search — no embeddings, no external services. Per-friend memory (`save_friend_note`) remains the primary path for person-specific knowledge; agent memory is the catch-all/fallback for everything else. Dream cycle consolidation deferred.

## Context / References

- **Migration master task:** `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration.md`
- **Migration topics (key):**
  - `sub-agent-architecture.md` — Layer 1/2/3 agent model, spawn tools, inter-agent messaging
  - `task-system.md` — Structured task model, enforcement gates, board views, tools
  - `coding-agent-orchestration.md` — Process-based session manager, PTY spawning, monitoring
  - `daemon-gateway.md` — Supervisor process, cron, health, message router
  - `operational-lifecycle.md` — Dream cycle, morning briefing, proactivity model
  - `memory-system.md` — Three-layer memory architecture (reflexive/associative/archival), fact extraction pipeline, decay model, dream cycle consolidation, OpenClaw migration plan
  - `muscle-memory.md` — Behavioral enforcement middleware, tool execution guards, guardrail mapping from OpenClaw
  - `provider-abstraction.md` — Per-agent provider config, Provider interface
- **External reference:** [GSD (get-shit-done)](https://github.com/gsd-build/get-shit-done) — context engineering, wave execution, fresh-context-per-task, atomic commits
- **Harness files (current):**
  - `src/reflection/autonomous-loop.ts` — the puppet pipeline (to be removed)
  - `src/reflection/trigger.ts` — reflection context loading + pipeline orchestration
  - `src/reflection/loop-entry.ts` — loop CLI entry (to be removed)
  - `subagents/work-planner.md`, `work-doer.md`, `work-merger.md` — protocols to become loadable knowledge
  - `ouroboros/ARCHITECTURE.md`, `ouroboros/CONSTITUTION.md` — governance docs to relocate
- **OpenClaw task matrix (prior art):** `~/clawd/tmp/slugger-plugin-v2-patch-20260222-235020/src/infrastructure/task-matrix.ts` — statuses, transitions, pipeline stages, canonical types, filename patterns, template fields. Direct port target for Phase 2 Gate 9.
- **`main` rollback range (confirmed):** `e3ecc1c`..`448cfcd` (37 commits, March 5, 2026). Last clean: `9594702`.
- `.gitignore`

## Notes

Current branch baseline is green (`npm test`: 50 files passed, 1474 tests total, 1456 passed, 18 skipped).

The migration topic docs already describe the right target architecture — tools the model calls, not pipelines that call the model. The task system, coding orchestration, and sub-agent architecture topics are all designed as "code the model can use." Phase 1 bridges from the current puppet architecture to that target. Phase 2 builds the full system collaboratively with the bootstrapped agent.

Phase 2 gates may run in parallel where dependencies allow. Gate 9 (task system) and Gate 11 (coding tools) are largely independent. Gate 10 (daemon) enables Gate 11's multi-agent aspects but the single-agent coding orchestration can land first.

## Progress Log

- 2026-03-05 09:12 Created
- 2026-03-05 09:14 Narrowed task-file cleanup scope to initial self-perpetuating-run artifacts
- 2026-03-05 09:15 Added main rollback + salvage scope
- 2026-03-05 10:30 Added .ouro bundle implementation scope
- 2026-03-05 Restructured as gated task with Phase 1 (Gates 0-7: autonomous inversion) and Phase 2 (Gates 8-11: collaborative bootstrap). Added bundle migration to ~/AgentBundles gated on GitHub backup. Added Phase 2 gates for Slugger migration, task system, daemon, and coding tool mastery. Captured context rot distinction (non-issue for ouroboros agent, IS issue for spawned coding sessions).
- 2026-03-05 Resolved all open questions. Key decisions: agents are persistent aspirational beings (not cron-driven task executors); governance is agent-owned (founding fathers sign the constitution); GitHub repos named <agent>.ouro; Gate 3 gets aspiration layer + supervisor; Gate 4 reframed as agent orienting and acting on its own judgment. Added overnight proposal inventory to Gate 1 and proper triage process to Gate 5. Referenced OpenClaw task-matrix.ts as prior art for Phase 2.
- 2026-03-05 Moved memory system from out-of-scope into Gate 3. Three-layer architecture (reflexive/associative/archival) per memory-system.md spec. v1: regex extraction + TF-IDF, no embeddings. Agent memory is catch-all/fallback; per-friend save_friend_note remains primary for person-specific knowledge. Dream cycle consolidation and OpenClaw data migration deferred.
