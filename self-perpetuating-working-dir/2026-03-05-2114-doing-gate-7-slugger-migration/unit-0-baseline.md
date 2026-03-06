# Unit 0 Baseline: Gate 7 Slugger Migration

## Verified source inputs
- OpenClaw CLI exists at `/Users/arimendelow/Library/pnpm/openclaw` and reports version `2026.2.25`.
- Core identity sources exist:
  - `~/clawd/IDENTITY.md`
  - `~/clawd/MEMORY.md`
  - `~/clawd/life/areas/slugger-identity/behavior-imports.md`
  - `~/clawd/life/areas/slugger-identity/inspiring-figures.md`
- Knowledge graph source directories exist:
  - `~/clawd/life/areas/people/`
  - `~/clawd/life/areas/companies/`
  - `~/clawd/life/areas/projects/`

## Verified migration targets (current state)
- `slugger.ouro/psyche/*.md` files currently contain placeholder headings only.
- `slugger.ouro/psyche/memory/facts.jsonl` is empty.
- `slugger.ouro/psyche/memory/entities.json` is an empty JSON object (`{}`).
- `~/.agentsecrets/slugger/secrets.json` does not exist yet.

## Supervisor/runtime baseline
- `src/supervisor-entry.ts` currently requires a single `--agent` argument and instantiates one `AgentSupervisor`.
- `src/supervisor.ts` supervises one worker process (`child`) per supervisor instance.
- `package.json` currently has `dev:slugger` but the `supervisor` script runs only `--agent ouroboros`.

## Gate 7 implications
1. Consultation with Slugger via OpenClaw can run before migration.
2. Core identity migration is a real content port (not overwrite of existing rich files).
3. Knowledge graph conversion must populate an empty fact store baseline.
4. Slugger secrets file must be created from Ouroboros secrets.
5. Supervisor entrypoint needs multi-agent support to satisfy the "second supervised process" criterion in one runtime command.
