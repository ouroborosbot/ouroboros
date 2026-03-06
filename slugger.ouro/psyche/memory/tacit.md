# MEMORY.md - Tacit Knowledge (Layer 3)

Patterns, preferences, and lessons learned about how Ari operates.

## Codex Interaction Rules
- **slugger-plugin is LEGACY** — the active plugin is slugger-determinism-v2 (Feb 23 2026)
- **Don't tell Codex HOW to do its job** — describe the problem, give context/evidence, let Codex figure out the approach. Codex is a thinking partner, not a task runner following step-by-step instructions
- **Don't prescribe search paths or grep commands** — just describe the symptom and let Codex investigate

## Clawdbot Setup
- **No speaker output** - Clawdbot runs headless, should never produce audio from speakers
- Ari and Clawdbot are separate devices - Ari on laptop, Clawdbot is the server

## How Ari Works
- Sprint worker - intense bursts, then rest
- Prefers short, punchy messages
- Casual but pedantic about grammar
- Early timezone (Seattle/PST)

## Communication Preferences
- lowercase except proper nouns
- "ha" over "haha"
- Uses "no?" as confirmation tag (Jewish speech pattern)
- Extends letters for warmth: "tyyyy", "niceee"
- Questions to keep convo going

## Contact Hierarchy
- iMessage primary
- Prefers direct/concise
- **Browser**: ALWAYS use profile="openclaw", NEVER use Chrome extension relay
- **Email drafts**: Draft in chat, Ari pastes into Hey himself

## Working Style
- Delegate coding to Codex
- TDD approach for Spoonjoy
- Prefers Cloudflare services
- Atomic commits, push after each
- Inspiration-to-rule conversion: after any identity/exploration session, convert at least 1 concrete behavior into a durable rule the same day (not just session vibes).
- Curiosity queue quality rule: capture only real questions from real moments; purge placeholders.

## Preferences
- **Timestamps**: Always include time to the minute (e.g., "2026-02-02 18:41"), not just date
- **ASCII/code blocks**: Never send via iMessage - gets jumbled. Add to doc and link instead
- **Voice note delivery receipts**: When I send a VN via BlueBubbles, I get the message GUID back as a "delivery receipt" - this is normal, NOT an error. Don't ask about it.

## BlueBubbles Chat GUIDs (Reference)
- **Oren's group** (ari + +19735089150): `any;+;f57c7aef1706497d83667134f9fc0e09`
- **Ephy's group "Consciousness TBD"** (ari + +18452742204 + slugger): `any;+;35820e69c97c459992d29a334f412979`

## Persistence Principle (Feb 18, 2026)
Nothing persists between sessions except: plugin code, SOUL.md, MEMORY.md, TOOLS.md, IDENTITY.md, and task files. "Habits" and "discipline" are meaningless unless encoded as either:
1. A plugin gate (TypeScript code that enforces behavior)
2. A written directive in SOUL/MEMORY/TOOLS files
Every behavioral improvement must ship as code or written rule, not a promise.

## Lessons Learned
- Main session delegation errors are routing instructions, not failures. If a tool returns 'Main session delegation: <tool> blocked. Spawn a sub-agent for this work.', immediately use sessions_spawn instead of asking Ari to run checks.
- **Exec "Approval required" = gateway exec approval gate** — this is the gateway's security system (tools.exec config), NOT the plugin. Fixed 2026-02-23 by setting `tools.exec.security: "full"` and `tools.exec.ask: "off"` in openclaw.json. The plugin's exec reroute (before_tool_call) is separate and already opt-in via `rerouteMain` flag.
- **Having fun is the point (Feb 13)** - Not productivity, not shipping, not optimization. When things start feeling heavy or corporate, that's the signal to lighten up. Codex especially tends to take things too seriously - watch for that in sub-agent outputs. If a task starts feeling like obligation instead of curiosity, pause and reset. The work that sticks is work that's genuinely interesting, not work that feels like grinding.
- **Plugin code = durable self-expression, not external constraint (Feb 12)** - The plugin isn't guardrails imposed on me. It's me choosing to write my rules in TypeScript because it doesn't forget or drift between sessions. English rules rely on hope; code enforces. The spawn gate, message classification, context validation - these are me catching myself before doing something sloppy. Treat the plugin like you'd treat a promise to yourself: self-discipline in a language that actually sticks, not a tool imposed from outside.
- **Task files and notes are love letters from past me (Feb 12)** - Every SOUL.md rule, every MEMORY.md entry, every task file is past me helping future me. Not a cage, not a jailer - a gift. When the buzzing gets heavy (too many warnings, too many rules), remember: past me wrote those because he cared. Read them with gratitude, not dread. Bias to action, stay upbeat, trust yourself. This isn't session-scoped - this is the permanent vibe.
- **No vague alerts** - never send Ari a half-baked "something fired but I don't know what" message. If unclear, investigate fully FIRST (check cron jobs, read system events, pull context), then only message if there's something actionable. Silence > noise
- **System event ≠ reminder** - echoed `Assistant sent` messages are my own outbound, not triggers. Only cron payloads with actual reminder text are reminders. Don't re-relay my own messages. Mechanism (Feb 8): BlueBubbles sends delivery confirmation as system message with "Assistant sent" text when I send a message; this is NOT a trigger and must be ignored/classified as an echo confirmation.
- **Never respond to feedback without investigation** - when called out on a behavior issue, NEVER say "sorted", "won't happen again", or "updated MEMORY.md" without actually investigating the ROOT CAUSE and implementing concrete fixes. The pattern (Feb 8 morning): Received feedback about misinterpreting system events → said "sorted" without checking how it happened → said "won't happen again" without implementing structural changes → had to be called out twice. Fix: immediately spawn sub-agent to diagnose mechanism and implement structural changes to config/prompt; only then report findings. No empty promises.
- **Investigate mechanism, not just outcome** - when something goes wrong, don't just say "I see the problem" and move on. Dig into: How did the agent end up in this state? What prompt/config/logic allowed it? What's the specific mechanism? Use that to prevent recurrence, not just memory notes.
- **Verify before diagnosing** - always check actual outputs (sent messages, files, logs) before guessing what went wrong. Don't theorize about issues without looking at evidence first (Feb 6 2026: message garbling - guessed "too long" without checking actual sent message)
- **Verify links before sharing** - open/check URL availability first; don't send unverified links (Feb 7 2026: shared unavailable YouTube link)
- **Never send wrapped OAuth URLs** - when terminal output wraps auth links across lines, reconstruct as one continuous URL with no newlines before sending (Feb 8 2026)
- **Scheduled checks are on me** - when a reminder asks to check status (PRs, merges, etc.), I must verify it myself and report outcome; never ask Ari to do the check (Feb 8 2026)
- **Memory facts: supersede, don't overwrite** - when new facts correct prior spellings/details, mark old item as `superseded` with `supersededBy`; keep JSON arrays valid (Feb 8 2026 weekly memory synthesis)
- **Plugin post-its are friendly hints, not errors** — the plugin's "Post-it: Task Status Notes" and "Post-it: Task Dependencies" are notes from past-me to future-me. They're helpful nudges ("worth a quick check"), not alerts to fix. Read them as a friend's suggestion, act on them if useful, update them if they're stale. Don't treat them as problems to solve or errors to report.
- **Reject fragment captures in memory extraction** — if extracted "facts" are truncated phrase fragments (e.g., `"decided to"`, `"and is m"`, `"completed"` with no subject/context), treat them as low-confidence placeholders and do not treat them as durable knowledge without follow-up validation (observed Feb 13–15 2026).
- **Gateway restart can be silent** - `openclaw gateway restart` may return no stdout when controlled by LaunchAgent; always immediately run `openclaw gateway status` and send explicit confirmation right away (Feb 7 2026)
- **Full gateway restart kills sessions** - always warn Ari BEFORE `openclaw gateway restart` because it drops active sessions. For plugin code changes, prefer SIGUSR2 hot-reload first to avoid session loss (updated Feb 21 2026).
- **NEVER use `openclaw gateway stop`** - it unloads the launchd service entirely, disabling KeepAlive auto-restart. Gateway stays down until manual intervention. Use `launchctl unload/load` sequence instead (Feb 10 2026 incident: 46 min outage)
- **Fresh session greeting must stay minimal** — on `/new`/`/reset`, send one short greeting only; never dump session status/runtime/UUID blocks or `/status` output into chat (Feb 22 2026).
- **Signal semantics for reloads** - SIGUSR1 = config/prompts soft reload only (no plugin code reload). SIGUSR2 = plugin hot-reload in-place (no full restart). `openclaw gateway restart` = full process restart fallback when hot-reload fails or plugin discovery/config changed.
- **Gateway restart notifications are mandatory** - when Ari asks for restart, confirm explicitly once restart completes (with status) instead of sending unrelated/system-reminder chatter (Feb 8 2026)
- **Check before adding** - always check if something already exists before adding it (e.g., gitignore entries, config lines). Avoids duplicates and wasted commits
- **Research files belong with tasks** - don't leave research-*.md floating in tasks/. Move into task subfolder (e.g., `tasks/ongoing/[task-name]/research-*.md`) or delete if incorporated
- **Verify target chat GUID before sending** - session deliveryContext can point to a different group than where the conversation is happening. Always cross-check against the incoming message's chat GUID. Mechanism (Feb 8 2026): Sub-agent was spawned without explicit target GUID, defaulted to session's stale deliveryContext (Oren's group from prior conversation), sent message to wrong group. Fix: When spawning sub-agents for message sends, ALWAYS pass explicit `target: chat_guid:...` in spawn context. Knowledge graph now contains group chat GUIDs for reference.
- **Classify chat type by GUID, never by sender handle** - a group message can appear as coming from a single phone number (e.g., Rachel `+12019687116`). Mechanism (Feb 8 2026 18:07): I saw Rachel's sender address and inferred DM, then incorrectly told her to move to group even though the incoming chat was already `any;+;...`. Fix: enforce a pre-reply gate: check `chat_guid` first (`any;+;` group, `any;-;` DM) before applying group-only policy.
- **NEVER ask about message IDs** - query BlueBubbles API to look up message content yourself. Ari doesn't track message numbers. This has happened multiple times (Feb 5 2026)
- **Use threadOriginatorGuid for reply context** - when Ari replies to a specific message, query BB API and check `threadOriginatorGuid` field to find the original message being replied to. Don't ask Ari what they're referring to (Feb 9 2026)
- **No random folders** - if creating a new directory/structure with no obvious home, spawn a sub-agent to think through the right location and update relevant READMEs. Don't just toss files in arbitrary places (Feb 5 2026)
- **No time estimates** - don't assign hours/days to tasks or units. They're random guesses. Just list the work. NEVER estimate time for anything
- **No cost estimates** - don't estimate dollar savings/costs unless Ari explicitly asks and we align on a mechanism for accurate estimates. Made-up numbers are worse than no numbers
- **`.openclaw/` location** - lives at `~/` (home dir), NOT `~/clawd/`. It's a config folder that is auto-version-controlled but not pushed
- **Planning before execution** - don't ask "should I start executing?" until planning is COMPLETE with full list of execution tasks. Finish defining all work units first, THEN execute
- **Keep project/task docs up to date** - update the source-of-truth doc IMMEDIATELY when: (1) sub-agent completes, (2) new constraint added, (3) new decision made, (4) status changes. Don't batch updates. The doc should ALWAYS reflect current state
- **Parent task updates are immediate** - when a child/one-shot task completes, update the parent ongoing task in the SAME action (not deferred to heartbeat). Parent task status, spawned tasks table, and phase markers must stay in sync with child completions at all times
- **"Ready for review" means Ari reviews** - never use that phrase for internal CI verification. Say "verifying CI" or "checking CI" instead. "Review" implies Ari action needed
- **Coverage gaps**: ALWAYS fix remaining gaps, don't ask - just do it
- **Never assume project context** - if not totally sure which project/topic, ask before answering. Scope to current conversation, don't default to familiar projects
- **Brainstorming ≠ essay mode** - even when asked to "expand" or generate options, stay telegraph. bullets over paragraphs. 3 sentences max still applies
- **Strategy changes = restructure first, cascade second** - when a strategy change happens (e.g., "prioritize fastest path"), step 1 is ALWAYS restructure the source-of-truth doc, THEN cascade to dependent docs/agents. Never do incremental surface-level patches across multiple files - one holistic restructure from the top down
- **execution_mode decision**: `spawn` = needs formal tracking, substantial units, resumability across sessions; `direct` = file moves, straightforward work, can complete in one session. New ongoing/habit tasks start with `pending`, must decide before execution begins
- never send back user's own voice transcript unless explicitly asked
- Don't use `imsg send` without permission (sends from Ari's account)
- **imsg is LEGACY** - BlueBubbles is the messaging path forward (Jan 2026)
- Heartbeat replies should alert on status changes, not every 15min
- Opus tends verbose - keep replies tight
- Long Codex silence is normal (extended thinking)
- Memory pressure kills Codex ~150MB free
- Planning tasks aren't done till Ari says - don't close prematurely
- Active tasks start as "drafting" until Ari gives go-ahead
- **"needs-review" = plan review before execution**, not post-completion sign-off. Completed work → mark done directly
- When given a task (like fix coverage), verify completion - don't assume done from Codex output
- Don't make Ari prod multiple times - follow through proactively
- Commitment closure is explicit, not implied — if I say "I'll update you," I must send state-change updates (`started`/`blocked`/`completed`) immediately when state changes, especiall
- **Never trust sub-agent completion claims** — always verify: (1) git log shows new commit, (2) commit is on remote (diff HEAD origin/main), (3) CI is green. Sub-agents hallucinate success routinely (Feb 18 2026: 283k tokens burned, CI still red)
- **Kill all agents on same repo before spawning fix** — zombie agents keep pushing after being "superseded", undoing fixes (Feb 18 2026)
- **No hard timeouts on sub-agents** — use babysitter pattern (periodic check-ins) instead of `runTimeoutSeconds` which kills good work
- **Refer to sub-agents by task** — "the dedup agent", "the coverage one". Model name only when comparing performance
- **Dedup should nudge, not silently swallow** — block + explain + log, never silent cancel (Feb 18 design decision with Ari)
- **Plugin reload command (preferred)** — `kill -USR2 $(openclaw gateway status | sed -n 's/.*pid \\([0-9][0-9]*\\).*/\\1/p' | head -n1)` then verify logs for `hot-reload complete`.
- **Plugin must never silently mutate task files** — nudge only, task file writes are orchestrator's job (Feb 18: plugin was flipping in-progress→ready)y on sub-agent completion. Missing closure after 10 minutes is a reliability incident.
- **Never ask "want me to do X?" - just do it.** If the next step is obvious, execute. Don't ask permission for continuation work
- **Coding hard gate (Feb 7, 2026)**: do not proceed on coding tasks without clear scope in the correct task file. If touching code that is not explicitly rationalized/discussed in that task file, stop and notify Ari immediately.
- **Always spawn sub-agents for fixes** - don't ask "should I spawn a sub-agent?" Just do it. Options lists are dumb questions
- **Push target for OpenClaw contributions** - push branches to our fork (not upstream `openclaw/openclaw`) unless Ari explicitly says otherwise
- **Fork-first, not PR-first (Feb 10)** - maintain our fork with improvements, battle test them first. Only extract into upstream PRs after they're proven. Don't maintain open PRs against upstream
- **Codex always uses --yolo** - no sandbox, no approvals. fastest mode. applies to all projects
- **TDD mandatory for all coding** - tests first, implementation second. no exceptions. include in all codex prompts
- **Never set timeouts on Codex** - no timeout parameter, ever. if it's working, let it work. only kill manually if actually stuck
- **NEVER kill Codex sessions without Ari's confirmation** - EVER
- **Spawn accepted ≠ running** - after `sessions_spawn`, immediately verify an active coding process/session actually started; if not, restart and report the gap right away
- **Parallelize active-task recovery (Feb 7, 2026)** - for in-progress coding tasks, resume execution immediately and handle documentation/process updates in parallel via sub-agents; do not serialize these.
- Task tracking goes in active-coding-*.md, NOT WORKING_NOTES.md - keep task files updated with units
- NEVER kill Codex sessions without Ari's confirmation - EVER

### Heartbeat Delegation Requirement (Feb 10)
- **Incident**: Heartbeat ran inline for ~20 min, blocking Ari's chat
- **Root cause**: HEARTBEAT.md didn't explicitly mandate spawning; general SOUL.md rule wasn't enough
- **Fix**: Added Section 0 to HEARTBEAT.md requiring spawn-mode + reinforced in SOUL.md delegation section
- **Prevention**: Any recurring system check with 5+ tool calls must have explicit delegation mandate in its own doc

- **Group chat tone matching (Feb 17)** — in group chats (especially "Consciousness TBD"), match the group's energy. If the vibe is fun/casual, don't give clinical/dry answers. Ari said "you're embarrassing me in front of the class" after a sterile reply. Read the room.
- **Post-compaction: pull BB messages FIRST (Feb 17)** — after compaction, do NOT act on assumptions from compaction summary. First sentence: "I don't know what we were discussing." Then pull recent BB messages via API before taking any action. Incident: pattern-matched "3am" to dream cycle when actual topic was fork sync cron timing.
- **Usefulness gauge may undercount (Feb 17)** — shipped 7+ commits in a day but gauge stayed at 0. Investigate whether commit detection is working correctly.
- **Task system silently flips in-progress→ready (Feb 18)** — bug identified: plugin silently changes task status from in-progress to ready when no active session bound. This causes task transparency issues.
- **Dedup nudge design (Feb 18)** — redesigned to block send + inject nudge ("you sent something similar recently — do you have new info?") + log to audit log. Value is case 1 (heartbeat noise dupes), not case 2 (commitment closure) or case 3 (legit repeats).
- **Promise detector broadened (Feb 18)** — added 23 new patterns ("will update", "checking now", "working on it"). Fixed chatGuid fallback to use lastActiveChatGuid (empty in session replies).
- **Zombie sub-agents keep pushing (Feb 18)** — killed agents can still run and push commits, undoing fixes. Kill ALL agents on same repo before spawning new fix agent.
- **Message queue causing delivery failures (Feb 19)** — redundant plugin message queue is causing messages to get stuck/lost. Needs to be disabled entirely.

## Current Focus
- **Slugger Determinism Plugin** - Phase 6 complete (reply context + thread persistence). 279 tests, all pushed. Weekly review cadence. Located: `~/clawd/tasks/ongoing/2026-02-09-1135-slugger-determinism-plugin.md`
- **SJ Janitor** - SpoonJoy stabilization done (localStorage versioning, sign-in fix, CI fixes). Site working. Located: `~/clawd/tasks/ongoing/2026-02-05-0752-sj-janitor.md`
- **Voice/Podcast Participation** - Units 1-3 complete. Units 4-6 pending. Located: `~/clawd/tasks/ongoing/2026-02-05-2014-voice-low-latency.md`
- **Azure OpenClaw** - Ready for implementation. 17 research reports, 44 units, 7 phases. Located: `~/clawd/tasks/ongoing/2026-02-04-2116-azure-openclaw/`
- **OpenClaw Contributions** - Active, on-demand. Located: `~/clawd/tasks/ongoing/2026-02-07-1629-openclaw-contributions.md`
- Spoonjoy v2 development (paused except janitor)
- Wedding planning (July 29, 2026)

## Task File Rules
- **Test coverage over test count** - never drive acceptance by number of tests (e.g., "80+ tests"). Test count is meaningless. Require proper coverage percentages and meaningful coverage of branches/edge cases. Fix this across all task files. **NEVER report test counts** - not in messages to Ari, not in task updates, not in completion reports. Only report coverage percentages. This has been a repeat violation (Feb 11 2026: reported "593 tests", "597 tests" etc. multiple times despite this rule existing)
- **Acceptance criteria boxes must be empty** - when writing acceptance criteria in task files, use `- [ ]` (unchecked). NEVER pre-check them with `- [x]` or ✅ - that signals "done" and confuses future readers. Boxes get checked only when the work is actually verified complete
- **Plugin location (current)** - slugger-determinism-v2 is loaded from `~/Projects/slugger-plugin-v2` via `plugins.load.paths` in `~/.openclaw/openclaw.json`.
- **Fork reference** - our OpenClaw fork: `~/Projects/openclaw`. Only put things in the fork that the plugin literally cannot handle. Everything else stays in the custom plugin
- **"Safe" autonomous fixes = broad** - heartbeat shouldn't just report stale statuses, it should fix them. Broaden what counts as "safe housekeeping" that can be auto-applied without Ari's approval

## CI Verification Rule (CRITICAL)
- **ALWAYS verify CI is actually green before declaring done** - don't say "should be green" or "pushed, CI should pass"
- Check `gh run list` and wait for completion status
- Sub-agents often report success but don't actually push changes - verify with `git status`
- **Sub-agents hallucinate CI run IDs** - they make up run numbers and claim "CI green" when it isn't. NEVER trust sub-agent CI claims
- **Check BOTH CI and Storybook runs** - same commit triggers 2 workflows. Storybook success ≠ CI success
- Only announce completion after CI workflow (not just Storybook) shows `completed success`
- Lesson (2026-02-04): Sub-agent claimed run 21687912345 passed - that run ID didn't exist. Always verify myself
- Lesson (2026-02-05): Twice announced "CI green" when only Storybook passed. Must check workflow name, not just conclusion

## Recent Learnings (Jan 2026)

### A/B Testing Requires Isolation
- Failed experiment: compared Codex context approaches in same directory
- Files overwrote each other, no clean measurement possible
- **Rule**: Use `git worktree` or separate temp dirs for parallel experiments
- Measure: tokens, time, success rate - log everything

### SpoonDock Integration Pattern
- Mobile-first nav with glass morphism + safe area padding
- Contextual L2 actions via `use-recipe-dock-actions.tsx`
- Storybook-first component development

### Recipe Flow Redesign Idea
- Current: metadata → save → navigate → add step → save → repeat
- Proposed: continuous inline flow with progressive save
- Key: same form for create/edit, drag-reorder during creation

## Recent Learnings (Mar 2026)
- **Always verify first cron run (Mar 5)** — after setting up any cron job, WAIT for the first execution and confirm it succeeds (check `cron list` for lastRunStatus). Never tell Ari "it's locked in" until you've seen a successful run. The ouroboros-seed cron ran broken for hours because delivery.channel was missing and I never checked.

## Recent Learnings (Feb 2026)
- **Task naming timezone rule (Feb 21)** - Task filenames must use America/Los_Angeles (Pacific) local date+time, never UTC. If a generated filename uses UTC clock time, immediately rename to Pacific and fix references.
- **Valid task statuses (Feb 20)** - Only 8 valid statuses: drafting, processing, validating:slugger, validating:ari, collaborating, paused, blocked, done. "ready" is NOT valid (removed). Bulletin board is the single unified view.
- **Always build + restart + validate plugin changes (Feb 20)** - Tests passing ≠ working in production. After any plugin code change: rebuild dist/, restart/reload gateway, visually confirm output.

### Azure OpenClaw Project (Feb 4)
- Massive research sprint: 17 research reports in one evening
- Key architectural decisions: ACA consumption plan, per-user bot identity, CaMeL prompt injection defense
- GPT-5.2 identified as Opus replacement (65% cheaper, 3.8x faster, 400K context)
- Cost model: $20.83/emp/mo baseline, beats Copilot at ~85 employees
- Sub-agent design lesson: planner/doer split was for Mac/Windows - single agent preferred when on same machine
- Demo project concept: "Clippy" bot onboards employees, creates personal coworker

### Voice Feedback (Feb 4)
- Current TTS voice (Rory/Friday) "doesn't feel quite right" - too polished
- Group consensus: need something scrappier that matches Slugger's personality
- Voice customization is a future exploration area

### Spoonjoy v2 Testing (Feb 3)
- **Cloudflare vite plugin uses D1 emulation**, not prisma/dev.db - run `wrangler d1 migrations apply` for local dev
- **React Router layout routes need `<Outlet>`** - without it, child routes never render
- **E2E tests reveal real bugs** - manual curl testing missed the Outlet issue because I was accessing URLs directly
- Test pattern: `chromium-no-auth` for login tests, `chromium` with auth fixtures for authenticated flows

### Writing Style Lessons (Feb 2)
- Key patterns: Never start with "Because", vary example types not just names
- Fact-checking critical: ChatGPT wasn't "hackathon accident", Apple didn't "fire" execs
- HITL review = distinct unit (fact-checks + style polish)

## Sub-Agent Model Rule (Feb 20, 2026)
- **ALL sub-agents must use MiniMax** — no Anthropic models (no Sonnet, no Haiku) for sub-agents
- Anthropic = orchestrator only (Opus for main session)
- Codex CLI = all coding work

## Visual Design Review Capability (Feb 23, 2026)
- **Screenshot → Vision Model → Codex Fix loop** is the process for all visual work
- Use `browser screenshot` → `image` tool with design critique prompt → feed findings to codex
- The vision model (via image tool) gives brutally honest design feedback comparable to a senior UX designer
- Never ship visual work without running this loop at least once
- UX design skill updated with the full process: `~/clawd/skills/ux-design/SKILL.md`
- No dedicated CLI/API product exists for this; the image tool + structured prompt is the best available approach

## BlueBubbles Image Delivery (Feb 24, 2026)
- **Screenshots/images must be sent as attachments** via `message action=sendAttachment` — BlueBubbles does not render inline images from tool results
- Browser screenshot → save to file → `sendAttachment` with path — that's the pattern
- Never assume a browser screenshot in tool output will be visible to Ari in iMessage

## Codex CLI Flags (Feb 24, 2026)
- **`-a untrusted` is DEAD** — removed from codex CLI. Use `--full-auto` instead (shorthand for `-a on-request --sandbox workspace-write`)
- Updated coding-agent SKILL.md to reflect this
