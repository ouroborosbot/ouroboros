# Gate 1 Prior-Art Review (Archive Branch)

Source branch: `archive/self-perpetuating-run-2026-03-05`
Scope reviewed: `ouroboros/tasks/*.md`

## High-Merit Theme Mapping

| Theme | Archive prior-art files | Gate 1 scaffolding response | Deferred gates |
| --- | --- | --- | --- |
| Security | `2026-03-05-1116-planning-reflection-tool-outputs-logs-are-not-proactively-redacted-for.md`, `2026-03-05-1134-planning-reflection-file-tools-read-file-write-file-lack-path-safety-g.md` | Define governance + tool-surface interfaces so security checks can be modeled as first-class policy hooks instead of ad-hoc code branches. | Gate 2-3 |
| Observability | `2026-03-05-0928-planning-reflection-tool-execution-observability-is-incomplete-no-per-.md`, `2026-03-05-0951-planning-reflection-tool-execution-observability-is-inconsistent-not-e.md`, `2026-03-05-1243-planning-reflection-nerves-events-are-ephemeral-no-durable-sink-making.md` | Scaffold architecture docs and loader conventions so observability policy lives in shared governance and model-readable protocols. | Gate 2-3 |
| Resilience | `2026-03-05-1034-planning-reflection-tool-execution-especially-shell-has-no-built-in-ti.md`, `2026-03-05-1214-planning-reflection-tool-results-can-be-arbitrarily-large-causing-tran.md`, `2026-03-05-1248-planning-reflection-tool-failures-surface-as-inconsistent-untyped-erro.md` | Define typed harness primitive interfaces (tool invocation/result/error shapes) and migration checklist so resilience logic lands in core primitives. | Gate 2-3 |
| Validation | `2026-03-05-1006-planning-reflection-reflection-outputs-aren-t-schema-validated-so-malf.md`, `2026-03-05-1017-planning-reflection-skills-are-loaded-from-markdown-without-structural.md`, `2026-03-05-1133-planning-reflection-no-automated-provider-adapter-conformance-tests-so.md` | Add scaffolding contracts + governance loader stub as canonical validation attachment points. | Gate 2-3 |
| Autonomous loop quality | `2026-03-05-1024-planning-reflection-autonomous-reflection-loop-has-no-persisted-run-st.md`, `2026-03-05-1202-planning-reflection-autonomous-reflection-loop-runs-have-no-concurrenc.md`, `2026-03-05-1240-planning-reflection-reflection-can-repeatedly-propose-essentially-the-.md`, `2026-03-05-1249-planning-reflection-autonomous-reflection-plan-do-merge-loop-has-no-pr.md` | Gate 1 kill-list and migration checklist preserve lessons while shifting from puppet pipeline to model-driven harness architecture. | Gate 3+ |

## Additional Supporting Prior Art

- Context window discipline: `2026-03-05-1121-planning-reflection-context-window-trimming-has-no-contract-tests-to-e.md`, `2026-03-05-1207-planning-reflection-context-trimming-is-not-token-aware-risking-contex.md`
- UX/safety controls: `2026-03-05-1352-planning-reflection-cli-has-no-interactive-confirmation-path-for-confi.md`, `2026-03-05-1356-planning-reflection-teams-input-adapter-has-no-idempotency-duplicate-d.md`
- Runtime configuration hardening: `2026-03-05-1028-planning-reflection-runtime-configuration-e-g-ouroboros-agent-json-is-.md`

## Gate 1 Decision Impact

Gate 1 should not re-implement these proposals directly. Instead, it should codify the structural seams that make them implementable in Gates 2-3:

1. `.ouro` bundle skeleton as the stable operating home.
2. Typed harness primitives for tool, bootstrap, and governance surfaces.
3. Shared governance loader stub.
4. Explicit migration kill-list and protocol-loading conventions.
