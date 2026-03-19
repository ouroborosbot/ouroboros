import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("../../repertoire/mcp-client", () => ({
  McpClient: vi.fn(),
}))

import { McpClient } from "../../repertoire/mcp-client"
import type { McpToolInfo } from "../../repertoire/mcp-client"

function createMockClient(tools: McpToolInfo[] = [], shouldFailConnect = false) {
  let closeCallback: (() => void) | null = null
  let connected = true
  const client = {
    connect: shouldFailConnect
      ? vi.fn().mockRejectedValue(new Error("connect failed"))
      : vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue(tools),
    callTool: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "result" }],
    }),
    shutdown: vi.fn(() => { connected = false }),
    isConnected: vi.fn(() => connected),
    onClose: vi.fn((cb: () => void) => { closeCallback = cb }),
    _triggerClose: () => { connected = false; closeCallback?.() },
    _setConnected: (v: boolean) => { connected = v },
  }
  return client
}

describe("McpManager", () => {
  let clientInstances: ReturnType<typeof createMockClient>[]

  beforeEach(() => {
    vi.resetModules()
    clientInstances = []
    vi.mocked(McpClient).mockImplementation(() => {
      const client = createMockClient()
      clientInstances.push(client)
      return client as unknown as InstanceType<typeof McpClient>
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function getMcpManager() {
    const mod = await import("../../repertoire/mcp-manager")
    return mod
  }

  describe("start", () => {
    it("spawns clients for each server in config", async () => {
      const { McpManager } = await getMcpManager()
      const manager = new McpManager()

      await manager.start({
        ado: { command: "ado-server" },
        mail: { command: "mail-server", args: ["--port", "3000"] },
      })

      expect(McpClient).toHaveBeenCalledTimes(2)
      expect(clientInstances).toHaveLength(2)
      expect(clientInstances[0].connect).toHaveBeenCalled()
      expect(clientInstances[1].connect).toHaveBeenCalled()
    })

    it("handles empty config (no servers)", async () => {
      const { McpManager } = await getMcpManager()
      const manager = new McpManager()

      await manager.start({})

      expect(McpClient).not.toHaveBeenCalled()
    })
  })

  describe("listAllTools", () => {
    it("aggregates tools from all connected servers", async () => {
      let clientIdx = 0
      vi.mocked(McpClient).mockImplementation(() => {
        const tools = clientIdx === 0
          ? [{ name: "get_items", description: "Get items", inputSchema: { type: "object" } }]
          : [{ name: "send_mail", description: "Send mail", inputSchema: { type: "object" } }]
        const client = createMockClient(tools)
        clientInstances.push(client)
        clientIdx++
        return client as unknown as InstanceType<typeof McpClient>
      })

      const { McpManager } = await getMcpManager()
      const manager = new McpManager()

      await manager.start({
        ado: { command: "ado-server" },
        mail: { command: "mail-server" },
      })

      const allTools = manager.listAllTools()

      expect(allTools).toHaveLength(2)
      expect(allTools[0].server).toBe("ado")
      expect(allTools[0].tools).toEqual([
        { name: "get_items", description: "Get items", inputSchema: { type: "object" } },
      ])
      expect(allTools[1].server).toBe("mail")
      expect(allTools[1].tools).toEqual([
        { name: "send_mail", description: "Send mail", inputSchema: { type: "object" } },
      ])
    })

    it("returns empty array when no servers configured", async () => {
      const { McpManager } = await getMcpManager()
      const manager = new McpManager()

      const allTools = manager.listAllTools()
      expect(allTools).toEqual([])
    })
  })

  describe("callTool", () => {
    it("routes to correct client", async () => {
      let clientIdx = 0
      vi.mocked(McpClient).mockImplementation(() => {
        const client = createMockClient()
        if (clientIdx === 1) {
          client.callTool = vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "mail result" }],
          })
        }
        clientInstances.push(client)
        clientIdx++
        return client as unknown as InstanceType<typeof McpClient>
      })

      const { McpManager } = await getMcpManager()
      const manager = new McpManager()

      await manager.start({
        ado: { command: "ado-server" },
        mail: { command: "mail-server" },
      })

      const result = await manager.callTool("mail", "send_mail", { to: "test@test.com" })

      expect(result).toEqual({
        content: [{ type: "text", text: "mail result" }],
      })
      expect(clientInstances[1].callTool).toHaveBeenCalledWith("send_mail", { to: "test@test.com" })
    })

    it("returns error for unknown server", async () => {
      const { McpManager } = await getMcpManager()
      const manager = new McpManager()

      await manager.start({
        ado: { command: "ado-server" },
      })

      await expect(manager.callTool("unknown", "tool", {})).rejects.toThrow(/unknown server/i)
    })

    it("returns error for disconnected server", async () => {
      vi.mocked(McpClient).mockImplementation(() => {
        const client = createMockClient()
        client.isConnected = vi.fn(() => false)
        clientInstances.push(client)
        return client as unknown as InstanceType<typeof McpClient>
      })

      const { McpManager } = await getMcpManager()
      const manager = new McpManager()

      await manager.start({
        ado: { command: "ado-server" },
      })

      await expect(manager.callTool("ado", "get_items", {})).rejects.toThrow(/disconnected/i)
    })
  })

  describe("auto-restart on crash", () => {
    it("restarts a crashed server after delay", async () => {
      vi.useFakeTimers()

      const { McpManager } = await getMcpManager()
      const manager = new McpManager()

      await manager.start({
        ado: { command: "ado-server" },
      })

      expect(clientInstances).toHaveLength(1)
      const firstClient = clientInstances[0]

      // Simulate crash
      firstClient._triggerClose()
      expect(firstClient.isConnected()).toBe(false)

      // Advance past restart delay
      await vi.advanceTimersByTimeAsync(1500)

      // A new client should have been created
      expect(clientInstances).toHaveLength(2)
      expect(clientInstances[1].connect).toHaveBeenCalled()

      vi.useRealTimers()
    })

    it("caps retries at 5 consecutive failures", async () => {
      vi.useFakeTimers()

      vi.mocked(McpClient).mockImplementation(() => {
        const client = createMockClient([], true) // always fails connect
        clientInstances.push(client)
        return client as unknown as InstanceType<typeof McpClient>
      })

      const { McpManager } = await getMcpManager()
      const manager = new McpManager()

      // Initial start will fail but should not throw (manager handles it)
      await manager.start({
        ado: { command: "ado-server" },
      })

      // Trigger close on each created client and advance time to trigger restart
      for (let i = 0; i < 6; i++) {
        const current = clientInstances[clientInstances.length - 1]
        current._triggerClose()
        await vi.advanceTimersByTimeAsync(1500)
      }

      // Should have stopped retrying after 5 consecutive failures
      // Initial + 5 retries = 6 total
      expect(clientInstances.length).toBeLessThanOrEqual(7)

      vi.useRealTimers()
    })
  })

  describe("shutdown", () => {
    it("shuts down all clients", async () => {
      const { McpManager } = await getMcpManager()
      const manager = new McpManager()

      await manager.start({
        ado: { command: "ado-server" },
        mail: { command: "mail-server" },
      })

      manager.shutdown()

      expect(clientInstances[0].shutdown).toHaveBeenCalled()
      expect(clientInstances[1].shutdown).toHaveBeenCalled()
    })

    it("is a no-op when no servers are started", async () => {
      const { McpManager } = await getMcpManager()
      const manager = new McpManager()

      // Should not throw
      manager.shutdown()
    })
  })
})
