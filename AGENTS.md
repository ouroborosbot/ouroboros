## Planning/Doing Workflow (STRICT)

### Agent Context (Required)

Task docs go in `<agent>/tasks/` with naming scheme `YYYY-MM-DD-HHMM-{planning|doing}-<slug>.md`.

- Default `<agent>` from the current git branch using this shape: `<agent>[/<slug>]`.
  - The first path segment is always the agent name (e.g., `ouroboros`, `slugger`).
  - If the branch has no `/`, the entire branch name is the agent.
  - Any segments after the first `/` are the feature slug and are not part of `<agent>`.
  - The old `codex/<agent>` prefix convention is deprecated. All agents use `<agent>/<slug>` directly.
- Branches must be agent-specific. If the branch does not clearly encode a single agent, STOP and remind the user to switch to an agent-specific branch before continuing.
- Do not hardcode agent names in instructions. This workflow must support arbitrary agents.

### Runtime-Specific Invocation

- **Codex app**: Use skills by name: `$work-planner`, `$work-doer`, and `$work-merger`.
  - Skills are turn-scoped in practice, so re-invoke `$work-planner` on each planning/conversion turn.
  - `work-planner` already enforces `NEEDS_REVIEW` and hard-stop behavior; do not bypass it.
- **Claude Code**: Use sub-agents from `~/.claude/agents/` (`work-planner`, `work-doer`, `work-merger`).

### Gate Flow

1. **Plan**: Launch `work-planner`. It produces/updates a planning doc under `<agent>/tasks/`.
2. **Review**: Show the user the planning doc path and STOP. Wait for explicit user approval.
3. **Convert**: Only after user approves the planning doc, re-run `work-planner` to convert to a doing doc in the same `<agent>/tasks/` directory. User must also review and sign off on the doing doc before implementation.
4. **Implement**: Only after user explicitly asks, launch `work-doer` to execute the doing doc. Never implement inside `work-planner`.
5. **Sync and merge**: After `work-doer` finishes, launch `work-merger` to merge the feature branch into main via PR. It handles conflicts, CI, and race conditions autonomously.
6. **Never self-approve**: Do not say "looks good" and proceed. The user reviews every planning and doing doc.

### Decision Collaboration (Required)

- Decisions that affect scope, structure, naming, ownership, or workflow must be discussed with the user before being finalized.
- Do not make unilateral choices for unresolved planning decisions; present options and capture explicit user direction.
- If a decision remains unresolved, keep it in `Open Questions`, set status to `NEEDS_REVIEW`, and stop at the gate.

### Configuration Policy (Required)

- Do not introduce or require environment variables for this project.
- If configuration is needed, prefer explicit CLI arguments, committed config files, or in-repo defaults.
- If a proposal would normally use env vars, stop and present a non-env-var alternative instead.

### Git Discipline

- When a logical unit of work is complete and committable, commit immediately.
- Keep commits atomic (one logical change per commit).
- If a git remote is configured, push after each atomic commit.
