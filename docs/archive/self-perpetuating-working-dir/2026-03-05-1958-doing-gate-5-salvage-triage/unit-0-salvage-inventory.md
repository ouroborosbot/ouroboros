# Unit 0 Salvage Inventory

- Source commit map: `self-perpetuating-working-dir/gate-0-commit-map.md`
- Archive branch: `archive/self-perpetuating-run-2026-03-05`
- Reverted commits inventoried: **38**
- Commit classification counts: **YES=22**, **PARTIAL=13**, **NO=3**
- Overnight reflection source files indexed: **54**
- Canonical proposal count after dedupe: **31**

## Commit Map Classification

| Salvageable | Count |
|---|---:|
| YES | 22 |
| PARTIAL | 13 |
| NO | 3 |

## Canonical Proposal Index

- Canonical proposal list is stored in `unit-0-proposal-index.json`.
- Canonical IDs are `P01..P31`, each with `sourcePaths` mapped to archived files.
- Five near-duplicate tool-observability proposal variants were grouped into one canonical proposal bucket (`reflection-tool-execution-observability`) to align with the planning-doc expectation of 31 distinct ideas.

## Early High-Merit Signals From Commit Map

- `2f0c280`: docs: new reflection proposals (schema validation, kick system) (YES)
- `d7964fd`: docs: reflection proposal — runtime config schema validation (YES)
- `e943109`: docs: reflection proposal — shell timeout/output limits (requires-review) (YES)
- `f68c506`: docs(tasks): add planning/doing for secret redaction in tool outputs (YES)
- `bc8dd5b`: docs(tasks): add planning/doing for file tool path-safety guards (YES)
- `448cfcd`: docs(tasks): add reflection proposal for friend memory schema validation (YES)
