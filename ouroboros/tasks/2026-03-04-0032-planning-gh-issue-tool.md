# Planning: GitHub Issue Tool

**Status**: NEEDS_REVIEW
**Created**: 2026-03-04 00:32

## Goal
Allow agents using the ouroboros harness to open GitHub issues on the repo, enabling them to create backlog items, report bugs, and suggest improvements when they identify work that should be tracked.

## Scope

### In Scope
- New `open_github_issue` tool definition in the repertoire layer
- Tool accepts title, body, and optional labels
- Tool uses `gh issue create` under the hood (leveraging the existing `gh` CLI already available in the base toolset)
- Available on CLI channel (base tool, no integration/OAuth required since `gh` auth is already configured locally)
- Tool returns the created issue URL and number on success
- `confirmationRequired: true` since creating issues is a mutation
- Add to `summarizeArgs` for consistent logging
- Add to `REMOTE_BLOCKED_LOCAL_TOOLS` (relies on local `gh` CLI, same as `gh_cli`)
- Full test coverage for the new tool

### Out of Scope
- GitHub OAuth integration for the Teams channel (would require a new OAuth connection; `gh` CLI is local-only)
- Editing, closing, or commenting on existing issues
- Issue templates or project board assignment
- Listing/searching existing issues (agents can already do this via `gh_cli`)
- Milestone or assignee assignment (keep first version simple)

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

## Open Questions
- [x] ~~Should the tool auto-detect the repo from the current working directory (via `gh` default behavior), or should it accept an optional `repo` parameter for explicit targeting?~~ Resolved: target the ouroboros-agent-harness repo specifically. Derive from the repo's own git remote rather than relying on cwd.
- [x] ~~Should labels be a free-form string (comma-separated) or should we validate against existing repo labels?~~ Resolved: free-form comma-separated string, passed directly to `gh --label`.
- [x] ~~Should the tool name be `open_github_issue`, `gh_create_issue`, or something else?~~ Resolved: `open_github_issue`.

## Decisions Made
- Uses `gh issue create` rather than the GitHub REST API directly, since `gh` CLI auth is already configured and the existing `gh_cli` tool proves the pattern works
- Base tool (not integration tool) because it relies on local `gh` CLI, same as `gh_cli`
- Blocked on remote channels for the same reason `gh_cli` is blocked (local CLI dependency)
- `confirmationRequired: true` because creating issues is a write operation that affects the shared repo
- Repo targeting: derive the repo owner/name from the git remote (e.g. `git remote get-url origin`) at handler invocation time, rather than hardcoding or relying on cwd. This keeps the tool portable if the repo is cloned under a different name or fork.
- Labels: free-form comma-separated string passed directly to `gh --label` flags. No validation against repo labels.
- Tool name: `open_github_issue`

## Context / References
- Tool definition pattern: `src/repertoire/tools-base.ts` (see `gh_cli` at line ~135 for closest analog)
- Tool registration: `src/repertoire/tools.ts` (allDefinitions, REMOTE_BLOCKED_LOCAL_TOOLS, summarizeArgs)
- Existing test pattern: `src/__tests__/repertoire/tools.test.ts`
- Remote safety tests: `src/__tests__/repertoire/tools-remote-safety.test.ts`
- `Integration` type already includes `"github"` in `src/mind/friends/types.ts` (line 16) but no tools use it yet
- `ChannelCapabilities` for CLI has empty `availableIntegrations` (line 9 in `src/mind/friends/channel.ts`)
- `gh issue create` CLI: accepts `--title`, `--body`, `--label`, `--repo` flags
- Repo remote derivation: `git remote get-url origin` returns e.g. `https://github.com/owner/repo.git` or `git@github.com:owner/repo.git`; parse to extract `owner/repo`

## Notes
The agent already has a `gh_cli` tool that can run arbitrary `gh` commands. The value of a dedicated `open_github_issue` tool is: (1) it's discoverable -- the agent sees it in its tool list and knows it can open issues without guessing, (2) it's safer -- constrained to issue creation rather than arbitrary `gh` commands, (3) it produces structured output rather than raw CLI text, and (4) it can have `confirmationRequired` specifically for issue creation without blocking all `gh` usage.

## Progress Log
- 2026-03-04 00:32 Created
- 2026-03-04 00:36 Resolved open questions: repo targeting (derive from git remote), labels (free-form CSV), tool name (open_github_issue)
