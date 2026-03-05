# Doing: CLI interactive confirmations for `confirmationRequired` tools

**Status**: READY_FOR_EXECUTION  
**Execution Mode**: direct

## Objective
Make CLI runs safely gate high-risk local mutation tools behind an explicit interactive yes/no confirmation, matching the existing Teams confirmation behavior. This prevents silent auto-deny (current CLI behavior when `confirmationRequired` is set) and reduces the risk of accidental local mutations.

## Completion Criteria
- [ ] High-risk local tools (`write_file`, `shell`, `git_commit`, `gh_cli`) are marked `confirmationRequired: true` in the base tool registry
- [ ] CLI implements an interactive confirm/deny UX and wires it into `ChannelCallbacks.onConfirmAction`
- [ ] Confirmation prompt uses summarized args (no huge payloads like file contents)
- [ ] Confirmation flow temporarily restores readline input, then re-suppresses it to preserve existing Ctrl-C abort behavior during tool/model execution
- [ ] `isConfirmationRequired()` tests updated to reflect new base-tool gating behavior
- [ ] All new code has tests
- [ ] All tests pass

## Work Units

### ⬜ Unit 1a: Base tool confirmation flags — Tests (red)
**What**: Update/extend tests to assert the correct confirmation-required behavior for base tools.

**Files**:
- `src/__tests__/repertoire/tools.test.ts`

**Acceptance**:
- Tests exist and FAIL because base tool definitions are not yet marked with `confirmationRequired: true`
- Specifically:
  - `isConfirmationRequired("shell")` and `isConfirmationRequired("write_file")` (and `git_commit`, `gh_cli`) are expected to be `true`
  - `isConfirmationRequired("read_file")` and `isConfirmationRequired("list_directory")` remain `false`

### ⬜ Unit 1b: Base tool confirmation flags — Implementation (green)
**What**: Mark the most dangerous local mutation tools as requiring confirmation.

**Files**:
- `src/repertoire/tools-base.ts`

**Implementation Notes**:
- Set `confirmationRequired: true` on the `ToolDefinition` entries for:
  - `write_file`
  - `shell`
  - `git_commit`
  - `gh_cli`
- Keep read-only-ish tools non-confirming:
  - `read_file`, `list_directory`, `list_skills`, `load_skill`, `get_current_time`, `claude`, `web_search`
- (Explicitly defer gating `save_friend_note` unless added as a follow-up task; do not change it in this task.)

**Acceptance**:
- Unit 1a tests now PASS
- No other tool schemas are altered except the `confirmationRequired` flag

### ⬜ Unit 2a: CLI confirmation UX — Tests for helper + control flow (red)
**What**: Add unit tests for the confirmation decision logic and for the restore/suppress input-controller sequencing.

**Files**:
- Create `src/__tests__/senses/cli-confirm.test.ts` (preferred) or extend an existing CLI test file under `src/__tests__/senses/`
- `src/senses/cli.ts` (will require new exported helper(s))

**Test Cases**:
1. `promptConfirm()` decision logic:
   - input `"y"` => `"confirmed"`
   - input `"yes"` (case-insensitive) => `"confirmed"`
   - empty / whitespace / `"n"` => `"denied"`
2. `createCliConfirmActionHandler()` (or equivalent exported factory) wiring behavior (mock-based):
   - calls `flushMarkdown()` before prompting
   - calls `ctrl.restore()` before asking
   - calls `ctrl.suppress(...)` after asking
   - the interrupt callback passed to `ctrl.suppress` aborts the current `AbortController` (when invoked)

**Acceptance**:
- Tests exist and FAIL because the helper(s) / handler factory are not yet implemented

### ⬜ Unit 2b: CLI confirmation UX — Implementation + wiring (green)
**What**: Implement a first-class interactive confirmation prompt for CLI and attach it to `cliCallbacks.onConfirmAction`.

**Files**:
- `src/senses/cli.ts`

**Implementation Notes**:
- Add a small exported helper to keep confirmation logic testable without a real TTY. Recommended structure:
  - `export async function promptConfirm(askFn, name, argsSummary): Promise<"confirmed"|"denied">`
    - returns `"confirmed"` only for `y/yes` (case-insensitive)
    - otherwise returns `"denied"`
  - `export function createCliConfirmActionHandler({...deps}): (name,args)=>Promise<...>`
    - deps should include:
      - `flushMarkdown: () => void`
      - `ctrl: InputController`
      - `ask: (prompt: string) => Promise<string>` (thin wrapper over `rl.question`)
      - `getAbort: () => AbortController | null`
      - `summarize: (name: string, args: Record<string,string>) => string` (use `summarizeArgs` from `src/repertoire/tools`)

- In `main()`:
  - after `const cliCallbacks = createCliCallbacks()`, attach:
    - `cliCallbacks.onConfirmAction = createCliConfirmActionHandler({ ... })`
  - Ensure the prompt occurs on a clean line:
    - call `cliCallbacks.flushMarkdown()` to stop spinner + flush buffered markdown
    - write a newline if needed (ok to be conservative and always `process.stdout.write("\n")` before prompting)
  - Temporarily `ctrl.restore()` so readline can accept input
  - Prompt format:
    - `Confirm action: <toolName> <argsSummary> [y/N] `
  - After the answer is received, re-enter suppressed mode:
    - `ctrl.suppress(() => getAbort()?.abort())`

**Acceptance**:
- Unit 2a tests PASS
- Interactive CLI runs prompt for confirm-required tools (and default-deny behavior is eliminated)
- Ctrl-C during tool/model execution still aborts the current run (existing behavior preserved)

### ⬜ Unit 3: Regression + sanity checks (green)
**What**: Ensure the full suite and key flows behave as expected.

**Files**:
- (No new files required; run tests)

**Acceptance**:
- `npm test` / `vitest` passes
- Non-confirm tools still run without prompts
- Confirm-required tools:
  - deny path results in the tool call receiving `"Action cancelled by user."`
  - confirm path executes the tool normally

## Progress Log
- 2026-03-05 Created from reflection proposal
