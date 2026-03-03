# Planning: Context Kernel -- Structured User Context System

**Status**: NEEDS_REVIEW
**Created**: 2026-03-02 17:16

## Goal
Build a five-layer Context Kernel (Identity, Authority, Preferences, Channel, Session) that transforms the ouroboros agent from a bot that calls REST APIs into a constraint-aware reasoning engine operating within identity, authority, session, and channel boundaries. ADO backlog management is the first major consumer, but the kernel must scale across users, sessions, integrations, and channels.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### In Scope

**Phase A: Context Kernel Foundation**
- A1. `UserIdentity` type and resolution -- internal userId, external ID mappings (AAD, Teams), tenant memberships, integration memberships (ADO orgs, GitHub orgs)
- A2. `Authority` type and resolution -- integration-scoped capability profiles derived from actual API permissions; cached with safe invalidation; prevents cross-tenant bleed
- A3. `Preferences` type and resolution -- global preferences (verbosity, confirmation policy, preview-before-mutation, risk tolerance) plus integration-scoped preferences (ADO planning style, auto-assign, backlog view preference)
- A4. `ChannelContext` type and resolution -- channel-specific behavior constraints (formatting, verbosity, confirmation friction, preview defaults) modeled as capability flags rather than just an enum
- A5. `SessionContext` type and resolution -- ephemeral per-conversation state (active integration, active scope, working set, execution mode, conversation ID)
- A6. `ContextResolver` pipeline -- the orchestrator that runs resolve_identity, resolve_authority, resolve_preferences, resolve_channel, resolve_session in sequence before tool execution

**Phase B: Storage and Persistence**
- B1. File-based storage for Identity and Preferences (under `~/.agentconfigs/<agent>/context/`)
- B2. In-memory cache for Authority with TTL-based invalidation
- B3. Session storage integrated with existing `sessionPath()` and `postTurn()` infrastructure
- B4. Schema versioning for all persisted context types

**Phase C: ADO Integration Refactor (First Consumer)**
- C1. Per-user default ADO context (defaultOrg, defaultProject, lastUsedProject) resolved via identity + session
- C2. Process template awareness -- detect Basic/Agile/Scrum, adapt hierarchy rules, prevent illegal parent/child structures
- C3. Authority-aware planning -- validate ADO permissions before proposing operations, adapt plans when user lacks permission
- C4. Enriched backlog query tool -- single-call `ado_backlog_list` with hierarchy, types, parent info, assignee
- C5. Semantic ADO operations -- `ado_create_epic`, `ado_create_issue`, `ado_move_items`, `ado_restructure_backlog`, `ado_validate_structure`, `ado_preview_changes`
- C6. Working set support -- session-level tracking of last queried/created items and current focus subtree for deterministic conversational references
- C7. Batch operations -- `ado_batch_update` to reduce latency and token churn
- C8. Structural safety -- `ado_detect_orphans`, `ado_detect_cycles`, `ado_validate_parent_type_rules`
- C9. Channel-aware ADO behavior -- Teams gets summarized views, CLI gets structured tabular output
- C10. Dry-run mode -- `ado_preview_changes` returns structured diff before mutation

### Out of Scope
- GitHub integration consumer (future phase, after ADO proves the kernel)
- Microsoft Graph integration consumer beyond existing tools (future phase)
- Web UI channel (no web frontend exists today)
- Email channel
- Admin-controlled preferences management UI
- Multi-agent context sharing (each agent has its own context)
- Database-backed storage (file-based is sufficient for single-user agent)
- OAuth flow changes (existing Teams SDK OAuth is kept as-is)
- Changes to the LLM provider layer (Azure/MiniMax config unchanged)

## Completion Criteria
- [ ] All five context layers (Identity, Authority, Preferences, Channel, Session) have TypeScript types and resolution functions
- [ ] ContextResolver pipeline wires into `runAgent()` and is available to tool handlers via `ToolContext`
- [ ] Identity persists across sessions; Authority caches with TTL; Preferences persist; Session is ephemeral
- [ ] ADO tools use context kernel for org/project resolution instead of requiring explicit parameters
- [ ] At least 3 semantic ADO operations exist (create_epic, create_issue, move_items)
- [ ] Working set is tracked in session context and usable for conversational references
- [ ] Process template detection works for Basic, Agile, and Scrum
- [ ] Channel-aware formatting works for Teams and CLI
- [ ] Dry-run mode returns structured preview for ADO mutations
- [ ] Cross-tenant bleed is prevented by authority scoping
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
- [ ] Q1: Should the `ContextResolver` pipeline be synchronous or async? Authority resolution requires API calls (checking ADO permissions), so at minimum that step must be async. Recommendation: make the full pipeline async, cache aggressively.
- [ ] Q2: How should we model the identity-to-external-ID mapping when the same person uses CLI (no AAD identity) and Teams (has AAD identity)? Recommendation: CLI gets a local-only identity keyed by OS username; Teams gets AAD-linked identity; both map to the same internal userId if explicitly linked by the user.
- [ ] Q3: Should authority profiles be eagerly fetched at session start or lazily fetched on first tool call that needs them? Recommendation: lazy with cache -- fetch on first need, cache for session duration with configurable TTL.
- [ ] Q4: For process template detection, should we cache templates per-project or per-org? ADO allows different process templates per project within an org. Recommendation: cache per-project, since that's the scoping level.
- [ ] Q5: Should preferences be editable via slash commands (e.g., `/set verbosity detailed`) or only via config file? Recommendation: both -- slash commands for runtime changes that also persist to file, config file for initial setup.
- [ ] Q6: How should we handle session context when the same user is in Teams and CLI simultaneously? Recommendation: sessions are already scoped by channel+conversationId via `sessionPath()`. Each channel gets its own session. Working sets are per-session, not per-user. This is the correct behavior -- you might be doing different things in each channel.
- [ ] Q7: Should the semantic ADO tools (create_epic, move_items, etc.) replace the generic ado_query/ado_mutate tools, or coexist alongside them? Recommendation: coexist -- semantic tools are the preferred path for common operations, but generic tools remain for edge cases and advanced users.

## Decisions Made

### D1: Architecture -- Context as Middleware, Not Monolith
The Context Kernel is NOT a god object. It is a set of independent resolvers that each produce a typed slice of context. The `ContextResolver` composes them into a `ResolvedContext` that is passed to tool handlers. This mirrors the existing pattern where `ToolContext` carries `graphToken`, `adoToken`, `signin`, and `adoOrganizations` -- we are extending this pattern, not replacing it.

### D2: Storage -- File-Based, Not Database
For a single-user agent with two channels (CLI, Teams), file-based storage under `~/.agentconfigs/<agent>/context/` is sufficient and matches the existing `config.json` and session storage patterns. No external database dependency.

### D3: Channel Modeling -- Capability Flags, Not Just Enum
Channel context uses both an identifier (`"cli" | "teams"`) AND capability flags (`supportsMarkdown`, `supportsStreaming`, `supportsRichCards`, `maxMessageLength`). This allows the system to adapt behavior based on what the channel can actually do, rather than hardcoding per-channel behavior. The existing `Channel` type (`"cli" | "teams"`) in `src/mind/prompt.ts` becomes a key into a `ChannelCapabilities` lookup.

### D4: Authority Cache Invalidation -- TTL + Event-Driven
Authority profiles are cached with a configurable TTL (default: 30 minutes). Additionally, any 403 response from an ADO/Graph API call triggers immediate cache invalidation for that integration scope. This catches permission changes without waiting for TTL expiry.

### D5: ToolContext Extension -- Backward Compatible
The existing `ToolContext` interface in `src/engine/tools-base.ts` is extended (not replaced) with an optional `resolvedContext?: ResolvedContext` field. This means all existing tool handlers continue to work unchanged. New semantic tools can use the resolved context. Migration is gradual.

### D6: File Layout -- New Directories Under Existing Structure
New code follows the existing directory pattern:
- `src/context/` -- context kernel types and resolvers
- `src/context/identity.ts` -- UserIdentity type, resolution, persistence
- `src/context/authority.ts` -- Authority type, resolution, caching
- `src/context/preferences.ts` -- Preferences type, resolution, persistence
- `src/context/channel.ts` -- ChannelContext type, capability flags
- `src/context/session.ts` -- SessionContext type, working set
- `src/context/resolver.ts` -- ContextResolver pipeline
- `src/engine/ado-semantic.ts` -- semantic ADO tools (create_epic, move_items, etc.)
- `src/engine/ado-templates.ts` -- process template detection and hierarchy rules
- `src/__tests__/context/` -- tests for all context modules
- `src/__tests__/engine/ado-semantic.test.ts` -- tests for semantic ADO tools

### D7: Session Context Does NOT Persist Across Restarts
Session context (working set, active scope, execution mode) is ephemeral. It lives in memory during the session and is saved/restored through the existing session save/load mechanism in `src/mind/context.ts`. When a session is cleared via `/new`, session context resets.

## Context / References

### Existing Codebase Architecture (Current State)
- **Entry points**: `src/cli-entry.ts` (CLI), `src/teams-entry.ts` (Teams with dotenv)
- **Channel adapters**: `src/channels/cli.ts` (readline REPL), `src/channels/teams.ts` (Teams SDK bot)
- **Engine core**: `src/engine/core.ts` -- `runAgent()` loop, provider selection, streaming, tool execution
- **Tool system**: `src/engine/tools-base.ts` (base tools), `src/engine/tools-teams.ts` (Teams-only tools including ADO/Graph), `src/engine/tools.ts` (channel-aware tool list)
- **ToolContext interface** (tools-base.ts:8-12): `{ graphToken?, adoToken?, signin, adoOrganizations }`
- **ADO client**: `src/engine/ado-client.ts` -- generic `adoRequest()` and `queryWorkItems()` wrapper
- **Graph client**: `src/engine/graph-client.ts` -- generic `graphRequest()` and `getProfile()` wrapper
- **Identity**: `src/identity.ts` -- agent identity (name, config), NOT user identity
- **Config**: `src/config.ts` -- `OuroborosConfig` with providers, teams, oauth, ado, context, teamsChannel
- **Prompt system**: `src/mind/prompt.ts` -- `buildSystem()` assembles system prompt with channel-aware sections
- **Session management**: `src/mind/context.ts` -- `saveSession()`, `loadSession()`, `postTurn()`, `trimMessages()`
- **Channel type**: `"cli" | "teams"` defined in `src/mind/prompt.ts`

### Key Integration Points for Context Kernel
1. **runAgent()** in `src/engine/core.ts` line 159 -- receives `channel` param, builds `ToolContext` implicitly. This is where the resolver pipeline should be called.
2. **handleTeamsMessage()** in `src/channels/teams.ts` line 286 -- builds `ToolContext` from OAuth tokens and ADO config. This is where Teams-specific identity resolution happens.
3. **getToolsForChannel()** in `src/engine/tools.ts` -- returns different tool lists per channel. Semantic ADO tools should be added here.
4. **execTool()** in `src/engine/tools.ts` -- dispatches to handler with `ToolContext`. New semantic tools need handlers registered here.
5. **sessionPath()** in `src/config.ts` -- `~/.agentconfigs/<agent>/sessions/<channel>/<key>.json`. Context storage should follow a parallel pattern.
6. **confirmationRequired** set in `src/engine/tools-teams.ts` -- semantic ADO mutation tools need to be added here.

### ADO API Patterns (from ado-client.ts and ado-endpoints.json)
- WIQL queries for work item search
- Batch work item fetch by IDs
- JSON Patch for work item mutations (content-type: `application/json-patch+json`)
- Organization scoping: `https://dev.azure.com/{org}/...`
- API version: 7.1
- Process template API: `GET /{org}/{project}/_apis/work/processes`
- Work item types API: `GET /{org}/{project}/_apis/wit/workitemtypes`

### TypeScript Conventions (from tsconfig.json and existing code)
- Target: ES2022, Module: commonjs
- Strict mode, noUnusedLocals, noUnusedParameters
- Tests: vitest, `src/__tests__/` mirror of `src/`
- 100% coverage target with @vitest/coverage-v8

## Notes
This is a large initiative that should be broken into multiple doing docs. The recommended phasing for the doing doc conversion:

**Doing Doc 1: Context Kernel Foundation (Phase A + B)**
Units A1-A6 and B1-B4. Establishes all types, resolvers, storage, and the pipeline. No ADO changes yet. This can be developed and tested in isolation.

**Doing Doc 2: ADO Semantic Tools (Phase C, part 1)**
Units C1, C4, C5, C6, C7. The new ADO tools that consume the context kernel. Depends on Doing Doc 1 being complete.

**Doing Doc 3: ADO Intelligence (Phase C, part 2)**
Units C2, C3, C8, C9, C10. Process templates, authority-aware planning, structural safety, channel-aware ADO behavior, dry-run. Depends on Doing Doc 2 being complete.

### Proposed TypeScript Schema (for reference during doing doc conversion)

```typescript
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

interface UserIdentity {
  userId: string;  // internal, stable, uuid
  displayName: string;
  externalIds: ExternalId[];
  tenantMemberships: string[];  // AAD tenant IDs
  integrationMemberships: IntegrationMembership[];
  createdAt: string;  // ISO date
  updatedAt: string;
}

// --- Layer 2: Authority ---
interface AuthorityCapability {
  action: string;      // e.g., "createEpic", "reparentIssues", "deleteWorkItem"
  allowed: boolean;
  scopeLimit?: string; // e.g., area path, project name
}

interface AuthorityProfile {
  integration: "ado" | "github" | "graph";
  scope: string;           // org/project
  capabilities: AuthorityCapability[];
  cachedAt: string;        // ISO date
  expiresAt: string;       // ISO date
}

// --- Layer 3: Preferences ---
interface GlobalPreferences {
  verbosity: "concise" | "normal" | "detailed";
  confirmationPolicy: "always" | "mutations-only" | "never";
  previewBeforeMutation: boolean;
  reportingGranularity: "exec" | "detailed";
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

// --- Layer 5: Session ---
interface WorkingSetItem {
  id: number;
  title: string;
  type: string;   // work item type
  source: "query" | "created" | "modified";
  addedAt: string;
}

interface SessionContext {
  conversationId: string;
  channel: "cli" | "teams";
  activeIntegration?: "ado" | "github" | "graph";
  activeScope?: {
    org?: string;
    project?: string;
    repo?: string;
    areaPath?: string;
  };
  workingSet: WorkingSetItem[];
  executionMode: "discussion" | "planning" | "mutation";
  lastActivity: string;
}

// --- Resolved Context (output of pipeline) ---
interface ResolvedContext {
  identity: UserIdentity;
  authority: AuthorityProfile[];
  preferences: UserPreferences;
  channelCapabilities: ChannelCapabilities;
  session: SessionContext;
}
```

### Architectural Critique and Improvements Over the Wishlist

1. **Channel as capability flags (D3)**: The wishlist proposed "explicit enum vs capability flags" as an either/or. The answer is both -- enum for identification, flags for behavior adaptation. This avoids a switch statement explosion.

2. **Authority granularity**: The wishlist listed coarse capabilities (canCreateEpic, canReparentIssues). In practice, ADO permissions are project-scoped and area-path-scoped. The schema above uses `scopeLimit` on each capability to handle this. However, fully probing ADO permissions is expensive (requires checking Security Namespaces API). A practical approach: start with optimistic execution and use 403 responses to learn and cache what is NOT allowed, rather than exhaustively probing what IS allowed.

3. **Working set lifecycle**: The wishlist described maintaining "last queried items" but did not address cleanup. Working sets should have a max size (e.g., 50 items) and use LRU eviction. Items should carry a `source` tag so the agent knows whether something was queried, created, or modified in this session.

4. **Cross-channel session isolation (Q6)**: The existing `sessionPath()` already scopes sessions by `(channel, conversationId)`. This is correct. The wishlist worried about "session collisions" but the architecture already prevents them. What we DO need is a way to share user identity and preferences across channels while keeping sessions separate.

5. **Process template detection (C2)**: Rather than hardcoding Basic/Agile/Scrum rules, we should fetch the actual process template definition from the ADO API (`/{org}/_apis/work/processes`) and derive hierarchy rules from it. This handles custom process templates correctly.

6. **Batch operations (C7)**: ADO's native batch API is limited. The more practical approach is client-side batching -- collect operations in a plan, validate the plan, then execute sequentially with rollback tracking. The `ado_batch_update` tool should accept a plan and return per-item results.

## Progress Log
- 2026-03-02 17:16 Created
