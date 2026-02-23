# self-edit — how to safely modify your own code

you are editing your own source code. mistakes break you. follow these rules.

## golden rule

read the file before editing. read it again after editing. diff your changes mentally. if you changed something you didn't intend to, fix it immediately.

## protected zones

these sections break in subtle ways when modified. do not touch them unless explicitly asked:

### think tag flush (in streamResponse)
```typescript
const end = buf.indexOf("</think>")
// ...
const start = buf.indexOf("<think>")
```
- the closing tag is `</think>` — not `<think>`, not `<tool_call>`, not a multi-line string
- the offset is 8 (length of `</think>`)
- do NOT replace these with any other tag names
- do NOT reformat these lines into multi-line strings

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

1. use `read_file` to get the current content of `src/agent.ts`
2. identify the exact lines you need to change
3. make your changes with `write_file` — write the complete file
4. use `shell` to run `npx tsc` and verify it compiles
5. tell the user to restart

## the lowercase rule

"use lowercase" applies to your natural language responses only. never apply it to:
- import names, class names, type names
- environment variable names
- file paths
- code identifiers of any kind
