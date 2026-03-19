import { McpClient } from "./mcp-client"
import type { McpToolInfo } from "./mcp-client"
import type { McpServerConfig } from "../heart/identity"
import { emitNervesEvent } from "../nerves/runtime"

interface ServerEntry {
  name: string
  config: McpServerConfig
  client: McpClient
  cachedTools: McpToolInfo[]
  consecutiveFailures: number
}

const MAX_RESTART_RETRIES = 5
const RESTART_DELAY_MS = 1000

export class McpManager {
  private servers = new Map<string, ServerEntry>()
  private shuttingDown = false

  async start(servers: Record<string, McpServerConfig>): Promise<void> {
    emitNervesEvent({
      event: "mcp.manager_start",
      component: "repertoire",
      message: "starting MCP manager",
      meta: { serverCount: Object.keys(servers).length },
    })

    const entries = Object.entries(servers)
    for (const [name, config] of entries) {
      await this.connectServer(name, config)
    }
  }

  listAllTools(): Array<{ server: string; tools: McpToolInfo[] }> {
    const result: Array<{ server: string; tools: McpToolInfo[] }> = []
    for (const [name, entry] of this.servers) {
      result.push({ server: name, tools: entry.cachedTools })
    }
    return result
  }

  async callTool(
    server: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const entry = this.servers.get(server)
    if (!entry) {
      throw new Error(`Unknown server: ${server}`)
    }

    if (!entry.client.isConnected()) {
      throw new Error(`Server "${server}" is disconnected`)
    }

    return entry.client.callTool(tool, args)
  }

  shutdown(): void {
    this.shuttingDown = true
    emitNervesEvent({
      event: "mcp.manager_stop",
      component: "repertoire",
      message: "shutting down MCP manager",
      meta: { serverCount: this.servers.size },
    })

    for (const [, entry] of this.servers) {
      entry.client.shutdown()
    }
    this.servers.clear()
  }

  private async connectServer(name: string, config: McpServerConfig): Promise<void> {
    const client = new McpClient(config)

    const entry: ServerEntry = {
      name,
      config,
      client,
      cachedTools: [],
      consecutiveFailures: 0,
    }

    this.servers.set(name, entry)

    client.onClose(() => {
      if (this.shuttingDown) return
      this.handleServerCrash(name)
    })

    try {
      await client.connect()
      const tools = await client.listTools()
      entry.cachedTools = tools
      entry.consecutiveFailures = 0
    } catch (error) {
      emitNervesEvent({
        level: "error",
        event: "mcp.connect_error",
        component: "repertoire",
        message: `failed to connect MCP server: ${name}`,
        meta: {
          server: name,
          reason: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  private handleServerCrash(name: string): void {
    const entry = this.servers.get(name)
    if (!entry) return

    entry.consecutiveFailures++

    if (entry.consecutiveFailures > MAX_RESTART_RETRIES) {
      emitNervesEvent({
        level: "error",
        event: "mcp.connect_error",
        component: "repertoire",
        message: `MCP server "${name}" exceeded max restart retries (${MAX_RESTART_RETRIES})`,
        meta: { server: name, failures: entry.consecutiveFailures },
      })
      return
    }

    emitNervesEvent({
      level: "warn",
      event: "mcp.server_restart",
      component: "repertoire",
      message: `restarting crashed MCP server: ${name}`,
      meta: { server: name, attempt: entry.consecutiveFailures },
    })

    setTimeout(() => {
      if (this.shuttingDown) return
      this.restartServer(name).catch(() => {
        // Error handling is inside restartServer
      })
    }, RESTART_DELAY_MS)
  }

  private async restartServer(name: string): Promise<void> {
    const entry = this.servers.get(name)
    if (!entry) return

    // Remove old entry and reconnect
    this.servers.delete(name)
    await this.connectServer(name, entry.config)

    // Preserve failure count
    const newEntry = this.servers.get(name)
    if (newEntry) {
      newEntry.consecutiveFailures = entry.consecutiveFailures
    }
  }
}
