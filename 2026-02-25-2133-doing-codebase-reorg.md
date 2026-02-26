# Doing: Codebase Reorganization

**Status**: READY_FOR_EXECUTION
**Execution Mode**: pending
**Created**: 2026-02-25 21:55
**Planning**: ./2026-02-25-2133-planning-codebase-reorg.md
**Artifacts**: ./2026-02-25-2133-doing-codebase-reorg/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Reorganize the Ouroboros codebase: restructure src/ into thematic subdirectories (engine/, mind/, channels/, repertoire/), rename agent.ts to cli.ts, split core.ts into focused modules, extract static personality text into markdown files in docs/psyche/, and move dev docs to docs/tasks/.

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

## TDD Requirements
**Strict TDD -- no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation
2. **Verify failure**: Run tests, confirm they FAIL (red)
3. **Minimal implementation**: Write just enough code to pass
4. **Verify pass**: Run tests, confirm they PASS (green)
5. **Refactor**: Clean up, keep tests green
6. **No skipping**: Never write implementation without failing test first

## Target File Layout

```
src/
  config.ts                         # bootstrap/wiring (stays at root)
  cli-entry.ts                      # entry point (stays at root)
  teams-entry.ts                    # entry point (stays at root)
  engine/
    core.ts                         # agent loop, ChannelCallbacks, client init, glue
    streaming.ts                    # streamChatCompletion, streamResponsesApi, toResponsesInput/Tools, TurnResult
    tools.ts                        # tool defs, handlers, execTool, summarizeArgs
  mind/
    prompt.ts                       # buildSystem, section builders, isOwnCodebase, Channel type
    context.ts                      # estimateTokens, trimMessages, session I/O, cachedBuildSystem
  channels/
    cli.ts                          # CLI adapter (was agent.ts) -- Spinner, InputController, REPL
    teams.ts                        # Teams adapter -- streaming, conversation locks
  repertoire/
    commands.ts                     # slash command registry
    phrases.ts                      # thinking/tool/followup phrase pools
    skills.ts                       # skill file loader
  __tests__/
    setup.test.ts                   # stays at __tests__ root
    config.test.ts                  # stays at __tests__ root (tests src/config.ts)
    engine/
      core.test.ts                  # tests for engine/core.ts
      streaming.test.ts             # tests for engine/streaming.ts (new)
      tools.test.ts                 # tests for engine/tools.ts (new)
    mind/
      prompt.test.ts                # tests for mind/prompt.ts (new)
      context.test.ts               # tests for mind/context.ts
    channels/
      cli.test.ts                   # tests for channels/cli.ts
      cli-ux.test.ts                # tests for channels/cli.ts UX
      cli-main.test.ts              # tests for channels/cli.ts main() (was agent-main.test.ts)
      teams.test.ts                 # tests for channels/teams.ts
    repertoire/
      commands.test.ts              # tests for repertoire/commands.ts
      phrases.test.ts               # tests for repertoire/phrases.ts
      skills.test.ts                # tests for repertoire/skills.ts
docs/
  psyche/
    SOUL.md
    IDENTITY.md
    LORE.md
    FRIENDS.md
  tasks/
    grow-an-agent-server.md
    2026-02-23-1456-planning-wu1-teams-bot-local.md
    2026-02-23-1456-doing-wu1-teams-bot-local.md
    2026-02-23-1456-doing-wu1-teams-bot-local/
    ... (all other planning/doing docs + artifact dirs)
```

## Post-Reorg Import Map

Every local import in the codebase after reorganization:

**src/ root:**
- `cli-entry.ts` -> `import { main } from "./channels/cli"`
- `teams-entry.ts` -> `import { startTeamsApp } from "./channels/teams"`
- `config.ts` -> no local imports

**src/engine/:**
- `core.ts` -> `import { getAzureConfig, getMinimaxConfig } from "../config"`, `import { tools, execTool, summarizeArgs } from "./tools"`, `import { streamChatCompletion, streamResponsesApi, toResponsesInput, toResponsesTools } from "./streaming"`, `import type { TurnResult } from "./streaming"`
- `tools.ts` -> `import { listSkills, loadSkill } from "../repertoire/skills"`
- `streaming.ts` -> `import type { ChannelCallbacks } from "./core"`

**src/mind/:**
- `prompt.ts` -> `import { getModel } from "../engine/core"`, `import { tools } from "../engine/tools"`, `import { listSkills } from "../repertoire/skills"`
- `context.ts` -> `import type { Channel } from "./prompt"`

**src/channels/:**
- `cli.ts` -> `import { runAgent, ChannelCallbacks } from "../engine/core"`, `import { buildSystem } from "../mind/prompt"`, `import { pickPhrase, THINKING_PHRASES, TOOL_PHRASES, FOLLOWUP_PHRASES } from "../repertoire/phrases"`, `import { sessionPath, getContextConfig } from "../config"`, `import { loadSession, saveSession, deleteSession, trimMessages, cachedBuildSystem } from "../mind/context"`, `import { createCommandRegistry, registerDefaultCommands, parseSlashCommand } from "../repertoire/commands"`
- `teams.ts` -> same pattern as cli.ts, plus `import { getTeamsConfig } from "../config"`

**src/repertoire/:**
- `commands.ts` -> `import type { Channel } from "../mind/prompt"`
- `phrases.ts` -> no local imports
- `skills.ts` -> no local imports (but `SKILLS_DIR` path changes to `path.join(__dirname, "..", "..", "skills")`)

**No circular dependencies**: `prompt.ts` imports `getModel` from `engine/core.ts`. `core.ts` does NOT import from `prompt.ts` for its own logic. Adapters import `buildSystem` directly from `mind/prompt`.

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

**CRITICAL: Every unit header MUST start with status emoji.**

**Ordering strategy**: Create directory structure -> move files one subdirectory at a time (keeping tests green between each move) -> split core.ts -> create psyche files -> move docs -> update README. Each move unit creates the directory, moves the files, updates all imports/mocks/dynamic-imports, and verifies tests pass before moving on.

---

### ✅ Unit 1: Create directory structure
**What**: Create all new directories:
- `src/engine/`
- `src/mind/`
- `src/channels/`
- `src/repertoire/`
- `src/__tests__/engine/`
- `src/__tests__/mind/`
- `src/__tests__/channels/`
- `src/__tests__/repertoire/`
- `docs/psyche/`
- `docs/tasks/`
**Output**: Empty directories exist
**Acceptance**: All directories exist. `npm run build` still works. `npm test` still passes (208+ tests).

---

### ✅ Unit 2: Move repertoire/ files + tests + update imports
**What**: Move the simplest files first (fewest dependencies, fewest dependents):
1. `git mv src/phrases.ts src/repertoire/phrases.ts`
2. `git mv src/skills.ts src/repertoire/skills.ts`
   - Fix `SKILLS_DIR`: `path.join(__dirname, "..", "skills")` -> `path.join(__dirname, "..", "..", "skills")`
3. `git mv src/commands.ts src/repertoire/commands.ts`
4. Move test files:
   - `git mv src/__tests__/phrases.test.ts src/__tests__/repertoire/phrases.test.ts`
   - `git mv src/__tests__/skills.test.ts src/__tests__/repertoire/skills.test.ts`
   - `git mv src/__tests__/commands.test.ts src/__tests__/repertoire/commands.test.ts`
5. Update ALL imports across the codebase that reference these files:
   - `core.ts` (still at src/): `./skills` -> `./repertoire/skills`
   - `agent.ts` (still at src/): `./phrases` -> `./repertoire/phrases`, `./commands` -> `./repertoire/commands`
   - `teams.ts` (still at src/): same pattern as agent.ts
   - `repertoire/commands.ts` internal: `./core` -> `../core` (one level deeper now)
   - Test static imports: `from "../phrases"` -> `from "../../repertoire/phrases"` in cli.test.ts, teams.test.ts
   - Test static imports: `from "../skills"` -> `from "../../repertoire/skills"` in core.test.ts
   - Test vi.mocks: `vi.mock("../skills"` -> `vi.mock("../../repertoire/skills"` in core.test.ts
   - Test vi.mocks: `vi.mock("../commands"` -> `vi.mock("../../repertoire/commands"` in agent-main.test.ts
   - Test dynamic imports: all `await import("../phrases")` -> `await import("../../repertoire/phrases")`, etc.
   - Test dynamic imports: all `await import("../commands")` -> `await import("../../repertoire/commands")`
   - Test dynamic imports: all `await import("../skills")` -> `await import("../../repertoire/skills")`
**Acceptance**:
- `npm test` -- all tests pass
- `npm run build` -- no errors
- No files remain at `src/phrases.ts`, `src/skills.ts`, `src/commands.ts`

---

### ⬜ Unit 3: Move context.ts to mind/ + tests + update imports
**What**: Move context.ts (prompt.ts doesn't exist yet -- created during core.ts split):
1. `git mv src/context.ts src/mind/context.ts`
2. `git mv src/__tests__/context.test.ts src/__tests__/mind/context.test.ts`
3. Update ALL imports:
   - `mind/context.ts` internal: `./core` -> `../core` (one level deeper now)
   - `agent.ts` (still at src/): `./context` -> `./mind/context`
   - `teams.ts` (still at src/): same
   - Test vi.mocks: `vi.mock("../context"` -> `vi.mock("../../mind/context"` in agent-main.test.ts
   - Test dynamic imports: all `await import("../context")` -> `await import("../../mind/context")`
**Acceptance**:
- `npm test` -- all tests pass
- `npm run build` -- no errors
- `src/context.ts` no longer exists

---

### ⬜ Unit 4: Move agent.ts -> channels/cli.ts, teams.ts -> channels/teams.ts + tests + update imports
**What**: Move adapters to channels/, renaming agent.ts to cli.ts:
1. `git mv src/agent.ts src/channels/cli.ts`
2. `git mv src/teams.ts src/channels/teams.ts`
3. Move test files:
   - `git mv src/__tests__/cli.test.ts src/__tests__/channels/cli.test.ts`
   - `git mv src/__tests__/cli-ux.test.ts src/__tests__/channels/cli-ux.test.ts`
   - `git mv src/__tests__/agent-main.test.ts src/__tests__/channels/cli-main.test.ts`
   - `git mv src/__tests__/teams.test.ts src/__tests__/channels/teams.test.ts`
4. Update ALL imports:
   - `cli-entry.ts`: `./agent` -> `./channels/cli`
   - `teams-entry.ts`: `./teams` -> `./channels/teams`
   - `channels/cli.ts` internal: `./core` -> `../core`, `./config` -> `../config`, `./repertoire/phrases` -> `../repertoire/phrases`, `./mind/context` -> `../mind/context`, `./repertoire/commands` -> `../repertoire/commands`
   - `channels/teams.ts` internal: same pattern, plus `./config` -> `../config`
   - Test static imports in channels/ tests: `from "../core"` -> `from "../../core"`, `from "../../repertoire/phrases"` (already correct depth)
   - Test vi.mocks in cli-main.test.ts: `vi.mock("../core"` -> `vi.mock("../../core"`, `vi.mock("../config"` -> `vi.mock("../../config"`, `vi.mock("../../mind/context"` (already moved), `vi.mock("../../repertoire/commands"` (already moved)
   - Test dynamic imports: `await import("../agent")` -> `await import("../../channels/cli")` in cli.test.ts, cli-ux.test.ts
   - Test dynamic imports: `await import("../agent")` -> `await import("../../channels/cli")` in cli-main.test.ts
   - Test dynamic imports: `await import("../teams")` -> `await import("../../channels/teams")` in teams.test.ts
**Acceptance**:
- `npm test` -- all tests pass
- `npm run build` -- no errors
- `src/agent.ts` and `src/teams.ts` no longer exist
- `grep -r '"./agent"' src/` returns nothing
- `grep -r '"../agent"' src/` returns nothing

---

### ⬜ Unit 5: Move core.ts to engine/ + tests + update imports
**What**: Move core.ts to its final home:
1. `git mv src/core.ts src/engine/core.ts`
2. `git mv src/__tests__/core.test.ts src/__tests__/engine/core.test.ts`
3. Update ALL imports:
   - `engine/core.ts` internal: `./config` -> `../config`, `./repertoire/skills` -> `../repertoire/skills`
   - `channels/cli.ts`: `../core` -> `../engine/core`
   - `channels/teams.ts`: `../core` -> `../engine/core`
   - `mind/context.ts`: `../core` -> `../engine/core`
   - `repertoire/commands.ts`: `../core` -> `../engine/core`
   - Test static imports: `from "../../core"` -> `from "../../engine/core"` in channels/ tests
   - Test vi.mocks: `vi.mock("../../core"` -> `vi.mock("../../engine/core"` in cli-main.test.ts
   - Test dynamic imports: `await import("../core")` -> `await import("../../engine/core")` in core.test.ts
   - Test dynamic imports in core.test.ts: `await import("../config")` -> `await import("../../config")`
   - Test vi.mocks in core.test.ts: `vi.mock("../skills"` already updated to `vi.mock("../../repertoire/skills"` in Unit 2
**Acceptance**:
- `npm test` -- all tests pass
- `npm run build` -- no errors
- `src/core.ts` no longer exists
- Only `config.ts`, `cli-entry.ts`, `teams-entry.ts` remain in `src/` root

---

### ⬜ Unit 6: Checkpoint -- full validation after all moves
**What**: Full validation before starting the core.ts split:
1. `npm run build` -- clean
2. `npm test` -- all 208+ tests pass
3. `npm run test:coverage` -- verify coverage levels unchanged
4. Verify file layout: only config.ts and entry points in src/ root
5. Save coverage report to artifacts
**Output**: `./2026-02-25-2133-doing-codebase-reorg/coverage-post-move.txt`
**Acceptance**: All checks pass. Stable baseline before the split.

---

### ⬜ Unit 7a: Extract engine/tools.ts -- Tests
**What**: Create `src/__tests__/engine/tools.test.ts` by moving the `describe("execTool", ...)` and `describe("summarizeArgs", ...)` blocks from `core.test.ts`. Update imports to `../../engine/tools`.
**Acceptance**: Tests exist in tools.test.ts and FAIL because `src/engine/tools.ts` does not exist yet.

### ⬜ Unit 7b: Extract engine/tools.ts -- Implementation
**What**: Create `src/engine/tools.ts` by extracting from `engine/core.ts`:
- `tools` array (tool definitions)
- `ToolHandler` type alias
- `toolHandlers` record
- `execTool()` function
- `summarizeArgs()` function
- Required imports: `OpenAI` type, `fs`, `path`, `child_process`, `../repertoire/skills`
- All exports: `tools`, `execTool`, `summarizeArgs`

Update `engine/core.ts` to `import { tools, execTool, summarizeArgs } from "./tools"`.
**Acceptance**: `npm test` -- all tests pass. `npm run build` clean.

### ⬜ Unit 7c: Extract engine/tools.ts -- Coverage & Cleanup
**What**: Verify 100% coverage on `src/engine/tools.ts`. Remove duplicate test blocks from `core.test.ts`.
**Acceptance**: 100% coverage on `src/engine/tools.ts`. All tests green.

---

### ⬜ Unit 8a: Extract engine/streaming.ts -- Tests
**What**: Create `src/__tests__/engine/streaming.test.ts` by moving `describe("streamChatCompletion", ...)`, `describe("streamResponsesApi", ...)`, `describe("toResponsesTools", ...)`, `describe("toResponsesInput", ...)` from `core.test.ts`. Update imports to `../../engine/streaming`.
**Acceptance**: Tests exist and FAIL because `src/engine/streaming.ts` does not exist yet.

### ⬜ Unit 8b: Extract engine/streaming.ts -- Implementation
**What**: Create `src/engine/streaming.ts` by extracting from `engine/core.ts`:
- `TurnResult` interface
- `toResponsesInput()`, `toResponsesTools()`
- `streamChatCompletion()` (including `<think>` tag state machine)
- `streamResponsesApi()`
- Required imports: `OpenAI` type, `ChannelCallbacks` type from `./core`

Update `engine/core.ts` to import from `./streaming`.
**Acceptance**: `npm test` -- all tests pass. `npm run build` clean.

### ⬜ Unit 8c: Extract engine/streaming.ts -- Coverage & Cleanup
**What**: Verify 100% coverage on `src/engine/streaming.ts`. Remove duplicate test blocks from `core.test.ts`.
**Acceptance**: 100% coverage on `src/engine/streaming.ts`. All tests green.

---

### ⬜ Unit 9a: Extract mind/prompt.ts -- Tests
**What**: Create `src/__tests__/mind/prompt.test.ts` by moving `describe("buildSystem", ...)` and `describe("isOwnCodebase", ...)` from `core.test.ts`. Update imports to `../../mind/prompt`.

Refactored function signatures for tests:
- `identitySection()` -- no params, returns static text
- `selfAwareSection(channel)` -- takes channel param, handles channel-specific behavior + isOwnCodebase check

Tests must cover:
- `selfAwareSection("cli")` includes cli greeting line
- `selfAwareSection("teams")` includes Teams behavior line
- `selfAwareSection(channel)` returns channel line even when NOT in own codebase
- `selfAwareSection(channel)` appends self-aware block when in own codebase
- `identitySection()` returns static identity text (no channel branching)
- `buildSystem("cli")` and `buildSystem("teams")` produce correct output
**Acceptance**: Tests exist and FAIL because `src/mind/prompt.ts` does not exist yet.

### ⬜ Unit 9b: Extract mind/prompt.ts -- Implementation
**What**: Create `src/mind/prompt.ts` by extracting from `engine/core.ts`:
- `Channel` type
- `isOwnCodebase()` function
- Section builders with these refactors:
  - `soulSection()` -- as-is (pure static string, will read from SOUL.md in Unit 11b)
  - `identitySection()` -- **refactored**: remove `channel` param, keep only static lines ("i am Ouroboros." + lowercase rule)
  - `selfAwareSection(channel: Channel)` -- **refactored**: gains `channel` param. Outputs channel-specific line first, then conditional isOwnCodebase block
  - `providerSection()`, `dateSection()`, `toolsSection()`, `skillsSection()` -- as-is
- `buildSystem(channel)` -- calls `identitySection()` (no param) and `selfAwareSection(channel)`
- Required imports: `fs`, `path`, `getModel` from `../engine/core`, `tools` from `../engine/tools`, `listSkills` from `../repertoire/skills`
- Exports: `Channel`, `isOwnCodebase`, `buildSystem`

Update downstream imports:
- `mind/context.ts`: `Channel` from `../engine/core` -> `from "./prompt"`
- `repertoire/commands.ts`: `Channel` from `../engine/core` -> `from "../mind/prompt"`
- `channels/cli.ts`: split `import { runAgent, buildSystem, ChannelCallbacks }` -> `runAgent, ChannelCallbacks` from `../engine/core` + `buildSystem` from `../mind/prompt`
- `channels/teams.ts`: same split
**Acceptance**: `npm test` -- all tests pass. `npm run build` clean. `buildSystem("cli")` and `buildSystem("teams")` produce identical output to before (same content, assembled differently).

### ⬜ Unit 9c: Extract mind/prompt.ts -- Coverage & Cleanup
**What**: Verify 100% coverage on `src/mind/prompt.ts`. Remove duplicate test blocks from `core.test.ts`.
**Acceptance**: 100% coverage on `src/mind/prompt.ts`. All tests green.

---

### ⬜ Unit 10: Verify lean engine/core.ts
**What**: Verify `engine/core.ts` contains only:
- Client init (`_client`, `_model`, `_provider`, `getClient`, `getModel`, `getProvider`)
- `ChannelCallbacks` interface
- `MAX_TOOL_ROUNDS`, `stripLastToolCalls()`
- `runAgent()` function
- Imports from `./tools`, `./streaming`, `../config`

Verify `core.test.ts` only tests `runAgent()`, `stripLastToolCalls()`, `getClient`/`getModel`/`getProvider`, `ChannelCallbacks`.
**Output**: Lean `engine/core.ts` (target < 300 lines)
**Acceptance**:
- `npm test` -- all tests pass
- `npm run build` clean
- `npm run test:coverage` -- 100% on all source files
- `engine/core.ts` line count < 300

---

### ⬜ Unit 11a: Create docs/psyche/ -- soul markdown files
**What**: Populate `docs/psyche/` (directory created in Unit 1):
- `SOUL.md` -- extract from `soulSection()`: "i am a witty, funny, competent chaos monkey coding assistant.\ni get things done, crack jokes, embrace chaos, deliver quality."
- `IDENTITY.md` -- extract static lines from `identitySection()`: "i am Ouroboros.\ni use lowercase in my responses to the user except for proper nouns..."
- `LORE.md` -- new file, minimal starter lore
- `FRIENDS.md` -- new file, describes people/agents who interact with ouroboros
**Output**: Four files in `docs/psyche/`
**Acceptance**: Files exist with meaningful content.

### ⬜ Unit 11b: Wire mind/prompt.ts to read psyche markdown files
**What**: Modify `src/mind/prompt.ts`:
1. Top-level `fs.readFileSync` calls load `SOUL.md`, `IDENTITY.md`, `LORE.md`, `FRIENDS.md` into module-scoped constants. Path: `path.join(__dirname, "..", "..", "docs", "psyche", "<FILE>.md")`
2. `soulSection()` returns loaded SOUL.md content
3. `identitySection()` returns loaded IDENTITY.md content
4. Integrate LORE.md and FRIENDS.md into `buildSystem()` at appropriate positions

Update prompt.test.ts:
- Mock `fs.readFileSync` to control file content
- Verify `buildSystem()` includes soul and identity content from files
**Acceptance**:
- `npm test` -- all tests pass
- No hardcoded soul or identity text remains in `prompt.ts`
- `fs.readFileSync` called at module load time (top-level), not inside functions

### ⬜ Unit 11c: Psyche files -- Coverage & Refactor
**What**: Verify 100% coverage on `src/mind/prompt.ts`. Cover file-loading paths and error handling.
**Acceptance**: 100% coverage on `src/mind/prompt.ts`. All tests green. No warnings.

---

### ⬜ Unit 12: Move docs to tasks/
**What**: Move all dev docs from `docs/` and repo root into `docs/tasks/`:
- All `docs/2026-*` files and directories -> `docs/tasks/`
- `docs/grow-an-agent-server.md` -> `docs/tasks/`
- `./2026-02-25-2133-planning-codebase-reorg.md` -> `docs/tasks/`
- `./2026-02-25-2133-doing-codebase-reorg.md` -> `docs/tasks/`
- `./2026-02-25-2133-doing-codebase-reorg/` -> `docs/tasks/`

Update cross-references in doing doc (Planning/Artifacts paths).
**Output**: `docs/` contains only `psyche/` and `tasks/`.
**Acceptance**:
- `ls docs/` shows only `psyche/` and `tasks/`
- All files present in new locations
- Use `git mv` for history preservation

---

### ⬜ Unit 13: Update README.md
**What**: Update all references in `README.md`:
- Replace `agent.ts` with `channels/cli.ts` everywhere
- Update "Two Front Doors" diagram: `channels/cli.ts`, `channels/teams.ts`
- Update "Full Picture" diagram: show engine/, mind/, channels/, repertoire/ structure
- Update project map to show full new layout including docs/psyche/ and docs/tasks/
- Update "Personality & Skills" section to mention docs/psyche/ soul files
- Update all file path references throughout
**Output**: Updated README.md
**Acceptance**:
- `grep 'agent\.ts' README.md` returns nothing
- Project map matches actual file layout

---

### ⬜ Unit 14: Final validation
**What**: Full validation:
1. `npm run build` -- clean
2. `npm test` -- all tests pass
3. `npm run test:coverage` -- 100% on all source files
4. `grep -r '"./agent"' src/` -- no results
5. `grep -r '"../agent"' src/` -- no results
6. Only config.ts and entry points in src/ root
7. `ls docs/` -- only `psyche/` and `tasks/`
8. `docs/psyche/` has SOUL.md, IDENTITY.md, LORE.md, FRIENDS.md
9. `engine/core.ts` line count < 300
10. README.md has no `agent.ts` references
11. No stale import paths to old locations
**Output**: `./docs/tasks/2026-02-25-2133-doing-codebase-reorg/final-coverage.txt`
**Acceptance**: All checks pass. Zero warnings, zero errors.

---

### ⬜ Unit 15: Verify this task's own docs landed in docs/tasks/
**What**: Confirm that Unit 12 successfully moved this task's planning/doing docs:
1. Verify `docs/tasks/2026-02-25-2133-planning-codebase-reorg.md` exists
2. Verify `docs/tasks/2026-02-25-2133-doing-codebase-reorg.md` exists
3. Verify `docs/tasks/2026-02-25-2133-doing-codebase-reorg/` exists (artifacts dir)
4. Verify the `Planning:` and `Artifacts:` paths at the top of the doing doc are updated
5. Verify no planning/doing docs remain in repo root
**Acceptance**: All paths correct. No stale docs in repo root.

---

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each unit (or sub-unit a/b/c)
- Run full test suite before marking unit done
- **All artifacts**: Save to `./2026-02-25-2133-doing-codebase-reorg/`
- **Fixes/blockers**: Spawn sub-agent immediately
- **Move strategy**: Use `git mv` for all file moves to preserve history
- **Import update strategy**: After each move, grep the entire src/ tree for old paths and fix them all before running tests

## Progress Log
- 2026-02-25 21:55 Created from planning doc
- 2026-02-25 21:59 Passes 2-4 complete
- 2026-02-25 22:02 Pre-execution: IDENTITY.md, identitySection/selfAwareSection split
- 2026-02-25 22:22 Major rewrite: src subdirectories (engine/mind/channels/repertoire), docs/psyche + docs/tasks, reordered units for minimal breakage
- 2026-02-25 22:38 Unit 1 complete: created all directory structure (engine/, mind/, channels/, repertoire/, tests, docs/psyche/, docs/tasks/)
- 2026-02-25 22:40 Unit 2 complete: moved phrases, skills, commands to repertoire/ with all import updates
