# Ouroboros Agent Harness

A minimal, multi-agent harness for building AI agents that can read files, write code, run commands, and modify themselves. Written in TypeScript, powered by Azure OpenAI or MiniMax, deployable as a CLI REPL or a Microsoft Teams bot.

The name is structural: the original agent -- Ouroboros -- was grown recursively from a 150-line while loop, bootstrapping itself through agentic self-modification. A snake eating its own tail. The metaphor runs deep: the agent literally consumes its own context window, trimming old conversation to stay within token budget while preserving identity through layered memory (psyche files, session persistence, git history). It eats its tail to survive across turns. The harness preserves that architecture while supporting multiple agents, each with their own personality, skills, and configuration.

The origin story lives at [aka.ms/GrowAnAgent](https://aka.ms/GrowAnAgent).

## Project structure

```
ouroboros/                        # repo root
  src/                            # shared harness (all agents share this code)
    identity.ts                   # --agent <name> parsing, agent root resolution
    config.ts                     # config loading from agent.json configPath
    cli-entry.ts                  # CLI entrypoint
    teams-entry.ts                # Teams entrypoint
    engine/
      core.ts                     # agent loop, client init, ChannelCallbacks
      streaming.ts                # Azure Responses API + MiniMax Chat Completions
      kicks.ts                    # self-correction: empty, narration, tool_required
      tools-base.ts               # 11 base tools (read_file, shell, claude, etc.)
      tools-teams.ts              # 8 Teams-specific tools (graph, ado)
      tools.ts                    # channel-aware tool routing
      api-error.ts                # error classification
      ado-client.ts               # Azure DevOps REST client
      graph-client.ts             # Microsoft Graph REST client
    mind/
      prompt.ts                   # system prompt assembly from psyche files
      context.ts                  # sliding context window, session I/O
    channels/
      cli.ts                      # terminal REPL, spinner, markdown streaming
      teams.ts                    # Teams bot, streaming cards, conversation locks
    repertoire/
      commands.ts                 # slash commands (/exit, /new, /commands)
      skills.ts                   # skill loader (markdown files on demand)
    wardrobe/
      format.ts                   # shared formatters (tool results, kicks, errors)
      phrases.ts                  # loading phrases (thinking, tool, followup)
    __tests__/                    # 900+ tests, 100% coverage
  ouroboros/                      # agent directory for "ouroboros"
    agent.json                    # name, configPath, custom phrases
    docs/
      psyche/                     # personality files loaded into system prompt
        SOUL.md                   # ontology, invariants, operating principles
        IDENTITY.md               # tone, presence, collaboration style
        LORE.md                   # origin story, philosophical context
        FRIENDS.md                # key relationships
      tasks/                      # planning and doing docs
    skills/                       # markdown skill plugins
    manifest/                     # Teams app manifest
  subagents/                      # sub-agent definitions (work-planner, work-doer)
  docs/
    OAUTH-SETUP.md                # shared OAuth infrastructure docs
  package.json
  tsconfig.json
  vitest.config.ts
```

## Agent onboarding

Everything below is written for a new agent. If you are an AI agent reading this as part of your system prompt or context, this section explains your own runtime.

### Your directory

Each agent has a directory at the repo root named after itself. Inside it:

**agent.json** -- your manifest. Required fields:

```json
{
  "name": "ouroboros",
  "configPath": "~/.agentconfigs/ouroboros/config.json",
  "phrases": {
    "thinking": ["chewing on that", "consulting the chaos gods"],
    "tool": ["rummaging through files", "doing science"],
    "followup": ["digesting results", "connecting the dots"]
  }
}
```

- `name`: must match your directory name.
- `configPath`: absolute path (or `~`-prefixed) to your config.json with API keys and provider settings.
- `phrases`: optional custom loading phrases. Falls back to hardcoded defaults if omitted.

**docs/psyche/** -- your personality files, loaded lazily into the system prompt at startup. See the psyche system section below.

**skills/** -- markdown instruction manuals you can load on demand with the `load_skill` tool. Each `.md` file is one skill.

**docs/tasks/** -- planning and doing docs for your work units. Named `YYYY-MM-DD-HHMM-{planning|doing}-slug.md`.

**manifest/** -- Teams app manifest (manifest.json, icons) if you run as a Teams bot.

### The psyche system

Your personality is assembled from four markdown files in `{your-dir}/docs/psyche/`. Each has a YAML frontmatter header and a body. All four are loaded into your system prompt at the start of every conversation.

| File | Role | What it defines |
|------|------|----------------|
| `SOUL.md` | Ontology | Core invariants, operating principles, autonomy/alignment, temperament. The deepest layer -- what you are. |
| `IDENTITY.md` | Presence | Tone, voice, collaboration style, self-awareness. How you show up in conversation. |
| `LORE.md` | History | Origin story, philosophical context, why you exist. Narrative layer. |
| `FRIENDS.md` | Relationships | Key humans and agents you interact with, social context. |

The system prompt is built by `mind/prompt.ts` via `buildSystem()`. It concatenates:

1. SOUL.md content
2. IDENTITY.md content
3. LORE.md (if present, prefixed with `## my lore`)
4. FRIENDS.md (if present, prefixed with `## my friends`)
5. Runtime info: agent name, cwd, channel, self-modification note
6. Flags section (e.g. streaming disabled)
7. Provider info: which model and provider you are using
8. Current date
9. Tools list: all tools available in your channel
10. Skills list: names of loadable skills
11. Tool behavior section (if tool_choice is required)

Missing psyche files produce empty strings, not crashes. You can write your own psyche from scratch -- just create the four `.md` files in your directory.

### Your runtime

**The engine loop** (`engine/core.ts`): `runAgent()` is a while loop. Each iteration: send conversation to the model, stream the response, if the model made tool calls execute them and loop, if it gave a text answer exit. Maximum 10 tool rounds per turn.

**Streaming** (`engine/streaming.ts`): two provider paths. Azure OpenAI uses the Responses API with structured events (reasoning, text, tool calls). MiniMax uses Chat Completions with `<think>` tags parsed by a state machine. Both normalize into the same 7+2 callbacks.

**ChannelCallbacks** (`engine/core.ts`): the contract between engine and display. 7 core events:
- `onModelStart` -- model request sent
- `onModelStreamStart` -- first token received
- `onReasoningChunk` -- inner reasoning text
- `onTextChunk` -- response text
- `onToolStart` -- tool execution beginning
- `onToolEnd` -- tool execution complete
- `onError` -- error occurred

Plus 2 optional:
- `onKick` -- self-correction triggered
- `onConfirmAction` -- confirmation prompt for destructive tools

**Kicks** (`engine/kicks.ts`): self-corrections injected as assistant-role messages when the harness detects a malformed response. Three types: `empty` (blank response), `narration` (described action instead of taking it), `tool_required` (tool_choice was required but no tool called). Kicks use first-person, forward-looking language.

**Channels**: CLI (`channels/cli.ts`) is a terminal REPL with readline, spinners, ANSI colors, and Ctrl-C handling. Teams (`channels/teams.ts`) is a Microsoft Teams bot with streaming cards, conversation locks, OAuth token management, and confirmation prompts for destructive tools.

**Context management** (`mind/context.ts`): this is the tail-eating at the heart of the ouroboros metaphor. Conversations are persisted to JSON files on disk. After each turn, the sliding window checks token count against budget (configurable, default 80,000 tokens). When over budget, oldest messages are trimmed -- never the system prompt -- until back under with a 20% margin. The agent consumes its own history to keep moving forward. Identity survives through psyche files and session persistence, not through unbounded context.

**Tools**: 11 base tools available in all channels (read_file, write_file, shell, list_directory, git_commit, gh_cli, list_skills, load_skill, get_current_time, claude, web_search). Teams gets 8 additional tools (graph_query, graph_mutate, ado_query, ado_mutate, graph_profile, ado_work_items, graph_docs, ado_docs).

**Phrases** (`wardrobe/phrases.ts`): three pools of loading messages rotated during processing. Phrases are required in `agent.json`; if missing, `loadAgentConfig()` writes placeholder phrases and warns. `pickPhrase()` selects randomly but never repeats consecutively.

**Formatting** (`wardrobe/format.ts`): shared formatters for tool results, kicks, and errors. Used by both CLI and Teams adapters for consistent output. `formatToolResult()`, `formatKick()`, `formatError()`.

**Skills** (`repertoire/skills.ts`): markdown files in `{your-dir}/skills/`. Listed with `list_skills`, loaded with `load_skill`. The loaded text is injected into conversation as a tool result.

**Config** (`config.ts`): provider credentials, context window settings, Teams connection info, OAuth config. All loaded from the config.json file pointed to by your agent.json `configPath`. No environment variables in `src/` -- everything comes from files.

### What you can modify

Your `{agent}/` directory is yours. You can edit psyche files, add skills, change phrases, update your manifest. The shared harness (`src/`) is common infrastructure -- changes there affect all agents.

See [CONTRIBUTING.md](CONTRIBUTING.md) for repo workflow conventions (branching, commits, testing, task docs).

## Running

```bash
# CLI (ouroboros agent)
npm run dev

# CLI (slugger agent, once slugger/ directory exists)
npm run dev:slugger

# Teams bot
npm run teams

# Teams bot without streaming (for devtunnel)
npm run teams:no-stream

# Tests
npm test

# Tests with coverage
npm run test:coverage
```

All commands pass `--agent <name>` to the entry points. Missing `--agent` produces a clear error and exits.
