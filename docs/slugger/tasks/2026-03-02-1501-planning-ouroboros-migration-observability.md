# Planning: Ouroboros Migration — Observability (Phase 2)

**Status**: NEEDS_REVIEW
**Created**: 2026-03-02 15:01

## Goal
Introduce a structured observability foundation (logger + trace IDs) so turn execution, tool behavior, and key engine/channel events are diagnosable without relying on ad-hoc `console` output.

**DO NOT include time estimates (hours/days) — planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- Add shared observability module under `src/observability/` (logger, trace helpers, factory exports).
- Define machine-first NDJSON event schema and configurable `logging.level`.
- Lock required log envelope fields for all structured events: `ts`, `level`, `event`, `trace_id`, `component`, `message`, `meta`.
- Add explicit sink abstraction (sink interface + sink fan-out) so `stderr`/file sinks are pluggable without changing instrumentation call sites.
- Persist structured logs with session-style pathing under `~/.agentconfigs/<agent>/logs/<channel>/<sanitizeKey(key)>.ndjson`.
- Lock key mapping for persisted logs to match existing session keys: CLI uses `session`, Teams uses `conversationId`.
- Keep log persistence append-only NDJSON (one event per line) so multiple agents can parse/validate behavior directly from files.
- Add trace ID propagation through turn entrypoints and engine execution path.
- Instrument runtime paths across `src/` with event-level logging (including channels, engine/core, engine/kicks, mind, clients, config/identity, repertoire, and entrypoints).
- Lock minimum event catalog coverage per component (entrypoints, channels, engine, mind, tools, config/identity, clients, repertoire) for this phase.
- Reflect merged upstream runtime layout changes (including `src/wardrobe/phrases.ts` and `src/wardrobe/format.ts`) in observability instrumentation coverage.
- Keep user-facing output in channel-native paths while routing operational diagnostics through logger sinks (`stderr` + file).
- Define a machine-readable observability coverage contract (required events + declared logpoints + schema/redaction rules) under `src/observability/coverage/`.
- Add `npm run audit:observability` to validate observability coverage from test-captured events.
- Add CI gating so observability coverage audit runs alongside test/coverage checks.
- Add tests for logger behavior, trace helpers, and instrumentation points.
- Ensure test/build/coverage remain green with 100% coverage on new code.

### Out of Scope
- Full daemon log aggregation/retention pipeline and `ouro logs` CLI.
- External telemetry sinks (Datadog, PostHog, etc.).
- Chunk-level content logging and streaming-chunk spam logs.
- Logging sensitive payloads (full user messages, raw tool args/secrets).
- Session/log key collision hardening (hash-suffixed filenames) and migration of existing session naming.

## Completion Criteria
- [ ] `src/observability/` module exists with reusable logger + trace ID primitives.
- [ ] NDJSON (`json`) is the canonical log format with configurable `logging.level` and dual sinks for this phase (`stderr` + session-style file).
- [ ] All structured events use required envelope fields: `ts`, `level`, `event`, `trace_id`, `component`, `message`, `meta`.
- [ ] Sink abstraction exists and routes each event to configured sinks without instrumentation-site changes.
- [ ] File sink persists append-only NDJSON events at `~/.agentconfigs/<agent>/logs/<channel>/<sanitizeKey(key)>.ndjson` without truncating per turn, using session-key parity (CLI=`session`, Teams=`conversationId`).
- [ ] Runtime paths across `src/` emit event-level structured logs with no chunk-level or sensitive-payload dumps.
- [ ] Minimum component event catalog is implemented and exercised in tests (entrypoints/channels/engine including `src/engine/kicks.ts`/mind/tools/config/identity/clients/repertoire).
- [ ] Trace IDs are generated at turn entry and propagated through core execution.
- [ ] Existing ad-hoc operational logging in scoped runtime files is replaced or wrapped by structured logging.
- [ ] Tests cover new observability code and instrumentation behavior.
- [ ] `npm run audit:observability` exists and fails when required event coverage, schema/policy checks, or declared logpoint coverage is incomplete.
- [ ] Observability coverage report artifact is produced with measurable results for: event-catalog coverage, schema/redaction compliance, and logpoint coverage.
- [ ] CI enforces `npm run audit:observability` as a required gate for this phase.
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions
- [ ] None at this time.

## Decisions Made
- This planning doc targets migration sequence item #2: Observability.
- The completed testing-strategy planning/doing task is treated as predecessor and baseline.
- Logging/output contract for this phase is channel-agnostic: user-facing content stays in channel-native output paths (CLI stdout, Teams APIs, etc.), while structured operational diagnostics flow through observability sinks (`stderr` + session-style file in this phase).
- Logging configuration for this phase is machine-first: NDJSON (`json`) is canonical, `logging.level` is configurable, and sinks fan out to `stderr` plus a session-style file sink.
- Sink architecture for this phase is abstraction-first: instrumentation emits one event shape; sink fan-out handles persistence/transport (`stderr` and file now, future sinks later) without touching runtime call sites.
- Required instrumentation surface for this phase is full runtime coverage across `src/` with event-level logs (not chunk-level content), while excluding sensitive payload dumps.
- Required structured log envelope for this phase is locked to: `ts`, `level`, `event`, `trace_id`, `component`, `message`, `meta`.
- Persisted logs use session-style pathing: `~/.agentconfigs/<agent>/logs/<channel>/<sanitizeKey(key)>.ndjson`.
- Persisted log key mapping is locked to current session keys: CLI key=`session`; Teams key=`conversationId`.
- Persisted logs are append-only NDJSON (one JSON event per line) so agents can arbitrarily read and parse run history.
- `sanitizeKey` parity with sessions is intentional for this phase; collision hardening is explicitly deferred.
- Upstream `src/wardrobe/*` modules map to existing component taxonomy for this phase (no new component key): `wardrobe/format` events are `component=channels`; `wardrobe/phrases` events are `component=repertoire`.
- Upstream `src/engine/kicks.ts` is explicitly in-scope for instrumentation and maps to `component=engine` within this phase taxonomy.
- Observability coverage for this phase is audited in three dimensions: required-event catalog coverage, schema/redaction compliance, and declared-logpoint coverage; all must pass in CI.
- Minimum required event catalog for this phase is locked by component:
  - entrypoints: `turn.start`, `turn.end`, `turn.error`
  - channels: `channel.message_sent`, `channel.error`
  - engine: `engine.turn_start`, `engine.turn_end`, `engine.error`
  - mind: `mind.step_start`, `mind.step_end`, `mind.error`
  - tools: `tool.start`, `tool.end`, `tool.error`
  - config/identity: `config.load`, `identity.resolve`, `config_identity.error`
  - clients: `client.request_start`, `client.request_end`, `client.error`
  - repertoire: `repertoire.load_start`, `repertoire.load_end`, `repertoire.error`

## Context / References
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/implementation-order.md`
- `~/clawd/tasks/ongoing/2026-02-28-1900-ouroboros-migration/observability.md`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/channels/cli.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/channels/teams.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/engine/core.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/engine/kicks.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/wardrobe/phrases.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/src/wardrobe/format.ts`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/.github/workflows/coverage.yml`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/package.json`
- `/Users/arimendelow/Projects/ouroboros-agent-harness/AGENTS.md`

## Notes
Current codebase still uses ad-hoc `console` logging in channel and entrypoint code; this phase should establish a consistent structured baseline without overreaching into daemon-level ops plumbing.
Model consumption is primary: logs should be stable, structured, and parseable for behavior analysis and automated verification loops.
Merged `origin/main` into `codex/slugger` before execution planning refresh; upstream includes CLI/Teams formatting and phrase-module refactors that must be included in instrumentation scope.

## Progress Log
- [2026-03-02 15:01] Created
- [2026-03-02 15:24] Resolved Open Question #1 with cross-channel output vs observability contract
- [2026-03-02 15:32] Resolved Open Question #2 with machine-first json logging config (level configurable, stderr sink only)
- [2026-03-02 15:35] Resolved Open Question #3 with full runtime event-level instrumentation scope
- [2026-03-02 15:37] Consistency pass: aligned Scope/Out of Scope/Completion Criteria with finalized Q1-Q3 decisions
- [2026-03-02 15:48] Locked required log envelope fields and minimum component event catalog to remove interpretation gaps
- [2026-03-02 15:50] Planning approved for conversion to doing doc
- [2026-03-02 16:05] Added session-style append-only NDJSON file persistence (`stderr` + file sinks) and deferred key-collision hardening
- [2026-03-02 16:11] Consistency cleanup: aligned sink contract to dual-sink decision, locked key mapping semantics, and required sink abstraction
- [2026-03-02 16:15] Synced planning assumptions to merged `origin/main` runtime changes and re-approved for conversion refresh
- [2026-03-02 16:17] Validation clarification: mapped `src/wardrobe/*` files onto existing event component taxonomy (channels/repertoire)
- [2026-03-02 16:37] Explicitly added `src/engine/kicks.ts` instrumentation/testing coverage to scope and component taxonomy
- [PENDING_OBS_AUDIT_TS] Added observability-coverage gate scope (`audit:observability` + CI) with explicit measurable dimensions
