# CLI Hands-On Feedback Log

## Session Info
- Date: 2026-03-06
- Timezone: America/Los_Angeles
- Channel: CLI only
- Goal: Validate shipped capabilities end-to-end and capture actionable feedback for a fix round.

## Test Checklist
- [x] 1. Preflight + runtime sanity (`npm test`, `npx tsc --noEmit`)
- [x] 2. Single-agent CLI boot (`npm run dev`)
- [x] 3. Governance + protocol tools in live chat
- [x] 4. Task operating system flow (create -> board -> transitions -> done)
- [x] 5. Supervisor autonomous loop + restart behavior (`npm run supervisor`)
- [ ] 6. Slugger CLI boot (`npm run dev:slugger`)
- [x] 7. Daemon + `ouro` control plane (`npm run daemon`, `npm run ouro -- ...`)
- [x] 8. Coding tool flow (`coding_spawn/status/send_input/kill`) via agent prompt
- [ ] 9. Wrap-up and fix-round backlog

## Live Feedback Notes

### Format
- Time
- Step
- What you expected
- What happened
- Pain level (1-5)
- Suggested fix (if any)

### Entries
- Time: 2026-03-06 11:43 PST
  Step: 1. Preflight + runtime sanity
  What you expected: Green verification should feel easy to read and confidence-building.
  What happened: Tests were green, but nerves event output felt like noise; also noticed 18 skipped tests.
  Pain level (1-5): 3
  Suggested fix (if any): Add a cleaner human-facing test summary mode and reduce default runtime-log noise in normal CLI feedback loops.
- Time: 2026-03-06 11:45 PST
  Step: 2. Single-agent CLI boot (`npm run dev`) - early feedback
  What you expected: Interactive CLI output should be clear and human-readable.
  What happened: Runtime log output during `npm run dev` is still very noisy and hard to parse quickly.
  Pain level (1-5): 4
  Suggested fix (if any): Add a user-facing CLI display mode that suppresses low-value structured event spam by default and highlights only important state changes.
- Time: 2026-03-06 11:47 PST
  Step: 2. Governance/protocol command check
  What you expected: Command behavior to be understandable and useful in-line.
  What happened: Commands worked, but governance-convention usage semantics were unclear and needed explanation.
  Pain level (1-5): 2
  Suggested fix (if any): Improve tool description/help text so it is obvious that `governance_convention` returns classification rules, and the model applies those rules to the proposal.
- Time: 2026-03-06 11:50 PST
  Step: 2. Architecture understanding
  What you expected: Clear mental model of when governance tools are called and whether they guide vs control behavior.
  What happened: Needed deeper explanation of call timing, tool-selection mechanics, and hard-control boundaries.
  Pain level (1-5): 2
  Suggested fix (if any): Add a short “How tool calls happen” + “guidance vs control” explainer to CLI help/docs.
- Time: 2026-03-06 11:53 PST
  Step: 2. Governance tool clarity
  What you expected: Easy way to find where governance rules are actually defined.
  What happened: Rule location was not obvious from CLI usage alone.
  Pain level (1-5): 2
  Suggested fix (if any): Add `/where-is-governance-defined` style doc/help pointer or expose source path in tool response metadata.
- Time: 2026-03-06 11:55 PST
  Step: 2. Governance vs Constitution relationship
  What you expected: Clear mapping between constitution docs and governance tool behavior.
  What happened: Relationship between `CONSTITUTION.md` and `governance_convention` behavior is unclear in current UX.
  Pain level (1-5): 3
  Suggested fix (if any): Make explicit whether governance decisions are doc-derived vs code-derived, and surface that in tool/help output.
- Time: 2026-03-06 11:58 PST
  Step: 2. Governance model philosophy
  What you expected: Agents should read constitution, make decisions, and rely on PR review as the real safety gate.
  What happened: Existence of `governance_convention` feels potentially unnecessary/redundant and possibly over-constraining.
  Pain level (1-5): 3
  Suggested fix (if any): Consider removing or minimizing the governance classification tool and lean on constitution + PR process as primary control.
- Time: 2026-03-06 12:00 PST
  Step: 2. Tooling principle
  What you expected: Every tool should have a clear, specific, high-value purpose; otherwise it adds cognitive burden.
  What happened: `governance_convention` failed that clarity test and felt like unnecessary cognitive load.
  Pain level (1-5): 4
  Suggested fix (if any): Remove the tool entirely now; keep strict bar for introducing future tools.
- Time: 2026-03-06 12:09 PST
  Step: Session workflow preference
  What you expected: Changes should be planned and shipped as one cohesive pass rather than piecemeal edits during walkthrough.
  What happened: Incremental implementation happened inline while feedback was still being gathered.
  Pain level (1-5): 3
  Suggested fix (if any): Freeze code edits during discovery, capture full feedback first, then execute one integrated fix round with explicit signoff.
- Time: 2026-03-06 12:15 PST
  Step: CLI walkthrough input ergonomics
  What you expected: Multi-line prompts should paste cleanly into CLI during guided scenarios.
  What happened: Multi-line paste did not work well, creating friction for hands-on testing.
  Pain level (1-5): 4
  Suggested fix (if any): Improve CLI multiline input handling and/or add explicit paste-safe mode; docs should provide single-line fallback examples.
- Time: 2026-03-06 12:18 PST
  Step: CLI message framing under paste
  What you expected: A pasted block should be treated as one intent while testing longer guided prompts.
  What happened: Each newline was submitted as a separate message/turn, making walkthrough flow feel chaotic.
  Pain level (1-5): 5
  Suggested fix (if any): Add explicit multiline compose mode (or heredoc-style delimiter) so one pasted block maps to one user turn.
- Time: 2026-03-06 12:23 PST
  Step: Task lifecycle semantics (`validating:<name>`) and requester provenance
  What you expected: Validation status should not be hardcoded to specific names; task metadata should capture who requested the task using friend/user identity, and distinguish human-requested vs agent-initiated tasks.
  What happened: Validation statuses are hardcoded (`validating:slugger`, `validating:ari`), and task frontmatter does not currently track requester/request origin.
  Pain level (1-5): 4
  Suggested fix (if any): Replace hardcoded validation-person statuses with person-aware metadata/state model and add required task provenance fields (requester identity + source kind).
- Time: 2026-03-06 12:28 PST
  Step: CLI ergonomics + operational clarity
  What you expected: `ouro` should be easy to run globally (without typing `npm run ouro -- ...`), and runtime roles should be self-explanatory.
  What happened: `ouro` currently requires repo-local npm script invocation, and “supervisor” purpose was unclear without code-level explanation.
  Pain level (1-5): 3
  Suggested fix (if any): Add first-class global `ouro` installation/registration path plus concise docs/help that explain daemon vs supervisor responsibilities.
- Time: 2026-03-06 12:34 PST
  Step: `ouro` command semantics and UX predictability
  What you expected: `start/status/health/stop` semantics should be obvious and consistent (especially what is local bootstrap vs daemon RPC).
  What happened: `npm run ouro -- start` reports daemon started even when an existing daemon may already be serving status; `stop` flow can fail with `Unexpected end of JSON input` instead of clean success output.
  Pain level (1-5): 5
  Suggested fix (if any): Make command model explicit in help output, add daemon liveness/socket checks for `start`, and harden `stop` client/server handshake so shutdown returns deterministic success text.
- Time: 2026-03-06 12:41 PST
  Step: Runtime model discoverability (single vs multi-agent operation)
  What you expected: Clear “operating modes” explanation for `npm run dev`, `npm run supervisor`, and `npm run ouro -- ...` including when each should be used and how they interact in multi-agent setups.
  What happened: Mental model is ambiguous; command names do not explain process topology or recommended usage order.
  Pain level (1-5): 5
  Suggested fix (if any): Add a first-class runtime map doc + CLI help that defines each mode, startup sequence, and anti-patterns (e.g., running overlapping supervisors/control planes).
- Time: 2026-03-06 12:49 PST
  Step: Daemon fundamentals simplification
  What you expected: A minimal operator UX with only core commands: install/start daemon, view logs, and check high-level status/health.
  What happened: Current control surface feels overgrown and hard to reason about for normal usage.
  Pain level (1-5): 5
  Suggested fix (if any): Define and enforce a minimal daemon command contract first; hide/secondary-surface everything else behind advanced help.
- Time: 2026-03-06 12:53 PST
  Step: Daemon lifecycle ergonomics and agent onboarding
  What you expected: `ouro up` should be idempotent and self-installing on first use; operators should not need recurring manual reinstall/restart workflows. Agent setup/discovery should be straightforward, and new-agent creation should have a guided interview UX.
  What happened: Current model does not clearly define first-run install semantics, agent registration/discovery policy, or a guided `ouro hatch` flow.
  Pain level (1-5): 5
  Suggested fix (if any): Make `ouro up` a one-command bootstrap+ensure-running action, define explicit agent discovery/registration behavior, and add `ouro hatch` interactive setup for new agents.
- Time: 2026-03-06 12:58 PST
  Step: First-run entrypoint + hatch experience + bundle UX
  What you expected: First run should be as simple as `npx ouro` (no confusing multi-command bootstrap), `ouro hatch` should confirm provider readiness and co-create the agent name with the human, and `.ouro` bundles should present as package-like files in the OS (not ordinary folders).
  What happened: These expectations are not yet codified in command contract or implementation plan.
  Pain level (1-5): 5
  Suggested fix (if any): Make bare `ouro` default to `up`, add a creature-intro hatch interview flow with provider prerequisite checks + collaborative naming, and define platform-specific package registration for `.ouro` bundles.
- Time: 2026-03-06 13:03 PST
  Step: Install path choice + registration source of truth
  What you expected: `npx ouro` should support installation path choice (npm install vs clone repo for hacking), and enablement should be a first-class field in each discovered agent's `agent.json` (toggled by CLI).
  What happened: This design direction is now clarified and should be treated as a concrete contract.
  Pain level (1-5): 4
  Suggested fix (if any): Implement first-run installer prompt and use `agent.json.enabled` as canonical enablement state while always listing all discovered agents + enabled/disabled status.
- Time: 2026-03-06 13:08 PST
  Step: Contract lock-in decisions (CLI + daemon + registration)
  What you expected: No backward-compat burden for legacy agents during this pass; `agent.json` schema can be updated directly in both existing bundles and default template. Single-daemon policy should be explicit, including clear provenance and switch instructions.
  What happened: Decisions now clarified and ready to encode in implementation spec.
  Pain level (1-5): 3
  Suggested fix (if any): Update existing bundle `agent.json` files + default template to include `enabled`, enforce single-daemon invariant with explicit “running from” output and “switch daemon source” command guidance.
- Time: 2026-03-06 13:12 PST
  Step: Hatch UX + provider readiness + unified logging policy
  What you expected: One retention/config policy should cover daemon + agent logs; `ouro hatch` should require provider reachability (configured AND live), then use that provider to run a lightweight “adoption specialist” interview that helps the human meet and name a newly hatched agent.
  What happened: This requirement was clarified and should be encoded as first-class product behavior.
  Pain level (1-5): 4
  Suggested fix (if any): Implement unified log config and retention, add provider live-check gate before hatch, and route hatch interview through a lightweight CLI conversation mode backed by the selected provider.
- Time: 2026-03-06 13:14 PST
  Step: Product language/tone for hatch flow
  What you expected: Use “hatchling” terminology in UX copy for new-agent onboarding.
  What happened: Terminology preference was confirmed and should be made explicit in docs/CLI strings.
  Pain level (1-5): 1
  Suggested fix (if any): Standardize on “hatchling” language in `ouro hatch` prompts, status messages, and help text.
- Time: 2026-03-06 13:21 PST
  Step: Daemon/operator functionality smoke test
  What you expected: Core operator commands should function (`status`, `health`, `agent restart`, `cron list`) even if UX copy will be redesigned.
  What happened: All tested commands worked functionally.
  Pain level (1-5): 1
  Suggested fix (if any): No functional blocker from this pass; proceed with planned UX simplification spec and implementation.
- Time: 2026-03-06 13:29 PST
  Step: Coding tools live test (daemon + managed workspace)
  What you expected: `coding_spawn` + `coding_status` + `coding_kill` should execute a codex session in `/Users/arimendelow/AgentWorkspaces/slugger`.
  What happened: Session spawned but immediately failed (exit code 2); `coding_kill` then returned session not found because process had already terminated.
  Pain level (1-5): 4
  Suggested fix (if any): Fix codex spawn arguments (`codex exec` expects `--cd`, not `--cwd`) and add a regression test for real codex argument contract.
- Time: 2026-03-06 13:32 PST
  Step: Coding failure diagnosability
  What you expected: When a coding session fails, status/reporting should include actionable cause so the agent can self-correct.
  What happened: Output only indicated `failed` without exposing clear failure reason/context in user-facing result.
  Pain level (1-5): 5
  Suggested fix (if any): Include failure diagnostics in status/tool output (exit code, signal, invoked command/args, and stderr tail) and have tool summaries surface the cause explicitly.
- Time: 2026-03-06 13:36 PST
  Step: Coding session completion signaling
  What you expected: Agent should be proactively notified when coding session completes/fails, rather than relying on manual polling.
  What happened: Completion/failure discovery is currently poll-based (`coding_status`) and does not auto-ping the agent loop.
  Pain level (1-5): 4
  Suggested fix (if any): Add completion/failure notification pathway (daemon event/inbox or callback) so the parent agent receives terminal session updates automatically.
- Time: 2026-03-06 13:38 PST
  Step: Priority confirmation on coding completion notifications
  What you expected: This should be treated as a must-fix behavior, not optional polish.
  What happened: Requirement confirmed as high priority for the fix round.
  Pain level (1-5): 5
  Suggested fix (if any): Prioritize automatic completion/failure signaling for coding sessions in the next implementation batch.
- Time: 2026-03-06 13:42 PST
  Step: Coding “needs input/question” signaling
  What you expected: Coding agents should proactively notify parent agent when blocked, awaiting input, or asking questions -- not only on completion/failure.
  What happened: Current flow allows stuck states unless parent polls status manually.
  Pain level (1-5): 5
  Suggested fix (if any): Emit proactive notifications for `waiting_input`/question states and enforce no-stuck-agent policy in coding orchestration.
- Time: 2026-03-06 13:46 PST
  Step: Supervisor crash-restart behavior
  What you expected: Killing an inner worker should trigger supervisor auto-restart with a new process.
  What happened: Killed worker came back with a new PID as expected (functional pass).
  Pain level (1-5): 1
  Suggested fix (if any): No functional blocker from restart mechanics; keep behavior while simplifying operator UX.
- Time: 2026-03-06 13:49 PST
  Step: Validation depth before fix round
  What you expected: Continue hands-on testing of advanced capabilities (multi-agent behavior, inner-dialog/autonomy loops, etc.) before starting implementation fixes.
  What happened: Requirement clarified -- do not transition to fix implementation until advanced feature coverage is exercised.
  Pain level (1-5): 2
  Suggested fix (if any): Complete advanced functional walkthrough first, then move to cohesive fix round planning.
- Time: 2026-03-06 13:58 PST
  Step: Slugger CLI failure root cause visibility
  What you expected: If Slugger fails to answer, error output should identify the actual reason so recovery is obvious.
  What happened: CLI showed repeated `network error, retrying...` while runtime log revealed Anthropic `429 rate_limit_error` responses; the user-facing wording masked the actionable cause.
  Pain level (1-5): 4
  Suggested fix (if any): Surface provider HTTP status + concise cause in CLI transient errors (e.g., `429 rate_limit_error`) and reserve `network error` wording for true transport failures.
- Time: 2026-03-06 14:02 PST
  Step: Slugger CLI eventually surfaced provider error
  What you expected: Immediate transparent failure reason.
  What happened: After retries, CLI surfaced raw provider error `429 rate_limit_error` with Anthropic request_id; confirms root cause is provider quota, not local harness connectivity.
  Pain level (1-5): 3
  Suggested fix (if any): Keep the final raw error visibility, but improve first-pass retry messaging so operators see likely rate-limit cause earlier.
- Time: 2026-03-06 14:05 PST
  Step: Slugger provider hot-switch for continued validation
  What you expected: Switch Slugger off Anthropic limits and continue testing now.
  What happened: Updated `/Users/arimendelow/AgentBundles/slugger.ouro/agent.json` provider to `openai-codex`; daemon socket was absent (`/tmp/ouroboros-daemon.sock`), so daemon was restarted and both agents returned to `running` state.
  Pain level (1-5): 2
  Suggested fix (if any): None for unblock; continue advanced validation pass with Slugger on OpenAI Codex until Anthropic limit resets.
- Time: 2026-03-06 14:07 PST
  Step: Runtime mode confusion (supervisor vs daemon)
  What you expected: Running supervisor should not leave daemon control-plane commands in a confusing broken state.
  What happened: Daemon socket disappearance was a side effect of switching runtime mode during testing (`supervisor` flow vs daemon-managed flow), which made `ouro` control commands fail until daemon was restarted.
  Pain level (1-5): 4
  Suggested fix (if any): Make runtime mode explicit and mutually clear in CLI output/help (current mode, what commands are valid now, and one-step command to switch modes safely).

## Fix Round Backlog (to fill during session)
- [ ] Improve CLI/readability of nerves output during local verification (signal > noise).
- [ ] Improve `npm run dev` runtime readability: default to concise user-facing output, with full event stream behind an explicit verbose/debug flag.
- [ ] Audit the 18 skipped tests: confirm intentional skips and document why they are skipped.
- [ ] Clarify governance tool UX: make it explicit in prompts/help that `governance_convention` returns conventions, then classify proposal using those conventions.
- [ ] Add explicit docs/help for “when tools are called” and “guidance vs hard controls” in runtime behavior.
- [ ] Clarify and potentially redesign governance source-of-truth: constitution text vs code heuristics, with explicit linkage.
- [ ] Evaluate removing `governance_convention` (or reducing to doc-discovery helper) in favor of constitution-reading + PR gate as the primary governance mechanism.
- [ ] Establish “tool admission criteria” in docs: new tool must have explicit user value, clear trigger condition, and low cognitive overhead.
- [ ] Adopt cohesive fix-round protocol: collect feedback first, then implement approved changes in a single coordinated batch (not piecemeal).
- [ ] Improve CLI prompt-entry ergonomics: reliable multiline paste support (or explicit toggle), plus copy/paste-safe one-line examples in docs/help.
- [ ] Add CLI multiline compose mode (e.g., `/multiline on` + submit delimiter) so pasted blocks are sent as a single turn.
- [ ] Redesign validation status model: remove hardcoded `validating:slugger`/`validating:ari` and use identity-aware validation attribution.
- [ ] Add task requester provenance fields populated from friend/user context (e.g., requester identity + request source), including autonomous agent-created tasks.
- [ ] Provide an easy global `ouro` command install path (single-step setup) so command works outside repo root.
- [ ] Improve operational docs/help: clearly define `supervisor` vs `daemon`, when to run each, and expected output.
- [ ] Clarify `ouro` command model in CLI help and docs: which commands spawn local process vs send daemon RPC.
- [ ] Fix `ouro stop` shutdown response handling (`Unexpected end of JSON input`) for deterministic UX.
- [ ] Improve `ouro start` behavior: detect already-running daemon and report state instead of always printing fresh PID success.
- [ ] Add a “runtime modes” guide with explicit recommended workflows for single-agent and multi-agent operation.
- [ ] Define v1 daemon operator contract with three primary actions: install+ensure-running, logs, and high-level status/health.
- [ ] Make runtime provenance explicit in status output (where daemon binary/code is running from: repo `dist` vs global install path).
- [ ] Define `ouro up` as idempotent bootstrap: first-run install if missing, then ensure daemon is running (no routine manual reinstall flow).
- [ ] Define agent discovery/registration contract (auto-discover bundle agents vs explicit register/enable model) with clear CLI semantics.
- [ ] Add `ouro hatch` command to interview user and scaffold/register a new agent end-to-end.
- [ ] Set bare command behavior: `ouro` (no args) should execute `up` so first entry can be `npx ouro`.
- [ ] Extend `ouro hatch`: require confirmation that at least one provider is configured before creation; include collaborative name-shaping flow with the human.
- [ ] Specify and implement `.ouro` bundle package appearance behavior (platform-specific package registration where supported).
- [ ] Make `npx ouro` first-run flow offer install mode: managed npm install or full repo clone for local hacking.
- [ ] Use `agent.json.enabled` as canonical registration/enablement state; `ouro` CLI toggles this flag.
- [ ] Ensure status/list views always show all discovered bundles and their enablement states.
- [ ] Apply new `agent.json.enabled` schema to both existing bundle configs and default template generation path (no legacy compatibility requirement for this pass).
- [ ] Enforce and document single-daemon invariant with explicit source/provenance output and switching instructions.
- [ ] Use one log policy/config surface for daemon + agent logs (same retention rules and defaults).
- [ ] Require hatch preflight to verify at least one provider is both configured and reachable.
- [ ] Implement `ouro hatch` lightweight provider-backed interview mode (“adoption specialist”) for collaborative agent naming/persona setup.
- [ ] Standardize hatch UX language around “hatchling” across CLI prompts/help/docs.
- [ ] Draft and lock the v1 CLI + bundle contract spec (commands, outputs, install modes, discovery/enablement, unified log policy, hatch flow) before implementation.
- [ ] Fix coding spawn codex CLI arg contract (`--cd` vs `--cwd`) and add regression coverage.
- [ ] Improve coding failure diagnostics: expose actionable failure reason in `coding_status`/tool output (exit metadata + stderr tail + command context) for self-correction loops.
- [ ] Add coding session completion/failure notifications to parent agent (reduce or eliminate manual polling dependence).
- [ ] Add proactive coding notifications for `waiting_input`/question states (not just terminal completion/failure).
- [ ] Enforce “no stuck agents” policy in coding orchestration and operator UX.
- [ ] Finish advanced functional validation pass (multi-agent/autonomy loop behavior) before implementing fixes.
- [ ] Improve transient retry messaging so provider rate-limit/auth failures are not mislabeled as generic network errors.
