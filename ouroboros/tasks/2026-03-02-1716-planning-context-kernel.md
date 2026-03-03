# Planning: Context Kernel -- Structured User Context System

**Status**: NEEDS_REVIEW
**Created**: 2026-03-02 17:16

## Goal
Build a four-layer Context Kernel (Identity, Authority, Preferences, Channel) that transforms the ouroboros agent from a bot that calls REST APIs into a constraint-aware reasoning engine operating within identity, authority, and channel boundaries. The kernel uses a storage-agnostic interface (file-based first adapter), a lazy resolver that resolves layers on demand (not all upfront), a hybrid authority model (optimistic reads, pre-flight checks on mutations), and consumer-driven phasing that wires real ADO operations through the kernel as layers are built -- not after. The conversation history IS the session — there is no separate session state layer. Tools are stateless; the model provides all required context on every call.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### In Scope

**Phase 1: Identity + Preferences + Storage Interface (Smallest Vertical Slice)**
- 1A. `ContextStore` interface -- generic `get<T>(key)`, `put<T>(key, value)`, `delete(key)`, `list(prefix)` with typed layer keys. All context persistence goes through this interface. No module imports file paths or `fs` directly for context data.
- 1B. `FileContextStore` -- first adapter implementing `ContextStore`. Uses `~/.agentconfigs/<agent>/context/` layout. This is the only module that touches the filesystem for context storage.
- 1C. `UserIdentity` type and resolution -- internal userId, external ID mappings (AAD, Teams), tenant memberships, integration memberships (ADO orgs). Persisted via `ContextStore`. Includes `knownScopes` — an evergreen record of orgs/projects the user has previously worked in, updated automatically when the model interacts with an integration.
- 1D. `UserPreferences` type and resolution -- global preferences (verbosity, confirmation policy, preview-before-mutation) plus integration-scoped preferences (ADO planning style, auto-assign, default org/project). Persisted via `ContextStore`. The model writes back learned context (e.g., last-used project) as preference updates.
- 1E. `ChannelCapabilities` type -- channel identifier (`"cli" | "teams"`) plus capability flags (`supportsMarkdown`, `supportsStreaming`, `supportsRichCards`, `maxMessageLength`). Pure lookup, no resolution needed.
- 1F. `LazyContextResolver` -- the orchestrator that creates a proxy/accessor object where each layer is resolved on first access, not upfront. Identity is resolved eagerly (cheap, almost always needed). Authority and Preferences are resolved lazily (may require I/O, not always needed). Channel is a synchronous lookup.
- 1G. System prompt injection -- `buildSystem()` gains a `contextSection()` that renders identity + preferences + channel into the system prompt. Rebuilt per-turn. Gracefully omitted when no context is available.
- 1H. Wire Identity + Preferences through ONE real ADO operation: per-user default org/project. The existing `ado_work_items` tool drops the required `organization` parameter when preferences provide a default. This is the proof that the kernel works end-to-end before building more layers.

**Phase 2: Authority + Preferences (Demand-Driven)**
- 2A. `Authority` type and resolution -- integration-scoped capability profiles using a hybrid model: optimistic on read-path (attempt and learn from 403), pre-flight check on write-path (verify before proposing destructive operations). Cached with TTL + 403-triggered invalidation.
- 2B. `AuthorityChecker` -- distinguishes read operations (optimistic, learn from failure) from write operations (pre-validated). Provides `canRead(scope)` (always true until 403 disproves) and `canWrite(scope)` (probes API before returning). Pre-flight writes check a lightweight endpoint (e.g., project-level permissions descriptor) rather than attempting the actual mutation.
- 2C. `Preferences` type and resolution -- global preferences (verbosity, confirmation policy, preview-before-mutation) plus integration-scoped preferences (ADO planning style, auto-assign). Persisted via `ContextStore`.
- 2D. Wire Authority into existing `ado_mutate` tool -- before executing a mutation, check `canWrite()`. If denied, return a structured explanation instead of attempting and failing. Existing `ado_query` remains optimistic.
- 2E. Extend system prompt injection with authority constraints and preferences -- `contextSection()` renders "can / CANNOT" authority limits and user preferences into the prompt so the model plans around constraints upfront (see D10).

**Phase 3: ADO Semantic Tools (Full Consumer)**
- 3A. Per-user default ADO context (defaultOrg, defaultProject, knownProjects) resolved via identity + preferences
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
- [ ] `ContextStore` interface defined with `get`/`put`/`delete`/`list` operations; `FileContextStore` implements it
- [ ] No context module imports `fs` directly -- all persistence goes through `ContextStore`
- [ ] All four context layers (Identity, Authority, Preferences, Channel) have TypeScript types and resolution functions
- [ ] `LazyContextResolver` resolves layers on demand -- Authority and Preferences are not resolved unless a tool accesses them
- [ ] Authority uses hybrid model: reads are optimistic (403 learning), writes have pre-flight check
- [ ] Identity persists across sessions via `ContextStore`; Authority caches in memory with TTL; Preferences persist via `ContextStore`
- [ ] Identity tracks `knownScopes` — evergreen record of orgs/projects the user has worked in, updated automatically
- [ ] Tools are stateless — model provides all required context (org, project, IDs) on every call; no ambient session state
- [ ] ToolContext extension is backward-compatible -- existing tools work unchanged
- [ ] ADO tools use context kernel for org/project resolution instead of requiring explicit parameters
- [ ] At least 3 semantic ADO operations exist (create_epic, create_issue, move_items)
- [ ] Process template detection works for Basic, Agile, and Scrum
- [ ] Channel-aware formatting works for Teams and CLI
- [ ] Dry-run mode returns structured preview for ADO mutations
- [ ] Cross-tenant bleed is prevented by authority scoping
- [ ] System prompt includes resolved context (identity, session, authority constraints, preferences) via `contextSection()` in `buildSystem()`
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

## Open Questions
- [x] Q1: Should the `ContextResolver` pipeline be synchronous or async? **Resolved**: async. Authority resolution requires API calls. The full pipeline is async, but the lazy resolver means only the layers actually accessed pay the async cost.
- [x] Q2: How should we model the identity-to-external-ID mapping when the same person uses CLI (no AAD identity) and Teams (has AAD identity)? **Resolved**: CLI gets a local-only identity keyed by OS username; Teams gets AAD-linked identity; both map to the same internal userId if explicitly linked by the user.
- [x] Q3: Should authority profiles be eagerly fetched at session start or lazily fetched on first tool call that needs them? **Resolved**: lazy with cache. The `LazyContextResolver` does not resolve authority until a tool actually accesses it. Once resolved, cached for session duration with configurable TTL.
- [ ] Q4: For process template detection, should we cache templates per-project or per-org? ADO allows different process templates per project within an org. Recommendation: cache per-project, since that's the scoping level.
- [ ] Q5: Should preferences be editable via slash commands (e.g., `/set verbosity detailed`) or only via config file? Recommendation: both -- slash commands for runtime changes that also persist via `ContextStore`, config file for initial setup.
- [x] Q6: How should we handle session context when the same user is in Teams and CLI simultaneously? **Resolved (superseded)**: no longer relevant — Session layer was eliminated (see D8). Conversation history is per-channel via existing `sessionPath()`. Identity and Preferences are per-user, shared across channels.
- [ ] Q7: Should the semantic ADO tools (create_epic, move_items, etc.) replace the generic ado_query/ado_mutate tools, or coexist alongside them? Recommendation: coexist -- semantic tools are the preferred path for common operations, but generic tools remain for edge cases and advanced users.
- [ ] Q8: For the authority pre-flight check on writes, what lightweight ADO endpoint should we probe? The Security Namespaces API (`/_apis/security/namespaces`) can check project-level permissions without attempting the mutation. Alternatively, the Permissions API (`/_apis/permissions`) can check specific permission bits. Recommendation: use the Security Namespaces API; it gives granular results and is documented.
- [ ] Q9: **Identity bootstrapping** -- who creates the `UserIdentity` record the first time a user interacts? For Teams, the activity carries an AAD userId — something needs to do a "resolve or create" (look up by external ID, or mint a new internal UUID). For CLI, when does the OS-username-keyed identity get created? This is the first-contact flow and it's unspecified. Recommendation: identity resolution is always "get or create" — if no identity exists for the external ID (Teams) or OS username (CLI), create one automatically with sensible defaults. No manual setup required.
- [x] Q10: **Session persistence between turns** -- **Resolved (eliminated)**: Session layer was removed (see D8). No structured session state to persist. Conversation history continues to be saved via existing `saveSession()`. Persistent user knowledge (known scopes, defaults) lives in Identity and Preferences via `ContextStore`.
- [x] Q11: **Working set mutation -- who writes it?** **Resolved (eliminated)**: no working set. The conversation history is the working set. Tool results are in the messages. If the model needs to reference previous results after context trimming, it re-queries. Tools are stateless.
- [ ] Q12: **`buildSystem()` API change** -- D10 says `buildSystem()` gains `contextSection()`, but it currently takes `(channel, options?)`. To render identity, session, authority, it needs `LazyResolvedContext`. How does it receive it? Options: (a) pass as a new parameter `buildSystem(channel, options?, context?)`, (b) module-level state set before calling `buildSystem()`, (c) make `buildSystem()` accept a context provider callback. Recommendation: (a) — explicit parameter, optional, backward-compatible. When absent, context section is omitted (graceful degradation). `buildSystem()` becomes async since it may need to await lazy authority/preferences for rendering.
- [ ] Q13: **Resolver error handling** -- what happens when `ContextStore.get()` fails (corrupted file, permissions error)? When identity resolution finds no record? When the authority pre-flight check times out or the ADO API is unreachable? Options: (a) resolver returns partial context with missing layers set to defaults, (b) resolver throws and the caller falls back to no-context mode, (c) each layer has its own error strategy (identity: create default, authority: assume allowed, preferences: use defaults). Recommendation: (c) — layer-specific. Identity: auto-create on miss (see Q9). Authority: on error assume optimistic (same as if never resolved — no constraints in prompt, 403 learning kicks in at tool time). Preferences: fall back to built-in defaults. No layer failure should crash the agent.
- [ ] Q14: **Schema versioning** -- the original doc had "B4. Schema versioning for all persisted context types" but the rewrite dropped it. If we persist `UserIdentity` and `UserPreferences` via `ContextStore` and later add fields, what happens when reading old data? Recommendation: every persisted type carries a `schemaVersion: number` field. On read, if the version is older than current, apply a migration function (add new fields with defaults, remove deprecated fields). Migrations are simple functions, not a framework. Version 1 is the initial schema.
- [ ] Q15: **Token relationship** -- `ToolContext` currently carries `graphToken` and `adoToken` per-turn (fetched fresh from Bot Service token store each message). The new `LazyResolvedContext` is added alongside it (D5). Should tokens eventually move into the context kernel, or remain separate? Recommendation: remain separate. Tokens are ephemeral per-turn credentials managed by an external service (Azure Bot Service). The context kernel manages persistent/cached *user knowledge* (who you are, what you can do, what you prefer). Tokens are the *mechanism* for API calls; context is the *reasoning frame* for decisions. Mixing them conflates two different lifecycles. ToolContext keeps tokens; LazyResolvedContext keeps context. They coexist on the same object but serve different purposes.

## Decisions Made

### D1: Architecture -- Storage Interface, Not File-Based Commitment
The context kernel defines a `ContextStore` interface (`get`, `put`, `delete`, `list`) that all persistence flows through. `FileContextStore` is the first (and initially only) adapter. The schema, resolution logic, and all consumer code never import `fs` or know where bytes live. This means swapping to a database, blob store, or API-backed store in the future requires implementing one interface -- not refactoring every module. The file layout under `~/.agentconfigs/<agent>/context/` is an implementation detail of `FileContextStore`, not an architectural commitment.

### D2: Authority -- Hybrid Model, Not Pure 403 Learning
Pure 403 learning means the agent proposes something, attempts it, fails, and then learns -- bad UX for destructive or visible operations (e.g., reparenting 50 work items, only to fail on item 1). The authority system uses a hybrid approach:
- **Read path (optimistic)**: assume allowed, attempt the call, learn from 403. Good for discovery. `canRead()` returns true until disproven.
- **Write path (pre-validated)**: before proposing a mutation plan, check a lightweight permissions endpoint to verify write access. `canWrite(scope)` probes before returning. If denied, the agent explains the limitation to the user rather than attempting and failing.
- The authority resolver distinguishes read vs. write via an `AuthorityChecker` that tools call with the operation type.

### D3: Channel Modeling -- Capability Flags, Not Just Enum
Channel context uses both an identifier (`"cli" | "teams"`) AND capability flags (`supportsMarkdown`, `supportsStreaming`, `supportsRichCards`, `maxMessageLength`). This allows the system to adapt behavior based on what the channel can actually do, rather than hardcoding per-channel behavior. The existing `Channel` type (`"cli" | "teams"`) in `src/mind/prompt.ts` becomes a key into a `ChannelCapabilities` lookup.

### D4: Authority Cache Invalidation -- TTL + Event-Driven
Authority profiles are cached with a configurable TTL (default: 30 minutes). Additionally, any 403 response from an ADO/Graph API call triggers immediate cache invalidation for that integration scope. This catches permission changes without waiting for TTL expiry.

### D5: ToolContext Extension -- Backward Compatible
The existing `ToolContext` interface in `src/engine/tools-base.ts` is extended (not replaced) with an optional `context?: LazyResolvedContext` field. This means all existing tool handlers continue to work unchanged. New semantic tools can access context layers on demand. Migration is gradual.

### D6: Resolver -- Lazy, Not Upfront
The previous design resolved all layers into a `ResolvedContext` bag on every tool call. Not every tool needs all four (e.g., `read_file` needs none, `ado_query` needs Identity but not Authority). Full upfront resolution adds latency, especially when Authority requires API calls. The `LazyContextResolver` returns a proxy where:
- **Identity** is resolved eagerly (cheap local lookup, almost always needed by tools that use context at all).
- **Authority** is resolved on first access (may require API call for pre-flight check).
- **Preferences** are resolved on first access (file I/O via `ContextStore`).
- **Channel** is a synchronous lookup (pure data, no I/O).
Layers that are never accessed in a given tool call pay zero cost.

### D7: Phasing -- Interleaved, Not Back-Loaded
The previous design built all foundation (types, resolvers, storage, pipeline) before any consumer touched it. That is too much untested infrastructure. The revised phasing:
- Phase 1 builds Identity + Preferences + Storage Interface + Channel, then immediately wires them through ONE real ADO operation (per-user default org/project). This proves the kernel end-to-end with real data.
- Phase 2 builds Authority only after Phase 1's consumer proves the pattern works. Authority is wired into existing `ado_mutate`; authority constraints are added to the prompt.
- Phase 3 adds semantic ADO tools that pull on all layers.
- Phase 4 adds intelligence features (process templates, structural safety).
Each phase delivers working, tested, consumer-visible functionality -- not just infrastructure.

### D8: No Session Layer -- Conversation History IS the Session
The original five-layer design included a `SessionContext` layer with working set, active scope, and execution mode. This was eliminated because:
- **Working set** duplicates tool results already in conversation history. If history is trimmed, the model can re-query rather than maintaining a parallel cache.
- **Execution mode** (`discussion` / `planning` / `mutation`) duplicates the model's natural conversational intent inference. Tracking it as explicit state adds overhead without adding information.
- **Active scope** is better modeled as persistent user knowledge in Preferences (`knownScopes`, `defaultOrg`, `defaultProject`) — learned and updated automatically, not ephemeral.
- **Tools are stateless**: every tool call includes all required context (org, project, IDs). No tool reads from ambient session state. The model must always provide what the tool needs. If the model doesn't know, it asks the user.
- **The ouroboros metaphor holds**: the conversation *is* the memory. The agent eats its tail (trims old messages) but identity and preferences survive through persisted context. We don't need a parallel memory system for information that lives in the messages.

### D10: System Prompt Injection -- Context Reaches the Model, Not Just Tools
The context kernel resolves identity, authority, preferences, channel, and session — but the model can only reason within constraints it can see. Without prompt injection, authority limits are invisible to the model until a tool call fails. This wastes turns and produces bad UX (proposing an epic restructure, then failing on the first API call).

`buildSystem()` already runs per-turn and assembles sections. It gains a new `contextSection()` that renders the resolved context into the system prompt:

```
## user context
user: Jordan (jordan@contoso.com)
channel: teams (markdown, no streaming, max 4000 chars)
known scopes: ado/contoso/Platform, ado/contoso/Infrastructure
default: ado/contoso/Platform

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
- **Lazy resolver feeds it**: `contextSection()` awaits only the layers it needs. Identity is always rendered (cheap, eager). Authority and preferences are rendered only if resolved (i.e., only after a tool has triggered their lazy resolution — we don't force-resolve them just for the prompt on turns where no integration tools are used).
- **Graceful degradation**: if no context is available yet (first turn, CLI with no identity configured), the section is omitted entirely. The agent works exactly as it does today.
- **No duplication**: channel info already in `runtimeInfoSection()` gets its flags from `ChannelCapabilities` instead of hardcoded strings, but the section name and position stay the same.
- **No session state in prompt**: the conversation history is the session. The model knows what it queried, what it created, and what the user is focused on from the messages. The prompt only carries persistent context (identity, authority, preferences) and static context (channel capabilities).

This is wired in Phase 1 (1G) for identity + preferences, and extended in Phase 2 (2E) for authority.

### D9: File Layout -- New Directories Under Existing Structure
New code follows the existing directory pattern:
- `src/context/` -- context kernel types, interfaces, and resolvers
- `src/context/types.ts` -- all layer type definitions
- `src/context/store.ts` -- `ContextStore` interface
- `src/context/store-file.ts` -- `FileContextStore` adapter
- `src/context/identity.ts` -- UserIdentity resolution
- `src/context/authority.ts` -- Authority resolution and `AuthorityChecker`
- `src/context/preferences.ts` -- Preferences resolution
- `src/context/channel.ts` -- ChannelCapabilities lookup
- `src/context/resolver.ts` -- `LazyContextResolver`
- `src/engine/ado-semantic.ts` -- semantic ADO tools (create_epic, move_items, etc.)
- `src/engine/ado-templates.ts` -- process template detection and hierarchy rules
- `src/__tests__/context/` -- tests for all context modules
- `src/__tests__/engine/ado-semantic.test.ts` -- tests for semantic ADO tools

## Context / References

### Existing Codebase Architecture (Current State)
- **Entry points**: `src/cli-entry.ts` (CLI), `src/teams-entry.ts` (Teams with dotenv)
- **Channel adapters**: `src/channels/cli.ts` (readline REPL), `src/channels/teams.ts` (Teams SDK bot)
- **Engine core**: `src/engine/core.ts` -- `runAgent()` loop, provider selection, streaming, tool execution
- **Tool system**: `src/engine/tools-base.ts` (base tools), `src/engine/tools-teams.ts` (Teams-only tools including ADO/Graph), `src/engine/tools.ts` (channel-aware tool list)
- **ToolContext interface** (tools-base.ts:7-12): `{ graphToken?, adoToken?, signin, adoOrganizations }`
- **ADO client**: `src/engine/ado-client.ts` -- generic `adoRequest()` and `queryWorkItems()` wrapper
- **Graph client**: `src/engine/graph-client.ts` -- generic `graphRequest()` and `getProfile()` wrapper
- **Identity**: `src/identity.ts` -- agent identity (name, config), NOT user identity
- **Config**: `src/config.ts` -- `OuroborosConfig` with providers, teams, oauth, ado, context, teamsChannel
- **Prompt system**: `src/mind/prompt.ts` -- `buildSystem()` assembles system prompt with channel-aware sections
- **Session management**: `src/mind/context.ts` -- `saveSession()`, `loadSession()`, `postTurn()`, `trimMessages()`
- **Channel type**: `"cli" | "teams"` defined in `src/mind/prompt.ts`

### Key Integration Points for Context Kernel
1. **runAgent()** in `src/engine/core.ts` line 159 -- receives `channel` param, builds `ToolContext` implicitly. This is where the `LazyContextResolver` should be created and attached to `ToolContext`.
2. **handleTeamsMessage()** in `src/channels/teams.ts` line 286 -- builds `ToolContext` from OAuth tokens and ADO config. This is where Teams-specific identity resolution happens.
3. **getToolsForChannel()** in `src/engine/tools.ts` -- returns different tool lists per channel. Semantic ADO tools should be added here.
4. **execTool()** in `src/engine/tools.ts` -- dispatches to handler with `ToolContext`. New semantic tools need handlers registered here.
5. **sessionPath()** in `src/config.ts` -- `~/.agentconfigs/<agent>/sessions/<channel>/<key>.json`. Context storage follows a parallel pattern via `FileContextStore`.
6. **confirmationRequired** set in `src/engine/tools-teams.ts` -- semantic ADO mutation tools need to be added here.

### ADO API Patterns (from ado-client.ts and ado-endpoints.json)
- WIQL queries for work item search
- Batch work item fetch by IDs
- JSON Patch for work item mutations (content-type: `application/json-patch+json`)
- Organization scoping: `https://dev.azure.com/{org}/...`
- API version: 7.1
- Process template API: `GET /{org}/{project}/_apis/work/processes`
- Work item types API: `GET /{org}/{project}/_apis/wit/workitemtypes`
- Security Namespaces API: `GET /{org}/_apis/security/namespaces` (for authority pre-flight checks)

### TypeScript Conventions (from tsconfig.json and existing code)
- Target: ES2022, Module: commonjs
- Strict mode, noUnusedLocals, noUnusedParameters
- Tests: vitest, `src/__tests__/` mirror of `src/`
- 100% coverage target with @vitest/coverage-v8

## Notes
This is a large initiative that should be broken into multiple doing docs. The recommended phasing for the doing doc conversion:

**Doing Doc 1: Identity + Preferences + Storage Interface (Phase 1)**
Units 1A-1H. Builds the storage interface, identity, preferences, channel capabilities, lazy resolver, system prompt injection, and wires through one real ADO operation. Proves the kernel end-to-end.

**Doing Doc 2: Authority + Preferences (Phase 2)**
Units 2A-2E. Builds the hybrid authority model and preferences, wires them into existing tools. Depends on Doing Doc 1.

**Doing Doc 3: ADO Semantic Tools (Phase 3)**
Units 3A-3F. The new ADO tools that consume the full context kernel. Depends on Doing Doc 2.

**Doing Doc 4: ADO Intelligence (Phase 4)**
Units 4A-4C. Process templates, authority-aware planning, structural safety. Depends on Doing Doc 3.

### Proposed TypeScript Schema (for reference during doing doc conversion)

```typescript
// src/context/store.ts

// Storage-agnostic interface for context persistence.
// All context modules go through this -- none import fs directly.
interface ContextStore {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

// src/context/store-file.ts

// First adapter: file-based storage under ~/.agentconfigs/<agent>/context/
// Key maps to file path: key "identity/user-123" -> context/identity/user-123.json
// This is the ONLY module that touches fs for context data.
class FileContextStore implements ContextStore { /* ... */ }

// src/context/types.ts

// --- Layer 1: Identity ---
interface ExternalId {
  provider: "aad" | "teams" | "github" | "ado";
  externalId: string;
  tenantId?: string;  // for AAD/Teams
}

interface IntegrationMembership {
  integration: "ado" | "github" | "graph";
  scope: string;  // e.g., ADO org name, GitHub org name
}

interface KnownScope {
  integration: "ado" | "github" | "graph";
  org: string;
  project?: string;
  lastUsed: string;  // ISO date, updated automatically when model interacts with this scope
}

interface UserIdentity {
  userId: string;  // internal, stable, uuid
  displayName: string;
  externalIds: ExternalId[];
  tenantMemberships: string[];  // AAD tenant IDs
  integrationMemberships: IntegrationMembership[];
  knownScopes: KnownScope[];  // evergreen record of orgs/projects user has worked in
  createdAt: string;  // ISO date
  updatedAt: string;
  schemaVersion: number;
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
  defaultOrg?: string;
  defaultProject?: string;
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
  supportsMarkdown: boolean;
  supportsStreaming: boolean;
  supportsRichCards: boolean;
  supportsInteractiveConfirmation: boolean;
  maxMessageLength: number;
  defaultVerbosity: "concise" | "normal" | "detailed";
  defaultConfirmationFriction: "low" | "medium" | "high";
}

// --- Lazy Resolved Context (output of resolver) ---
// Layers are resolved on first property access, not all upfront.
// Identity: resolved eagerly (cheap). Authority, Preferences: lazy (may require I/O).
// Channel: synchronous lookup. No session layer — conversation history is the session.
interface LazyResolvedContext {
  readonly identity: UserIdentity;           // eager
  readonly channel: ChannelCapabilities;      // eager (pure lookup)
  readonly authority: Promise<AuthorityProfile[]>; // lazy, async
  readonly preferences: Promise<UserPreferences>;  // lazy, async
  readonly checker: AuthorityChecker;         // stateful, always available
}
```

## Progress Log
- 2026-03-02 17:18 Created planning doc with full codebase analysis
- 2026-03-02 18:09 Rewrote planning doc: storage interface (not file-based commitment), hybrid authority (not pure 403 learning), lazy resolver (not upfront bag), interleaved phasing (not back-loaded)
- 2026-03-02 18:22 Added D10: system prompt injection -- context reaches the model via buildSystem(), not just tools. Authority constraints rendered as explicit can/CANNOT. Graceful degradation when no context available.
- 2026-03-02 18:38 Gap analysis: added Q9-Q15 covering identity bootstrapping, session persistence between turns, working set mutation ownership, buildSystem() API change, resolver error handling, schema versioning, and token/context separation.
- 2026-03-02 18:55 Eliminated Session layer (D8 rewritten). Five layers → four (Identity, Authority, Preferences, Channel). Conversation history IS the session. Tools are stateless. Working set, execution mode, active scope all removed. Useful bits (knownScopes, defaults) folded into Identity and Preferences. Q6/Q10/Q11 resolved as eliminated. Schema updated: added KnownScope to Identity, schemaVersion to persisted types, removed SessionContext and WorkingSetItem.
