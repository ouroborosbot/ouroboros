# Doing: Add optional durable JSONL sink for Nerves runtime events (post‑mortem replay)

**Status**: READY_FOR_EXECUTION  
**Execution Mode**: direct

## Objective
Nerves runtime events (the `src/nerves/*` logging/event system) are currently ephemeral unless a caller explicitly installs a file sink. This makes post‑mortem debugging of crashes/hangs difficult.

Implement an **optional**, **durable**, **append-only JSONL** sink with basic safety guards (truncation, redaction, rotation) and wire it into the default Nerves runtime logger behind an env var so behavior is unchanged unless explicitly enabled.

## Completion Criteria
- [ ] A durable JSONL file sink exists at `src/nerves/sinks/file-sink.ts` and is exported from `src/nerves/index.ts`.
- [ ] Sink supports:
  - [ ] JSONL append (one event per line)
  - [ ] truncation of oversized string fields (configurable)
  - [ ] redaction/omission of sensitive keys (token/secret/password patterns; configurable)
  - [ ] optional file size cap with simple rotation (`events.jsonl` → `events.1.jsonl`)
  - [ ] non-blocking-by-failure behavior (sink errors never throw to caller)
- [ ] Setting `OUROBOROS_NERVES_JSONL=/path/to/events.jsonl` causes runtime events emitted via `emitNervesEvent()` to be appended to that file.
- [ ] When `OUROBOROS_NERVES_JSONL` is unset, runtime behavior is unchanged (still logs to stderr by default; existing tests remain valid).
- [ ] Documentation exists describing how to enable the sink and what safety guarantees exist.
- [ ] All new code has tests
- [ ] All tests pass

## Work Units

### ⬜ Unit 1a: Durable JSONL sink — Tests
**What**: Add failing tests for a durable JSONL sink with truncation/redaction/rotation.

**Notes from codebase review**:
- A sink interface already effectively exists: `export type LogSink = (entry: LogEvent) => void` in `src/nerves/index.ts`.
- There is an existing simple file sink `createNdjsonFileSink()` that appends asynchronously without truncation/redaction/rotation.
- Test framework is Vitest; coverage thresholds are 100%.

**Files**:
- Create: `src/__tests__/nerves/file-sink.test.ts`

**Acceptance**: Tests exist and **FAIL** (red) because `createDurableJsonlFileSink` (or equivalent) does not exist yet.

Test cases to include:
1. **appends JSONL lines**
   - write two events; read file; assert 2 lines; parse JSON; verify ordering.
2. **truncates large fields**
   - configure `maxStringLength` small (e.g., 10)
   - include large `message` and a large `meta.big` string; assert stored strings are truncated (length ≤ max + suffix) and still valid JSON.
3. **redacts/omits sensitive keys**
   - include `meta: { accessToken: "...", secret: "...", password: "...", ok: "..." }`
   - assert sensitive keys are removed or replaced with a sentinel (choose one and assert it).
4. **rotates when max file size exceeded**
   - configure `maxBytes` very small
   - write an event, then a second event big enough to trigger rotation
   - assert `events.1.jsonl` exists and contains the first event, while `events.jsonl` contains the second.
5. **never throws to caller on fs errors**
   - mock `fs.appendFileSync`/`fs.renameSync`/`fs.statSync` to throw
   - assert sink invocation does not throw.

---

### ⬜ Unit 1b: Durable JSONL sink — Implementation
**What**: Implement the durable JSONL sink with safety guards.

**Files**:
- Create: `src/nerves/sinks/file-sink.ts`
- Modify: `src/nerves/index.ts` (export the new sink)

**Implementation requirements**:
- Export a factory with a stable name, e.g.:
  - `export function createDurableJsonlFileSink(filePath: string, options?: DurableJsonlFileSinkOptions): LogSink`
- `DurableJsonlFileSinkOptions` should include (at minimum):
  - `maxStringLength?: number` (default: reasonably conservative)
  - `maxBytes?: number` (optional; when set, enables rotation)
  - `redactKeyPatterns?: RegExp[]` (default includes `/token/i`, `/secret/i`, `/password/i`)
  - `redactionValue?: string | null` (choose either omit or replace; tests must match)
- Behavior:
  - Ensure directory exists (`mkdirSync(dirname(filePath), { recursive: true })`).
  - On each event:
    - sanitize payload (truncate strings, redact sensitive keys) across the event envelope (at least `message` and `meta`; ideally recursively for nested objects).
    - serialize with `JSON.stringify` and append `\n`.
    - if `maxBytes` is set: check current file size (`statSync`); if next write would exceed, rotate:
      - `events.jsonl` → `events.1.jsonl` (overwrite prior `.1` if present)
      - then write to a fresh `events.jsonl`
  - Any filesystem errors must be swallowed (sink must never throw).

**Acceptance**: All tests from Unit 1a pass (green) and coverage remains at 100%.

---

### ⬜ Unit 2a: Env-configured activation — Tests
**What**: Add failing tests asserting runtime events are written when `OUROBOROS_NERVES_JSONL` is set.

**Files**:
- Create: `src/__tests__/nerves/runtime-jsonl-env.test.ts`

**Test cases**:
1. With `process.env.OUROBOROS_NERVES_JSONL` set to a temp path:
   - `setRuntimeLogger(null)` to force default runtime logger construction
   - call `emitNervesEvent({ event: ..., component: ..., message: ..., meta: ... })`
   - assert the file exists and contains a JSON line with matching `event` and `component`.
2. With env var unset:
   - ensure no file is created when emitting (or at minimum ensure the env-only sink is not activated).

**Acceptance**: Tests exist and **FAIL** (red) because runtime wiring is not implemented.

---

### ⬜ Unit 2b: Env-configured activation — Implementation
**What**: Wire the durable sink into the default runtime logger only when `OUROBOROS_NERVES_JSONL` is set.

**Files**:
- Modify: `src/nerves/runtime.ts`
- Modify (if needed): `src/nerves/index.ts` (export `createStderrSink` already exists; ensure new sink export is available)

**Implementation details**:
- In `getRuntimeLogger()` default initialization path, read:
  - `const filePath = process.env.OUROBOROS_NERVES_JSONL`
- If `filePath` is a non-empty string:
  - create a logger with sinks `[createStderrSink(), createDurableJsonlFileSink(filePath)]` (or decide to omit stderr; whichever is chosen must keep existing tests passing).
- If unset:
  - keep current behavior (`createLogger({ level: "info" })`) so stderr default remains.
- Ensure tests isolate env mutations (save/restore `process.env`).

**Acceptance**: Unit 2a tests pass (green) and existing `src/__tests__/nerves/runtime.test.ts` continues to pass unchanged.

---

### ⬜ Unit 3a: Documentation — Tests (optional)
**What**: No tests required for docs; skip unless repo conventions require.

**Acceptance**: N/A

---

### ⬜ Unit 3b: Documentation — Implementation
**What**: Add lightweight documentation for enabling and using the sink.

**Files**:
- Create: `docs/observability.md` (docs dir exists but is currently empty)
  - Include:
    - Env var: `OUROBOROS_NERVES_JSONL=/absolute/or/relative/path/events.jsonl`
    - Log format: JSONL (one `LogEvent` per line)
    - Safety: string truncation behavior, sensitive-key redaction/omission behavior, rotation semantics
    - Suggested default location examples (e.g. `ouroboros/runs/<runId>/events.jsonl`)

**Acceptance**: Doc file exists, is discoverable, and accurately matches implemented behavior.

---

### ⬜ Unit 4: Local validation sweep
**What**: Run typecheck + full tests to ensure no regressions.

**Commands**:
- `npx tsc -p tsconfig.json`
- `npx vitest run`

**Acceptance**: All checks pass.

## Progress Log
- 2026-03-05 Created from reflection proposal
