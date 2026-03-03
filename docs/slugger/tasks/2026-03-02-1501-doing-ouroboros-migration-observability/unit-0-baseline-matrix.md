# Unit 0 Baseline Matrix: Observability Scope and Contracts

## Purpose
Baseline the current runtime logging behavior and lock implementation targets for the observability migration.

## Locked Contracts

### Required Structured Envelope
All emitted observability events must use:
- `ts`
- `level`
- `event`
- `trace_id`
- `component`
- `message`
- `meta`

### Runtime Sink Contract (Operational)
- Operational sink path: `~/.agentconfigs/<agent>/logs/<channel>/<sanitizeKey(key)>.ndjson`
- Key mapping parity with sessions:
  - CLI: `key=session`
  - Teams: `key=conversationId`
- Persistence mode: append-only NDJSON (one event per line)
- Channel UX stays channel-native (stdout/API), not logger-rendered.

### Test-Run Artifact Contract (Audit)
- Non-agent artifact root: `~/.agentconfigs/test-runs/<repo_slug>/<run_id>/`
- This repo slug: `ouroboros-agent-harness`
- Observability capture artifacts:
  - `vitest-events.ndjson`
  - `vitest-logpoints.json`
- Combined gate summary:
  - `coverage-gate-summary.json`

## Current Runtime Logging Baseline

No shared observability module currently exists at `src/observability/`.

Ad-hoc logging currently present:
- `src/channels/cli.ts`: 4 console output calls
- `src/channels/teams.ts`: 9 console/process error/log calls
- `src/engine/core.ts`: 1 console error call
- `src/identity.ts`: 1 console warn call

All other in-scope runtime files currently have no explicit structured event emission.

## Minimum Event Catalog (Locked)

| Component | Required events | Primary runtime surfaces |
| --- | --- | --- |
| `entrypoints` | `turn.start`, `turn.end`, `turn.error` | `src/channels/cli.ts`, `src/channels/teams.ts` |
| `channels` | `channel.message_sent`, `channel.error` | `src/channels/cli.ts`, `src/channels/teams.ts`, `src/wardrobe/format.ts` |
| `engine` | `engine.turn_start`, `engine.turn_end`, `engine.error` | `src/engine/core.ts`, `src/engine/kicks.ts` |
| `mind` | `mind.step_start`, `mind.step_end`, `mind.error` | `src/mind/context.ts`, `src/mind/prompt.ts` |
| `tools` | `tool.start`, `tool.end`, `tool.error` | `src/engine/tools.ts`, `src/engine/tools-base.ts`, `src/engine/tools-teams.ts` |
| `config/identity` | `config.load`, `identity.resolve`, `config_identity.error` | `src/config.ts`, `src/identity.ts` |
| `clients` | `client.request_start`, `client.request_end`, `client.error` | `src/engine/ado-client.ts`, `src/engine/graph-client.ts` |
| `repertoire` | `repertoire.load_start`, `repertoire.load_end`, `repertoire.error` | `src/repertoire/commands.ts`, `src/repertoire/skills.ts`, `src/wardrobe/phrases.ts` |

## Runtime File Coverage Matrix

| File | Component mapping | Current state | Instrumentation target |
| --- | --- | --- | --- |
| `src/channels/cli.ts` | `entrypoints`, `channels` | ad-hoc console output | Add turn/channel structured events while preserving stdout UX |
| `src/channels/teams.ts` | `entrypoints`, `channels` | ad-hoc console/process logging | Add turn/channel structured events and error paths |
| `src/engine/core.ts` | `engine` | ad-hoc `console.error` fallback | Add engine lifecycle events + trace propagation |
| `src/engine/kicks.ts` | `engine` | no structured events | Add kick/engine error and progression events |
| `src/mind/context.ts` | `mind` | no structured events | Add mind step and context lifecycle events |
| `src/mind/prompt.ts` | `mind` | no structured events | Add prompt-build step and error events |
| `src/engine/tools.ts` | `tools` | no structured events | Add tool dispatch start/end/error events |
| `src/engine/tools-base.ts` | `tools` | no structured events | Add base tool handler event emission hooks |
| `src/engine/tools-teams.ts` | `tools` | no structured events | Add Teams tool start/end/error events |
| `src/config.ts` | `config/identity` | no structured events | Add config load/error events + test-run path helpers |
| `src/identity.ts` | `config/identity` | ad-hoc `console.warn` | Add identity resolve/error events |
| `src/engine/ado-client.ts` | `clients` | no structured events | Add request lifecycle/error events |
| `src/engine/graph-client.ts` | `clients` | no structured events | Add request lifecycle/error events |
| `src/repertoire/commands.ts` | `repertoire` | no structured events | Add load/parse/error events |
| `src/repertoire/skills.ts` | `repertoire` | no structured events | Add skill load lifecycle/error events |
| `src/wardrobe/phrases.ts` | `repertoire` | no structured events | Add phrase pool load/error events |
| `src/wardrobe/format.ts` | `channels` | no structured events | Add formatting/error events in channel component taxonomy |

## Unit 0 Acceptance Check

- Required envelope fields documented: ✅
- Minimum event catalog mapped by component: ✅
- Target runtime files include merged wardrobe surfaces: ✅
- File sink path + key contract captured (`~/.agentconfigs/<agent>/logs/<channel>/<sanitizeKey(key)>.ndjson`, CLI=`session`, Teams=`conversationId`): ✅
