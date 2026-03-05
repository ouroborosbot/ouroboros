# Doing: Repertoire skill loader — mtime-aware cache invalidation

**Status**: READY_FOR_EXECUTION  
**Execution Mode**: direct

## Objective
Ensure `loadSkill()` reliably returns *updated* `.md` skill content during long-running sessions after self-modification by implementing an in-memory cache that is invalidated when the underlying skill file’s `mtimeMs` changes.

Notes from codebase inspection (2026-03-05):
- `src/repertoire/skills.ts` currently tracks only `loadedSkills: string[]` (names), but does **not** cache skill *content*; it reads via `fs.readFileSync()` every call.
- Implementing a small content cache (keyed by resolved skill path) + mtime check will both (a) prevent accidental staleness if future refactors add caching, and (b) provide a clear, testable contract: “same mtime → no re-read; changed mtime → reload”.

## Completion Criteria
- [ ] `loadSkill()` caches skill content by file path and uses `fs.statSync(...).mtimeMs` to decide whether to reuse or reload
- [ ] When the underlying skill `.md` file changes (mtime changes), `loadSkill()` returns updated content without requiring process restart
- [ ] When the underlying file is unchanged, repeated `loadSkill()` calls do not re-read file content
- [ ] `clearLoadedSkills()` also clears any new in-memory skill content cache
- [ ] Tool observability remains intact (still emits `repertoire.load_start`/`repertoire.load_end` even when serving from cache)
- [ ] All new code has tests
- [ ] All tests pass

## Work Units

### ⬜ Unit 1a: mtime-aware caching contract — Tests (RED)
**What**: Add failing tests that define the desired caching + invalidation behavior for `loadSkill()`.

Because existing tests mock `fs`, these tests should be done by extending the current `skills.test.ts` mock to include `statSync` and then asserting `readFileSync` call counts + returned content across repeated loads.

**Files**:
- `src/__tests__/repertoire/skills.test.ts`

**Test cases to add**:
1) **Cache hit**: when `mtimeMs` is unchanged across calls
   - `existsSync` → `true`
   - `statSync` → `{ mtimeMs: 123 }`
   - `readFileSync` → returns `"v1"`
   - Call `loadSkill("my-skill")` twice
   - Expect:
     - both calls return `"v1"`
     - `fs.readFileSync` called **once** total
     - `fs.statSync` called **twice** (or at least once per call)

2) **Cache invalidation**: when `mtimeMs` changes
   - `existsSync` → `true`
   - `statSync` → first call `{ mtimeMs: 123 }`, second call `{ mtimeMs: 456 }`
   - `readFileSync` → first returns `"v1"`, second returns `"v2"`
   - Call `loadSkill("my-skill")` twice
   - Expect:
     - second call returns `"v2"`
     - `fs.readFileSync` called **twice** total

3) **Observability on cache hit** (optional but recommended):
   - Mock `emitNervesEvent` as in the existing “observability contract” test
   - Perform a cache-hit second load
   - Expect `repertoire.load_start` and `repertoire.load_end` emitted for **both** calls

**Acceptance**: New tests exist and FAIL (red) against current implementation (which re-reads every time).

### ⬜ Unit 1b: mtime-aware caching contract — Implementation (GREEN)
**What**: Implement an in-memory cache for skill content in `src/repertoire/skills.ts` that is invalidated on file `mtimeMs` changes.

**Implementation shape**:
- Add a new module-level cache, e.g.
  - `type SkillCacheEntry = { content: string; mtimeMs: number }`
  - `const skillCache = new Map<string, SkillCacheEntry>() // key = skillPath`
- In `loadSkill(skillName)`:
  1) Resolve `skillPath`
  2) `existsSync` guard remains
  3) `statSync(skillPath).mtimeMs` (wrap in try/catch; on stat failure, fall back to reading)
  4) If cached entry exists **and** `entry.mtimeMs === mtimeMs`, return cached content
  5) Else `readFileSync`, update cache, return content
  6) Preserve `loadedSkills` tracking behavior
  7) Preserve `emitNervesEvent` start/end emission on all paths
- Update `clearLoadedSkills()` to also `skillCache.clear()`.

**Files**:
- `src/repertoire/skills.ts`

**Acceptance**: All `skills` tests pass (green), including new cache tests.

### ⬜ Unit 2: Cache key correctness + defensive behavior — Tests
**What**: Add a small test ensuring the cache is keyed by full path (not just name), so future changes to `getAgentRoot()` or `getSkillsDir()` don’t accidentally cross-contaminate content.

Approach with current test style:
- Override `getAgentRoot` mock to return different roots across module resets
- Load the same skill name in two different agent roots and ensure file paths differ and `readFileSync` called for each distinct path

**Files**:
- `src/__tests__/repertoire/skills.test.ts`

**Acceptance**: Test added and initially FAILS until implementation uses `skillPath` as the cache key (or equivalent).

### ⬜ Unit 3: Cache key correctness + defensive behavior — Implementation
**What**: Ensure cache is keyed by resolved file path (`skillPath`), not only by `skillName`.

If Unit 1b already keyed by `skillPath`, this unit may be a no-op beyond minor refactor/cleanup.

**Files**:
- `src/repertoire/skills.ts`

**Acceptance**: Unit 2 test passes.

### ⬜ Unit 4: Typecheck + full test suite
**What**: Run the full local checks to ensure no TS or Vitest regressions.

**Commands**:
- `npm test` (or the repo’s standard test command)
- `npx tsc -p tsconfig.json`

**Acceptance**: All checks pass.

### ⬜ Unit 5: Commit
**What**: Commit the change with explicit paths.

**Message**:
- `Repertoire: invalidate skill cache on mtime change`

**Paths**:
- `src/repertoire/skills.ts`
- `src/__tests__/repertoire/skills.test.ts`

**Acceptance**: `git_commit` reports staged diff stat + “committed”.

## Progress Log
- 2026-03-05 Created from reflection proposal
