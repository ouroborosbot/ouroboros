# Planning: Sync-and-Merge System for Multi-Agent Collaboration

**Status**: approved
**Created**: 2026-03-03 10:33

## Goal
Build a new `work-merger` subagent that runs after work-doer completes, fetching origin/main, merging, resolving conflicts using task docs for context, running tests, and pushing to main -- enabling two agents (ouroboros on Claude Code, slugger on Codex) to work simultaneously on the same repo without manual merge coordination.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- New `subagents/work-merger.md` subagent definition (same pattern as work-planner.md and work-doer.md)
- Dual-install support: work-merger.md works as a Claude Code sub-agent (symlinked into `~/.claude/agents/`) AND as a Codex skill (hard-linked as `SKILL.md` into `~/.codex/skills/work-merger/`)
- Update `subagents/README.md`: add work-merger to the table, update workflow description, add install commands for both Claude Code and Codex skill harnesses
- Update `AGENTS.md` to add sync-and-merge as a workflow step after work-doer
- The work-merger workflow: fetch, merge, conflict resolution using task docs, test, create PR via `gh`, CI passes, merge PR to main
- Conflict resolution strategy: read own task doc + other agent's recent task docs to understand intent
- Race condition retry flow: if PR has conflicts (other agent merged while this agent was working), pull updated main, re-resolve conflicts using task docs, run tests, force-push branch, let CI re-run
- CI failure self-repair: agent attempts to fix CI failures itself first (it wrote the code, has task context), only escalates to user for genuinely ambiguous issues
- Post-merge cleanup: delete feature branch (local and remote) after PR is merged
- `gh` CLI preflight checks in On Startup: verify installed, authenticated, GitHub remote configured, repo default set. Agent self-repairs what it can, escalates only for human-required input (credentials, OAuth)
- Escalation path: stop and ask user only when truly stuck (not for fixable test/lint failures)
- Branch convention unification: both agents use `<agent>/<slug>` (e.g., `ouroboros/context-kernel`, `slugger/some-feature`). The old `codex/<agent>` prefix convention is deprecated. AGENTS.md branch parsing rules updated accordingly.
- Update `CONTRIBUTING.md`: document sync-and-merge workflow, unified branch convention (`<agent>/<slug>`), and PR-based merge flow
- Update `cross-agent-docs/` with sync-and-merge conventions if needed

### Out of Scope
- Modifications to work-planner or work-doer (they stay untouched)
- Task locking or mid-task synchronization
- Cross-agent code review
- Priority system for merge ordering (first-come-first-served)
- Automated conflict resolution tooling beyond what git provides (no custom merge drivers)
- CI/CD pipeline changes (the existing coverage.yml gate is sufficient)
- Any runtime code changes in `src/` (this is a subagent doc + workflow docs task)

## Completion Criteria
- [ ] `subagents/work-merger.md` exists with YAML frontmatter and complete workflow instructions
- [ ] work-merger is installable as a Claude Code sub-agent (symlink into `~/.claude/agents/`) AND as a Codex skill (hard-link as `~/.codex/skills/work-merger/SKILL.md`)
- [ ] `subagents/README.md` updated: work-merger in table, workflow description extended, install commands for both Claude Code and Codex (including optional `openai.yaml` UI metadata)
- [ ] `AGENTS.md` updated: extended workflow (work-planner -> work-doer -> work-merger), Runtime-Specific Invocation includes `$work-merger` for Codex and sub-agent for Claude Code
- [ ] The work-merger doc covers: fetch, merge, conflict resolution with task doc context, test, PR creation via `gh`, merge PR to main
- [ ] The work-merger doc covers the fast-path: branch already up-to-date with main (still creates PR, CI must pass)
- [ ] The work-merger doc covers dynamic task doc discovery: scan `*/tasks/` dirs with recency bias (most recent doing docs first)
- [ ] The work-merger doc covers race condition retry: re-fetch, re-merge, re-resolve conflicts, force-push, CI re-run
- [ ] The work-merger doc covers CI failure self-repair: agent fixes failures itself first, escalates only when genuinely stuck
- [ ] The work-merger doc covers post-merge cleanup: delete feature branch (local + remote)
- [ ] The work-merger doc covers escalation: when to stop and ask the user (only for genuinely ambiguous issues, not fixable failures)
- [ ] The work-merger doc covers `gh` CLI preflight checks: installed, authenticated, GitHub remote exists, repo default set. Agent self-repairs what it can, escalates only when human input needed (credentials, OAuth)
- [ ] Branch naming convention unified and documented: both agents use `<agent>/<slug>`, old `codex/` prefix convention deprecated in AGENTS.md
- [ ] `CONTRIBUTING.md` updated: sync-and-merge workflow section, unified branch convention (`<agent>/<slug>`), PR-based merge flow
- [ ] `cross-agent-docs/sync-and-merge-conventions.md` created with shared conventions
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

Note: This task is primarily documentation (subagent .md files, workflow docs). The coverage criteria apply if any runtime code is added, but the main deliverables are markdown files. If no runtime code is written, the coverage criteria are satisfied trivially (no new code = nothing to cover).

## Open Questions
(All resolved -- see Decisions Made.)

## Decisions Made
- work-merger is a new subagent, not an extension of work-doer (separation of concerns, keeps work-doer general-purpose)
- No modifications to work-planner or work-doer
- **Branch convention (unified)**: both agents use `<agent>/<slug>` (e.g., `ouroboros/context-kernel`, `slugger/some-feature`). The old `codex/<agent>` prefix convention is deprecated. AGENTS.md branch parsing simplified to just `<agent>[/<slug>]`. The work-merger doc derives the current agent from the first path segment of the branch name -- no hardcoded agent names.
- **Dual-install pattern**: work-merger.md is authored once in `subagents/` with YAML frontmatter. It works as a Claude Code sub-agent AND as a Codex skill (hard-linked as `SKILL.md`). Same pattern already used by work-planner and work-doer.
- No task locking -- first-come-first-served to main
- Conflict resolution uses task docs as context (own doing doc + other agent's recent doing docs on main)
- **Race condition retry**: if the PR has merge conflicts because the other agent merged to main in the meantime, the agent pulls updated main, re-resolves conflicts (re-reading task docs), runs tests, force-pushes the branch, and lets CI re-run. This is the most common real-world scenario.
- **CI failure self-repair**: agent attempts to fix CI failures itself first (lint issues, test failures, etc.) since it wrote the code and has full task context. Only escalates to user when there is genuinely something that needs human input -- not just a failing test it could fix.
- **Post-merge cleanup**: after PR is merged to main, delete the feature branch both locally (`git branch -d`) and remotely (`git push origin --delete`).
- Escalation to user only when truly stuck (ambiguous conflict that can't be resolved from task docs, or repeated CI failures after self-repair attempts)
- KISS throughout -- minimal moving parts
- **Merge strategy**: merge commits (not rebase). Simpler, preserves branch history.
- **PR-based merge to main**: agents create a PR via `gh pr create`, CI must pass, then `gh pr merge`. No direct push to main. Keeps main green.
- **Fast-path when up-to-date**: if `git merge origin/main` is a no-op, skip conflict resolution but still create PR and wait for CI to pass before merging.
- **Dynamic task doc discovery**: scan `*/tasks/` directories to find all agents' task docs. Use recency bias -- sort by filename timestamp (YYYY-MM-DD-HHMM prefix), prioritize reading the most recent doing docs to understand what just changed on main.
- **`gh` CLI available on both machines**: use `gh` for PR creation and merging on both ouroboros (Claude Code) and slugger (Codex).

## Context / References
- Existing subagent definitions: `subagents/work-planner.md`, `subagents/work-doer.md`
- Subagent README with install instructions: `subagents/README.md`
- Workflow definition: `AGENTS.md`
- Cross-agent conventions: `cross-agent-docs/testing-conventions.md`
- Agent task directories: `ouroboros/tasks/`, `slugger/tasks/`
- Branch convention from AGENTS.md (to be updated): currently `[prefix/]<agent>[/feature...]` with `codex/` special-casing, will simplify to `<agent>/<slug>`
- Current branches: `ouroboros` (Claude Code), `codex/slugger` (Codex, remote -- will become `slugger/<slug>` under new convention), `main`
- Codex skill install pattern: hard-link `.md` as `~/.codex/skills/<name>/SKILL.md` + optional `agents/openai.yaml`
- AGENTS.md Runtime-Specific Invocation: Codex uses `$work-planner`/`$work-doer` skill syntax; will need `$work-merger`
- `CONTRIBUTING.md`: existing Branches section (line 5) and Task docs section (line 47) will need updating for unified branch convention and sync-and-merge workflow

## Notes
The work-merger subagent is purely a documentation/workflow artifact -- it instructs the LLM agent on what git operations to perform and how to resolve conflicts. No runtime TypeScript code is expected. The main complexity is writing clear, unambiguous instructions for:

1. The conflict resolution strategy -- how to read own doing doc + discover and read other agents' recent doing docs to understand both intents, then resolve conflicts preserving both.
2. The PR workflow -- push branch, `gh pr create`, wait for CI, `gh pr merge`, handle CI failures.
3. Task doc discovery -- scanning `*/tasks/` dirs, sorting by YYYY-MM-DD-HHMM prefix for recency, reading the most recent doing docs first.
4. The race condition retry loop -- the most common real-world scenario where main moves while the agent is working. Must handle re-fetch, re-merge, re-resolve, force-push cleanly.
5. CI failure self-repair -- the agent should be instructed to treat CI failures as its own problem to fix first, not immediately escalate. Clear boundary between "fixable by agent" and "needs human."

## Progress Log
- 2026-03-03 10:33 Created
- 2026-03-03 10:39 Incorporated user decisions: merge commits, PR-based merge, fast-path, dynamic discovery with recency bias, gh CLI
- 2026-03-03 10:57 Incorporated feedback: corrected branch naming (Codex uses codex/<agent>, not <agent>/<slug>), added explicit Codex skill dual-install requirements
- 2026-03-03 11:04 Incorporated feedback: unified branch naming (<agent>/<slug> for both), race condition retry flow, CI failure self-repair, post-merge branch cleanup
- 2026-03-03 11:07 Added CONTRIBUTING.md to scope, completion criteria, and context references
- 2026-03-03 11:07 Approved by user
