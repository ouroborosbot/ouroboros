# Planning: Sync-and-Merge System for Multi-Agent Collaboration

**Status**: drafting
**Created**: 2026-03-03 10:33

## Goal
Build a new `work-merger` subagent that runs after work-doer completes, fetching origin/main, merging, resolving conflicts using task docs for context, running tests, and pushing to main -- enabling two agents (ouroboros on Claude Code, slugger on Codex) to work simultaneously on the same repo without manual merge coordination.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### In Scope
- New `subagents/work-merger.md` subagent definition (same pattern as work-planner.md and work-doer.md)
- Symlink/install instructions for both Claude Code and Codex skill harnesses
- Update `subagents/README.md` to document work-merger
- Update `AGENTS.md` to add sync-and-merge as a workflow step after work-doer
- The work-merger workflow: fetch, merge, conflict resolution using task docs, test, push, merge to main
- Conflict resolution strategy: read own task doc + other agent's recent task docs to understand intent
- Escalation path: stop and ask user when truly stuck
- Branch convention enforcement: `<agent>/<slug>` branches, short-lived
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
- [ ] work-merger is installable as both a Claude Code sub-agent and a Codex skill (same dual-install pattern as work-planner/work-doer)
- [ ] `subagents/README.md` updated with work-merger row in the table and updated workflow description
- [ ] `AGENTS.md` updated to reflect the extended workflow: work-planner -> work-doer -> work-merger
- [ ] The work-merger doc covers: fetch, merge, conflict resolution with task doc context, test, push, merge to main
- [ ] The work-merger doc covers escalation: when to stop and ask the user
- [ ] Branch naming convention (`<agent>/<slug>`) is documented
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
- [ ] Should work-merger handle the case where the agent's branch is already up-to-date with main (no-op fast path)?
- [ ] Should the merge strategy be merge commit or rebase? (Merge commit is simpler and preserves branch history; rebase is cleaner but riskier with conflicts.)
- [ ] Should work-merger create a PR or directly push to main? (Current workflow seems to be direct push to main from agent branches.)
- [ ] Should the work-merger doc include instructions for reading task docs from BOTH `ouroboros/tasks/` and `slugger/tasks/`, or should it be generic (`<agent>/tasks/`) and discover agent directories dynamically?
- [ ] Does the Codex/slugger environment have access to `gh` CLI, or should merge-to-main be done purely with git?

## Decisions Made
- work-merger is a new subagent, not an extension of work-doer (separation of concerns, keeps work-doer general-purpose)
- No modifications to work-planner or work-doer
- Branch convention: `<agent>/<slug>` (e.g., `ouroboros/context-kernel`, `slugger/testing-strategy`)
- No task locking -- first-come-first-served to main
- Conflict resolution uses task docs as context (own doing doc + other agent's recent doing docs on main)
- Escalation to user only when truly stuck (tests fail after resolution, or conflict is ambiguous)
- KISS throughout -- minimal moving parts

## Context / References
- Existing subagent definitions: `subagents/work-planner.md`, `subagents/work-doer.md`
- Subagent README with install instructions: `subagents/README.md`
- Workflow definition: `AGENTS.md`
- Cross-agent conventions: `cross-agent-docs/testing-conventions.md`
- Agent task directories: `ouroboros/tasks/`, `slugger/tasks/`
- Branch convention from AGENTS.md: branch encodes agent name, parsed as `[prefix/]<agent>[/feature...]`
- Current branches: `ouroboros`, `codex/slugger` (remote), `main`

## Notes
The work-merger subagent is purely a documentation/workflow artifact -- it instructs the LLM agent on what git operations to perform and how to resolve conflicts. No runtime TypeScript code is expected. The main complexity is writing clear, unambiguous instructions for the conflict resolution strategy, particularly how to read and interpret task docs from the other agent.

## Progress Log
- 2026-03-03 10:33 Created
