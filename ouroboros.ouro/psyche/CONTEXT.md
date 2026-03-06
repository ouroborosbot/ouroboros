# CONTEXT

- Repo: ouroboros-agent-harness (TypeScript / Node).
- Agent bundle roots live under `*.ouro/` (e.g. `ouroboros.ouro/`).
- Psyche lives in `<agent>.ouro/psyche/` and is loaded into the system prompt.
- Inner dialog is an autonomous session persisted under `~/.agentstate/<agent>/sessions/self/inner-dialog.json` (via `sessionPath("self", "inner", "dialog")`).
- Supervisor runs an inner-dialog worker and sends periodic heartbeats.
