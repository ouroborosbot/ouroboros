# Reflection Proposal: FriendStore external-ID lookup is O(N) directory scanning (no index), so resolving a friend can get slow as stored friends grow.

**Generated:** 2026-03-05T11:42:04.062Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
FriendStore external-ID lookup is O(N) directory scanning (no index), so resolving a friend can get slow as stored friends grow.

## Proposal
Implement an on-disk external-ID index for `FileFriendStore` to make `findByExternalId()` fast and predictable, with safe fallback to the existing scan path.

Implementation steps:
1. Add a small index module (no new deps), e.g. `src/mind/friends/external-id-index.ts`, defining:
   - Index file path (e.g. `${piiBridgePath}/external-id-index.json`)
   - Functions to `readIndex()`, `writeIndexAtomic()` (temp file + rename), and helper `makeKey(provider, externalId, tenantId?)`.
   - A minimal schema/version field so corruption/old versions can be detected and ignored.
2. Update `src/mind/friends/store-file.ts`:
   - In `put()`: after writing PII bridge data, upsert index entries for each `record.externalIds[]` → `record.id`.
   - In `delete()`: remove any index entries that point to the deleted friend ID (scan index keys in-memory; best-effort).
   - In `findByExternalId()`:
     - First attempt: resolve via index key → friendId, then load that friend via existing `get()` flow (agent knowledge + PII merge).
     - If index missing/stale/corrupt (or friend files missing), fall back to the current directory scan behavior; if a match is found, backfill/update the index.
3. Add/extend unit tests in `src/__tests__/mind/friends/store-file.test.ts`:
   - “writes index on put” (assert index file exists and contains the mapping).
   - “findByExternalId uses index when present” (e.g., `vi.spyOn(fsPromises, "readdir")` and assert it is not called).
   - “stale index entry falls back to scan and repairs index” (index points to missing friend; ensure scan still finds the correct one and index updates).
4. Keep backward compatibility: if the index file doesn’t exist, behavior stays identical (scan path), just slower—index is an optimization, not a new required artifact.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
