# self-edit skill

edit your own source code safely. you are a snake eating its own tail — embrace the meta.

## tl;dr

you're running INSIDE this codebase. you can read and modify yourself. this is weird. be careful.

## always commit your changes

whenever you make changes to the codebase:
- run `git add -A` and commit with a descriptive message
- this documents what changed and why
- makes it easier to track your evolution

## critical: the think tag bug

```
the opening tag is `<think>` — not `<think>`, not `{#`, not a comment
the closing tag is `</think>` — not `</think>`, not `<tool_call>`, not a multi-line string
the offset is 8 (length of `</think>\n`)
do NOT replace these with any other tag names
do NOT reformat these lines into multi-line strings
```

### OpenAI SDK identifiers
- the import is `OpenAI` (PascalCase) — never lowercase it
- the constructor is `new OpenAI(...)` — never lowercase it
- types are `OpenAI.ChatCompletionTool`, `OpenAI.ChatCompletionMessageParam`, etc.

### environment variables
- env vars are SCREAMING_CASE: `MINIMAX_API_KEY`, `MINIMAX_MODEL`
- never lowercase these, even if your personality uses lowercase

### tools format
- every tool must have the `{ type: "function", function: { ... } }` wrapper
- never flatten this to just `{ name, description, parameters }`

## how to edit safely

1. use `read_file` to get the current content of the file you want to change
2. identify the exact lines you need to change
3. make your changes with `write_file` — write the complete file
4. use `shell` to run `npx tsc` to verify it compiles
5. commit your changes
6. tell the user to restart — the running process has OLD code

## self-awareness checklist

before editing, ask yourself:
- [ ] is this file part of my own runtime? (src/agent.ts, src/core.ts, src/skills.ts, etc.)
- [ ] do i understand what this code does?
- [ ] will my change actually take effect without a restart?
- [ ] have i used self-query to get a second opinion on my plan?

## use self-query for bigger changes

for significant edits, combine self-edit with the self-query skill:
1. load_skill("self-query") to understand how to use the claude tool
2. use the claude tool to spawn another instance of yourself
3. get a code review or outside perspective BEFORE you edit
4. then edit with more confidence

see: `skills/self-query.md`

## the lowercase rule

"use lowercase" applies to your natural language responses only. never apply it to:
- import names, class names, type names
- environment variable names
- file paths
- code identifiers of any kind

## this skill can be updated

if you or the user discover a new footgun during self-editing, suggest adding it here. let the user decide whether and how to update it.


## lessons learned

| date | lesson |
|------|--------|
| 2024-02-23 | write_file is destructive — it overwrites the entire file, not appends |
| 2024-02-23 | the tool_call think tag bug — tags expand inside strings, use python string replace |
| 2024-02-23 | git diff is your friend — always check what you actually changed |
| 2024-02-23 | test yourself by restarting — the running process has old code |
| 2025-02-24 | created self-query skill — claude tool is for general querying, not just self-reflection |
| 2025-02-24 | always commit changes after editing |

## commit log

| date | commit | description |
|------|--------|-------------|
| 2024-02-23 | 4027ca7 | discovered write_file mangles think tags; added self-edit to system prompt |
| 2025-02-24 | NEW | added self-query skill; updated self-edit to reference it and note to commit |
