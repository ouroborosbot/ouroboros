# Doing: Standardized retry/backoff for ADO/GitHub/Graph API clients

**Status**: READY_FOR_EXECUTION  
**Execution Mode**: direct

## Objective
Improve reliability of external API integrations (Azure DevOps, GitHub, Microsoft Graph) by introducing a shared, well-tested retry/backoff utility for transient failures (429/5xx/timeouts) and applying it consistently across clients, including proper `Retry-After` handling.

## Completion Criteria
- [ ] `src/repertoire/net/retry.ts` exists and exports a shared `withRetry<T>()` utility with bounded exponential backoff + jitter.
- [ ] Retry policy covers HTTP 429/502/503/504 (+ optionally 500) and common network/timeout errors.
- [ ] `Retry-After` (seconds or HTTP-date) is respected and clamped to `maxDelayMs`.
- [ ] ADO/GitHub/Graph clients use the shared retry utility for outbound requests without changing public function signatures.
- [ ] Unit tests cover retry behavior, bounds, and `Retry-After` parsing.
- [ ] Client tests cover at least one success-after-retries path per client.
- [ ] `ouroboros/ARCHITECTURE.md` documents the standard retry policy for future integrations.
- [ ] All new code has tests
- [ ] All tests pass

## Work Units

### ⬜ Unit 1a: Retry utility — Tests
**What**: Add a focused unit test suite for the shared retry/backoff utility.
**Files**:
- `src/__tests__/repertoire/retry.test.ts` (create)
**Acceptance**:
- Tests exist and FAIL (red).
- Coverage includes:
  - Retries occur for retryable errors and stop at `maxAttempts`.
  - Non-retryable errors fail fast (no sleep, no extra attempts).
  - `Retry-After` handling (seconds and HTTP-date) influences delay (use injected `now()` and `sleep()` spies).
  - Backoff/jitter bounds are deterministic in tests (inject `rng` returning fixed values).
  - Delay is clamped to `maxDelayMs`.

### ⬜ Unit 1b: Retry utility — Implementation
**What**: Implement the shared retry/backoff helper.
**Files**:
- `src/repertoire/net/retry.ts` (create)
**Acceptance**:
- All Unit 1a tests PASS (green).
- `withRetry<T>(fn, options)` supports:
  - `maxAttempts`, `baseDelayMs`, `maxDelayMs`, `jitter` (0..1), `retryOn(err)` predicate, `onRetry(ctx)` callback.
  - Dependency injection hooks for tests (e.g., `rng`, `sleep`, `now`).
- Utility supports HTTP-style transient errors by allowing errors to carry retry metadata (e.g., `{ status?: number; retryAfterMs?: number }`).
- Helper to parse `Retry-After` header exists (exported or fully covered indirectly) and supports:
  - integer seconds
  - HTTP-date

> Implementation note (to keep clients simple): introduce a small helper error type (e.g., `RetryableHttpError`) that carries `{ status, statusText, retryAfterMs }`, so callers can throw it when a `Response` is retryable.

### ⬜ Unit 2a: ADO client retry integration — Tests
**What**: Update/add ADO client tests to validate retry behavior on transient failures.
**Files**:
- `src/__tests__/repertoire/ado-client.test.ts` (modify)
**Acceptance**:
- Tests exist and FAIL (red).
- Add at least:
  - `adoRequest` retries on a transient HTTP failure (e.g., 503 once) then succeeds on a later attempt.
  - `adoRequest` returns the same final error string when retries are exhausted (e.g., always-429 yields `THROTTLED...`).
- Update existing 429/5xx tests as needed to account for multiple `fetch()` calls (use `vi.useFakeTimers()` + `advanceTimersByTimeAsync()` or another deterministic strategy).

### ⬜ Unit 2b: ADO client retry integration — Implementation
**What**: Wrap ADO outbound calls in the shared retry utility.
**Files**:
- `src/repertoire/ado-client.ts` (modify)
- `src/repertoire/net/retry.ts` (modify if needed)
**Acceptance**:
- All ADO client tests PASS (green).
- Public signatures unchanged:
  - `adoRequest()`, `queryWorkItems()`, `discoverOrganizations()`, `discoverProjects()`.
- All `fetch()` calls in this module are executed via `withRetry` and retry only on transient failures:
  - HTTP: 429, 502, 503, 504 (and any other statuses explicitly included in the standardized policy)
  - network errors/timeouts/connection resets
- Non-retryable statuses (400/401/403) do not retry.
- `Retry-After` is used when present on 429 responses.

### ⬜ Unit 3a: GitHub client retry integration — Tests
**What**: Update/add GitHub client tests for retry behavior.
**Files**:
- `src/__tests__/repertoire/github-client.test.ts` (modify)
**Acceptance**:
- Tests exist and FAIL (red).
- Add at least:
  - `githubRequest` retries on 503 then succeeds.
  - Exhausted-retries path returns the same final error string (`THROTTLED`/`SERVICE_ERROR`) while having attempted multiple `fetch()` calls.
- Existing 429/5xx tests updated to account for retries without introducing real-time waits.

### ⬜ Unit 3b: GitHub client retry integration — Implementation
**What**: Integrate `withRetry` into the GitHub client.
**Files**:
- `src/repertoire/github-client.ts` (modify)
**Acceptance**:
- All GitHub client tests PASS (green).
- Public `githubRequest()` signature unchanged.
- Retries are applied only for transient failures; non-retryable errors fail fast.

### ⬜ Unit 4a: Graph client retry integration — Tests
**What**: Update/add Graph client tests to validate retry behavior.
**Files**:
- `src/__tests__/repertoire/graph-client.test.ts` (modify)
**Acceptance**:
- Tests exist and FAIL (red).
- Add at least:
  - `graphRequest` retries on 503 then succeeds.
  - `getProfile` retries on 429 or 503 then succeeds.
- Existing 429/5xx tests updated to account for retries without real delays.

### ⬜ Unit 4b: Graph client retry integration — Implementation
**What**: Integrate `withRetry` into Graph client outbound calls.
**Files**:
- `src/repertoire/graph-client.ts` (modify)
**Acceptance**:
- All Graph client tests PASS (green).
- Public signatures unchanged:
  - `graphRequest()`, `getProfile()`.
- Retries applied consistently across both the generic request and the profile wrapper.

### ⬜ Unit 5a: Document standard retry policy — Tests
**What**: Add/adjust a small doc assertion test only if the codebase has a pattern for doc contract tests in this area.
**Files**:
- (Optional) `src/__tests__/repertoire/*` (modify/create)
**Acceptance**:
- If added, test FAILS (red) until docs are updated.

> If there is no existing pattern for doc assertions, skip this unit and proceed directly to Unit 5b.

### ⬜ Unit 5b: Document standard retry policy — Implementation
**What**: Document the standardized retry/backoff policy in the self-model so future integrations follow it.
**Files**:
- `ouroboros/ARCHITECTURE.md` (modify)
**Acceptance**:
- Documentation added under `repertoire/ — Tools & Skills` (or a new short subsection) describing:
  - which failures retry (429/5xx + network errors)
  - bounded attempts
  - exponential backoff + jitter
  - `Retry-After` behavior
  - guidance: “wrap outbound `fetch` in `withRetry` and throw/propagate a retryable error for retryable HTTP responses.”

### ⬜ Unit 6: Verification (build + test)
**What**: Run full typecheck and test suite.
**Files**: none
**Acceptance**:
- `npm run build` passes (`npx tsc`).
- `npm test` passes (`vitest run`).
- Coverage gate remains at 100% for lines/branches/functions/statements.

## Progress Log
- 2026-03-05 Created from reflection proposal
