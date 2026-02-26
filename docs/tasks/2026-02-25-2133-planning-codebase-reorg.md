# Planning: Codebase Reorganization

**Status**: approved
**Created**: 2026-02-25 21:34

## Goal
Reorganize the Ouroboros codebase for better modularity: restructure src/ into thematic subdirectories, rename agent.ts to cli.ts, split the monolithic core.ts into focused modules, extract static soul/personality text into markdown files with sync preloading, and restructure the docs/ folder with creative naming.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- **src/ subdirectory reorganization** -- move all source files into thematic subdirectories:
  - `src/engine/` -- core.ts, streaming.ts, tools.ts (the runtime machinery)
  - `src/mind/` -- prompt.ts, context.ts (cognition, what it knows, how it thinks)
  - `src/channels/` -- cli.ts (renamed from agent.ts), teams.ts (how it talks to the world)
  - `src/repertoire/` -- commands.ts, phrases.ts, skills.ts (capabilities, expressions)
  - `src/` root -- config.ts, cli-entry.ts, teams-entry.ts (bootstrap/wiring)
- **Rename agent.ts to cli.ts** (now at `src/channels/cli.ts`)
- **Split core.ts** into focused modules:
  - `src/engine/tools.ts` -- tool definitions, handlers, `execTool()`, `summarizeArgs()`
  - `src/mind/prompt.ts` -- `buildSystem()`, all section builders, `isOwnCodebase()`, `Channel` type
  - `src/engine/streaming.ts` -- `streamChatCompletion()`, `streamResponsesApi()`, `toResponsesInput()`, `toResponsesTools()`, `TurnResult` interface
  - `src/engine/core.ts` (lean) -- `runAgent()`, `ChannelCallbacks` interface, `MAX_TOOL_ROUNDS`, `stripLastToolCalls()`, client initialization
- **Extract static soul/identity text** into markdown files under `docs/psyche/`:
  - `SOUL.md` -- the soul section
  - `IDENTITY.md` -- static identity text (name, style rule). Channel-dependent lines moved to `selfAwareSection(channel)`.
  - `LORE.md` -- additional lore content (new file)
  - `FRIENDS.md` -- people/agents who interact with ouroboros (new file)
- **Refactor identitySection** -- split into static IDENTITY.md + channel-specific logic absorbed by `selfAwareSection(channel)`
- **Restructure docs/** folder:
  - `docs/psyche/` -- soul, identity, lore, friends files (runtime personality)
  - `docs/tasks/` -- planning docs, doing docs, roadmap, development artifacts
- **Update all import paths** across src, tests, and entry points
- **Reorganize test files** to mirror src structure (e.g. `src/__tests__/engine/`, `src/__tests__/channels/`)
- **Update tsconfig/vitest config** if needed for new directory structure
- **Update README.md** architecture diagrams, project map, and all file references
- **Update package.json** scripts if entry point dist paths change

### Out of Scope
- Changing any runtime behavior or features -- this is a pure reorganization
- Modifying test logic (only import paths and file names change)
- Adding new features or tools
- Rewriting historical planning/doing doc content (just move files)

## Completion Criteria
- [ ] `npm test` passes -- all 208+ tests green
- [ ] `npm run test:coverage` shows 100% on all new/modified source files
- [ ] `npm run build` succeeds with no errors
- [ ] `npm run dev` starts successfully (CLI adapter works)
- [ ] `npm run teams` starts successfully (Teams adapter works)
- [ ] No references to `agent.ts` remain in source code imports
- [ ] No flat source files remain in `src/` root except config.ts and entry points
- [ ] `core.ts` contains only the agent loop, callbacks interface, client init, and glue
- [ ] Soul markdown files (`SOUL.md`, `IDENTITY.md`, `LORE.md`, `FRIENDS.md`) exist in `docs/psyche/` and are loaded at runtime
- [ ] Only truly static text lives in markdown files -- all runtime-branching/computed sections stay in code
- [ ] All planning/doing docs and artifacts live in `docs/tasks/`
- [ ] README.md reflects the new file structure accurately
- [ ] All tests pass
- [ ] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions
- [x] Where should client initialization live? Decision: stays in `src/engine/core.ts`.
- [x] Should `Channel` type move to prompt.ts? Decision: yes, moves to `src/mind/prompt.ts`.
- [x] How to handle historical docs? Decision: don't rewrite history, move as-is.
- [x] Naming the "user" file: Decision: `FRIENDS.md`.
- [x] Docs directory names: Decision: `docs/psyche/` and `docs/tasks/`.
- [x] Test directory structure: Decision: mirror src -- `src/__tests__/engine/`, `src/__tests__/mind/`, `src/__tests__/channels/`, `src/__tests__/repertoire/`.
- [x] tsconfig rootDir: stays `src` -- subdirectories are within it, no change needed.

## Decisions Made
- **src/ subdirectory structure**:
  - `src/engine/` -- core.ts, streaming.ts, tools.ts (runtime machinery)
  - `src/mind/` -- prompt.ts, context.ts (cognition)
  - `src/channels/` -- cli.ts, teams.ts (adapters)
  - `src/repertoire/` -- commands.ts, phrases.ts, skills.ts (capabilities)
  - `src/` root -- config.ts, cli-entry.ts, teams-entry.ts (bootstrap)
- **agent.ts -> channels/cli.ts**: Rename + move.
- **core.ts split**: Extract tools.ts, streaming.ts (engine/), prompt.ts (mind/). Keep core.ts lean in engine/.
- **Test organization**: Tests mirror src subdirectories. `src/__tests__/engine/core.test.ts`, `src/__tests__/channels/cli.test.ts`, etc.
- **Soul files as markdown**: Only truly static text moves to .md files. `soulSection()` -> SOUL.md. `identitySection()` static lines -> IDENTITY.md. Channel-specific lines absorbed by `selfAwareSection(channel)`.
- **Sync preloading**: `fs.readFileSync` at module load time in prompt.ts for soul files.
- **Docs**: `docs/psyche/` for soul/identity files, `docs/tasks/` for planning/doing docs.
- **Re-export pattern**: `core.ts` re-exports from tools.ts, streaming.ts, prompt.ts for backward compat during migration. Tests and adapters update their imports directly to the new modules.
- **skills.ts `__dirname` fix**: When skills.ts moves to `src/repertoire/`, the `SKILLS_DIR` path changes from `path.join(__dirname, "..", "skills")` to `path.join(__dirname, "..", "..", "skills")`.
- **Entry point imports**: `cli-entry.ts` changes to `import { main } from "./channels/cli"`. `teams-entry.ts` changes to `import { startTeamsApp } from "./channels/teams"`. `package.json` scripts stay the same (they reference `dist/cli-entry.js` and `dist/teams-entry.js`).

## Context / References
- Current `core.ts`: 811 lines (target < 300 after split)
- Current `agent.ts`: 302 lines (becomes `channels/cli.ts`)
- All source file imports mapped (see doing doc for full dependency graph)
- Test files use dynamic imports (`await import("../module")`) extensively -- all paths must update
- `skills.ts` line 5: `const SKILLS_DIR = path.join(__dirname, "..", "skills")` -- must update for new depth
- `tsconfig.json` rootDir is `src`, outDir is `dist` -- subdirectories compile naturally
- `vitest.config.ts` coverage includes `src/**/*.ts` excluding `src/__tests__/**` and `src/*-entry.ts` -- still works with subdirectories

## Notes
The src subdirectory reorganization is the most impactful change. Every import path in the codebase changes. The strategy is to do all file moves first (creating the directory structure), then update all imports in one pass, then split core.ts. This minimizes the window where the codebase is broken.

For tests, the mirror structure (`src/__tests__/engine/`, etc.) keeps test files adjacent to their describe blocks and makes it obvious which test covers which module.

The re-export pattern from core.ts is less important now since we're updating all imports directly (we have to anyway because of subdirectory moves). But it's still useful as a safety net during the transition.

Static-only rule for markdown extraction: pure string constants with zero runtime dependencies go to markdown. `identitySection` static text -> IDENTITY.md. Channel-dependent lines -> `selfAwareSection(channel)`.

## Progress Log
- 2026-02-25 21:34 Created
- 2026-02-25 21:38 Corrected static-only rule, added naming options, full section audit
- 2026-02-25 21:55 Approved -- FRIENDS.md naming decided
- 2026-02-25 22:00 Pre-execution: add IDENTITY.md, split identitySection
- 2026-02-25 22:26 Major update: src subdirectories, docs/psyche + docs/tasks naming, test mirror structure
