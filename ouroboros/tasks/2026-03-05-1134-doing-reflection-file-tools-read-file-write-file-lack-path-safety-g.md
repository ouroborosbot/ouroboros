# Doing: Harden file tools with repo-root path sandbox (read_file/write_file)

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct

## Objective
Prevent path traversal and unintended filesystem access by adding a repo-root “path sandbox” to the local filesystem tools. `read_file`/`write_file` should only operate on paths that resolve within the repository root and should refuse access to sensitive locations (notably `.git/**`).

## Completion Criteria
- [ ] `read_file` and `write_file` reject paths that escape the repo root (e.g. `../outside.txt`).
- [ ] `read_file` and `write_file` reject absolute paths that resolve outside the repo root (e.g. `/etc/passwd`).
- [ ] `read_file` and `write_file` reject paths containing null bytes.
- [ ] `write_file` rejects writes to `.git/**` (and tests cover `.git/config`).
- [ ] (Optional hardening, recommended) `write_file` rejects writes to `ouroboros/CONSTITUTION.md`.
- [ ] Error messages are deterministic and helpful (asserted by tests).
- [ ] All new code has tests
- [ ] All tests pass

## Context / Codebase Notes
- Tool implementations live in `src/repertoire/tools-base.ts` (base local tools).
- Tool dispatch is via `src/repertoire/tools.ts` (`execTool`), which rethrows handler errors.
- There is an existing repo-root helper: `getRepoRoot()` in `src/identity.ts`.
- Existing tests for file tools are in `src/__tests__/repertoire/tools.test.ts` and currently pass absolute `/tmp/...` paths; these will need updating once sandboxing is enforced.

## Work Units

### ⬜ Unit 1a: Path sandbox — Tests (utility-level)
**What**: Add unit tests specifying the sandbox rules and expected error messages.

**Files**:
- Create: `src/__tests__/repertoire/path-guard.test.ts`

**Test cases (minimum)**:
- Allowed:
  - relative path within repo: `"src/repertoire/tools-base.ts"` resolves successfully.
  - absolute path that is inside repo root resolves successfully (e.g. `"/mock/repo/src/repertoire/tools-base.ts"` under mocked repo root).
- Denied:
  - `"../outside.txt"` → throws `Error` with message containing `"Path escapes repository root"`.
  - `"/etc/passwd"` (or any absolute outside root) → throws with message containing `"Path escapes repository root"`.
  - `".git/config"` → throws with message containing `".git"` / `"not allowed"`.
  - `"tmp/evil\u0000.txt"` → throws with message containing `"null byte"`.

**Acceptance**: Tests exist and FAIL (red).

### ⬜ Unit 1b: Path sandbox — Implementation (utility)
**What**: Implement a shared guard that resolves a user-provided path into a safe absolute path within the repo, denying traversal/escapes and sensitive targets.

**Files**:
- Create: `src/repertoire/path-guard.ts`
- (May modify) `src/identity.ts` only if absolutely necessary (prefer using existing `getRepoRoot()` as-is)

**Implementation requirements**:
- Export a function along the lines of:
  - `resolveRepoSandboxPath(requestedPath: string, opts: { op: "read" | "write" }): string`
- Behavior:
  - Reject if `requestedPath` contains `\0`.
  - Compute `repoRoot = getRepoRoot()`.
  - Resolve:
    - If `path.isAbsolute(requestedPath)`: `abs = path.resolve(requestedPath)`.
    - Else: `abs = path.resolve(repoRoot, requestedPath)`.
  - Deny if `abs` is outside `repoRoot` using `path.relative(repoRoot, abs)` (guard both `..` and cross-drive cases).
  - Deny any access to `.git/**` (at minimum for `op: "write"`; recommended for both read+write). Suggested deterministic message: `"Access to .git is not allowed"`.
  - Return the normalized absolute path (`abs`) on success.

**Acceptance**: Unit 1a tests PASS (green).

### ⬜ Unit 2a: read_file/write_file sandboxing — Tests (tool-level)
**What**: Update existing tool tests to use repo-relative paths and add tool-level denial tests.

**Files**:
- Modify: `src/__tests__/repertoire/tools.test.ts`

**Changes**:
- Update the existing success tests:
  - `read_file` should be called with a repo-relative path (e.g. `"tmp/test.txt"`), and should call `fs.readFileSync` with the sandbox-resolved absolute path (e.g. `"/mock/repo/tmp/test.txt"`) and `"utf-8"`.
  - `write_file` should be called with a repo-relative path (e.g. `"tmp/out.txt"`), and should call `fs.writeFileSync` with the sandbox-resolved absolute path.
- Add new denial tests at the `execTool` layer:
  - `execTool("read_file", { path: "../outside.txt" })` rejects with deterministic error message.
  - `execTool("write_file", { path: ".git/config", content: "x" })` rejects with deterministic error message.

**Acceptance**: Tests exist and FAIL (red) until handlers are updated.

### ⬜ Unit 2b: read_file/write_file sandboxing — Implementation
**What**: Apply the guard to `read_file` and `write_file` tool handlers.

**Files**:
- Modify: `src/repertoire/tools-base.ts`
- Modify (if needed): `src/repertoire/tools.ts` (ideally not required)

**Implementation details**:
- Import the guard (e.g. `resolveRepoSandboxPath`) and use it inside handlers:
  - `read_file`: resolve path with `op: "read"`, then `fs.readFileSync(resolved, "utf-8")`.
  - `write_file`: resolve path with `op: "write"`, then `fs.writeFileSync(resolved, content, "utf-8")`.
- Ensure thrown errors are plain `Error` instances with stable `.message` strings (so tests can assert them).

**Acceptance**: Unit 2a tests PASS (green) and the overall suite remains green.

### ⬜ Unit 3a: Optional hardening — Deny constitution writes (Tests)
**What**: Add tests asserting that writes to the constitution file are denied.

**Files**:
- Add/modify: `src/__tests__/repertoire/path-guard.test.ts`
- Add/modify: `src/__tests__/repertoire/tools.test.ts`

**Test cases**:
- Denied: `write_file` to `"ouroboros/CONSTITUTION.md"` rejects with a deterministic message (e.g. `"Writes to ouroboros/CONSTITUTION.md are not allowed"`).

**Acceptance**: Tests exist and FAIL (red).

### ⬜ Unit 3b: Optional hardening — Deny constitution writes (Implementation)
**What**: Implement the deny rule in the path guard for `op: "write"`.

**Files**:
- Modify: `src/repertoire/path-guard.ts`

**Acceptance**: Unit 3a tests PASS (green).

### ⬜ Unit 4: Full verification + commit
**What**: Run full checks and commit as a single change.

**Commands**:
- `npm test`
- `npm run build`
- `npm run test:coverage`

**Commit**:
- Message: `Harden file tools with repo-root path sandbox + tests`
- Include explicit paths for changes (e.g. new guard, updated tools-base, updated tests).

**Acceptance**:
- All checks pass locally.
- One commit contains the change.

## Progress Log
- 2026-03-05 Created from reflection proposal
