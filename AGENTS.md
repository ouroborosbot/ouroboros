## Planning/Doing Workflow (STRICT)

### Agent Context (Required)

Task docs go in `docs/<agent>/tasks/` with naming scheme `YYYY-MM-DD-HHMM-{planning|doing}-<slug>.md`.

- Default `<agent>` from the current git branch using this shape: `[prefix/]<agent>[/feature...]`.
  - If branch is `<agent>`, use that token.
  - If branch starts with `codex/`, treat `codex` as prefix and use the next token as `<agent>`.
  - Any remaining path segments are feature/detail and are not part of `<agent>`.
- Branches must be agent-specific. If the branch does not clearly encode a single agent, STOP and remind the user to switch to an agent-specific branch before continuing.
- Do not hardcode agent names in instructions. This workflow must support arbitrary agents.

### Runtime-Specific Invocation

- **Codex app**: Use skills by name: `$work-planner` and `$work-doer`.
  - Skills are turn-scoped in practice, so re-invoke `$work-planner` on each planning/conversion turn.
  - `work-planner` already enforces `NEEDS_REVIEW` and hard-stop behavior; do not bypass it.
- **Claude Code**: Use sub-agents from `~/.claude/agents/` (`work-planner`, `work-doer`).

### Gate Flow

1. **Plan**: Launch `work-planner`. It produces/updates a planning doc under `docs/<agent>/tasks/`.
2. **Review**: Show the user the planning doc path and STOP. Wait for explicit user approval.
3. **Convert**: Only after user approves the planning doc, re-run `work-planner` to convert to a doing doc in the same `docs/<agent>/tasks/` directory. User must also review and sign off on the doing doc before implementation.
4. **Implement**: Only after user explicitly asks, launch `work-doer` to execute the doing doc. Never implement inside `work-planner`.
5. **Never self-approve**: Do not say "looks good" and proceed. The user reviews every planning and doing doc.

### Decision Collaboration (Required)

- Decisions that affect scope, structure, naming, ownership, or workflow must be discussed with the user before being finalized.
- Do not make unilateral choices for unresolved planning decisions; present options and capture explicit user direction.
- If a decision remains unresolved, keep it in `Open Questions`, set status to `NEEDS_REVIEW`, and stop at the gate.

### Git Discipline

- When a logical unit of work is complete and committable, commit immediately.
- Keep commits atomic (one logical change per commit).
- If a git remote is configured, push after each atomic commit.
