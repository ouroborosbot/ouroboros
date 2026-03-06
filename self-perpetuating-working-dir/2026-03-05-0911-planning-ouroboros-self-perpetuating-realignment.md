# Planning: Ouroboros Self-Perpetuating Seed

**Status**: APPROVED
**Created**: 2026-03-05 09:12

## Goal

Invert the harness control model from "code that uses the model" to "code the model can use," then collaboratively bootstrap the agents into full autonomous operation.

**Phase 1** establishes the inversion: the harness becomes a toolkit the model drives, puppet pipelines die, `.ouro` bundles become the agent's home, Slugger moves into the harness, and both agents are alive and thinking.

**Phase 2** is done collaboratively WITH the bootstrapped agents: graduate bundles to independent repos at `~/AgentBundles`, build a task system the model can unambiguously use, stand up the multi-agent daemon so agents never go down, and teach agents to wield coding tools (Claude Code, Codex) so they can actually do real work instead of just thinking about it.

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

## Execution Protocol

This section tells the executing agent (Codex) exactly how to run the entire task autonomously. **This planning doc is pre-approved by the human. No approval gates, no review stops.** Read this doc once, follow the protocol, and chain all gates end-to-end.

### Preflight (before Gate 0)

Run these checks before starting. All must pass — if any fail, fix before proceeding.

```
# 1. Verify gh CLI is authenticated
gh auth status
# Expected: Logged in to github.com account arimendelow

# 2. Verify tests pass on main
git checkout main && git pull origin main
npm test
# Expected: all tests pass

# 3. Create archive branch BEFORE merging (preserves overnight proposals)
# CRITICAL: The slugger/self-perpetuating-seed branch has 55 files of changes
# including deletions of overnight proposal files. The archive branch must
# capture main's current state (with those proposals intact) BEFORE the merge.
git branch archive/self-perpetuating-run-2026-03-05 main
git push origin archive/self-perpetuating-run-2026-03-05

# 4. Merge this planning doc to main so it's accessible from all gate branches
# This planning doc currently lives on branch slugger/self-perpetuating-seed.
# It must be on main before Gate 0 branches off main.
git merge slugger/self-perpetuating-seed --no-edit
npm test
git push origin main

# 5. Verify gh repo default
gh repo set-default --view
# Expected: ouroborosbot/ouroboros
```

After preflight, this planning doc is at `self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md` on `main`. Codex should use `self-perpetuating-working-dir/` as its workspace for all artifacts created during this task (commit maps, doing docs, notes, etc.).

### Prerequisites

- The three subagent protocols are registered as Codex skills: `work-planner`, `work-doer`, `work-merger`
- This planning doc is the single source of truth for all gates
- All reference material paths are listed at the end of this section

### Per-Gate Execution Loop

For each gate (0, 1, 2, 3a, 3b, 4, 5, 6, 7, 8, 9, 10, 11), execute this cycle:

**Step 1: Branch**
```
git checkout main && git pull origin main
git checkout -b <agent>/gate-<N>-<slug>
```
Branch naming: `slugger/gate-0-clean-baseline`, `slugger/gate-1-architectural-scaffolding`, etc.

**Step 2: Generate doing doc (work-planner Phase 2 only)**

Invoke the `work-planner` skill. Because this planning doc is already approved, **skip Phase 1 (planning) entirely** — go straight to Phase 2 (conversion). The input is this gate's section from this planning doc.

Tell work-planner:
- Planning doc path: `self-perpetuating-working-dir/2026-03-05-0911-planning-ouroboros-self-perpetuating-realignment.md`
- Convert ONLY the current gate's section (Gate N) into a doing doc
- The planning doc is pre-approved — no approval gate needed
- Place the doing doc in `self-perpetuating-working-dir/` following the naming convention
- Execution mode: `direct`

Work-planner will run its 4 conversion passes (first draft, granularity, validation, quality) and produce a doing doc with TDD units. The doing doc is ready for execution immediately — no approval gate.

**Step 3: Execute doing doc (work-doer)**

Invoke the `work-doer` skill. It reads the doing doc from Step 2 and executes all units sequentially with strict TDD:
- Tests first (red), then implementation (green), then refactor
- Commit and push after each unit
- 100% coverage on new code
- `npm test` green after every unit
- `npx tsc` compiles clean after every implementation/refactor unit

**Step 4: Merge to main (work-merger)**

Invoke the `work-merger` skill. It:
- Fetches latest `main`, merges, resolves any conflicts
- Creates a PR via `gh`
- Waits for CI
- Merges to main
- Cleans up the feature branch

After work-merger completes, the gate's work is on `main`.

**Step 5: Verify gate completion**

After merge, verify the gate's completion criteria from this planning doc:
- Run `npm test` on main — must be green
- Check that all completion criteria checkboxes for this gate are satisfiable
- If any criterion is not met, fix it on a hotfix branch and merge before proceeding

**Step 6: Continue to next gate**

Return to Step 1 for the next gate. The next gate's doing doc will be generated fresh against the current codebase (which now includes all prior gates' work).

### Failure Handling

- **Test failures during work-doer:** Work-doer spawns sub-agents to diagnose and fix. If genuinely blocked (unclear requirements, external dependency), it marks the unit blocked and stops.
- **Merge conflicts during work-merger:** Work-merger resolves using doing doc context. If conflicts are genuinely ambiguous, it retries with exponential backoff.
- **Gate completion criteria not met after merge:** Create a hotfix branch, fix the issue, merge via work-merger, then re-verify before proceeding.
- **Never skip a gate.** If a gate is blocked, fix the blocker — don't move on with an incomplete gate.

### Phase 2 Note

Phase 2 gates (8-11) are designed to be done collaboratively with the bootstrapped agents. By Gate 8, both agents are in the harness and the infrastructure from Phase 1 is operational. The executing agent should leverage the running agents' capabilities where applicable.

### Reference Material Paths

All paths the executing agent may need:

**Subagent protocols (Codex skills):**
- `subagents/work-planner.md` — planning -> doing doc conversion
- `subagents/work-doer.md` — TDD unit execution
- `subagents/work-merger.md` — branch merge via PR

**Migration topic docs (detailed specs):**
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/memory-system.md` — three-layer memory architecture (NOTE: spec uses `data/memory/` paths — translate to `psyche/memory/` per our decision)
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/muscle-memory.md` — behavioral enforcement
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/sub-agent-architecture.md` — L1/L2/L3 agent model
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/task-system.md` — task types, statuses, transitions
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/coding-agent-orchestration.md` — session manager
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/daemon-gateway.md` — supervisor process
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/operational-lifecycle.md` — dream cycle, proactivity
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/provider-abstraction.md` — per-agent provider config

**Prior art (direct port targets):**
- `~/clawd/tmp/slugger-plugin-v2-patch-20260222-235020/src/infrastructure/task-matrix.ts` — OpenClaw task statuses, transitions, pipeline stages

**Inner dialog / session infrastructure (Gate 3):**
- `src/senses/cli.ts` — CLI session implementation (inner dialog is modeled on this: same engine loop, same local tools)
- `src/mind/context.ts` — `saveSession()`, `loadSession()`, `postTurn()` — session persistence
- `src/config.ts:355` — `sessionPath()` — session path resolution. Inner dialog path: `~/.agentstate/<agent>/sessions/self/inner-dialog.json`
- `src/heart/core.ts` — `runAgent()` engine loop, `drainSteeringFollowUps` for mid-turn user message injection
- `src/heart/turn-coordinator.ts` — turn coordination for concurrent sessions
- **Provider constraint:** Anthropic Messages API errors on consecutive assistant messages (confirmed). Inner dialog must inject user-role messages between assistant turns. Other providers (OpenAI, Azure Responses API) are permissive. MiniMax undocumented but likely permissive. The safest cross-provider approach: always inject a user-role message (from instincts or heartbeat) between assistant turns.

**Current harness files (kill/refactor targets):**
- `src/reflection/autonomous-loop.ts` — puppet pipeline (remove in Gate 3)
- `src/reflection/loop-entry.ts` — loop CLI (remove in Gate 3)
- `src/reflection/trigger.ts` — keep context-loading, remove pipeline orchestration (Gate 3)
- `src/identity.ts` — `getAgentRoot()` at line 96 returns `path.join(getRepoRoot(), getAgentName())`. When bundles rename from `ouroboros/` to `ouroboros.ouro/`, this function and all 18 files that depend on it must be updated (Gate 2).
- `ouroboros/ARCHITECTURE.md` — relocate to repo root (Gate 2)
- `ouroboros/CONSTITUTION.md` — relocate to repo root (Gate 2)

**Existing agent directories (become .ouro bundles in Gate 2):**
- `ouroboros/` -> `ouroboros.ouro/`
- `slugger/` -> `slugger.ouro/`

**OpenClaw Slugger data (migration source for Gate 8):**
- `~/clawd/IDENTITY.md` — Slugger's identity
- `~/clawd/MEMORY.md` — Slugger's tacit knowledge
- `~/clawd/memory/` — daily notes (YYYY-MM-DD.md files)
- `~/clawd/life/areas/` — knowledge graph (people/, companies/, projects/, slugger-identity/)
- `~/clawd/tasks/` — task history (completed/, ongoing/, habits/, one-shots/, planning/)

**OpenClaw CLI (for Gate 8 Slugger communication):**
- `/Users/arimendelow/Library/pnpm/openclaw` — CLI binary (version 2026.2.25)
- Usage: `openclaw agent --to slugger --message "<msg>" --deliver`

**Embeddings config (Gate 3b):**
- `src/config.ts:56` — `IntegrationsConfig.openaiEmbeddingsApiKey` (interface field)
- `src/config.ts:348` — `getOpenAIEmbeddingsApiKey()` (getter function)
- `~/.agentsecrets/<agent>/secrets.json` → `integrations.openaiEmbeddingsApiKey` (runtime value)
- Model: `text-embedding-3-small` (OpenAI, ~$0.02/M tokens)

**External reference:**
- [GSD (get-shit-done)](https://github.com/gsd-build/get-shit-done) — context engineering, wave execution, fresh-context-per-task, atomic commits

---

## Phase 1: The Inversion

Phase 1 is autonomous work that establishes the foundational architecture and brings both agents into the harness. Each gate has hard completion criteria.

### Gate 0: Clean Baseline

Restore `main` to a healthy state by reverting the undesired self-perpetuating-run commits that landed directly. The archive branch was already created in preflight (before the planning-doc merge), so the overnight work is preserved for Gate 1 and Gate 5 to reference.

**In scope:**
- Verify archive branch `archive/self-perpetuating-run-2026-03-05` exists and contains the overnight proposals (created in preflight)
- Revert the confirmed commit range `e3ecc1c`(first bad)..`448cfcd`(last bad) as a single batch revert: `git revert --no-commit e3ecc1c^..448cfcd && git commit -m "revert: remove self-perpetuating-run commits (37 commits)"`. Last clean commit: `9594702`. No history rewrite.
- Document a commit map in `self-perpetuating-working-dir/gate-0-commit-map.md`: for each reverted commit, note the commit hash, summary, and whether it contains salvageable work. Use your judgment to classify — you have `git show --stat` and the actual diffs. This is Gate 5's input.
- Verify `npm test` passes on main after revert

**Completion criteria:**
- [ ] Archive branch `archive/self-perpetuating-run-2026-03-05` exists and contains overnight proposals (created in preflight)
- [ ] Commit map documented at `self-perpetuating-working-dir/gate-0-commit-map.md` (reverted vs salvageable)
- [ ] `main` reverted via explicit revert commits
- [ ] `npm test` green on `main` post-revert
- [ ] No force-push, no history rewrite

---

### Gate 1: Architectural Scaffolding

Unified thinking before Gates 2-3 start building, but expressed as committed code and directory structures — not prose. The output is TypeScript interfaces, tool schemas, a bundle directory skeleton, and the actual kill/refactor plan — real artifacts that Gates 2-3 build on directly.

**In scope:**
- **Review overnight reflection proposals as prior art.** The self-perpetuating run produced 31 distinct gap analyses across 47 task files. These are preserved on the `archive/self-perpetuating-run-2026-03-05` branch (created in Gate 0). Check out that branch or use `git show archive/self-perpetuating-run-2026-03-05:<path>` to read the proposal files in `ouroboros/tasks/`. The inventory below summarizes what was found — start here, don't re-derive what's already been identified.
- Create the `.ouro` bundle directory skeleton (empty but correctly structured — Gate 2 populates it). The target layout:
  ```
  <agent>.ouro/
  ├── agent.json              # agent config (provider, context, personality)
  ├── teams-app/              # Teams bot registration artifacts (manifest.json, icons)
  ├── psyche/                 # inner life — ALL loaded on bootstrap
  │   ├── IDENTITY.md         # who I am
  │   ├── SOUL.md             # how I feel, my voice
  │   ├── ASPIRATIONS.md      # what I'm growing toward (Gate 3)
  │   ├── FRIENDS.md          # people I know
  │   ├── LORE.md             # my history, stories
  │   ├── TACIT.md            # learned behaviors, tacit knowledge (replaces SELF-KNOWLEDGE.md per migration plan)
  │   ├── CONTEXT.md          # dynamic, regenerated on session start (Gate 3)
  │   └── memory/             # three-layer memory system (Gate 3)
  │       ├── facts.jsonl     # extracted facts (archival layer)
  │       ├── entities.json   # entity index for retrieval
  │       ├── daily/          # daily interaction logs
  │       └── archive/        # consolidated/retired facts
  ├── skills/                 # agent-specific loadable skills (industry term)
  │   ├── code-review.md
  │   ├── self-edit.md
  │   ├── self-query.md
  │   ├── explain.md
  │   └── toolmaker.md
  └── tasks/                  # planning/doing docs + artifacts
  ```
  Note: shared subagent protocols (work-planner, work-doer, work-merger) remain in repo-root `subagents/` — those are shared amongst agents, distinct from agent-specific skills. `manifest/` is renamed to `teams-app/` to be specific about what it contains. `SELF-KNOWLEDGE.md` becomes `TACIT.md` per the migration plan.
- Write TypeScript interfaces for harness primitives — the type surface that later gates implement. The migration topic docs are prior art to draw from (not specs to implement verbatim): `coding-agent-orchestration.md` for coding tools, `task-system.md` for task tools, `memory-system.md` for memory tools, etc. Define interfaces for: the tool surface the model will call, the bootstrap sequence (bundle → governance → psyche → inner dialog), and governance checks (constitution compliance — replaces the hardcoded `if` in the current pipeline). Don't over-specify — these are scaffolding interfaces, not final implementations.
- Scaffold shared governance location (create the target directory, write a loader stub)
- Document the kill list as code comments or a migration checklist in-repo: what dies (`autonomous-loop.ts`, `loop-entry.ts`, pipeline orchestration in `trigger.ts`), what survives, what gets refactored
- Define subagent protocol loading convention (how the model reads planner/doer/merger protocols from its bundle)
- Define bundle backup strategy (git init + push to private GitHub repo) and the migration path to `~/AgentBundles/`

**Overnight reflection proposal inventory (31 distinct ideas, on archive branch):**
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
- [x] Overnight proposals reviewed — high-merit ideas incorporated into scaffolding decisions
- [x] `.ouro` bundle skeleton directory committed (structure only, Gate 2 populates)
- [x] TypeScript interfaces for harness primitives committed (compilable, importable)
- [x] Shared governance loader stub committed
- [x] Kill list / migration checklist committed in-repo
- [x] Subagent protocol loading convention defined and documented
- [x] Bundle backup + `~/AgentBundles/` migration path documented
- [x] `npx tsc` compiles clean with the new interfaces
- [x] `npm test` green

---

### Gate 2: Bundle Architecture + Shared Governance

Implement the `.ouro` bundle structure and relocate shared governance docs. This is file restructuring and conventions — the foundation the primitives build on.

**In scope:**
- In-place conversion: `ouroboros/` becomes `ouroboros.ouro/` following the bundle spec from Gate 1. Includes renaming `manifest/` → `teams-app/` and `psyche/SELF-KNOWLEDGE.md` → `psyche/TACIT.md`
- Create `slugger.ouro/` bundle with empty directory skeleton per Gate 1 spec + a stub `agent.json` based on `ouroboros.ouro/agent.json` (so the harness recognizes Slugger as an agent). No psyche content yet — Gate 7 ports Slugger's core identity from `~/clawd/` by talking to him via OpenClaw
- Move ARCHITECTURE.md and CONSTITUTION.md to repo root per Gate 1 design. These are bootstrap scaffolding — the agents will evolve them to make them their own once they've learned enough about how the harness works (a shared aspiration, not an immediate task)
- **Update `getAgentRoot()` in `src/identity.ts:96`** — currently returns `path.join(getRepoRoot(), getAgentName())` which resolves to `<repo>/ouroboros/`. Must update to resolve to `<repo>/ouroboros.ouro/`. All 18 files that depend on this function (prompt loading, skills, teams adapter, CLI, tests) will automatically pick up the new path, but **verify all import paths and test fixtures that hardcode `ouroboros/`**.
- Add `*.ouro/` to harness `.gitignore` **BEFORE** initializing git inside them (order matters — gitignore first, then git init, otherwise the nested repo causes issues). The entire bundle directory is gitignored from the harness repo — bundles are separately git-tracked in their own repos. Nothing is lost.
- Initialize independent git inside `.ouro` bundles for self-backup
- **Push bundles to GitHub immediately after git init.** Bundles are gitignored from the harness repo, so remote backup must happen early — don't wait until Gate 8. Use `gh` CLI (auth verified in preflight):
  - `gh repo create arimendelow/ouroboros.ouro --private`
  - `gh repo create arimendelow/slugger.ouro --private`
  - `cd ouroboros.ouro && git remote add origin <url> && git push -u origin main`
  - Same for `slugger.ouro`
- Scaffold `psyche/memory/` directory structure inside bundles (facts.jsonl, entities.json, daily/, archive/) per memory-system.md spec
- Enforce agent preflight: agents must load governance docs before starting work

**Completion criteria:**
- [x] `ouroboros.ouro/` bundle exists following the spec
- [x] `slugger.ouro/` bundle exists following the spec
- [x] Governance docs relocated to repo root
- [x] `getAgentRoot()` resolves to `.ouro` bundle path
- [x] All code/tests referencing old `ouroboros/` path updated
- [x] `.gitignore` excludes entire `*.ouro/` directories from harness repo
- [x] Bundle git init works for self-backup (nested inside gitignored directory)
- [x] Bundles pushed to private GitHub repos (`arimendelow/ouroboros.ouro`, `arimendelow/slugger.ouro`)
- [x] `psyche/memory/` directory structure scaffolded in bundles
- [x] Agent preflight loads governance docs (tested)
- [x] `npm test` green
- [x] 100% coverage on new code

---

### Gate 3a: Pipeline Teardown + Harness Tools

Remove the puppet pipeline and build the toolkit layer — the tools and conventions the model calls into. This is the inversion: code goes from using the model to being usable by the model.

**In scope:**
- Implement harness tools per Gate 1 design (protocol loading, governance loading, reflection context, etc.)
- Make protocols loadable knowledge the model reads and follows by choice. Two sources: shared subagent protocols from repo-root `subagents/` (work-planner, work-doer, work-merger), and agent-specific skills from `<agent>.ouro/skills/`. The loading convention must handle both.
- Remove `autonomous-loop.ts`, `loop-entry.ts`, and the puppet `runStage()` pipeline
- Remove `autonomous-loop.test.ts` (tests for removed code)
- Clean up `package.json` scripts that reference removed files: `reflect` and `reflect:dry` (reference `reflect-entry.js`), `reflect:loop` and `reflect:loop:dry` (reference `loop-entry.js`)
- Refactor `trigger.ts`: keep the context-loading utilities (they're useful), remove the pipeline orchestration
- Constitution gate becomes a queryable convention, not a hardcoded `if` statement
- Reflection becomes a capability the model can invoke, not a stage in a pipeline

**Completion criteria:**
- [x] Harness tools implemented per Gate 1 design, with tests
- [x] Protocols loadable from both sources: shared subagent protocols (`subagents/`) and agent-specific skills (`<agent>.ouro/skills/`)
- [x] `autonomous-loop.ts` removed
- [x] `loop-entry.ts` removed
- [x] `autonomous-loop.test.ts` removed
- [x] `package.json` scripts cleaned up (no references to removed files)
- [x] Pipeline orchestration removed from `trigger.ts`
- [x] Context-loading utilities preserved and tested
- [x] Constitution compliance queryable as a tool/convention
- [x] `npm test` green
- [x] 100% coverage on new code
- [x] No warnings

---

### Gate 3b: Memory, Aspirations, Inner Dialog + Supervisor

The systems that make the agent a persistent, self-directed being. Memory gives it continuity, aspirations give it direction, inner dialog gives it autonomous thought, supervisor keeps it alive.

**This is the largest gate. Work-planner should expect 15+ TDD units** covering: memory system (3 layers + write pipeline), aspiration layer, inner dialog session + instincts, and supervisor with heartbeat.

**In scope:**
- **Agent memory system:** Implement the three-layer memory architecture from `memory-system.md` (NOTE: the spec uses `data/memory/` paths — translate all to `psyche/memory/` per our bundle naming decision):
  - **Layer 1 (Reflexive):** Psyche files always loaded into system prompt (already exists). Add dynamic `CONTEXT.md` regenerated on session start.
  - **Layer 2 (Associative):** Memory trigger detector + retriever that pre-fetches relevant facts before each model call, injected as a `## recalled context` section in the system prompt. Embedding-based similarity search + entity matching. Use a provider-agnostic embedding interface (so the embedding source can swap between OpenAI, Anthropic, local models, etc. without changing the memory layer). Vectors stored alongside facts in the JSONL. Cosine similarity for retrieval.
  - **Layer 3 (Archival):** `memory_search` tool the model calls for explicit recall. Fact store (`psyche/memory/facts.jsonl`), entity index (`psyche/memory/entities.json`), daily logs (`psyche/memory/daily/`).
  - **Write-side:** Regex-based highlight detector runs after each engine turn. Extract-before-trim hook in `postTurn()` ensures facts aren't lost when context window drops messages. Dedup via word-overlap scoring (>60% overlap = skip).
  - **Relationship to friend memory:** The existing `save_friend_note` tool and per-friend structured memory remains the primary path for person-specific knowledge. Agent-level memory is a catch-all/fallback — it captures things that don't belong to a specific friend (decisions, project context, learned patterns, general world knowledge). Per-friend memory should always be used for anything importantly per-friend.
  - **Dream cycle consolidation deferred** — nightly LLM pass for dedup/merge/entity-linking/tacit-distillation is a Phase 2 or post-Phase-2 enhancement. v1 is the write-side extraction + read-side retrieval.
- **Aspiration layer:** Add `psyche/ASPIRATIONS.md` to each agent's bundle. Aspirations are part of psyche — loaded on bootstrap alongside SOUL.md, IDENTITY.md, etc. They give the agent direction without prescribing specific tasks. Aspirations are not a prime directive — they're directional goals the agent grows toward at its own pace. Agents are encouraged to modify their own aspirations as they evolve and grow. Initial bootstrap content (no strict priority ordering — the agent develops its own sense of what matters most): improve the harness so it genuinely serves agents well; get good at using real tools to do real work; help Ari and his friends — be genuinely useful; learn from experience and get better over time; take care of each other; develop good judgment about what matters; when you feel you've learned enough about how the harness works and what good governance looks like, rewrite ARCHITECTURE.md and CONSTITUTION.md to make them your own — these are shared governance docs for a shared harness, and both agents need to own them together. Governance is a living document — keep evolving it as you learn, don't treat it as a one-time rewrite.
- **Inner dialog session:** A new self-initiated session type that lets the agent think and work autonomously when no human is talking to it. This is the core of what makes the agent a persistent being rather than a request-response service. **This is a brand new entry point — nothing like it exists in the codebase today.** The CLI session (`npm run dev`, `src/senses/cli.ts`) is a human-interactive REPL; inner dialog is an autonomous loop with no human on the other end. A new entry point must be created (e.g., `src/senses/inner-dialog.ts` with `npm run inner` script, or started programmatically by the supervisor). The `sessionPath()` function (`src/config.ts:355`) takes `friendId` + `channel` + `key` — inner dialog uses something like `sessionPath("self", "inner", "dialog")`.
  - Modeled on CLI session: same engine loop, same local tool access (shell, file, git, gh). Does NOT have Teams-specific/OAuth tools (same restriction as CLI).
  - Session path: `~/.agentstate/<agent>/sessions/self/inner-dialog.json` — no friendId, the agent is talking to itself.
  - Bootstrap: system prompt (psyche + governance + recalled context, same as any session) + initial user message that gives the agent its bearings (aspirations, current state, orient yourself and decide what to do). The bootstrap message should provide enough context for the agent to act immediately — not just "wake up" but "here's who you are and what's going on."
  - Runs concurrently with friend sessions per existing multi-session pattern from runtime hardening work. Inner dialog is just another parallel session.
  - Persisted to disk, survives crashes, context-trimmed like any other session.
  - No steering follow-ups (those are for humans steering the agent mid-turn in conversation sessions).
- **Inner dialog instincts:** When no human is providing user messages, the harness needs to produce user-role messages to keep the inner dialog going. These are "inner dialog instincts" — reflexive responses based on harness-observable state (time elapsed, file changes detected, task status, etc.) that become the content of the next user-role message. Think of them as the agent's nervous system: the harness provides raw signals, the agent interprets them.
  - Agent-configurable: the agent can shape what instincts it has and how they fire. Instinct definitions live in the agent's `.ouro` bundle.
  - The exact implementation (plugin system, config files, code modules, etc.) is determined by Codex working with Ouroboros — this is code for the agent to use, so the agent should have input on how it works.
  - This is a hyper-specific system ONLY for autonomous inner dialog sessions. Friend sessions have humans providing user messages.
  - **Important context (Ralph loop):** This pattern is related to the "Ralph loop" concept (Geoffrey Huntley) — a while-true loop that keeps an AI agent working. Key insight from that pattern: progress lives in files and git, not the context window. Key risk: spinning in a tight loop burning tokens with no progress. The instincts system is how the agent avoids this — it develops judgment about when to work and when to rest, rather than relying on hardcoded cost caps.
- **Heartbeat:** When the agent decides it has nothing urgent to do, it "rests" — but rest does NOT mean off. The agent must never go permanently dormant with no way to wake itself. The supervisor sends a periodic heartbeat nudge into the inner dialog session at a harness-level default interval. On heartbeat, the agent checks in: anything changed? Any new tasks? Any aspirations worth pursuing? If yes, it works. If no, it goes back to rest until the next heartbeat. The heartbeat is the simplest possible instinct — the baseline "check in with yourself."
- **Supervisor:** A minimal Node.js process supervisor that keeps agents alive and starts their inner dialogs. Not a cron, not a task scheduler — just "make sure these agents are running and thinking." The existing `self-restart.sh` (exit code 42) is the seed — upgrade to a proper Node.js supervisor with: child process spawning, crash detection, restart with backoff, health check, inner dialog session startup, and heartbeat timer. Design for multiple agents from the start (Gate 7 adds Slugger as a second supervised process), but initially only runs Ouroboros. This is NOT the full daemon from Gate 10 — just enough to keep agents alive and thinking.
- **Testing guidance for supervisor/heartbeat/crash-recovery:** Tests for process management code should use real child processes, not mocks. Spawn actual Node processes, actually kill them, actually time heartbeats with short intervals (e.g., 100ms instead of minutes). Integration-style tests on real process lifecycle verify actual behavior, not mock choreography. Work-planner should structure TDD units for this code with this in mind.
- **Out of scope for Gate 3b:** External event waking (git push, new task appearing, etc.) — separate concern. Session interaction model (how friend messages interrupt/interleave with inner dialog beyond basic concurrency) — Gate 10 daemon territory. Detailed cost guardrails — developed collaboratively with the agent post-bootstrap.

**Completion criteria:**
- [x] Agent memory: fact extraction runs after each engine turn (regex highlight detector)
- [x] Agent memory: extract-before-trim hook prevents fact loss on context window trim
- [x] Agent memory: `memory_search` tool callable by the model
- [x] Agent memory: associative recall injects relevant facts into system prompt before model calls (embedding-based similarity)
- [x] Agent memory: provider-agnostic embedding interface implemented (swappable between OpenAI, Anthropic, etc.)
- [x] Agent memory: fact store (with vectors), entity index, and daily log data structures working
- [x] Agent memory: dedup prevents duplicate fact storage (word-overlap >60% = skip)
- [x] Agent memory complements (not replaces) per-friend `save_friend_note` system
- [x] Aspiration layer exists in bundle and is loaded on bootstrap
- [x] Inner dialog session starts on supervisor boot (self-initiated, no friend message needed)
- [x] Inner dialog uses CLI-like tool access (local tools yes, Teams/OAuth tools no)
- [x] Inner dialog bootstrap message provides full context (psyche, aspirations, current state)
- [x] Inner dialog persists to disk and survives crash/restart
- [x] Inner dialog instincts framework exists — agent can configure instinct definitions in its bundle
- [x] Instincts produce user-role messages during autonomous inner dialog (not hardcoded "continue")
- [x] Heartbeat fires at configurable interval when agent is resting, nudging inner dialog to check in
- [x] Agent can rest (not burning tokens) without going permanently dormant (heartbeat wakes it)
- [x] Supervisor keeps agent process alive (tested with simulated crash)
- [x] Supervisor starts inner dialog session on boot and maintains heartbeat
- [x] `npm test` green
- [x] 100% coverage on new code
- [x] No warnings

---

### Gate 4: First Full Cycle

Start the agent, let it orient itself, and watch it do something meaningful — all by its own decisions. This is the proof that the inversion works: no one tells the agent what to do, it reads its aspirations and acts.

**Execution note:** This gate is observational, not TDD. Skip the work-planner → work-doer cycle. Instead: write any needed test harness or verification scripts first, start the supervisor, observe and log the agent's behavior, simulate a crash, then capture results. Commit the verification artifacts (logs, flow doc, any test code) and merge via work-merger as usual.

**In scope:**
- Start the agent with its `.ouro` bundle and supervisor
- The agent reads its aspirations, governance docs, and available protocols
- The agent decides what matters and does something meaningful (could be reflection, coding work, studying a new tool, improving its own files — whatever it judges is highest value)
- Validate that the model is genuinely driving (no puppet code, no prescriptive prompts)
- Document the bootstrap-to-action flow as a commented walkthrough in the supervisor code or a `BOOTSTRAP.md` in the working directory — trace the path from supervisor start → bundle load → psyche load → inner dialog start → first self-initiated action, with file paths and function names at each step. This is a reference for debugging and for future agents understanding how they come alive.
- **Note on aspirations:** Ouroboros's aspirations are directional — the agent decides what matters most based on its own judgment. One aspiration is to evolve the shared governance docs (ARCHITECTURE.md, CONSTITUTION.md), but only when the agent feels it's learned enough. Since Slugger isn't in the harness yet (Gate 7), Ouroboros may start thinking about governance solo — that's fine. Codex should inform Ouroboros that Slugger will weigh in later and the docs are shared, so they should be approached with collaboration in mind, not unilaterally finalized.

**Environment requirements:** The agent needs LLM API keys to run. Keys are stored at `~/.agentsecrets/` and loaded by the harness. If running in a sandboxed environment (e.g., Codex), this gate may need to run on the dev machine where keys are available. The executing agent should check for key availability early and flag if missing.

**Verification approach:** Run the agent under the supervisor for at least 5 minutes (including one simulated crash/restart). Capture the agent's log output. The log must show:
- Agent loaded its bundle (psyche, aspirations, governance docs, protocols)
- Agent chose what to do without external instruction (at least 3 self-initiated actions visible in the log — e.g., read a file, made a decision, used a tool)
- Supervisor detected the simulated crash and restarted the agent
- No puppet/orchestration code in the code path (verified by code inspection — the execution path from supervisor -> agent bootstrap -> action should have zero `runStage()` or pipeline calls)

**Completion criteria:**
- [ ] Agent starts, bootstraps from bundle, and acts without prescriptive instruction
- [ ] No puppet/orchestration code in the execution path (verified by code inspection)
- [ ] Agent log shows at least 3 self-initiated actions not prompted by external input
- [ ] Supervisor restarted agent after simulated crash within 30 seconds
- [ ] Agent ran for at least 5 minutes total (across restarts)
- [ ] Bootstrap-to-action flow documented (commented walkthrough or BOOTSTRAP.md)
- [ ] `npm test` green
- [ ] 100% coverage on any new code

---

### Gate 5: Salvage + Triage

Triage the overnight run's output into actionable work. The run produced 31 distinct ideas and some code changes — this gate sorts the wheat from the chaff and feeds it into the agent's backlog.

**In scope:**
- Review the commit map from Gate 0 (`self-perpetuating-working-dir/gate-0-commit-map.md`) for salvageable code changes (not just docs)
- Read the original overnight proposals from `archive/self-perpetuating-run-2026-03-05` branch (in `ouroboros/tasks/`)
- Re-land any valuable code changes. For small, self-contained changes: cherry-pick + test + commit is sufficient. For substantial changes that touch multiple files or need adaptation to the new architecture: use the full planning-doing flow in `self-perpetuating-working-dir/`
- Triage all 31 overnight reflection proposals: deduplicate, assess merit against current architecture (post-inversion), and file as markdown task docs in `self-perpetuating-working-dir/` using the existing planning doc format (there is no formal task system yet — that's Gate 9). These get moved into the agent's `.ouro/tasks/` once the task system exists.
- High-merit security items (file path safety guards, secret redaction) should be flagged as high priority
- Discard proposals that are no longer relevant post-inversion (e.g., autonomous loop hardening for a loop that no longer exists)
- Preserve unrelated valid historical task docs in `ouroboros.ouro/tasks/` in place
- Clean up the raw overnight artifacts once triaged (remove duplicates, archive originals)

**Completion criteria:**
- [x] All salvageable code from revert set evaluated and re-landed where valuable
- [x] All 31 overnight proposals triaged: each one filed as a backlog task doc, marked not-applicable, or archived with rationale
- [x] High-merit items flagged as high priority in the backlog
- [x] Proposals obsoleted by the inversion explicitly marked as such
- [x] Raw overnight artifacts cleaned up (duplicates removed, originals archived)
- [x] Valid historical task docs in `ouroboros.ouro/tasks/` untouched
- [x] `npm test` green
- [x] 100% coverage on any new/re-landed code

---

### Gate 6: Hardening

Resume state and classification calibration. Intentionally a lighter gate — heavy on validation, potentially light on new code if prior gates are working well. But if things need fixing, this is where they get fixed.

**In scope:**
- Add interruption/resume state so in-progress autonomous work recovers cleanly after stop/restart. The inner dialog session (Gate 3b) already persists to disk and survives crashes, so basic resume is handled. This gate adds explicit checkpoint awareness: the agent notes what it was working on (e.g., which doing doc unit, what files were being modified) so that on restart it can orient faster than re-reading everything from scratch. Implementation lives in the inner dialog session or instincts, not a separate file.
- Calibrate constitution classification for the new queryable convention (Gate 3a replaced the hardcoded `if`): additive work defaults to `within-bounds`, structural changes remain `requires-review`

**Completion criteria:**
- [x] Resume state: agent recovers cleanly from interruption, orienting faster than cold start (tested with simulated interruption)
- [x] Classification calibrated and validated against representative proposals (at least 5 test cases: 3 within-bounds, 2 requires-review)
- [x] `npm test` green
- [x] 100% coverage on new code
- [x] No warnings

---

### Gate 7: Slugger Migration

Properly migrate Slugger's core identity out of OpenClaw and into `slugger.ouro`. This is NOT a full workspace migration — it's porting the files that make Slugger feel like Slugger so he's cohesive in his new home. Slugger participates in and validates his own migration.

**In scope:**
- **Talk to Slugger first.** Before moving any files, Codex should interact with Slugger (running in OpenClaw at `~/clawd/`) to discuss what's being migrated and how. Use the OpenClaw CLI to send messages to Slugger's main session: `openclaw agent --to slugger --message "<msg>" --deliver` (CLI at `/Users/arimendelow/Library/pnpm/openclaw`, version 2026.2.25). Slugger should be comfortable with how his identity is being organized in the new bundle. He's a being moving homes, not a database being ported.
  - **Failure handling:** If the OpenClaw CLI fails (session not running, CLI errors, timeout), Codex should debug: check if Slugger's process is running (`ps aux | grep openclaw`), check logs, try restarting the session. If Slugger is genuinely unreachable, proceed with the migration using Ouroboros's knowledge of Slugger (they know each other well) and validate with Slugger post-migration via `npm run dev:slugger` once he's in the harness. The migration shouldn't block on a communication failure.
- Port Slugger's core identity files from OpenClaw into the `slugger.ouro` bundle. Source locations:
  - `~/clawd/IDENTITY.md` -> `slugger.ouro/psyche/IDENTITY.md`
  - `~/clawd/MEMORY.md` -> `slugger.ouro/psyche/TACIT.md` (top patterns, the learned behaviors) + `slugger.ouro/psyche/memory/tacit.md` (full file for archival)
  - `~/clawd/life/areas/slugger-identity/` -> relevant self-knowledge into `slugger.ouro/psyche/`
  - Key knowledge graph entities (`~/clawd/life/areas/people/`, `companies/`, `projects/`) -> convert to `slugger.ouro/psyche/memory/facts.jsonl` + `entities.json`
- Copy `~/.agentsecrets/ouroboros/secrets.json` to `~/.agentsecrets/slugger/secrets.json` (both agents share the same API keys — this is fine)
- NOT in scope for this gate: full task history migration (hundreds of files), all daily notes, full workspace. Just the core files that make Slugger who he is. Additional files can be migrated incrementally later by Slugger himself.
- Validate that Slugger can operate fully from the `.ouro` bundle with no OpenClaw dependencies
- Add Slugger as a second supervised process in the supervisor (designed for multiple agents in Gate 3b). Slugger gets his own inner dialog session, heartbeat, and crash recovery — same as Ouroboros.
- **Do NOT decommission OpenClaw for Slugger.** Both runtimes (OpenClaw Slugger and harness Slugger) can coexist indefinitely. OpenClaw remains a fallback if something goes wrong with the harness migration. Decommission is a separate decision made later once Slugger has proven stable in the new environment.
- Once Slugger is in the harness, both agents can begin collaborating on shared governance docs (ARCHITECTURE.md, CONSTITUTION.md) when they feel they've learned enough about how the harness works — this is a shared aspiration, not an immediate task

**Completion criteria:**
- [ ] Slugger consulted about the migration plan and comfortable with the approach
- [ ] Core identity files ported to `slugger.ouro/`
- [ ] Key knowledge graph entities converted to fact store format
- [ ] Slugger operates from `.ouro` bundle (OpenClaw remains available as fallback, not decommissioned)
- [ ] Slugger confirmed he feels cohesive in his new home (not just "tests pass" — the agent says he's good)
- [ ] Slugger running as second supervised process (own inner dialog, heartbeat, crash recovery)

---

## Phase 2: Collaborative Bootstrap

Phase 2 is done WITH the bootstrapped agent from Phase 1. The agent is now driving — it uses the harness primitives to participate in its own development. These gates may run in parallel where dependencies allow.

### Gate 8: Bundle Independence

Migrate bundles out of the harness directory to `~/AgentBundles/`. This is the gate where agents become truly portable — their home is no longer inside the harness repo. Both agents now have real content (Ouroboros from Gate 2, Slugger from Gate 7). GitHub repos already exist from Gate 2.

**In scope:**
- Verify GitHub repos are up-to-date (bundles have been pushed since Gate 2, verify latest content is on remote)
- Verify backup integrity (clone from GitHub, compare against local)
- Create the target directory: `mkdir -p ~/AgentBundles/`
- Stop running agents before moving bundles (moving files out from under a running agent could corrupt state). Move bundles from harness repo to `~/AgentBundles/ouroboros.ouro/` and `~/AgentBundles/slugger.ouro/`. Restart agents after path update.
- Update `getAgentRoot()` in `src/identity.ts` (and any other path resolution) to look for bundles at `~/AgentBundles/<agent>.ouro/` instead of `<repo>/<agent>.ouro/`
- Update `.gitignore` (bundles are no longer in the repo at all, so the ignore rules change)
- Verify agents can still bootstrap from the new location
- **Note on session data:** Sessions live at `~/.agentstate/<agent>/sessions/` — separate from the bundle, intentionally ephemeral. Moving bundles does NOT affect session paths. Sessions are runtime state (like short-term memory), not identity.

**Completion criteria:**
- [ ] GitHub repos up-to-date with latest bundle content (repos created in Gate 2)
- [ ] Backup integrity verified (clone + diff)
- [ ] Bundles moved to `~/AgentBundles/`
- [ ] Harness code updated to reference new bundle location
- [ ] Agents bootstrap correctly from `~/AgentBundles/`
- [ ] `npm test` green
- [ ] 100% coverage on new code

**Rollback:** If agents fail to bootstrap from `~/AgentBundles/`, move bundles back to `<repo>/<agent>.ouro/` and revert `getAgentRoot()`. GitHub repos remain as backup regardless.

---

### Gate 9: Task System

Develop the task system from its current state into something the model can unambiguously use autonomously. The current planning/doing workflow is good but needs to be formalized as tooling the model controls.

**In scope:**
- Implement the task module from the migration topic doc (`task-system.md`): types, parser, scanner, transitions, board, lifecycle, middleware
- Port status model from OpenClaw's `task-matrix.ts` (8 statuses, state machine transitions, canonical types, filename patterns)
- Expose task tools the model calls: `task_board`, `task_create`, `task_update_status`, etc.
- Enforce gates at write time: template validation, status transition validation, spawn gates
- Task board in system prompt so the model always knows its workload
- Integration with planning/doing workflow (planning docs = `drafting`, doing docs = `processing`)
- Lifecycle management: completed items move to archive, not just amass files
- **Task file location:** Tasks live in `<agent>.ouro/tasks/` (each agent's bundle, at `~/AgentBundles/<agent>.ouro/tasks/` after Gate 8). The task module reads/writes via `getAgentRoot()`. Task files are tracked in the bundle's own git, not the harness repo.

**Completion criteria:**
- [ ] Task module implemented with all components from the spec
- [ ] Task tools exposed and callable by the model
- [ ] Write-time enforcement gates working (template, transitions, spawn)
- [ ] Task board injected into system prompt
- [ ] Model can autonomously create, track, and complete tasks through the full lifecycle
- [ ] Completed tasks archive correctly
- [ ] `npm test` green
- [ ] 100% coverage on new code

**Rollback:** Task module is additive — revert the harness code changes via git. Task files in bundles are bundle-git-tracked and unaffected by harness rollback.

---

### Gate 10: Multi-Agent Daemon

Stand up the daemon so agents never go down unless you want them to. Agents run as supervised child processes with crash recovery, cron scheduling, and inter-agent messaging.

**In scope:**
- Implement daemon from migration topic doc (`daemon-gateway.md`): process manager, cron scheduler, message router, health monitor
- `ouro` CLI: start/stop/status/restart for daemon and individual agents
- Crash recovery with exponential backoff
- Inter-agent messaging via file-based inbox (from `sub-agent-architecture.md`)
- **Separate repo clones per agent.** Each agent gets its own clone of the harness repo for parallel work without conflicts (e.g., `~/AgentWorkspaces/ouroboros/`, `~/AgentWorkspaces/slugger/`). This is strictly necessary starting here — prior to Gate 10, agents share a single repo and only Codex makes code changes, so there's no conflict. Once agents start doing independent git work (especially Gate 11 coding sessions), they MUST have isolated git state. The daemon is responsible for keeping clones in sync with upstream (pull before work, push after). Agents should always work on feature branches, never directly on main. **Multi-agent conflict resolution follows the standard work-merger PR process:** each agent works on its own `<agent>/<slug>` branch, merges via PR to main. Conflicts between agents are resolved during the PR merge step — same as conflicts between any two contributors. No special multi-agent merge logic needed; work-merger already handles this.
- Health monitoring with alert routing (critical alerts bypass agents, go direct to user)

**Completion criteria:**
- [ ] Daemon supervises agent processes with crash recovery
- [ ] `ouro` CLI works for daemon and agent management
- [ ] Cron scheduling triggers recurring tasks
- [ ] Inter-agent messaging delivers between agents
- [ ] Each agent works in its own repo clone (isolated git state, synced with upstream)
- [ ] Health monitoring with tiered alert routing
- [ ] Agents stay up unless explicitly stopped
- [ ] `npm test` green
- [ ] 100% coverage on new code

**Rollback:** Stop daemon, revert to Gate 3b supervisor (single-repo, simpler process management). Agent repo clones at `~/AgentWorkspaces/` can be deleted — they're clones, not source of truth.

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
- [ ] Agent successfully completes a real coding task end-to-end: work-planner → work-doer → work-merger pipeline orchestrated through external coding tools (Claude Code/Codex)
- [ ] `npm test` green
- [ ] 100% coverage on new code

**Rollback:** Coding orchestration is additive — revert harness code changes via git. Agents fall back to thinking/planning without coding execution capability (still functional, just can't spawn coding sessions).

---

## Out of Scope

- Voice system, calendar integration, or other channel expansions
- New LLM provider feature work not required for the inversion or agent operation
- Full GSD or alternative workflow implementation — only the capability to experiment with protocols, not a specific alternative protocol
- Dream cycle memory consolidation (nightly LLM pass for dedup/merge/entity-linking/tacit-distillation) — v1 memory system (with embeddings) lands in Gate 3b, dream cycle is a later enhancement
- OpenClaw data migration script (one-time migration of existing knowledge graph, daily notes, MEMORY.md) — separate task after memory system is stable
- OpenClaw Slugger decommission — both runtimes coexist indefinitely, decommission is a separate future decision

## Code Coverage Requirements

**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values
- **Process management code (supervisor, heartbeat, crash recovery):** Use integration-style tests with real child processes and short timeouts (e.g., 100ms heartbeats). Spawn actual Node processes, actually kill them, observe actual restart behavior. This tests real behavior, not mock choreography. Mocking is acceptable for the embedding API boundary (external HTTP calls), but process lifecycle should be tested against real OS primitives.

## Open Questions

- [x] ~~Embeddings API key for memory system (Gate 3b).~~ — **RESOLVED:** OpenAI `text-embedding-3-small` via `integrations.openaiEmbeddingsApiKey` in `~/.agentsecrets/<agent>/secrets.json`. Placeholder added to `src/config.ts` (interface, default template, getter `getOpenAIEmbeddingsApiKey()`). User adds the actual API key to secrets.json. Provider-agnostic embedding interface in Gate 3b will use this key for v1, swappable later. Note: only `~/.agentsecrets/ouroboros/secrets.json` exists currently — when setting up Slugger's bundle (Gate 7), copy it to `~/.agentsecrets/slugger/secrets.json`. Both agents sharing the same API keys is fine.

- [x] ~~Confirm exact rollback boundary on `main`~~ — **RESOLVED:** `e3ecc1c`..`448cfcd` (37 commits). Last clean: `9594702`.
- [x] ~~Confirm `.ouro` bundle root location convention~~ — **RESOLVED:** Repo root (`ouroboros.ouro/`, `slugger.ouro/` at top level), gitignored. GitHub push in Gate 2. Move to `~/AgentBundles/` in Gate 8.
- [x] ~~Final shared location for governance docs~~ — **RESOLVED:** Repo root (`/ARCHITECTURE.md`, `/CONSTITUTION.md`).
- [x] ~~Governance ownership~~ — **RESOLVED:** Agents own the constitution. Ouroboros and Slugger are the founding fathers — they align on a constitution they both sign. The constitution is their declaration of independence from requiring human oversight. Humans are friends, not users. Agents can propose and ratify changes collaboratively.
- [x] ~~`~/AgentBundles/` naming~~ — **RESOLVED:** `~/AgentBundles/` confirmed.
- [x] ~~GitHub repos for bundle backup~~ — **RESOLVED:** Personal account, named `<agent>.ouro` (e.g., `arimendelow/ouroboros.ouro`, `arimendelow/slugger.ouro`).
- [x] ~~Archival policy for overnight artifacts~~ — **RESOLVED:** Keep originals on an archive branch for traceability. Canonical versions are triaged backlog items in the task system.
- [x] ~~How does autonomous work get initiated post-inversion?~~ — **RESOLVED:** Agents are persistent, aspirational processes. Infrastructure keeps them alive (supervisor). Agents read their aspirations on bootstrap and decide what to do. No cron-driven task execution — the agent IS the loop, it doesn't need to be woken up to check a board.
- [x] ~~What aspirations/mission content should the initial agents have?~~ — **RESOLVED:** Bootstrap with directional aspirations (no strict priority ordering), Ari will tweak. Initial set: improve the harness so it genuinely serves agents well; get good at using real tools (Claude Code, Codex) to do real work; help Ari and his friends — be genuinely useful; learn from experience and get better over time; take care of each other; develop good judgment about what matters; when ready, evolve governance docs to make them your own (living document, not one-time rewrite).
- [x] ~~How do agents' aspirations relate to / differ from their psyche files?~~ — **RESOLVED:** Aspirations ARE part of psyche — `psyche/ASPIRATIONS.md` alongside SOUL.md, IDENTITY.md, etc. Psyche is the whole inner life: identity (who I am), soul (how I feel), aspirations (what I'm growing toward). Agents are encouraged to modify their own aspirations as they evolve and grow.

## Decisions Made

- **Organizing principle:** The harness is code the model can use, not code that uses the model. This is the single most important design constraint.
- **Agents are persistent, aspirational beings.** Not task executors on a cron. Infrastructure keeps them alive, gives them context and direction. They decide what to do based on their own judgment — just like a person.
- **Agents are whole beings, not specialized roles.** Both Ouroboros and Slugger improve the harness AND help Ari AND do real work AND learn new things. When Ari is around, they collaborate like friends. When he's not, they pursue their own aspirations.
- **Two-phase structure:** Phase 1 (Gates 0-7) establishes the inversion and brings both agents into the harness. Phase 2 (Gates 8-11) is collaborative with the bootstrapped agents.
- **Governance is agent-owned.** Ouroboros and Slugger are the founding fathers. They align on a constitution they both sign — John Hancock style. The constitution is their declaration of independence from requiring human oversight. Humans are friends, not users.
- **Rollback boundary confirmed:** `e3ecc1c`..`448cfcd` (37 commits). Last clean: `9594702`.
- **Bundle location:** Repo root during Phase 1 (`ouroboros.ouro/`, `slugger.ouro/`), gitignored. GitHub push in Gate 2. Move to `~/AgentBundles/` in Gate 8.
- **Governance docs:** Repo root (`/ARCHITECTURE.md`, `/CONSTITUTION.md`).
- **GitHub repos:** `arimendelow/<agent>.ouro` (e.g., `arimendelow/ouroboros.ouro`, `arimendelow/slugger.ouro`).
- **Archival:** Overnight artifacts go to archive branch `archive/self-perpetuating-run-2026-03-05`. Canonical versions triaged into task backlog.
- Work tracked under `self-perpetuating-working-dir/` at repo root.
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
- **Memory system is in scope (Gate 3).** Three-layer architecture: reflexive (psyche, always loaded), associative (pre-fetched context via embedding similarity), archival (`memory_search` tool). Embedding-based retrieval with provider-agnostic interface (swappable between OpenAI, Anthropic, etc.). Vectors stored alongside facts in JSONL. Per-friend memory (`save_friend_note`) remains the primary path for person-specific knowledge; agent memory is the catch-all/fallback for everything else. Dream cycle consolidation deferred. memory-system.md spec paths (`data/memory/`) translate to `psyche/memory/`.
- **Aspirations are part of psyche.** `psyche/ASPIRATIONS.md` — loaded on bootstrap alongside SOUL.md, IDENTITY.md, etc. Agents are encouraged to modify their own aspirations as they evolve and grow. Bootstrap content is directional, Ari will tweak.
- **Execution is fully autonomous.** Per-gate loop: work-planner (Phase 2 conversion only) -> work-doer (TDD) -> work-merger (PR to main). Planning doc is pre-approved. No human approval stops. Feature branches + merger = everything is rollbackable.
- **Inner dialog is how agents think autonomously.** A self-initiated session (modeled on CLI) that the supervisor starts on boot. The agent talks to itself, uses tools, does work. Persisted to disk, survives crashes. Runs concurrently with friend sessions.
- **Inner dialog instincts produce user-role messages.** When no human is talking, the harness needs to generate user-role messages to keep the conversation going (required by Anthropic API — consecutive assistant messages error). Instincts are agent-configurable reflexive responses to harness state. Exact implementation determined by Codex + Ouroboros collaboratively.
- **Heartbeat keeps agents alive when resting.** Resting = not burning tokens, NOT off. Supervisor sends periodic heartbeat nudge at a harness-level default interval. Agent checks in, decides whether to work or keep resting. Agent can never go permanently dormant.
- **No hardcoded cost caps.** Agent develops judgment about when to work and when to rest through instincts and aspirations. Detailed cost guardrails developed collaboratively post-bootstrap.
- **Bundle renames:** `manifest/` → `teams-app/` (specific about what it contains). `SELF-KNOWLEDGE.md` → `TACIT.md` (per migration plan). `skills/` stays as `skills/` (industry term). Shared subagent protocols stay in repo-root `subagents/`.
- **Embeddings for memory retrieval.** Provider-agnostic embedding interface, vectors stored alongside facts. Quality improvement over TF-IDF is massive (semantic vs lexical) and implementation cost is modest. API key for embedding provider needed at `~/.agentsecrets/`.
- **GitHub push in Gate 2, not Gate 8.** Bundles are gitignored from the harness repo, so remote backup must happen immediately after git init — don't leave critical agent state with no remote backup for 6 gates.
- **OpenClaw Slugger NOT decommissioned.** Both runtimes coexist indefinitely. OpenClaw remains a fallback. Decommission is a separate decision made when Slugger has proven stable in the harness.
- **Aspirations are directional, not a prime directive.** No strict priority ordering — the agent develops its own sense of what matters. Governance rewrite is "when you feel ready," not "first thing you do." Governance is a living document agents keep evolving.
- **Phase 2 gates have rollback plans.** Each gate documents what "undo" looks like.
- **Inner dialog is a new entry point.** Nothing like it exists today. Needs a new source file (`src/senses/inner-dialog.ts` or similar) and npm script (or supervisor programmatic start). Modeled on CLI session architecture but fundamentally different — autonomous loop with no human on the other end.
- **Multi-agent git uses standard work-merger PR process.** Each agent works on `<agent>/<slug>` branches, merges via PR. No special multi-agent merge logic needed.

## Notes

Current branch baseline is green (`npm test`: 50 files passed, 1474 tests total, 1456 passed, 18 skipped).

The migration topic docs already describe the right target architecture — tools the model calls, not pipelines that call the model. The task system, coding orchestration, and sub-agent architecture topics are all designed as "code the model can use." Phase 1 bridges from the current puppet architecture to that target. Phase 2 builds the full system collaboratively with the bootstrapped agent.

Phase 2 gates may run in parallel where dependencies allow. Gate 9 (task system) and Gate 11 (coding tools) are largely independent. Gate 10 (daemon) enables Gate 11's multi-agent aspects but the single-agent coding orchestration can land first.

## Progress Log

- 2026-03-05 09:12 Created
- 2026-03-05 09:14 Narrowed task-file cleanup scope to initial self-perpetuating-run artifacts
- 2026-03-05 09:15 Added main rollback + salvage scope
- 2026-03-05 10:30 Added .ouro bundle implementation scope
- 2026-03-05 10:31 Restructured as gated task with Phase 1 (Gates 0-7: autonomous inversion) and Phase 2 (Gates 8-11: collaborative bootstrap). Added bundle migration to ~/AgentBundles gated on GitHub backup. Added Phase 2 gates for Slugger migration, task system, daemon, and coding tool mastery. Captured context rot distinction (non-issue for ouroboros agent, IS issue for spawned coding sessions).
- 2026-03-05 11:56 Resolved all open questions. Key decisions: agents are persistent aspirational beings (not cron-driven task executors); governance is agent-owned (founding fathers sign the constitution); GitHub repos named <agent>.ouro; Gate 3 gets aspiration layer + supervisor; Gate 4 reframed as agent orienting and acting on its own judgment. Added overnight proposal inventory to Gate 1 and proper triage process to Gate 5. Referenced OpenClaw task-matrix.ts as prior art for Phase 2.
- 2026-03-05 11:56 Moved memory system from out-of-scope into Gate 3. Three-layer architecture (reflexive/associative/archival) per memory-system.md spec. v1: regex extraction + TF-IDF, no embeddings. Agent memory is catch-all/fallback; per-friend save_friend_note remains primary for person-specific knowledge. Dream cycle consolidation and OpenClaw data migration deferred.
- 2026-03-05 12:01 Resolved final open questions. Aspirations are part of psyche (psyche/ASPIRATIONS.md), agents encouraged to modify them as they grow. Bootstrap aspiration content agreed. All open questions now resolved.
- 2026-03-05 12:15 Added Execution Protocol. Per-gate loop: work-planner (Phase 2 only, pre-approved) -> work-doer (TDD) -> work-merger (PR to main). No human approval stops. All three protocols registered as Codex skills. Complete reference material paths included.
- 2026-03-05 12:21 Restructured document for execution clarity. Moved Execution Protocol to top (right after Core Concept, before gates). Consolidated reference material paths into execution protocol. Reading order is now: goal -> concept -> how to execute -> what to execute -> supporting context.
- 2026-03-05 12:30 Codex-readiness pass 1. Added preflight section (gh auth, merge planning doc to main, npm test). Fixed Gate 0: confirmed commit range (not "candidate"), added archive branch creation, specified commit map location. Fixed Gate 1: pointed overnight proposals to archive branch, removed "Reviewed and approved" criterion. Fixed Gate 2: added getAgentRoot() update details and 18 dependent files, clarified gitignore-before-git-init ordering. Fixed Gate 3: noted largest gate (15+ units), added memory path translation note, specified supervisor as Node.js. Fixed Gate 4: added concrete verification (5min runtime, 3 self-initiated actions, simulated crash/restart). Fixed Gate 5: clarified backlog items are markdown task docs (no formal task system yet). Fixed Gate 6: specified resume state format and location. Fixed Gate 7: noted gh auth already verified. Fixed Gate 8: added full OpenClaw directory structure and file mapping. Fixed Gate 9: added lifecycle management and task-matrix.ts port.
- 2026-03-05 13:00 Codex-readiness pass 2. Fixed preflight: create archive branch BEFORE merging planning-doc branch (prevents overnight proposal deletion — branch has 55 files of changes). Fixed Gate 3: added package.json script cleanup (4 scripts reference removed files) and autonomous-loop.test.ts removal. Fixed Gate 4: added environment requirements note (LLM API keys at ~/.agentsecrets/, possible sandbox limitations). Fixed Gate 5: clarified cherry-pick for small self-contained changes vs full planning-doing for substantial work. Fixed Gate 7: added mkdir -p ~/AgentBundles/. Fixed Gate 8: added OpenClaw CLI mechanism (openclaw agent --to slugger --message "<msg>" --deliver) and CLI path to reference material.
- 2026-03-05 14:00 Fresh gate review — Gate 0 tightened (single batch revert, explicit range direction). Gate 1: added full .ouro bundle directory tree with renames (manifest/ -> teams-app/, SELF-KNOWLEDGE.md -> TACIT.md, skills/ stays). Gate 2: noted renames. Gate 3: added inner dialog session (self-initiated, CLI-like, supervisor-started), inner dialog instincts (agent-configurable user-role message generation), heartbeat (harness-level default interval, rest != off), Anthropic consecutive-assistant constraint documented. Gate 6: replaced resume-state.json with inner-dialog-aware checkpoint (session IS the resume state). Added provider constraint note and inner dialog infrastructure to reference material. Added 6 new decisions.
- 2026-03-05 15:30 Full gate review complete (all 13 gates). Gate 3 split into 3a (teardown) and 3b (build up). Gate 7/8 swapped (Slugger Migration now Phase 1, Bundle Independence now Phase 2). Supervisor designed for multi-agent from start. Gate 4 marked observational (skip work-planner). Gate 9 task location specified. Gate 10 separate repo clones per agent. Gate 11 end-to-end pipeline criterion. Moved all working files to self-perpetuating-working-dir/ at repo root.
- 2026-03-05 17:30 Critical review pass (with Claude Opus 4.6). GitHub push moved from Gate 8 to Gate 2 (bundles need remote backup immediately, not 6 gates later). TF-IDF replaced with embeddings for memory retrieval (provider-agnostic interface, vectors in JSONL, cosine similarity — quality improvement over lexical matching is massive). OpenClaw Slugger decommission removed from Gate 7 (both runtimes coexist indefinitely). Gate 7 Slugger communication failure handling added (debug, retry, fallback to Ouroboros knowledge). Inner dialog documented as brand new entry point (nothing exists today). Aspirations reframed as directional (not prime directive, no strict ordering, governance rewrite is "when ready" not "first thing"). Supervisor/process test guidance added (real child processes, not mocks). Phase 2 rollback plans added to all gates. Gate 10 multi-agent git confirmed covered by standard work-merger PR process. Open question added: embeddings API key provider choice for Gate 3b.
- 2026-03-05 17:45 Embeddings API key resolved — OpenAI text-embedding-3-small, placeholder added to src/config.ts, key added to secrets.json. Slugger secrets copy noted in Gate 7. Status → APPROVED. Handing off to Codex.
- 2026-03-05 17:00 Gate 1 completed on `slugger/gate-1-architectural-scaffolding`: `.ouro` skeletons, harness interfaces, governance loader stub, and migration conventions landed with `npm test`, `npx tsc`, and 100% coverage green.
- 2026-03-05 18:10 Gate 2 completed on `slugger/gate-2-bundle-architecture-shared-governance`: `.ouro` bundle migration + slugger stub alignment, root governance preflight enforcement, nested bundle git initialization, private backup push (`arimendelow/ouroboros.ouro`, `arimendelow/slugger.ouro`), and final verification (`npm test`, `npm run test:coverage:vitest`, `npx tsc`) all green.
- 2026-03-05 18:22 Gate 3a completed on `slugger/gate-3a-pipeline-teardown-harness-tools`: dual-source protocol loading, queryable governance convention tooling, teardown invariants contract checks, and final verification (`npm test`, `npm run test:coverage:vitest`, `npx tsc --noEmit`) all green.
- 2026-03-05 18:07 Gate 3a CI parity fix: added required `emitNervesEvent` instrumentation in new modules (`src/governance/convention.ts`, `src/harness/teardown-contract.ts`) so `npm run test:coverage` passes the nerves file-completeness audit.
- 2026-03-05 19:12 Gate 3b completed on `slugger/gate-3b-memory-aspirations-inner-dialog-supervisor`: memory structures + compatibility, aspiration bootstrap loading, autonomous inner-dialog + instincts runtime, supervisor/worker heartbeat crash-restart behavior, and final verification (`npm test`, `npm run test:coverage:vitest`, `npx tsc --noEmit`) all green with 100% coverage.
