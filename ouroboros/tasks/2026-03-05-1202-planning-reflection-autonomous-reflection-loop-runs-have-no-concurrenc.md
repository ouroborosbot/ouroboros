# Reflection Proposal: Autonomous reflection/loop runs have no concurrency control, so two overlapping runs can race on git state, task artifacts, and PR creation.

**Generated:** 2026-03-05T12:02:15.714Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Autonomous reflection/loop runs have no concurrency control, so two overlapping runs can race on git state, task artifacts, and PR creation.

## Proposal
Add an advisory “single-flight” lock for reflection executions (both `reflect-entry` and the full `reflect:loop`) to prevent concurrent runs and reduce repo/task corruption risk.

Implementation steps:
1. Create a small locking utility in `src/reflection/lock.ts`:
   - `acquireLock({ name, path })` uses `fs.open(path, 'wx')` to atomically create a lockfile (e.g., `.ouroboros-lock` in repo root).
   - Write JSON metadata into the lock (pid, startTime, command, hostname).
   - If lock exists: detect staleness (pid not running / lock older than TTL) and allow safe takeover; otherwise throw a clear error explaining who holds it.
   - `releaseLock()` removes the lockfile; register `process.on('exit')` and signal handlers (`SIGINT`, `SIGTERM`) to attempt cleanup.
2. Wire the lock into:
   - `src/reflection/reflect-entry.ts` (single reflection CLI)
   - `src/reflection/loop-entry.ts` and/or `src/reflection/autonomous-loop.ts` (full pipeline)
   Acquire at the earliest possible point; release in `finally`.
3. Add a bypass for advanced operators without changing core architecture:
   - Respect env var `OUROBOROS_NO_LOCK=1` (skip locking).
4. Add tests in `src/__tests__/reflection/lock.test.ts`:
   - Acquiring twice fails with informative message.
   - Stale lock takeover works (simulate via old timestamp and non-existent pid).
   - Release removes lockfile.
5. Update `ARCHITECTURE.md` (self-model) under `reflection/` to note: “reflection runs are single-flight via lockfile; override via env var.”

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
