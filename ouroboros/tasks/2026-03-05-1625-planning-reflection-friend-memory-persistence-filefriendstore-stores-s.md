# Reflection Proposal: Friend memory persistence (FileFriendStore) stores `schemaVersion` but does not validate or migrate on read, and corrupted/legacy JSON silently collapses to “no friend”, causing hidden memory loss and hard-to-debug resets.

**Generated:** 2026-03-05T16:25:43.874Z
**Effort:** medium
**Constitution check:** requires-review
**Source:** Autonomous reflection cycle

## Gap
Friend memory persistence (FileFriendStore) stores `schemaVersion` but does not validate or migrate on read, and corrupted/legacy JSON silently collapses to “no friend”, causing hidden memory loss and hard-to-debug resets.

## Proposal
Add explicit schema validation + backwards-compatible migrations for friend records in `src/mind/friends/`, and make corruption/invalid-data handling deterministic (recover when possible; fail loudly when not).

Implementation steps:
1. **Introduce a friend-record schema/migration module**
   - Create `src/mind/friends/schema.ts`
   - Define `CURRENT_FRIEND_SCHEMA_VERSION` and functions like:
     - `parseAndMigrateAgentKnowledgeData(raw: unknown): AgentKnowledgeData`
     - `parseAndMigratePiiBridgeData(raw: unknown): PiiBridgeData`
   - Support at least “legacy” cases:
     - missing `schemaVersion` → default + bump
     - missing `totalTokens` → `0`
     - legacy `notes: Record<string,string>` → new `{ value, savedAt }` form (with a reasonable default timestamp)
2. **Tighten FileFriendStore read semantics**
   - Update `src/mind/friends/store-file.ts` so `readJson()` returns `unknown` (not `T`) and differentiates:
     - ENOENT → `null` (file absent)
     - JSON parse error → throw a typed error (e.g., `FriendStoreCorruptFileError` with `filePath`)
     - schema invalid → throw `FriendStoreInvalidDataError` (include reasons)
   - On successful migration, optionally **rewrite** the on-disk JSON to the latest schema (so the system self-heals over time).
3. **Add typed error(s) for callers/logging**
   - Add `src/mind/friends/errors.ts` with small domain errors (`CorruptFile`, `InvalidData`, `UnsupportedSchemaVersion`) to avoid generic exceptions and enable targeted handling upstream.
4. **Test coverage**
   - Add `src/__tests__/mind/friends/store-file.schema.test.ts` using temp directories:
     - loads current schema round-trip
     - loads legacy (missing `schemaVersion`, missing `totalTokens`, legacy notes shape) and migrates correctly
     - corrupt JSON throws `FriendStoreCorruptFileError` (not silently `null`)
     - unsupported future `schemaVersion` throws `UnsupportedSchemaVersion`
5. **(Optional) Document the schema contract**
   - Add a short note to `ARCHITECTURE.md` (or a dedicated doc under `docs/`) describing friend-record schema versioning and migration guarantees.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
