# Configure Dev Tools for MCP Agent Bridge

Set up your development tools (Claude Code, Codex) to communicate with Ouroboros agents via MCP (Model Context Protocol). This enables bidirectional structured communication between dev tools and running agents.

## Detecting dev mode vs installed mode

Before configuring, determine which mode the harness is running in:

- **Installed mode** (`ouro` is on PATH via npm): Use `ouro` as the MCP server command.
- **Dev mode** (`ouro dev --repo-path <path>`): The installed `ouro` binary may not have the latest MCP features. Use `node <repo>/dist/heart/daemon/ouro-entry.js` as the command instead.

To detect: check your runtime info — it shows `runtime mode: dev` or `runtime mode: production`, and `source root: <path>`.

## Claude Code Setup

Use the `claude mcp add` command. Do NOT manually edit settings.json — Claude Code uses its own MCP registry.

### Installed mode

```bash
claude mcp add <agent-name> -s user -- ouro mcp-serve --agent <agent-name>
```

### Dev mode

```bash
claude mcp add <agent-name> -s user -- node <source-root>/dist/heart/daemon/ouro-entry.js mcp-serve --agent <agent-name>
```

Use `-s user` for user-wide scope (all projects) or `-s project` for project-scoped.

To include friend identity (recommended — use your friend ID from the agent's friend store):

```bash
claude mcp add <agent-name> -s user -- node <source-root>/dist/heart/daemon/ouro-entry.js mcp-serve --agent <agent-name> --friend <friend-id>
```

### Verify

```bash
claude mcp list
```

Should show the server as connected.

### Remove

```bash
claude mcp remove <agent-name>
```

## Codex Setup

### Installed mode

```bash
codex mcp add <agent-name> -- ouro mcp-serve --agent <agent-name>
```

### Dev mode

```bash
codex mcp add <agent-name> -- node <source-root>/dist/heart/daemon/ouro-entry.js mcp-serve --agent <agent-name>
```

### Spawned session injection

When the agent spawns Codex for coding tasks, MCP is injected automatically via `-c` flags:

```bash
codex exec -c 'mcp_servers.ouro.command=node' -c 'mcp_servers.ouro.args=["<entry-path>","mcp-serve","--agent","<agent-name>"]' ...
```

You do not need to configure this manually -- the harness handles it.

## Verification

After configuration, verify the connection:

1. **Check daemon is running**: The agent daemon must be active. Start it with `ouro up` (installed) or `ouro dev --repo-path <path>` (dev mode).
2. **Test from Claude Code**: Start a new session and ask Claude to use the `status` tool.
3. **Test from Codex**: Run `codex exec "Use the <agent-name> status tool to check the agent"`.

## Available MCP Tools

Once connected, the following tools are available:

- **ask** -- Ask the agent a question (uses memory and context)
- **status** -- Get agent's current status and activity
- **catchup** -- Get recent activity summary
- **delegate** -- Request the agent to handle a task
- **get_context** -- Get agent's current working context
- **search_memory** -- Search agent's memory for specific topics
- **get_task** -- Get details of the agent's current task
- **check_scope** -- Verify if something is in scope for current work
- **request_decision** -- Ask agent to make a decision about something
- **check_guidance** -- Get guidance on how to approach something
- **report_progress** -- Report progress on delegated work
- **report_blocker** -- Report a blocker on delegated work
- **report_complete** -- Report completion of delegated work

## Hybrid Model

The MCP bridge creates a hybrid collaboration model:

- **Dev tool** (Claude Code / Codex) handles code editing, file operations, and tool execution
- **Agent** (Ouroboros) provides context, memory, task awareness, and decision-making
- **Communication** flows both directions via MCP tool calls

This means the dev tool can ask the agent for guidance mid-task, and the agent can monitor progress through structured reports.

## Troubleshooting

### "Daemon not running" error
The MCP server works in standalone mode for most tools (reads agent state directly from the filesystem). If you see daemon errors for write operations, start the daemon with `ouro up` or `ouro dev`.

### MCP server not appearing in tool list
- Run `claude mcp list` (for Claude Code) or `codex mcp list` (for Codex) to verify registration
- If not listed, re-add using `claude mcp add` or `codex mcp add` — do NOT manually edit settings files
- Restart your dev tool after adding MCP configuration (MCP loads at session start only)

### Connection timeouts
- Claude Code uses Content-Length framing; Codex uses newline-delimited JSON. The server auto-detects and mirrors the client's framing.
- If timeouts persist, check that the entry point path is correct and the `dist/` directory is built.

### Friend identity
By default, the MCP server identifies the caller as the local OS user. To use a specific friend identity, include `--friend <friend-id>` in the args when adding the server.
