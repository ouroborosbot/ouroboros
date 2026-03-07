# Testing Guide

This guide validates the full first-run and runtime loop:
`ouro up` -> `ouro hatch` -> first chat -> coding session spawn -> `ouro msg` round-trip -> heartbeat observation -> `ouro stop`.

## Prerequisites

- Repository builds and tests clean locally.
- `ouro` CLI is available in your shell (or use `node dist/daemon/ouro-entry.js` during development).
- A provider credential is ready:
  - Anthropic: setup token
  - OpenAI Codex: OAuth access token
  - Azure: API key + endpoint + deployment
  - MiniMax: API key

## 1. Start Runtime (`ouro up`)

```bash
ouro up
```

Expected output:
- Daemon starts (or reports it is already running).
- Subagent install notes may appear.
- On first run, startup output includes actionable setup guidance.

Quick sanity checks:

```bash
ouro status
```

Expected output:
- A discovered-agent summary (enabled/disabled + running/stopped).

## 2. Hatch First Agent (`ouro hatch`)

```bash
ouro hatch --agent Hatchling --human Ari --provider anthropic --setup-token <your_setup_token>
```

Expected output:
- Credentials are validated for the selected provider.
- Adoption Specialist interview flow runs.
- A canonical `Hatchling.ouro` bundle is created and path is printed.
- Hatch result includes family imprint + heartbeat habit creation.

Validation checks:
- Bundle exists under `~/AgentBundles/Hatchling.ouro/`.
- `agent.json` includes `enabled: true`.
- `tasks/habits/` contains a heartbeat task file.

## 3. First Chat (`ouro chat <agent>`)

```bash
ouro chat Hatchling
```

In chat, send a simple probe, for example:
- `What are you currently working on?`

Expected output:
- Agent responds in the active chat session.
- Response reflects current runtime context rather than empty cold-start behavior.

## 4. Coding Session Spawn (via chat request)

From the same chat, ask the agent to delegate a coding task, for example:
- `Please spawn a coding session for task heartbeat-smoke and tell me the session id.`

Expected output:
- Agent reports coding session launch/assignment details.
- Session metadata includes a task reference.
- Agent remains responsive while delegated work runs.

## 5. `ouro msg` Round-Trip

From another terminal, send a message into the parent agent inbox:

```bash
ouro msg --to Hatchling --session gate7-smoke --task heartbeat-smoke "status ping from gate7"
```

Expected output:
- CLI prints a queued/sent receipt.
- In chat, asking `did you receive my status ping?` results in acknowledgment.

Optional direct poke trigger:

```bash
ouro poke Hatchling --task heartbeat-smoke
```

Expected output:
- A poke receipt is returned.

## 6. Heartbeat Observation

Open logs:

```bash
ouro logs
```

Expected output:
- Periodic scheduling / inner-dialog activity appears over time.
- Heartbeat-style cycles can be observed as recurring work checks.
- Message/poke events show up when triggered.

Tip: If you need immediate activity, use `ouro poke <agent> --task <heartbeat_task_id>` and watch logs refresh.

## 7. Clean Shutdown (`ouro stop`)

```bash
ouro stop
```

Expected output:
- Deterministic shutdown success output.
- `ouro status` now shows daemon/agent processes stopped.

## Troubleshooting

- `ouro: command not found`
  - Use the dev entrypoint: `node dist/daemon/ouro-entry.js <command>`.
  - Confirm local/global install path is on `PATH`.

- `Unknown provider` or credential validation errors during hatch
  - Re-run with a supported provider (`azure|anthropic|minimax|openai-codex`).
  - Verify required provider fields are set and non-empty.

- `ouro up` reports daemon issues or stale socket behavior
  - Run `ouro stop`, then retry `ouro up`.
  - If status is inconsistent, re-run `ouro status` after restart.

- `ouro msg` cannot reach daemon
  - Ensure daemon is running (`ouro status`).
  - Re-send message after `ouro up`; fallback queue delivery is processed when daemon is healthy.

- No visible heartbeat activity in logs
  - Confirm a heartbeat habit task exists in `tasks/habits/`.
  - Trigger with `ouro poke` and re-check `ouro logs`.

- Final verification mismatch
  - Re-run:
    - `npm run lint`
    - `npm run build`
    - `npm test --silent`
    - `npm run test:coverage -- --runInBand`
