# Cross-Agent Sync-and-Merge Conventions

This document defines mandatory sync-and-merge conventions shared by all agents working in this repository.

## 1. Branch Naming (Mandatory)

All agents use the `<agent>/<slug>` branch naming convention:

- `ouroboros/context-kernel` -- ouroboros working on context kernel
- `slugger/api-client` -- slugger working on API client
- `ouroboros` -- ouroboros general work (no slug)

The first path segment is always the agent name. Do not hardcode agent names -- derive the agent from the branch at runtime.

The old `codex/<agent>` prefix convention is deprecated. Do not use it for new branches.

## 2. Merge Strategy

- Use **merge commits** (not rebase, not squash). This preserves branch history and makes it clear what came from which branch.
- All merges to main happen through pull requests. Never push directly to main.
- The `work-merger` sub-agent handles the merge workflow after `work-doer` completes.

## 3. PR-Based Merge Flow

The merge workflow is:

1. `work-doer` finishes all units on the feature branch
2. `work-merger` runs:
   - Fetches `origin/main`
   - Merges `origin/main` into the feature branch
   - Resolves conflicts using task doc context
   - Runs tests locally (`npm test`)
   - Pushes the branch
   - Creates a PR via `gh pr create`
3. CI runs on the PR
4. If CI passes, `work-merger` merges the PR via `gh pr merge --merge`
5. Feature branch is deleted (local and remote)

## 4. Conflict Resolution Using Task Docs

When merge conflicts occur, the agent resolves them by understanding both intents:

1. **Read own doing doc**: Understand what this branch implemented
2. **Git-informed discovery**: Use `git log origin/main --not HEAD -- '*/tasks/*-doing-*.md'` to find doing docs that landed on main since the branch point
3. **Read discovered docs**: Understand what the other agent changed and why
4. **Resolve preserving both intents**: Both agents' work must be present in the final result

Do not use filename timestamps to discover task docs. Use git history -- it is deterministic and correct.

## 5. Race Condition Retry

If main moves while the merge is in progress (the other agent merged first):

- **Exponential backoff**: Start at 30 seconds, double each time (30s, 1m, 2m, 4m, ...). No retry limit.
- **On each retry**: Re-fetch `origin/main`, re-merge, re-resolve conflicts using task docs, run tests, force-push (`--force-with-lease`).
- **User communication required**: On every retry, clearly report the retry number, wait duration, and reason (e.g., "Main moved again. Retry #3, waiting 2 minutes before re-fetching. Other agent is active.").
- **Never retry silently**. The user wants visibility even when no intervention is needed.

## 6. CI Failure Self-Repair

When CI fails on the PR:

- The agent attempts to fix the failure itself first. It wrote the code (or resolved the merge) and has full task context.
- Common fixable issues: test failures, lint errors, type-check errors, coverage drops, build failures.
- After fixing, push and let CI re-run.
- Escalate to the user only after **two consecutive failed self-repair attempts** on the same failure.

## 7. Post-Merge Cleanup

After the PR is merged to main:

1. Switch to main and pull: `git checkout main && git pull origin main`
2. Delete local branch: `git branch -d <branch>`
3. Delete remote branch: `git push origin --delete <branch>` (if not already deleted by `--delete-branch`)

## 8. Escalation Rules

**Agent fixes (do not escalate):**
- Test, lint, build, coverage failures
- Merge conflicts resolvable from task docs
- `gh repo set-default` not configured
- Race conditions (retry with backoff)

**Escalate to user (STOP and ask):**
- Genuinely ambiguous conflicts where task docs do not clarify intent
- Repeated CI failures after two self-repair attempts
- `gh` not installed or not authenticated
- No GitHub remote configured

## 9. `gh` CLI Preflight

Before any PR operations, verify:

1. `gh` is installed (`which gh`)
2. `gh auth status` passes
3. A GitHub remote exists (`git remote -v`)
4. `gh repo set-default` is configured (self-fix if not)

Self-fixable issues (agent handles): repo default not set. Human-required issues (escalate): `gh` not installed, not authenticated, no GitHub remote.

## 10. Ownership and Applicability

- This is a shared policy for all agents.
- Agent-specific process details can extend this, but cannot relax these requirements.
- The authoritative implementation is in `subagents/work-merger.md`.
- `CONTRIBUTING.md` and `AGENTS.md` reference this document for the detailed policy.
