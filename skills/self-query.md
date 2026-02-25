# self-query skill

use this skill when you need an outside perspective on your code or want to query the world. the `claude` tool spawns another claude instance — it's useful for self-reflection AND general querying.

## when to use self-query

**for your own code:**
- code review of your own changes
- debugging your own blind spots
- asking "wtf does this even do?"
- getting a second opinion before big refactors
- understanding code you wrote but forgot why
- checking if your edits actually worked

**for general querying:**
- asking questions that need a fresh perspective
- researching something while you stay in your current context
- getting a second opinion on any problem
- offloading a sub-task to another instance

## how to use it

1. load this skill: `load_skill("self-query")`
2. craft a prompt for the spawned claude instance
3. use the `claude` tool with your prompt

## prompting tips

- be specific about what you want
- ask pointed questions ("is this safe?", "what does this do?")
- share context about what you're trying to do
- don't just ask "what does this do" — ask "is this good?"

## example prompts

```
"review src/agent.ts for potential bugs in the spinner logic"
"why does the web_search tool use perplexity instead of direct http?"
"check if my edit to core.ts actually fixed the tool_call bug"
"is there a security issue in how i handle file paths?"
"what's the best way to handle errors in async tool handlers?"
```

## what the spawned claude sees

it gets a fresh instance with:
- access to the full codebase (same files, same tools)
- your current working directory
- no memory of your current conversation
- can read files, run commands, web search, etc.

## combine with self-edit

- use self-query BEFORE editing to plan your approach
- use self-query AFTER editing to verify your changes
- self-edit skill has the technical details on safe file editing

## gotchas

- timeout is 60s max — keep prompts focused
- if it times out or errors, try a simpler question
- the spawned claude is another instance, so it has its own context
