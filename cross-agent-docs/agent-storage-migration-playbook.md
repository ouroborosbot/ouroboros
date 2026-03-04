# Agent Storage Migration Playbook

## Goal
Move local agent data from legacy `~/.agentconfigs` into the split layout:
- secrets only: `~/.agentsecrets/<agent>/secrets.json`
- runtime/session/log/PII data: `~/.agentstate/<agent>/...`
- test-run artifacts: `~/.agentstate/test-runs/<repo_slug>/...`

This migration is manual and one-time per machine.

## Scope
This playbook migrates local files only. Repository code has no runtime fallback to `~/.agentconfigs`.

## Required Inputs
- `<agent>`: agent folder name (for example `ouroboros`, `slugger`)
- `<repo_slug>`: repository slug used by test-run artifacts (for this repo: `ouroboros-agent-harness`)

## 1) Create destination directories
```bash
mkdir -p ~/.agentsecrets/<agent>
mkdir -p ~/.agentstate/<agent>
mkdir -p ~/.agentstate/test-runs/<repo_slug>
```

## 2) Move secrets config
Legacy source:
- `~/.agentconfigs/<agent>/config.json`

Target:
- `~/.agentsecrets/<agent>/secrets.json`

```bash
mv ~/.agentconfigs/<agent>/config.json ~/.agentsecrets/<agent>/secrets.json
```

## 3) Move runtime/state directories
If present, move these directories from legacy root into `~/.agentstate/<agent>/`:
- `sessions`
- `logs`
- `friends`

```bash
mv ~/.agentconfigs/<agent>/sessions ~/.agentstate/<agent>/sessions
mv ~/.agentconfigs/<agent>/logs ~/.agentstate/<agent>/logs
mv ~/.agentconfigs/<agent>/friends ~/.agentstate/<agent>/friends
```

If any source path is absent, skip that move.

## 4) Move test-run artifacts
Legacy source:
- `~/.agentconfigs/test-runs/<repo_slug>/`

Target:
- `~/.agentstate/test-runs/<repo_slug>/`

```bash
mv ~/.agentconfigs/test-runs/<repo_slug> ~/.agentstate/test-runs/<repo_slug>
```

## 5) Update agent manifest contract
In `<repo>/<agent>/agent.json` set:
- `configPath` to `~/.agentsecrets/<agent>/secrets.json`
- `context` block in `agent.json` (not in `secrets.json`)

`secrets.json` keeps provider/team credentials and other secret material.

## 6) Verify
```bash
test -f ~/.agentsecrets/<agent>/secrets.json && echo "secrets: ok"
test -d ~/.agentstate/<agent>/sessions && echo "sessions: ok"
test -d ~/.agentstate/<agent>/logs && echo "logs: ok"
test -d ~/.agentstate/<agent>/friends && echo "friends: ok"
test -d ~/.agentstate/test-runs/<repo_slug> && echo "test-runs: ok"
```

Then run:
```bash
npm run build
npm test
```

## 7) Cleanup
After validation is complete on that machine, remove any empty legacy directories under `~/.agentconfigs/<agent>/` and stale legacy `~/.agentconfigs/test-runs/<repo_slug>/` if it still exists.

Deletion of this playbook file can be decided by the operator after migration is confirmed complete everywhere it is needed.
