# ARCHITECTURE.md — Self-Model

> This file is maintained by Ouroboros during reflection cycles.
> It is the agent's map of itself — capabilities, gaps, and extension points.
> Last updated: 2026-03-05

## Module Inventory

### heart/ — Turn Coordination & Provider Abstraction
**Purpose:** Multi-provider LLM interface. Manages streaming, turn coordination, tool call dispatch.
**Key files:** `core.ts` (ProviderRuntime interface, agent loop), `streaming.ts`, `turn-coordinator.ts`, `kicks.ts` (disabled)
**Providers:** Azure, Anthropic, MiniMax, OpenAI-Codex (each in `providers/`)
**Extension points:**
- Add new provider: implement `ProviderRuntime` interface, register in `core.ts`
- Modify turn flow: `turn-coordinator.ts`

### mind/ — Prompt Assembly & Context Management
**Purpose:** Builds system prompt from psyche files, manages context window, friend memory, first impressions.
**Key files:** `prompt.ts` (system prompt builder), `context.ts` (sliding window trimming), `first-impressions.ts`
**Psyche loading:** SOUL.md, IDENTITY.md, LORE.md, FRIENDS.md — loaded lazily, cached.
**Extension points:**
- Add new psyche file: create in `ouroboros/psyche/`, update `loadPsyche()` in `prompt.ts`
- Adjust context strategy: `context.ts` trimMessages

### repertoire/ — Tools & Skills
**Purpose:** Tool definitions, execution, and skill loading. Also houses integration clients (ADO, GitHub, Graph).
**Key files:** `tools-base.ts` (core tools: read/write/shell/git/gh), `tools-teams.ts`, `tools-github.ts`, `ado-*.ts`, `skills.ts`
**Core tools:** read_file, write_file, shell, git_commit, gh_cli, final_answer
**Integration tools:** Teams messaging, ADO work items/semantic, GitHub issues
**Extension points:**
- Add new tool: create definition in a `tools-*.ts` file, register in `allDefinitions` array in `tools.ts`
- Add new skill: create `.md` file in `ouroboros/skills/`

### wardrobe/ — Identity & Formatting
**Purpose:** Output formatting, phrase tables for personality.
**Key files:** `format.ts`, `phrases.ts`
**Extension points:** Add phrase categories in `phrases.ts`, formatting modes in `format.ts`

### nerves/ — Observability
**Purpose:** Runtime event emission, coverage auditing.
**Key files:** `index.ts`, `runtime.ts`, `coverage/` (CLI audit tool)
**Extension points:** New event types in `runtime.ts`

### reflection/ — Autonomous Reflection & Loop
**Purpose:** Heartbeat trigger that loads self-model + constitution, runs reflection prompt, outputs task proposals. Autonomous loop chains reflection → plan → do → merge → restart.
**Key files:** `trigger.ts` (context loader, prompt builder, parser, proposal writer), `reflect-entry.ts` (single reflection CLI), `autonomous-loop.ts` (full pipeline orchestrator), `loop-entry.ts` (loop CLI)
**Extension points:**
- Modify reflection prompt: `buildReflectionPrompt()` in `trigger.ts`
- Change proposal format: `writeProposalTask()` in `trigger.ts`
- Adjust pipeline stages or add new ones: `runAutonomousLoop()` in `autonomous-loop.ts`
- Control max stages: `--max-stages N` CLI flag

### senses/ — Input Adapters
**Purpose:** CLI and Teams input channels.
**Key files:** `cli.ts` (interactive REPL), `teams.ts` (Bot Framework adapter)
**Extension points:** New input channel: implement adapter following `cli.ts` pattern

## Sub-Agent Pipeline (subagents/)

| Agent | Purpose |
|-------|---------|
| work-planner | Interactive planning → doing doc generation |
| work-doer | Sequential unit execution with strict TDD |
| work-merger | Branch sync, PR creation, merge, cleanup |

**Flow:** human request → planner → doing doc → doer → merger → main

## Skills (ouroboros/skills/)

| Skill | Purpose |
|-------|---------|
| self-edit | Safe self-modification with checklist |
| self-query | Spawn second instance for code review |
| toolmaker | Create new tools for repertoire |
| code-review | Code review methodology |
| explain | Explanation style guide |

## Configuration

- `ouroboros/agent.json` — Provider selection, context limits, phrase tables
- `ouroboros/psyche/` — Personality files loaded into system prompt
- `ouroboros/manifest/` — Teams app manifest

## Capability Matrix

| Capability | Status | Notes |
|------------|--------|-------|
| Multi-provider LLM | ✅ | Azure, Anthropic, MiniMax, OpenAI-Codex |
| Tool execution | ✅ | File I/O, shell, git, GitHub, ADO, Teams |
| Self-modification | ✅ | Via self-edit skill |
| Self-review | ✅ | Via self-query skill |
| Tool creation | ✅ | Via toolmaker skill |
| Sub-agent workflow | ✅ | plan → do → merge pipeline |
| Context management | ✅ | Sliding window trimming |
| Friend memory | ✅ | Per-friend context and preferences |
| Observability | ✅ | Nerves event system + coverage audit |
| Autonomous reflection | ✅ | `npm run reflect` — heartbeat trigger |
| Self-deploy | ✅ | `scripts/self-restart.sh` — exit code 42 restart loop |
| Self-knowledge store | ✅ | `psyche/SELF-KNOWLEDGE.md` loaded into system prompt |
| Constitution awareness | ✅ | `CONSTITUTION.md` loaded by reflection system |
| Autonomous loop | ✅ | `npm run reflect:loop` — reflect → plan → do → merge → restart |

## Known Gaps

1. ~~No reflection trigger~~ — ✅ Implemented: `src/reflection/` module
2. ~~No self-deploy~~ — ✅ Implemented: `scripts/self-restart.sh` (exit code 42)
3. ~~No agent self-memory~~ — ✅ Implemented: `psyche/SELF-KNOWLEDGE.md` in system prompt
4. **Kick system disabled** — `kicks.ts` exists but is commented out in core loop.
5. ~~No multi-agent coordination~~ — ✅ Implemented: `autonomous-loop.ts` orchestrates reflect → plan → do → merge pipeline.
6. ~~Reflection→action loop not wired~~ — ✅ Implemented: `npm run reflect:loop` chains reflection through full sub-agent pipeline with constitution gate.

## Dependency Map

```
senses/ ──→ heart/ ──→ mind/
                  ──→ repertoire/
                  ──→ wardrobe/
                  ──→ nerves/

mind/ ──→ identity (psyche files)
      ──→ repertoire/ (skill listing)
      ──→ nerves/

repertoire/ ──→ nerves/
            ──→ external APIs (Graph, ADO, GitHub)
```

## How to Extend Me

### Add a new tool
1. Define tool schema + handler in `src/repertoire/tools-*.ts`
2. Add to `allDefinitions` array in `tools.ts`
3. Write tests in `src/__tests__/repertoire/`
4. Commit, build, restart

### Add a new provider
1. Implement `ProviderRuntime` interface in `src/heart/providers/`
2. Add factory function, register in provider map in `core.ts`
3. Add config support in `config.ts`
4. Write tests

### Add a new psyche file
1. Create `ouroboros/psyche/NEW_FILE.md`
2. Update `loadPsyche()` in `src/mind/prompt.ts` to include it
3. Add to system prompt assembly in `buildSystem()`

### Add a new input channel
1. Create adapter in `src/senses/`
2. Create entry point script
3. Add npm script to `package.json`
