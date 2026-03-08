# Unit 0 Baseline

## Environment
- Worktree: `/Users/arimendelow/Projects/ouroboros-agent-harness-daemon-status`
- Branch: `slugger/daemon-bluebubbles-sense-status-wt`
- Initial worktree setup required `npm ci` before local `npm run build` would work.
- `ouro` is not on PATH in this shell; live smoke in this worktree should use `node dist/heart/daemon/ouro-entry.js ...`.

## Current Daemon / Status Baseline
- `node dist/heart/daemon/ouro-entry.js status` output before any code changes:

```text
ouroboros	cli	crashed	pid=none	restarts=10
slugger	cli	crashed	pid=none	restarts=10
```

- `node dist/heart/daemon/ouro-entry.js up` reported:

```text
daemon already running (/tmp/ouroboros-daemon.sock)
```

- Current status UX is still the old flat process summary. It does not have `Overview`, `Senses`, or `Workers`.
- The daemon already running on the shared socket means live verification later should treat `/tmp/ouroboros-daemon.sock` as an existing shared runtime and capture pre/post behavior carefully.

## Slugger Bundle Relocation
- Standard runtime path `/Users/arimendelow/AgentBundles/slugger.ouro` is currently missing.
- Discovered temporary bundle candidates:
  - `/Users/arimendelow/.Trash/AgentBundles/slugger.ouro`
  - `/Users/arimendelow/AgentBundles--backup/slugger.ouro`
- Both candidates currently contain the same minimal `agent.json`.
- Execution rule for live config update:
  - prefer `/Users/arimendelow/.Trash/AgentBundles/slugger.ouro` as the active moved bundle path
  - fall back to `/Users/arimendelow/AgentBundles--backup/slugger.ouro` only if the `.Trash` copy is unavailable or unsuitable at execution time
  - if live smoke requires the conventional runtime path, use a temporary bridge rather than changing harness runtime design

## BlueBubbles Source Values From `~/.openclaw`
- Source file: `/Users/arimendelow/.openclaw/openclaw.json`
- Relevant current values:
  - `channels.bluebubbles.enabled = true`
  - `channels.bluebubbles.serverUrl = "http://localhost:1234"`
  - `channels.bluebubbles.password = "Clawdbot135!"`
  - `channels.bluebubbles.webhookPath = "/bluebubbles-webhook"`
  - `channels.bluebubbles.dmPolicy = "pairing"`
  - `channels.bluebubbles.groupPolicy = "allowlist"`
  - `channels.bluebubbles.allowFrom = ["ari@mendelow.me"]`
  - `channels.bluebubbles.groupAllowFrom` contains allowlisted phone/email identifiers
  - `channels.bluebubbles.actions` has replies, reactions, edit, unsend, group actions, and attachments enabled

## Immediate Product Takeaway
- The current harness daemon reports only worker/process state, not sense state.
- The current live Slugger config must be updated in the moved bundle location, while secrets remain in `/Users/arimendelow/.agentsecrets/slugger/secrets.json`.
