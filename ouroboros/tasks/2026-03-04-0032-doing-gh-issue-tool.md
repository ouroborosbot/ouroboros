# Doing: GitHub Integration Tool (github_create_issue)

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-04 09:29
**Planning**: ./2026-03-04-0032-planning-gh-issue-tool.md
**Artifacts**: ./2026-03-04-0032-doing-gh-issue-tool/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Allow agents using the ouroboros harness to create GitHub issues via the GitHub REST API using per-user OAuth, following the same integration pattern as ADO and Graph tools. Issues are opened as the authenticated human user, not the bot identity.

## Completion Criteria
- [ ] `github-client.ts` exists with `githubRequest()` function following `graph-client.ts` pattern
- [ ] `tools-github.ts` exists with `github_create_issue` tool definition following `tools-teams.ts` pattern
- [ ] `ToolContext` in `tools-base.ts` includes `githubToken?: string`
- [ ] `OAuthConfig` in `config.ts` includes `githubConnectionName: string`
- [ ] Teams `availableIntegrations` includes `"github"` in `channel.ts`
- [ ] `teams.ts` fetches `githubToken` and passes it to `ToolContext`, handles `AUTH_REQUIRED:github`
- [ ] `tools.ts` imports and registers github tool definitions in `allDefinitions`
- [ ] `summarizeArgs` handles `github_create_issue`
- [ ] All existing tool enumeration tests updated for new tool
- [ ] Remote safety tests confirm github tools appear in Teams channel (integration tool, not blocked)
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
⬜ Not started . 🔄 In progress . ✅ Done . ❌ Blocked

### ⬜Unit 0: Config + Type Updates
**What**: Update `ToolContext` in `tools-base.ts` to add `githubToken?: string`. Update `OAuthConfig` in `config.ts` to add `githubConnectionName: string` with empty string default.
**Output**: Updated `tools-base.ts` and `config.ts`
**Acceptance**: Types compile, existing tests still pass. No functional change yet.

### ⬜Unit 1a: GitHub API Client -- Tests
**What**: Write tests for `src/repertoire/github-client.ts` following the pattern of `src/__tests__/repertoire/graph-client.test.ts`. Tests should cover:
- `githubRequest()` makes correct HTTP requests to `https://api.github.com` with Bearer token
- GET request without body
- POST request with JSON body
- Returns pretty-printed JSON on success
- Returns `AUTH_REQUIRED:github` on 401 (via `handleApiError`)
- Returns `PERMISSION_DENIED` on 403
- Returns `THROTTLED` on 429
- Returns `SERVICE_ERROR` on 5xx
- Returns `NETWORK_ERROR` on fetch failure (Error and non-Error)
- Returns generic `ERROR` on other 4xx
- Emits nerves events: `client.request_start`, `client.request_end`, `client.error`
**Output**: Failing tests in `src/__tests__/repertoire/github-client.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `github-client.ts` does not exist yet

### ⬜Unit 1b: GitHub API Client -- Implementation
**What**: Create `src/repertoire/github-client.ts` following `graph-client.ts` pattern exactly:
- `GITHUB_BASE = "https://api.github.com"`
- `githubRequest(token, method, path, body?)` function
- Bearer token auth via `Authorization: Bearer {token}`
- `Accept: application/vnd.github+json` header (GitHub API convention)
- `Content-Type: application/json`
- Nerves events: `client.request_start`, `client.request_end`, `client.error` with `client: "github"`
- Error handling via `handleApiError(res/err, "GitHub", "github")`
- Returns `JSON.stringify(data, null, 2)` on success
**Output**: Working `src/repertoire/github-client.ts`
**Acceptance**: All Unit 1a tests PASS (green), no warnings

### ⬜Unit 1c: GitHub API Client -- Coverage & Refactor
**What**: Verify 100% branch coverage on `github-client.ts`. All paths should already be covered by 1a tests. Refactor if needed.
**Output**: 100% coverage confirmed, clean code
**Acceptance**: `npm test` passes, coverage report shows 100% on new lines, no warnings

### ⬜Unit 2a: GitHub Tool Definitions -- Tests
**What**: Write tests for `src/repertoire/tools-github.ts` following the pattern of teams/ADO tool tests in `tools.test.ts`. Tests should cover:
- `githubToolDefinitions` array contains `github_create_issue` tool
- Tool schema has correct parameters: `owner` (required), `repo` (required), `title` (required), `body` (optional), `labels` (optional)
- `integration` is `"github"`
- `confirmationRequired` is `true`
- Handler returns `AUTH_REQUIRED:github` when `ctx.githubToken` is missing
- Handler calls `githubRequest` with correct method, path, and body on success
- Handler builds correct `POST /repos/{owner}/{repo}/issues` path
- Handler sends `{ title, body, labels: [...] }` in request body
- Labels: comma-separated string is split into array
- Labels: empty/missing labels field sends no labels key (or empty array)
- `summarizeGithubArgs("github_create_issue", { title: "..." })` returns truncated title
- `summarizeGithubArgs("github_create_issue", {})` returns empty string
- `summarizeGithubArgs("unknown_tool", ...)` returns undefined (pass-through)
**Output**: Failing tests in `src/__tests__/repertoire/tools-github.test.ts` (new file)
**Acceptance**: Tests exist and FAIL (red) because `tools-github.ts` does not exist yet

### ⬜Unit 2b: GitHub Tool Definitions -- Implementation
**What**: Create `src/repertoire/tools-github.ts` following `tools-teams.ts` pattern:
- Import `githubRequest` from `./github-client`
- Export `githubToolDefinitions: ToolDefinition[]` with `github_create_issue`
- Export `summarizeGithubArgs(name, args)` function
- Tool definition:
  - `name: "github_create_issue"`
  - `description`: "Create a GitHub issue on a repository. Requires OAuth authorization."
  - Parameters: `owner` (required), `repo` (required), `title` (required), `body` (optional), `labels` (optional, comma-separated)
  - Handler: check `ctx?.githubToken`, return `AUTH_REQUIRED:github` if missing; build JSON body with `{ title, body?, labels?: string[] }`; call `githubRequest(token, "POST", "/repos/{owner}/{repo}/issues", body)`
  - `integration: "github"`
  - `confirmationRequired: true`
**Output**: Working `src/repertoire/tools-github.ts`
**Acceptance**: All Unit 2a tests PASS (green), no warnings

### ⬜Unit 2c: GitHub Tool Definitions -- Coverage & Refactor
**What**: Verify 100% branch coverage on `tools-github.ts`. Ensure all handler branches covered (no token, with/without labels, with/without body).
**Output**: 100% coverage confirmed
**Acceptance**: `npm test` passes, coverage 100% on new lines, no warnings

### ⬜Unit 3a: Tool Registration -- Tests
**What**: Write tests verifying `github_create_issue` is properly integrated in the registration layer (`tools.ts`):
- `allDefinitions` includes `github_create_issue` (verifiable via `execTool` and `isConfirmationRequired`)
- `isConfirmationRequired("github_create_issue")` returns `true`
- `summarizeArgs("github_create_issue", { title: "Fix bug" })` returns `"Fix bug"`
- `summarizeArgs("github_create_issue", {})` returns `""`
- `github_create_issue` does NOT appear in `REMOTE_BLOCKED_LOCAL_TOOLS` (it's an integration tool, not a local tool)
- `getToolsForChannel` with Teams caps that include `"github"` integration returns `github_create_issue`
- `getToolsForChannel` with CLI caps (no integrations) does NOT return `github_create_issue`
**Output**: Failing tests
**Acceptance**: Tests exist and FAIL (red)

### ⬜Unit 3b: Tool Registration -- Implementation
**What**: Update `src/repertoire/tools.ts`:
1. Import `githubToolDefinitions` and `summarizeGithubArgs` from `./tools-github`
2. Add `...githubToolDefinitions` to `allDefinitions` array
3. In `summarizeArgs`, check `summarizeGithubArgs` result (same pattern as `summarizeTeamsArgs`)
4. Re-export `githubToolDefinitions` if needed for test access
**Output**: Updated `src/repertoire/tools.ts`
**Acceptance**: All Unit 3a tests PASS (green), all existing tests still pass

### ⬜Unit 3c: Tool Registration -- Coverage & Refactor
**What**: Verify coverage on new `summarizeArgs` branch and `allDefinitions` addition. Confirm no regressions.
**Output**: 100% coverage, all tests green
**Acceptance**: `npm test` passes, no warnings, no coverage gaps

### ⬜Unit 4a: Channel Capabilities -- Tests
**What**: Write tests verifying `"github"` is in Teams' `availableIntegrations`:
- `getChannelCapabilities("teams").availableIntegrations` contains `"github"`
- `getChannelCapabilities("cli").availableIntegrations` does NOT contain `"github"`
**Output**: Failing tests
**Acceptance**: Tests exist and FAIL (red)

### ⬜Unit 4b: Channel Capabilities -- Implementation
**What**: Update `src/mind/friends/channel.ts`:
- Add `"github"` to the Teams channel's `availableIntegrations` array: `["ado", "graph", "github"]`
**Output**: Updated `channel.ts`
**Acceptance**: All Unit 4a tests PASS (green), existing tests still pass

### ⬜Unit 4c: Channel Capabilities -- Coverage & Refactor
**What**: Verify coverage. This is a data change, no new branches.
**Output**: Tests green, no coverage gaps
**Acceptance**: `npm test` passes, no warnings

### ⬜Unit 5a: Teams Token Handling -- Tests
**What**: Write tests verifying `teams.ts` fetches `githubToken` and handles `AUTH_REQUIRED:github`:
- `handleTeamsMessage` passes `githubToken` in `ToolContext` when `teamsContext.githubToken` is set
- After agent loop, if messages contain `AUTH_REQUIRED:github`, `teamsContext.signin("github")` is called
- `TeamsMessageContext` interface includes `githubToken?: string`
- Token fetch in `app.on("message")` handler attempts to get github token from Bot Service
Note: These tests may need to be integration-style or verify behavior through mocked dependencies. Follow the existing teams test patterns.
**Output**: Failing tests
**Acceptance**: Tests exist and FAIL (red)

### ⬜Unit 5b: Teams Token Handling -- Implementation
**What**: Update `src/senses/teams.ts`:
1. Add `githubToken?: string` to `TeamsMessageContext` interface
2. In `handleTeamsMessage`: add `githubToken: teamsContext.githubToken` to the `toolContext` object
3. In post-agent-loop AUTH_REQUIRED check: add `if (allContent.includes("AUTH_REQUIRED:github")) await teamsContext.signin("github")`
4. In `app.on("message")`: add token fetch for github connection:
   ```
   let githubToken: string | undefined
   try {
     const githubRes = await api.users.token.get({ userId, connectionName: oauthConfig.githubConnectionName, channelId })
     githubToken = githubRes?.token
   } catch { /* no token yet */ }
   ```
5. Add `githubToken` to the `teamsContext` object construction
6. Update console.log to include github token status
**Output**: Updated `src/senses/teams.ts`
**Acceptance**: All Unit 5a tests PASS (green), existing tests still pass

### ⬜Unit 5c: Teams Token Handling -- Coverage & Refactor
**What**: Verify coverage on new token fetch branches and AUTH_REQUIRED handling.
**Output**: 100% coverage on new lines
**Acceptance**: `npm test` passes, no warnings

### ⬜Unit 6: Update Existing Test Enumerations
**What**: Update all existing tests that enumerate tool names, blocked tool sets, or integration counts. Specifically:
- `tools.test.ts` line ~631, ~677, ~706, ~1602: `blockedLocalTools` sets do NOT need `github_create_issue` (it's an integration tool, not blocked locally). But the total tool count in Teams channel tests will increase by 1 (new github tool).
- `tools.test.ts` "teams tool definitions include expected tool names" (~line 517): This tests `teamsToolDefinitions` from `tools-teams.ts`, which is unchanged. But there may be new tests needed for `githubToolDefinitions`.
- `tools-remote-safety.test.ts`: The github tool should APPEAR in Teams tool list (it's an integration tool). Add `expect(names).toContain("github_create_issue")`.
- Any test that counts total tools available on Teams channel needs updating for the new github tool.
- `tools.test.ts` "base tool definitions include expected tool names" (~line 500): No change needed (github is not a base tool).
**Output**: All enumeration tests updated and passing
**Acceptance**: Full `npm test` passes with no failures, no warnings

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (0, 1a, 1b, 1c, 2a, 2b, 2c, 3a, 3b, 3c, 4a, 4b, 4c, 5a, 5b, 5c, 6)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-04-0032-doing-gh-issue-tool/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-04 09:29 Created from planning doc (Pass 1 -- First Draft)
- 2026-03-04 09:31 Pass 2 -- Granularity: all units atomic, testable, single-session; all have What/Output/Acceptance. No changes needed.
- 2026-03-04 09:33 Pass 3 -- Validation: all file paths, types, patterns verified against codebase. Integration type "github" exists in types.ts. handleApiError, emitNervesEvent patterns confirmed. Token fetch/AUTH_REQUIRED patterns in teams.ts verified (lines 421-422, 493-503). blockedLocalTools at 4 test locations confirmed (631, 677, 706, 1602). No doc changes needed.
- [pending] Pass 4 -- Quality: fixed unit header markers from [N] to emoji format. All units have acceptance criteria, no TBDs, completion criteria testable, coverage requirements present. Status updated to READY_FOR_EXECUTION.
