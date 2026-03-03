# Doing: Sync-and-Merge System for Multi-Agent Collaboration

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-03 11:09
**Planning**: ./2026-03-03-1032-planning-sync-and-merge.md
**Artifacts**: ./2026-03-03-1032-doing-sync-and-merge/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Build a new `work-merger` subagent that runs after work-doer completes, fetching origin/main, merging, resolving conflicts using task docs for context, running tests, and pushing to main -- enabling two agents (ouroboros on Claude Code, slugger on Codex) to work simultaneously on the same repo without manual merge coordination.

## Completion Criteria
- [ ] `subagents/work-merger.md` exists with YAML frontmatter and complete workflow instructions
- [ ] work-merger is installable as a Claude Code sub-agent (symlink into `~/.claude/agents/`) AND as a Codex skill (hard-link as `~/.codex/skills/work-merger/SKILL.md`)
- [ ] `subagents/README.md` updated: work-merger in table, workflow description extended, install commands for both Claude Code and Codex (including optional `openai.yaml` UI metadata)
- [ ] `AGENTS.md` updated: extended workflow (work-planner -> work-doer -> work-merger), Runtime-Specific Invocation includes `$work-merger` for Codex and sub-agent for Claude Code
- [ ] The work-merger doc covers: fetch, merge, conflict resolution with task doc context, test, PR creation via `gh`, merge PR to main
- [ ] The work-merger doc covers the fast-path: branch already up-to-date with main (still creates PR, CI must pass)
- [ ] The work-merger doc covers git-informed task doc discovery: use `git log origin/main --not HEAD` to find doing docs that landed on main since the branch point (not just timestamp-sorted scanning)
- [ ] The work-merger doc covers race condition retry: exponential backoff (30s, 1m, 2m, 4m...), no retry limit, clear user-facing communication on each retry (retry number, wait duration, reason)
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

## TDD Requirements
**Strict TDD -- no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation
2. **Verify failure**: Run tests, confirm they FAIL (red)
3. **Minimal implementation**: Write just enough code to pass
4. **Verify pass**: Run tests, confirm they PASS (green)
5. **Refactor**: Clean up, keep tests green
6. **No skipping**: Never write implementation without failing test first

Note: This task is documentation-only. TDD applies if any runtime code is introduced, but the expected deliverables are all markdown files. TDD is not applicable to documentation units.

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

**CRITICAL: Every unit header MUST start with status emoji (⬜ for new units).**

### ✅ Unit 0: Research and outline
**What**: Read existing subagent definitions (`subagents/work-planner.md`, `subagents/work-doer.md`), `AGENTS.md`, `CONTRIBUTING.md`, `subagents/README.md`, and `cross-agent-docs/testing-conventions.md`. Produce an outline of all sections needed in `work-merger.md`, mapping each planning decision to a specific section.
**Output**: `./2026-03-03-1032-doing-sync-and-merge/outline.md` with section-by-section outline.
**Acceptance**: Outline exists, covers every completion criterion, and maps each planning decision to a concrete section in the work-merger doc.

### ✅ Unit 1: Create `subagents/work-merger.md` -- core workflow and preflight checks
**What**: Author the work-merger subagent definition with YAML frontmatter and the core merge workflow: On Startup (detect agent from branch, find own doing doc, run `gh` preflight checks), Timestamp & Commit Pattern, and the main Merge Loop (fetch origin/main, merge, handle clean merge vs conflicts). The `gh` preflight checks verify: `gh` is installed, `gh auth status` passes, repo has a GitHub remote, `gh repo set-default` is configured. Agent fixes what it can autonomously (e.g., set repo default, diagnose auth issues) and only escalates to user when human input is truly required (e.g., user must provide credentials or approve an OAuth flow).
**Output**: `subagents/work-merger.md` with frontmatter + On Startup (including `gh` preflight) + core merge workflow sections.
**Acceptance**: File exists with valid YAML frontmatter (`name`, `description`, `model`). On Startup section derives agent name from branch using `<agent>/<slug>` convention. On Startup includes `gh` preflight checks covering: (1) `gh` installed, (2) `gh auth status` passes, (3) GitHub remote exists, (4) `gh repo set-default` configured. Preflight distinguishes between self-fixable issues and issues requiring user input. Merge Loop section covers `git fetch origin main`, `git merge origin/main`, and branches for clean merge vs conflict.

### ✅ Unit 2: `work-merger.md` -- conflict resolution with git-informed task doc discovery
**What**: Add the conflict resolution section: how to read own doing doc, use git history to find exactly which doing docs landed on main since the branch point, understand both intents, and resolve conflicts preserving both. Discovery uses `git log origin/main --not HEAD -- '*/tasks/*-doing-*.md'` (or equivalent) to identify precisely the relevant doing docs -- no timestamp heuristic, no irrelevant old docs, no missed relevant ones.
**Output**: Conflict Resolution and Task Doc Discovery sections added to `subagents/work-merger.md`.
**Acceptance**: Section instructs agent to: (1) read own doing doc path from the task that just completed, (2) use git log to find doing docs that landed on main since the branch point (e.g., `git log origin/main --not HEAD -- '*/tasks/*-doing-*.md'`), (3) read those doing docs to understand what the other agent changed and why, (4) resolve conflicts preserving both intents. Discovery is git-informed (based on actual commits to main), not a pure filename timestamp scan.

### ✅ Unit 3: `work-merger.md` -- PR workflow, CI, and fast-path
**What**: Add sections for: PR creation via `gh pr create`, waiting for CI, merging via `gh pr merge`, the fast-path (branch already up-to-date with main -- skip conflict resolution, still create PR for CI gate), and CI failure self-repair (agent fixes failures itself, only escalates when genuinely stuck).
**Output**: PR Workflow, Fast Path, and CI Failure Handling sections added to `subagents/work-merger.md`.
**Acceptance**: PR workflow uses `gh pr create` and `gh pr merge`. Fast-path explicitly handles the no-conflict case but still requires PR + CI. CI failure section instructs agent to attempt self-repair first (it wrote the code), with clear boundary for when to escalate.

### ✅ Unit 4: `work-merger.md` -- race condition retry, cleanup, escalation, and rules
**What**: Add sections for: race condition retry flow with exponential backoff and user communication, post-merge cleanup (delete local + remote branch), escalation policy (when to stop and ask user), and a Rules section summarizing all invariants. The retry flow uses exponential backoff (30s, 1m, 2m, 4m...) with no retry limit -- keep trying indefinitely. On each retry, the agent MUST clearly communicate to the user what is happening: retry number, wait duration, and reason (e.g., "Main moved again. Retry #3, waiting 2 minutes before re-fetching. Other agent is active."). The user wants visibility even when no intervention is needed.
**Output**: Race Condition Retry, Post-Merge Cleanup, Escalation, and Rules sections added to `subagents/work-merger.md`.
**Acceptance**: Retry flow uses exponential backoff starting at 30s, doubling each time, with no cap on retries. Each retry outputs a clear message to the user (retry number, wait time, reason). On each retry: re-fetch origin/main, re-merge, re-resolve conflicts using task docs, run tests, `git push --force-with-lease`. Cleanup deletes branch locally and remotely. Escalation section draws clear line between "fixable by agent" and "needs human." Rules section is a numbered list of all invariants (similar to work-planner/work-doer Rules sections).

### ✅ Unit 5: Update `AGENTS.md` -- extended workflow and branch convention
**What**: Update `AGENTS.md` to: (1) simplify branch parsing from `[prefix/]<agent>[/feature...]` with `codex/` special-casing to just `<agent>[/<slug>]`, deprecating the old `codex/` prefix, (2) add work-merger to Runtime-Specific Invocation (`$work-merger` for Codex, sub-agent for Claude Code), (3) extend Gate Flow to include sync-and-merge step after work-doer.
**Output**: Updated `AGENTS.md`.
**Acceptance**: Branch parsing rule simplified (no `codex/` special-case). Runtime-Specific Invocation lists work-merger for both Codex and Claude Code. Gate Flow includes step 5 (or equivalent) for work-merger after implementation.

### ✅ Unit 6: Update `subagents/README.md` -- work-merger install and docs
**What**: Update `subagents/README.md` to: (1) add work-merger to the Available sub-agents table, (2) add install commands for both Claude Code (symlink) and Codex skill (hard-link + optional `openai.yaml`), (3) extend the Workflow section to include the sync-and-merge step.
**Output**: Updated `subagents/README.md`.
**Acceptance**: Table has work-merger row. Claude Code install section includes work-merger symlink. Codex install section includes `mkdir`, hard-link, and optional `openai.yaml` for work-merger. Workflow section has step 4 (or equivalent) for sync-and-merge.

### ⬜ Unit 7: Update `CONTRIBUTING.md` -- sync-and-merge and branch convention
**What**: Update `CONTRIBUTING.md` to: (1) update the Branches section to reflect the unified `<agent>/<slug>` convention for all agents (remove any `codex/` references if present), (2) add a new "Sync and merge" section documenting the PR-based merge workflow, race condition handling, and that work-merger handles this step.
**Output**: Updated `CONTRIBUTING.md`.
**Acceptance**: Branches section shows unified `<agent>/<slug>` for both agents (including `slugger` examples alongside `ouroboros`). Existing "do not commit directly to main" guidance strengthened to reference PR-based merge flow. New Sync and merge section explains the workflow (work-doer finishes -> work-merger runs -> PR -> CI -> merge -> cleanup). Task docs section references work-merger alongside work-planner and work-doer.

### ⬜ Unit 8: Create `cross-agent-docs/sync-and-merge-conventions.md`
**What**: Create the shared conventions doc covering: branch naming, merge strategy (merge commits), PR-based merge flow, conflict resolution using task docs, race condition retry, CI self-repair policy, post-merge cleanup, and escalation rules. Similar in structure to `cross-agent-docs/testing-conventions.md`.
**Output**: New file `cross-agent-docs/sync-and-merge-conventions.md`.
**Acceptance**: File exists, covers all shared conventions from planning decisions. Structured with numbered sections similar to testing-conventions.md. Both agents can reference this as the authoritative sync-and-merge policy.

### ⬜ Unit 9: Final review and verification
**What**: Re-read all modified/created files end-to-end. Verify every completion criterion is satisfied. Run `npm test` and `npm run build` to confirm no regressions. Check cross-references between docs are consistent (e.g., CONTRIBUTING.md links to cross-agent-docs, AGENTS.md references work-merger correctly, README install commands are accurate).
**Output**: All completion criteria checked off. Build and tests pass.
**Acceptance**: Every completion criterion checkbox can be marked `[x]`. `npm test` passes. `npm run build` passes. No warnings. All cross-references between docs are accurate.

## Execution
- Commit after each unit completes
- Push after each unit complete
- Run full test suite before marking final unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-03-1032-doing-sync-and-merge/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-03 11:09 Created from planning doc
- 2026-03-03 11:15 Added gh CLI preflight checks to Unit 1 and completion criteria (user feedback)
- 2026-03-03 11:25 Updated Unit 2: git-informed task doc discovery replaces timestamp heuristic. Updated Unit 4: exponential backoff (no retry limit) with mandatory user communication on each retry. (user feedback)
- 2026-03-03 11:28 Unit 0 complete: outline.md created mapping all completion criteria to work-merger sections
- 2026-03-03 11:29 Unit 1 complete: work-merger.md created with frontmatter, On Startup (agent detection, gh preflight), Timestamp pattern, Merge Loop
- 2026-03-03 11:30 Unit 2 complete: conflict resolution and git-informed task doc discovery sections added
- 2026-03-03 11:31 Unit 3 complete: PR workflow, fast-path, and CI failure self-repair sections added
- 2026-03-03 11:32 Unit 4 complete: race condition retry (exponential backoff), post-merge cleanup, escalation, and rules sections added
- 2026-03-03 11:33 Unit 5 complete: AGENTS.md updated -- simplified branch parsing, work-merger in runtime invocation, Gate Flow step 5
