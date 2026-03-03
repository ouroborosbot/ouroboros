# Planning: Context Kernel -- Structured Friend Context System

**Status**: NEEDS_REVIEW
**Created**: 2026-03-02 17:16

## Goal
Build a four-layer Context Kernel (Identity, Authority, Memory, Channel) that transforms the ouroboros agent from a bot that calls REST APIs into a constraint-aware reasoning engine operating within identity, authority, and channel boundaries.

**Core design principles:**
- **No caching anywhere.** APIs are the source of truth. Authority is learned fresh each turn via 403 responses and Security Namespaces API pre-flight probes (checker memoizes within the turn, discarded after). ADO scopes are discovered at runtime via Accounts + Projects APIs. Process templates are fetched when needed. The conversation carries all learned state forward across turns. Don't persist what you can re-derive.
- **Typed, not stringly.** `IdentityProvider` and `Integration` are closed union types. `ToolDefinition` wraps each tool's OpenAI schema with co-located metadata (handler, integration, confirmationRequired). No bare strings in the type system.
- **Model-managed memory.** `FriendMemory` with freeform `toolPreferences: Record<string, string>` -- the model decides what to store about each friend, not a typed schema.
- **Conversation IS the session.** No separate session state layer. Tools are stateless; the model provides all required context on every call.
- **Consumer-driven phasing.** Each phase wires real operations through the kernel as layers are built -- not after. One doing doc, four phases, one marathon.

**The kernel uses:** a storage-agnostic interface (`ContextStore` with typed `CollectionStore<T>` properties, file-based first adapter), a per-request resolver that builds context from store + APIs, a hybrid authority model (optimistic reads, pre-flight writes via Security Namespaces API), and a `ToolDefinition`-based tool registry filtered by channel capabilities.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

**Documentation is not an afterthought.** Every unit that adds, moves, or restructures files must update all relevant documentation (CLAUDE.md, memory files, cross-agent docs, psyche docs, code comments, markdown references) in the same unit. No deferring doc updates to a later cleanup pass.

## Scope

### In Scope

**Phase 1: Identity + Channel + Storage Interface (Smallest Vertical Slice)**
- 10. Directory restructuring (prerequisite) -- rename `src/engine/` to `src/heart/` (core loop, streaming, kicks, API error handling), rename `src/channels/` to `src/senses/` (channel adapters), move tool files (`tools.ts`, `tools-base.ts`, `tools-teams.ts`, `ado-client.ts`, `graph-client.ts`, and `data/` endpoint JSON files) from `src/engine/` to `src/repertoire/`. Update all imports across the codebase, all test file paths, and all documentation referencing old paths. This is a mechanical rename with no behavior changes -- all tests must pass identically before and after. Must be done first because all subsequent units reference the new paths.
- 1A. `ContextStore` interface -- typed collection properties, starting with `identity: CollectionStore<FriendIdentity>` in Phase 1. `CollectionStore<T>` provides `get(id)`, `put(id, value)`, `delete(id)`, `find(predicate)`. IDs are always plain strings (UUIDs), no slashes, no compound keys. All context persistence goes through this interface. No module imports file paths or `fs` directly for context data. `find(predicate)` supports identity resolution by external ID (scan + predicate for file store; proper index for future DB store). Adding a new persisted type = add one `CollectionStore<T>` property to `ContextStore`. Phase 3 adds `memory: CollectionStore<FriendMemory>` for model-managed per-friend notes.
- 1B. `FileContextStore` -- first adapter implementing `ContextStore`. Constructor takes a base path (e.g., `~/.agentconfigs/ouroboros/context`); it does not resolve the path itself. Each collection maps to a subdirectory (Phase 1: `context/identity/`), each item to a JSON file (`{uuid}.json`). This is the only module that touches the filesystem for context storage. Phase 3 adds `context/memory/`.
- 1C. `FriendIdentity` type and resolution -- internal ID (UUID), external ID mappings (AAD, Teams), tenant memberships, display name. Persisted via `ContextStore`. This is the only layer that truly needs persistence — the UUID ↔ external ID mapping can't be re-derived from an API.
- ~~1D.~~ *(Removed -- per-friend preferences moved to Phase 3 as `FriendMemory` with freeform `toolPreferences`. See 3G. Global preferences like verbosity and confirmation policy are agent-level concerns, not per-friend.)*
- 1E. `ChannelCapabilities` type -- channel identifier (`"cli" | "teams"`) plus capability flags (`supportsMarkdown`, `supportsStreaming`, `supportsRichCards`, `maxMessageLength`) plus `availableIntegrations` declaring which integrations the channel can reach. Defined as a hardcoded `const` map in `src/mind/context/channel.ts` keyed by channel identifier — channel adapters pass the channel string, the map returns the full capabilities object. Adding a new channel = add one entry to the map. Pure lookup, no resolution needed. Drives tool routing and prompt filtering.
- 1F. `ContextResolver` -- resolves identity (from store) and channel (from lookup) into a `ResolvedContext` object. In Phase 1, all resolution is cheap (file read + pure lookup) so everything resolves eagerly — no lazy Promises needed yet. Laziness (explicit `Promise<T>` fields) is introduced in Phase 2 when authority resolution requires API calls. Phase 3 adds memory resolution.
- 1G. System prompt injection -- `buildSystem()` becomes async from Phase 1 and gains a `contextSection()` that renders identity + channel into the system prompt. Async from the start to avoid a mid-stream signature change when Phase 2 adds `await context.authority` -- all callers are updated once. Rebuilt per-turn. Gracefully omitted when no context is available. Phase 2 adds authority constraints; Phase 3 adds memory (toolPreferences loaded dynamically per-tool, not in system prompt).
- 1H. Wire context through ONE real ADO operation (Teams channel only): the existing `ado_work_items` tool gains runtime scope discovery. The tool schema changes: `organization` becomes **optional** (currently required). When the model provides org/project, use them directly. When omitted, the tool handler discovers the friend's orgs/projects via ADO APIs (Accounts API → Projects API) and disambiguates: single org → auto-select; multiple orgs → return the list for the model to ask the friend which one. Same logic applies at the project level within an org. Zero orgs → return "no ADO organizations found" and the model tells the friend. The `validateAdoOrg()` call is replaced by this discovery flow. The conversation carries discovery results forward — no caching. This is the proof that the kernel works end-to-end. ADO is Teams-only (CLI has `availableIntegrations = []`, no OAuth tokens) so this wiring is tested exclusively via the Teams channel.

**Phase 2: Authority (Demand-Driven)**
- 2A. `Authority` type and resolution -- integration-scoped capability profiles using a hybrid model: optimistic on read-path (attempt and learn from 403), pre-flight check on write-path (verify before proposing destructive operations). No cache -- `AuthorityChecker` lives on the resolver (per-turn), memoizes within the turn, discarded after. Conversation carries authority knowledge across turns.
- 2B. `AuthorityChecker` -- distinguishes read operations (optimistic, learn from failure) from write operations (pre-validated). Provides `canRead(scope)` (always true until 403 disproves) and `canWrite(scope)` (probes API before returning). Pre-flight writes use the Security Namespaces API (`/_apis/security/namespaces`) to check granular permission bits without side effects (Q8).
- 2C. Wire Authority into existing `ado_mutate` tool -- before executing a mutation, check `canWrite()`. If denied, return a structured explanation instead of attempting and failing. Existing `ado_query` remains optimistic.
- 2D. Extend system prompt injection with authority constraints -- `contextSection()` renders "can / CANNOT" authority limits into the prompt so the model plans around constraints upfront (see D10).

**Phase 3: ADO Semantic Tools + Friend Memory (Full Consumer)**
- 3A. Per-friend ADO context (runtime scope discovery, conversational org/project selection) integrated into semantic tools
- 3G. `FriendMemory` type and resolution -- `memory: CollectionStore<FriendMemory>` added to `ContextStore`. `FriendMemory` has `toolPreferences: Record<string, string>` — freeform, model-managed per-tool notes. The model writes toolPreferences when a friend expresses a preference; the model reads them before calling the relevant tool. Stored as JSON (structured envelope, freeform content). A save tool allows the model to persist notes. No typed preference schema, no defaults, no enums — the model decides what matters.
- 3B. Enriched backlog query tool -- single-call `ado_backlog_list` with hierarchy, types, parent info, assignee
- 3C. Semantic ADO operations -- `ado_create_epic`, `ado_create_issue`, `ado_move_items`, `ado_restructure_backlog`, `ado_validate_structure`, `ado_preview_changes`
- 3D. Batch operations -- `ado_batch_update` client-side batching with plan validation and per-item results
- 3E. Channel-aware ADO behavior -- Teams gets summarized views, CLI gets structured tabular output
- 3F. Dry-run mode -- `ado_preview_changes` returns structured diff before mutation

**Phase 4: ADO Intelligence (Advanced)**
- 4A. Process template awareness -- fetch actual process template definition from ADO API, derive hierarchy rules, prevent illegal parent/child structures
- 4B. Authority-aware planning -- validate ADO permissions before proposing operations, adapt plans when friend lacks permission
- 4C. Structural safety -- `ado_detect_orphans`, `ado_detect_cycles`, `ado_validate_parent_type_rules`

### Out of Scope
- GitHub integration consumer (future phase, after ADO proves the kernel)
- Microsoft Graph integration consumer beyond existing tools (future phase)
- Web UI channel (no web frontend exists today)
- Email channel
- Multi-agent context sharing (each agent has its own context)
- Database-backed or cloud-backed storage adapters (file adapter is the only one built; interface exists for future adapters)
- OAuth flow changes (existing Teams SDK OAuth is kept as-is)
- Changes to the LLM provider layer (Azure/MiniMax config unchanged)
- **`world` / `rapport` notes on FriendMemory (future)** -- per-friend social/professional graph notes (`world`) and agent relationship notes (`rapport`), both prompt-loaded. Postponed until `toolPreferences` proves the model-managed notes pattern in Phase 3. When built, these replace `FRIENDS.md` (psyche/FRIENDS.md) -- per-person knowledge moves from a static psyche file to dynamic model-managed memory. The channel-level social norm ("speaking to Microsoft employees") belongs in IDENTITY.md, not per-friend.
- Typed per-friend preference schemas (killed — verbosity, confirmationPolicy, riskTolerance are agent-level concerns defined in psyche, not per-friend preferences)

## Completion Criteria
- [ ] `ContextStore` interface defined with typed collection properties; Phase 1: `identity` only; Phase 3 adds `memory`. Each `CollectionStore<T>` provides `get`/`put`/`delete`/`find`; `FileContextStore` implements it
- [ ] No context module imports `fs` directly -- all persistence goes through `ContextStore`
- [ ] All four context layers (Identity, Authority, Memory, Channel) have TypeScript types and resolution functions (phased: Identity + Channel in Phase 1, Authority in Phase 2, Memory in Phase 3)
- [ ] `ContextResolver` resolves identity + channel eagerly in Phase 1; Phase 2 adds authority (lazy); Phase 3 adds memory
- [ ] Authority uses hybrid model: reads are optimistic (403 learning), writes have pre-flight check via Security Namespaces API (Q8)
- [ ] Identity persists across sessions via `ContextStore`; Authority is learned fresh per-turn (checker on resolver, memoized within turn, discarded after); FriendMemory (toolPreferences) persists via `ContextStore` (Phase 3)
- [ ] ADO scope discovery works at runtime via Accounts API + Projects API; conversation carries results forward (no caching)
- [ ] Tools are stateless — model provides all required context (org, project, IDs) on every call; no ambient session state
- [ ] ToolContext extension is backward-compatible -- existing tools work unchanged
- [ ] ADO tools use runtime scope discovery for org/project disambiguation instead of config allowlist
- [ ] At least 3 semantic ADO operations exist (create_epic, create_issue, move_items)
- [ ] Process template detection works for Basic, Agile, and Scrum
- [ ] Channel-aware formatting works for Teams and CLI
- [ ] Dry-run mode returns structured preview for ADO mutations
- [ ] Authority is scoped per-friend per-turn -- `AuthorityChecker` lives on the resolver (per-request), memoizes within the turn, discarded after (D13). Conversation history carries authority knowledge across turns.
- [ ] System prompt includes resolved context (identity, channel, authority constraints) via `contextSection()` in `buildSystem()`
- [ ] Authority constraints rendered as explicit "can / CANNOT" in prompt so model plans around limitations
- [ ] Prompt injection gracefully omitted when no context is available (CLI with no identity, first turn)
- [ ] `FriendMemory` type exists with `toolPreferences: Record<string, string>`; `ContextStore.memory` collection supports CRUD; a save tool lets the model persist notes; tool handlers can read `toolPreferences` from `ResolvedContext.memory` (Phase 3)
- [ ] `buildSystem()` is async; all callers use `await buildSystem()` (A15)
- [ ] `IdentityProvider` and `Integration` are typed unions -- no bare `string` in ExternalId.provider, AuthorityProfile.integration, AuthorityChecker methods, or ChannelCapabilities.availableIntegrations (A16)
- [ ] All tools use `ToolDefinition` wrapper; `getToolsForChannel()` filters by `ToolDefinition.integration` against `availableIntegrations`; separate `confirmationRequired` Set is removed (A21)
- [ ] `validateAdoOrg()`, `adoOrganizations` on ToolContext, and `ado.organizations` config are removed -- replaced by runtime API discovery (D20)
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
- [x] Q1: Should the `ContextResolver` pipeline be synchronous or async? **Resolved (D6)**: async. The resolver uses explicit `Promise<T>` fields for layers that require I/O (authority in Phase 2). Promises are eager-start (API call fires at resolver build time, A7); consumers await them when needed.
- [x] Q2: How should we model the identity-to-external-ID mapping when the same person uses CLI and Teams? **Resolved (D12)**: each channel has its own resolution path. Cross-channel linking is opt-in. CLI and Teams identities are separate for now.
- [x] Q3: Should authority profiles be eagerly fetched or lazily fetched? **Resolved (D6, A7)**: eager-start Promise, no cache. Authority is a `Promise<AuthorityProfile[]>` on the resolved context -- the API call fires immediately at resolver build time, consumers `await` when needed. Learned fresh each turn, conversation carries results forward.
- [x] Q6: How should we handle session context when the same friend is in Teams and CLI simultaneously? **Resolved (D8, superseded)**: Session layer was eliminated. Conversation history is per-channel. Identity and Memory are per-friend, shared across channels.
- [x] Q9: Identity bootstrapping -- who creates the `FriendIdentity` on first interaction? **Resolved (D14)**: always "get or create." Auto-create with sensible defaults, no manual setup.
- [x] Q10: Session persistence between turns? **Resolved (D8, eliminated)**: no structured session state. Conversation history saved via existing `saveSession()`. Persistent knowledge lives in Identity (and Memory, Phase 3) via `ContextStore`.
- [x] Q11: Working set mutation -- who writes it? **Resolved (D8, eliminated)**: no working set. Conversation history is the working set. Tools are stateless.
- [x] Q12: `buildSystem()` API change -- how does it receive `ResolvedContext`? **Resolved (D15)**: explicit optional parameter, backward-compatible. Async from Phase 1 (A15).
- [x] Q13: Resolver error handling -- what happens when layers fail? **Resolved (D16)**: per-layer error strategy. No layer failure crashes the agent.
- [x] Q14: Schema versioning for persisted types? **Resolved (D17)**: `schemaVersion` field + migration functions on read.
- [x] Q15: Should tokens move into the context kernel? **Resolved (D18)**: no. Tokens stay in `ToolContext`, context stays in `ResolvedContext`. Different lifecycles.
- [x] Q4: Process template cache scoping? **Resolved**: no cache. Process template is fetched from the ADO API at runtime when needed; the conversation carries the result forward. Same principle as authority and scope discovery -- don't cache what you can re-derive.
- [x] Q5: Preference editing mechanism? **Resolved (A5)**: preferences are freeform model-managed `toolPreferences` on `FriendMemory`. The model writes them conversationally, reads them before calling the relevant tool. No slash commands, no config file, no typed schema.
- [x] Q7: Semantic vs generic ADO tool coexistence? **Resolved**: coexist. Semantic tools are the preferred path for common operations. Generic tools (`ado_query`, `ado_mutate`) remain as an escape hatch for edge cases and operations not yet covered by semantic tools. The model naturally prefers semantic tools when available.
- [x] Q8: Authority pre-flight endpoint selection? **Resolved**: Security Namespaces API (`/_apis/security/namespaces`). Standard way ADO extensions check permissions -- well-documented, granular per-action permission bits, no side effects. Used by `AuthorityChecker.canWrite()` in unit 2B.

### Open

*(All questions resolved.)*

## Decisions Made

### D1: Architecture -- Typed Collection Store, Not Generic Key-Value
The context kernel defines a `ContextStore` interface with typed collection properties. Phase 1 has `identity: CollectionStore<FriendIdentity>` only; Phase 3 adds `memory: CollectionStore<FriendMemory>`. Each `CollectionStore<T>` provides `get(id)`, `put(id, value)`, `delete(id)`, `find(predicate)`. IDs are always plain strings (UUIDs) — no slashes, no compound keys, no encoding. Consumers write `store.identity.get(id)` and get type-safe results with zero ambiguity. `FileContextStore` is the first (and initially only) adapter. The schema, resolution logic, and all consumer code never import `fs` or know where bytes live. This means swapping to a database, blob store, or API-backed store in the future requires implementing one interface — not refactoring every module. The file layout under `~/.agentconfigs/<agent>/context/` is an implementation detail of `FileContextStore`, not an architectural commitment. Adding a new persisted type = add one `CollectionStore<T>` property to `ContextStore`.

### D2: Authority -- Hybrid Model, Not Pure 403 Learning
Pure 403 learning means the agent proposes something, attempts it, fails, and then learns -- bad UX for destructive or visible operations (e.g., reparenting 50 work items, only to fail on item 1). The authority system uses a hybrid approach:
- **Read path (optimistic)**: assume allowed, attempt the call, learn from 403. Good for discovery. `canRead()` returns true until disproven.
- **Write path (pre-validated)**: before proposing a mutation plan, probe the Security Namespaces API (`/_apis/security/namespaces`) to verify write access (Q8). `canWrite(scope)` probes before returning. If denied, the agent explains the limitation to the friend rather than attempting and failing.
- The authority resolver distinguishes read vs. write via an `AuthorityChecker` that tools call with the operation type.

### D3: Channel Modeling -- Capability Flags, Not Just Enum
Channel context uses both an identifier (`"cli" | "teams"`) AND capability flags (`supportsMarkdown`, `supportsStreaming`, `supportsRichCards`, `maxMessageLength`, `availableIntegrations`). This allows the system to adapt behavior based on what the channel can actually do, rather than hardcoding per-channel behavior. The existing `Channel` type (`"cli" | "teams"`) in `src/mind/prompt.ts` becomes a key into a `ChannelCapabilities` lookup.

`availableIntegrations` is the single source of truth for what a channel can reach. ADO is Teams-only for the foreseeable future -- CLI has no OAuth tokens and therefore no integration access. This drives three consumers -- no per-channel switch statements anywhere:
1. **Tool routing**: every tool is wrapped in a `ToolDefinition` that declares its `integration` (e.g., `"ado"`, `"graph"`, or `undefined` for base tools). `getToolsForChannel()` filters the `ToolDefinition[]` registry to only include tools whose `integration` is `undefined` (base tools, always included) or is in the channel's `availableIntegrations`. If Discord declares `["github"]`, it gets base tools + GitHub tools but not ADO tools -- without any Discord-specific code in the router. `ToolDefinition` also co-locates `confirmationRequired` (replaces the current separate `Set<string>` in `tools-teams.ts`) and the handler function.
2. **Prompt injection**: `contextSection()` only renders authority constraints for integrations in the list. CLI users don't see ADO constraints because CLI has no integrations.
3. **Resolver**: `ContextResolver` skips authority resolution (Phase 2) if `availableIntegrations` is empty. No wasted API calls for channels that can't use the results.

Channel integration mapping:
- **CLI**: `availableIntegrations = []` -- no OAuth, no tokens, no integration access. Identity still works (local file-based), but no ADO/Graph/GitHub tools.
- **Teams**: `availableIntegrations = ["ado", "graph"]` -- OAuth-backed via Azure Bot Service token store. ADO and Graph tools available.

This replaces the current hardcoded pattern in `getToolsForChannel()` where `channel === "teams"` gates the Teams tool list. The channel capabilities definition + `ToolDefinition.integration` become the single mechanism to configure what a channel can do.

### D4: Authority -- No Cache, Conversation Carries State
Authority has no TTL cache. The `AuthorityChecker` lives on the resolver (per-turn) and memoizes probe results within that turn. Across turns, the conversation carries authority knowledge forward -- the model sees previous 403s and probe results in the message history and acts accordingly. If messages get trimmed (ouroboros), the model loses that knowledge and re-probes on the next write attempt -- permissions might have changed anyway, and one lightweight probe per turn is cheap insurance before destructive mutations. This follows the "don't persist what you can re-derive" principle and eliminates all cache-related complexity (TTL, invalidation, cross-friend keying, stale entries).

### D5: ToolContext Extension + ToolDefinition Wrapper
The existing `ToolContext` interface in `src/repertoire/tools-base.ts` is extended (not replaced) with an optional `context?: ResolvedContext` field. The `adoOrganizations` field is removed -- org validation moves to runtime scope discovery (see D20). This means existing tool handlers need minor updates (replace `validateAdoOrg()` with scope discovery), but the overall shape is backward-compatible. New semantic tools access context layers on demand.

A new `ToolDefinition` wrapper type co-locates all tool metadata: the OpenAI tool schema, the handler function, the required `integration` (if any), and whether `confirmationRequired`. This replaces the current pattern of separate arrays (`tools`, `teamsTools`) and a separate `confirmationRequired` Set. All tools are registered in a single `ToolDefinition[]` array. `getToolsForChannel()` filters this array by matching `ToolDefinition.integration` against `ChannelCapabilities.availableIntegrations` (see D3).

### D6: Resolver -- Eager in Phase 1, Lazy When Needed
**Phase 1**: all resolution is cheap. Identity = file read, Channel = pure lookup. No expensive I/O. The resolver resolves everything eagerly into a `ResolvedContext` with direct values. Simple, no Promises.

**Phase 2**: authority resolution requires API calls (pre-flight permission checks). When authority is introduced, the resolver gains `Promise<T>` fields for expensive layers — standard TypeScript, no Proxy objects. The Promise is created eagerly at resolver build time (the API call starts immediately), not lazily on first access. Consumers `await context.authority` when they need it. For Teams (the only channel with integrations), nearly every turn involves ADO tools that need authority, so the eager call is never wasted. The resolver already skips authority entirely when `availableIntegrations` is empty (D3), so CLI pays zero cost.

**Principle**: don't add laziness until there's something expensive to be lazy about. Phase 1 has nothing expensive — don't over-engineer it.

### D7: Phasing -- Interleaved, Not Back-Loaded
The previous design built all foundation (types, resolvers, storage, pipeline) before any consumer touched it. That is too much untested infrastructure. The revised phasing:
- Phase 1 builds Identity + Channel + Storage Interface, then immediately wires them through ONE real ADO operation (with inline scope discovery) in the Teams channel. This proves the kernel end-to-end with real data.
- Phase 2 builds Authority only after Phase 1's consumer proves the pattern works. Authority is wired into existing `ado_mutate`; authority constraints are added to the prompt.
- Phase 3 adds semantic ADO tools that pull on all layers.
- Phase 4 adds intelligence features (process templates, structural safety).
Each phase delivers working, tested, consumer-visible functionality -- not just infrastructure.

### D8: No Session Layer -- Conversation History IS the Session
The original five-layer design included a `SessionContext` layer with working set, active scope, and execution mode. This was eliminated because:
- **Working set** duplicates tool results already in conversation history. If history is trimmed, the model can re-query rather than maintaining a parallel cache.
- **Execution mode** (`discussion` / `planning` / `mutation`) duplicates the model's natural conversational intent inference. Tracking it as explicit state adds overhead without adding information.
- **Active scope** is a runtime concern. The friend's available scopes are discovered via API when needed; the current scope is tracked in the conversation context window.
- **Tools are stateless**: every tool call includes all required context (org, project, IDs). No tool reads from ambient session state. The model must always provide what the tool needs. If the model doesn't know, it asks the friend.
- **The ouroboros metaphor holds**: the conversation *is* the memory. The agent eats its tail (trims old messages) but identity survives through persisted context (and toolPreferences survive via `FriendMemory` in Phase 3). We don't need a parallel memory system for information that lives in the messages.

### D9: File Layout -- Agent-Creature Body Metaphor (see D19)
New code follows the agent-creature body metaphor (D19). The context kernel lives in `src/mind/` because context IS the agent's reasoning frame. Semantic tools live in `src/repertoire/` because they are capabilities the agent can perform.

**Context kernel files** (`src/mind/context/`):
- `src/mind/context/types.ts` -- all layer type definitions (FriendIdentity, FriendMemory, ChannelCapabilities, ResolvedContext)
- `src/mind/context/store.ts` -- `CollectionStore<T>` and `ContextStore` interfaces
- `src/mind/context/store-file.ts` -- `FileContextStore` adapter
- `src/mind/context/identity.ts` -- FriendIdentity resolution (get-or-create, external ID lookup)
- `src/mind/context/authority.ts` -- Authority resolution and `AuthorityChecker` (Phase 2)
- `src/mind/context/memory.ts` -- FriendMemory resolution and toolPreferences read/write (Phase 3)
- `src/mind/context/channel.ts` -- ChannelCapabilities lookup (hardcoded map)
- `src/mind/context/resolver.ts` -- `ContextResolver` (Phase 1: identity + channel; Phase 2: + authority; Phase 3: + memory)

**Semantic tool files** (`src/repertoire/`):
- `src/repertoire/ado-semantic.ts` -- semantic ADO tools (create_epic, move_items, etc.)
- `src/repertoire/ado-templates.ts` -- process template detection and hierarchy rules

**Test files** (mirror structure):
- `src/__tests__/mind/context/` -- tests for all context modules
- `src/__tests__/repertoire/ado-semantic.test.ts` -- tests for semantic ADO tools

Note: `src/mind/` already contains `prompt.ts` and `context.ts` (session management). The new `context/` subdirectory is for the context kernel -- distinct from `context.ts` which handles session save/load/trim. The naming is intentional: `src/mind/context.ts` = session memory, `src/mind/context/` = friend context kernel.

### D10: System Prompt Injection -- Context Reaches the Model, Not Just Tools
The context kernel resolves identity, authority, memory, and channel -- but the model can only reason within constraints it can see. Without prompt injection, authority limits are invisible to the model until a tool call fails. This wastes turns and produces bad UX (proposing an epic restructure, then failing on the first API call).

`buildSystem()` already runs per-turn and assembles sections. It gains a new `contextSection()` that renders the resolved context into the system prompt:

```
## friend context
friend: Jordan (jordan@contoso.com)
channel: teams (markdown, no streaming, max 4000 chars)

## authority constraints
- ado/contoso/Platform: can read, can create issues, CANNOT create epics, CANNOT delete
- scope limited to area path "Platform\Backend"
```

Note: toolPreferences (Phase 3) are NOT injected into the system prompt — they are loaded dynamically when the model is about to call a tool that has associated preferences. ADO scopes are also not in the prompt — they're a tool-level concern (discovered inline, conversation carries them forward).

Design rules:
- **Rebuilt per-turn**: `buildSystem()` already runs each turn. Context may change mid-conversation, so the prompt must reflect the latest state.
- **Authority constraints are explicit**: rendered as "can / CANNOT" so the model plans around limitations upfront rather than discovering them at tool execution time.
- **Resolver feeds it**: `contextSection()` reads from `ResolvedContext` (identity, channel). Authority constraints (Phase 2) rendered after authority resolution.
- **Graceful degradation**: if no context is available yet (first turn, CLI with no identity configured), the section is omitted entirely. The agent works exactly as it does today.
- **No duplication**: channel info already in `runtimeInfoSection()` gets its flags from `ChannelCapabilities` instead of hardcoded strings, but the section name and position stay the same.
- **No session state in prompt**: the conversation history is the session. The model knows what it queried, what it created, and what the friend is focused on from the messages. The prompt only carries persistent context (identity, authority) and static context (channel capabilities).

This is wired in Phase 1 (1G) for identity + channel, and extended in Phase 2 (2D) for authority.

### D11: 403 Triggers Fresh Scope Discovery
Scopes are discovered at runtime via ADO APIs and carried forward in the conversation -- there is no cache (in-memory or persisted). When a tool call receives a 403 on a scope, the next tool call that needs scopes re-discovers them via the ADO APIs. The revoked scope naturally disappears because the API no longer returns it. No cross-layer feedback needed -- the API is the source of truth.

### D12: Cross-Channel Identity -- Designed For Multi-Channel From Day One
Friends will talk to the agent from many channels over time -- Teams today, Discord/Telegram/iMessage/web tomorrow. The identity model must make cross-channel linking a natural extension, not a retrofit.

**Hard rules:**
1. **Internal UUID is the only primary key.** Every channel-specific identity is just an entry in `externalIds[]`. No system -- storage keys, preference lookups -- ever uses an external ID as a primary key. Everything keys off the internal UUID.
2. **`CollectionStore` IDs are always internal UUIDs, never external IDs.** `store.identity.get(id)`, `store.memory.get(id)`. If we accidentally key by AAD ID, adding Discord later requires a migration. Don't.
3. **Identity resolution is always: external ID -> lookup -> internal UUID.** `store.identity.find(u => u.externalIds.some(...))` scans identities by predicate. This is the secondary index path — `FileContextStore` scans files, a DB adapter would use a proper index.
4. **Linking = adding an external ID to an existing `FriendIdentity`.** If Jordan uses Teams (AAD) and later uses Discord, the Discord channel resolves to no existing identity, prompts the friend to link, and adds the Discord external ID to Jordan's existing `FriendIdentity`. One friend, many external IDs, one set of memory.
5. **Unlinking = removing an external ID.** The friend can detach a channel identity. If only one external ID remains, the `FriendIdentity` persists (it's keyed by UUID, not by external ID).

**Channel-specific resolution paths (current):**
- **Teams**: AAD userId + tenantId from bot activity. Look up by `{ provider: "aad", externalId: "...", tenantId: "..." }`.
- **CLI**: no OAuth. Keyed by OS username. Look up by `{ provider: "local", externalId: os.userInfo().username }`.
- **Future channels** (Discord, Telegram, web): each provides its own external ID. Same pattern -- look up by external ID, get-or-create `FriendIdentity`.

**In scope vs out of scope:**
- **In scope (Phase 1)**: identity resolution with get-or-create, `ContextStore` with external ID lookup, `externalIds[]` as an array on `FriendIdentity`. The data model supports multiple external IDs from day one.
- **Out of scope**: linking UX (`/link-identity`), unlinking, conflict resolution when merging two existing identities (whose memory wins?).

### D13: Resolver Lifecycle -- Store Per-Process, Resolver Per-Request
Two distinct lifecycles:
- **`FileContextStore`**: created once at app startup, shared across all requests. It's a stateless I/O layer — just reads/writes JSON files. No per-friend state. The startup code resolves the base path from existing config (`getConfigDir() + "/context"`) and passes it to the constructor.
- **`ContextResolver`**: created per-request (per-incoming-message), per-friend. Each message from a different friend needs its own resolver with its own identity. Created by the channel adapter, attached to `ToolContext.context`, discarded after the turn completes.

Channel adapter responsibilities:
- **Teams** (`handleTeamsMessage()`): extracts AAD userId + tenantId from the bot activity. Creates a resolver with `{ provider: "aad", externalId: activity.from.aadObjectId, tenantId }`. Attaches to `ToolContext` alongside OAuth tokens.
- **CLI**: extracts OS username. Creates a resolver with `{ provider: "local", externalId: os.userInfo().username }`. CLI currently doesn't build a `ToolContext` (no tokens needed) — Phase 1 adds a minimal `ToolContext` with just the `context` field so CLI gets identity without integration access.

Authority has no in-memory cache (D4). The `AuthorityChecker` lives on the resolver -- created per-turn, discarded after the turn completes. Within a turn, it memoizes probe results (no redundant API calls to the same scope). Across turns, the conversation history carries authority knowledge forward. If messages get trimmed and the model forgets, it re-probes -- permissions might have changed anyway.

### D14: Identity Bootstrapping -- Always Get-or-Create
Identity resolution is always "get or create." When a friend first interacts with the agent, if no `FriendIdentity` exists for the channel's external ID, one is created automatically with sensible defaults:
- **Teams**: the bot activity carries an AAD userId and tenantId. The resolver calls `store.identity.find(...)` to look up by external ID. If not found, it mints a new internal UUID, creates a `FriendIdentity` with the AAD external ID, and persists it. Display name comes from the bot activity or a Graph API call.
- **CLI**: keyed by OS username (`os.userInfo().username`). Same get-or-create pattern. Display name defaults to the OS username.
- No manual setup required. No onboarding flow. The friend just starts talking and identity is created transparently on first contact.

### D15: buildSystem() API Change -- Async From Phase 1, Explicit Optional Context Parameter
`buildSystem()` currently takes `(channel, options?)`. To render the context section (identity, channel capabilities), it needs access to `ResolvedContext`. The solution is an explicit optional parameter: `buildSystem(channel, options?, context?)`. When `context` is absent, the context section is omitted entirely (graceful degradation -- the agent works exactly as it does today). `buildSystem()` becomes async in Phase 1, even though Phase 1 resolution has no Promises to await. This avoids a mid-stream signature change: all callers are updated to `await buildSystem()` once in Phase 1, and Phase 2 simply adds `await context.authority` inside the already-async function -- no caller changes needed. There is no chicken-and-egg: the resolver creates the authority Promise eagerly at build time (D6, A7), `buildSystem()` awaits the result -- by the time it runs, the API call is already in-flight or completed. Backward-compatible: callers that don't pass context get the same behavior as before.

**`cachedBuildSystem()` is removed.** The existing 60s TTL cache in `src/mind/context.ts` caches by channel -- with per-friend context, this would serve the wrong friend's identity. System prompt construction is string concatenation, not expensive enough to cache. Callers call `buildSystem()` directly. `resetSystemPromptCache()` is also removed.

### D16: Resolver Error Handling -- Per-Layer Strategy
Each context layer has its own error handling strategy. No layer failure should crash the agent.
- **Identity**: on `ContextStore` read failure (corrupted file, permissions error), auto-create a fresh identity with defaults (same as D14 bootstrapping). On write failure, log and continue -- the identity will be re-created next turn.
- **Authority**: on error (API timeout, unreachable ADO endpoint), assume optimistic -- same behavior as if authority was never resolved. No constraints in prompt. 403 learning kicks in at tool execution time as normal.
- **Memory** (Phase 3): on read failure or missing file, proceed with empty `toolPreferences` — the model simply has no notes for this friend yet. No memory file is created until the model writes the first note. On write failure, log and continue.
- **Channel**: pure lookup, no I/O, cannot fail in practice. If the channel identifier is unknown, use a minimal default capabilities set.

### D17: Schema Versioning -- Migration Functions on Read
Every persisted type (`FriendIdentity`, `FriendMemory`) carries a `schemaVersion: number` field. On read from `ContextStore`, if the stored version is older than the current code's expected version, a migration function runs:
- Adds new fields with sensible defaults.
- Removes deprecated fields.
- Bumps `schemaVersion` to current.
- Writes the migrated record back to `ContextStore` (so migration only runs once per record).
Migrations are simple pure functions (old data in, new data out), not a framework. Version 1 is the initial schema. Each version bump has one migration function. They compose: v1 -> v2 -> v3 if needed.

### D18: Token Separation -- Tokens Stay in ToolContext, Context Stays in ResolvedContext
Tokens (`graphToken`, `adoToken`) remain in `ToolContext`. They are ephemeral per-turn credentials fetched fresh from Azure Bot Service's token store on each incoming message. The context kernel (`ResolvedContext`) manages friend knowledge: who you are (Identity), what the channel supports (Channel), and what the agent remembers about you (Memory, Phase 3). Identity and Memory are persisted (via `ContextStore`); everything else is runtime (scope discovery, authority learned per-turn). Tokens and context coexist on the same `ToolContext` object (D5: `context?: ResolvedContext`) but serve different purposes.

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
1. **Org discovery**: `GET https://app.vssps.visualstudio.com/_apis/accounts?memberId={id}` returns all ADO orgs the friend belongs to. The friend's OAuth token is the source of truth — no manual config needed.
2. **Project discovery**: `GET https://dev.azure.com/{org}/_apis/projects` returns only projects the friend can see within each org.
3. **No caching** — discovered scopes are not persisted or cached in memory. The conversation carries discovery results forward. Don't persist what you can re-derive.
4. **ADO tools discover scopes inline** when the model doesn't specify org/project. The API itself is the validation — if the friend can't see it, the API won't return it. Same safety, zero config.

What gets removed:
- `ado.organizations` from `OuroborosConfig` and `AdoConfig`
- `adoOrganizations` from `ToolContext`
- `validateAdoOrg()` from `tools-teams.ts`
- `getAdoConfig()` from `config.ts` (unless other ADO config fields are added later)

What replaces them:
- Runtime API discovery in tool handlers (Accounts API → Projects API) using the friend's OAuth token
- Conversation carries discovered scopes forward — no cache, no config allowlist

## Context / References

### Codebase Architecture (as of unit 10 completion)
**NOTE for work-doer:** These paths reflect the codebase AFTER unit 10 (directory restructuring) completes. Before unit 10, the current paths are `src/engine/` (not `src/heart/`), `src/channels/` (not `src/senses/`), and tool files live in `src/engine/` (not `src/repertoire/`). All units after unit 10 reference the new paths below. The agent-creature body metaphor (D19) governs all top-level directories.

- **Entry points**: `src/cli-entry.ts` (CLI), `src/teams-entry.ts` (Teams with dotenv)
- **Heart** (core loop): `src/heart/core.ts` -- `runAgent()` loop, provider selection, streaming, tool execution
- **Mind** (reasoning): `src/mind/prompt.ts` -- `buildSystem()` assembles system prompt with channel-aware sections; `src/mind/context.ts` -- `saveSession()`, `loadSession()`, `postTurn()`, `trimMessages()`
- **Repertoire** (capabilities): `src/repertoire/tools-base.ts` (base tools), `src/repertoire/tools-teams.ts` (Teams-only tools including ADO/Graph), `src/repertoire/tools.ts` (channel-aware tool list)
- **ToolContext interface** (`src/repertoire/tools-base.ts`): `{ graphToken?, adoToken?, signin, adoOrganizations }` as of unit 10. Later units modify: unit 1H adds `context?: ResolvedContext` (D5); unit 1H removes `adoOrganizations` (D20, replaced by runtime API discovery)
- **ADO client**: `src/repertoire/ado-client.ts` -- generic `adoRequest()` and `queryWorkItems()` wrapper
- **Graph client**: `src/repertoire/graph-client.ts` -- generic `graphRequest()` and `getProfile()` wrapper
- **Senses** (channels): `src/senses/cli.ts` (readline REPL), `src/senses/teams.ts` (Teams SDK bot)
- **Identity**: `src/identity.ts` -- agent identity (name, config), NOT friend identity
- **Config**: `src/config.ts` -- `OuroborosConfig` with providers, teams, oauth, ado, context, teamsChannel
- **Channel type**: `"cli" | "teams"` defined in `src/mind/prompt.ts`

### Key Integration Points for Context Kernel
1. **runAgent()** in `src/heart/core.ts` -- receives `channel` param, receives `ToolContext` via `RunAgentOptions.toolContext`. The resolver is already attached to `ToolContext.context` by the channel adapter before `runAgent()` is called. `runAgent()` does not create the resolver.
2. **handleTeamsMessage()** in `src/senses/teams.ts` -- builds `ToolContext` from OAuth tokens and ADO config. Creates the `ContextResolver` with the AAD external ID from the bot activity, attaches it to `ToolContext.context`.
3. **CLI adapter** in `src/senses/cli.ts` -- currently does not build a `ToolContext`. Phase 1 adds a minimal `ToolContext` with `context` field (resolver using OS username as external ID). No tokens, no integrations — identity only.
4. **getToolsForChannel()** in `src/repertoire/tools.ts` -- currently hardcodes `channel === "teams"` to gate Teams tools. Refactored to accept `ChannelCapabilities` and filter the `ToolDefinition[]` registry: include tools where `integration` is `undefined` (base tools) or where `integration` is in `availableIntegrations` (see D3, D5). New channels get integration-scoped tools without code changes to the router.
5. **execTool()** in `src/repertoire/tools.ts` -- dispatches to handler with `ToolContext`. With `ToolDefinition`, the handler is co-located on the definition object -- `execTool()` looks up the `ToolDefinition` by name and calls its handler.
6. **sessionPath()** in `src/config.ts` -- `~/.agentconfigs/<agent>/sessions/<channel>/<key>.json`. Context storage follows a parallel pattern via `FileContextStore`.
7. **confirmationRequired** -- currently a separate `Set<string>` in `src/repertoire/tools-teams.ts`. Absorbed into `ToolDefinition.confirmationRequired` (boolean flag co-located on each tool definition). The separate Set is removed.

### ADO API Patterns (from ado-client.ts and ado-endpoints.json)
- WIQL queries for work item search
- Batch work item fetch by IDs
- JSON Patch for work item mutations (content-type: `application/json-patch+json`)
- Organization scoping: `https://dev.azure.com/{org}/...`
- API version: 7.1
- **Org discovery**: `GET https://app.vssps.visualstudio.com/_apis/accounts?memberId={id}&api-version=7.1` — returns all orgs the friend is a member of. Requires OAuth scope `vso.profile`.
- **Project discovery**: `GET https://dev.azure.com/{org}/_apis/projects?api-version=7.1` — returns only projects the authenticated friend can see within an org.
- Process template API: `GET /{org}/{project}/_apis/work/processes`
- Work item types API: `GET /{org}/{project}/_apis/wit/workitemtypes`
- Security Namespaces API: `GET /{org}/_apis/security/namespaces` (for authority pre-flight checks)

### TypeScript Conventions (from tsconfig.json and existing code)
- Target: ES2022, Module: commonjs
- Strict mode, noUnusedLocals, noUnusedParameters
- Tests: vitest, `src/__tests__/` mirror of `src/`
- 100% coverage target with @vitest/coverage-v8

## Notes

**Standing rule: documentation travels with the code.** Every unit updates all relevant docs (CLAUDE.md, memory, cross-agent, psyche, markdown references) before it can be marked complete.

**One doing doc, four phases.** All phases (1-4) go into a single doing doc and are worked through in one marathon. The phase labels (Phase 1, 2, 3, 4) are organizational sections within the doing doc, not separate timelines or separate doing docs. Units are executed in order within each phase, and phases are executed in order:

- **Phase 1: Identity + Channel + Storage Interface** -- Units 10, 1A-1C, 1E-1H (1D removed). Starts with directory restructuring, then builds storage, identity, channel, resolver, prompt injection, and wires through one real ADO operation.
- **Phase 2: Authority** -- Units 2A-2D. Hybrid authority model, wired into tools and prompt.
- **Phase 3: ADO Semantic Tools + Friend Memory** -- Units 3A-3G. Semantic ADO tools + FriendMemory with freeform toolPreferences.
- **Phase 4: ADO Intelligence** -- Units 4A-4C. Process templates, authority-aware planning, structural safety.

### Proposed TypeScript Schema (reference for doing doc units)

```typescript
// src/mind/context/store.ts

// Generic collection store -- one type, simple CRUD + find.
// IDs are always plain strings (UUIDs). No slashes, no compound keys.
interface CollectionStore<T> {
  get(id: string): Promise<T | null>;
  put(id: string, value: T): Promise<void>;
  delete(id: string): Promise<void>;
  // Scan all items in the collection and return the first match.
  // Used by identity resolution: "find the FriendIdentity whose externalIds[] contains this external ID."
  // FileContextStore scans files in the collection directory.
  // A database adapter would use a proper index/query.
  find(predicate: (value: T) => boolean): Promise<T | null>;
}

// Typed context store -- each persisted type gets a named collection property.
// Adding a new persisted type = add one property here.
// Consumers write store.identity.get(id), store.memory.get(id) -- type-safe, zero ambiguity.
interface ContextStore {
  readonly identity: CollectionStore<FriendIdentity>;
  // Added in unit 3G (Phase 3):
  // readonly memory: CollectionStore<FriendMemory>;
}

// src/mind/context/store-file.ts

// First adapter: file-based storage under ~/.agentconfigs/<agent>/context/
// Each collection maps to a subdirectory: context/identity/ (unit 3G adds context/memory/)
// Each item maps to a JSON file: context/identity/{uuid}.json
// This is the ONLY module that touches fs for context data.
class FileContextStore implements ContextStore {
  readonly identity: CollectionStore<FriendIdentity>;   // -> context/identity/
  // Added in unit 3G (Phase 3):
  // readonly memory: CollectionStore<FriendMemory>;     // -> context/memory/
  // Each property is a FileCollectionStore<T> pointing at its own directory.
}

// src/mind/context/types.ts

// Closed union types -- adding a new provider or integration requires a code change
// (which is correct: new providers need resolution logic, new integrations need API clients).
type IdentityProvider = "aad" | "local";  // "aad" = Teams/AAD, "local" = CLI/OS username
type Integration = "ado" | "github" | "graph";

// --- Layer 1: Identity ---
interface ExternalId {
  provider: IdentityProvider;  // closed union -- new channels add to IdentityProvider type
  externalId: string;
  tenantId?: string;  // for AAD/Teams
  linkedAt: string;   // ISO date -- when this external ID was associated with the identity
}

interface FriendIdentity {
  id: string;  // internal, stable, uuid
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
  integration: Integration;
  scope: string;           // org/project
  capabilities: AuthorityCapability[];
  // No cachedAt/expiresAt -- no TTL cache. Authority is learned fresh each turn (D4).
}

// Hybrid authority checker: optimistic reads, pre-validated writes.
// Lives on the resolver (per-turn, per-request). Within a single turn, memoizes
// probe results so multiple API calls to the same scope don't re-probe. Across turns,
// discarded -- cross-turn authority knowledge lives in conversation history.
// If the model remembers from history, it acts accordingly. If messages get trimmed
// and the model forgets, it re-probes -- permissions might have changed anyway.
interface AuthorityChecker {
  // Read path: optimistic, returns true unless a 403 was recorded this turn
  canRead(integration: Integration, scope: string): boolean;
  // Write path: probes permissions endpoint before returning
  canWrite(integration: Integration, scope: string, action: string): Promise<boolean>;
  // Record a 403 failure for learning (within this turn, memoized on the checker)
  record403(integration: Integration, scope: string, action: string): void;
}

// --- Layer 3: Memory (Phase 3) ---
// The agent's learned knowledge about a friend. All content is freeform, model-managed.
// Identity (FriendIdentity) = who you are (factual, for resolution).
// Memory (FriendMemory) = what I know about your preferences (learned, for behavior).
// No typed preference schemas — the model decides what matters.
interface FriendMemory {
  id: string;  // matches FriendIdentity.id
  toolPreferences: Record<string, string>;  // keyed by tool/integration, freeform content
  // e.g. { "ado": "Prefers issue-first planning. Auto-assign to self. Flat backlog view." }
  // Future: world, rapport (see Out of Scope)
  schemaVersion: number;
}

// --- Layer 4: Channel ---
interface ChannelCapabilities {
  channel: "cli" | "teams";
  availableIntegrations: Integration[];  // which integrations this channel can reach
  supportsMarkdown: boolean;
  supportsStreaming: boolean;
  supportsRichCards: boolean;
  maxMessageLength: number;
  // Only fields with actual consumers. Add more when there's a unit that needs them (YAGNI).
  // CLI: availableIntegrations = [] -- no OAuth, no tokens, no integration access.
  //   Identity works (local file-based) but no ADO/Graph/GitHub tools.
  // Teams: availableIntegrations = ["ado", "graph"] -- OAuth-backed via Bot Service token store.
  //   ADO is Teams-only for the foreseeable future.
  // Prompt injection only renders authority constraints for integrations in this list.
}

// --- Resolved Context (output of resolver) ---
// Phase 1 (units 1A-1H): identity + channel only (everything is cheap, no Promises).
// Unit 2A adds: authority + checker (Phase 2).
// Unit 3G adds: memory (Phase 3).
// Principle: don't add laziness until there's something expensive to be lazy about.
interface ResolvedContext {
  readonly identity: FriendIdentity;
  readonly channel: ChannelCapabilities;
  // Added in unit 2A (Phase 2):
  // readonly authority: Promise<AuthorityProfile[]>;
  // readonly checker: AuthorityChecker;
  // Added in unit 3G (Phase 3):
  // readonly memory: FriendMemory | null;  // null if no memory exists for this friend yet
}

// --- Tool Definition (src/repertoire/tools-base.ts) ---
// Wraps the OpenAI tool schema with co-located metadata.
// Replaces the current pattern of separate arrays (tools, teamsTools) + separate confirmationRequired Set.
// All tools registered in a single ToolDefinition[] array.
interface ToolDefinition {
  tool: OpenAI.ChatCompletionTool;
  handler: ToolHandler;
  integration?: Integration;        // undefined = base tool (always available); "ado" | "graph" | "github" = requires this integration
  confirmationRequired?: boolean;   // true = requires friend confirmation before execution (mutations)
}
// getToolsForChannel() filters ToolDefinition[] by matching integration against ChannelCapabilities.availableIntegrations.
// Base tools (integration undefined) are always included. Integration tools are included only if the channel declares that integration.
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
- 2026-03-03 20:13 A2+A3 (+A11, A20, A22): replaced generic key-value ContextStore with typed CollectionStore<T> properties. store.identity.get(id) instead of get("identity/abc-123"). No slashes, no compound keys, IDs are plain UUIDs. FileContextStore constructor takes basePath (no internal path resolution). D13 rewritten: store per-process, resolver per-request, both channel paths specified. CLI adapter added as integration point 3.
- 2026-03-03 20:26 A4 (knownScopes): replaced learning-by-doing with API discovery. ADO projects API returns what the user can access — no recordKnownScope mechanism needed. Killed defaultOrg/defaultProject from AdoPreferences — org/project selection is conversational (model disambiguates using knownScopes, context window tracks current project). Simplified D11 feedback loop (403 → re-query API, scope disappears naturally). Removed IntegrationMembership type. Updated 1C, 1D, 1H, 3A, D10 example prompt, D11, completion criteria, schema.
- 2026-03-03 20:33 D20: API-discovered scopes replace config-based org allowlist. ADO Accounts API discovers orgs, Projects API discovers projects per org. Kills ado.organizations config, adoOrganizations on ToolContext, validateAdoOrg(). User's OAuth token is source of truth.
- 2026-03-03 20:46 Applied "don't persist what you can re-derive" across the board. Removed knownScopes and KnownScope type from FriendIdentity — scopes are runtime, not persisted. Simplified resolver: eager in Phase 1, lazy in Phase 2. Renamed LazyResolvedContext → ResolvedContext, LazyContextResolver → ContextResolver. buildSystem() stays sync in Phase 1.
- 2026-03-03 20:53 Further simplified: no in-memory scope cache either. Conversation IS the cache. Tool handler discovers scopes via API when needed, model learns from result, conversation carries knowledge forward. Zero memory footprint, zero stale data. Scopes are a tool-level concern, not a context-kernel concern. Preferences only persisted when user makes a non-default choice.
- 2026-03-02 2108 Fixed 7 stale refs: D11 title+body (in-memory scope cache → conversation-as-cache), D20 points 3-4 and "what replaces them" (knownScopes → runtime API discovery), ToolContext reference (knownScopes → runtime API discovery), AdoPreferences comment, ChannelCapabilities comment, FriendIdentity schema comment.
- 2026-03-02 2145 A5 (preferences): killed GlobalPreferences (agent-level, not per-user), killed typed AdoPreferences schema. Replaced with freeform model-managed `FriendMemory` with `toolPreferences: Record<string, string>`. Moved entire Memory layer to Phase 3 (no consumer in Phase 1). Phase 1 ResolvedContext = identity + channel only. Added 3G unit for FriendMemory. Q5 resolved (model is the editor). Flagged world/rapport + FRIENDS.md replacement in Out of Scope. Fixed 1H stale "caches in memory". Updated Goal, D1, D3, D6, D7, D8, D9, D10, D12, D13, D15, D16, D17, D18, schema, completion criteria, doing doc summaries, integration points, all resolved Qs.
- 2026-03-02 2210 Renamed "user" → "friend" throughout. People who talk to the agent are friends, not users. Type renames: UserIdentity → FriendIdentity, UserMemory → FriendMemory. Field rename: userId → id on FriendIdentity/FriendMemory. Doc language: "per-user" → "per-friend", "the user" → "the friend" in all non-progress-log, non-historical sections. Kept "AAD userId" where it refers to the external system's field name. Kept "user" in progress log entries.
- 2026-03-02 2220 A6: ChannelCapabilities lives in a hardcoded const map in channel.ts keyed by channel identifier. Already answered by D3 + D9 — just made it explicit in unit 1E.
- 2026-03-02 2225 A7: Authority Promise is eager-start, not lazy. Created at resolver build time — API call fires immediately. Nearly every Teams turn needs authority anyway. Resolver skips entirely for CLI (no integrations). Clarified in D6.
- 2026-03-02 2228 A8: Kill cachedBuildSystem(). 60s TTL cache keyed by channel is wrong with per-friend context — would serve wrong friend's identity. buildSystem() is cheap string concatenation, no cache needed. Added to D15.
- 2026-03-02 2232 A9+A10: ado_work_items organization parameter becomes optional. Disambiguation cascade: single org → auto-select, multiple → model asks friend, zero → "no ADO organizations found." Same at project level. validateAdoOrg() replaced by discovery flow. Made explicit in unit 1H.
- 2026-03-02 2240 A12: No chicken-and-egg. Authority Promise is eager-start (A7), buildSystem() awaits it in Phase 2 (D15 already says it becomes async). Already resolved by D6+D15+A7.
- 2026-03-02 2159 A14: Authority cache keying already resolved by D13 (id+integration+scope). Module-scope Map confirmed as intended home. No doc changes needed.
- 2026-03-02 2202 A15: buildSystem() async from Phase 1. No two-step sync->async migration. All callers updated once in Phase 1; Phase 2 just adds await inside the already-async function. Updated D15, Q12, unit 1G.
- 2026-03-02 2204 A16: No bare strings in type system. Added `type IdentityProvider = "aad" | "local"` and `type Integration = "ado" | "github" | "graph"`. ExternalId.provider uses IdentityProvider, AuthorityProfile.integration and AuthorityChecker methods use Integration, ChannelCapabilities.availableIntegrations uses Integration[]. Adding a new provider or integration = add to the union (and write the supporting code).
- 2026-03-02 2207 A21: ToolDefinition wrapper type co-locates tool metadata. Each tool declares its OpenAI schema, handler, integration (if any), and confirmationRequired (if mutation). Replaces separate tools/teamsTools arrays + confirmationRequired Set. getToolsForChannel() filters ToolDefinition[] by matching integration against availableIntegrations. Updated D3, D5, integration points 4/5/7, added ToolDefinition to schema.
- 2026-03-02 2212 A23-A25 + kill authority TTL cache. Removed all authority cache/TTL references (D4 rewritten, D13 updated, D16 updated, D18 updated, unit 2A updated, AuthorityProfile loses cachedAt/expiresAt, AuthorityChecker loses invalidate()). Authority learned fresh each conversation -- no cache, no TTL, no invalidation. Completion criteria tightened: cross-tenant replaced with per-friend per-conversation scoping, FriendMemory made concrete (type + CRUD + save tool + read from ResolvedContext), added criteria for async buildSystem (A15), typed unions (A16), ToolDefinition (A21), removed validateAdoOrg (D20). A14 resolution (cache keying) is now moot.
- 2026-03-02 2214 One-doing-doc language pass. Rewrote Notes section: "multiple doing docs" replaced with "one doing doc, four phases." Updated Open Questions header and "Decision needed before" lines to reference phase units instead of separate doing docs. Fixed "deferred" wording on unit 1D.
- 2026-03-02 2224 Resolved Q4 (no process template cache -- fetch at runtime, conversation carries forward), Q5 (moved to Resolved), Q7 (coexist -- semantic preferred, generic as escape hatch). Only Q8 remains open. Fixed schema "Phase X adds" comments to reference specific units (3G, 2A). Clarified Context/References section for work-doer (paths are post-unit-10, current codebase still uses old names).
- 2026-03-02 2228 Q8 resolved: Security Namespaces API for pre-flight writes. All open questions now resolved. Final coherence pass: rewrote Goal to reflect final design (no caching, typed unions, ToolDefinition, Security Namespaces, one marathon). Fixed 7 issues: unit 2B references Security Namespaces API (Q8), D2 references Security Namespaces API, D12 "Users" -> "Friends", D14 stale ContextStore.find("identity",...) -> store.identity.find(...), D15 removed "caching can be re-added" hedge, duplicate ResolvedContext schema comment removed, Q1 clarified eager-start Promise, D12 "now vs later" -> "in scope vs out of scope", Out of Scope "Deferred" -> "Postponed", completion criterion updated with Security Namespaces API.
- PENDING_TIMESTAMP Final consistency fixes from friend review. (1) Q3 "lazy" -> "eager-start Promise" to match D6/A7. (2) AuthorityChecker lifecycle clarified: per-turn not per-conversation. Checker lives on resolver, memoizes within turn, discarded after. Cross-turn authority knowledge lives in conversation history; if trimmed, model re-probes. Updated D4, D13, D18, unit 2A, completion criteria, Goal, schema comments, Q3. (3) ChannelCapabilities: removed orphaned fields (supportsInteractiveConfirmation, defaultVerbosity, defaultConfirmationFriction) -- YAGNI, no consumer. (4) Context/References ToolContext: clarified post-unit-10 state vs later modifications by units 1H/D5/D20. (5) D11 retitled "403 Triggers Fresh Scope Discovery" -- tools re-discover, not authority layer.
