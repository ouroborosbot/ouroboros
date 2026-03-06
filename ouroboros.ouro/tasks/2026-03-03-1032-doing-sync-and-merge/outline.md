# work-merger.md -- Section Outline

This outline maps every completion criterion and planning decision to a concrete section in the work-merger subagent definition.

## Document Structure

### 1. YAML Frontmatter
- `name: work-merger`
- `description: ...` (merge workflow after work-doer)
- `model: opus`
- **Criterion**: `subagents/work-merger.md` exists with YAML frontmatter

### 2. Preamble
- One-sentence role description: "You are a sync-and-merge agent..."
- **Pattern**: Matches work-planner/work-doer opening line

### 3. On Startup
- **3a. Detect agent from branch**: Parse branch name using `<agent>[/<slug>]` convention. `git branch --show-current`, split on `/`, first segment is `<agent>`.
- **3b. Find own doing doc**: The doing doc path is provided by the caller or derived from the task that just completed. The agent reads it for context.
- **3c. `gh` CLI preflight checks**:
  1. `gh` installed (check `which gh`)
  2. `gh auth status` passes (authenticated)
  3. GitHub remote exists (`git remote -v` shows github.com)
  4. `gh repo set-default` configured (or agent sets it)
  - Self-fixable: set repo default, diagnose common auth issues
  - Escalate: user must provide credentials, OAuth flow needed
- **Criterion**: gh CLI preflight checks (installed, authenticated, remote, repo default)
- **Criterion**: On Startup derives agent from branch

### 4. Timestamp & Commit Pattern
- Same pattern as work-planner/work-doer: auto-commit, git log for timestamps
- **Pattern**: Consistent with existing subagents

### 5. Merge Loop (Core Workflow)
- **5a. Fetch**: `git fetch origin main`
- **5b. Merge**: `git merge origin/main`
- **5c. Branch on result**:
  - Clean merge (no conflicts) -> proceed to PR workflow (Section 7)
  - Fast-path (already up-to-date) -> proceed to PR workflow (Section 7)
  - Conflicts -> proceed to Conflict Resolution (Section 6)
- **Criterion**: covers fetch, merge, conflict resolution with task doc context, test, PR creation, merge PR to main
- **Criterion**: covers fast-path (branch already up-to-date, still creates PR)

### 6. Conflict Resolution
- **6a. Read own doing doc**: Path from startup context
- **6b. Git-informed task doc discovery**: `git log origin/main --not HEAD -- '*/tasks/*-doing-*.md'` to find doing docs that landed on main since branch point
- **6c. Read discovered doing docs**: Understand what the other agent changed and why
- **6d. Resolve conflicts**: Use both intents to resolve, preserving both agents' work
- **6e. Run tests**: `npm test` to verify resolution is correct
- **Criterion**: git-informed task doc discovery (not timestamp scan)
- **Criterion**: conflict resolution using task doc context

### 7. PR Workflow
- **7a. Push branch**: `git push origin <branch>` (or `git push --force-with-lease` on retry)
- **7b. Create PR**: `gh pr create --base main --head <branch> --title "..." --body "..."`
- **7c. Wait for CI**: Poll `gh pr checks <pr-url>` or `gh pr status`
- **7d. Handle CI result**:
  - CI passes -> merge PR (Section 7e)
  - CI fails -> CI failure self-repair (Section 8)
- **7e. Merge PR**: `gh pr merge <pr-url> --merge` (merge commit strategy)
- **Criterion**: PR creation via gh, merge PR to main
- **Decision**: merge commits (not rebase)

### 8. CI Failure Self-Repair
- Agent attempts to fix CI failures itself first (lint, test failures)
- It wrote the code, has task context, should be able to fix most issues
- After fix: commit, push, CI re-runs
- Clear boundary: escalate only when genuinely stuck (not just a failing test)
- **Criterion**: CI failure self-repair

### 9. Race Condition Retry
- **Trigger**: PR has merge conflicts because main moved (other agent merged)
- **Flow**: exponential backoff (30s, 1m, 2m, 4m...), no retry limit
- **Each retry**:
  1. Communicate to user: retry number, wait duration, reason
  2. Wait (exponential backoff)
  3. Re-fetch origin/main
  4. Re-merge
  5. Re-resolve conflicts using task docs (Section 6)
  6. Run tests
  7. `git push --force-with-lease`
  8. PR updates automatically, CI re-runs
- **Criterion**: exponential backoff, no retry limit, clear user communication

### 10. Post-Merge Cleanup
- Delete feature branch locally: `git branch -d <branch>`
- Delete feature branch remotely: `git push origin --delete <branch>`
- **Criterion**: post-merge cleanup (local + remote)

### 11. Escalation Policy
- **Agent fixes**: test failures, lint issues, merge conflicts resolvable from task docs, CI failures within its capability
- **Escalate to user**: genuinely ambiguous conflicts (task docs don't clarify intent), repeated CI failures after self-repair attempts, auth/credential issues
- Clear boundary between fixable and needs-human
- **Criterion**: escalation (only for genuinely ambiguous issues)

### 12. Rules
- Numbered list of all invariants (matches pattern in work-planner/work-doer)
- Covers: PR-based merge only, never push directly to main, merge commits not rebase, always run tests, always create PR even on fast-path, exponential backoff, cleanup after merge, escalation boundaries, timestamps from git, atomic commits
- **Pattern**: Consistent with existing Rules sections

## Files to Update (Other Units)

### AGENTS.md (Unit 5)
- Simplify branch parsing from `[prefix/]<agent>[/feature...]` with `codex/` special-case to `<agent>[/<slug>]`
- Add work-merger to Runtime-Specific Invocation (`$work-merger` for Codex, sub-agent for Claude Code)
- Extend Gate Flow: step 5 for sync-and-merge after implementation
- **Criterion**: AGENTS.md updated with extended workflow, runtime invocation, branch convention

### subagents/README.md (Unit 6)
- Add work-merger row to Available sub-agents table
- Add install commands for Claude Code (symlink) and Codex (hard-link + optional openai.yaml)
- Extend Workflow section: step 4 for sync-and-merge
- **Criterion**: README.md updated with table, install, workflow

### CONTRIBUTING.md (Unit 7)
- Update Branches section: unified `<agent>/<slug>` for both agents (ouroboros and slugger examples)
- Strengthen "do not commit directly to main" with PR-based merge flow reference
- Add new "Sync and merge" section documenting the workflow
- Update Task docs section to reference work-merger
- **Criterion**: CONTRIBUTING.md updated with sync-and-merge, branch convention, PR flow

### cross-agent-docs/sync-and-merge-conventions.md (Unit 8)
- Numbered sections (matching testing-conventions.md structure)
- Covers: branch naming, merge strategy, PR-based merge flow, conflict resolution, race condition retry, CI self-repair, cleanup, escalation
- Both agents reference this as authoritative policy
- **Criterion**: sync-and-merge-conventions.md created

## Criterion-to-Section Mapping

| Completion Criterion | Section(s) |
|---------------------|-----------|
| work-merger.md exists with YAML frontmatter | 1. Frontmatter |
| Installable as Claude Code sub-agent AND Codex skill | 1. Frontmatter (format), Unit 6 (install docs) |
| subagents/README.md updated | Unit 6 |
| AGENTS.md updated | Unit 5 |
| Covers fetch, merge, conflict resolution, test, PR, merge to main | 5, 6, 7 |
| Covers fast-path | 5c, 7 |
| Covers git-informed task doc discovery | 6b |
| Covers race condition retry with exponential backoff | 9 |
| Covers CI failure self-repair | 8 |
| Covers post-merge cleanup | 10 |
| Covers escalation | 11 |
| Covers gh CLI preflight checks | 3c |
| Branch naming unified | 3a, Unit 5, Unit 7, Unit 8 |
| CONTRIBUTING.md updated | Unit 7 |
| cross-agent-docs/sync-and-merge-conventions.md created | Unit 8 |
| 100% test coverage | N/A (doc-only task) |
| All tests pass | Unit 9 (verify no regressions) |
| No warnings | Unit 9 (verify no regressions) |
