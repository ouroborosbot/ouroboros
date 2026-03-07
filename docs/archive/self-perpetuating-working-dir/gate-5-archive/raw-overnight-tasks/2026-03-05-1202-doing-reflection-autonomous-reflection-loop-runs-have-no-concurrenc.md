# Doing: Add single-flight lock to prevent concurrent reflection/loop runs

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct

## Objective
Prevent two overlapping reflection executions (both `npm run reflect` and `npm run reflect:loop`) from racing on git state, task artifacts, and PR creation by introducing an advisory lockfile (“single-flight”) with staleness detection and an operator bypass.

## Completion Criteria
- [ ] `src/reflection/lock.ts` provides an advisory lockfile utility with:
  - atomic lock acquisition
  - JSON metadata (pid, startTime, command, hostname)
  - clear error when lock is already held
  - stale-lock takeover (pid not running OR older than TTL)
  - reliable release + cleanup hooks
- [ ] `npm run reflect` and `npm run reflect:loop` acquire the lock at startup and release it in `finally`
- [ ] `OUROBOROS_NO_LOCK=1` bypasses locking
- [ ] `src/__tests__/reflection/lock.test.ts` covers: double acquire fails, stale takeover works, release removes lockfile, bypass path
- [ ] `ouroboros/ARCHITECTURE.md` documents reflection single-flight behavior + override
- [ ] All new code has tests
- [ ] All tests pass

## Work Units

### ⬜ Unit 1a: Advisory lock utility — Tests
**What**: Add failing tests that specify the lockfile semantics (happy path, held lock error message, stale takeover, release, env bypass).

**Files**:
- `src/__tests__/reflection/lock.test.ts` (new)

**Acceptance**:
- Tests exist and FAIL (red)
- Tests assert:
  - acquiring the same lock path twice throws with an informative message mentioning lock holder metadata (at least pid + startTime, ideally hostname/command)
  - a stale lock (non-existent pid and/or older than TTL) is taken over and results in valid lock metadata
  - `release()` removes the lockfile
  - `OUROBOROS_NO_LOCK=1` returns a no-op lock handle and does not create a lockfile

---

### ⬜ Unit 1b: Advisory lock utility — Implementation
**What**: Implement `src/reflection/lock.ts`.

**Design constraints (match proposal + codebase conventions)**:
- `acquireLock({ name, path })` uses atomic creation (`fs.open(..., "wx")` or equivalent) and writes JSON metadata.
- Metadata shape (minimum):
  - `pid: number`
  - `startTime: string` (ISO)
  - `command: string` (e.g., `process.argv.join(" ")`)
  - `hostname: string`
- If lock exists:
  - read + parse metadata if possible (handle malformed JSON)
  - determine staleness by either:
    - `pid` not running (via `process.kill(pid, 0)` with ESRCH handling)
    - lock age older than a default TTL (export a default constant; allow override via optional parameter for tests)
  - if stale, remove lock and retry acquisition
  - if not stale, throw an error that clearly explains the lock is held and prints the holder metadata
- `release()`:
  - removes lockfile
  - is safe to call multiple times (idempotent)
- Cleanup hooks:
  - register `process.on("exit")` and signal handlers (`SIGINT`, `SIGTERM`) to attempt best-effort removal
  - ensure handlers can be unregistered on normal `release()` to avoid leaks (important for tests)
- Bypass:
  - if `process.env.OUROBOROS_NO_LOCK === "1"`, skip acquiring and return a no-op handle

**Files**:
- `src/reflection/lock.ts` (new)

**Acceptance**:
- All Unit 1a tests PASS (green)
- `vitest run src/__tests__/reflection/lock.test.ts` passes with 100% coverage for `src/reflection/lock.ts`

---

### ⬜ Unit 2: Wire lock into reflection entrypoints
**What**: Acquire the lock as early as possible in both reflection entrypoints, and release in a `finally` block.

**Implementation notes**:
- Use a single shared lockfile path in repo root to prevent overlap between `reflect-entry` and `loop-entry`.
  - Prefer: `path.join(getRepoRoot(), ".ouroboros-lock")` or equivalent (loop-entry already derives `projectRoot` which is the repo root).
- Name the lock meaningfully (e.g., `"reflect"` and `"reflect:loop"`) for metadata readability.
- Ensure `OUROBOROS_NO_LOCK=1` is respected (ideally centrally via `acquireLock`).

**Files**:
- `src/reflection/reflect-entry.ts`
- `src/reflection/loop-entry.ts`

**Acceptance**:
- Running `npm run reflect:dry` acquires and releases the lockfile when not bypassed
- Running `npm run reflect:loop:dry` acquires and releases the lockfile when not bypassed
- If the lock is already held, each command exits with a clear, actionable error message indicating who holds the lock

---

### ⬜ Unit 3: Document single-flight behavior in self-model
**What**: Update the reflection module section of `ouroboros/ARCHITECTURE.md` to note that reflection runs are protected by a lockfile and can be bypassed with `OUROBOROS_NO_LOCK=1`.

**Files**:
- `ouroboros/ARCHITECTURE.md`

**Acceptance**:
- Architecture doc includes a succinct note under `reflection/` describing:
  - lockfile location/name (e.g., `.ouroboros-lock` at repo root)
  - single-flight intent (prevents concurrent runs)
  - override environment variable

---

### ⬜ Unit 4: End-to-end sanity check
**What**: Run the full test suite and perform a quick manual concurrency sanity check.

**Steps**:
- `npm test`
- Manual check (optional but fast):
  1. Start `npm run reflect:loop:dry` in one shell
  2. Immediately start a second `npm run reflect:loop:dry` (or `npm run reflect:dry`)
  3. Confirm the second run fails fast with the “lock held” error

**Files**: none

**Acceptance**:
- All tests pass
- Manual concurrency check behaves as expected

## Progress Log
- 2026-03-05 Created from reflection proposal