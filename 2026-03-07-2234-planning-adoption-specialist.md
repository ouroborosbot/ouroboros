# Planning: Adoption Specialist First-Run Experience

**Status**: approved
**Created**: 2026-03-07 22:35

## Goal
Build the end-to-end first-run onboarding flow: when a user runs `ouro` with no agents, the Adoption Specialist (an ephemeral LLM agent with a random snake identity) conducts an interview, hatches a new agent, and hands off to the hatchling in a single seamless session.

**DO NOT include time estimates (hours/days) -- planning should focus on scope and criteria, not duration.**

## Scope

### In Scope

**Feature 1: Specialist Session Infrastructure**
- `setAgentConfigOverride(config | null)` on identity.ts so `loadAgentConfig()` can return an in-memory config without reading `~/AgentBundles/`
- `resetProviderRuntime()` on core.ts so the cached provider singleton can be flushed when switching agent context
- Specialist agent loop (`specialist-session.ts`) -- a simplified LLM conversation loop that:
  - Builds a first-person system prompt from SOUL.md + randomly-picked identity file
  - Includes context about existing bundles on disk (`~/AgentBundles/*.ouro`) so the specialist can learn from prior hatches
  - Has custom tools: `hatch_agent` (triggers bundle creation, takes `name` param), `final_answer` (ends session), plus `read_file` and `list_directory` from tools-base.ts so the specialist can read existing agent bundles during the interview
  - Uses the existing provider runtime (`streamTurn()`) for LLM calls
  - Uses readline for user input (similar to cli.ts but simpler -- no sessions, friends, trust gate, pending messages, commands)
  - Supports Ctrl-C to abort cleanly (same pattern as regular CLI)
  - Runs ephemerally -- no persistent state, no session save/load
  - After `hatch_agent` succeeds, the specialist keeps talking to explain what was created and where, then calls `final_answer` to end
- Integration into `daemon-cli.ts`: when `ouro` is run with zero discovered agents, route to the specialist session instead of the current non-interactive `resolveHatchInput` prompts
- Auth flow before specialist chat: provider selection, credential entry, verification (reusing the existing `resolveHatchInput` credential prompts from daemon-cli.ts)
- Hatch animation: egg emoji -> dots -> snake emoji + hatchling name in terminal after `hatch_agent` tool completes (~1-2 seconds)
- Automatic handoff to hatchling: after specialist session ends, start the hatchling's CLI chat session via `deps.startChat()`

**Feature 2: .ouro UTI Registration Verification**
- Verify `ouro-uti.ts` actually works on macOS (already has good test coverage, existing tests pass)
- No code changes unless bugs are found during validation

### Out of Scope
- Specialist running from `~/AgentBundles/` -- its bundle stays in the repo/npm package only
- Persistent specialist sessions -- the specialist is fully ephemeral
- Multi-provider specialist support -- the specialist uses the same provider the user chose for their hatchling
- Migration flow from existing agent systems (mentioned in SOUL.md but deferred)
- `ouro logs` / `ouro chat` wiring (separate gap)
- npm publish (separate gap)

## Completion Criteria
- [ ] Running `ouro` with no agents in `~/AgentBundles/` launches the specialist session
- [ ] Provider selection and credential entry happen before the LLM chat
- [ ] Credentials are verified (provider runtime created successfully) before starting the specialist chat
- [ ] Specialist loads SOUL.md + a random identity from the bundled `AdoptionSpecialist.ouro/`
- [ ] Specialist can call `hatch_agent` tool to create a new agent bundle
- [ ] Hatch animation displays after successful `hatch_agent` call
- [ ] After specialist session ends, the hatchling's CLI session starts automatically
- [ ] Specialist secrets are written to `~/.agentsecrets/AdoptionSpecialist/secrets.json` using the user's chosen provider credentials
- [ ] Hatchling secrets are written to `~/.agentsecrets/{hatchlingName}/secrets.json`
- [ ] The AdoptionSpecialist.ouro bundle is NEVER copied to `~/AgentBundles/`
- [ ] All existing tests continue to pass
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
- [x] ~~Should the specialist session support Ctrl-C to abort the interview and return to the shell, or should it only end via `final_answer`?~~ **Resolved: Yes, support Ctrl-C -- same pattern as regular CLI. Clean exit to shell.**
- [x] ~~Should the `hatch_agent` tool call automatically end the specialist session, or should the specialist be allowed to continue chatting after hatching?~~ **Resolved: Keep talking after hatch. Specialist explains what was created, where the bundle lives, gives an orientation moment, then calls `final_answer` to end.**
- [x] ~~Should we verify credentials by actually making a lightweight API call, or just by successfully constructing the provider runtime?~~ **Resolved: Construct-only for now. If credentials are wrong, the first LLM call will fail with a clear error anyway.**
- [x] ~~What should the hatch animation look like exactly?~~ **Resolved: Egg emoji -> brief animated dots -> snake emoji + hatchling name. ~1-2 seconds. ANSI colors optional.**

## Decisions Made
- **Custom specialist loop instead of refactoring `runAgent`**: `runAgent` is deeply coupled to the global tool registry, global system prompt building, session management, friend resolution, trust gates, and pending messages. Refactoring it to accept parameters would be a large, risky change. A purpose-built specialist loop is simpler, safer, and the specialist is intentionally ephemeral -- it doesn't need 90% of what `runAgent` provides.
- **`setAgentConfigOverride` approach**: Rather than reading `agent.json` from a non-standard path, we add a simple override mechanism to `identity.ts`. When set, `loadAgentConfig()` returns the override instead of reading from disk. This is the minimal change to the identity system that enables the specialist to work without an `~/AgentBundles/` entry.
- **Specialist uses same provider as hatchling**: The user picks a provider during the auth flow. The specialist uses those same credentials. This avoids requiring separate specialist credentials and is the simplest approach.
- **Specialist secrets path**: Written to `~/.agentsecrets/AdoptionSpecialist/secrets.json`. This follows the existing convention and allows `loadConfig()` to work for the specialist when `getAgentName()` returns "AdoptionSpecialist".
- **No environment variables**: All state passed explicitly via parameters, function arguments, or setters per project hard rule.
- **Ctrl-C aborts specialist session**: Same pattern as regular CLI -- clean exit to shell.
- **Specialist keeps talking after hatch**: After `hatch_agent` succeeds, the specialist explains what was created, where the bundle lives, and says goodbye. Then calls `final_answer` to end. This is the "orientation moment" from the design.
- **Construct-only credential verification**: No lightweight API call. If credentials are wrong, the first `streamTurn()` call will surface a clear error.
- **Hatch animation**: Egg emoji -> dots -> snake emoji + hatchling name. ~1-2 seconds total.
- **`hatch_agent` tool takes only `name` param**: `humanName`, `provider`, and `credentials` are already known from the auth flow and passed through from session deps.
- **Specialist gets read_file and list_directory tools**: So she can read existing agent bundles during the interview (psyche files, task boards, friend notes).
- **Specialist system prompt includes existing bundle list**: `ls ~/AgentBundles/*.ouro` context so the specialist can learn from prior hatches.
- **Export `writeSecretsFile` from hatch-flow.ts**: Currently private. Needs to be exported (or extracted) so the specialist session can write its own secrets without duplicating code.
- **System prompt is first-person**: The specialist's own voice, incorporating both SOUL.md and the randomly picked identity.

## Context / References
- `src/heart/identity.ts` -- `getAgentName()`, `setAgentName()`, `loadAgentConfig()`, `resetIdentity()`, `getAgentRoot()`, `getAgentSecretsPath()`
- `src/heart/config.ts` -- `loadConfig()`, `resetConfigCache()`, provider config getters
- `src/heart/core.ts` -- `createProviderRegistry()`, `getProviderRuntime()` (private), `_providerRuntime` global, `ProviderRuntime` interface, `runAgent()`
- `src/heart/daemon/daemon-cli.ts` -- `runOuroCli()`, `resolveHatchInput()`, `OuroCliDeps`, first-run routing logic
- `src/heart/daemon/hatch-flow.ts` -- `runHatchFlow()`, bundle creation, credential validation
- `src/heart/daemon/hatch-specialist.ts` -- `pickRandomSpecialistIdentity()`, `syncSpecialistIdentities()`, `getSpecialistIdentitySourceDir()`
- `src/senses/cli.ts` -- `main()`, `createCliCallbacks()`, `MarkdownStreamer`, `InputController`, readline patterns
- `AdoptionSpecialist.ouro/psyche/SOUL.md` -- specialist soul document
- `AdoptionSpecialist.ouro/agent.json` -- specialist config (provider: anthropic, enabled: false)
- `AdoptionSpecialist.ouro/psyche/identities/*.md` -- 13 snake identity files
- `src/heart/providers/anthropic.ts` -- Anthropic provider factory, setup token validation

## Notes
- The specialist's `agent.json` has `enabled: false` -- this is intentional since it's not a running agent. The config override approach bypasses this.
- 13 identity files: basilisk, jafar, jormungandr, kaa, medusa, monty, nagini, ouroboros, quetzalcoatl, sir-hiss, the-serpent, the-snake, python
- Identity files have YAML frontmatter (role, path, description, scope, non_scope, loaded_into_prompt, stability) followed by personality markdown
- The existing `resolveHatchInput` in daemon-cli.ts already handles interactive prompting for provider, credentials, agent name, human name -- can be reused for auth flow (minus agent name and human name which the specialist decides)
- `_providerRuntime` in core.ts is a module-level singleton with no reset mechanism -- we need to add `resetProviderRuntime()` as an exported function
- The specialist loop reuses `createCliCallbacks()` from cli.ts and `Spinner` for tool execution spinners -- same terminal UX
- `hatch_agent` tool calls `runHatchFlow()` from hatch-flow.ts internally, returns a detailed string describing what was created and where so the specialist can relay it to the human
- `writeSecretsFile` in hatch-flow.ts is currently a private function -- needs to be exported so specialist session can write AdoptionSpecialist secrets
- The specialist session flow: auth (cold CLI) -> provider runtime constructed -> specialist LLM chat (warm) -> hatch_agent called -> hatch animation -> specialist keeps chatting -> final_answer -> handoff to hatchling CLI session

## Progress Log
- 2026-03-07 22:35 Created
