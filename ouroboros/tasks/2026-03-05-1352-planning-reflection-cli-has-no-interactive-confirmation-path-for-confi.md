# Reflection Proposal: CLI has no interactive confirmation path for `confirmationRequired` tools, so safety confirmations are effectively Teams-only and risky local mutation tools aren’t gated.

**Generated:** 2026-03-05T13:52:51.953Z
**Effort:** medium
**Constitution check:** within-bounds
**Source:** Autonomous reflection cycle

## Gap
CLI has no interactive confirmation path for `confirmationRequired` tools, so safety confirmations are effectively Teams-only and risky local mutation tools aren’t gated.

## Proposal
Add first-class “confirm / deny” UX to the CLI adapter and actually mark the most dangerous local tools as `confirmationRequired`, so mutations (file writes, shell, git/gh) require an explicit user yes/no when running interactively.

Implementation steps:
1. **Mark high-risk base tools as confirmation-required**
   - Update `src/repertoire/tools-base.ts`:
     - Set `confirmationRequired: true` on these `ToolDefinition`s: `write_file`, `shell`, `git_commit`, `gh_cli` (optionally also `save_friend_note` if you want memory writes gated).
   - Keep `read_file` / `list_directory` as non-confirming.

2. **Implement CLI confirmation UX**
   - Update `src/senses/cli.ts` (`main()`):
     - After `const cliCallbacks = createCliCallbacks()`, attach `cliCallbacks.onConfirmAction = async (name, args) => { ... }`.
     - Behavior:
       - Stop/flush any active spinner output via `cliCallbacks.flushMarkdown()` and ensure you’re on a clean line.
       - Temporarily `ctrl.restore()` so readline can accept input.
       - Prompt: `Confirm action: <toolName> <summarized args> [y/N]` and read a line via `rl.question(...)`.
       - Re-enter suppressed mode with `ctrl.suppress(() => currentAbort?.abort())` to preserve the existing Ctrl‑C interrupt behavior during model/tool execution.
       - Return `"confirmed"` only for `y/yes` (case-insensitive); otherwise `"denied"`.

3. **Add unit tests for the confirmation behavior**
   - Add a small testable helper (recommended) in `src/senses/cli.ts`, e.g. `promptConfirm(askFn, name, args)` so tests don’t need a real TTY.
   - Add/extend tests under `src/__tests__/senses/` (e.g. `cli.test.ts` or a new `cli-confirm.test.ts`) to verify:
     - `y`/`yes` → confirmed
     - empty input / `n` → denied
     - confirm flow restores/suppresses input controller correctly (mock-based)

4. **Sanity check**
   - Run existing CLI tests and ensure normal non-confirm tools still run without prompts, and confirming tools now work instead of default-denying when `confirmationRequired` is set.

## Status
- [ ] Reviewed by human (if requires-review)
- [ ] Planning doc created
- [ ] Implementation complete
