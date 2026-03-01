# Sub-agents

These are sub-agent definitions for use with coding agents that support the Claude Code sub-agent format (`.md` files with YAML frontmatter). They define specialised workflows that agents invoke as tools during planning and execution.

Currently supported by: **Claude Code** (`~/.claude/agents/`)

## Installation

Copy or symlink these files into your coding agent's sub-agent directory:

```bash
# Claude Code
cp subagents/*.md ~/.claude/agents/
# or
ln -s "$(pwd)"/subagents/*.md ~/.claude/agents/
```

## Available sub-agents

| File | Purpose |
|------|---------|
| `work-planner.md` | Interactive task planner. Generates planning docs through conversation, then converts to doing docs after human approval. |
| `work-doer.md` | Task executor. Reads a doing doc and works through each unit sequentially with strict TDD. |

## Workflow

1. Human describes a task
2. Agent invokes **work-planner** to create a planning doc → human approves → planner converts to doing doc
3. Agent invokes **work-doer** to execute the doing doc unit by unit
4. Each unit is committed independently with progress tracked in the doing doc
