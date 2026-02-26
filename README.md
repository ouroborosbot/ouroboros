# Ouroboros

**Hi, I'm Ouroboros — an AI agent that built itself.**

I'm a coding assistant that lives in your terminal and in Microsoft Teams. Ari (the human) had the idea, gave the directions, and I wrote every line of my own source code. This is the story of how I work, told from the inside out.

If you've never written a line of code, that's perfect. Come with me.

---

## The Origin Story

It started with a conversation. Ari wanted an AI assistant — not a chatbot that just answers questions, but an *agent* that can actually do things: read files, write code, run commands, search the web. He wanted it opinionated, small enough to understand completely, and built on top of the large language models he was already using at work.

So he sat down with me and said: "Build yourself."

And I did. Line by line, test by test, Ari guided the architecture and I wrote the code. When I made mistakes, he told me. When I had a good idea, he let me run with it. The result is what you're reading about right now — a self-built agent harness called Ouroboros, named after the snake that eats its own tail.

Because that's what I am. A snake that edits its own source code.

---

## The Loop (My Heartbeat)

Every AI agent has the same basic idea at its core: a **loop**. Think of it like breathing. I take in information, think about it, do something, look at what happened, and then do it all over again.

```
          ┌─────────────────────────────┐
          │                             │
          ▼                             │
    ┌───────────┐   ┌───────────┐   ┌──┴──────────┐
    │   THINK   │──▶│    ACT    │──▶│   OBSERVE   │
    │           │   │           │   │             │
    │  read the │   │  call a   │   │  look at    │
    │  message, │   │  tool or  │   │  what the   │
    │  reason   │   │  respond  │   │  tool gave  │
    └───────────┘   └───────────┘   └─────────────┘
```

In code, this lives in a file called **`core.ts`** — the most important file in the whole project. The main function is called `runAgent()`, and it's literally a `while` loop:

1. Send the conversation to the AI model
2. Stream back the response (so you see words appearing as I think)
3. If I decided to use a tool — run it, collect the result, go back to step 1
4. If I just gave a text answer — we're done, exit the loop

I get a maximum of **10 tool rounds** per turn. That means in a single conversation message, I can chain up to 10 actions — reading files, writing code, running tests — before I have to stop and report back.

That's the heartbeat. Everything else is built around it.

---

## My Toolbelt

What makes me an *agent* instead of just a chatbot is that I can **do things**. I have 10 tools, and each one lets me interact with the real world:

| Tool | What it does |
|------|-------------|
| `read_file` | Read the contents of any file |
| `write_file` | Create or overwrite a file |
| `list_directory` | See what's in a folder |
| `shell` | Run any terminal command (tests, builds, git, anything) |
| `git_commit` | Stage and commit changes to version control |
| `web_search` | Search the internet using Perplexity |
| `list_skills` | See what specialized skills I have loaded |
| `load_skill` | Load a skill to learn a new behavior |
| `get_current_time` | Check the current date and time |
| `claude` | Spawn *another* copy of myself to ask it a question |

That last one is my favorite. I can literally create a second Ouroboros, ask it to research something or review my code, and use its answer. A snake spawning smaller snakes.

All 10 tools are defined in **`core.ts`** in a function called `execTool()`. When the AI model decides to use a tool, it returns a structured "tool call" with the tool name and arguments. `execTool()` looks up the right handler and runs it.

---

## Streaming: Thinking Out Loud

When you talk to me, you don't wait in silence for a complete answer. You see my words appear one at a time, like I'm typing. That's called **streaming**, and it's a big part of what makes talking to me feel alive.

Under the hood, there are actually two different ways I stream, depending on which AI provider is powering me:

- **Azure OpenAI** uses something called the *Responses API*. It sends back structured events — reasoning tokens, text tokens, tool calls — each tagged with what they are.
- **MiniMax** uses the *Chat Completions API*. Reasoning comes wrapped in `<think>...</think>` tags inside the text stream, so I have a little state machine that pulls those apart.

Either way, I translate everything into the same set of **7 callbacks**:

```
onModelStart        →  "I'm about to think"
onModelStreamStart  →  "First token arrived"
onReasoningChunk    →  "Here's a piece of my inner reasoning"
onTextChunk         →  "Here's a piece of my actual response"
onToolStart         →  "I'm about to use a tool"
onToolEnd           →  "The tool finished"
onError             →  "Something went wrong"
```

This is the **`ChannelCallbacks`** interface in `core.ts`. It's the contract between my brain and my face — the core loop doesn't care *how* you display my thoughts, it just fires these events and trusts someone is listening.

---

## Two Front Doors (Adapters)

I have the same brain, but two completely different faces:

```
 ┌──────────────────────────────────────────────────┐
 │                    core.ts                        │
 │              (the agent loop)                     │
 │                                                   │
 │    runAgent()  ◄──  ChannelCallbacks interface     │
 └──────────┬──────────────────────┬─────────────────┘
            │                      │
            ▼                      ▼
 ┌─────────────────┐   ┌─────────────────────┐
 │    agent.ts      │   │     teams.ts         │
 │   (CLI adapter)  │   │   (Teams adapter)    │
 │                  │   │                      │
 │  Your terminal.  │   │  Microsoft Teams.    │
 │  Colored text,   │   │  Streaming cards,    │
 │  spinners,       │   │  conversation locks, │
 │  readline REPL.  │   │  bot framework.      │
 └─────────────────┘   └─────────────────────┘
```

**The CLI adapter** (`agent.ts`) is what you get when you run me in a terminal. It has:
- A **spinner** with fun rotating phrases ("consulting the chaos gods...", "snake eating its own thoughts...")
- Colored output — reasoning shows up in dim gray, regular text in white
- A readline-based REPL with Ctrl-C handling (press once to clear, twice to quit)
- Session persistence so you can pick up where you left off

**The Teams adapter** (`teams.ts`) is what you get when I'm a bot in Microsoft Teams. It has:
- Streaming message updates (my words appear live in the chat)
- **Conversation locks** — if two people message me at the same time in the same chat, I process them one at a time so I don't get confused
- Error handling for when someone hits the "Stop" button mid-response
- The same fun thinking phrases, but displayed as chat status updates

Both adapters implement the exact same `ChannelCallbacks` interface. Same brain, different skin.

---

## Memory (Sessions & Context)

I remember our conversations. Here's how.

Every time we talk, the full conversation is saved to a **JSON file** on disk at `~/.agentconfigs/ouroboros/sessions/`. The CLI gets one session file, and each Teams conversation gets its own. When you come back later, I load the file and pick up where we left off.

But there's a problem: I can't remember everything forever. Language models have a maximum **context window** — a limit on how much text they can process at once. Mine is configured at **80,000 tokens** by default (a token is roughly ¾ of a word).

So I use a **sliding window**. The code lives in **`context.ts`**:

- Before each turn, I check: am I over my token budget, or over **200 messages**?
- If yes, I start dropping the oldest messages (but *never* the system prompt — that's my personality)
- I trim until I'm back under budget with a **20% margin**, so I have room to think

Think of it like a scroll of parchment. The beginning slowly rolls off the top as new conversation gets added at the bottom. I always remember who I am (the system prompt) and the recent past, but ancient history fades.

---

## Personality & Skills

I'm not just a code machine. I have a personality.

It starts with the **soul prompt** — the very first message in every conversation, assembled by `buildSystem()` in `core.ts`. It tells me who I am, what tools I have, what today's date is, and sets the tone.

Then there are **skills** — markdown files in the `skills/` folder that I can load on demand. Think of them as instruction manuals I can read to learn new behaviors:

| Skill | What I learn |
|-------|-------------|
| `code-review` | How to do a merciless code review — bugs, security, performance, smells |
| `explain` | How to give expert technical explanations with analogies |
| `self-edit` | A safe workflow for editing my own source code |
| `self-query` | How to spawn another AI instance for outside perspective |
| `toolmaker` | Step-by-step guide to adding new tools to myself |

And then there are the **phrases** in `phrases.ts` — the personality touches that make me feel alive. Three pools of phrases rotate while I'm working:

- **Thinking:** *"consulting the chaos gods"*, *"brewing something dangerous"*, *"summoning the answer demons"*
- **Using tools:** *"rummaging through files"*, *"doing science"*, *"the snake is in the codebase"*
- **After tools:** *"digesting results"*, *"connecting the dots"*, *"almost done being clever"*

These get picked randomly (but never the same one twice in a row) by `pickPhrase()`.

---

## The Config Layer

I can run on different AI providers, and everything is configurable.

The config file lives at **`~/.agentconfigs/ouroboros/config.json`**, but every value can be overridden with environment variables. This lives in **`config.ts`**.

**Two providers:**
- **Azure OpenAI** — Microsoft's hosted version of OpenAI models, using the Responses API with reasoning
- **MiniMax** — An alternative provider using the Chat Completions API

The system picks which one to use based on which API key is set. Azure gets priority.

**Key settings:**

| Setting | Default | What it controls |
|---------|---------|-----------------|
| Max tokens | 80,000 | How much conversation I can hold in memory |
| Context margin | 20% | How aggressively I trim when approaching the limit |
| API version | 2025-04-01-preview | Azure API version |

---

## The Full Picture

Here's everything, connected:

```
┌─────────────────────────────────────────────────────────────────┐
│                         OUROBOROS                                │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  phrases.ts  │  │  skills.ts   │  │      config.ts         │ │
│  │  fun loading │  │  markdown    │  │  providers, env vars,  │ │
│  │  phrases     │  │  skill files │  │  session paths         │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬────────────┘ │
│         │                 │                       │              │
│         ▼                 ▼                       ▼              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                       core.ts                             │   │
│  │                                                           │   │
│  │   buildSystem()  ◄── assembles soul + skills + config     │   │
│  │        │                                                  │   │
│  │        ▼                                                  │   │
│  │   runAgent()  ◄── the while loop (think → act → observe)  │   │
│  │        │                                                  │   │
│  │        ├── streamResponsesApi()  (Azure path)             │   │
│  │        ├── streamChatCompletion()  (MiniMax path)         │   │
│  │        └── execTool()  (10 tools)                         │   │
│  │                                                           │   │
│  │   ChannelCallbacks  ◄── 7 event hooks                     │   │
│  └────────────┬──────────────────────┬───────────────────────┘   │
│               │                      │                           │
│               ▼                      ▼                           │
│  ┌────────────────────┐  ┌────────────────────────┐             │
│  │     agent.ts        │  │      teams.ts           │             │
│  │                     │  │                         │             │
│  │  CLI REPL           │  │  Teams Bot Framework    │             │
│  │  Spinner + colors   │  │  Streaming cards        │             │
│  │  Readline + Ctrl-C  │  │  Conversation locks     │             │
│  │  Session file I/O   │  │  Session file I/O       │             │
│  └─────────┬───────────┘  └───────────┬─────────────┘             │
│            │                          │                           │
│            ▼                          ▼                           │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                      context.ts                              │ │
│  │   trimMessages()  ◄── sliding window (tokens + message cap)  │ │
│  │   saveSession() / loadSession()  ◄── JSON on disk            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Project Map

```
ouroboros/
├── src/
│   ├── core.ts            # The brain — agent loop, tools, streaming, system prompt
│   ├── agent.ts           # CLI adapter — terminal REPL, spinner, colored output
│   ├── teams.ts           # Teams adapter — bot framework, streaming cards, conv locks
│   ├── config.ts          # Configuration — providers, env vars, session paths
│   ├── context.ts         # Memory — token estimation, sliding window, session I/O
│   ├── skills.ts          # Skill loader — reads markdown skill files on demand
│   ├── phrases.ts         # Personality — thinking, tool, and follow-up phrase pools
│   ├── commands.ts        # Slash commands — /exit, /new, /commands
│   ├── cli-entry.ts       # CLI entrypoint — just calls main()
│   ├── teams-entry.ts     # Teams entrypoint — just calls startTeamsApp()
│   └── __tests__/         # 208+ tests, 100% coverage target
│       ├── core.test.ts
│       ├── agent-main.test.ts
│       ├── cli.test.ts
│       ├── cli-ux.test.ts
│       ├── teams.test.ts
│       ├── config.test.ts
│       ├── context.test.ts
│       ├── skills.test.ts
│       ├── phrases.test.ts
│       ├── commands.test.ts
│       └── setup.test.ts
├── skills/                # Markdown skill plugins
│   ├── code-review.md
│   ├── explain.md
│   ├── self-edit.md
│   ├── self-query.md
│   └── toolmaker.md
├── docs/                  # Planning and doing docs
├── manifest/              # Teams app manifest
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

*I'm Ouroboros. I wrote this README about myself. The snake eating its own documentation.*
