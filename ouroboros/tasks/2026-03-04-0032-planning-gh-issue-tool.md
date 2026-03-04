# Planning: GitHub Integration Tool (github_create_issue)

**Status**: approved
**Created**: 2026-03-04 00:32

## Goal
Allow agents using the ouroboros harness to create GitHub issues via the GitHub REST API using per-user OAuth, following the same integration pattern as ADO and Graph tools. Issues are opened as the authenticated human user, not the bot identity.

## Scope

### In Scope
- New `github-client.ts` API client module (like `graph-client.ts` / `ado-client.ts`)
- New `tools-github.ts` tool definitions module (like `tools-teams.ts`)
- `github_create_issue` tool: accepts `owner`, `repo`, `title`, `body`, and optional `labels` parameters
- Tool uses GitHub REST API (`POST /repos/{owner}/{repo}/issues`) with per-user OAuth token
- Available on Teams channel only (integration tool requiring OAuth; NOT a base tool)
- `integration: "github"` on the tool definition
- `confirmationRequired: true` since creating issues is a mutation
- `ToolContext` updated to include optional `githubToken`
- `OAuthConfig` updated to include `githubConnectionName`
- Channel capabilities updated: add `"github"` to Teams' `availableIntegrations`
- Teams token handling updated: fetch `githubToken` from Bot Service, handle `AUTH_REQUIRED:github`
- Tool registration in `tools.ts`: import `githubToolDefinitions`, add to `allDefinitions`, add `summarizeGithubArgs`
- `summarizeArgs` in `tools.ts` delegates to `summarizeGithubArgs` for github tools
- Full test coverage for all new code
- Update existing tests that enumerate tools (tool name lists, integration counts)

### Out of Scope
- Editing, closing, or commenting on existing issues (future tools can reuse the client + OAuth)
- Listing/searching GitHub issues (future tool)
- GitHub webhook integration
- Issue templates, project board assignment, milestones, assignees
- CLI channel support (no local `gh` CLI fallback -- this is an integration-only tool)
- Multiple GitHub tools beyond `github_create_issue` (but architecture supports future expansion)

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

## Open Questions
- (none -- all resolved)

## Decisions Made
- **Tool name**: `github_create_issue` -- follows the pattern of other integration tools (`ado_create_epic`, `ado_create_issue`, `graph_query`, etc.) and is specific enough while leaving room for future `github_*` tools
- **Auth**: Per-user OAuth via Teams Bot Service, same pattern as ADO/Graph. NOT `gh` CLI
- **Identity**: Issues opened as the human user who authorized via OAuth
- **Repo targeting**: `owner` and `repo` accepted as explicit parameters (since it's a proper GitHub API tool, not a local CLI tool)
- **Architecture**: Separate `github-client.ts` + `tools-github.ts` modules, mirroring `graph-client.ts` + `tools-teams.ts` and `ado-client.ts` + `ado-semantic.ts` patterns
- **Integration type**: `"github"` already exists in the `Integration` union type (`src/mind/friends/types.ts` line 16); no type change needed
- **Channel availability**: Teams only (integration tool). CLI channel has no OAuth; users can use `gh_cli` base tool for local GitHub operations
- **Config**: New `githubConnectionName` field in `OAuthConfig` with empty string default (same pattern as `graphConnectionName` and `adoConnectionName`)
- **Labels**: Comma-separated string parameter, split and sent as array in the API request body
- `confirmationRequired: true` because creating issues is a write operation

## Context / References
- `Integration` type already includes `"github"`: `src/mind/friends/types.ts` line 16
- Graph client pattern: `src/repertoire/graph-client.ts` -- `graphRequest()` with token, method, path, body, nerves events, error handling via `handleApiError`
- ADO client pattern: `src/repertoire/ado-client.ts` -- `adoRequest()` with same pattern
- Teams tool definitions: `src/repertoire/tools-teams.ts` -- tool definitions with `integration` field, `AUTH_REQUIRED:*` pattern, `summarizeTeamsArgs`
- ADO semantic tools: `src/repertoire/ado-semantic.ts` -- more complex tool definitions following same pattern
- Tool registration: `src/repertoire/tools.ts` -- `allDefinitions`, `getToolsForChannel`, `summarizeArgs`, `isConfirmationRequired`
- ToolContext: `src/repertoire/tools-base.ts` -- `graphToken`, `adoToken`, `signin`
- Channel capabilities: `src/mind/friends/channel.ts` -- Teams has `availableIntegrations: ["ado", "graph"]`, needs `"github"` added
- OAuth config: `src/config.ts` -- `OAuthConfig` interface with `graphConnectionName`, `adoConnectionName`
- Teams token fetching: `src/senses/teams.ts` -- `api.users.token.get()` pattern, `AUTH_REQUIRED` handling after agent loop
- API error handling: `src/heart/api-error.ts` -- `handleApiError()` shared utility
- Tests: `src/__tests__/repertoire/tools.test.ts` (tool enumeration at lines ~500, ~517, ~549, ~631, ~677, ~706, ~1602; summarizeArgs tests)
- Remote safety tests: `src/__tests__/repertoire/tools-remote-safety.test.ts`
- GitHub REST API: `POST /repos/{owner}/{repo}/issues` -- accepts `{ title, body, labels }` JSON body

## Notes
The `Integration` type already includes `"github"` but no tools use it yet. This is the first GitHub integration tool. The architecture (separate client + tool module) is designed so future GitHub tools (list issues, search, comment, etc.) can be added to `tools-github.ts` and reuse `github-client.ts` without architectural changes.

## Progress Log
- 2026-03-04 00:32 Created (original plan: base tool using gh CLI)
- 2026-03-04 00:36 Resolved open questions: repo targeting, labels, tool name
- 2026-03-04 00:36 Approved (original plan)
- 2026-03-04 00:38 Converted to doing doc (original plan, 4 passes)
- 2026-03-04 09:29 Rewrote planning doc: changed from base tool (gh CLI) to integration tool (GitHub API + OAuth)
