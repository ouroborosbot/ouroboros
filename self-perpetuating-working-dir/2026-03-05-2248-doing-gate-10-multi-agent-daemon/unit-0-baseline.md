# Gate 10 Baseline: Daemon Surface Mapping

## Existing Runtime Baseline
- `src/supervisor.ts`: single worker supervisor with crash restart and heartbeat; no daemon command plane.
- `src/supervisor-entry-core.ts`: can create/start/stop multiple supervisors from `--agents` list.
- `src/supervisor-entry.ts`: process entrypoint for supervisor; no socket protocol.
- `src/inner-worker-entry.ts` + `src/senses/inner-dialog-worker.ts`: worker loop currently supervised.

## Existing Command Surfaces
- `package.json` scripts include `supervisor` but no `ouro` management CLI.
- `src/cli-entry.ts` only handles interactive agent session (`--agent`).

## Existing Config / Identity Inputs
- `src/identity.ts` provides `getAgentBundlesRoot()` and `getAgentRoot()` at `~/AgentBundles/<agent>.ouro`.
- No daemon config loader exists today.
- No workspace-clone manager exists today (`~/AgentWorkspaces/<agent>/` missing).

## Gate 10 Target Modules
- `src/daemon/daemon-config.ts`
- `src/daemon/workspaces.ts`
- `src/daemon/process-manager.ts`
- `src/daemon/cron-scheduler.ts`
- `src/daemon/message-router.ts`
- `src/daemon/health-monitor.ts`
- `src/daemon/daemon.ts`
- `src/daemon/daemon-cli.ts`
- `src/daemon/daemon-entry.ts`

## Gate 10 Target Tests
- `src/__tests__/daemon/process-manager.test.ts`
- `src/__tests__/daemon/daemon-cli.test.ts`
- `src/__tests__/daemon/cron-router-health.test.ts`
- `src/__tests__/daemon/daemon-e2e.test.ts`

## Expected Integration Edges
- `package.json`: add `ouro` and `daemon` scripts.
- `src/repertoire/tools-base.ts`: no Gate 10 change required unless daemon-management tools become necessary in Gate 11.
- Logging policy: each new production file must emit `emitNervesEvent` with static string literals.
