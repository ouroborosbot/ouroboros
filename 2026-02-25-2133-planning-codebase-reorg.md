# Planning: Codebase Reorganization

**Status**: NEEDS_REVIEW
**Created**: 2026-02-25 21:34

## Goal
Reorganize the Ouroboros codebase for better modularity: rename agent.ts to cli.ts, split the monolithic core.ts into focused modules, extract static soul/personality text into markdown files with sync preloading, and restructure the docs/ folder with creative naming.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Rename `src/agent.ts` to `src/cli.ts` and update all imports, tests, docs, and README references
- Rename `src/__tests__/agent-main.test.ts` to `src/__tests__/cli-main.test.ts`
- Split `core.ts` into focused modules:
  - `tools.ts` -- tool definitions, handlers, `execTool()`, `summarizeArgs()`
  - `prompt.ts` -- `buildSystem()`, all section builders, `isOwnCodebase()`, `Channel` type
  - `streaming.ts` -- `streamChatCompletion()`, `streamResponsesApi()`, `toResponsesInput()`, `toResponsesTools()`, `TurnResult` interface
  - `core.ts` (lean) -- `runAgent()`, `ChannelCallbacks` interface, `MAX_TOOL_ROUNDS`, `stripLastToolCalls()`, client initialization (`getClient`, `getModel`, `getProvider`)
- Extract truly static soul/identity text from `prompt.ts` into markdown files under `docs/inner-flame/`:
  - `SOUL.md` -- the soul section ("witty, funny, competent chaos monkey...")
  - `LORE.md` -- additional lore/character content (new file, starts minimal)
  - `KEEPER.md` -- description of the person the agent works with (new file -- see naming options in Decisions Made)
- Sections that stay as code in `prompt.ts` (runtime-computed or runtime-branching):
  - `identitySection(channel)` -- branches on cli vs teams parameter
  - `selfAwareSection()` -- conditionally returns empty based on `isOwnCodebase()` call
  - `providerSection()` -- reads `getModel()` and `process.env`
  - `dateSection()` -- reads `new Date()`
  - `toolsSection()` -- reads `tools` array
  - `skillsSection()` -- calls `listSkills()` (filesystem read)
- Sync preloading of soul markdown files at module load time so `buildSystem()` has zero latency impact
- Restructure `docs/` folder with two creative subdirectories:
  - `docs/inner-flame/` -- soul, lore, keeper files (runtime personality -- truly static text only)
  - `docs/lab-notes/` -- planning docs, doing docs, roadmap, development artifacts
- Update README.md architecture diagrams, project map, and all file references
- Update all docs/ references to `agent.ts` (historical docs -- add a note, don't rewrite history)

### Out of Scope
- Changing any runtime behavior or features -- this is a pure reorganization
- Modifying test logic (only import paths and file names change)
- Adding new features or tools
- Changing the build/bundle pipeline beyond what's needed for the new file layout
- Rewriting historical planning/doing doc content (just move files and update cross-references)

## Completion Criteria
- [ ] `npm test` passes -- all 208+ tests green
- [ ] `npm run test:coverage` shows 100% on all new/modified source files
- [ ] `npm run build` succeeds with no errors
- [ ] `npm run dev` starts successfully (CLI adapter works)
- [ ] `npm run teams` starts successfully (Teams adapter works)
- [ ] No references to `agent.ts` remain in source code imports
- [ ] No references to old paths remain in active source code (test files, src files)
- [ ] `core.ts` contains only the agent loop, callbacks interface, client init, and glue
- [ ] Soul markdown files (`SOUL.md`, `LORE.md`, `KEEPER.md`) exist in `docs/inner-flame/` and are loaded at runtime
- [ ] Only truly static text lives in markdown files -- all runtime-branching/computed sections stay in code
- [ ] All planning/doing docs and artifacts live in `docs/lab-notes/`
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
- [x] Where should client initialization (`getClient`, `getModel`, `getProvider`) live? Decision: stays in `core.ts` since `runAgent()` depends on it directly and it's the "glue" that wires provider to loop.
- [x] Should `Channel` type move to `prompt.ts` or stay in `core.ts`? Decision: moves to `prompt.ts` since it's used by `buildSystem()` and the section builders. `core.ts`, `commands.ts`, and `context.ts` import it from there.
- [x] How to handle historical docs that reference `agent.ts`? Decision: don't rewrite history. Add a brief note at the top of `docs/lab-notes/` README or leave as-is. These are archives.
- [ ] **Naming the "user" file**: Options presented: KEEPER, SUMMONER, INVOKER, WIELDER, BONDED. Recommendation is KEEPER. Awaiting user choice.

## Decisions Made
- **agent.ts -> cli.ts**: Rename source file and its test file (`agent-main.test.ts` -> `cli-main.test.ts`). The existing `cli.test.ts` and `cli-ux.test.ts` keep their names (they already test cli adapter code).
- **core.ts split strategy**: Extract into `tools.ts`, `prompt.ts`, `streaming.ts`. Keep `core.ts` as the agent loop + client init + glue. The `ChannelCallbacks` interface stays in `core.ts` since both adapters and the agent loop depend on it.
- **Soul files as markdown -- strict static-only rule**: Only truly static text (no runtime data, no branching, no function calls) moves to markdown. After auditing every section in `buildSystem()`:
  - `soulSection()` -- STATIC. Pure string, no parameters, no runtime data. -> `SOUL.md`
  - `identitySection(channel)` -- CODE. Takes `channel` parameter, branches `if (channel === "cli")` vs else. Must stay in `prompt.ts`.
  - `selfAwareSection()` -- CODE. Calls `isOwnCodebase()` and conditionally returns empty string. Must stay in `prompt.ts`.
  - `providerSection()` -- CODE. Calls `getModel()`, reads `process.env`. Must stay in `prompt.ts`.
  - `dateSection()` -- CODE. Calls `new Date()`. Must stay in `prompt.ts`.
  - `toolsSection()` -- CODE. Iterates `tools` array. Must stay in `prompt.ts`.
  - `skillsSection()` -- CODE. Calls `listSkills()`. Must stay in `prompt.ts`.
  - New files `LORE.md` and `KEEPER.md` are new content (not extracted from existing code).
- **"User" concept file -- naming options** (for the person the agent works with):
  - **`KEEPER.md`** -- "the keeper" -- someone who tends to and stewards the snake. Warm, implies mutual care. "my keeper asked me to..."
  - **`SUMMONER.md`** -- "the summoner" -- the one who called the snake into being. More dramatic/mystical. "the summoner commands..."
  - **`INVOKER.md`** -- "the invoker" -- the one who invokes the agent. Technical-mystical crossover. "invoked by..."
  - **`WIELDER.md`** -- "the wielder" -- the one who wields the snake as a tool. Implies power and agency on the human's side. "my wielder needs..."
  - **`BONDED.md`** -- "the bonded" -- implies a bond between snake and human. More intimate/familiar. "my bonded and i..."
  - **Recommendation**: `KEEPER.md` -- it fits the inner-flame/mystical theme, implies a relationship (not just usage), and reads naturally in the agent's voice.
- **Sync preloading pattern**: Use synchronous `fs.readFileSync` at module load time (top-level in `prompt.ts`) to read the markdown files once into module-scoped constants. This is the simplest approach and has zero latency impact on `buildSystem()` calls. Module load happens once at process startup. No async needed -- the files are tiny (< 1KB each) and local disk reads at startup are standard Node.js practice (every `require`/`import` already does this). The `cachedBuildSystem()` TTL in `context.ts` continues to work as before -- it caches the assembled string, not the file reads. When the cache expires, `buildSystem()` re-assembles from the already-in-memory constants.
- **Docs directory names**: `docs/inner-flame/` for soul/identity/lore files (mystical, character-ish -- the inner flame of the ouroboros). `docs/lab-notes/` for development planning/doing docs (workshop/lab notebook feel).
- **Historical docs**: Planning/doing docs are development archives. Move them to `docs/lab-notes/` as-is without rewriting their content. References to `agent.ts` in those docs are historically accurate.
- **Re-export pattern**: `core.ts` will re-export key types/functions from `tools.ts`, `prompt.ts`, and `streaming.ts` so that existing consumers (adapters, tests) that import from `./core` continue to work initially. This can be cleaned up in a future pass but keeps the refactor safe.

## Context / References
- Current `core.ts`: 811 lines, contains agent loop + tools + streaming + prompt building + client init
- Current `agent.ts`: 302 lines, CLI adapter (renamed to `cli.ts`)
- `src/cli-entry.ts` line 5: `import { main } from "./agent"` -- must update
- `src/__tests__/agent-main.test.ts` line 56: `import { main } from "../agent"` -- must update
- `src/context.ts` line 2: `import type { Channel } from "./core"` -- will change to `./prompt`
- `src/commands.ts` line 1: `import type { Channel } from "./core"` -- will change to `./prompt`
- Files importing from `./core`: agent.ts (-> cli.ts), teams.ts, context.ts, commands.ts, 3 test files
- `README.md` lines 115, 125, 239, 265: references to `agent.ts`
- `docs/grow-an-agent-server.md` lines 67, 165: references to `agent.ts`
- `package.json` scripts reference `dist/cli-entry.js` and `dist/teams-entry.js` -- these don't change
- `cachedBuildSystem()` in `context.ts`: 60-second TTL cache for assembled system prompt
- Vitest config: `vitest.config.ts` -- may need to verify test file discovery still works

## Notes
The re-export pattern from core.ts is a pragmatic choice. Rather than updating every import across the codebase in one shot (risky), core.ts can re-export what it used to export. This means the split is invisible to consumers at first. Import cleanup can happen unit-by-unit afterward or as a separate concern.

For the soul markdown files, the sync-at-module-load pattern is identical to how Node.js loads every JavaScript module -- it's a blocking read that happens once during startup. For files under 1KB, this is measured in microseconds.

Strict static-only rule for markdown extraction: if a section function takes parameters, calls other functions, reads env vars, or has conditional logic, it stays in code. Only pure string constants with zero runtime dependencies move to markdown files. This was corrected after the first draft incorrectly included `identitySection` (channel branching) and `selfAwareSection` (isOwnCodebase check).

## Progress Log
- 2026-02-25 21:34 Created
