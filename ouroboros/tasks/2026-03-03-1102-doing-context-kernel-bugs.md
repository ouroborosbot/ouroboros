# Doing: Context Kernel Wiring Bugs + Friend Storage Redesign

**Status**: drafting
**Execution Mode**: direct
**Created**: 2026-03-03 14:34
**Planning**: ./2026-03-03-1102-planning-context-kernel-bugs.md
**Artifacts**: ./2026-03-03-1102-doing-context-kernel-bugs/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## Objective
Fix two wiring bugs preventing the context kernel from functioning (AAD field extraction, system prompt injection), redesign friend storage (merge types, PII-aware split), redesign `save_friend_note` as the universal friend-knowledge tool with conflict-aware updates, and make the agent actually use its memory system -- ephemerality awareness in the system prompt and preference injection into tool descriptions.

## Completion Criteria
- [ ] Teams handler extracts AAD fields from activity and populates `TeamsMessageContext`
- [ ] Context resolver guard (`teamsContext?.aadObjectId`) succeeds when AAD identity is present
- [ ] Resolved context is included in the system prompt for both Teams and CLI channels
- [ ] System prompt includes name-quality instruction (first person, model-judged -- no code heuristics)
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
- [ ] `save_friend_note` writes to disk only -- no in-memory mutation
- [ ] `ToolContext` type updated (`memoryStore` -> `friendStore`)
- [ ] `ContextResolver` renamed to `FriendResolver` (file: `resolver.ts` -> `resolver.ts`, class rename)
- [ ] `FriendResolver` works with `FriendStore` and merged `FriendRecord`
- [ ] First-encounter creation flow: `findByExternalId()` returns null -> creates new `FriendRecord` with system-provided name, empty notes/preferences -> returns newly created record
- [ ] System prompt includes new-friend behavior instruction (first person) when `notes` and `toolPreferences` are both empty
- [ ] `AuthorityChecker` removed: interface, `checker?` field on `ResolvedContext`, resolver logic, prompt rendering, and tests
- [ ] `getToolsForChannel()` accepts `toolPreferences` and injects matching preferences into tool `function.description` (in `tools` API param, not system prompt)
- [ ] `toolPreferences` entries appear in tool descriptions only (not system prompt)
- [ ] `notes` entries appear in system prompt only (not tool descriptions)
- [ ] `save_friend_note` tool description includes first-person `override` guidance (replace/correct = override, new/check = omit)
- [ ] System prompt includes working-memory trust instruction (conversation is source of truth, notes are journal for future me)
- [ ] System prompt includes stale notes awareness instruction (check related notes when learning something that might invalidate them)
- [ ] CLI external ID uses `username@hostname` format with provider `"local"`
- [ ] System prompt includes priority guidance (friend's request first, social niceties second) when friend context is present
- [ ] Missing `aadObjectId` handled gracefully: falls back to `teams-conversation` provider with conversation ID as external ID
- [ ] No empty `externalIds` arrays -- resolver always has an external ID to search for
- [ ] `FileFriendStore` auto-creates directories on construction (`mkdirSync recursive`)
- [ ] `sessionPath()` auto-creates parent directories before returning path
- [ ] `save_friend_note` validates required parameters and returns first-person error messages on failure
- [ ] `src/mind/context/` renamed to `src/mind/friends/`, all import paths updated
- [ ] Session path restructured: `~/.agentconfigs/{agentName}/sessions/{friendUuid}/{channel}/{sessionId}.json`
- [ ] `sessionPath()` accepts friend ID, callers pass it from resolved context
- [ ] CLI session path uses friend UUID from CLI identity resolution
- [ ] No migration of old sessions, no backwards compatibility
- [ ] Top-level README.md documents the friend storage split and session path structure
- [ ] 100% test coverage on all new and modified code
- [ ] All tests pass
- [ ] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## TDD Requirements
**Strict TDD -- no exceptions:**
1. **Tests first**: Write failing tests BEFORE any implementation
2. **Verify failure**: Run tests, confirm they FAIL (red)
3. **Minimal implementation**: Write just enough code to pass
4. **Verify pass**: Run tests, confirm they PASS (green)
5. **Refactor**: Clean up, keep tests green
6. **No skipping**: Never write implementation without failing test first

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

### ⬜ Unit 1a: FriendRecord type + FriendStore interface -- Tests
**What**: Write tests for the new `FriendRecord` type (shape validation, schema version), `IdentityProvider` update (add `"teams-conversation"` to the union), the new `FriendStore` interface (get, put, delete, findByExternalId method signatures), and the updated `ResolvedContext` (uses `friend: FriendRecord` instead of `identity` + `memory`, no `checker?` field). Remove `AuthorityChecker` interface, `FriendMemory` type, and old `ContextStore`/`CollectionStore` interfaces from types. Remove `authority.ts` and its tests.
**Files**: `src/__tests__/mind/context/types.test.ts`, `src/__tests__/mind/context/store.test.ts`, `src/__tests__/mind/context/authority.test.ts` (delete)
**Acceptance**: Tests exist and FAIL (red) because `FriendRecord`, `FriendStore`, updated `ResolvedContext` don't exist yet. Authority test file deleted.

### ⬜ Unit 1b: FriendRecord type + FriendStore interface -- Implementation
**What**: Implement `FriendRecord` type in `types.ts`, `FriendStore` interface in `store.ts`. Update `ResolvedContext` to `{ friend: FriendRecord, channel: ChannelCapabilities }`. Add `"teams-conversation"` to the `IdentityProvider` union. Remove `AuthorityChecker` interface, `FriendMemory` type, `CollectionStore<T>`, and `ContextStore`. Delete `authority.ts`.
**Files**: `src/mind/context/types.ts`, `src/mind/context/store.ts`, `src/mind/context/authority.ts` (delete)
**Acceptance**: All type/store tests PASS (green), no warnings.

### ⬜ Unit 1c: FriendRecord type + FriendStore interface -- Coverage & Refactor
**What**: Verify 100% coverage on new types and store interface. Refactor if needed.
**Acceptance**: 100% coverage on new code, tests still green.

### ⬜ Unit 2a: FileFriendStore (two-backend split) -- Tests
**What**: Write tests for `FileFriendStore` with two-backend split (agent knowledge path + PII bridge path). Test: constructor auto-creates directories, `get()` merges data from both backends, `put()` splits record across both (agent knowledge gets id/displayName/toolPreferences/notes/createdAt/updatedAt/schemaVersion; PII bridge gets id/externalIds/tenantMemberships/schemaVersion), `delete()` removes from both, `findByExternalId()` scans PII bridge then merges with agent knowledge. Edge cases: missing files return null, corrupted JSON returns null, empty directory returns null from findByExternalId, schema migration.
**Files**: `src/__tests__/mind/context/store-file.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `FileFriendStore` doesn't exist yet.

### ⬜ Unit 2b: FileFriendStore (two-backend split) -- Implementation
**What**: Implement `FileFriendStore` class in `store-file.ts`. Constructor takes two paths (agentKnowledgePath, piiBridgePath) and calls `mkdirSync(path, { recursive: true })` for both. `get(id)` reads both JSON files and merges. `put(id, record)` splits the `FriendRecord` and writes to both locations. `delete(id)` removes from both. `findByExternalId(provider, externalId, tenantId?)` scans PII bridge directory for matching external ID, then reads agent knowledge and merges. Remove old `FileContextStore` and `FileCollectionStore`.
**Files**: `src/mind/context/store-file.ts`
**Acceptance**: All store-file tests PASS (green), no warnings.

### ⬜ Unit 2c: FileFriendStore -- Coverage & Refactor
**What**: Verify 100% coverage on FileFriendStore. Test all error paths.
**Acceptance**: 100% coverage on new code, tests still green.

### ⬜ Unit 3a: FriendResolver (replaces ContextResolver) -- Tests
**What**: Write tests for `FriendResolver` (renamed from `ContextResolver`). Test: constructor takes `FriendStore` + params, `resolve()` calls `store.findByExternalId()`, first-encounter flow (findByExternalId returns null -> creates new FriendRecord with UUID, system displayName, empty notes/toolPreferences, saves via store.put, returns record), returning friend flow (findByExternalId returns existing -> does NOT overwrite displayName), channel capabilities lookup, no authority checker creation, result shape is `{ friend: FriendRecord, channel: ChannelCapabilities }`. Test Teams-conversation fallback provider.
**Files**: `src/__tests__/mind/context/resolver.test.ts`
**Acceptance**: Tests exist and FAIL (red) because `FriendResolver` doesn't exist yet.

### ⬜ Unit 3b: FriendResolver -- Implementation
**What**: Implement `FriendResolver` class in `resolver.ts`. Constructor takes `FriendStore` + `FriendResolverParams`. `resolve()` uses `store.findByExternalId()`, creates new `FriendRecord` on first encounter, returns `{ friend, channel }`. Remove `resolveIdentity()` import and `resolveMemory()` import. Delete `memory.ts` and `identity.ts` (logic moves into resolver). Update `FriendResolverParams` to accept provider (including `"teams-conversation"`), externalId, tenantId, displayName, channel.
**Files**: `src/mind/context/resolver.ts`, `src/mind/context/identity.ts` (delete), `src/mind/context/memory.ts` (delete), `src/__tests__/mind/context/identity.test.ts` (delete), `src/__tests__/mind/context/memory.test.ts` (delete)
**Acceptance**: All resolver tests PASS (green), no warnings.

### ⬜ Unit 3c: FriendResolver -- Coverage & Refactor
**What**: Verify 100% coverage on FriendResolver. Test all branches.
**Acceptance**: 100% coverage on new code, tests still green.

### ⬜ Unit 4a: Directory rename context -> friends -- Tests
**What**: Rename `src/mind/context/` to `src/mind/friends/` and `src/__tests__/mind/context/` to `src/__tests__/mind/friends/`. Update ALL import paths across the entire codebase that reference `mind/context/` to `mind/friends/`.
**Files**: All files importing from `mind/context/`
**Acceptance**: `tsc --noEmit` passes, all existing tests pass with new paths.

### ⬜ Unit 4b: Directory rename -- Verification
**What**: Run full test suite to verify no broken imports. Grep for any remaining `mind/context` references (excluding planning/doing docs and node_modules).
**Acceptance**: Zero references to `mind/context` in source code, all tests pass.

### ⬜ Unit 5a: save_friend_note redesign -- Tests
**What**: Write tests for redesigned `save_friend_note` tool in `tools-base.ts`. Test: new parameters (`type`, `key`, `content`, `override`), validation (missing content returns first-person error, missing key for tool_preference/note returns first-person error, invalid type returns first-person error), `type: "name"` updates displayName and notes["name"], `type: "tool_preference"` with conflict detection (existing value + no override = returns existing + merge instruction, with override = overwrites), `type: "note"` with same conflict behavior, writes to disk via `friendStore.put()`, no in-memory mutation, updated tool description with first-person override guidance. Test the broadened description text.
**Files**: `src/__tests__/repertoire/tools.test.ts`
**Acceptance**: Tests exist and FAIL (red) because old save_friend_note exists.

### ⬜ Unit 5b: save_friend_note redesign -- Implementation
**What**: Rewrite `save_friend_note` tool definition in `tools-base.ts`. New parameters: `type` (name/tool_preference/note), `key` (required for tool_preference and note), `content` (always required), `override` (boolean, default false). Handler reads from `ctx.friendStore.get()`, applies type-specific logic, writes via `ctx.friendStore.put()`. Update `ToolContext` type: replace `memoryStore: CollectionStore<FriendMemory>` with `friendStore: FriendStore`. Update tool description to first-person, covering all three types and override guidance.
**Files**: `src/repertoire/tools-base.ts`
**Acceptance**: All save_friend_note tests PASS (green), no warnings.

### ⬜ Unit 5c: save_friend_note -- Coverage & Refactor
**What**: Verify 100% coverage on save_friend_note handler and validation paths.
**Acceptance**: 100% coverage on new code, tests still green.

### ⬜ Unit 6a: Preference injection into tool descriptions -- Tests
**What**: Write tests for `getToolsForChannel()` accepting `toolPreferences?: Record<string, string>` and injecting matching preferences into tool descriptions. Test: no preferences = descriptions unchanged, preference key "ado" appends to all tools with `integration: "ado"`, preference key "graph" appends to `integration: "graph"` tools, unknown preference key is ignored, multiple preferences applied independently, descriptions rebuilt each call (no caching mutation).
**Files**: `src/__tests__/repertoire/tools.test.ts`
**Acceptance**: Tests exist and FAIL (red) because getToolsForChannel doesn't accept preferences yet.

### ⬜ Unit 6b: Preference injection -- Implementation
**What**: Update `getToolsForChannel()` in `tools.ts` to accept optional `toolPreferences` parameter. For each preference key, find tools whose `integration` field matches, and append the preference text to `function.description`. Return new tool objects (don't mutate originals).
**Files**: `src/repertoire/tools.ts`
**Acceptance**: All preference injection tests PASS (green), no warnings.

### ⬜ Unit 6c: Preference injection -- Coverage & Refactor
**What**: Verify 100% coverage on getToolsForChannel preference injection.
**Acceptance**: 100% coverage on new code, tests still green.

### ⬜ Unit 7a: System prompt contextSection redesign -- Tests
**What**: Write tests for updated `contextSection()` in `prompt.ts`. Test: no context = empty string, context with friend renders `friend: displayName`, authority section removed entirely, notes rendered in system prompt (first person), toolPreferences NOT rendered in system prompt, memory ephemerality instruction present when friend context exists, name-quality instruction present with displayName, new-friend instruction present when notes and toolPreferences both empty, new-friend instruction absent when any note or preference exists, priority guidance present, working-memory trust instruction present, stale notes awareness instruction present. Test `buildSystem()` passes context through.
**Files**: `src/__tests__/mind/prompt.test.ts`
**Acceptance**: Tests exist and FAIL (red) because contextSection still uses old identity/memory structure.

### ⬜ Unit 7b: System prompt contextSection -- Implementation
**What**: Rewrite `contextSection()` in `prompt.ts` to use `context.friend` instead of `context.identity` + `context.memory`. Remove authority section. Add first-person instructions: memory ephemerality, name quality, priority guidance, working-memory trust, stale notes awareness, new-friend behavior (when notes and toolPreferences both empty). Render `friend.notes` entries in system prompt. Do NOT render `friend.toolPreferences` (those go to tool descriptions only).
**Files**: `src/mind/prompt.ts`
**Acceptance**: All prompt tests PASS (green), no warnings.

### ⬜ Unit 7c: System prompt contextSection -- Coverage & Refactor
**What**: Verify 100% coverage on contextSection. Test all instruction branches.
**Acceptance**: 100% coverage on new code, tests still green.

### ⬜ Unit 8a: Session path restructuring -- Tests
**What**: Write tests for updated `sessionPath()` in `config.ts`. Test: new signature `sessionPath(friendId, channel, key)`, returns path `~/.agentconfigs/{agentName}/sessions/{friendId}/{channel}/{key}.json`, auto-creates parent directories, `getSessionDir()` removed or simplified.
**Files**: `src/__tests__/config.test.ts`
**Acceptance**: Tests exist and FAIL (red) because sessionPath has old 2-arg signature.

### ⬜ Unit 8b: Session path restructuring -- Implementation
**What**: Update `sessionPath()` in `config.ts` to accept `(friendId: string, channel: string, key: string)`. Path becomes `~/.agentconfigs/{agentName}/sessions/{friendId}/{channel}/{sanitizeKey(key)}.json`. Add `mkdirSync(dirname, { recursive: true })` to ensure parent directories exist. Update or remove `getSessionDir()`.
**Files**: `src/config.ts`
**Acceptance**: All session path tests PASS (green), no warnings.

### ⬜ Unit 8c: Session path -- Coverage & Refactor
**What**: Verify 100% coverage on sessionPath.
**Acceptance**: 100% coverage on new code, tests still green.

### ⬜ Unit 9a: Teams adapter wiring -- Tests
**What**: Write tests for Teams adapter changes in `teams.ts`. Test: (1) Bug 1 fix: `app.on("message")` handler populates `teamsContext.aadObjectId`, `teamsContext.tenantId`, `teamsContext.displayName` from activity. (2) Bug 2 fix: `handleTeamsMessage()` passes resolved context to `buildSystem()` (system prompt rebuilt each turn with context). (3) `handleTeamsMessage()` creates `FileFriendStore` with two paths. (4) Resolver called with aadObjectId or falls back to `teams-conversation` provider with conversationId. (5) `toolContext.friendStore` set instead of `toolContext.memoryStore`. (6) Session path uses friend UUID. (7) Friend record re-read from disk each turn (toolContext updated before runAgent).
**Files**: `src/__tests__/senses/teams.test.ts`
**Acceptance**: Tests exist and FAIL (red) because teams.ts still uses old wiring.

### ⬜ Unit 9b: Teams adapter wiring -- Implementation
**What**: Update `teams.ts`: (1) In `app.on("message")`, extract `activity.from.aadObjectId`, `activity.conversation.tenantId`, `activity.from.name` into `teamsContext`. (2) In `handleTeamsMessage()`, create `FileFriendStore` with agentKnowledgePath (`getAgentRoot()/friends`) and piiBridgePath (`~/.agentconfigs/{agentName}/friends`). (3) Create `FriendResolver` with aadObjectId or fallback to conversation ID. (4) Pass resolved context to buildSystem (rebuild each turn). (5) Set `toolContext.friendStore`. (6) Use friend UUID for session path. (7) Replace `FileContextStore`/`ContextResolver` imports with `FileFriendStore`/`FriendResolver`.
**Files**: `src/senses/teams.ts`
**Acceptance**: All Teams tests PASS (green), no warnings.

### ⬜ Unit 9c: Teams adapter -- Coverage & Refactor
**What**: Verify 100% coverage on Teams adapter changes.
**Acceptance**: 100% coverage on new code, tests still green.

### ⬜ Unit 10a: CLI adapter wiring -- Tests
**What**: Write tests for CLI adapter changes in `cli.ts`. Test: (1) Bug 2 fix: buildSystem called with resolved context. (2) `FileFriendStore` created with two paths. (3) CLI external ID format: `username@hostname` with provider `"local"`. (4) `toolContext.friendStore` set. (5) Session path uses friend UUID from resolved context. (6) Friend record re-read from disk each turn.
**Files**: `src/__tests__/senses/cli.test.ts`
**Acceptance**: Tests exist and FAIL (red) because cli.ts still uses old wiring.

### ⬜ Unit 10b: CLI adapter wiring -- Implementation
**What**: Update `cli.ts`: (1) Create `FileFriendStore` with agentKnowledgePath (`getAgentRoot()/friends`) and piiBridgePath (`~/.agentconfigs/{agentName}/friends`). (2) CLI external ID: `${os.userInfo().username}@${os.hostname()}` with provider `"local"`, displayName = `os.userInfo().username`. (3) Create `FriendResolver` and resolve. (4) Pass resolved context to buildSystem. (5) Set `toolContext.friendStore`. (6) Session path: `sessionPath(friend.id, "cli", "session")`. (7) Replace old imports.
**Files**: `src/senses/cli.ts`
**Acceptance**: All CLI tests PASS (green), no warnings.

### ⬜ Unit 10c: CLI adapter -- Coverage & Refactor
**What**: Verify 100% coverage on CLI adapter changes.
**Acceptance**: 100% coverage on new code, tests still green.

### ⬜ Unit 11a: Agent loop per-turn refresh -- Tests
**What**: Write tests for `core.ts` changes. Test: (1) `runAgent()` re-reads friend record from disk each turn via `store.get(friendId)`. (2) System prompt rebuilt with fresh context each turn (buildSystem called with context). (3) `getToolsForChannel()` called with `friend.toolPreferences`. (4) `toolContext` properly typed with `friendStore` instead of `memoryStore`.
**Files**: `src/__tests__/heart/core.test.ts`
**Acceptance**: Tests exist and FAIL (red) because core.ts doesn't do per-turn refresh yet.

### ⬜ Unit 11b: Agent loop per-turn refresh -- Implementation
**What**: Update `runAgent()` in `core.ts`: (1) At start of each iteration, if `options?.toolContext?.friendStore` and `options?.toolContext?.context?.friend?.id` exist, re-read the friend record from disk via `friendStore.get(friendId)`. (2) Rebuild system prompt with `buildSystem(channel, options, updatedContext)` using the fresh friend record. (3) Pass `friend.toolPreferences` to `getToolsForChannel()` for preference injection. (4) Update the ToolContext re-export to use new type.
**Files**: `src/heart/core.ts`
**Acceptance**: All core tests PASS (green), no warnings.

### ⬜ Unit 11c: Agent loop -- Coverage & Refactor
**What**: Verify 100% coverage on core.ts changes.
**Acceptance**: 100% coverage on new code, tests still green.

### ⬜ Unit 12: Documentation + Final Verification
**What**: (1) Update top-level README.md to document the friend storage split (agent knowledge vs PII bridge, what lives where and why) and the session path structure. (2) Run full test suite. (3) Run coverage report and verify 100% on all new/modified code. (4) Check for any remaining references to old type names (FriendIdentity, FriendMemory, ContextStore, FileContextStore, ContextResolver, CollectionStore, AuthorityChecker) in source code. (5) Check for any stale imports from deleted files (authority.ts, memory.ts, identity.ts).
**Output**: README.md updated, full test suite green, 100% coverage, zero stale references.
**Acceptance**: All completion criteria checked off, all tests pass, no warnings, no stale references.

## Execution
- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (Xa, Xb, Xc)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: Save outputs, logs, data to `./2026-03-03-1102-doing-context-kernel-bugs/` directory
- **Fixes/blockers**: Spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: Update docs immediately, commit right away

## Progress Log
- 2026-03-03 14:34 Created from planning doc
