# Planning: Sync-and-Merge System for Multi-Agent Collaboration

**Status**: NEEDS_REVIEW
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
- Escalation path: stop and ask user when truly stuck
- Branch convention documentation: Claude Code uses `<agent>/<slug>` (e.g., `ouroboros/context-kernel`), Codex uses `codex/<agent>` (e.g., `codex/slugger`). Follows existing AGENTS.md `[prefix/]<agent>[/feature...]` parsing.
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
- [ ] `subagents/README.md` install instructions updated to include work-merger commands for both Claude Code and Codex skill harnesses (including optional `openai.yaml` UI metadata)
- [ ] `subagents/README.md` updated: work-merger in table, workflow description extended, install commands for both Claude Code and Codex
- [ ] `AGENTS.md` updated: extended workflow (work-planner -> work-doer -> work-merger), Runtime-Specific Invocation includes `$work-merger` for Codex and sub-agent for Claude Code
- [ ] The work-merger doc covers: fetch, merge, conflict resolution with task doc context, test, PR creation via `gh`, merge PR to main
- [ ] The work-merger doc covers the fast-path: branch already up-to-date with main (still creates PR, CI must pass)
- [ ] The work-merger doc covers dynamic task doc discovery: scan `*/tasks/` dirs with recency bias (most recent doing docs first)
- [ ] The work-merger doc covers escalation: when to stop and ask the user
- [ ] Branch naming convention documented: Claude Code uses `<agent>/<slug>`, Codex uses `codex/<agent>` (follows AGENTS.md `[prefix/]<agent>[/feature...]` parsing)
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
- **Branch convention**: Claude Code uses `<agent>/<slug>` (e.g., `ouroboros/context-kernel`). Codex uses `codex/<agent>` (e.g., `codex/slugger`). Follows existing AGENTS.md `[prefix/]<agent>[/feature...]` parsing. The work-merger doc should not hardcode agent names -- it derives the current agent from the branch name using this convention.
- **Dual-install pattern**: work-merger.md is authored once in `subagents/` with YAML frontmatter. It works as a Claude Code sub-agent AND as a Codex skill (hard-linked as `SKILL.md`). Same pattern already used by work-planner and work-doer.
- No task locking -- first-come-first-served to main
- Conflict resolution uses task docs as context (own doing doc + other agent's recent doing docs on main)
- Escalation to user only when truly stuck (tests fail after resolution, or conflict is ambiguous)
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
- Branch convention from AGENTS.md: branch encodes agent name, parsed as `[prefix/]<agent>[/feature...]`
- Current branches: `ouroboros` (Claude Code), `codex/slugger` (Codex, remote), `main`
- Codex skill install pattern: hard-link `.md` as `~/.codex/skills/<name>/SKILL.md` + optional `agents/openai.yaml`
- AGENTS.md Runtime-Specific Invocation: Codex uses `$work-planner`/`$work-doer` skill syntax; will need `$work-merger`

## Notes
The work-merger subagent is purely a documentation/workflow artifact -- it instructs the LLM agent on what git operations to perform and how to resolve conflicts. No runtime TypeScript code is expected. The main complexity is writing clear, unambiguous instructions for:

1. The conflict resolution strategy -- how to read own doing doc + discover and read other agents' recent doing docs to understand both intents, then resolve conflicts preserving both.
2. The PR workflow -- push branch, `gh pr create`, wait for CI, `gh pr merge`, handle CI failures.
3. Task doc discovery -- scanning `*/tasks/` dirs, sorting by YYYY-MM-DD-HHMM prefix for recency, reading the most recent doing docs first.

## Progress Log
- 2026-03-03 10:33 Created
- 2026-03-03 10:39 Incorporated user decisions: merge commits, PR-based merge, fast-path, dynamic discovery with recency bias, gh CLI
- 2026-03-03 10:57 Incorporated feedback: corrected branch naming (Codex uses codex/<agent>, not <agent>/<slug>), added explicit Codex skill dual-install requirements
