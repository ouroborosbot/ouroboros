# Reflection Proposal: External API integrations (ADO/GitHub/Graph) lack a standardized retry/backoff policy for transient failures (429/5xx/timeouts), reducing reliability under rate limits and flaky networks.

**Generated:** 2026-03-05T11:03:31.058Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
External API integrations (ADO/GitHub/Graph) lack a standardized retry/backoff policy for transient failures (429/5xx/timeouts), reducing reliability under rate limits and flaky networks.

## Proposal
Implement a shared, well-tested retry/backoff utility and apply it across the integration clients so transient failures are handled consistently and safely (with bounded retries, jitter, and proper respect for `Retry-After`).

Implementation steps:
1. **Add a retry utility**
   - Create `src/repertoire/net/retry.ts` (or `src/repertoire/utils/retry.ts`) exporting something like:
     - `withRetry<T>(fn, options): Promise<T>`
     - Options: `maxAttempts`, `baseDelayMs`, `maxDelayMs`, `jitter`, `retryOn` predicate, `onRetry` callback.
   - Support HTTP-style errors with:
     - Retry on: 429, 502, 503, 504, and network timeouts/connection resets.
     - Respect `Retry-After` (seconds or HTTP date) when present, clamped to `maxDelayMs`.
     - Exponential backoff + jitter; hard cap on total attempts/delay.

2. **Integrate into existing clients**
   - Wrap outbound requests in:
     - `src/repertoire/ado-*.ts` (ADO client calls)
     - `src/repertoire/tools-github.ts` / GitHub client helpers (where requests are made)
     - `src/repertoire/graph/*.ts` (if Graph calls are centralized)
   - Keep public function signatures unchanged; only modify internal request execution.

3. **Add unit tests**
   - Add `src/__tests__/repertoire/retry.test.ts` covering:
     - Retries happen on 429/503 and stop after `maxAttempts`.
     - `Retry-After` is honored.
     - Non-retryable errors (e.g., 400/401/403) fail fast.
     - Jitter/backoff bounds (use deterministic jitter via injected RNG or mock timers).

4. **Add lightweight integration-point tests (optional if feasible without heavy mocking)**
   - Where clients centralize request logic, add tests that assert `withRetry` is invoked (e.g., by injecting a mock request function that fails N times then succeeds).

5. **Documentation**
   - Update `ARCHITECTURE.md` (or a short note in `repertoire/` docs) describing the standard retry policy so new integrations follow the same pattern.

6. **Verify**
   - Run `npx tsc` and full test suite; ensure coverage does not drop.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
