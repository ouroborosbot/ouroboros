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
Reorganize the Ouroboros codebase for better modularity: rename agent.ts to cli.ts, split the monolithic core.ts into focused modules, extract static soul/personality text into markdown files with sync preloading, and restructure the docs/ folder with creative naming.

## Completion Criteria
- [ ] `npm test` passes -- all 208+ tests green
- [ ] `npm run test:coverage` shows 100% on all new/modified source files
- [ ] `npm run build` succeeds with no errors
- [ ] `npm run dev` starts successfully (CLI adapter works)
- [ ] `npm run teams` starts successfully (Teams adapter works)
- [ ] No references to `agent.ts` remain in source code imports
- [ ] No references to old paths remain in active source code (test files, src files)
- [ ] `core.ts` contains only the agent loop, callbacks interface, client init, and glue
- [ ] Soul markdown files (`SOUL.md`, `LORE.md`, `FRIENDS.md`) exist in `docs/inner-flame/` and are loaded at runtime
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

## TDD Requirements
**Strict TDD -- no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation
2. **Verify failure**: Run tests, confirm they FAIL (red)
3. **Minimal implementation**: Write just enough code to pass
4. **Verify pass**: Run tests, confirm they PASS (green)
5. **Refactor**: Clean up, keep tests green
6. **No skipping**: Never write implementation without failing test first

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

**CRITICAL: Every unit header MUST start with status emoji.**

---

### ⬜ Unit 1: Rename agent.ts to cli.ts
**What**: Rename `src/agent.ts` to `src/cli.ts`. Rename `src/__tests__/agent-main.test.ts` to `src/__tests__/cli-main.test.ts`. Update all imports that reference `./agent` or `../agent`.
**Output**:
- `src/cli.ts` (was `src/agent.ts`)
- `src/__tests__/cli-main.test.ts` (was `src/__tests__/agent-main.test.ts`)
- Updated `src/cli-entry.ts`: `import { main } from "./cli"`
- Updated `src/__tests__/cli-main.test.ts`: `import { main } from "../cli"`
**Acceptance**:
- `npm test` -- all 208+ tests pass
- `npm run build` -- no errors
- `grep -r 'from.*"./agent"' src/` returns nothing
- `grep -r 'from.*"../agent"' src/` returns nothing
- `ls src/agent.ts` returns "no such file"

---

### ⬜ Unit 2a: Extract tools.ts -- Tests
**What**: Write tests for the new `src/tools.ts` module. This covers `tools` array, `execTool()`, `summarizeArgs()`, and all tool handlers. These tests currently live in `core.test.ts` under the `describe("execTool", ...)` and `describe("summarizeArgs", ...)` blocks. Create `src/__tests__/tools.test.ts` by moving the relevant test blocks. The tests should import from `../tools` instead of `../core`.
**Acceptance**: Tests exist in `src/__tests__/tools.test.ts` and FAIL because `src/tools.ts` does not exist yet.

### ⬜ Unit 2b: Extract tools.ts -- Implementation
**What**: Create `src/tools.ts` by extracting from `core.ts`:
- `tools` array (lines 57-172)
- `ToolHandler` type alias (line 238)
- `toolHandlers` record (lines 240-317)
- `execTool()` function (lines 319-326)
- `summarizeArgs()` function (lines 422-437)
- Required imports: `OpenAI` type, `fs`, `path`, `child_process` (`execSync`, `spawnSync`), `listSkills`/`loadSkill` from `./skills`
- All exports: `tools`, `execTool`, `summarizeArgs`

Update `core.ts` to import `tools`, `execTool`, `summarizeArgs` from `./tools` and re-export them for backward compatibility.
**Acceptance**: `npm test` -- all tests pass (both new tools.test.ts and existing core.test.ts). `npm run build` clean.

### ⬜ Unit 2c: Extract tools.ts -- Coverage & Refactor
**What**: Verify 100% coverage on `src/tools.ts`. Remove duplicate test blocks from `core.test.ts` that are now covered by `tools.test.ts`. Ensure no regressions.
**Acceptance**: `npm run test:coverage` -- 100% on `src/tools.ts`. All tests green. No warnings.

---

### ⬜ Unit 3a: Extract streaming.ts -- Tests
**What**: Write tests for the new `src/streaming.ts` module. This covers `streamChatCompletion()`, `streamResponsesApi()`, `toResponsesInput()`, `toResponsesTools()`, and `TurnResult`. These tests currently live in `core.test.ts` under the `describe("streamChatCompletion", ...)`, `describe("streamResponsesApi", ...)`, `describe("toResponsesTools", ...)`, and `describe("toResponsesInput", ...)` blocks. Create `src/__tests__/streaming.test.ts` by moving the relevant test blocks. The tests should import from `../streaming`.
**Acceptance**: Tests exist in `src/__tests__/streaming.test.ts` and FAIL because `src/streaming.ts` does not exist yet.

### ⬜ Unit 3b: Extract streaming.ts -- Implementation
**What**: Create `src/streaming.ts` by extracting from `core.ts`:
- `TurnResult` interface (lines 439-443)
- `toResponsesInput()` function (lines 174-224)
- `toResponsesTools()` function (lines 226-236)
- `streamChatCompletion()` function (lines 455-581)
- `streamResponsesApi()` function (lines 583-661)
- Required imports: `OpenAI` type, `ChannelCallbacks` type from `./core`
- All exports: `TurnResult`, `toResponsesInput`, `toResponsesTools`, `streamChatCompletion`, `streamResponsesApi`

Update `core.ts` to import from `./streaming` and re-export for backward compatibility.
**Acceptance**: `npm test` -- all tests pass. `npm run build` clean.

### ⬜ Unit 3c: Extract streaming.ts -- Coverage & Refactor
**What**: Verify 100% coverage on `src/streaming.ts`. Remove duplicate test blocks from `core.test.ts`. Ensure no regressions.
**Acceptance**: `npm run test:coverage` -- 100% on `src/streaming.ts`. All tests green. No warnings.

---

### ⬜ Unit 4a: Extract prompt.ts -- Tests
**What**: Write tests for the new `src/prompt.ts` module. This covers `buildSystem()`, `isOwnCodebase()`, `Channel` type, `soulSection()`, `identitySection()`, `providerSection()`, `dateSection()`, `toolsSection()`, `skillsSection()`, `selfAwareSection()`. These tests currently live in `core.test.ts` under `describe("buildSystem", ...)` and `describe("isOwnCodebase", ...)`. Create `src/__tests__/prompt.test.ts` by moving the relevant test blocks. Tests should import from `../prompt`.
**Acceptance**: Tests exist in `src/__tests__/prompt.test.ts` and FAIL because `src/prompt.ts` does not exist yet.

### ⬜ Unit 4b: Extract prompt.ts -- Implementation
**What**: Create `src/prompt.ts` by extracting from `core.ts`:
- `Channel` type (line 339)
- `isOwnCodebase()` function (lines 328-337)
- All section builders: `soulSection()`, `identitySection()`, `providerSection()`, `dateSection()`, `toolsSection()`, `skillsSection()`, `selfAwareSection()` (lines 341-406)
- `buildSystem()` function (lines 408-420)
- Required imports: `fs`, `path`, `getModel` from `./core`, `tools` from `./tools`, `listSkills` from `./skills`
- All exports: `Channel`, `isOwnCodebase`, `buildSystem`

**Circular dependency note**: `prompt.ts` imports `getModel` from `core.ts`, while `core.ts` imports `buildSystem` from `prompt.ts`. This is safe in CommonJS because both imports are used only inside function bodies (lazy), never at module top-level. By the time any function executes, both modules are fully loaded. TypeScript compiles to CommonJS `require()`, so this just works. However, if this causes issues during testing (vitest module mocking), the fallback is to have `buildSystem()` accept `getModel` as a parameter.

Update `core.ts` to import from `./prompt` and re-export `Channel`, `isOwnCodebase`, `buildSystem` for backward compatibility.

Update `src/context.ts` and `src/commands.ts` to import `Channel` from `./prompt` instead of `./core` (or leave importing from `./core` via re-exports -- decide based on what's cleaner).
**Acceptance**: `npm test` -- all tests pass. `npm run build` clean.

### ⬜ Unit 4c: Extract prompt.ts -- Coverage & Refactor
**What**: Verify 100% coverage on `src/prompt.ts`. Remove duplicate test blocks from `core.test.ts`. Ensure no regressions.
**Acceptance**: `npm run test:coverage` -- 100% on `src/prompt.ts`. All tests green. No warnings.

---

### ⬜ Unit 5: Verify lean core.ts
**What**: After all extractions, verify that `core.ts` contains only:
- Client initialization (`_client`, `_model`, `_provider`, `getClient`, `getModel`, `getProvider`)
- `ChannelCallbacks` interface
- `MAX_TOOL_ROUNDS` constant
- `stripLastToolCalls()` function
- `runAgent()` function
- Re-exports from `tools.ts`, `streaming.ts`, `prompt.ts`
- Required imports

Run full test suite. Verify `core.test.ts` only tests `runAgent()`, `stripLastToolCalls()`, `getClient`/`getModel`/`getProvider`, and `ChannelCallbacks` -- everything else is now tested in its own file.
**Output**: Lean `core.ts` (target: ~200-250 lines, down from 811)
**Acceptance**:
- `npm test` -- all tests pass
- `npm run build` clean
- `npm run test:coverage` -- 100% on all source files
- `core.ts` line count < 300

---

### ⬜ Unit 6a: Create docs/inner-flame/ -- soul markdown files
**What**: Create the `docs/inner-flame/` directory and populate:
- `SOUL.md` -- extract content from `soulSection()` in current code: "i am a witty, funny, competent chaos monkey coding assistant.\ni get things done, crack jokes, embrace chaos, deliver quality."
- `LORE.md` -- new file with minimal starter lore content about the ouroboros character
- `FRIENDS.md` -- new file describing the people/agents who interact with ouroboros
**Output**: Three markdown files in `docs/inner-flame/`
**Acceptance**: Files exist with meaningful content. `cat docs/inner-flame/SOUL.md` shows the soul text.

### ⬜ Unit 6b: Wire prompt.ts to read soul markdown files
**What**: Modify `src/prompt.ts` to:
1. Add top-level `fs.readFileSync` calls that load `SOUL.md` (and optionally `LORE.md`, `FRIENDS.md`) into module-scoped constants at import time
2. Replace the hardcoded string in `soulSection()` with the loaded `SOUL.md` content
3. Integrate `LORE.md` and `FRIENDS.md` content into `buildSystem()` at appropriate positions

Add tests to `prompt.test.ts` verifying:
- `buildSystem()` output includes the soul text from the markdown file
- Mock `fs.readFileSync` to control file content in tests
**Acceptance**:
- `npm test` -- all tests pass
- `npm run build` clean
- `buildSystem()` output includes soul content from file
- No hardcoded soul text remains in `prompt.ts`
- `fs.readFileSync` is called at module load time (top-level), not inside `buildSystem()`

### ⬜ Unit 6c: Soul files -- Coverage & Refactor
**What**: Verify 100% coverage on modified `src/prompt.ts`. Ensure file-loading paths, error handling, and all branches are covered.
**Acceptance**: `npm run test:coverage` -- 100% on `src/prompt.ts`. All tests green. No warnings.

---

### ⬜ Unit 7: Move docs to lab-notes/
**What**: Create `docs/lab-notes/` directory. Move all existing planning/doing docs and their artifact directories from `docs/` into `docs/lab-notes/`:
- `docs/2026-02-23-1456-planning-wu1-teams-bot-local.md` -> `docs/lab-notes/`
- `docs/2026-02-23-1456-doing-wu1-teams-bot-local.md` -> `docs/lab-notes/`
- `docs/2026-02-23-1456-doing-wu1-teams-bot-local/` -> `docs/lab-notes/`
- `docs/2026-02-23-1908-planning-wu15-real-teams.md` -> `docs/lab-notes/`
- `docs/2026-02-23-1908-doing-wu15-real-teams.md` -> `docs/lab-notes/`
- `docs/2026-02-24-1816-planning-reasoning-display.md` -> `docs/lab-notes/`
- `docs/2026-02-24-1816-doing-reasoning-display.md` -> `docs/lab-notes/`
- `docs/2026-02-24-1949-planning-responses-api-migration.md` -> `docs/lab-notes/`
- `docs/2026-02-24-1949-doing-responses-api-migration.md` -> `docs/lab-notes/`
- `docs/2026-02-24-1949-doing-responses-api-migration/` -> `docs/lab-notes/`
- `docs/2026-02-25-0823-planning-sliding-context-window.md` -> `docs/lab-notes/`
- `docs/2026-02-25-0823-doing-sliding-context-window.md` -> `docs/lab-notes/`
- `docs/2026-02-25-0823-doing-sliding-context-window/` -> `docs/lab-notes/`
- `docs/grow-an-agent-server.md` -> `docs/lab-notes/`

Also move the current planning/doing docs for this reorg task:
- `./2026-02-25-2133-planning-codebase-reorg.md` -> `docs/lab-notes/`
- `./2026-02-25-2133-doing-codebase-reorg.md` -> `docs/lab-notes/`
- `./2026-02-25-2133-doing-codebase-reorg/` -> `docs/lab-notes/`

Update internal cross-references in the doing doc (`**Planning**:` and `**Artifacts**:` paths).
**Output**: All dev docs in `docs/lab-notes/`. `docs/` contains only `inner-flame/` and `lab-notes/` subdirectories.
**Acceptance**:
- `ls docs/` shows only `inner-flame/` and `lab-notes/`
- All files are present in their new locations
- `git status` shows renames (not delete+add)

---

### ⬜ Unit 8: Update README.md
**What**: Update `README.md` to reflect the new file structure:
- Replace all `agent.ts` references with `cli.ts` (in diagrams, text, project map)
- Update the project map to show new files: `tools.ts`, `prompt.ts`, `streaming.ts`
- Update the project map to show `docs/inner-flame/` and `docs/lab-notes/`
- Update architecture diagrams (the "Two Front Doors" and "Full Picture" sections)
- Update the "Personality & Skills" section to mention soul markdown files
- Verify all file references are accurate
**Output**: Updated `README.md`
**Acceptance**:
- `grep 'agent\.ts' README.md` returns nothing
- Project map matches actual file layout
- Architecture diagrams reference correct filenames

---

### ⬜ Unit 9: Final validation
**What**: Full validation pass across the entire project:
1. `npm run build` -- clean
2. `npm test` -- all tests pass
3. `npm run test:coverage` -- 100% on all source files, save report to artifacts
4. `grep -r 'from.*"./agent"' src/` -- no results
5. `grep -r 'from.*"../agent"' src/` -- no results
6. `ls docs/` -- only `inner-flame/` and `lab-notes/`
7. Verify `docs/inner-flame/` contains `SOUL.md`, `LORE.md`, `FRIENDS.md`
8. Verify `core.ts` line count < 300
9. Verify `README.md` has no `agent.ts` references
**Output**: Coverage report saved to `./2026-02-25-2133-doing-codebase-reorg/final-coverage.txt`
**Acceptance**: All checks pass. Zero warnings, zero errors.

---

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (a, b, c)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-02-25-2133-doing-codebase-reorg/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-02-25 21:55 Created from planning doc (Pass 1 -- First Draft)
- 2026-02-25 21:59 Passes 2-4 complete (Granularity, Validation, Quality)
