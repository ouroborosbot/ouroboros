# diagnose-sync-blocked

Sync-blocked fires when the local working tree state prevents the boot sync probe from completing — even though the remote itself is reachable.

## Inputs from the finding inventory

- `bootSyncFindings: BootSyncProbeFinding[]` — emitted by `runBootSyncProbe` (Layer 2).
- Filter to entries where `classification` is one of:
  - `dirty-working-tree` — uncommitted changes in the bundle
  - `non-fast-forward` — local and remote have diverged
  - `merge-conflict` — pull would conflict with local changes

These are typically `advisory: true` — they do not block boot, but they prevent the bundle from staying in sync until resolved.

## Diagnosis

| `classification` | Likely cause | Proposed action |
|---|---|---|
| `dirty-working-tree` | Operator has uncommitted edits in the bundle | None from typed catalog — operator must commit or stash. Surface in `notes`. |
| `non-fast-forward` | Local diverged from remote (operator committed locally and someone pushed remotely) | None from typed catalog — operator must rebase or merge. Surface in `notes`. |
| `merge-conflict` | Active merge state on disk | None from typed catalog — operator must resolve. Surface in `notes`. |

## Notes-only cases (the common case)

All three classifications require human-driven resolution. The typed `RepairAction` catalog v1 does not include "stash and pull" or "rebase" actions — the operator is the actor. Emit `notes` entries like:

```
slugger: dirty working tree (3 modified files) — commit or stash before sync resumes
slugger: non-fast-forward on origin — local commits ahead of remote; rebase or merge to reconcile
slugger: merge conflict in psyche/SOUL.md — resolve and `git merge --continue`
```

## Cross-skill boundary

This skill ONLY handles findings about the local working tree. Findings about the remote (404, auth, network) belong to `diagnose-broken-remote.md`. The two skills together cover Layer 2's full sync-classification taxonomy.

## Why this is a separate skill

Bundling remote and working-tree concerns into one skill conflates two different operator stories: "fix the remote" (configuration / credentials) vs "clean up local edits" (workflow). Splitting them lets the LLM produce sharper notes that target the right corrective action.
