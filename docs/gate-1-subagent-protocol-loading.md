# Gate 1 Subagent Protocol Loading Convention

This convention defines how planner/doer/merger protocols are exposed to model runtime while preserving a single source of truth.

## Canonical Source

- Canonical files live at repo root:
  - `subagents/work-planner.md`
  - `subagents/work-doer.md`
  - `subagents/work-merger.md`

These remain the authoring and review surface.

## Bundle Mirror Path

Each agent bundle mirrors protocol files to:

- `<agent>.ouro/skills/protocols/work-planner.md`
- `<agent>.ouro/skills/protocols/work-doer.md`
- `<agent>.ouro/skills/protocols/work-merger.md`

Gate 1 only defines the convention. Population and synchronization land in later gates.

## Load Order

1. Load bundle-local protocol mirror first (`<agent>.ouro/skills/protocols/*.md`).
2. If a mirror file is missing, fall back to canonical `subagents/*.md`.
3. If neither location exists, fail fast with explicit missing-path guidance.

## Sync Expectations

- Mirror content must be byte-identical to canonical content.
- Any canonical change requires mirror refresh in the same gate where behavior depends on it.
- Protocol hash/checksum verification should be added when loader automation is implemented.

## Failure Behavior

- Missing mirror only: continue via canonical fallback and emit a warning.
- Missing canonical and mirror: stop execution with actionable error.
- Parse/read failure: surface exact file path and error reason; do not silently degrade.
