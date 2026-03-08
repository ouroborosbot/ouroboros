# Sub-agents

These are source-of-truth workflow definitions (`work-planner`, `work-doer`, `work-merger`) for planning, execution, and merge. They can be consumed either as Claude sub-agents (`.md` files with YAML frontmatter) or as Codex-style skills (`SKILL.md`).

## Installation

### Claude Code (sub-agents)

Copy or symlink these files into Claude's sub-agent directory:

```bash
# Claude Code
cp subagents/*.md ~/.claude/agents/
# or
ln -s "$(pwd)"/subagents/*.md ~/.claude/agents/
```

### Codex / skill-based harnesses

For tools that support skills but not Claude sub-agents, install these as skills:

```bash
mkdir -p ~/.codex/skills/work-planner ~/.codex/skills/work-doer ~/.codex/skills/work-merger

# Hard-link to keep one source of truth
ln -f "$(pwd)/subagents/work-planner.md" ~/.codex/skills/work-planner/SKILL.md
ln -f "$(pwd)/subagents/work-doer.md" ~/.codex/skills/work-doer/SKILL.md
ln -f "$(pwd)/subagents/work-merger.md" ~/.codex/skills/work-merger/SKILL.md
```

**Important:** Hard-links break when editors save by replacing the file (new inode). After editing any `subagents/*.md` file, re-run the `ln -f` command for that file to restore the link. You can verify with `stat -f '%i'` — both files should share the same inode.

Optional UI metadata:

```bash
mkdir -p ~/.codex/skills/work-planner/agents ~/.codex/skills/work-doer/agents ~/.codex/skills/work-merger/agents
cat > ~/.codex/skills/work-planner/agents/openai.yaml << 'EOF'
interface:
  display_name: "Work Planner"
  short_description: "Create and gate planning/doing task docs"
  default_prompt: "Use $work-planner to create or update a planning doc, then stop at NEEDS_REVIEW."
EOF
cat > ~/.codex/skills/work-doer/agents/openai.yaml << 'EOF'
interface:
  display_name: "Work Doer"
  short_description: "Execute approved doing docs with strict TDD"
  default_prompt: "Use $work-doer to execute an approved doing doc unit by unit."
EOF
cat > ~/.codex/skills/work-merger/agents/openai.yaml << 'EOF'
interface:
  display_name: "Work Merger"
  short_description: "Merge feature branch into main via PR after work-doer completes"
  default_prompt: "Use $work-merger to merge the current feature branch into main."
EOF
```

Restart the harness after install so new skills are discovered.

## Available sub-agents

| File | Purpose |
|------|---------|
| `work-planner.md` | Interactive task planner. Generates planning docs through conversation, then converts to doing docs after human approval. |
| `work-doer.md` | Task executor. Reads a doing doc and works through each unit sequentially with strict TDD. |
| `work-merger.md` | Sync-and-merge agent. Merges feature branch into main via PR after work-doer completes. Handles conflicts, CI failures, and race conditions. |

## Workflow

1. Human describes a task
2. Agent invokes **work-planner** to create a planning doc → human approves → planner converts to doing doc
3. Agent invokes **work-doer** to execute the doing doc unit by unit
4. Each unit is committed independently with progress tracked in the doing doc
5. Agent invokes **work-merger** to merge the feature branch into main via PR (fetch, merge, resolve conflicts, CI gate, merge PR, cleanup)
