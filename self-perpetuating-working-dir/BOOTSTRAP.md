# Bootstrap-to-Action Flow (Gate 4)

This walkthrough traces the live execution path from supervisor startup to first self-initiated tool action.

1. `src/supervisor-entry.ts`
- Parses `--agent` with `parseAgentArg()`.
- Emits `supervisor.entry_start`.
- Constructs `new AgentSupervisor({ agent })` and calls `supervisor.start()`.

2. `src/supervisor.ts`
- `start()` calls `spawnWorker()` and `startHeartbeat()`.
- `spawnWorker()` forks `dist/inner-worker-entry.js` and emits `supervisor.worker_started`.
- On worker exit, emits `supervisor.worker_exit`, computes backoff, and restarts.

3. `src/inner-worker-entry.ts`
- Validates `--agent` pre-boot.
- Configures runtime logging with `configureCliRuntimeLogger("self")`.
- Starts autonomous worker loop via `startInnerDialogWorker()`.

4. `src/senses/inner-dialog-worker.ts`
- `startInnerDialogWorker()` registers IPC handlers, then immediately runs `worker.run("boot")`.
- `worker.run()` delegates to `runInnerDialogTurn({ reason: "boot" })`.

5. `src/senses/inner-dialog.ts`
- Resolves session path with `innerDialogSessionPath()` (`sessionPath("self", "inner", "dialog")`).
- On first turn, calls `buildSystem("cli", { toolChoiceRequired: true })` and appends bootstrap user message containing aspirations context.
- Invokes `runAgent(...)` with local tools enabled and no external user prompt.

6. `src/heart/core.ts`
- `runAgent()` begins with `ensureGovernancePreflight()`.
- Governance preflight calls `runGovernancePreflight(getRepoRoot())`, which loads root `ARCHITECTURE.md` and `CONSTITUTION.md`.
- Provider initializes, turn starts, and model executes tools (`tool.start` / `tool.end`) based on autonomous reasoning.

7. `src/mind/context.ts`
- `postTurn()` persists the updated inner-dialog session to disk.
- Resulting path: `~/.agentstate/ouroboros/sessions/self/inner/dialog.json`.

8. Autonomous continuity
- Supervisor heartbeat sends periodic worker messages.
- Worker handles `heartbeat` by running another self-initiated turn.

## Evidence files
- Supervisor lifecycle and restart proof: `self-perpetuating-working-dir/gate-4-observation-run2/supervisor.ndjson`
- Runtime action evidence: `self-perpetuating-working-dir/gate-4-observation-run2/runtime-evidence.ndjson`
- Parsed metrics summary: `self-perpetuating-working-dir/gate-4-observation-run2/parsed-summary.json`
- Code-path audit (no puppet/reflection path): `self-perpetuating-working-dir/gate-4-observation-run2/path-audit.txt`
