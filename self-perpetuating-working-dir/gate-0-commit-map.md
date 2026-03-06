# Gate 0 Commit Map (`e3ecc1c..448cfcd`)

This map classifies each reverted commit for Gate 5 salvage triage.

Legend:
- `YES` = should be re-landed or triaged into backlog explicitly
- `PARTIAL` = keep selected ideas, not the original implementation wholesale
- `NO` = obsolete after inversion or duplicate/noise

| Commit | Summary | Salvageable | Rationale / Gate 5 Action |
|---|---|---|---|
| `e3ecc1c` | feat: ouroboros self-perpetuating seed (units 1-6) (#14) | PARTIAL | Large mixed seed commit. Mine for useful docs/ideas only; do not re-land as-is. |
| `779dd8e` | docs(planning): create planning-tool-observability.md | YES | Observability planning remains relevant post-inversion. Backlog as hardening task. |
| `4ed77be` | docs(planning): set created timestamp | NO | Metadata-only follow-up to prior planning doc. |
| `0656789` | docs(planning): update progress log | NO | Metadata-only follow-up to prior planning doc. |
| `005ec3b` | docs: reflection-generated task proposals | YES | Proposal content is triage input for Gate 5 backlog. |
| `7891761` | fix(loop): write doing doc to disk and give doer/merger explicit file paths | PARTIAL | Loop-specific wiring is obsolete; explicit file-path discipline still useful. |
| `92742fc` | feat: ouroboros self-perpetuating seed (units 1-6) (#15) | PARTIAL | Mixed seed continuation; extract reusable proposals only. |
| `3e9761c` | fix: prevent duplicate reflection gaps + use feature branches in autonomous loop | PARTIAL | Duplicate-gap logic is loop-specific; feature-branch requirement is still valid. |
| `2f0c280` | docs: new reflection proposals (schema validation, kick system) | YES | Schema validation remains high-value; kick-system relevance to be reassessed post-inversion. |
| `4374444` | fix: use autonomous planner in loop, fix branch creation | PARTIAL | Autonomous loop integration is obsolete; branch-creation robustness still relevant. |
| `d7964fd` | docs: reflection proposal — runtime config schema validation | YES | Runtime config schema validation remains high merit. |
| `e943109` | docs: reflection proposal — shell timeout/output limits (requires-review) | YES | Safety/resilience item remains high priority. |
| `30a1c0c` | test(repertoire): Unit 1a - tool registry contract tests | YES | Real test coverage improvement; candidate for selective re-land if missing after revert. |
| `fd4466e` | fix(tests): fix tool registry contract tests to use actual exports | YES | Companion fix for useful contract tests. |
| `d6024d9` | docs(doer): add rule 18 — verify exports before importing | YES | Still useful workflow guardrail for coding sessions. |
| `18c40ed` | docs: reflection proposal — sub-agent handoff artifact contracts (requires-review) | YES | Contract clarity for sub-agent handoffs remains relevant. |
| `6430cbd` | fix(reflection): add within-bounds guidance to reduce false requires-review gating | PARTIAL | Current constitution flow changes in Gate 3a; guidance ideas may transfer. |
| `6671cc7` | docs(tasks): add doing/planning for standardized retry/backoff | YES | Retry/backoff remains relevant for merger/daemon robustness. |
| `4b9c25d` | docs(tasks): add planning/doing for system prompt assembly regression tests | YES | Regression tests remain relevant with new bootstrap/prompt assembly work. |
| `f68c506` | docs(tasks): add planning/doing for secret redaction in tool outputs | YES | Security high-priority item explicitly called out in planning inventory. |
| `e9d00ad` | docs(tasks): add planning for context-window trimming contract tests | YES | Context trimming contracts remain relevant. |
| `765fa33` | docs(tasks): add planning for dry-run/preview mode gap | PARTIAL | Dry-run mode may still matter, but tied to removed loop workflow. |
| `9a13060` | fix(reflection): clarify that adding tests for providers is within-bounds | PARTIAL | Policy guidance may still help, but old reflection gate semantics will change. |
| `bc8dd5b` | docs(tasks): add planning/doing for file tool path-safety guards | YES | Security high-priority item explicitly called out in planning inventory. |
| `61fa227` | docs(tasks): add planning for FriendStore O(N) lookup optimization | YES | Low-priority but valid optimization candidate. |
| `dede1b4` | docs(tasks): add planning for wardrobe output-formatting regression tests | YES | Regression safety remains useful. |
| `5e771ae` | docs(tasks): add pending reflection proposal | PARTIAL | Generic placeholder; inspect content during Gate 5 triage. |
| `759027c` | docs(tasks): add planning/doing for reflection concurrency control | PARTIAL | Loop-specific framing obsolete; concurrency concerns still relevant for supervisor/daemon. |
| `6bfaee9` | docs(tasks): add planning/doing for token-aware context trimming | YES | Strongly relevant to session/context management. |
| `7a10bfb` | docs(tasks): add reflection proposal for tool result truncation | YES | Tool result size limits remain high-value resilience work. |
| `ecd3cb1` | fix(reflection): strengthen within-bounds guidance to reduce false requires-review gating | PARTIAL | May inform new convention-based governance checks, but old mechanism is being removed. |
| `0525d26` | docs(tasks): add planning/doing for nerves durable JSONL sink | YES | Observability durability is explicitly high-merit. |
| `dc566dc` | fix(reflection): further strengthen within-bounds guidance — error types, new modules all within-bounds | PARTIAL | Same as above: policy ideas useful, implementation path changing. |
| `1a025f6` | docs(tasks): add planning/doing for CLI confirmation path gap | YES | UX/safety confirmations remain relevant. |
| `2b1d51f` | docs(tasks): add planning/doing for reflection provenance bundle gap | YES | Provenance tracking remains useful for autonomous auditing. |
| `9a88f23` | merge: reflection provenance bundle docs | NO | Merge commit for docs already represented by parent commits. |
| `dc331fe` | docs(tasks): add reflection proposal for scripted runtime harness | PARTIAL | Scripted runtime harness concept may be superseded by inversion; evaluate selectively. |
| `448cfcd` | docs(tasks): add reflection proposal for friend memory schema validation | YES | Memory schema validation remains relevant (Gate 3b and beyond). |
