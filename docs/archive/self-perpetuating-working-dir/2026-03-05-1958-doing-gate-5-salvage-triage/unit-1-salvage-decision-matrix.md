# Unit 1 Salvage Decision Matrix

Decision categories: `re-land-now`, `re-land-later`, `not-applicable`, `archive-only`.

| Commit | Salvageable | Decision | Rationale |
|---|---|---|---|
| `e3ecc1c` | PARTIAL | re-land-later | Keep ideas via Gate 5 backlog docs; do not replay mixed seed commit. |
| `779dd8e` | YES | re-land-later | Observability proposal remains valid but should be backlog-triaged, not direct cherry-pick. |
| `4ed77be` | NO | archive-only | Timestamp metadata-only planning follow-up; no standalone value. |
| `0656789` | NO | archive-only | Progress-log metadata-only planning follow-up; no standalone value. |
| `005ec3b` | YES | re-land-now | Primary source of overnight proposal content; triage in Unit 4. |
| `7891761` | PARTIAL | re-land-later | Loop-specific implementation is obsolete; keep file-path discipline idea as workflow convention. |
| `92742fc` | PARTIAL | re-land-later | Mixed seed continuation; mine usable ideas through backlog docs only. |
| `3e9761c` | PARTIAL | re-land-later | Feature-branch discipline survives; duplicate-gap loop logic does not. |
| `2f0c280` | YES | re-land-now | Contains additional proposal content to triage into backlog. |
| `4374444` | PARTIAL | not-applicable | Targets removed autonomous loop architecture; no direct re-land path. |
| `d7964fd` | YES | re-land-later | Runtime config schema validation remains high-merit post-inversion hardening. |
| `e943109` | YES | re-land-later | Shell timeout/output limit safety remains high-merit security hardening. |
| `30a1c0c` | YES | not-applicable | Tool registry contract coverage is already present on main post-Gate 3. |
| `fd4466e` | YES | not-applicable | Companion fix to already-present contract tests; no additional delta needed. |
| `d6024d9` | YES | not-applicable | Rule 18 guidance is already present in active work-doer skill. |
| `18c40ed` | YES | re-land-later | Sub-agent handoff artifact contracts remain relevant for daemon-era operations. |
| `6430cbd` | PARTIAL | not-applicable | Old within-bounds prompt guidance replaced by Gate 3a convention query system. |
| `6671cc7` | YES | re-land-later | Retry/backoff standardization remains relevant for merger/daemon reliability. |
| `4b9c25d` | YES | re-land-later | System prompt assembly regressions remain valid test-hardening target. |
| `f68c506` | YES | re-land-later | Secret redaction remains explicit high-priority security backlog item. |
| `e9d00ad` | YES | re-land-later | Context trimming contracts still useful despite recent trim improvements in Gate 4. |
| `765fa33` | PARTIAL | not-applicable | Dry-run mode proposal is tied to removed loop model; reassess later if needed. |
| `9a13060` | PARTIAL | not-applicable | Policy text targeted superseded Gate 3a classification mechanism. |
| `bc8dd5b` | YES | re-land-later | Path safety guards remain explicit high-priority security backlog item. |
| `61fa227` | YES | re-land-later | FriendStore O(N) optimization remains valid but lower-priority hardening. |
| `dede1b4` | YES | re-land-later | Wardrobe output regression tests remain useful and architecture-compatible. |
| `5e771ae` | PARTIAL | archive-only | Generic placeholder without concrete implementation payload. |
| `759027c` | PARTIAL | re-land-later | Concurrency concerns remain relevant when reframed for supervisor/daemon model. |
| `6bfaee9` | YES | not-applicable | Token-aware trimming landed in Gate 4; no missing delta to re-land. |
| `7a10bfb` | YES | re-land-later | Tool result truncation remains useful resilience hardening backlog item. |
| `ecd3cb1` | PARTIAL | not-applicable | Old within-bounds guidance superseded by current governance conventions. |
| `0525d26` | YES | not-applicable | Durable NDJSON sink behavior already exists in current runtime logging flow. |
| `dc566dc` | PARTIAL | not-applicable | Additional within-bounds prompt guidance targets superseded flow. |
| `1a025f6` | YES | re-land-later | CLI confirmation gaps remain valid safety/UX backlog item. |
| `2b1d51f` | YES | re-land-later | Provenance bundle/auditability remains relevant under autonomous operation. |
| `9a88f23` | NO | archive-only | Merge commit only; no independent salvage payload. |
| `dc331fe` | PARTIAL | re-land-later | Scripted runtime harness concept remains potentially useful for regression automation. |
| `448cfcd` | YES | re-land-later | Friend memory schema validation remains relevant for memory hardening. |

## Decision Totals

- re-land-now: 2
- re-land-later: 21
- not-applicable: 11
- archive-only: 4

## Immediate Follow-through

- `re-land-now` entries are executed in Gate 5 Unit 4 triage flow.
- `re-land-later` entries become backlog docs with priority/status tags.
- `not-applicable` and `archive-only` entries are preserved with rationale for auditability.
