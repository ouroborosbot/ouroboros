# Doing: Context Kernel -- Structured Friend Context System

**Status**: READY_FOR_EXECUTION
**Execution Mode**: direct
**Created**: 2026-03-02 2302
**Planning**: ./2026-03-02-1716-planning-context-kernel.md
**Artifacts**: ./2026-03-02-1716-doing-context-kernel/

## Execution Mode

- **pending**: Awaiting user approval before each unit starts (interactive)
- **spawn**: Spawn sub-agent for each unit (parallel/autonomous)
- **direct**: Execute units sequentially in current session (default)

## What This Ships

**Phase 1 (10 units)** — The foundation. Restructure the codebase into the agent-creature metaphor (heart/mind/repertoire/senses), then build the context kernel's storage layer (`ContextStore` → `FileContextStore` → JSON files), identity resolution (UUID ↔ external ID mapping, get-or-create), channel capabilities (hardcoded map driving tool routing), a per-request resolver that builds `ResolvedContext`, and system prompt injection. Then prove it works end-to-end: refactor all tools into `ToolDefinition` wrappers, add ADO scope discovery via real APIs, and wire both channel adapters (Teams + CLI) through the kernel. By the end of Phase 1, the agent knows *who* it's talking to and *what the channel can do*.

**Phase 2 (4 units)** — Authority. The agent learns *what the friend can do*. Hybrid model: optimistic reads (try it, learn from 403), pre-flight writes (probe Security Namespaces API before proposing mutations). Per-turn checker, no cache. Wire it into `ado_mutate` so denied writes get explained, not attempted. Render "can / CANNOT" constraints into the system prompt so the model plans around limitations.

**Phase 3 (7 units)** — Semantic tools + memory. The agent gets *smart ADO operations* (`ado_backlog_list`, `ado_create_epic`, `ado_move_items`, batch operations, dry-run previews, channel-aware formatting) and *learns about friends* (freeform `FriendMemory` with `toolPreferences` rendered in the system prompt, `save_friend_note` tool for the model to persist what it learns).

**Phase 4 (3 units)** — Intelligence. Process template awareness (Basic/Agile/Scrum hierarchy rules), authority-aware planning (adapt plans when friend lacks permissions), structural safety tools (detect orphans, cycles, invalid parent/child types).

**The arc:** Bot that calls APIs → agent that knows who you are, what you can do, what you prefer, and what the channel supports — then reasons within those constraints before acting.

## Objective
Build a four-layer Context Kernel (Identity, Authority, Memory, Channel) that transforms the ouroboros agent from a bot that calls REST APIs into a constraint-aware reasoning engine operating within identity, authority, and channel boundaries.

**Core design principles:**
- **No caching anywhere.** APIs are the source of truth. Authority is learned fresh each turn. ADO scopes are discovered at runtime. Process templates are fetched when needed. The conversation carries all learned state forward. Don't persist what you can re-derive.
- **Typed, not stringly.** `IdentityProvider` and `Integration` are closed union types. `ToolDefinition` wraps each tool's OpenAI schema with co-located metadata. No bare strings in the type system.
- **Model-managed memory.** `FriendMemory` with freeform `toolPreferences: Record<string, string>` -- the model decides what to store about each friend, not a typed schema.
- **Conversation IS the session.** No separate session state layer. Tools are stateless; the model provides all required context on every call.
- **Consumer-driven phasing.** Each phase wires real operations through the kernel as layers are built -- not after. One doing doc, four phases, one marathon.

## Completion Criteria
- [ ] `ContextStore` interface defined with typed collection properties; Phase 1: `identity` only; Phase 3 adds `memory`. Each `CollectionStore<T>` provides `get`/`put`/`delete`/`find`; `FileContextStore` implements it
- [ ] No context module imports `fs` directly -- all persistence goes through `ContextStore`
- [ ] All four context layers (Identity, Authority, Memory, Channel) have TypeScript types and resolution functions (phased: Identity + Channel in Phase 1, Authority in Phase 2, Memory in Phase 3)
- [ ] `ContextResolver` resolves identity + channel eagerly in Phase 1; Phase 2 adds authority (eager-start Promise); Phase 3 adds memory
- [ ] Authority uses hybrid model: reads are optimistic (403 learning), writes have pre-flight check via Security Namespaces API
- [ ] Identity persists across sessions via `ContextStore`; Authority is learned fresh per-turn (checker on resolver, memoized within turn, discarded after); FriendMemory (toolPreferences) persists via `ContextStore` (Phase 3)
- [ ] ADO scope discovery works at runtime via Accounts API + Projects API; conversation carries results forward (no caching)
- [ ] Tools are stateless -- model provides all required context (org, project, IDs) on every call; no ambient session state
- [ ] ToolContext extension is backward-compatible -- existing tools work unchanged
- [ ] ADO tools use runtime scope discovery for org/project disambiguation instead of config allowlist
- [ ] At least 3 semantic ADO operations exist (create_epic, create_issue, move_items)
- [ ] Process template detection works for Basic, Agile, and Scrum
- [ ] Channel-aware formatting works for Teams and CLI
- [ ] Dry-run mode returns structured preview for ADO mutations
- [ ] Authority is scoped per-friend per-turn -- `AuthorityChecker` lives on the resolver (per-request), memoizes within the turn, discarded after. Conversation history carries authority knowledge across turns.
- [ ] System prompt includes resolved context (identity, channel, authority constraints) via `contextSection()` in `buildSystem()`
- [ ] Authority constraints rendered as explicit "can / CANNOT" in prompt so model plans around limitations
- [ ] Prompt injection gracefully omitted when no context is available (CLI with no identity, first turn)
- [ ] `FriendMemory` type exists with `toolPreferences: Record<string, string>`; `ContextStore.memory` collection supports CRUD (unit 3Ba); a `save_friend_note` tool lets the model persist preferences; `contextSection()` renders toolPreferences into the system prompt when FriendMemory exists (unit 3Bb)
- [ ] `buildSystem()` is async; all callers use `await buildSystem()`
- [ ] `IdentityProvider` and `Integration` are typed unions -- no bare `string` in ExternalId.provider, AuthorityProfile.integration, AuthorityChecker methods, or ChannelCapabilities.availableIntegrations
- [ ] All tools use `ToolDefinition` wrapper; `getToolsForChannel()` filters by `ToolDefinition.integration` against `availableIntegrations`; separate `confirmationRequired` Set is removed
- [ ] `validateAdoOrg()`, `adoOrganizations` on ToolContext, and `ado.organizations` config are removed -- replaced by runtime API discovery
- [ ] 100% test coverage on all new code
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

## Documentation Requirements
**MANDATORY: docs updated in every unit, not deferred.**
- Every unit that adds, moves, or renames files must update all documentation referencing those paths in the same unit
- Includes: CLAUDE.md, memory files, cross-agent docs, psyche docs, planning/doing docs, code comments
- No "update docs later" -- if a unit changes structure, the docs reflect it before the unit is marked complete

---

## Reference: TypeScript Schema

This schema is a design reference from the planning doc, not a literal spec. Use it as the starting point for type definitions — adapt signatures, field names, and structure as needed during implementation, as long as the design intent holds.

```typescript
// src/mind/context/store.ts

interface CollectionStore<T> {
  get(id: string): Promise<T | null>;
  put(id: string, value: T): Promise<void>;
  delete(id: string): Promise<void>;
  find(predicate: (value: T) => boolean): Promise<T | null>;
}

interface ContextStore {
  readonly identity: CollectionStore<FriendIdentity>;
  // Added in unit 3Ba (Phase 3):
  // readonly memory: CollectionStore<FriendMemory>;
}

// src/mind/context/store-file.ts

class FileContextStore implements ContextStore {
  readonly identity: CollectionStore<FriendIdentity>;   // -> context/identity/
  // Added in unit 3Ba (Phase 3):
  // readonly memory: CollectionStore<FriendMemory>;     // -> context/memory/
}

// src/mind/context/types.ts

type IdentityProvider = "aad" | "local";
type Integration = "ado" | "github" | "graph";

interface ExternalId {
  provider: IdentityProvider;
  externalId: string;
  tenantId?: string;
  linkedAt: string;   // ISO date
}

interface FriendIdentity {
  id: string;          // internal, stable, uuid
  displayName: string;
  externalIds: ExternalId[];
  tenantMemberships: string[];  // AAD tenant IDs
  createdAt: string;   // ISO date
  updatedAt: string;
  schemaVersion: number;
}

interface AuthorityCapability {
  action: string;
  allowed: boolean;
  scopeLimit?: string;
  learnedFrom?: "probe" | "403";
}

interface AuthorityProfile {
  integration: Integration;
  scope: string;           // org/project
  capabilities: AuthorityCapability[];
}

interface AuthorityChecker {
  canRead(integration: Integration, scope: string): boolean;
  canWrite(integration: Integration, scope: string, action: string): Promise<boolean>;
  record403(integration: Integration, scope: string, action: string): void;
}

interface FriendMemory {
  id: string;  // matches FriendIdentity.id
  toolPreferences: Record<string, string>;
  schemaVersion: number;
}

interface ChannelCapabilities {
  channel: "cli" | "teams";
  availableIntegrations: Integration[];
  supportsMarkdown: boolean;
  supportsStreaming: boolean;
  supportsRichCards: boolean;
  maxMessageLength: number;
}

interface ResolvedContext {
  readonly identity: FriendIdentity;
  readonly channel: ChannelCapabilities;
  // Added in unit 2A (Phase 2):
  // readonly authority: Promise<AuthorityProfile[]>;
  // readonly checker: AuthorityChecker;
  // Added in unit 3Ba (Phase 3):
  // readonly memory: FriendMemory | null;
}

interface ToolDefinition {
  tool: OpenAI.ChatCompletionTool;
  handler: ToolHandler;
  integration?: Integration;
  confirmationRequired?: boolean;
}
```

## Reference: Codebase Architecture (post-unit 10)

**NOTE:** These paths reflect the codebase AFTER unit 10 (directory restructuring). Before unit 10, the current paths are `src/engine/` (not `src/heart/`), `src/channels/` (not `src/senses/`), and tool files live in `src/engine/` (not `src/repertoire/`).

- **Entry points**: `src/cli-entry.ts`, `src/teams-entry.ts`
- **Heart** (core loop): `src/heart/core.ts` -- `runAgent()` loop, provider selection, streaming, tool execution; `src/heart/api-error.ts` -- API error handling
- **Mind** (reasoning): `src/mind/prompt.ts` -- `buildSystem()` assembles system prompt; `src/mind/context.ts` -- `saveSession()`, `loadSession()`, `postTurn()`, `trimMessages()`
- **Repertoire** (capabilities): `src/repertoire/tools-base.ts` (base tools), `src/repertoire/tools-teams.ts` (Teams-only tools), `src/repertoire/tools.ts` (channel-aware tool list)
- **ADO client**: `src/repertoire/ado-client.ts`
- **Graph client**: `src/repertoire/graph-client.ts`
- **Senses** (channels): `src/senses/cli.ts`, `src/senses/teams.ts`
- **Identity**: `src/identity.ts` -- agent identity, NOT friend identity
- **Config**: `src/config.ts`

**Context kernel files** (created by this task):
- `src/mind/context/types.ts` -- all layer type definitions
- `src/mind/context/store.ts` -- `CollectionStore<T>` and `ContextStore` interfaces
- `src/mind/context/store-file.ts` -- `FileContextStore` adapter
- `src/mind/context/identity.ts` -- FriendIdentity resolution
- `src/mind/context/authority.ts` -- Authority resolution and AuthorityChecker (Phase 2)
- `src/mind/context/memory.ts` -- FriendMemory resolution (Phase 3)
- `src/mind/context/channel.ts` -- ChannelCapabilities lookup
- `src/mind/context/resolver.ts` -- ContextResolver

**Semantic tool files** (created in Phase 3-4):
- `src/repertoire/ado-semantic.ts` -- semantic ADO tools
- `src/repertoire/ado-templates.ts` -- process template detection

**Test files** (mirror structure):
- `src/__tests__/mind/context/` -- tests for all context modules
- `src/__tests__/repertoire/ado-semantic.test.ts` -- tests for semantic ADO tools

**Note**: `src/mind/` already contains `prompt.ts` and `context.ts` (session management). The new `context/` subdirectory is for the context kernel -- distinct from `context.ts`.

## Reference: Key Integration Points

1. **runAgent()** in `src/heart/core.ts` -- receives `channel` param and `ToolContext` via `RunAgentOptions.toolContext`. The resolver is already attached to `ToolContext.context` by the channel adapter. `runAgent()` does not create the resolver.
2. **handleTeamsMessage()** in `src/senses/teams.ts` -- builds `ToolContext` from OAuth tokens. Creates the `ContextResolver` with the AAD external ID from bot activity, attaches to `ToolContext.context`.
3. **CLI adapter** in `src/senses/cli.ts` -- currently does not build a `ToolContext`. Phase 1 adds a minimal `ToolContext` with `context` field (resolver using OS username as external ID). No tokens, no integrations.
4. **getToolsForChannel()** in `src/repertoire/tools.ts` -- refactored to accept `ChannelCapabilities` and filter `ToolDefinition[]` registry by matching `integration` against `availableIntegrations`.
5. **execTool()** in `src/repertoire/tools.ts` -- looks up `ToolDefinition` by name and calls its handler.
6. **sessionPath()** in `src/config.ts` -- `~/.agentconfigs/<agent>/sessions/<channel>/<key>.json`. Context storage follows a parallel pattern.
7. **confirmationRequired** -- absorbed into `ToolDefinition.confirmationRequired`. The separate `Set<string>` is removed.

## Reference: ADO API Patterns

- WIQL queries for work item search
- Batch work item fetch by IDs
- JSON Patch for work item mutations (content-type: `application/json-patch+json`)
- Organization scoping: `https://dev.azure.com/{org}/...`
- API version: 7.1
- **Org discovery**: `GET https://app.vssps.visualstudio.com/_apis/accounts?memberId={id}&api-version=7.1`
- **Project discovery**: `GET https://dev.azure.com/{org}/_apis/projects?api-version=7.1`
- **Process template API**: `GET /{org}/{project}/_apis/work/processes`
- **Work item types API**: `GET /{org}/{project}/_apis/wit/workitemtypes`
- **Security Namespaces API**: `GET /{org}/_apis/security/namespaces`

## Reference: Error Handling Strategy (per-layer)

- **Identity**: on `ContextStore` read failure, auto-create fresh identity with defaults. On write failure, log and continue.
- **Authority**: on error (API timeout, unreachable endpoint), assume optimistic -- no constraints in prompt. 403 learning kicks in at tool time.
- **Memory** (Phase 3): on read failure or missing file, proceed with empty `toolPreferences`. No memory file created until model writes first note. On write failure, log and continue.
- **Channel**: pure lookup, no I/O, cannot fail. Unknown channel identifier gets minimal default capabilities.

## Reference: Schema Versioning

Every persisted type (`FriendIdentity`, `FriendMemory`) carries a `schemaVersion: number`. On read from `ContextStore`, if stored version is older than current, a migration function runs: adds new fields with defaults, removes deprecated fields, bumps version, writes migrated record back. Migrations are pure functions. Version 1 is the initial schema.

---

## Work Units

### Legend
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

---

## Phase 1: Identity + Channel + Storage Interface

---

### ✅ Unit 10: Directory Restructuring (Prerequisite)

**What**: Rename directories and move files to follow the agent-creature body metaphor (D19). This is a mechanical rename with NO behavior changes. All tests must pass identically before and after.

**Renames:**
- `src/engine/` -> `src/heart/` (keeps: `core.ts`, `streaming.ts`, `kicks.ts`, `api-error.ts`)
- `src/channels/` -> `src/senses/` (keeps: `cli.ts`, `teams.ts`)
- Tool files move from `src/engine/` -> `src/repertoire/` (moves: `tools.ts`, `tools-base.ts`, `tools-teams.ts`, `ado-client.ts`, `graph-client.ts`, `data/` directory with endpoint JSON files)
- NOTE: `src/repertoire/` already exists (contains `skills.ts`, `commands.ts`). Tool files are moved INTO the existing directory.

**Files that stay in their current locations (unchanged):**
- `src/identity.ts` -- agent identity (cross-cutting)
- `src/config.ts` -- configuration loading (cross-cutting)
- `src/cli-entry.ts`, `src/teams-entry.ts` -- entry points (top-level by convention)

**Input**: Current codebase with `src/engine/`, `src/channels/`, tool files in `src/engine/`
**Output**: Codebase with `src/heart/`, `src/senses/`, tool files in `src/repertoire/`. All imports updated. All tests green.

**Files touched:**
- Rename: `src/engine/core.ts` -> `src/heart/core.ts`
- Rename: `src/engine/streaming.ts` -> `src/heart/streaming.ts`
- Rename: `src/engine/kicks.ts` -> `src/heart/kicks.ts`
- Rename: `src/engine/api-error.ts` -> `src/heart/api-error.ts`
- Rename: `src/channels/cli.ts` -> `src/senses/cli.ts`
- Rename: `src/channels/teams.ts` -> `src/senses/teams.ts`
- Move: `src/engine/tools.ts` -> `src/repertoire/tools.ts`
- Move: `src/engine/tools-base.ts` -> `src/repertoire/tools-base.ts`
- Move: `src/engine/tools-teams.ts` -> `src/repertoire/tools-teams.ts`
- Move: `src/engine/ado-client.ts` -> `src/repertoire/ado-client.ts`
- Move: `src/engine/graph-client.ts` -> `src/repertoire/graph-client.ts`
- Move: `src/engine/data/` -> `src/repertoire/data/`
- Update: ALL imports across the codebase that reference old paths
- Rename: `src/__tests__/engine/core.test.ts` -> `src/__tests__/heart/core.test.ts`
- Rename: `src/__tests__/engine/streaming.test.ts` -> `src/__tests__/heart/streaming.test.ts`
- Rename: `src/__tests__/engine/kicks.test.ts` -> `src/__tests__/heart/kicks.test.ts`
- Rename: `src/__tests__/engine/api-error.test.ts` -> `src/__tests__/heart/api-error.test.ts`
- Move: `src/__tests__/engine/tools.test.ts` -> `src/__tests__/repertoire/tools.test.ts` (covers base, teams, and router tests)
- Move: `src/__tests__/engine/ado-client.test.ts` -> `src/__tests__/repertoire/ado-client.test.ts`
- Move: `src/__tests__/engine/graph-client.test.ts` -> `src/__tests__/repertoire/graph-client.test.ts`
- Rename: `src/__tests__/channels/` -> `src/__tests__/senses/` (cli.test.ts, cli-main.test.ts, cli-ux.test.ts, teams.test.ts)
- NOTE: after move, `src/__tests__/engine/` should be empty and deleted

**Tests required:**
- All existing tests pass with updated import paths (no new tests needed for a rename)
- `npx vitest run` green with zero failures

**Documentation updates:**
- Update CLAUDE.md with new directory structure
- Update memory files (`ouroboros/tasks/` memory, `.claude/` memory) with new paths
- Update any psyche docs referencing old paths
- Update this doing doc's reference section if any paths were wrong

**Completion criteria:**
- [ ] No file remains under `src/engine/` or `src/channels/`
- [ ] `src/repertoire/` exists and contains all tool files + data/
- [ ] `src/heart/` exists and contains core.ts, streaming.ts, kicks.ts, api-error.ts
- [ ] `src/senses/` exists and contains cli.ts, teams.ts
- [ ] All imports updated -- `grep -r "engine/" src/` and `grep -r "channels/" src/` return zero hits
- [ ] All tests pass: `npx vitest run`
- [ ] No warnings
- [ ] All documentation updated to reflect new paths

---

### ✅ Unit 1A: ContextStore Interface and CollectionStore

**What**: Define the `ContextStore` interface with typed `CollectionStore<T>` properties. Phase 1 starts with `identity: CollectionStore<FriendIdentity>` only. This is the storage abstraction that all context persistence goes through -- no context module ever imports `fs` directly.

**Design (D1):**
- `CollectionStore<T>` provides `get(id)`, `put(id, value)`, `delete(id)`, `find(predicate)`
- IDs are always plain strings (UUIDs) -- no slashes, no compound keys, no encoding
- `ContextStore` has typed collection properties: `identity: CollectionStore<FriendIdentity>`
- Adding a new persisted type = add one property to `ContextStore`
- Phase 3 (unit 3Ba) adds `memory: CollectionStore<FriendMemory>`

**Input**: Codebase after unit 10 restructuring. No context kernel files exist yet.
**Output**: `src/mind/context/store.ts` with `CollectionStore<T>` and `ContextStore` interfaces. `src/mind/context/types.ts` with `IdentityProvider`, `Integration`, `ExternalId`, `FriendIdentity`, `ChannelCapabilities`, `ResolvedContext` types.

**Files created:**
- `src/mind/context/store.ts` -- `CollectionStore<T>` interface, `ContextStore` interface
- `src/mind/context/types.ts` -- all type definitions (IdentityProvider, Integration, ExternalId, FriendIdentity, ChannelCapabilities, ResolvedContext)

**Files tested:**
- `src/__tests__/mind/context/store.test.ts` -- interface contract tests (via mock implementation)
- `src/__tests__/mind/context/types.test.ts` -- type guard tests, type assertion helpers

**Tests required:**
- `CollectionStore<T>` mock implementation: `get` returns null for missing, returns stored for present
- `CollectionStore<T>` mock: `put` then `get` returns the value
- `CollectionStore<T>` mock: `delete` then `get` returns null
- `CollectionStore<T>` mock: `find` with matching predicate returns item
- `CollectionStore<T>` mock: `find` with no match returns null
- Type guard tests for `IdentityProvider`, `Integration` (valid values accepted, invalid rejected)
- `FriendIdentity` construction with all required fields
- `ExternalId` construction with and without optional `tenantId`

**Completion criteria:**
- [ ] `CollectionStore<T>` interface exported from `src/mind/context/store.ts`
- [ ] `ContextStore` interface with `readonly identity: CollectionStore<FriendIdentity>` exported
- [ ] All types from schema exported from `src/mind/context/types.ts`
- [ ] `IdentityProvider` and `Integration` are typed unions (not bare strings)
- [ ] 100% test coverage
- [ ] All tests pass

---

### ✅ Unit 1B: FileContextStore Implementation

**What**: Implement `FileContextStore` as the first (and initially only) adapter for `ContextStore`. Constructor takes a base path (e.g., `~/.agentconfigs/ouroboros/context`); it does not resolve the path itself. Each collection maps to a subdirectory, each item to a JSON file.

**Design (D1, D13, D17):**
- `FileContextStore` implements `ContextStore`
- Constructor takes `basePath: string` -- no internal path resolution
- Phase 1: `context/identity/` subdirectory, each item = `{uuid}.json`
- `FileCollectionStore<T>` handles the per-collection directory and JSON serialization
- `find(predicate)` scans all files in the collection directory
- Schema versioning: on read, check `schemaVersion` and run migration if needed (D17)
- This is the ONLY module that imports `fs` for context data

**Input**: `ContextStore` interface from unit 1A.
**Output**: Working `FileContextStore` that reads/writes JSON files. Tested with real filesystem operations (using temp directories).

**Files created:**
- `src/mind/context/store-file.ts` -- `FileCollectionStore<T>` class, `FileContextStore` class

**Files tested:**
- `src/__tests__/mind/context/store-file.test.ts`

**Tests required:**
- `FileContextStore` creates collection subdirectories on first write
- `get` returns null for non-existent ID
- `put` writes JSON file, `get` reads it back correctly
- `put` overwrites existing file
- `delete` removes the file, subsequent `get` returns null
- `delete` on non-existent ID does not throw
- `find` with matching predicate returns the item
- `find` with no match returns null
- `find` with empty collection returns null
- Schema version migration: stored v1 record, current code expects v2 -- migration runs, migrated data returned, file updated
- File permission errors: read failure returns null (or throws with clear message)
- Concurrent access: two puts to different IDs do not corrupt each other
- JSON parsing error: corrupted file returns null (logged, not thrown)
- Base path directory created if it does not exist

**Completion criteria:**
- [ ] `FileContextStore` implements `ContextStore`
- [ ] Only module that imports `fs` or `fs/promises` for context data
- [ ] All CRUD operations work correctly
- [ ] `find(predicate)` scans files and returns first match
- [ ] Schema versioning works (migration on read)
- [ ] Error handling: corrupted files, missing directories, permission errors
- [ ] 100% test coverage
- [ ] All tests pass

---

### ✅ Unit 1C: FriendIdentity Resolution

**What**: Implement identity resolution -- the "get-or-create" logic that maps a channel's external ID to an internal `FriendIdentity`. This is the only layer that truly needs persistence (UUID <-> external ID mapping can't be re-derived from an API).

**Design (D12, D14):**
- Always "get or create" -- auto-create with sensible defaults on first interaction
- Resolution: external ID -> `store.identity.find(predicate)` -> internal UUID
- Teams: AAD userId + tenantId from bot activity. Lookup by `{ provider: "aad", externalId, tenantId }`
- CLI: OS username. Lookup by `{ provider: "local", externalId: os.userInfo().username }`
- New identity: mint UUID, create `FriendIdentity` with external ID, persist via store
- Internal UUID is the ONLY primary key. No system ever uses external ID as primary key.
- Display name: from bot activity (Teams) or OS username (CLI)
- `schemaVersion: 1` for initial schema

**Input**: `ContextStore` with `identity` collection from units 1A/1B.
**Output**: `resolveIdentity()` function that takes external ID info and returns a `FriendIdentity` (existing or newly created).

**Files created:**
- `src/mind/context/identity.ts` -- `resolveIdentity()` function

**Files tested:**
- `src/__tests__/mind/context/identity.test.ts`

**Tests required:**
- First-time resolution: no existing identity -> creates new with UUID, external ID, display name
- Repeat resolution: existing identity found -> returns it unchanged
- Teams resolution: AAD provider, externalId, tenantId all set correctly
- CLI resolution: local provider, OS username as externalId, no tenantId
- Multiple external IDs: identity with two external IDs, found by either one
- Display name defaults: Teams uses provided name, CLI uses OS username
- `tenantMemberships` populated for AAD identities
- `createdAt` and `updatedAt` set correctly (ISO date strings)
- `schemaVersion` set to current version
- Store failure on read: auto-creates (D16 error handling)
- Store failure on write: logs and continues

**Completion criteria:**
- [ ] `resolveIdentity()` exported from `src/mind/context/identity.ts`
- [ ] Get-or-create works for both AAD and local providers
- [ ] Internal UUID is always the primary key
- [ ] External ID lookup uses `store.identity.find(predicate)`
- [ ] Error handling per D16
- [ ] 100% test coverage
- [ ] All tests pass

---

### ✅ Unit 1E: ChannelCapabilities Type and Lookup

**What**: Define `ChannelCapabilities` as a hardcoded `const` map in `channel.ts`, keyed by channel identifier. Channel adapters pass the channel string, the map returns the full capabilities object. Pure lookup, no resolution needed.

**Design (D3):**
- `ChannelCapabilities` includes: channel identifier, `availableIntegrations`, `supportsMarkdown`, `supportsStreaming`, `supportsRichCards`, `maxMessageLength`
- Hardcoded const map -- adding a new channel = add one entry
- CLI: `availableIntegrations = []` -- no OAuth, no tokens, no integration access
- Teams: `availableIntegrations = ["ado", "graph"]` -- OAuth-backed via Bot Service token store
- `availableIntegrations` drives tool routing (D3), prompt injection (D10), and resolver behavior (D6)

**Channel capability values:**
```
CLI:   { channel: "cli",   availableIntegrations: [],              supportsMarkdown: false, supportsStreaming: true,  supportsRichCards: false, maxMessageLength: Infinity }
Teams: { channel: "teams", availableIntegrations: ["ado", "graph"], supportsMarkdown: true,  supportsStreaming: false, supportsRichCards: true,  maxMessageLength: 4000 }
```

**Input**: Types from unit 1A.
**Output**: `getChannelCapabilities()` function and hardcoded capabilities map.

**Files created:**
- `src/mind/context/channel.ts` -- capabilities map, `getChannelCapabilities()` function

**Files tested:**
- `src/__tests__/mind/context/channel.test.ts`

**Tests required:**
- `getChannelCapabilities("cli")` returns CLI capabilities with empty integrations
- `getChannelCapabilities("teams")` returns Teams capabilities with `["ado", "graph"]`
- Unknown channel identifier returns minimal default capabilities
- All capability fields are present and correctly typed
- `availableIntegrations` contains only valid `Integration` values

**Completion criteria:**
- [ ] Hardcoded const map with CLI and Teams entries
- [ ] `getChannelCapabilities()` exported
- [ ] Unknown channel returns sensible defaults (D16)
- [ ] 100% test coverage
- [ ] All tests pass

---

### ✅ Unit 1F: ContextResolver -- Identity + Channel

**What**: Build the `ContextResolver` that resolves identity (from store) and channel (from lookup) into a `ResolvedContext` object. In Phase 1, all resolution is cheap -- no Promises needed yet. Phase 2 adds authority with explicit `Promise<T>` fields (eager-start, API call fires at resolver build time). Phase 3 adds memory.

**Design (D6, D13):**
- Created per-request (per-incoming-message), per-friend
- Takes: `ContextStore`, external ID info (provider, externalId, tenantId?), channel identifier, display name
- Resolves: identity via `resolveIdentity()`, channel via `getChannelCapabilities()`
- Returns: `ResolvedContext` with `identity` and `channel`
- Created by channel adapter, attached to `ToolContext.context`, discarded after turn
- Phase 2 (unit 2A) adds `authority: Promise<AuthorityProfile[]>` and `checker: AuthorityChecker`
- Phase 3 (unit 3Ba) adds `memory: FriendMemory | null`

**Input**: Identity resolution from 1C, channel lookup from 1E.
**Output**: `ContextResolver` class with `resolve()` method returning `ResolvedContext`.

**Files created:**
- `src/mind/context/resolver.ts` -- `ContextResolver` class

**Files tested:**
- `src/__tests__/mind/context/resolver.test.ts`

**Tests required:**
- Resolver creates `ResolvedContext` with identity and channel
- Resolver uses `resolveIdentity()` for identity
- Resolver uses `getChannelCapabilities()` for channel
- CLI resolution: local identity, CLI capabilities
- Teams resolution: AAD identity, Teams capabilities
- Error in identity resolution: handled per D16 (auto-create fallback)
- Unknown channel: handled per D16 (default capabilities)
- `ResolvedContext` is readonly (fields cannot be mutated)

**Completion criteria:**
- [ ] `ContextResolver` class exported from `src/mind/context/resolver.ts`
- [ ] `resolve()` method returns `ResolvedContext` with identity + channel
- [ ] Per-request lifecycle -- new resolver per incoming message
- [ ] Error handling per D16
- [ ] 100% test coverage
- [ ] All tests pass

---

### ✅ Unit 1G: System Prompt Injection -- buildSystem() Async + contextSection()

**What**: Make `buildSystem()` async from Phase 1 and add a `contextSection()` that renders identity + channel into the system prompt. Async from the start to avoid a mid-stream signature change when Phase 2 adds `await context.authority`. Remove `cachedBuildSystem()` and `resetSystemPromptCache()`.

**Design (D10, D15):**
- `buildSystem()` signature: `async buildSystem(channel, options?, context?)`
- When `context` is absent, context section is omitted (graceful degradation)
- `contextSection()` renders identity + channel:
  ```
  ## friend context
  friend: Jordan (jordan@contoso.com)
  channel: teams (markdown, no streaming, max 4000 chars)
  ```
- Phase 2 (unit 2D) adds authority constraints section
- Phase 3 (unit 3Bb) adds friend preferences section (toolPreferences from FriendMemory)
- `cachedBuildSystem()` is REMOVED (60s TTL cache is wrong with per-friend context)
- `resetSystemPromptCache()` is REMOVED
- All callers updated to `await buildSystem()`

**Input**: Existing `buildSystem()` in `src/mind/prompt.ts`. `ResolvedContext` from unit 1F.
**Output**: Async `buildSystem()` with optional `context` param. `contextSection()`. No cache.

**Files modified:**
- `src/mind/prompt.ts` -- make `buildSystem()` async, add `contextSection()`
- `src/mind/context.ts` -- remove `cachedBuildSystem()` and `resetSystemPromptCache()` (the cache lives here, not in prompt.ts)
- `src/heart/core.ts` -- replace `cachedBuildSystem(channel, buildSystem, options)` with `await buildSystem(channel, options, context)`
- `src/senses/cli.ts` -- replace `cachedBuildSystem("cli", buildSystem)` with `await buildSystem("cli", undefined, context)`
- `src/senses/teams.ts` -- replace `cachedBuildSystem("teams", buildSystem)` with `await buildSystem("teams", undefined, context)`

**Files tested:**
- `src/__tests__/mind/prompt.test.ts` -- updated tests for async + context injection
- `src/__tests__/mind/context.test.ts` -- remove/update `cachedBuildSystem` tests

**Tests required:**
- `buildSystem()` without context: returns prompt without context section (backward-compatible)
- `buildSystem()` with context: includes `## friend context` section with identity + channel
- Context section formats display name and channel correctly
- CLI context: no streaming mention, no max message length (or Infinity)
- Teams context: includes markdown, no streaming, max 4000 chars
- `cachedBuildSystem` no longer exists (import should fail)
- `resetSystemPromptCache` no longer exists
- All existing prompt tests still pass (async wrapper transparent)
- Graceful degradation: context is undefined -> section omitted

**Completion criteria:**
- [ ] `buildSystem()` is async with optional `context?: ResolvedContext` parameter
- [ ] `contextSection()` renders identity + channel when context is provided
- [ ] `cachedBuildSystem()` and `resetSystemPromptCache()` are removed
- [ ] All callers updated to `await buildSystem()`
- [ ] Backward-compatible: no context -> no section
- [ ] 100% test coverage on new/modified code
- [ ] All tests pass

---

### ✅ Unit 1Ha: ToolDefinition Wrapper + Tool Registry Refactor

**What**: Introduce the `ToolDefinition` wrapper type and convert all existing tools to use it. Refactor `getToolsForChannel()` and `execTool()` to use the new registry. Remove the separate `confirmationRequired` Set. Update `ToolContext` to add `context?: ResolvedContext` and remove `adoOrganizations`.

**Design (D3, D5):**
- `ToolDefinition` co-locates: OpenAI tool schema, handler, integration (optional), confirmationRequired (optional)
- All existing tools (base + Teams) converted to `ToolDefinition[]` array
- `getToolsForChannel()` refactored: accepts `ChannelCapabilities`, filters `ToolDefinition[]` by matching `integration` against `availableIntegrations`. Base tools (integration undefined) always included.
- `execTool()` refactored: looks up `ToolDefinition` by name, calls its handler
- `confirmationRequired` Set in `tools-teams.ts` removed -- absorbed into `ToolDefinition.confirmationRequired`
- `ToolContext` gains `context?: ResolvedContext` (optional, backward-compatible)
- `adoOrganizations` removed from `ToolContext`

**Input**: Existing tool arrays in `tools-base.ts`, `tools-teams.ts`, `tools.ts`. `ChannelCapabilities` from unit 1E.
**Output**: All tools registered as `ToolDefinition[]`. Routing by integration. ToolContext updated.

**Files modified:**
- `src/repertoire/tools-base.ts` -- add `ToolDefinition` interface, add `context?: ResolvedContext` to `ToolContext`, remove `adoOrganizations`, convert base tools to `ToolDefinition[]`
- `src/repertoire/tools-teams.ts` -- convert Teams tools to `ToolDefinition[]`, remove `confirmationRequired` Set
- `src/repertoire/tools.ts` -- refactor `getToolsForChannel()` to accept `ChannelCapabilities` and filter by integration, refactor `execTool()` to use `ToolDefinition` lookup

**Files tested:**
- `src/__tests__/repertoire/tools.test.ts` -- updated for `ToolDefinition`, new `getToolsForChannel`, `execTool`, new `ToolContext` shape (NOTE: this is one combined test file covering all tool concerns -- base, teams, and router)

**Tests required:**
- `ToolDefinition` wraps tool schema + handler + integration + confirmationRequired
- `getToolsForChannel()` with Teams capabilities: returns base + ado + graph tools
- `getToolsForChannel()` with CLI capabilities: returns base tools only
- `getToolsForChannel()` filters correctly by integration
- `execTool()` looks up handler from `ToolDefinition` and calls it
- `confirmationRequired` read from `ToolDefinition`, not a separate Set
- `ToolContext` has `context?: ResolvedContext` (optional)
- `adoOrganizations` not on `ToolContext`
- Backward compatibility: existing tool handlers still work with updated `ToolContext`

**Completion criteria:**
- [ ] `ToolDefinition` type exists with tool + handler + integration + confirmationRequired
- [ ] All tools registered as `ToolDefinition[]`
- [ ] `getToolsForChannel()` uses `ChannelCapabilities` + `ToolDefinition.integration`
- [ ] `confirmationRequired` Set removed
- [ ] `ToolContext` has `context?: ResolvedContext`, no `adoOrganizations`
- [ ] Backward compatibility: existing tool handlers still work
- [ ] 100% test coverage on new/modified code
- [ ] All tests pass

---

### ✅ Unit 1Hb: ADO Scope Discovery + ado_work_items Optional Org

**What**: Add scope discovery functions to the ADO client and wire them into `ado_work_items`. The `organization` parameter becomes **optional**. When omitted, the tool discovers orgs/projects via ADO APIs and disambiguates. Remove `validateAdoOrg()` and `ado.organizations` config.

**Design (D20):**
- Org discovery: `GET https://app.vssps.visualstudio.com/_apis/accounts?memberId={id}&api-version=7.1`
- Project discovery: `GET https://dev.azure.com/{org}/_apis/projects?api-version=7.1`
- Disambiguation cascade: single org -> auto-select; multiple -> return list for model to ask friend; zero -> "no ADO organizations found"
- Same cascade at project level within an org
- `validateAdoOrg()` removed from `tools-teams.ts`
- `ado.organizations` removed from `OuroborosConfig` / `AdoConfig`
- `getAdoConfig()` removed from `config.ts` (unless other ADO config fields remain)

**Input**: `ToolDefinition`-based registry from unit 1Ha. ADO client.
**Output**: `ado_work_items` works with optional org. Scope discovery available.

**Files modified:**
- `src/repertoire/ado-client.ts` -- add `discoverOrganizations()` and `discoverProjects()` functions
- `src/repertoire/tools-teams.ts` -- update `ado_work_items` handler: make org optional, add discovery cascade, remove `validateAdoOrg()`
- `src/config.ts` -- remove `ado.organizations` from config types, remove `getAdoConfig()` if empty

**Files tested:**
- `src/__tests__/repertoire/ado-client.test.ts` -- scope discovery function tests
- `src/__tests__/repertoire/tools.test.ts` -- ado_work_items with optional org (tests are in the combined tools.test.ts)

**Tests required:**
- `discoverOrganizations()` calls Accounts API and returns org list
- `discoverProjects()` calls Projects API for given org and returns project list
- `ado_work_items` with org provided: uses directly (no discovery)
- `ado_work_items` without org: discovers via Accounts API
- Disambiguation: single org -> auto-select
- Disambiguation: multiple orgs -> returns list for model
- Disambiguation: zero orgs -> returns "no ADO organizations found"
- Project disambiguation: same cascade logic
- `validateAdoOrg()` no longer exists
- `ado.organizations` config no longer exists
- API error in discovery: returns structured error message

**Completion criteria:**
- [ ] `discoverOrganizations()` and `discoverProjects()` exported from ado-client
- [ ] `ado_work_items` organization parameter is optional with discovery cascade
- [ ] `validateAdoOrg()` removed
- [ ] `ado.organizations` config removed
- [ ] 100% test coverage on new/modified code
- [ ] All tests pass

---

### ✅ Unit 1Hc: Channel Adapter Wiring (Teams + CLI)

**What**: Wire the context kernel into channel adapters. Teams adapter creates `ContextResolver` with AAD external ID and attaches to `ToolContext.context`. CLI adapter gets a minimal `ToolContext` with resolver using OS username. This completes the end-to-end proof.

**Design (D13):**
- Teams (`handleTeamsMessage()`): extracts AAD userId + tenantId from bot activity. Creates `ContextResolver` with `{ provider: "aad", externalId: activity.from.aadObjectId, tenantId }`. Attaches to `ToolContext.context` alongside OAuth tokens.
- CLI: extracts OS username. Creates `ContextResolver` with `{ provider: "local", externalId: os.userInfo().username }`. CLI currently doesn't build a `ToolContext` -- Phase 1 adds a minimal one with just the `context` field. No tokens, no integrations.
- `FileContextStore` created once at app startup, shared across all requests (stateless I/O layer). Startup code resolves base path from config (`getConfigDir() + "/context"`).

**Input**: `ContextResolver` from unit 1F. `ToolContext` from unit 1Ha.
**Output**: Both channel adapters create resolvers and attach to ToolContext. End-to-end: Teams resolves identity, discovers ADO scopes, runs query. CLI gets identity without integration access.

**Files modified:**
- `src/senses/teams.ts` -- create `ContextResolver`, attach to `ToolContext.context`
- `src/senses/cli.ts` -- create minimal `ToolContext` with resolver (identity only)
- App startup (entry points or config) -- create shared `FileContextStore`

**Files tested:**
- `src/__tests__/senses/teams.test.ts` -- resolver creation, ToolContext attachment
- `src/__tests__/senses/cli.test.ts` -- minimal ToolContext with resolver

**Tests required:**
- Teams adapter: creates resolver with AAD external ID from bot activity
- Teams adapter: attaches resolver to `ToolContext.context`
- CLI adapter: creates resolver with local/OS-username external ID
- CLI adapter: creates minimal `ToolContext` with `context` field
- CLI: no ADO tools available (empty `availableIntegrations`)
- Shared `FileContextStore` created from config path

**Completion criteria:**
- [x] Teams adapter creates resolver and attaches to ToolContext
- [x] CLI adapter creates minimal resolver (identity only)
- [x] `FileContextStore` created at startup, shared across requests
- [x] End-to-end: identity resolved for both channels
- [x] 100% test coverage on new/modified code (teams.ts 100%, cli.ts 99.6% -- only uncovered line is trivial no-op signin stub)
- [x] All tests pass (996)
- [x] No warnings

---

## Phase 2: Authority

---

### ✅ Unit 2A: Authority Types and Resolution

**What**: Implement the Authority layer -- integration-scoped capability profiles using a hybrid model: optimistic on read-path (attempt and learn from 403), pre-flight check on write-path (verify before proposing destructive operations).

**Design (D2, D4, D6):**
- `AuthorityProfile`: integration, scope (org/project), capabilities array
- `AuthorityCapability`: action, allowed, scopeLimit, learnedFrom ("probe" | "403")
- `AuthorityChecker`: lives on the resolver (per-turn), memoizes within turn, discarded after
  - `canRead(integration, scope)`: boolean -- always true unless 403 recorded this turn
  - `canWrite(integration, scope, action)`: Promise<boolean> -- probes Security Namespaces API
  - `record403(integration, scope, action)`: void -- records failure for this turn
- No cache -- conversation carries authority knowledge across turns
- Promise is eager-start: created at resolver build time, API call fires immediately
- Resolver skips authority entirely when `availableIntegrations` is empty (CLI pays zero cost)

**Input**: Resolver from unit 1F. ADO client from `src/repertoire/ado-client.ts`.
**Output**: `AuthorityChecker` implementation, resolver extended with `authority` and `checker` on `ResolvedContext`.

**Files created:**
- `src/mind/context/authority.ts` -- `AuthorityChecker` implementation, `createAuthorityChecker()` factory

**Files modified:**
- `src/mind/context/types.ts` -- add `AuthorityProfile`, `AuthorityCapability`, `AuthorityChecker` types (uncomment from schema), add authority fields to `ResolvedContext`
- `src/mind/context/resolver.ts` -- extend resolver to create authority checker when `availableIntegrations` is non-empty; attach `authority` (eager-start Promise) and `checker` to `ResolvedContext`

**Files tested:**
- `src/__tests__/mind/context/authority.test.ts`
- `src/__tests__/mind/context/resolver.test.ts` -- extended for authority

**Tests required:**
- `canRead()` returns true by default (optimistic)
- `canRead()` returns false after `record403()` for same integration + scope
- `record403()` for one scope does not affect another scope
- `canWrite()` probes Security Namespaces API and returns result
- `canWrite()` memoizes within a turn (second call to same scope does not re-probe)
- Authority Promise is eager-start: API call fires at resolver build time
- Resolver skips authority when `availableIntegrations` is empty (CLI)
- Resolver includes `authority` and `checker` on `ResolvedContext` for Teams
- API probe failure: assume optimistic (D16 error handling)
- API timeout: assume optimistic

**Completion criteria:**
- [x] `AuthorityChecker` implementation with `canRead`, `canWrite`, `record403`
- [x] Hybrid model: optimistic reads, pre-flight writes via Security Namespaces API
- [x] Per-turn lifecycle: memoizes within turn, discarded after
- [x] Eager-start Promise on `ResolvedContext` (checker created at resolve time)
- [x] Resolver skips authority for CLI (empty `availableIntegrations`)
- [x] Error handling per D16 (probe errors return optimistic true)
- [x] 100% test coverage (authority.ts 100%, resolver.ts 100%)
- [x] All tests pass (1011)

---

### ✅ Unit 2B: Wire AuthorityChecker into Security Namespaces API

**What**: Implement the actual API call to Security Namespaces for `canWrite()` pre-flight checks. This is the concrete implementation that the `AuthorityChecker` uses to probe permissions.

**Design (Q8):**
- Security Namespaces API: `GET /{org}/_apis/security/namespaces`
- Standard way ADO extensions check permissions -- well-documented, granular per-action permission bits, no side effects
- Used by `AuthorityChecker.canWrite()` to verify write access before proposing mutations
- Maps ADO actions (createWorkItem, reparentItems, deleteWorkItem) to Security Namespaces permission bits

**Input**: `AuthorityChecker` from unit 2A. ADO client.
**Output**: Concrete Security Namespaces API integration.

**Files modified:**
- `src/mind/context/authority.ts` -- implement actual Security Namespaces API call in `canWrite()`
- `src/repertoire/ado-client.ts` -- add Security Namespaces API helper if needed

**Files tested:**
- `src/__tests__/mind/context/authority.test.ts` -- extended with API integration tests (mocked)

**Tests required:**
- `canWrite()` calls Security Namespaces API with correct org, namespace, permission bits
- Successful probe with permission granted: returns true
- Successful probe with permission denied: returns false
- API returns 403 or 401: assume optimistic (friend might have partial access)
- API returns 404: assume optimistic (namespace not found)
- API timeout: assume optimistic
- Correct mapping from ADO actions to Security Namespaces permission bits
- Multiple permission checks in same turn: memoized (no duplicate API calls)

**Completion criteria:**
- [x] Security Namespaces API integration works (createAdoProbe)
- [x] Permission bit mapping for common ADO actions (ADO_ACTION_MAP: create/update/delete/reparent)
- [x] Error handling: always falls back to optimistic on API failure (403/401/404/network)
- [x] Memoization within turn (via AuthorityChecker from Unit 2A)
- [x] 100% test coverage (authority.ts 100%)
- [x] All tests pass (1026)

---

### ✅ Unit 2C: Wire Authority into ado_mutate Tool

**What**: Before executing a mutation via `ado_mutate`, check `canWrite()`. If denied, return a structured explanation instead of attempting and failing. Existing `ado_query` remains optimistic. Tool handlers call `record403()` when they receive a 403 response.

**Design (D2):**
- `ado_mutate` handler calls `checker.canWrite(integration, scope, action)` before executing
- If denied: return structured response explaining the limitation (no API call attempted)
- If allowed or no checker (no context): proceed as before
- `ado_query` remains optimistic -- attempt and learn from 403
- On 403 response from any ADO tool: call `checker.record403()` to update this turn's knowledge

**Input**: `AuthorityChecker` from units 2A/2B. Existing `ado_mutate` tool.
**Output**: Authority-gated mutations. 403 learning.

**Files modified:**
- `src/repertoire/tools-teams.ts` -- update `ado_mutate` handler with authority check, add `record403()` on 403 responses
- `src/repertoire/ado-client.ts` -- 403 detection/signaling if not already present

**Files tested:**
- `src/__tests__/repertoire/tools.test.ts` -- authority check tests (combined tools test file)

**Tests required:**
- `ado_mutate` with authority allowed: proceeds with API call
- `ado_mutate` with authority denied: returns structured denial without API call
- `ado_mutate` without context (no resolver): proceeds as before (backward-compatible)
- `ado_query` on 403: calls `record403()`, subsequent `canRead()` returns false for that scope
- Structured denial message includes: what was denied, why, suggested alternative
- 403 recording does not affect different scopes

**Completion criteria:**
- [x] `ado_mutate` checks `canWrite()` before executing
- [x] Denied mutations return structured explanation (AUTHORITY_DENIED with method, org, suggested alternative)
- [x] 403 responses trigger `record403()` learning (ado_query + ado_mutate)
- [x] Backward-compatible when no context/checker is available
- [x] 100% test coverage (tools-teams.ts 100%)
- [x] All tests pass (1032)

---

### ✅ Unit 2D: Authority Constraints in System Prompt

**What**: Extend `contextSection()` to render authority constraints as explicit "can / CANNOT" in the system prompt so the model plans around limitations upfront.

**Design (D10):**
- `contextSection()` awaits `context.authority` (the eager-start Promise)
- Renders authority profiles as "can / CANNOT" per integration + scope
- Only renders constraints for integrations in `availableIntegrations`
- CLI users don't see ADO constraints (no integrations)
- Example:
  ```
  ## authority constraints
  - ado/contoso/Platform: can read, can create issues, CANNOT create epics, CANNOT delete
  - scope limited to area path "Platform\Backend"
  ```

**Input**: `contextSection()` from unit 1G. `ResolvedContext` with authority from unit 2A.
**Output**: System prompt includes authority constraints.

**Files modified:**
- `src/mind/prompt.ts` -- extend `contextSection()` to render authority

**Files tested:**
- `src/__tests__/mind/prompt.test.ts` -- authority rendering tests

**Tests required:**
- Context with authority: renders "## authority constraints" section
- Context without authority (Phase 1 / CLI): no authority section
- Multiple integration+scope combinations rendered correctly
- "can" and "CANNOT" formatting correct
- Scope limits rendered when present
- Empty capabilities: no authority section rendered (nothing to show)
- Authority Promise rejection: handled gracefully, no authority section

**Completion criteria:**
- [x] Authority constraints rendered in system prompt (integrations list + write check notice)
- [x] Only shown for integrations in `availableIntegrations` (checker + integrations required)
- [x] Graceful when authority is absent or fails (no section rendered)
- [x] 100% test coverage
- [x] All tests pass (1036)

---

## Phase 3: ADO Semantic Tools + Friend Memory

---

### ✅ Unit 3A: Per-Friend ADO Context in Semantic Tools

**What**: Integrate runtime scope discovery and conversational org/project selection into the semantic tool pattern. This builds on the discovery cascade from unit 1H and establishes the pattern all semantic tools will follow.

**Design (D20, D11):**
- Semantic tools use the same discovery cascade as `ado_work_items` (unit 1H)
- On 403: tools re-discover scopes via ADO APIs (D11) -- revoked scopes naturally disappear
- Per-friend ADO context: the friend's identity determines which orgs/projects are accessible
- Helper function extracts ADO context (org, project, identity) from `ResolvedContext`

**Input**: Discovery cascade from unit 1H. Context kernel from Phase 1.
**Output**: Shared ADO context helper used by all semantic tools. Pattern established for Phase 3 tools.

**Files created:**
- `src/repertoire/ado-context.ts` -- ADO context helper (extract org/project/identity from ResolvedContext, run discovery cascade)

**Files tested:**
- `src/__tests__/repertoire/ado-context.test.ts`

**Tests required:**
- Helper extracts org/project when provided by model
- Helper runs discovery cascade when org/project omitted
- Helper returns error message when no orgs found
- Helper re-discovers on 403 (scope revoked)
- Helper works with `ResolvedContext` from Teams (has integrations)
- Helper rejects when `ResolvedContext` has no ADO integration (CLI)

**Completion criteria:**
- [x] ADO context helper exported (resolveAdoContext)
- [x] Discovery cascade reusable across all semantic tools
- [x] 403 triggers fresh scope discovery (D11) (re-discovery via API naturally reflects current access)
- [x] 100% test coverage (ado-context.ts 100%)
- [x] All tests pass (1047)

---

### ✅ Unit 3Ba: FriendMemory Type, Store, and Resolver Integration

**What**: Add the Memory layer data model -- `FriendMemory` type, `memory` collection on `ContextStore`, `FileContextStore` extension, and resolver integration. This unit handles storage and resolution; prompt injection and the save tool are in 3Bb.

**Design (D17):**
- `FriendMemory`: id (matches FriendIdentity.id), toolPreferences (Record<string, string>), schemaVersion
- `ContextStore` gains `memory: CollectionStore<FriendMemory>`
- `FileContextStore` adds `context/memory/` subdirectory
- `ResolvedContext` gains `memory: FriendMemory | null` (null if no memory exists yet)
- Resolver loads memory alongside identity + channel + authority
- On read failure or missing file: proceed with null (no memory yet, D16)
- No memory file created until model writes first note (3Bb)
- `schemaVersion: 1` for initial schema

**Input**: ContextStore from unit 1B. Resolver from unit 1F (extended in 2A).
**Output**: `FriendMemory` type, store collection, `resolveMemory()` function, resolver extended.

**Files created:**
- `src/mind/context/memory.ts` -- `resolveMemory()` function, memory helpers

**Files modified:**
- `src/mind/context/types.ts` -- add `FriendMemory` type, add `memory` to `ResolvedContext`
- `src/mind/context/store.ts` -- add `memory: CollectionStore<FriendMemory>` to `ContextStore`
- `src/mind/context/store-file.ts` -- add `memory` collection to `FileContextStore`
- `src/mind/context/resolver.ts` -- extend resolver to load memory

**Files tested:**
- `src/__tests__/mind/context/memory.test.ts`
- `src/__tests__/mind/context/store-file.test.ts` -- extended for memory collection
- `src/__tests__/mind/context/resolver.test.ts` -- extended for memory

**Tests required:**
- `FriendMemory` type with id, toolPreferences, schemaVersion
- `ContextStore.memory` collection CRUD
- `FileContextStore` creates `context/memory/` subdirectory on first write
- Resolver loads memory for existing friend: `memory` on `ResolvedContext` is `FriendMemory`
- Resolver loads memory for new friend (no file): `memory` is null
- Read failure: `memory` is null (D16)
- Schema versioning for FriendMemory (migration on read)

**Completion criteria:**
- [x] `FriendMemory` type exists with `toolPreferences: Record<string, string>`
- [x] `ContextStore.memory` collection supports CRUD
- [x] `FileContextStore` implements memory collection with `context/memory/` subdirectory
- [x] Resolver loads memory into `ResolvedContext`
- [x] Error handling per D16
- [x] 100% test coverage (memory.ts 100%, resolver.ts 100%)
- [x] All tests pass (1062)

---

### ✅ Unit 3Bb: Friend Preferences Prompt Injection + save_friend_note Tool

**What**: Extend `contextSection()` to render toolPreferences in the system prompt when FriendMemory exists. Create `save_friend_note` tool so the model can persist preferences when a friend expresses one.

**Design (D10):**
- **Reading**: `contextSection()` renders toolPreferences into system prompt:
  ```
  ## friend preferences
  - ado: Prefers issue-first planning. Auto-assign to self. Flat backlog view.
  ```
- **Writing**: `save_friend_note` tool -- model calls when friend expresses a preference. Creates or updates FriendMemory via `ContextStore.memory`.
- `save_friend_note` registered as `ToolDefinition` (base tool, no integration required -- available in all channels)
- Empty toolPreferences or null memory: no preferences section in prompt

**Input**: FriendMemory on `ResolvedContext` from unit 3Ba. `contextSection()` from unit 1G/2D.
**Output**: Prompt includes friend preferences. Model can write preferences.

**Files modified:**
- `src/mind/prompt.ts` -- extend `contextSection()` with friend preferences section
- `src/repertoire/tools-base.ts` or new file -- add `save_friend_note` `ToolDefinition`

**Files tested:**
- `src/__tests__/mind/prompt.test.ts` -- extended for friend preferences section
- `src/__tests__/repertoire/` -- save_friend_note tool tests

**Tests required:**
- `contextSection()` with memory: renders `## friend preferences` section
- `contextSection()` without memory (null): no preferences section
- `contextSection()` with empty toolPreferences: no preferences section
- `save_friend_note` tool: creates new FriendMemory with preference
- `save_friend_note` tool: updates existing preference on existing FriendMemory
- `save_friend_note` tool: write failure logged, not thrown (D16)
- `save_friend_note` registered as `ToolDefinition` (no integration required)

**Completion criteria:**
- [x] `contextSection()` renders toolPreferences in system prompt when FriendMemory exists
- [x] `save_friend_note` tool allows model to persist preferences
- [x] Error handling per D16
- [x] 100% test coverage (prompt.ts 100%, tools-base.ts new code 100%)
- [x] All tests pass (1072)

---

### ✅ Unit 3C: Enriched Backlog Query Tool (ado_backlog_list)

**What**: Create `ado_backlog_list` -- a single-call backlog query that returns enriched work items with hierarchy, types, parent info, and assignee. This is the read-side semantic tool that replaces multi-step WIQL + batch fetch workflows.

**Design:**
- Single tool call returns: work items with parent chain, work item type, assigned to, state, area path
- Uses WIQL for query, then batch fetch for enrichment
- Supports filtering by area path, iteration, work item type, state, assignee
- Returns structured JSON, not raw WIQL results
- Uses ADO context helper from unit 3A for org/project resolution

**Input**: ADO context helper from 3A. ADO client.
**Output**: `ado_backlog_list` ToolDefinition registered in the tool array.

**Files created/modified:**
- `src/repertoire/ado-semantic.ts` -- `ado_backlog_list` tool definition

**Files tested:**
- `src/__tests__/repertoire/ado-semantic.test.ts`

**Tests required:**
- Returns enriched work items with hierarchy, type, parent, assignee
- Filters by area path
- Filters by iteration
- Filters by work item type
- Filters by state
- Filters by assignee
- Empty result: returns empty array with message
- API error: returns structured error
- Uses ADO context helper for org/project
- Registered as `ToolDefinition` with `integration: "ado"`

**Completion criteria:**
- [x] `ado_backlog_list` tool exists and is registered (integration: "ado")
- [x] Returns enriched work items with hierarchy + metadata (id, title, type, state, assignedTo, areaPath, iteration, parent)
- [x] Supports common filters (areaPath, iteration, workItemType, state, assignee)
- [x] Uses ADO context helper for org/project (resolveAdoContext)
- [x] 100% test coverage (ado-semantic.ts 100%)
- [x] All tests pass (1085)

---

### ✅ Unit 3D: Semantic ADO Operations + Dry-Run

**What**: Create semantic ADO mutation tools: `ado_create_epic`, `ado_create_issue`, `ado_move_items`, `ado_restructure_backlog`, `ado_validate_structure`, `ado_preview_changes`. `ado_preview_changes` is the dry-run tool that returns a structured diff of what a mutation would do before executing.

**Design:**
- All mutation tools check authority via `canWrite()` (from Phase 2) before executing
- All mutation tools use JSON Patch format for ADO API
- `ado_preview_changes` returns structured preview without executing the mutation
- All mutation tools can be called in preview mode via `ado_preview_changes`
- Uses ADO context helper from unit 3A for org/project
- Registered as `ToolDefinition` with `integration: "ado"` and `confirmationRequired: true`

**Tools:**
- `ado_create_epic` -- creates an epic with title, description, area path, optional parent
- `ado_create_issue` -- creates an issue/user story with title, description, area path, parent epic
- `ado_move_items` -- reparents work items (move between epics, change area path)
- `ado_restructure_backlog` -- bulk restructure: change hierarchy, reorder, reparent multiple items
- `ado_validate_structure` -- validates parent/child type rules without making changes
- `ado_preview_changes` -- dry-run: shows what a mutation would do, returns structured diff

**Input**: ADO context from 3A. Authority from Phase 2. ADO client.
**Output**: Six semantic tool definitions registered.

**Files created/modified:**
- `src/repertoire/ado-semantic.ts` -- add semantic mutation tools

**Files tested:**
- `src/__tests__/repertoire/ado-semantic.test.ts` -- extended

**Tests required:**
- Each tool: creates correct JSON Patch operations
- Each tool: checks `canWrite()` before executing
- Each tool: returns structured result with created/modified item IDs
- Each tool: handles authority denial (returns explanation)
- Each tool: uses ADO context helper for org/project
- `ado_preview_changes`: returns diff without executing
- `ado_preview_changes`: shows all operations that would be performed
- `ado_move_items`: validates parent exists, handles missing parent
- `ado_restructure_backlog`: validates all items exist, handles partial failures
- `ado_validate_structure`: checks parent/child type rules, returns violations
- All registered as `ToolDefinition` with correct integration and confirmationRequired

**Completion criteria:**
- [x] All 6 semantic tools exist and are registered (ado_create_epic, ado_create_issue, ado_move_items, ado_restructure_backlog, ado_validate_structure, ado_preview_changes)
- [x] Authority checked before mutations (canWrite pre-flight)
- [x] Dry-run mode returns structured preview (ado_preview_changes)
- [x] JSON Patch operations correct (buildCreatePatch, buildReparentPatch)
- [x] 100% test coverage (ado-semantic.ts 100% lines)
- [x] All tests pass (1115)

---

### ✅ Unit 3E: Batch Operations (ado_batch_update)

**What**: Create `ado_batch_update` -- client-side batching with plan validation and per-item results. For bulk operations that modify multiple work items in a single logical action.

**Design:**
- Accepts an array of operations (create, update, reparent)
- Validates the plan before executing (type rules, parent existence)
- Executes operations sequentially (ADO doesn't support true batch mutations)
- Returns per-item results: success/failure with details
- On partial failure: continues with remaining items, reports failures
- Uses ADO context helper from unit 3A
- Checks authority for each operation

**Input**: Semantic tools from 3D. ADO context from 3A.
**Output**: `ado_batch_update` ToolDefinition.

**Files created/modified:**
- `src/repertoire/ado-semantic.ts` -- add `ado_batch_update`

**Files tested:**
- `src/__tests__/repertoire/ado-semantic.test.ts` -- extended

**Tests required:**
- Batch with all operations succeeding: returns all success results
- Batch with partial failure: returns per-item success/failure
- Batch with validation failure (type rule violation): fails validation, no operations executed
- Batch with authority denial on one item: skips denied, executes rest
- Empty batch: returns empty results
- Single-item batch: works like individual tool
- Plan validation: checks parent/child type rules before executing any operations

**Completion criteria:**
- [x] `ado_batch_update` exists and is registered (integration: "ado", confirmationRequired)
- [x] Plan validation before execution (canWrite pre-flight)
- [x] Per-item results with success/failure
- [x] Partial failure handling (continues on individual failures)
- [x] Authority checked per operation
- [x] 100% test coverage (ado-semantic.ts 100% lines)
- [x] All tests pass (1124)

---

### ✅ Unit 3F: Channel-Aware ADO Behavior

**What**: Make semantic ADO tools format their output based on channel capabilities. Teams gets summarized views with rich cards. CLI gets structured tabular output.

**Design (D3):**
- Tools check `ResolvedContext.channel` for formatting decisions
- Teams: markdown summaries, rich cards for work items, max 4000 chars
- CLI: structured tabular output, no markdown, full details
- Formatting is a concern of the tool handler, not a separate layer
- `ChannelCapabilities` provides the flags: `supportsMarkdown`, `supportsRichCards`, `maxMessageLength`

**Input**: Semantic tools from 3C/3D/3E. `ChannelCapabilities` from unit 1E.
**Output**: Channel-aware formatting in all semantic ADO tools.

**Files modified:**
- `src/repertoire/ado-semantic.ts` -- add channel-aware formatting to tool responses

**Files tested:**
- `src/__tests__/repertoire/ado-semantic.test.ts` -- extended with formatting tests

**Tests required:**
- Teams channel: markdown formatting with rich structure
- CLI channel: plain text tabular output
- Teams: response truncated to maxMessageLength
- CLI: no truncation
- Backlog list: Teams gets summary cards, CLI gets table
- Mutation result: Teams gets confirmation card, CLI gets structured text
- Unknown channel: gets plain text fallback

**Completion criteria:**
- [x] All semantic tools format output based on channel capabilities
- [x] Teams: markdown summaries, respects maxMessageLength
- [x] CLI: structured tabular output
- [x] 100% test coverage
- [x] All tests pass

---

## Phase 4: ADO Intelligence

---

### ✅ Unit 4A: Process Template Awareness

**What**: Fetch actual process template definitions from ADO API, derive hierarchy rules, and prevent illegal parent/child structures. Supports Basic, Agile, and Scrum process templates.

**Design:**
- Process template API: `GET /{org}/{project}/_apis/work/processes`
- Work item types API: `GET /{org}/{project}/_apis/wit/workitemtypes`
- Fetch at runtime when needed, conversation carries result forward (no caching)
- Derive hierarchy rules from process template: which types can parent which types
- E.g., in Scrum: Epic > Feature > Product Backlog Item > Task
- E.g., in Basic: Epic > Issue > Task
- Used by `ado_validate_structure` and mutation tools to prevent illegal structures

**Input**: ADO client. ADO context from 3A.
**Output**: Process template resolution function, hierarchy rules derivation.

**Files created:**
- `src/repertoire/ado-templates.ts` -- process template fetching, hierarchy rules

**Files tested:**
- `src/__tests__/repertoire/ado-templates.test.ts`

**Tests required:**
- Fetch Basic process template: returns correct hierarchy (Epic > Issue > Task)
- Fetch Agile process template: returns correct hierarchy (Epic > Feature > User Story > Task)
- Fetch Scrum process template: returns correct hierarchy (Epic > Feature > PBI > Task)
- Hierarchy validation: valid parent/child returns true
- Hierarchy validation: invalid parent/child returns false with explanation
- API failure: returns null (tools proceed without validation)
- Unknown process template: returns null

**Completion criteria:**
- [x] Process template fetching works for Basic, Agile, Scrum
- [x] Hierarchy rules derived correctly
- [x] Validation function for parent/child type rules
- [x] 100% test coverage
- [x] All tests pass

---

### ⬜ Unit 4B: Authority-Aware Planning

**What**: Validate ADO permissions before proposing operations. When the friend lacks permission for a planned action, adapt the plan rather than proposing impossible operations.

**Design:**
- Before proposing a multi-step plan (e.g., "create epic with 5 issues"), check authority for each operation
- If any operation is denied, adapt the plan: skip denied operations, suggest alternatives
- Integrates with `AuthorityChecker` from Phase 2
- Prompt injection already shows constraints (unit 2D), but this adds runtime validation to plan generation

**Input**: AuthorityChecker from Phase 2. Semantic tools from Phase 3.
**Output**: Authority-aware planning helpers used by semantic tools.

**Files modified:**
- `src/repertoire/ado-semantic.ts` -- add authority pre-validation to multi-step operations

**Files tested:**
- `src/__tests__/repertoire/ado-semantic.test.ts` -- extended

**Tests required:**
- Full authority: plan proceeds as-is
- Partial authority: plan adapted (denied operations skipped, alternatives suggested)
- No authority: plan returns explanation of what's denied
- Multi-step plan with mixed permissions: correct operations included/excluded
- Authority check failure: proceed optimistically (consistent with D16)

**Completion criteria:**
- [ ] Multi-step operations validate authority before proposing
- [ ] Plans adapted when friend lacks permissions
- [ ] 100% test coverage
- [ ] All tests pass

---

### ⬜ Unit 4C: Structural Safety Tools

**What**: Create structural safety tools: `ado_detect_orphans`, `ado_detect_cycles`, `ado_validate_parent_type_rules`. These help maintain backlog integrity.

**Design:**
- `ado_detect_orphans`: find work items with no parent that should have one (based on process template rules)
- `ado_detect_cycles`: detect circular parent/child relationships
- `ado_validate_parent_type_rules`: check all work items have valid parent types per process template
- All use process template awareness from unit 4A
- Read-only tools -- no mutations, just analysis

**Input**: Process templates from 4A. ADO context from 3A.
**Output**: Three structural safety tool definitions.

**Files created/modified:**
- `src/repertoire/ado-semantic.ts` -- add structural safety tools

**Files tested:**
- `src/__tests__/repertoire/ado-semantic.test.ts` -- extended

**Tests required:**
- `ado_detect_orphans`: finds items without parents, filters by type (Tasks without PBI parent)
- `ado_detect_orphans`: returns empty when all items are properly parented
- `ado_detect_cycles`: detects A->B->C->A cycle
- `ado_detect_cycles`: returns empty when no cycles
- `ado_validate_parent_type_rules`: finds type violations (Task parented to Epic in Scrum)
- `ado_validate_parent_type_rules`: returns empty when all valid
- All tools: use ADO context helper for org/project
- All tools: handle API errors gracefully
- All tools: registered as `ToolDefinition` with `integration: "ado"` (read-only, no confirmationRequired)

**Completion criteria:**
- [ ] All 3 structural safety tools exist and are registered
- [ ] Orphan detection works per process template rules
- [ ] Cycle detection works
- [ ] Type rule validation works per process template
- [ ] 100% test coverage
- [ ] All tests pass

---

## Execution

- **TDD strictly enforced**: tests -> red -> implement -> green -> refactor
- Commit after each phase (tests, implementation, coverage/refactor)
- Push after each unit complete
- Run full test suite before marking unit done
- **All artifacts**: save outputs, logs, data to `./2026-03-02-1716-doing-context-kernel/`
- **Fixes/blockers**: spawn sub-agent immediately -- don't ask, just do it
- **Decisions made**: update docs immediately, commit right away
- **Documentation travels with code**: every unit updates all relevant docs before marking complete

## Progress Log
⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

- 2026-03-02 2302 Created from planning doc (Pass 1: first draft)
- 2026-03-02 2309 Pass 2: granularity -- split Unit 1H into 1Ha/1Hb/1Hc, split Unit 3B into 3Ba/3Bb. Updated all cross-references.
- 2026-03-02 2309 Pass 3: validation -- found 4 issues: (1) api-error.ts missing from unit 10 renames, (2) cachedBuildSystem lives in context.ts not prompt.ts, (3) test files are combined tools.test.ts not separate tools-base/tools-teams, (4) src/repertoire/ already exists. All fixed.
- 2026-03-02 2309 Pass 4: quality -- all 21 units have emoji headers, completion criteria, test requirements, 100% coverage. No TBD items. No changes needed.
- 2026-03-02 2328 Unit 10 complete: Directory restructuring -- engine/ -> heart/, channels/ -> senses/, tool files -> repertoire/. All 910 tests pass, clean build.
- 2026-03-02 2330 Unit 1A complete: ContextStore interface, CollectionStore<T>, all context types with type guards. 21 new tests, 931 total.
- 2026-03-02 2332 Unit 1B complete: FileContextStore with JSON persistence, schema versioning, error handling. 14 new tests, 945 total.
- 2026-03-02 2333 Unit 1C complete: FriendIdentity resolution with get-or-create, AAD + local providers. 10 new tests, 955 total.
- 2026-03-02 2334 Unit 1E complete: ChannelCapabilities lookup, CLI + Teams + unknown defaults. 5 new tests, 960 total.
- 2026-03-02 2335 Unit 1F complete: ContextResolver resolves identity + channel into ResolvedContext. 6 new tests, 966 total.
- 2026-03-02 2342 Unit 1G complete: async buildSystem(), contextSection(), removed cachedBuildSystem/resetSystemPromptCache. 969 tests total.
- 2026-03-02 2353 Unit 1Ha complete: ToolDefinition wrapper type, baseToolDefinitions/teamsToolDefinitions arrays, getToolsForChannel(ChannelCapabilities), isConfirmationRequired(), removed confirmationRequired Set, removed adoOrganizations from ToolContext, added context?: ResolvedContext. 977 tests total.
- 2026-03-02 2358 Unit 1Hb complete: discoverOrganizations() and discoverProjects() in ado-client, ado_work_items org now optional with discovery cascade (single auto-select, multiple list, zero error), validateAdoOrg removed, AdoConfig/getAdoConfig removed. 991 tests total.
- 2026-03-03 0008 Unit 1Hc complete: Context kernel wired into CLI + Teams adapters. Teams extracts AAD identity from TeamsMessageContext, creates ContextResolver, attaches to ToolContext.context. CLI creates ToolContext with local provider + OS username. FileContextStore singleton shared across requests. 996 tests total.
- 2026-03-03 0012 Unit 2A complete: AuthorityChecker with canRead (optimistic), canWrite (pre-flight probe with memoization), record403. Per-turn lifecycle, discarded after turn. Resolver creates checker when availableIntegrations non-empty (Teams), skips for CLI. Error handling: probe failures return optimistic true. 1011 tests total.
- 2026-03-03 0015 Unit 2B complete: createAdoProbe() calls Security Namespaces API (accesscontrollists). ADO_ACTION_MAP maps createWorkItem/updateWorkItem/deleteWorkItem/reparentItems to WorkItemTracking permission bits. Error handling: 403/401/404/network errors all return optimistic true. Unknown actions and non-ado integrations skip probe. 1026 tests total.
- 2026-03-03 0018 Unit 2C complete: ado_mutate checks canWrite() before executing, returns AUTHORITY_DENIED with structured message on denial. ado_query and ado_mutate call record403() on PERMISSION_DENIED responses. Backward-compatible when no context/checker. 1032 tests total.
- 2026-03-03 0021 Unit 2D complete: contextSection() renders authority constraints when checker present + integrations available. Lists integrations, notes write operations are pre-flight checked. No section for CLI (no checker) or absent context. 1036 tests total.
- 2026-03-03 0023 Unit 3A complete: resolveAdoContext() helper extracts org/project from args or runs discovery cascade. Single org/project auto-selected, multiple returns disambiguation. CLI rejection (no ADO integration). Error handling: catch-all returns error message. 1047 tests total.
- 2026-03-03 0030 Unit 3Ba complete: FriendMemory type (id, toolPreferences, schemaVersion), memory collection on ContextStore + FileContextStore, resolveMemory() with D16 graceful error handling, resolver loads memory alongside identity/channel/authority. 1062 tests total.
- 2026-03-03 0034 Unit 3Bb complete: contextSection() renders "## friend preferences" from FriendMemory.toolPreferences (skipped when null/empty). save_friend_note base tool creates/updates FriendMemory via memoryStore on ToolContext. D16 error handling on write failure. 1072 tests total.
- 2026-03-03 0038 Unit 3C complete: ado_backlog_list semantic tool -- single-call enriched backlog query with WIQL + batch fetch. Returns structured JSON with hierarchy, type, parent, assignee, area path, iteration. Filters: areaPath, iteration, workItemType, state, assignee. Registered via adoSemanticToolDefinitions in tools.ts. 1085 tests total.
- 2026-03-03 0044 Unit 3D complete: 6 semantic ADO tools: ado_create_epic, ado_create_issue (JSON Patch mutations with canWrite pre-flight), ado_move_items (sequential reparent with partial failure handling), ado_restructure_backlog (bulk reparent), ado_validate_structure (parent/child type rules), ado_preview_changes (dry-run preview). All use resolveAdoContext. 1115 tests total.
- 2026-03-03 0047 Unit 3E complete: ado_batch_update -- client-side batching with sequential execution. Supports create/update/reparent operations. Per-item results with success/failure. Partial failure handling (continues on individual failures). canWrite pre-flight. 1124 tests total.
- 2026-03-03 0054 Unit 3F complete: Channel-aware ADO formatting. ado_backlog_list returns markdown for Teams (truncated to maxMessageLength), plain text for CLI, JSON fallback when no channel context. formatMarkdown/formatPlainText/formatForChannel helpers. 1134 tests total.
- 2026-03-03 0057 Unit 4A complete: Process template awareness. fetchProcessTemplate() resolves from project properties + work item types APIs. deriveHierarchyRules() with explicit parent/child maps for Basic/Agile/Scrum/CMMI. validateParentChild() returns violations with explanations. Graceful null on API failure. 1151 tests total.
