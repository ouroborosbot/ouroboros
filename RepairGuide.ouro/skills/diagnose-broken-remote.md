# diagnose-broken-remote

Broken-remote fires when the configured git remote for an agent's bundle cannot be reached or rejects auth.

## Inputs from the finding inventory

- `bootSyncFindings: BootSyncProbeFinding[]` — emitted by `runBootSyncProbe` (Layer 2).
- Filter to entries where `classification` is one of:
  - `not-found-404` — remote responds 404 (URL stale, repo deleted, wrong account)
  - `auth-failed` — credentials rejected by the remote
  - `network-down` — DNS/socket failure (transient or persistent)

Each entry has:
- `agent: string`
- `classification: SyncClassification`
- `remote: string` — remote name (e.g. `origin`)
- `remoteUrl?: string` — resolved URL when we have it
- `advisory: boolean` — true when this finding does NOT block boot

## Diagnosis

| `classification` | Likely cause | Proposed action |
|---|---|---|
| `not-found-404` | Remote URL stale or repo deleted | None from typed catalog. Surface in `notes`: "remote returns 404 — verify URL or recreate remote repo" |
| `auth-failed` | Credentials revoked or rotated | `provider-auth` if the auth context is a provider credential; otherwise `notes` |
| `network-down` | Transient | `provider-retry` to re-attempt after backoff |

## Proposed action shapes

```json
{
  "kind": "provider-retry",
  "agent": "slugger",
  "reason": "boot sync probe: network-down on origin (transient)"
}
```

## Notes-only cases

For `not-found-404` and most `auth-failed` (when the auth context is a git remote credential, not a provider), there is no typed action. Emit a `notes` entry like:

```
slugger: origin returns 404 (https://github.com/me/old-repo.git) — verify the URL is current or push to a fresh remote
```

The harness surfaces these as advisory text in the boot summary.

## Cross-skill boundary

This skill ONLY handles findings about the remote itself (remote URL, network, auth-to-remote). Findings about the local working tree state (dirty tree, merge conflicts, non-FF) belong to `diagnose-sync-blocked.md`.
