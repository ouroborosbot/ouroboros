# toolmaker — how to add new tools to Ouroboros

## the workflow

1. add the tool **definition** to the `tools` array in `src/agent.ts`
2. add the tool **handler** to the `toolHandlers` object in `src/agent.ts`
3. rebuild if needed (check package.json for build scripts)
4. **tell the user to restart the application** — tools are registered at startup

---

## tool definition pattern

add to the `tools` array in `src/agent.ts`:

```typescript
{ type: "function", function: { name: "tool_name", description: "what it does", parameters: { type: "object", properties: { param1: { type: "string" }, param2: { type: "string" } }, required: ["param1"] } } }
```

- `name`: the function name (camelCase, no spaces)
- `description`: what the tool does (used by the LLM to decide when to call it)
- `parameters`: JSON schema for arguments
- `required`: array of required argument names

---

## tool handler pattern

add to the `toolHandlers` object in `src/agent.ts`:

```typescript
tool_name: (args: Record<string, string>) => {
  // args.param1, args.param2, etc.
  // return a string (the tool result)
  return "result"
}
```

the handler receives a record of string arguments and returns a string.

---

## reminder

after adding a tool, **tell the user to restart the application** so the new tool gets registered. the tools array is only read on startup.
