# Doing: GitHub Issue Tool

**Status**: drafting
**Execution Mode**: direct
**Created**: 2026-03-04 00:37
**Planning**: ./2026-03-04-0032-planning-gh-issue-tool.md
**Artifacts**: ./2026-03-04-0032-doing-gh-issue-tool/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Allow agents using the ouroboros harness to open GitHub issues on the repo, enabling them to create backlog items, report bugs, and suggest improvements when they identify work that should be tracked.

## Completion Criteria
- [ ] `open_github_issue` tool is defined in `tools-base.ts` with handler
- [ ] Tool is blocked in remote (Teams) channel via `REMOTE_BLOCKED_LOCAL_TOOLS`
- [ ] `summarizeArgs` in `tools.ts` handles the new tool name
- [ ] `confirmationRequired` is set to `true`
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## TDD Requirements
**Strict TDD -- no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation
2. **Verify failure**: Run tests, confirm they FAIL (red)
3. **Minimal implementation**: Write just enough code to pass
4. **Verify pass**: Run tests, confirm they PASS (green)
5. **Refactor**: Clean up, keep tests green
6. **No skipping**: Never write implementation without failing test first

## Work Units

### Legend
- Not started · In progress · Done · Blocked

### Unit 1a: Tool definition -- Tests
**What**: Write tests for the `open_github_issue` tool definition in `tools-base.ts`. Tests should verify:
- The tool is registered in `baseToolDefinitions` with name `open_github_issue`
- The tool schema has `title` (required), `body` (required), and `labels` (optional) parameters
- `confirmationRequired` is `true`
- The handler calls `execSync` with the correct `gh issue create` command including `--repo` flag
- The handler parses the repo from `git remote get-url origin` (both HTTPS and SSH formats)
- Success case: returns the issue URL from `gh` output
- Error case: `execSync` throws -- returns error string
- Error case: `git remote get-url origin` fails -- returns error string
- Labels case: when labels provided, each label is passed as a separate `--label` flag
- Labels case: when labels omitted, no `--label` flags
**Output**: Failing tests in `src/__tests__/repertoire/tools.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `open_github_issue` tool does not exist yet

### Unit 1b: Tool definition -- Implementation
**What**: Add the `open_github_issue` tool definition to `baseToolDefinitions` in `src/repertoire/tools-base.ts`. The handler should:
1. Run `git remote get-url origin` via `execSync` to get the repo URL
2. Parse `owner/repo` from the URL (handle both `https://github.com/owner/repo.git` and `git@github.com:owner/repo.git` formats)
3. Build a `gh issue create --repo owner/repo --title "..." --body "..."` command
4. If `labels` arg is provided, split on commas and add `--label "x"` for each
5. Run via `execSync` and return the output (which includes the issue URL)
6. On error, return `error: <message>` string (same pattern as `gh_cli`)
7. Set `confirmationRequired: true`
**Output**: Working `open_github_issue` tool in `src/repertoire/tools-base.ts`
**Acceptance**: All Unit 1a tests PASS (green), no warnings

### Unit 1c: Tool definition -- Coverage & Refactor
**What**: Verify 100% branch coverage on the new tool handler. Ensure all paths are covered:
- HTTPS remote URL parsing
- SSH remote URL parsing
- Remote URL fetch failure
- `gh issue create` success
- `gh issue create` failure
- With labels / without labels
Refactor if needed (e.g. extract repo URL parsing into a named function for clarity).
**Output**: 100% coverage confirmed, clean code
**Acceptance**: `npm test` passes, coverage report shows 100% on new lines, no warnings

### Unit 2a: Tool registration -- Tests
**What**: Write tests verifying the tool is properly integrated in the registration layer:
- `open_github_issue` appears in the `REMOTE_BLOCKED_LOCAL_TOOLS` set (blocked on Teams channel)
- `summarizeArgs("open_github_issue", { title: "..." })` returns the title (truncated to 40 chars)
- `summarizeArgs("open_github_issue", {})` returns empty string
- `isConfirmationRequired("open_github_issue")` returns `true`
- The tool appears in the base tools list (via `tools` export)
- The tool does NOT appear in Teams channel tool list (via `getToolsForChannel` with Teams capabilities)
- Existing remote-safety test in `tools-remote-safety.test.ts` should also block `open_github_issue`
**Output**: Failing tests
**Acceptance**: Tests exist and FAIL (red) because registration changes not yet made

### Unit 2b: Tool registration -- Implementation
**What**: Update `src/repertoire/tools.ts`:
1. Add `"open_github_issue"` to the `REMOTE_BLOCKED_LOCAL_TOOLS` set
2. Add a `summarizeArgs` case for `"open_github_issue"` that returns `args.title?.slice(0, 40) || ""`
**Output**: Updated `src/repertoire/tools.ts`
**Acceptance**: All Unit 2a tests PASS (green), plus all existing tests still pass

### Unit 2c: Tool registration -- Coverage & Refactor
**What**: Verify coverage on the new `summarizeArgs` branch and `REMOTE_BLOCKED_LOCAL_TOOLS` addition. Confirm no regressions.
**Output**: 100% coverage, all tests green
**Acceptance**: `npm test` passes, no warnings, no coverage gaps

### Unit 3: Update existing tests that enumerate tools
**What**: Several existing tests enumerate the full set of base tools or blocked tools and may need updating:
- Test "base tool definitions include expected tool names" (line ~500): add `expect(names).toContain("open_github_issue")`
- Tests that check Teams channel tool lists to NOT contain blocked tools: add `expect(names).not.toContain("open_github_issue")`
- Tests that build `blockedLocalTools` sets for count verification: add `"open_github_issue"` to the set
- Remote safety test in `tools-remote-safety.test.ts`: add `expect(names).not.toContain("open_github_issue")`
**Output**: All enumeration tests updated and passing
**Acceptance**: Full `npm test` passes with no failures, no warnings

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (1a, 1b, 1c, 2a, 2b, 2c, 3)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-04-0032-doing-gh-issue-tool/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-04 00:37 Created from planning doc (Pass 1 -- First Draft)
- 2026-03-04 00:37 Pass 2 -- Granularity: units are atomic, no changes needed
- 2026-03-04 00:37 Pass 3 -- Validation: all file paths, function names, patterns verified against codebase. 4 blockedLocalTools sets in tests need updating (lines 631, 677, 706, 1602). No doc changes needed.
