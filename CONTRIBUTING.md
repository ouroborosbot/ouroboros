# Contributing

This document is for agents. If you are an AI agent working in this repo, read this first, then follow the linked docs.

## Workflow

The gate flow (plan → review → convert → implement → merge) lives in [AGENTS.md](AGENTS.md). That is the authoritative workflow spec. Sub-agent behavior is defined in [subagents/](subagents/README.md).

## Branches

Work on a branch named `<agent>/<slug>`. `main` is the integration branch — never commit directly to main. All changes land on main through PRs created by `work-merger`.

## Commits

Format: `type(scope): description` or `type(scope): feature - description`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

Scope is the area of change: `config`, `teams`, `cli`, `heart`, `mind`, `repertoire`, `senses`, `wardrobe`, `readme`, `planning`, etc. When working on a specific feature or task, include its name after the colon.

Keep the description lowercase, imperative, concise. No "Co-Authored-By" lines.

```
feat(config): load config path from agent.json
fix(senses): oauth - prevent confirmation deadlock
test(mind): context kernel - cover all branches for identity resolution
docs(planning): approved multi-agent harness plan
```

## Testing

100% coverage is mandatory on all code in `src/`. Run `npm test` before every commit.

For the full testing policy (TDD flow, CI gate, mocking conventions, verification checklist), see [cross-agent-docs/testing-conventions.md](cross-agent-docs/testing-conventions.md).

## Sync and merge

For merge strategy, conflict resolution, retry, and escalation policy, see [cross-agent-docs/sync-and-merge-conventions.md](cross-agent-docs/sync-and-merge-conventions.md).

## Code

- `src/` is shared harness infrastructure — test thoroughly, keep 100% coverage, no agent-specific logic
- `{agent}/` is your directory — modify freely (`agent.json`, `psyche/`, `tasks/`, `skills/`, `manifest/`)
- Always use a coding agent (Claude Code or equivalent) for code work
- TypeScript: strict mode, named exports, no unused locals/params, no `any` without justification

## Psyche

Small corrections to psyche files can be made immediately. Significant identity or lore shifts should be deliberated across multiple turns. Psyche files are durable self-knowledge, not scratchpads.

## Config

All configuration comes from files, never environment variables. Your `agent.json` points to your secrets file via `configPath`.

## Documentation

Keep docs up to date. If you find something out of date, inaccurate, or missing — fix it. The code is the source of truth; docs track it.
