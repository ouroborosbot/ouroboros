# Planning: Context Kernel Wiring Bugs + Friend Storage Redesign

**Status**: NEEDS_REVIEW
**Created**: 2026-03-03 11:03

## Goal
Fix two wiring bugs preventing the context kernel from functioning (AAD field extraction, system prompt injection), redesign friend storage (merge types, PII-aware split), redesign `save_friend_note` as the universal friend-knowledge tool with conflict-aware updates, and make the agent actually use its memory system — ephemerality awareness in the system prompt and preference injection into tool descriptions.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### In Scope

**Bug 1: AAD fields never extracted in Teams**
- `src/senses/teams.ts` `app.on("message")` handler creates `teamsContext` but never populates `aadObjectId`, `tenantId`, `displayName` from the activity
- Extract from: `activity.from.aadObjectId`, `activity.conversation.tenantId`, `activity.from.name`
- The context resolver guard at line 354 always fails because these fields are empty
- `TeamsMessageContext` already has the right fields defined (lines 298–300) — they're just never populated

**Bug 1 addendum: Name quality**
- The agent should evaluate whether the displayName on file looks like a real name and ask the friend if unsure
- Implementation: include the displayName in the system prompt context section and add a soft first-person instruction: "The name I have on file for this friend is {displayName}. If this doesn't seem like their actual name, I should ask what they'd like to be called and save it with `save_friend_note`."
- No code-level heuristics (regex, OS username comparison, etc.) — the model is far better at judging whether "jsmith" or "JORDAN.SMITH (CONTOSO)" is a real name than any code check
- The model decides, asks naturally via conversation, and saves with `save_friend_note({ type: "name" })`

**Bug 2: System prompt never includes context**
- `buildSystem("teams")` is called at teams.ts:339 without a context param, and the result is cached for the session. Resolved context never reaches the prompt.
- Same bug in CLI: `buildSystem("cli")` at cli.ts:359 is called without context despite `resolvedContext` being available 7 lines above.
- Additionally in `core.ts` line 173: `buildSystem(channel, options)` is called without context even when `options.toolContext.context` is available.
- Fix: rebuild the system message each turn with resolved context. Replace `messages[0].content` with fresh `buildSystem(channel, options, resolvedContext)` call. Cheap because psyche files are cached in `_psycheCache`.

**Storage Redesign: Merge types + PII-aware split**

*Type merge:*
- Merge `FriendIdentity` + `FriendMemory` → single `FriendRecord` type:
  ```
  FriendRecord {
    id: string                              // stable UUID
    displayName: string
    externalIds: ExternalId[]               // PII
    tenantMemberships: string[]             // PII
    toolPreferences: Record<string, string> // keyed by integration name
    notes: Record<string, string>           // general friend knowledge (role, projects, etc.)
    createdAt: string
    updatedAt: string
    schemaVersion: number
  }
  ```

*Split storage by PII boundary:*
- **Agent knowledge** (`{agentRoot}/friends/{uuid}.json`): `{ id, displayName, toolPreferences, notes, createdAt, updatedAt, schemaVersion }` — travels with the creature, committed to repo
- **PII bridge** (`~/.agentconfigs/{agentName}/friends/{uuid}.json`): `{ id, externalIds, tenantMemberships, schemaVersion }` — installation-specific, never committed
- `agentName` comes from existing `getAgentName()` in `src/identity.ts`

*Store interface redesign:*
- `ContextStore` (two generic `CollectionStore<T>` collections) → `FriendStore` (domain-specific methods)
- New interface:
  ```
  FriendStore {
    get(id: string): Promise<FriendRecord | null>
    put(id: string, record: FriendRecord): Promise<void>
    delete(id: string): Promise<void>
    findByExternalId(provider, externalId, tenantId?): Promise<FriendRecord | null>
  }
  ```
- Generic `find(predicate)` goes away — can't scan across two backends generically. Replaced by `findByExternalId()` which searches PII bridge files, then reads agent knowledge to return merged record.
- `FileContextStore` → `FileFriendStore`: constructor takes two paths (agentKnowledgePath, piiBridgePath). `get()` reads both backends and merges. `put()` splits and writes to both. `findByExternalId()` scans PII bridge, then merges.

*Resolver changes:*
- `ContextResolver` constructor takes `FriendStore` instead of `ContextStore`
- `resolveIdentity()` uses `store.findByExternalId()` instead of `store.identity.find()`
- `resolveIdentity()` never overwrites `displayName` on an existing record. The initial value comes from the system (AAD name, OS username) on first encounter. After that, only `save_friend_note` can change it. This prevents the system from stomping on a name the friend explicitly provided.
- `resolveMemory()` as a separate step is eliminated — the merged `FriendRecord` returned by `get()`/`findByExternalId()` already contains `toolPreferences` and `notes`. `memory.ts` may be deleted or reduced to a helper.
- `ResolvedContext` changes from `{ identity: FriendIdentity, channel, checker?, memory: FriendMemory | null }` to `{ friend: FriendRecord, channel }`. The `checker?` field is removed (AuthorityChecker eliminated).

*Per-turn refresh (no in-memory mutation):*
- Each turn, re-read the friend record from disk via `store.get(friendId)` before building the system prompt and tools. The friend ID is known from initial identity resolution.
- This eliminates all in-memory mutation concerns. `save_friend_note` writes to disk and returns. Next turn, the agent loop re-reads the fresh record. Store is the single source of truth.
- Two tiny JSON file reads per turn is negligible (sub-millisecond).

*Downstream consumer updates:*
- `prompt.ts` `contextSection()`: `context.identity.displayName` → `context.friend.displayName`, preferences and notes rendered from separate fields (see Preference-Aware section below)
- `ToolContext` type: `memoryStore: CollectionStore<FriendMemory>` → `friendStore: FriendStore`, `context` field typed with updated `ResolvedContext`
- `src/senses/cli.ts` and `src/senses/teams.ts`: create `FileFriendStore` with two paths instead of `FileContextStore` with one path

**`save_friend_note` Redesign: Universal friend-knowledge tool**

*New parameters:*
```
save_friend_note({
  type: "name" | "tool_preference" | "note",
  key?: string,       // required for tool_preference (integration name) and note (category)
  content: string,    // the note/preference/name to save
  override?: boolean  // default false; true to overwrite after reviewing existing
})
```

*Behavior by type:*
- `type: "name"`: Updates `record.displayName = content`. No conflict check — the friend explicitly told us their name. Also saves to `record.notes["name"]` for consistency.
- `type: "tool_preference"`: Requires `key` (integration name, e.g., `"ado"`).
  - If `record.toolPreferences[key]` exists AND `!override`: returns "There's already a preference stored for {key}: '{existing}'. Review this alongside what you just learned and call again with your merged/updated preference and `override: true`."
  - If no existing OR `override: true`: saves `record.toolPreferences[key] = content`.
- `type: "note"`: Requires `key` (category, e.g., `"role"`, `"projects"`, `"working_style"`).
  - Same conflict behavior as tool_preference — if exists and `!override`, returns existing and asks model to merge.
  - Saves to `record.notes[key] = content`.

*Tool description:*
- Broadened from "save a preference about how they like things done" to cover all friend knowledge: name, role, projects, working style, communication preferences, tool preferences, any fact worth remembering.
- Description should explicitly mention the three types and when to use each.

*Implementation:*
- Reads full `FriendRecord` via `ctx.friendStore.get(ctx.context.friend.id)`
- Updates the appropriate field based on `type`
- Writes back via `ctx.friendStore.put()` — store handles PII split internally
- No in-memory mutation needed — the agent loop re-reads from disk on the next turn

**Preference-Aware Prompt and Tools**

*Memory ephemerality instruction:*
- The system prompt must tell the agent — in first person, since the system prompt IS the agent's inner voice — that its memory is ephemeral. Something like: "I have ephemeral short-term memory. Anything I don't immediately write down with `save_friend_note` will be lost forever when this conversation ends. When I learn something about a friend — their name, role, preferences, projects, working style — I save it right away."
- Add this instruction in `contextSection()` within `prompt.ts`, when a friend context is present.

*Name quality instruction:*
- Always include in `contextSection()` when friend context is present: "The name I have on file for this friend is {displayName}. If this doesn't seem like their actual name, I should ask what they'd like to be called and save it."
- No code heuristics. The model decides whether the name looks real.

*Tool-specific preference injection:*
- `toolPreferences` entries are injected into matching tool descriptions via the `tools` API parameter (NOT the system prompt). `notes` entries are rendered in the system prompt. The separation is structural at the data level — no filtering needed.
- `getToolsForChannel()` in `tools.ts` is the single aggregation point for building the `tools` array passed to the API. Extend it to accept `toolPreferences?: Record<string, string>`.
- Mapping: match each preference key against each tool's `integration` field (`"ado" | "github" | "graph"`). If preference key `"ado"` exists, append it to the `function.description` of every tool with `integration: "ado"`.
- `core.ts` passes preferences: `getToolsForChannel(capabilities, toolContext?.context?.friend?.toolPreferences)`.
- Tool descriptions are rebuilt each turn (since friend record is re-read from disk each turn), so mid-conversation preference changes are reflected on the next turn.

*General notes in system prompt:*
- `contextSection()` renders `record.notes` entries in the system prompt (first person). E.g., if `notes["role"] = "engineering manager"`, system prompt includes "I know [friend] is an engineering manager."
- `toolPreferences` entries are NOT rendered in the system prompt — they only appear on tool descriptions. Clean separation, no dedup logic needed.

*Cleanup: Remove AuthorityChecker*
- `AuthorityChecker` (interface in `types.ts`, created in `resolver.ts`, rendered in `contextSection()`) is dead weight. Tool availability is determined by `getToolsForChannel()` via the `tools` API parameter. OAuth tokens are resolved on-demand via sign-in flow. 403s surface naturally through tool error returns. AuthorityChecker adds complexity without behavioral value.
- Remove: `AuthorityChecker` interface from `types.ts`, `checker?` field from `ResolvedContext`, authority checking logic from `ContextResolver.resolve()`, authority section rendering from `contextSection()` in `prompt.ts`, and all associated tests.
- We're already touching every file it lives in for the type merge — removing it now makes the merge cleaner.

*Documentation:*
- Update top-level README.md to document the friend storage split (agent knowledge vs PII bridge, what lives where and why)

### Out of Scope
- FRIENDS.md migration (deferred — see Notes)
- Friend re-linking after agent migration (deferred — see Notes)
- New context kernel features (new identity providers)
- Persisting the `tools` array in session files for debugging/recall (deferred — see Notes)
- Migration of existing data in `~/.agentconfigs/context/` — only one dev machine, no production users. Delete old directory manually.

## Completion Criteria
- [ ] Teams handler extracts AAD fields from activity and populates `TeamsMessageContext`
- [ ] Context resolver guard (`teamsContext?.aadObjectId`) succeeds when AAD identity is present
- [ ] Resolved context is included in the system prompt for both Teams and CLI channels
- [ ] System prompt includes name-quality instruction (first person, model-judged — no code heuristics)
- [ ] System prompt includes memory ephemerality instruction (first person) when friend context is present
- [ ] `FriendIdentity` + `FriendMemory` merged into single `FriendRecord` type (with `toolPreferences`, `notes`, and `displayName` fields)
- [ ] `ResolvedContext` uses `friend: FriendRecord` instead of separate `identity` + `memory` fields
- [ ] `ContextStore` replaced by `FriendStore` with domain-specific methods (`get`, `put`, `delete`, `findByExternalId`)
- [ ] `FileFriendStore` splits reads/writes across agent knowledge and PII bridge backends
- [ ] Agent knowledge stored at `{agentRoot}/friends/{uuid}.json` (id, displayName, toolPreferences, notes, createdAt, updatedAt)
- [ ] PII bridge stored at `~/.agentconfigs/{agentName}/friends/{uuid}.json` (id, externalIds, tenantMemberships)
- [ ] `resolveIdentity()` never overwrites `displayName` on existing records
- [ ] `resolveMemory()` eliminated or reduced (memory is part of the merged record)
- [ ] Friend record re-read from disk each turn (no in-memory mutation of context)
- [ ] `save_friend_note` redesigned with `type` parameter (`name`, `tool_preference`, `note`)
- [ ] `save_friend_note` conflict behavior: returns existing value and asks model to merge when overwriting without `override: true`
- [ ] `save_friend_note` `name` type updates `record.displayName`
- [ ] `save_friend_note` writes to disk only — no in-memory mutation
- [ ] `ToolContext` type updated (`memoryStore` → `friendStore`)
- [ ] `ContextResolver` works with `FriendStore` and merged `FriendRecord`
- [ ] `AuthorityChecker` removed: interface, `checker?` field on `ResolvedContext`, resolver logic, prompt rendering, and tests
- [ ] `getToolsForChannel()` accepts `toolPreferences` and injects matching preferences into tool `function.description` (in `tools` API param, not system prompt)
- [ ] `toolPreferences` entries appear in tool descriptions only (not system prompt)
- [ ] `notes` entries appear in system prompt only (not tool descriptions)
- [ ] Top-level README.md documents the friend storage split
- [ ] 100% test coverage on all new and modified code
- [ ] All tests pass
- [ ] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Open Questions
- [x] Bug 2: Should we rebuild the system message each turn, or inject context as a separate system-role message? **Resolved: rebuild.** Psyche files are cached in `_psycheCache`, so rebuilding is cheap. The `buildSystem(channel, options, context)` signature already accepts context.
- [x] Bug 2 (Teams): For existing sessions, the system message was created in a prior request. Should we update `messages[0]` or prepend fresh? **Resolved: update `messages[0]`.** The system message is always the first message in the array. Replace its content with a fresh `buildSystem()` call that includes resolved context.
- [x] Bug 1: Which properties on the Bot Framework `Activity` object carry AAD fields? **Resolved via SDK types.** `Activity.from` is type `Account` with `aadObjectId?: string` and `name: string`. `Activity.conversation` is type `ConversationAccount` with `tenantId?: string`.
- [x] Bug 1 (name quality): Should code detect garbage names? **Resolved: no. Model-judged.** Always include displayName in system prompt with a soft first-person instruction. The model is better at judging name quality than any code heuristic. No regex, no OS username comparison.
- [x] Storage: How does the store expose two backends? **Resolved: `FriendStore` interface with domain-specific methods.** Constructor takes two paths. `get()`/`put()` read/write both backends. `findByExternalId()` searches PII bridge then merges. Generic `find(predicate)` eliminated — can't scan across two backends generically.
- [x] Storage: What happens to `resolveMemory()`? **Resolved: eliminated.** The merged `FriendRecord` includes `toolPreferences` and `notes`. Identity resolution returns the full record — no separate memory resolution step needed. `memory.ts` may be deleted or reduced.
- [x] Storage: What about `ResolvedContext` shape? **Resolved: `{ friend: FriendRecord, channel }`.** Replaces separate `identity` + `memory` fields. All consumers update to use `.friend.*`.
- [x] Storage: Where does `agentName` come from for the PII bridge path? **Resolved: `getAgentName()`** already exists in `src/identity.ts` (parses `--agent <name>` from argv). PII bridge path: `path.join(os.homedir(), ".agentconfigs", getAgentName(), "friends")`.
- [x] Storage: What about existing data in `~/.agentconfigs/context/`? **Resolved: no migration.** One dev machine, no production users. Delete manually.
- [x] Storage: Should `resolveIdentity()` update displayName on returning friends? **Resolved: never.** displayName is set on first encounter from the system-provided name (AAD, OS username). After that, only `save_friend_note` with `type: "name"` can change it. Prevents the system from overwriting a friend-provided name.
- [x] Preferences: How to map preferences to tools? **Resolved: match on `integration` field.** Each tool definition has an optional `integration?: Integration` field (`"ado" | "github" | "graph"`). Preference keys matching an integration get injected into those tools' `function.description` in the `tools` API parameter.
- [x] Preferences: How to avoid rendering preferences in both tool descriptions AND system prompt? **Resolved: structural separation.** `toolPreferences` → tool descriptions (via `tools` API param). `notes` → system prompt. Separate fields on `FriendRecord`, no filtering logic needed.
- [x] Preferences: How to handle mid-conversation preference changes? **Resolved: per-turn disk refresh.** Friend record is re-read from disk each turn. `save_friend_note` writes to disk. Next turn picks up changes automatically. No in-memory mutation needed.
- [x] Tool: Should `save_friend_note` silently overwrite existing values? **Resolved: conflict-aware.** For `tool_preference` and `note` types, if a value already exists and `override` is not true, the tool returns the existing value and instructs the model to merge and re-call with `override: true`. For `name` type, no conflict check (friend explicitly told us).
- [x] Prompt voice: What voice should system prompt instructions use? **Resolved: first person.** The system prompt IS the agent's inner voice. All instructions use "I" statements.
- [x] Authority: Should we keep `AuthorityChecker`? **Resolved: remove it.** It adds complexity without behavioral value. Tool availability is determined by `getToolsForChannel()` via the `tools` API parameter. OAuth consent happens on-demand via sign-in flow. 403s surface through tool error returns. We're already touching every file authority lives in — removing it makes the merge cleaner.
- [x] Session debugging: Should the `tools` array be persisted in session files? **Resolved: deferred.** Would be useful for debugging/recall, but tools change per turn (rebuilt with preferences), and the tool list is deterministic from channel + preferences. Nice-to-have for later, not this task.

## Decisions Made
- Bug 2 fix: Rebuild the system message on each turn by calling `buildSystem(channel, options, resolvedContext)` and replacing `messages[0].content`. Cheap because psyche files are cached. Friend record re-read from disk each turn — store is the single source of truth.
- Bug 1 field mapping: `activity.from.aadObjectId` → `teamsContext.aadObjectId`, `activity.conversation.tenantId` → `teamsContext.tenantId`, `activity.from.name` → `teamsContext.displayName`. Standard Bot Framework SDK fields.
- Bug 1 name quality: No code heuristics. Always include displayName in system prompt with first-person instruction: "The name I have on file for this friend is {displayName}. If this doesn't seem like their actual name, I should ask what they'd like to be called and save it." Model decides.
- Storage redesign:
  - Merge `FriendIdentity` + `FriendMemory` → `FriendRecord`. One logical type, split across two files by PII boundary. New `notes: Record<string, string>` field for general friend knowledge.
  - **Agent knowledge** (`{agentRoot}/friends/{uuid}.json`): `{ id, displayName, toolPreferences, notes, createdAt, updatedAt, schemaVersion }` — portable, committed to repo. Part of what makes the agent *your* agent.
  - **PII bridge** (`~/.agentconfigs/{agentName}/friends/{uuid}.json`): `{ id, externalIds, tenantMemberships, schemaVersion }` — installation-specific, never in repo. Maps external identity systems to opaque UUIDs.
  - Directory name `friends/` in both locations. Aligns with "friends not users" principle.
  - `ContextStore` → `FriendStore`. Interface changes from two generic collections to domain-specific methods: `get`, `put`, `delete`, `findByExternalId`.
  - `FileContextStore` → `FileFriendStore`. Constructor takes two paths (agentKnowledgePath, piiBridgePath). Handles split internally.
  - `resolveIdentity()` never overwrites `displayName` on existing records. Set on first encounter, only changed by `save_friend_note`.
  - `resolveMemory()` eliminated. Memory resolution collapses into identity resolution — `FriendRecord` already has `toolPreferences` and `notes`.
  - `ResolvedContext` changes to `{ friend: FriendRecord, channel }`. All consumers update.
  - Per-turn disk refresh: friend record re-read from disk each turn. No in-memory mutation. Store is single source of truth.
  - No migration of old data. Delete `~/.agentconfigs/context/` manually.
- `save_friend_note` redesign:
  - Universal friend-knowledge tool with `type` parameter: `"name"`, `"tool_preference"`, `"note"`.
  - `name`: updates `record.displayName` and `record.notes["name"]`. No conflict check.
  - `tool_preference`: requires `key` (integration name). Conflict-aware — if existing value and no `override`, returns existing and asks model to merge before re-calling with `override: true`.
  - `note`: requires `key` (category). Same conflict behavior as `tool_preference`.
  - Writes to disk only. No in-memory mutation — next turn re-reads from disk.
  - Tool description broadened to cover all friend knowledge.
- Preference-aware prompt and tools:
  - System prompt includes memory ephemerality instruction (first person) when friend context is present.
  - System prompt includes name-quality instruction (first person, always, model-judged) when friend context is present.
  - `toolPreferences` entries injected into matching tool `function.description` via `getToolsForChannel()` (in `tools` API param). Matched by `integration` field. Never in system prompt.
  - `notes` entries rendered in system prompt context section (first person). Never in tool descriptions.
  - Structural separation at the data level — no dedup filtering needed.
  - `core.ts` re-reads friend record from disk each turn, passes `friend.toolPreferences` to `getToolsForChannel()` and `friend` to `buildSystem()`.
- AuthorityChecker removal: dead weight — tool availability via `tools` API param, OAuth on-demand, 403s via tool errors. Remove interface, `checker?` field, resolver logic, prompt rendering, and tests. Simplifies the type merge.

## Context / References
- `src/senses/teams.ts` — Teams channel adapter (bug 1, bug 2-Teams, storage redesign). `TeamsMessageContext` already has AAD fields defined at lines 298–300.
- `src/senses/cli.ts` — CLI channel adapter (bug 2-CLI, storage redesign)
- `src/mind/prompt.ts` — `buildSystem()` accepts optional `context` parameter. `contextSection()` renders friend info + channel traits + notes. Name-quality and ephemerality instructions add new code here. Authority rendering removed.
- `src/mind/context/types.ts` — `FriendIdentity`, `FriendMemory`, `ResolvedContext` types → becomes `FriendRecord` + updated `ResolvedContext`
- `src/mind/context/store.ts` — `ContextStore`, `CollectionStore<T>` interfaces → becomes `FriendStore`
- `src/mind/context/store-file.ts` — `FileContextStore` → `FileFriendStore` with two-backend implementation
- `src/mind/context/authority.ts` — `AuthorityChecker` implementation → deleted (dead weight, see cleanup scope)
- `src/mind/context/resolver.ts` — `ContextResolver` → update for `FriendStore` + merged type. `resolveIdentity()` must not overwrite `displayName`. Authority checking removed.
- `src/mind/context/memory.ts` — `resolveMemory()` → likely deleted (collapses into identity resolution)
- `src/mind/context/identity.ts` — `resolveIdentity()` → update for `FriendStore.findByExternalId()`
- `src/identity.ts` — `getAgentRoot()` and `getAgentName()` for per-agent paths
- `src/repertoire/tools-base.ts` — `save_friend_note` tool (lines 274–311). Complete redesign: new parameters, conflict-aware behavior, three note types.
- `src/repertoire/tools.ts` — `getToolsForChannel()` (single tool aggregation point, lines 1–65). Extend to accept and inject `toolPreferences` into tool `function.description`.
- `src/heart/core.ts` — Agent loop (lines 159–415). Line 173: `buildSystem()` without context (Bug 2). Line 194: `getToolsForChannel()` without preferences. Per-turn: re-read friend record from disk, rebuild system prompt and tools with fresh data.
- `src/__tests__/senses/teams.test.ts` — existing Teams tests
- `src/__tests__/mind/prompt.test.ts` — existing prompt tests
- `src/__tests__/mind/context/` — existing context kernel tests (store, resolver, memory, identity)
- `src/__tests__/repertoire/` — tool tests (for getToolsForChannel, save_friend_note changes)
- Original context kernel planning: `ouroboros/tasks/2026-03-02-1716-planning-context-kernel.md`
- SDK types: `@microsoft/teams.api` `Account` has `aadObjectId?: string`, `name: string`; `ConversationAccount` has `tenantId?: string`

## Notes
**Deferred: FRIENDS.md migration (carry forward, do not implement)**
The context kernel planning doc explicitly deferred removing FRIENDS.md. The plan is:
- Per-friend knowledge moves from static `psyche/FRIENDS.md` to dynamic `FriendRecord` (`world`/`rapport` fields)
- Channel-level social norms ("speaking to Microsoft employees") move to `IDENTITY.md`
- This happens AFTER `toolPreferences` proves the model-managed notes pattern
- For now, FRIENDS.md stays as-is

**Deferred: Persist tools array in session files (carry forward, do not implement)**
The `tools` API parameter is not persisted in session files today. For debugging and recall, it would be useful to see which tools (and which preference-injected descriptions) were available on each turn. Deferred because tools change per turn and the list is deterministic from channel + preferences — can be reconstructed. Nice-to-have for later.

**Deferred: Friend re-linking after agent migration (carry forward, do not implement)**
When an agent is moved to a new machine/installation, the PII bridge doesn't travel with it. The agent retains friend knowledge (by UUID and display name) but can't recognize returning friends from their external IDs. Re-linking strategy TBD — possible approaches include confirmation from a known channel, manual claim, display-name fuzzy match + confirmation, or encrypted export/import. Depends on how agents actually get moved around, which we don't know yet.

## Progress Log
- 2026-03-03 11:03 Created
- 2026-03-03 11:04 Resolved all open questions from SDK type inspection; added decisions
- 2026-03-03 12:15 Redesigned Bug 3 → Storage Redesign: merge FriendIdentity+FriendMemory into FriendRecord, split storage by PII boundary. Added name-quality resolution for Bug 1. Added deferred notes for re-linking and FRIENDS.md. Added README update to scope.
- 2026-03-03 12:45 Full rewrite: updated goal, reframed as 2 bugs + 1 redesign, fixed stale references, added open questions for the merge, completed references list, resolved migration question (no migration needed).
- 2026-03-03 13:10 Second rewrite after code verification: traced full downstream cascade of type merge. Added ResolvedContext shape change, FriendStore interface, resolveMemory() elimination, save_friend_note + ToolContext updates, findByExternalId(). Added tools-base.ts to references.
- 2026-03-03 13:40 Third revision: added preference-aware prompt and tools section. Memory ephemerality instruction, broadened save_friend_note scope, tool-specific preference injection via getToolsForChannel(). Added tools.ts and core.ts to references.
- 2026-03-03 14:00 Fixed after happy-path walkthrough: system prompt instructions must be first person (agent's inner voice).
- 2026-03-03 14:20 Fourth revision after unhappy-path walkthrough (CLI garbage name): (1) resolveIdentity() must never overwrite displayName on existing records — only save_friend_note can change it. (2) save_friend_note redesigned as universal friend-knowledge tool with type parameter (name, tool_preference, note), conflict-aware updates (return existing + ask to merge), and override flag. (3) FriendRecord gains notes field — structural separation of toolPreferences (→ tool descriptions) vs notes (→ system prompt) eliminates dedup filtering entirely.
- 2026-03-03 14:45 Fifth revision addressing review feedback: (1) Name quality: eliminated code heuristics entirely — model-judged via soft first-person instruction, always present. (2) Authority: explicitly out of scope — tool availability is via `tools` API param, OAuth is on-demand. (3) Clarified getToolsForChannel injects into `tools` API param, not system prompt. (4) Eliminated all in-memory mutation — per-turn disk refresh instead. save_friend_note writes to disk, next turn re-reads. Store is single source of truth. Simpler, no staleness concerns.
- 2026-03-03 15:00 Sixth revision: (1) AuthorityChecker moved from out-of-scope to in-scope removal — dead weight, we're already touching every file it lives in. Remove interface, checker field, resolver logic, prompt rendering, authority.ts, and tests. (2) Tools-in-session-file noted as deferred nice-to-have for debugging/recall.
