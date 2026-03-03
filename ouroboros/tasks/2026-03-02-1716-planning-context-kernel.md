# Planning: Context Kernel -- Structured User Context System

**Status**: NEEDS_REVIEW
**Created**: 2026-03-02 17:16

## Goal
Build a four-layer Context Kernel (Identity, Authority, Preferences, Channel) that transforms the ouroboros agent from a bot that calls REST APIs into a constraint-aware reasoning engine operating within identity, authority, and channel boundaries. The kernel uses a storage-agnostic interface (file-based first adapter), a lazy resolver that resolves layers on demand (not all upfront), a hybrid authority model (optimistic reads, pre-flight checks on mutations), and consumer-driven phasing that wires real ADO operations through the kernel as layers are built -- not after. The conversation history IS the session — there is no separate session state layer. Tools are stateless; the model provides all required context on every call.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

**Documentation is not an afterthought.** Every unit that adds, moves, or restructures files must update all relevant documentation (CLAUDE.md, memory files, cross-agent docs, psyche docs, code comments, markdown references) in the same unit. No deferring doc updates to a later cleanup pass.

## Scope

### In Scope

**Phase 1: Identity + Preferences + Storage Interface (Smallest Vertical Slice)**
- 10. Directory restructuring (prerequisite) -- rename `src/engine/` to `src/heart/` (core loop, streaming, kicks, API error handling), rename `src/channels/` to `src/senses/` (channel adapters), move tool files (`tools.ts`, `tools-base.ts`, `tools-teams.ts`, `ado-client.ts`, `graph-client.ts`, and `data/` endpoint JSON files) from `src/engine/` to `src/repertoire/`. Update all imports across the codebase, all test file paths, and all documentation referencing old paths. This is a mechanical rename with no behavior changes -- all tests must pass identically before and after. Must be done first because all subsequent units reference the new paths.
- 1A. `ContextStore` interface -- typed collection properties (`identity: CollectionStore<UserIdentity>`, `preferences: CollectionStore<UserPreferences>`), where `CollectionStore<T>` provides `get(id)`, `put(id, value)`, `delete(id)`, `find(predicate)`. IDs are always plain strings (UUIDs), no slashes, no compound keys. All context persistence goes through this interface. No module imports file paths or `fs` directly for context data. `find(predicate)` supports identity resolution by external ID (scan + predicate for file store; proper index for future DB store). Adding a new persisted type = add one property to `ContextStore`.
- 1B. `FileContextStore` -- first adapter implementing `ContextStore`. Constructor takes a base path (e.g., `~/.agentconfigs/ouroboros/context`); it does not resolve the path itself. Each collection maps to a subdirectory (`context/identity/`, `context/preferences/`), each item to a JSON file (`{uuid}.json`). This is the only module that touches the filesystem for context storage.
- 1C. `UserIdentity` type and resolution -- internal userId, external ID mappings (AAD, Teams), tenant memberships, display name. Persisted via `ContextStore`. This is the only layer that truly needs persistence — the UUID ↔ external ID mapping can't be re-derived from an API.
- 1D. `UserPreferences` type and resolution -- global preferences (verbosity, confirmation policy, preview-before-mutation) plus integration-scoped preferences (ADO planning style, auto-assign, backlog view style). Built-in defaults live in code. Preferences file is only created when the user makes a non-default choice — don't persist what you can re-derive. No default org/project — org/project selection is conversational (model disambiguates using discovered scopes, context window tracks current project).
- 1E. `ChannelCapabilities` type -- channel identifier (`"cli" | "teams"`) plus capability flags (`supportsMarkdown`, `supportsStreaming`, `supportsRichCards`, `maxMessageLength`) plus `availableIntegrations` declaring which integrations the channel can reach. Pure lookup, no resolution needed. Drives tool routing and prompt filtering.
- 1F. `ContextResolver` -- resolves identity (from store) and preferences (from store) into a `ResolvedContext` object. In Phase 1, all resolution is cheap (file reads + pure lookup) so everything resolves eagerly — no lazy Promises needed yet. Laziness (explicit `Promise<T>` fields) is introduced in Phase 2 when authority resolution requires API calls. Channel capabilities are a synchronous lookup, always available.
- 1G. System prompt injection -- `buildSystem()` gains a `contextSection()` that renders identity + preferences + channel into the system prompt. Rebuilt per-turn. Gracefully omitted when no context is available.
- 1H. Wire context through ONE real ADO operation (Teams channel only): the existing `ado_work_items` tool gains runtime scope discovery — when the model doesn't specify org/project explicitly, the tool handler discovers the user's orgs/projects via ADO APIs (Accounts API → Projects API), caches in memory, and either auto-selects (single scope) or returns the list for the model to ask the user. This is the proof that the kernel works end-to-end. ADO is Teams-only (CLI has `availableIntegrations = []`, no OAuth tokens) so this wiring is tested exclusively via the Teams channel.

**Phase 2: Authority (Demand-Driven)**
- 2A. `Authority` type and resolution -- integration-scoped capability profiles using a hybrid model: optimistic on read-path (attempt and learn from 403), pre-flight check on write-path (verify before proposing destructive operations). Cached with TTL + 403-triggered invalidation.
- 2B. `AuthorityChecker` -- distinguishes read operations (optimistic, learn from failure) from write operations (pre-validated). Provides `canRead(scope)` (always true until 403 disproves) and `canWrite(scope)` (probes API before returning). Pre-flight writes check a lightweight endpoint (e.g., project-level permissions descriptor) rather than attempting the actual mutation.
- 2C. Wire Authority into existing `ado_mutate` tool -- before executing a mutation, check `canWrite()`. If denied, return a structured explanation instead of attempting and failing. Existing `ado_query` remains optimistic.
- 2D. Extend system prompt injection with authority constraints -- `contextSection()` renders "can / CANNOT" authority limits into the prompt so the model plans around constraints upfront (see D10).

**Phase 3: ADO Semantic Tools (Full Consumer)**
- 3A. Per-user ADO context (runtime scope discovery, conversational org/project selection) integrated into semantic tools
- 3B. Enriched backlog query tool -- single-call `ado_backlog_list` with hierarchy, types, parent info, assignee
- 3C. Semantic ADO operations -- `ado_create_epic`, `ado_create_issue`, `ado_move_items`, `ado_restructure_backlog`, `ado_validate_structure`, `ado_preview_changes`
- 3D. Batch operations -- `ado_batch_update` client-side batching with plan validation and per-item results
- 3E. Channel-aware ADO behavior -- Teams gets summarized views, CLI gets structured tabular output
- 3F. Dry-run mode -- `ado_preview_changes` returns structured diff before mutation

**Phase 4: ADO Intelligence (Advanced)**
- 4A. Process template awareness -- fetch actual process template definition from ADO API, derive hierarchy rules, prevent illegal parent/child structures
- 4B. Authority-aware planning -- validate ADO permissions before proposing operations, adapt plans when user lacks permission
- 4C. Structural safety -- `ado_detect_orphans`, `ado_detect_cycles`, `ado_validate_parent_type_rules`

### Out of Scope
- GitHub integration consumer (future phase, after ADO proves the kernel)
- Microsoft Graph integration consumer beyond existing tools (future phase)
- Web UI channel (no web frontend exists today)
- Email channel
- Admin-controlled preferences management UI
- Multi-agent context sharing (each agent has its own context)
- Database-backed or cloud-backed storage adapters (file adapter is the only one built; interface exists for future adapters)
- OAuth flow changes (existing Teams SDK OAuth is kept as-is)
- Changes to the LLM provider layer (Azure/MiniMax config unchanged)

## Completion Criteria
- [ ] `ContextStore` interface defined with typed collection properties (`identity`, `preferences`); each `CollectionStore<T>` provides `get`/`put`/`delete`/`find`; `FileContextStore` implements it
- [ ] No context module imports `fs` directly -- all persistence goes through `ContextStore`
- [ ] All four context layers (Identity, Authority, Preferences, Channel) have TypeScript types and resolution functions
- [ ] `ContextResolver` resolves identity + preferences eagerly in Phase 1; laziness introduced in Phase 2 for authority
- [ ] Authority uses hybrid model: reads are optimistic (403 learning), writes have pre-flight check
- [ ] Identity persists across sessions via `ContextStore`; Authority caches in memory with TTL; Preferences persist via `ContextStore`
- [ ] ADO scope discovery works at runtime via Accounts API + Projects API; conversation carries results forward (no caching)
- [ ] Tools are stateless — model provides all required context (org, project, IDs) on every call; no ambient session state
- [ ] ToolContext extension is backward-compatible -- existing tools work unchanged
- [ ] ADO tools use runtime scope discovery for org/project disambiguation instead of config allowlist
- [ ] At least 3 semantic ADO operations exist (create_epic, create_issue, move_items)
- [ ] Process template detection works for Basic, Agile, and Scrum
- [ ] Channel-aware formatting works for Teams and CLI
- [ ] Dry-run mode returns structured preview for ADO mutations
- [ ] Cross-tenant bleed is prevented by authority scoping
- [ ] System prompt includes resolved context (identity, authority constraints, preferences) via `contextSection()` in `buildSystem()`
- [ ] Authority constraints rendered as explicit "can / CANNOT" in prompt so model plans around limitations
- [ ] Prompt injection gracefully omitted when no context is available (CLI with no identity, first turn)
- [ ] 100% test coverage on all new code
- [ ] All tests pass
- [ ] No warnings

## Code Coverage Requirements
**MANDATORY: 100% coverage on all new code.**
- No `[ExcludeFromCodeCoverage]` or equivalent on new code
- All branches covered (if/else, switch, try/catch)
- All error paths tested
- Edge cases: null, empty, boundary values

## Documentation Requirements
**MANDATORY: docs updated in every unit, not deferred.**
- Every unit that adds, moves, or renames files must update all documentation referencing those paths in the same unit
- Includes: CLAUDE.md, memory files, cross-agent docs, psyche docs, planning/doing docs, code comments, README if present
- No "update docs later" -- if a unit changes structure, the docs reflect it before the unit is marked complete
- Doing doc reviewers should reject units that leave stale doc references

## Open Questions

### Resolved
- [x] Q1: Should the `ContextResolver` pipeline be synchronous or async? **Resolved (D6)**: async. The lazy resolver uses explicit `Promise<T>` for layers that require I/O. Only layers actually accessed pay the async cost.
- [x] Q2: How should we model the identity-to-external-ID mapping when the same person uses CLI and Teams? **Resolved (D12)**: each channel has its own resolution path. Cross-channel linking is opt-in. CLI and Teams identities are separate for now.
- [x] Q3: Should authority profiles be eagerly fetched or lazily fetched? **Resolved (D6)**: lazy with cache. Authority is a `Promise<AuthorityProfile[]>` on the resolved context, not fetched until awaited.
- [x] Q6: How should we handle session context when the same user is in Teams and CLI simultaneously? **Resolved (D8, superseded)**: Session layer was eliminated. Conversation history is per-channel. Identity and Preferences are per-user, shared across channels.
- [x] Q9: Identity bootstrapping -- who creates the `UserIdentity` on first interaction? **Resolved (D14)**: always "get or create." Auto-create with sensible defaults, no manual setup.
- [x] Q10: Session persistence between turns? **Resolved (D8, eliminated)**: no structured session state. Conversation history saved via existing `saveSession()`. Persistent knowledge lives in Identity and Preferences via `ContextStore`.
- [x] Q11: Working set mutation -- who writes it? **Resolved (D8, eliminated)**: no working set. Conversation history is the working set. Tools are stateless.
- [x] Q12: `buildSystem()` API change -- how does it receive `ResolvedContext`? **Resolved (D15)**: explicit optional parameter, backward-compatible. Becomes async.
- [x] Q13: Resolver error handling -- what happens when layers fail? **Resolved (D16)**: per-layer error strategy. No layer failure crashes the agent.
- [x] Q14: Schema versioning for persisted types? **Resolved (D17)**: `schemaVersion` field + migration functions on read.
- [x] Q15: Should tokens move into the context kernel? **Resolved (D18)**: no. Tokens stay in `ToolContext`, context stays in `ResolvedContext`. Different lifecycles.

### Open (deferred -- not blocking Phase 1)

- [ ] Q4: **Process template cache scoping (Phase 4)**
  ADO allows different process templates per project within the same org. When we build process template awareness (Phase 4, unit 4A), should we cache the fetched template definition per-project or per-org?
  - **Per-project** (recommended): matches ADO's scoping. Each project can have a different process (Basic, Agile, Scrum). Caching per-org would return wrong results if projects differ.
  - **Per-org**: fewer cache entries but incorrect if projects use different templates.
  - **Decision needed before**: Phase 4 doing doc creation.

- [ ] Q5: **Preference editing mechanism (Phase 3+)**
  Should user preferences be editable via slash commands at runtime (e.g., `/set verbosity detailed`), via config file only, or both?
  - **Both** (recommended): slash commands for runtime changes that persist via `ContextStore`. Config file for initial setup and bulk configuration. Slash commands are more discoverable; config file is more powerful.
  - **Config file only**: simpler to implement, but poor discoverability.
  - **Slash commands only**: no way to pre-configure before first interaction.
  - **Decision needed before**: Phase 3 doing doc creation (when preference-consuming tools are built).

- [ ] Q7: **Semantic vs generic ADO tool coexistence (Phase 3)**
  Should the new semantic ADO tools (`ado_create_epic`, `ado_move_items`, etc.) replace the existing generic `ado_query`/`ado_mutate` tools, or coexist alongside them?
  - **Coexist** (recommended): semantic tools are the preferred path for common operations. Generic tools remain as an escape hatch for edge cases, advanced queries, and operations not yet covered by semantic tools. The model naturally prefers semantic tools when available.
  - **Replace**: cleaner tool list, but loses flexibility for uncommon operations.
  - **Decision needed before**: Phase 3 doing doc creation.

- [ ] Q8: **Authority pre-flight endpoint selection (Phase 2)**
  For the hybrid authority model's write-path pre-flight check (D2), which ADO API endpoint should `canWrite()` probe to verify permissions without attempting the mutation?
  - **Security Namespaces API** (`/_apis/security/namespaces`) (recommended): returns granular permission bits per namespace. Well-documented. Can check specific actions (create work item, delete, etc.) without side effects.
  - **Permissions API** (`/_apis/permissions`): can check specific permission bits but less commonly used in ADO integrations.
  - **Decision needed before**: Phase 2 doing doc creation (unit 2B: `AuthorityChecker` implementation).

## Decisions Made

### D1: Architecture -- Typed Collection Store, Not Generic Key-Value
The context kernel defines a `ContextStore` interface with typed collection properties (`identity: CollectionStore<UserIdentity>`, `preferences: CollectionStore<UserPreferences>`). Each `CollectionStore<T>` provides `get(id)`, `put(id, value)`, `delete(id)`, `find(predicate)`. IDs are always plain strings (UUIDs) — no slashes, no compound keys, no encoding. Consumers write `store.identity.get(userId)` and get type-safe results with zero ambiguity. `FileContextStore` is the first (and initially only) adapter. The schema, resolution logic, and all consumer code never import `fs` or know where bytes live. This means swapping to a database, blob store, or API-backed store in the future requires implementing one interface — not refactoring every module. The file layout under `~/.agentconfigs/<agent>/context/` is an implementation detail of `FileContextStore`, not an architectural commitment. Adding a new persisted type = add one `CollectionStore<T>` property to `ContextStore`.

### D2: Authority -- Hybrid Model, Not Pure 403 Learning
Pure 403 learning means the agent proposes something, attempts it, fails, and then learns -- bad UX for destructive or visible operations (e.g., reparenting 50 work items, only to fail on item 1). The authority system uses a hybrid approach:
- **Read path (optimistic)**: assume allowed, attempt the call, learn from 403. Good for discovery. `canRead()` returns true until disproven.
- **Write path (pre-validated)**: before proposing a mutation plan, check a lightweight permissions endpoint to verify write access. `canWrite(scope)` probes before returning. If denied, the agent explains the limitation to the user rather than attempting and failing.
- The authority resolver distinguishes read vs. write via an `AuthorityChecker` that tools call with the operation type.

### D3: Channel Modeling -- Capability Flags, Not Just Enum
Channel context uses both an identifier (`"cli" | "teams"`) AND capability flags (`supportsMarkdown`, `supportsStreaming`, `supportsRichCards`, `maxMessageLength`, `availableIntegrations`). This allows the system to adapt behavior based on what the channel can actually do, rather than hardcoding per-channel behavior. The existing `Channel` type (`"cli" | "teams"`) in `src/mind/prompt.ts` becomes a key into a `ChannelCapabilities` lookup.

`availableIntegrations` is the single source of truth for what a channel can reach. ADO is Teams-only for the foreseeable future -- CLI has no OAuth tokens and therefore no integration access. This drives three consumers -- no per-channel switch statements anywhere:
1. **Tool routing**: `getToolsForChannel()` filters the tool list to only include tools whose integration is in `availableIntegrations`. If Discord declares `["github"]`, it gets GitHub tools but not ADO tools -- without any Discord-specific code in the router.
2. **Prompt injection**: `contextSection()` only renders authority constraints for integrations in the list. CLI users don't see ADO constraints because CLI has no integrations.
3. **Resolver**: `ContextResolver` skips authority resolution (Phase 2) if `availableIntegrations` is empty. No wasted API calls for channels that can't use the results.

Channel integration mapping:
- **CLI**: `availableIntegrations = []` -- no OAuth, no tokens, no integration access. Identity and preferences still work (local file-based), but no ADO/Graph/GitHub tools.
- **Teams**: `availableIntegrations = ["ado", "graph"]` -- OAuth-backed via Azure Bot Service token store. ADO and Graph tools available.

This replaces the current hardcoded pattern in `getToolsForChannel()` where `channel === "teams"` gates the Teams tool list. The channel capabilities definition becomes the single place to configure what a channel can do.

### D4: Authority Cache Invalidation -- TTL + Event-Driven
Authority profiles are cached with a configurable TTL (default: 30 minutes). Additionally, any 403 response from an ADO/Graph API call triggers immediate cache invalidation for that integration scope. This catches permission changes without waiting for TTL expiry.

### D5: ToolContext Extension -- Backward Compatible
The existing `ToolContext` interface in `src/repertoire/tools-base.ts` is extended (not replaced) with an optional `context?: ResolvedContext` field. The `adoOrganizations` field is removed — org validation moves to runtime scope discovery (see D20). This means existing tool handlers need minor updates (replace `validateAdoOrg()` with scope discovery), but the overall shape is backward-compatible. New semantic tools access context layers on demand.

### D6: Resolver -- Eager in Phase 1, Lazy When Needed
**Phase 1**: all resolution is cheap. Identity = file read, Preferences = file read, Channel = pure lookup. No expensive I/O. The resolver resolves everything eagerly into a `ResolvedContext` with direct values. Simple, no Promises.

**Phase 2**: authority resolution requires API calls (pre-flight permission checks). When authority is introduced, the resolver gains `Promise<T>` fields for expensive layers — standard TypeScript, no Proxy objects. Consumers `await context.authority` when they need it; those that don't pay zero cost.

**Principle**: don't add laziness until there's something expensive to be lazy about. Phase 1 has nothing expensive — don't over-engineer it.

### D7: Phasing -- Interleaved, Not Back-Loaded
The previous design built all foundation (types, resolvers, storage, pipeline) before any consumer touched it. That is too much untested infrastructure. The revised phasing:
- Phase 1 builds Identity + Preferences + Storage Interface + Channel, then immediately wires them through ONE real ADO operation (with inline scope discovery) in the Teams channel. This proves the kernel end-to-end with real data.
- Phase 2 builds Authority only after Phase 1's consumer proves the pattern works. Authority is wired into existing `ado_mutate`; authority constraints are added to the prompt.
- Phase 3 adds semantic ADO tools that pull on all layers.
- Phase 4 adds intelligence features (process templates, structural safety).
Each phase delivers working, tested, consumer-visible functionality -- not just infrastructure.

### D8: No Session Layer -- Conversation History IS the Session
The original five-layer design included a `SessionContext` layer with working set, active scope, and execution mode. This was eliminated because:
- **Working set** duplicates tool results already in conversation history. If history is trimmed, the model can re-query rather than maintaining a parallel cache.
- **Execution mode** (`discussion` / `planning` / `mutation`) duplicates the model's natural conversational intent inference. Tracking it as explicit state adds overhead without adding information.
- **Active scope** is a runtime concern. The user's available scopes are discovered via API when needed; the current scope is tracked in the conversation context window.
- **Tools are stateless**: every tool call includes all required context (org, project, IDs). No tool reads from ambient session state. The model must always provide what the tool needs. If the model doesn't know, it asks the user.
- **The ouroboros metaphor holds**: the conversation *is* the memory. The agent eats its tail (trims old messages) but identity and preferences survive through persisted context. We don't need a parallel memory system for information that lives in the messages.

### D9: File Layout -- Agent-Creature Body Metaphor (see D19)
New code follows the agent-creature body metaphor (D19). The context kernel lives in `src/mind/` because context IS the agent's reasoning frame. Semantic tools live in `src/repertoire/` because they are capabilities the agent can perform.

**Context kernel files** (`src/mind/context/`):
- `src/mind/context/types.ts` -- all layer type definitions (UserIdentity, UserPreferences, ChannelCapabilities, ResolvedContext)
- `src/mind/context/store.ts` -- `CollectionStore<T>` and `ContextStore` interfaces
- `src/mind/context/store-file.ts` -- `FileContextStore` adapter
- `src/mind/context/identity.ts` -- UserIdentity resolution (get-or-create, external ID lookup)
- `src/mind/context/authority.ts` -- Authority resolution and `AuthorityChecker`
- `src/mind/context/preferences.ts` -- Preferences resolution (load, defaults, write-back)
- `src/mind/context/channel.ts` -- ChannelCapabilities lookup (hardcoded map)
- `src/mind/context/resolver.ts` -- `ContextResolver` (resolves identity + preferences, returns ResolvedContext)

**Semantic tool files** (`src/repertoire/`):
- `src/repertoire/ado-semantic.ts` -- semantic ADO tools (create_epic, move_items, etc.)
- `src/repertoire/ado-templates.ts` -- process template detection and hierarchy rules

**Test files** (mirror structure):
- `src/__tests__/mind/context/` -- tests for all context modules
- `src/__tests__/repertoire/ado-semantic.test.ts` -- tests for semantic ADO tools

Note: `src/mind/` already contains `prompt.ts` and `context.ts` (session management). The new `context/` subdirectory is for the context kernel -- distinct from `context.ts` which handles session save/load/trim. The naming is intentional: `src/mind/context.ts` = session memory, `src/mind/context/` = user context kernel.

### D10: System Prompt Injection -- Context Reaches the Model, Not Just Tools
The context kernel resolves identity, authority, preferences, and channel -- but the model can only reason within constraints it can see. Without prompt injection, authority limits are invisible to the model until a tool call fails. This wastes turns and produces bad UX (proposing an epic restructure, then failing on the first API call).

`buildSystem()` already runs per-turn and assembles sections. It gains a new `contextSection()` that renders the resolved context into the system prompt:

```
## user context
user: Jordan (jordan@contoso.com)
channel: teams (markdown, no streaming, max 4000 chars)
known scopes:
  ado/contoso: Platform, Infrastructure, Mobile
  ado/fabrikam: Backend
when the user asks about work items without specifying a project, ask which one.

## authority constraints
- ado/contoso/Platform: can read, can create issues, CANNOT create epics, CANNOT delete
- scope limited to area path "Platform\Backend"

## preferences
- confirmation: mutations-only
- verbosity: concise
- ado: issue-first planning, auto-assign on
```

Design rules:
- **Rebuilt per-turn**: `buildSystem()` already runs each turn. Preferences may be updated mid-conversation (e.g., model learns a new scope), so the prompt must reflect the latest persisted state.
- **Authority constraints are explicit**: rendered as "can / CANNOT" so the model plans around limitations upfront rather than discovering them at tool execution time.
- **Resolver feeds it**: `contextSection()` reads from `ResolvedContext` (identity, preferences, channel). Identity and preferences are always available (resolved eagerly). Scopes are NOT in the prompt — they're a tool-level concern (discovered inline by ADO tool handler, conversation carries them forward). Authority constraints (Phase 2) rendered after authority resolution.
- **Graceful degradation**: if no context is available yet (first turn, CLI with no identity configured), the section is omitted entirely. The agent works exactly as it does today.
- **No duplication**: channel info already in `runtimeInfoSection()` gets its flags from `ChannelCapabilities` instead of hardcoded strings, but the section name and position stay the same.
- **No session state in prompt**: the conversation history is the session. The model knows what it queried, what it created, and what the user is focused on from the messages. The prompt only carries persistent context (identity, authority, preferences) and static context (channel capabilities).

This is wired in Phase 1 (1G) for identity + preferences, and extended in Phase 2 (2D) for authority.

### D11: Authority → Scope Re-Discovery on 403
Scopes are discovered at runtime via ADO APIs and carried forward in the conversation — there is no cache (in-memory or persisted). When Authority (Phase 2) records a 403 on a scope, the next tool call that needs scopes re-discovers them via the ADO APIs. The revoked scope naturally disappears because the API no longer returns it. No cross-layer feedback needed — the API is the source of truth.

### D12: Cross-Channel Identity -- Designed For Multi-Channel From Day One
Users will talk to the agent from many channels over time -- Teams today, Discord/Telegram/iMessage/web tomorrow. The identity model must make cross-channel linking a natural extension, not a retrofit.

**Hard rules:**
1. **Internal UUID is the only primary key.** Every channel-specific identity is just an entry in `externalIds[]`. No system -- storage keys, authority cache keys, preference lookups -- ever uses an external ID as a primary key. Everything keys off the internal UUID.
2. **`CollectionStore` IDs are always internal UUIDs, never external IDs.** `store.identity.get(userId)`, `store.preferences.get(userId)`. If we accidentally key by AAD ID, adding Discord later requires a migration. Don't.
3. **Identity resolution is always: external ID -> lookup -> internal UUID.** `store.identity.find(u => u.externalIds.some(...))` scans identities by predicate. This is the secondary index path — `FileContextStore` scans files, a DB adapter would use a proper index.
4. **Linking = adding an external ID to an existing `UserIdentity`.** If Jordan uses Teams (AAD) and later uses Discord, the Discord channel resolves to no existing identity, prompts the user to link, and adds the Discord external ID to Jordan's existing `UserIdentity`. One user, many external IDs, one set of preferences.
5. **Unlinking = removing an external ID.** The user can detach a channel identity. If only one external ID remains, the `UserIdentity` persists (it's keyed by UUID, not by external ID).

**Channel-specific resolution paths (current):**
- **Teams**: AAD userId + tenantId from bot activity. Look up by `{ provider: "aad", externalId: "...", tenantId: "..." }`.
- **CLI**: no OAuth. Keyed by OS username. Look up by `{ provider: "local", externalId: os.userInfo().username }`.
- **Future channels** (Discord, Telegram, web): each provides its own external ID. Same pattern -- look up by external ID, get-or-create `UserIdentity`.

**What we build now vs later:**
- **Now**: identity resolution with get-or-create, `ContextStore` with external ID lookup, `externalIds[]` as an array on `UserIdentity`. The data model supports multiple external IDs from day one.
- **Later**: linking UX (`/link-identity`), unlinking, conflict resolution when merging two existing identities (whose preferences win?).

### D13: Resolver Lifecycle -- Store Per-Process, Resolver Per-Request
Two distinct lifecycles:
- **`FileContextStore`**: created once at app startup, shared across all requests. It's a stateless I/O layer — just reads/writes JSON files. No per-user state. The startup code resolves the base path from existing config (`getConfigDir() + "/context"`) and passes it to the constructor.
- **`ContextResolver`**: created per-request (per-incoming-message), per-user. Each message from a different user needs its own resolver with its own identity. Created by the channel adapter, attached to `ToolContext.context`, discarded after the turn completes.

Channel adapter responsibilities:
- **Teams** (`handleTeamsMessage()`): extracts AAD userId + tenantId from the bot activity. Creates a resolver with `{ provider: "aad", externalId: activity.from.aadObjectId, tenantId }`. Attaches to `ToolContext` alongside OAuth tokens.
- **CLI**: extracts OS username. Creates a resolver with `{ provider: "local", externalId: os.userInfo().username }`. CLI currently doesn't build a `ToolContext` (no tokens needed) — Phase 1 adds a minimal `ToolContext` with just the `context` field so CLI gets identity + preferences without integration access.

In-memory caches (Authority TTL, Phase 2) live at module scope and are keyed by userId+integration+scope, so they survive across requests for the same user without leaking across users.

### D14: Identity Bootstrapping -- Always Get-or-Create
Identity resolution is always "get or create." When a user first interacts with the agent, if no `UserIdentity` exists for the channel's external ID, one is created automatically with sensible defaults:
- **Teams**: the bot activity carries an AAD userId and tenantId. The resolver calls `ContextStore.find("identity", ...)` to look up by external ID. If not found, it mints a new internal UUID, creates a `UserIdentity` with the AAD external ID, and persists it. Display name comes from the bot activity or a Graph API call.
- **CLI**: keyed by OS username (`os.userInfo().username`). Same get-or-create pattern. Display name defaults to the OS username.
- No manual setup required. No onboarding flow. The user just starts talking and identity is created transparently on first contact.

### D15: buildSystem() API Change -- Explicit Optional Context Parameter
`buildSystem()` currently takes `(channel, options?)`. To render the context section (identity, preferences), it needs access to `ResolvedContext`. The solution is an explicit optional parameter: `buildSystem(channel, options?, context?)`. When `context` is absent, the context section is omitted entirely (graceful degradation — the agent works exactly as it does today). In Phase 1, `buildSystem()` stays synchronous because `ResolvedContext` is fully resolved (no Promises). In Phase 2, it becomes async when authority (Promise) is added. Backward-compatible: callers that don't pass context get the same behavior as before.

### D16: Resolver Error Handling -- Per-Layer Strategy
Each context layer has its own error handling strategy. No layer failure should crash the agent.
- **Identity**: on `ContextStore` read failure (corrupted file, permissions error), auto-create a fresh identity with defaults (same as D14 bootstrapping). On write failure, log and continue -- the identity will be re-created next turn.
- **Authority**: on error (API timeout, unreachable ADO endpoint, corrupted cache), assume optimistic -- same behavior as if authority was never resolved. No constraints in prompt. 403 learning kicks in at tool execution time as normal.
- **Preferences**: on read failure or missing file, fall back to built-in defaults in code (`verbosity: "normal"`, `confirmationPolicy: "mutations-only"`, etc.). No preferences file is created on first contact — only written when the user makes a non-default choice. On write failure, log and continue.
- **Channel**: pure lookup, no I/O, cannot fail in practice. If the channel identifier is unknown, use a minimal default capabilities set.

### D17: Schema Versioning -- Migration Functions on Read
Every persisted type (`UserIdentity`, `UserPreferences`) carries a `schemaVersion: number` field. On read from `ContextStore`, if the stored version is older than the current code's expected version, a migration function runs:
- Adds new fields with sensible defaults.
- Removes deprecated fields.
- Bumps `schemaVersion` to current.
- Writes the migrated record back to `ContextStore` (so migration only runs once per record).
Migrations are simple pure functions (old data in, new data out), not a framework. Version 1 is the initial schema. Each version bump has one migration function. They compose: v1 -> v2 -> v3 if needed.

### D18: Token Separation -- Tokens Stay in ToolContext, Context Stays in ResolvedContext
Tokens (`graphToken`, `adoToken`) remain in `ToolContext`. They are ephemeral per-turn credentials fetched fresh from Azure Bot Service's token store on each incoming message. The context kernel (`ResolvedContext`) manages user knowledge: who you are (Identity), what you prefer (Preferences), and what the channel supports (Channel). Only Identity and Preferences are persisted (via `ContextStore`); everything else is runtime (scope discovery, authority cache). Tokens and context coexist on the same `ToolContext` object (D5: `context?: ResolvedContext`) but serve different purposes.

### D19: Source Directory Structure -- Agent-Creature Body Metaphor
All top-level source directories MUST map to a part of the agent-creature's body. This is not a suggestion -- it is a naming convention enforced across the codebase. No new top-level `src/` directory may be created unless it fits the metaphor.

**The mapping:**
- **`src/heart/`** -- core agent loop, streaming, API error handling, kick detection. The beating heart that drives the agent's turn-by-turn execution. (Renamed from `src/engine/`)
- **`src/mind/`** -- prompt construction, context kernel, session memory, reasoning frame. Everything the agent "thinks about" to form responses. Context kernel lives here at `src/mind/context/`. (Already exists)
- **`src/repertoire/`** -- tools, skills, commands, API clients. The capabilities the agent can perform -- what it knows how to do. Tool definitions, handlers, ADO client, Graph client, slash commands all live here. (Already exists for skills; tool files move here from `src/engine/`)
- **`src/wardrobe/`** -- formatting, phrases, presentation. How the agent dresses up its output. (Already exists)
- **`src/senses/`** -- channel adapters (CLI, Teams). How the agent perceives and responds to the outside world. Each channel is a sense. (Renamed from `src/channels/`)

**Renames performed in unit 10 (Phase 1 prerequisite):**
- `src/engine/` -> `src/heart/` (core.ts, streaming.ts, kicks.ts stay)
- `src/channels/` -> `src/senses/` (cli.ts, teams.ts stay)
- Tool files move from `src/engine/` -> `src/repertoire/` (tools.ts, tools-base.ts, tools-teams.ts, ado-client.ts, graph-client.ts, data/)

**Remaining files in their current locations** (unchanged):
- `src/identity.ts` -- agent identity (name, config). Top-level because it's cross-cutting.
- `src/config.ts` -- configuration loading. Top-level because it's cross-cutting.
- `src/cli-entry.ts`, `src/teams-entry.ts` -- entry points. Top-level by convention.

### D20: API-Discovered Scopes Replace Config-Based Org Allowlist
The existing `ado.organizations` config and `validateAdoOrg()` function were a pre-context-kernel workaround: manually list allowed orgs, reject anything else. This is replaced by API discovery:
1. **Org discovery**: `GET https://app.vssps.visualstudio.com/_apis/accounts?memberId={id}` returns all ADO orgs the user belongs to. The user's OAuth token is the source of truth — no manual config needed.
2. **Project discovery**: `GET https://dev.azure.com/{org}/_apis/projects` returns only projects the user can see within each org.
3. **No caching** — discovered scopes are not persisted or cached in memory. The conversation carries discovery results forward. Don't persist what you can re-derive.
4. **ADO tools discover scopes inline** when the model doesn't specify org/project. The API itself is the validation — if the user can't see it, the API won't return it. Same safety, zero config.

What gets removed:
- `ado.organizations` from `OuroborosConfig` and `AdoConfig`
- `adoOrganizations` from `ToolContext`
- `validateAdoOrg()` from `tools-teams.ts`
- `getAdoConfig()` from `config.ts` (unless other ADO config fields are added later)

What replaces them:
- Runtime API discovery in tool handlers (Accounts API → Projects API) using the user's OAuth token
- Conversation carries discovered scopes forward — no cache, no config allowlist

## Context / References

### Existing Codebase Architecture (Post-Restructuring)
Paths reflect the directory restructuring done in unit 10. The agent-creature body metaphor (D19) governs all top-level directories.

- **Entry points**: `src/cli-entry.ts` (CLI), `src/teams-entry.ts` (Teams with dotenv)
- **Heart** (core loop): `src/heart/core.ts` -- `runAgent()` loop, provider selection, streaming, tool execution
- **Mind** (reasoning): `src/mind/prompt.ts` -- `buildSystem()` assembles system prompt with channel-aware sections; `src/mind/context.ts` -- `saveSession()`, `loadSession()`, `postTurn()`, `trimMessages()`
- **Repertoire** (capabilities): `src/repertoire/tools-base.ts` (base tools), `src/repertoire/tools-teams.ts` (Teams-only tools including ADO/Graph), `src/repertoire/tools.ts` (channel-aware tool list)
- **ToolContext interface** (`src/repertoire/tools-base.ts`): `{ graphToken?, adoToken?, signin, adoOrganizations }` — `adoOrganizations` removed by context kernel (D20); org validation moves to runtime API discovery
- **ADO client**: `src/repertoire/ado-client.ts` -- generic `adoRequest()` and `queryWorkItems()` wrapper
- **Graph client**: `src/repertoire/graph-client.ts` -- generic `graphRequest()` and `getProfile()` wrapper
- **Senses** (channels): `src/senses/cli.ts` (readline REPL), `src/senses/teams.ts` (Teams SDK bot)
- **Identity**: `src/identity.ts` -- agent identity (name, config), NOT user identity
- **Config**: `src/config.ts` -- `OuroborosConfig` with providers, teams, oauth, ado, context, teamsChannel
- **Channel type**: `"cli" | "teams"` defined in `src/mind/prompt.ts`

### Key Integration Points for Context Kernel
1. **runAgent()** in `src/heart/core.ts` -- receives `channel` param, receives `ToolContext` via `RunAgentOptions.toolContext`. The resolver is already attached to `ToolContext.context` by the channel adapter before `runAgent()` is called. `runAgent()` does not create the resolver.
2. **handleTeamsMessage()** in `src/senses/teams.ts` -- builds `ToolContext` from OAuth tokens and ADO config. Creates the `ContextResolver` with the AAD external ID from the bot activity, attaches it to `ToolContext.context`.
3. **CLI adapter** in `src/senses/cli.ts` -- currently does not build a `ToolContext`. Phase 1 adds a minimal `ToolContext` with `context` field (resolver using OS username as external ID). No tokens, no integrations — identity and preferences only.
4. **getToolsForChannel()** in `src/repertoire/tools.ts` -- currently hardcodes `channel === "teams"` to gate Teams tools. Refactored to accept `ChannelCapabilities` and filter tools by `availableIntegrations` (see D3). New channels get integration-scoped tools without code changes to the router.
5. **execTool()** in `src/repertoire/tools.ts` -- dispatches to handler with `ToolContext`. New semantic tools need handlers registered here.
6. **sessionPath()** in `src/config.ts` -- `~/.agentconfigs/<agent>/sessions/<channel>/<key>.json`. Context storage follows a parallel pattern via `FileContextStore`.
7. **confirmationRequired** set in `src/repertoire/tools-teams.ts` -- semantic ADO mutation tools need to be added here.

### ADO API Patterns (from ado-client.ts and ado-endpoints.json)
- WIQL queries for work item search
- Batch work item fetch by IDs
- JSON Patch for work item mutations (content-type: `application/json-patch+json`)
- Organization scoping: `https://dev.azure.com/{org}/...`
- API version: 7.1
- **Org discovery**: `GET https://app.vssps.visualstudio.com/_apis/accounts?memberId={id}&api-version=7.1` — returns all orgs the user is a member of. Requires OAuth scope `vso.profile`.
- **Project discovery**: `GET https://dev.azure.com/{org}/_apis/projects?api-version=7.1` — returns only projects the authenticated user can see within an org.
- Process template API: `GET /{org}/{project}/_apis/work/processes`
- Work item types API: `GET /{org}/{project}/_apis/wit/workitemtypes`
- Security Namespaces API: `GET /{org}/_apis/security/namespaces` (for authority pre-flight checks)

### TypeScript Conventions (from tsconfig.json and existing code)
- Target: ES2022, Module: commonjs
- Strict mode, noUnusedLocals, noUnusedParameters
- Tests: vitest, `src/__tests__/` mirror of `src/`
- 100% coverage target with @vitest/coverage-v8

## Notes

**Standing rule: documentation travels with the code.** Every unit updates all relevant docs (CLAUDE.md, memory, cross-agent, psyche, markdown references) before it can be marked complete. This applies to every doing doc derived from this plan.

This is a large initiative that should be broken into multiple doing docs. The recommended phasing for the doing doc conversion:

**Doing Doc 1: Identity + Preferences + Storage Interface (Phase 1)**
Units 10, 1A-1H. Starts with directory restructuring (unit 10), then builds the storage interface, identity, preferences, channel capabilities, lazy resolver, system prompt injection, and wires through one real ADO operation. Proves the kernel end-to-end.

**Doing Doc 2: Authority (Phase 2)**
Units 2A-2D. Builds the hybrid authority model, wires it into existing tools and prompt. Depends on Doing Doc 1.

**Doing Doc 3: ADO Semantic Tools (Phase 3)**
Units 3A-3F. The new ADO tools that consume the full context kernel. Depends on Doing Doc 2.

**Doing Doc 4: ADO Intelligence (Phase 4)**
Units 4A-4C. Process templates, authority-aware planning, structural safety. Depends on Doing Doc 3.

### Proposed TypeScript Schema (for reference during doing doc conversion)

```typescript
// src/mind/context/store.ts

// Generic collection store -- one type, simple CRUD + find.
// IDs are always plain strings (UUIDs). No slashes, no compound keys.
interface CollectionStore<T> {
  get(id: string): Promise<T | null>;
  put(id: string, value: T): Promise<void>;
  delete(id: string): Promise<void>;
  // Scan all items in the collection and return the first match.
  // Used by identity resolution: "find the UserIdentity whose externalIds[] contains this external ID."
  // FileContextStore scans files in the collection directory.
  // A database adapter would use a proper index/query.
  find(predicate: (value: T) => boolean): Promise<T | null>;
}

// Typed context store -- each persisted type gets a named collection property.
// Adding a new persisted type = add one property here.
// Consumers write store.identity.get(userId), store.preferences.put(userId, prefs) -- type-safe, zero ambiguity.
interface ContextStore {
  readonly identity: CollectionStore<UserIdentity>;
  readonly preferences: CollectionStore<UserPreferences>;
}

// src/mind/context/store-file.ts

// First adapter: file-based storage under ~/.agentconfigs/<agent>/context/
// Each collection maps to a subdirectory: context/identity/, context/preferences/
// Each item maps to a JSON file: context/identity/{uuid}.json
// This is the ONLY module that touches fs for context data.
class FileContextStore implements ContextStore {
  readonly identity: CollectionStore<UserIdentity>;   // -> context/identity/
  readonly preferences: CollectionStore<UserPreferences>; // -> context/preferences/
  // Each property is a FileCollectionStore<T> pointing at its own directory.
}

// src/mind/context/types.ts

// --- Layer 1: Identity ---
interface ExternalId {
  provider: string;  // "aad", "local", "discord", "telegram", etc. -- extensible, not a closed union
  externalId: string;
  tenantId?: string;  // for AAD/Teams
  linkedAt: string;   // ISO date -- when this external ID was associated with the identity
}

interface UserIdentity {
  userId: string;  // internal, stable, uuid
  displayName: string;
  externalIds: ExternalId[];
  tenantMemberships: string[];  // AAD tenant IDs
  createdAt: string;  // ISO date
  updatedAt: string;
  schemaVersion: number;
  // No knownScopes here — scopes are discovered at runtime via ADO APIs
  // and carried forward in conversation. Don't persist what you can re-derive.
}

// --- Layer 2: Authority ---
interface AuthorityCapability {
  action: string;      // e.g., "createWorkItem", "reparentItems", "deleteWorkItem"
  allowed: boolean;
  scopeLimit?: string; // e.g., area path, project name
  learnedFrom?: "probe" | "403"; // how we know this
}

interface AuthorityProfile {
  integration: "ado" | "github" | "graph";
  scope: string;           // org/project
  capabilities: AuthorityCapability[];
  cachedAt: string;        // ISO date
  expiresAt: string;       // ISO date
}

// Hybrid authority checker: optimistic reads, pre-validated writes
interface AuthorityChecker {
  // Read path: optimistic, returns true unless we have cached 403 evidence
  canRead(integration: string, scope: string): boolean;
  // Write path: probes permissions endpoint before returning
  canWrite(integration: string, scope: string, action: string): Promise<boolean>;
  // Record a 403 failure for learning
  record403(integration: string, scope: string, action: string): void;
  // Invalidate cache for a scope (e.g., on TTL expiry)
  invalidate(integration: string, scope: string): void;
}

// --- Layer 3: Preferences ---
interface GlobalPreferences {
  verbosity: "concise" | "normal" | "detailed";
  confirmationPolicy: "always" | "mutations-only" | "never";
  previewBeforeMutation: boolean;
  riskTolerance: "cautious" | "normal" | "aggressive";
}

interface AdoPreferences {
  planningStyle: "epic-first" | "issue-first";
  autoAssignToSelf: boolean;
  backlogViewStyle: "flat" | "tree";
  // No defaultOrg/defaultProject — org/project selection is conversational.
  // Model disambiguates using API-discovered scopes; conversation tracks current project.
}

interface UserPreferences {
  global: GlobalPreferences;
  ado?: AdoPreferences;
  // Future: github?: GitHubPreferences;
  schemaVersion: number;
}

// --- Layer 4: Channel ---
interface ChannelCapabilities {
  channel: "cli" | "teams";
  availableIntegrations: ("ado" | "github" | "graph")[];  // which integrations this channel can reach
  supportsMarkdown: boolean;
  supportsStreaming: boolean;
  supportsRichCards: boolean;
  supportsInteractiveConfirmation: boolean;
  maxMessageLength: number;
  defaultVerbosity: "concise" | "normal" | "detailed";
  defaultConfirmationFriction: "low" | "medium" | "high";
  // CLI: availableIntegrations = [] -- no OAuth, no tokens, no integration access.
  //   Identity and preferences work (local file-based) but no ADO/Graph/GitHub tools.
  // Teams: availableIntegrations = ["ado", "graph"] -- OAuth-backed via Bot Service token store.
  //   ADO is Teams-only for the foreseeable future.
  // Prompt injection only renders authority constraints for integrations in this list.
}

// --- Resolved Context (output of resolver) ---
// Phase 1: all fields are direct values (everything is cheap to resolve).
// Phase 2: authority becomes Promise<AuthorityProfile[]> when API calls are needed.
// Principle: don't add laziness until there's something expensive to be lazy about.
interface ResolvedContext {
  readonly identity: UserIdentity;
  readonly channel: ChannelCapabilities;
  readonly preferences: UserPreferences;
  // Phase 2 adds:
  // readonly authority: Promise<AuthorityProfile[]>;
  // readonly checker: AuthorityChecker;
}
```

## Progress Log
- 2026-03-02 17:18 Created planning doc with full codebase analysis
- 2026-03-02 18:09 Rewrote planning doc: storage interface (not file-based commitment), hybrid authority (not pure 403 learning), lazy resolver (not upfront bag), interleaved phasing (not back-loaded)
- 2026-03-02 18:22 Added D10: system prompt injection -- context reaches the model via buildSystem(), not just tools. Authority constraints rendered as explicit can/CANNOT. Graceful degradation when no context available.
- 2026-03-02 18:47 Gap analysis: added Q9-Q15. Eliminated Session layer (D8 rewritten, five → four layers). Added D11 (Authority → Identity feedback loop, knownScopes pruned on 403).
- 2026-03-02 19:18 Added D12 (multi-channel identity, internal UUID as only primary key, ContextStore.find()), D13 (resolver per-request lifecycle), availableIntegrations on ChannelCapabilities.
- 2026-03-02 19:20 D3 expanded: availableIntegrations drives tool routing, prompt injection, and resolver. No per-channel switch statements.
- 2026-03-02 19:20 Cleaned up: fixed stale "session" refs, moved Preferences fully to Phase 1 (removed Phase 2 duplication), renumbered Phase 2 units.
- 2026-03-02 19:34 Batch update from review feedback: absorbed Q9/Q12/Q13/Q14/Q15 as D14-D18, restructured remaining open Qs (Q4/Q5/Q7/Q8) as self-contained deferred items, reordered all decisions D1-D18 sequentially, updated D6 + 1F to explicit Promise pattern (no proxy), clarified CLI has no ADO (Teams-only), updated 1H as Teams-channel-only wiring, updated ChannelCapabilities schema comments.
- 2026-03-02 19:46 Structural update: added D19 (agent-creature body metaphor -- heart/mind/repertoire/wardrobe/senses), added unit 10 (directory restructuring prerequisite -- engine/ -> heart/, channels/ -> senses/, tools -> repertoire/), rewrote D9 (file layout now under src/mind/context/ and src/repertoire/), updated all path references in Context/References, integration points, D5, and TypeScript schema comments. No stale engine/channels/context paths remain.
- 2026-03-03 19:50 Ambiguity audit (A1-A27 identified). Beginning item-by-item resolution.
- 2026-03-03 19:55 A1: removed list() from ContextStore (YAGNI -- no consumer needs it, find() covers identity resolution).
- 2026-03-03 20:13 A2+A3 (+A11, A20, A22): replaced generic key-value ContextStore with typed CollectionStore<T> properties. store.identity.get(userId) instead of get("identity/abc-123"). No slashes, no compound keys, IDs are plain UUIDs. FileContextStore constructor takes basePath (no internal path resolution). D13 rewritten: store per-process, resolver per-request, both channel paths specified. CLI adapter added as integration point 3.
- 2026-03-03 20:26 A4 (knownScopes): replaced learning-by-doing with API discovery. ADO projects API returns what the user can access — no recordKnownScope mechanism needed. Killed defaultOrg/defaultProject from AdoPreferences — org/project selection is conversational (model disambiguates using knownScopes, context window tracks current project). Simplified D11 feedback loop (403 → re-query API, scope disappears naturally). Removed IntegrationMembership type. Updated 1C, 1D, 1H, 3A, D10 example prompt, D11, completion criteria, schema.
- 2026-03-03 20:33 D20: API-discovered scopes replace config-based org allowlist. ADO Accounts API discovers orgs, Projects API discovers projects per org. Kills ado.organizations config, adoOrganizations on ToolContext, validateAdoOrg(). User's OAuth token is source of truth.
- 2026-03-03 20:46 Applied "don't persist what you can re-derive" across the board. Removed knownScopes and KnownScope type from UserIdentity — scopes are runtime, not persisted. Simplified resolver: eager in Phase 1, lazy in Phase 2. Renamed LazyResolvedContext → ResolvedContext, LazyContextResolver → ContextResolver. buildSystem() stays sync in Phase 1.
- 2026-03-03 20:53 Further simplified: no in-memory scope cache either. Conversation IS the cache. Tool handler discovers scopes via API when needed, model learns from result, conversation carries knowledge forward. Zero memory footprint, zero stale data. Scopes are a tool-level concern, not a context-kernel concern. Preferences only persisted when user makes a non-default choice.
- 2026-03-02 2108 Fixed 7 stale refs: D11 title+body (in-memory scope cache → conversation-as-cache), D20 points 3-4 and "what replaces them" (knownScopes → runtime API discovery), ToolContext reference (knownScopes → runtime API discovery), AdoPreferences comment, ChannelCapabilities comment, UserIdentity schema comment.
