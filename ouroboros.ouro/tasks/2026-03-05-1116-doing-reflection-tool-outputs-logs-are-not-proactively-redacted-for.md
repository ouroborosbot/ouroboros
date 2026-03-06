# Doing: Centralized secret redaction for tool outputs + tool logging

**Status**: READY_FOR_EXECUTION  
**Execution Mode**: direct

## Objective
Prevent accidental credential exposure by introducing a lightweight secret-redaction layer and applying it to:
- Tool *results* returned to the model (e.g. `shell`, `read_file`, `gh_cli`, integrations)
- Tool *logging summaries* (e.g. `summarizeArgs()` used by runtime callbacks / observability)

Constraints:
- Do **not** modify `src/heart/core.ts` (review-gated). All changes live under `src/repertoire/` plus docs/tests.

## Completion Criteria
- [ ] `src/repertoire/redact.ts` exists and exports:
  - [ ] `redactSecrets(text: string): string`
  - [ ] `redactInObject<T>(value: T): T` (deep-walk JSON-like objects, redacting string fields)
- [ ] Tool outputs are redacted before being returned from `execTool()` (covers base + integration tools)
- [ ] Tool argument summaries (`summarizeArgs`) redact secrets (prevents leaking secrets into logs/events)
- [ ] `ouroboros/ARCHITECTURE.md` documents the redaction layer in `repertoire/`
- [ ] All new code has tests
- [ ] All tests pass

## Work Units

### ⬜ Unit 1a: `repertoire/redact` — Tests
**What**: Add unit tests that define the expected redaction behavior for common secret formats and for safe strings.

**Files**:
- Create: `src/__tests__/repertoire/redact.test.ts`

**Acceptance**: Tests exist and **FAIL** (red). Must cover:
- `redactSecrets()` positive matches:
  - `Authorization: Bearer <token>` (token removed, prefix retained)
  - GitHub tokens (e.g. `ghp_...`, `github_pat_...`)
  - Slack tokens (e.g. `xoxb-...`, `xoxp-...`)
  - Private key blocks (`-----BEGIN ... PRIVATE KEY----- ... -----END ... PRIVATE KEY-----`)
  - Key/value heuristics (case-insensitive): `password=...`, `token: ...`, `client_secret=...`, `api_key=...`
- `redactSecrets()` non-matches (should remain unchanged):
  - Normal sentences containing words like “token”/“password” without a value
  - Short benign strings that resemble IDs but not secrets
- `redactInObject()` deep-walk:
  - Nested objects + arrays are traversed
  - Only string fields are redacted
  - Non-JSON primitives (number/boolean/null) are preserved

### ⬜ Unit 1b: `repertoire/redact` — Implementation
**What**: Implement the redaction utility with conservative, test-driven patterns.

**Files**:
- Create: `src/repertoire/redact.ts`

**Implementation notes (keep conservative)**:
- Prefer a small ordered list of regex replacements.
- Replace secret *values* with a stable marker like `[REDACTED]`.
- For `Authorization: Bearer ...`, keep `Authorization: Bearer ` and redact the remainder.
- `redactInObject<T>` should:
  - Deep-walk arrays and plain objects
  - Redact any encountered string via `redactSecrets`
  - Avoid mutating the input (return a deep-copied structure)
  - Be cycle-safe (e.g., `WeakMap`) or explicitly document “JSON-like only”; tests should match the chosen behavior.

**Acceptance**: All Unit 1a tests **PASS** (green) with 100% coverage for `redact.ts`.

### ⬜ Unit 2a: Tool output redaction — Tests
**What**: Add integration-level tests proving that tool wrappers do not return secrets, and that log summaries do not include them.

**Files**:
- Modify: `src/__tests__/repertoire/tools.test.ts`

**Acceptance**: New/updated tests exist and **FAIL** (red):
- `execTool("shell", ...)` redacts a secret present in mocked `execSync` output
- `execTool("gh_cli", ...)` redacts a secret present in mocked `execSync` output
- `summarizeArgs("shell", {command})` redacts secrets embedded in the command
- `summarizeArgs("save_friend_note", {content})` redacts secrets embedded in the content (prevents logging accidental secrets)

### ⬜ Unit 2b: Tool output redaction — Implementation
**What**: Apply redaction to tool outputs and tool-side logging without touching `heart/`.

**Files**:
- Modify: `src/repertoire/tools.ts`
  - In `execTool()`: redact the handler result before returning it
  - In `summarizeKeyValues()` (or in `summarizeArgs()`): redact any summarized values before emitting summaries
- (Optional but acceptable) Modify: `src/repertoire/tools-base.ts`
  - Only if needed for defense-in-depth; otherwise keep a single centralized redaction point in `execTool()`

**Acceptance**: All Unit 2a tests **PASS** (green) and existing tool tests remain green.

### ⬜ Unit 3a: Architecture note — Tests (doc-only)
**What**: No tests; keep as a small, isolated documentation change.

**Files**:
- Modify: `ouroboros/ARCHITECTURE.md`

**Acceptance**: Doc change is minimal, accurate, and describes:
- Where redaction lives (`src/repertoire/redact.ts`)
- What it protects (tool results + logging summaries)
- The intent (reduce accidental credential exposure in transcripts/observability)

### ⬜ Unit 3b: Verification + coverage gate
**What**: Run full checks locally.

**Commands**:
- `npx tsc`
- `npm test`
- `npm run test:coverage` (coverage gate; repo requires 100%)

**Acceptance**:
- Typecheck passes
- Test suite passes
- Coverage gate passes

### ⬜ Unit 4: Commit
**What**: Create a focused commit.

**Suggested commit message**:
- `Redact secrets in tool outputs and tool logs`

**Paths** (expected):
- `src/repertoire/redact.ts`
- `src/repertoire/tools.ts`
- `src/__tests__/repertoire/redact.test.ts`
- `src/__tests__/repertoire/tools.test.ts`
- `ouroboros/ARCHITECTURE.md`

**Acceptance**: `git_commit` succeeds and staged diff matches only the intended files.

## Progress Log
- 2026-03-05 Created from reflection proposal
