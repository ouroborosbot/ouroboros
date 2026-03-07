# Reflection Proposal: Nerves events are ephemeral (no durable sink), making post-mortem debugging of crashes/hangs impossible.

**Generated:** 2026-03-05T12:43:38.256Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
Nerves events are ephemeral (no durable sink), making post-mortem debugging of crashes/hangs impossible.

## Proposal
Add an optional, durable JSONL event log sink for the `nerves/` event system so every runtime event can be replayed/analyzed after the fact (especially across crashes), without changing the core agent loop architecture.

Implementation steps:
1. **Design a minimal sink interface (if not already present)**
   - Inspect `src/nerves/runtime.ts` and `src/nerves/index.ts` and introduce (or formalize) a `NervesSink` shape like: `emit(event): Promise<void> | void`, implemented by existing sinks (if any).
2. **Implement a file-based JSONL sink with safety guards**
   - Add `src/nerves/sinks/file-sink.ts`:
     - Append each event as one JSON line to a configured path (e.g., `ouroboros/runs/<runId>/events.jsonl`).
     - Implement basic size management: truncate oversized string fields and optionally cap file size with simple rotation (e.g., `events.jsonl`, `events.1.jsonl`).
     - Add minimal redaction/omission for obviously sensitive keys (e.g., fields named like `*token*`, `*secret*`, `*password*`) to reduce risk of credential persistence.
3. **Wire sink activation via configuration without changing core architecture**
   - In `src/nerves/index.ts` (or the nerves initialization point), enable the sink only when an env var is set, e.g.:
     - `OUROBOROS_NERVES_JSONL=ouroboros/runs/current/events.jsonl`
   - If unset, behavior remains unchanged.
4. **Add automated tests**
   - Create `src/__tests__/nerves/file-sink.test.ts`:
     - Writes a couple of events and asserts JSONL lines are appended.
     - Ensures large fields are truncated.
     - Ensures sensitive keys are redacted/removed.
     - Ensures rotation triggers at a small configured size in test.
5. **Add lightweight documentation**
   - Update `ARCHITECTURE.md` (or a small `docs/observability.md`) with:
     - How to enable the sink
     - Where logs are written
     - What truncation/redaction guarantees exist
6. **Validate locally**
   - Run `npx tsc` and full test suite; ensure no coverage drop.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
