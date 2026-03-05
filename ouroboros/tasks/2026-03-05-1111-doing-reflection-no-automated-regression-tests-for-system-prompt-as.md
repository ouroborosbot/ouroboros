# Doing: Regression tests for system prompt assembly invariants (psyche loading, ordering, caching)

**Status**: READY_FOR_EXECUTION  
**Execution Mode**: direct

## Objective
Lock down the behavior of `src/mind/prompt.ts` system prompt assembly so accidental prompt changes (psyche inclusion, ordering, and caching) are caught by CI.

This work adds a focused contract/regression test suite around `buildSystem()` and documents the invariants in `ouroboros/ARCHITECTURE.md`, without changing the core prompt assembly logic.

## Completion Criteria
- [ ] Contract tests exist that verify psyche sections are included (SOUL / IDENTITY / LORE / FRIENDS / SELF-KNOWLEDGE) and appear in a stable order within the assembled system prompt.
- [ ] Contract tests verify repeated `buildSystem()` calls in the same process do not duplicate sections and (where intended) do not re-read psyche files.
- [ ] Missing psyche file behavior is explicitly tested and matches current intended behavior (currently: missing file → empty string → section omitted; no throw).
- [ ] `ouroboros/ARCHITECTURE.md` documents “System prompt assembly invariants” (files, ordering, caching contract, missing-file behavior).
- [ ] All new code has tests
- [ ] All tests pass

## Work Units

### ⬜ Unit 1a: System prompt assembly contract — Tests (ordering + section markers)
**What**: Add a focused test file that asserts `buildSystem()` includes the psyche-derived content and that the major sections appear in a stable, documented order.

Include explicit ordering assertions using `indexOf()` across:
- SOUL content marker (e.g., `# SOUL`)
- IDENTITY content marker (e.g., `i am Ouroboros.`)
- `## my lore`
- `## my friends`
- `## self-knowledge`
- `## runtime`
- `## my provider`
- `current date:`
- `## my tools`
- `## my skills (use load_skill to activate)` (when skills present)
- `## tool behavior` (when `toolChoiceRequired !== false`)

**Files**:
- Create: `src/__tests__/mind/prompt.assembly.contract.test.ts`

**Acceptance**:
- Tests exist and fail if any of the above sections are removed or reordered.

---

### ⬜ Unit 1b: System prompt assembly contract — Implementation (stabilize dynamic fields for snapshot/assertions)
**What**: Make the new contract tests deterministic by controlling dynamic values:
- Freeze time via `vi.useFakeTimers()` / `vi.setSystemTime()` to stabilize `dateSection()`.
- Stub `process.cwd()` via `vi.spyOn(process, "cwd").mockReturnValue("/mock/cwd")` to stabilize `runtimeInfoSection()`.
- Mock `listSkills()` to a known list (or empty) for predictable skills output.
- Ensure the filesystem mock returns content for *all* psyche files (including `SELF-KNOWLEDGE.md`) so the contract covers the full set.

**Files**:
- Modify: `src/__tests__/mind/prompt.assembly.contract.test.ts`

**Acceptance**:
- Contract tests are deterministic (no dependence on local machine cwd, current date, or environment) and pass green.

---

### ⬜ Unit 2a: No-duplicates + caching contract — Tests
**What**: Add tests that:
1) call `buildSystem()` twice and assert the returned string contains exactly one occurrence of key headers (`## runtime`, `## my provider`, `## my tools`, plus `## my lore` / `## my friends` / `## self-knowledge` when present).
2) verify caching intent: for two `buildSystem()` calls without `resetPsycheCache()`, `fs.readFileSync` is not called again for psyche paths.
   - Count only calls whose path includes `/psyche/` and ends with the expected filenames.

Also add a complementary test that after `resetPsycheCache()`, a subsequent `buildSystem()` *does* re-read psyche files.

**Files**:
- Modify: `src/__tests__/mind/prompt.assembly.contract.test.ts`

**Acceptance**:
- Tests fail if prompt assembly starts duplicating sections across repeated calls.
- Tests fail if psyche caching behavior regresses (unexpected repeated reads without reset, or no re-reads after reset).

---

### ⬜ Unit 2b: No-duplicates + caching contract — Implementation
**What**: Make the caching tests reliable by filtering `readFileSync` calls down to the psyche files only (to avoid incidental reads like `secrets.json` causing false positives).

**Files**:
- Modify: `src/__tests__/mind/prompt.assembly.contract.test.ts`

**Acceptance**:
- Caching tests are robust (only sensitive to psyche reads) and pass green.

---

### ⬜ Unit 3: Missing psyche file behavior contract — Tests
**What**: Add an explicit test that captures *current* behavior in `loadPsycheFile()`:
- If a psyche file read throws, the section becomes empty string and is omitted from the prompt (because `buildSystem()` filters falsy sections).
- `buildSystem()` does not throw.

Also assert a minimal invariant remains true even when all psyche files are missing: the system prompt still includes `## runtime`.

**Files**:
- Modify: `src/__tests__/mind/prompt.assembly.contract.test.ts`

**Acceptance**:
- Test fails if missing psyche files start crashing the builder or if behavior changes without updating the documented contract.

---

### ⬜ Unit 4: Document system prompt assembly invariants — Implementation
**What**: Update architecture docs to describe the contract the tests enforce:
- Psyche files loaded: `SOUL.md`, `IDENTITY.md`, `LORE.md`, `FRIENDS.md`, `SELF-KNOWLEDGE.md`
- Exact assembly order as implemented in `buildSystem()` (psyche → runtime → provider → date → tools → skills → tool behavior → friend context)
- Caching contract (`_psycheCache`): first call reads, subsequent calls reuse cache; `resetPsycheCache()` clears.
- Missing-file behavior: load failure returns empty string and section is omitted (current behavior).

**Files**:
- Modify: `ouroboros/ARCHITECTURE.md`

**Acceptance**:
- `ARCHITECTURE.md` contains a clear “System prompt assembly invariants” section aligned with tests and `src/mind/prompt.ts`.

---

### ⬜ Unit 5: Verification run — Implementation
**What**: Run full verification locally:
- `npm test`
- `npm run build` (i.e., `npx tsc`)
- `npm run test:coverage` (coverage gate thresholds are 100%)

**Files**: none

**Acceptance**:
- All commands succeed.

## Progress Log
- 2026-03-05 Created from reflection proposal
