import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { EventEmitter, PassThrough } from "stream"

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}))

import { spawn } from "child_process"
import type { ChildProcess } from "child_process"

function createMockProcess(): ChildProcess & {
  _stdout: PassThrough
  _stderr: PassThrough
  _stdin: PassThrough
} {
  const proc = new EventEmitter() as ChildProcess & {
    _stdout: PassThrough
    _stderr: PassThrough
    _stdin: PassThrough
    pid: number
    killed: boolean
  }
  proc._stdout = new PassThrough()
  proc._stderr = new PassThrough()
  proc._stdin = new PassThrough()
  proc.stdout = proc._stdout
  proc.stderr = proc._stderr
  proc.stdin = proc._stdin
  proc.pid = 12345
  proc.killed = false
  proc.kill = vi.fn(() => {
    proc.killed = true
    proc.emit("close", 0)
    return true
  })
  return proc
}

function sendResponse(proc: ReturnType<typeof createMockProcess>, response: Record<string, unknown>): void {
  proc._stdout.write(JSON.stringify(response) + "\n")
}

describe("McpClient", () => {
  let mockProc: ReturnType<typeof createMockProcess>

  beforeEach(() => {
    vi.resetModules()
    mockProc = createMockProcess()
    vi.mocked(spawn).mockReturnValue(mockProc as unknown as ChildProcess)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function getMcpClient() {
    const mod = await import("../../repertoire/mcp-client")
    return mod
  }

  describe("connect (initialize handshake)", () => {
    it("spawns the process and completes initialize handshake", async () => {
      const { McpClient } = await getMcpClient()
      const client = new McpClient({ command: "my-server", args: ["--port", "3000"], env: { TOKEN: "abc" } })

      const connectPromise = client.connect()

      // Wait for the initialize request to be written
      await new Promise(resolve => setTimeout(resolve, 10))

      // Read what was written to stdin
      const written = mockProc._stdin.read()
      expect(written).toBeTruthy()
      const request = JSON.parse(written.toString())
      expect(request.method).toBe("initialize")
      expect(request.jsonrpc).toBe("2.0")
      expect(request.params.protocolVersion).toBeDefined()
      expect(request.params.clientInfo).toBeDefined()

      // Send back initialize response
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "test-server", version: "1.0" },
          capabilities: { tools: {} },
        },
      })

      await connectPromise

      // Verify spawn was called with correct args
      expect(spawn).toHaveBeenCalledWith("my-server", ["--port", "3000"], expect.objectContaining({
        env: expect.objectContaining({ TOKEN: "abc" }),
        stdio: ["pipe", "pipe", "pipe"],
      }))
    })
  })

  describe("listTools", () => {
    it("sends tools/list and returns tools (single page, no cursor)", async () => {
      const { McpClient } = await getMcpClient()
      const client = new McpClient({ command: "server" })

      const connectPromise = client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))

      // Complete handshake
      const initReq = JSON.parse(mockProc._stdin.read().toString())
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: initReq.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "test", version: "1.0" },
          capabilities: { tools: {} },
        },
      })
      await connectPromise

      const listPromise = client.listTools()
      await new Promise(resolve => setTimeout(resolve, 10))

      const listReq = JSON.parse(mockProc._stdin.read().toString())
      expect(listReq.method).toBe("tools/list")

      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: listReq.id,
        result: {
          tools: [
            { name: "get_items", description: "Get work items", inputSchema: { type: "object" } },
            { name: "create_item", description: "Create item", inputSchema: { type: "object" } },
          ],
        },
      })

      const tools = await listPromise
      expect(tools).toEqual([
        { name: "get_items", description: "Get work items", inputSchema: { type: "object" } },
        { name: "create_item", description: "Create item", inputSchema: { type: "object" } },
      ])
    })

    it("handles pagination with cursor loop", async () => {
      const { McpClient } = await getMcpClient()
      const client = new McpClient({ command: "server" })

      const connectPromise = client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      const initReq = JSON.parse(mockProc._stdin.read().toString())
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: initReq.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "test", version: "1.0" },
          capabilities: { tools: {} },
        },
      })
      await connectPromise

      const listPromise = client.listTools()
      await new Promise(resolve => setTimeout(resolve, 10))

      // First page with cursor
      const req1 = JSON.parse(mockProc._stdin.read().toString())
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: req1.id,
        result: {
          tools: [{ name: "tool1", description: "Tool 1", inputSchema: { type: "object" } }],
          nextCursor: "page2",
        },
      })

      await new Promise(resolve => setTimeout(resolve, 10))

      // Second page without cursor
      const req2 = JSON.parse(mockProc._stdin.read().toString())
      expect(req2.params.cursor).toBe("page2")
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: req2.id,
        result: {
          tools: [{ name: "tool2", description: "Tool 2", inputSchema: { type: "object" } }],
        },
      })

      const tools = await listPromise
      expect(tools).toHaveLength(2)
      expect(tools[0].name).toBe("tool1")
      expect(tools[1].name).toBe("tool2")
    })

    it("returns cached tools on subsequent calls", async () => {
      const { McpClient } = await getMcpClient()
      const client = new McpClient({ command: "server" })

      const connectPromise = client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      const initReq = JSON.parse(mockProc._stdin.read().toString())
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: initReq.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "test", version: "1.0" },
          capabilities: { tools: {} },
        },
      })
      await connectPromise

      const listPromise = client.listTools()
      await new Promise(resolve => setTimeout(resolve, 10))
      const listReq = JSON.parse(mockProc._stdin.read().toString())
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: listReq.id,
        result: {
          tools: [{ name: "tool1", description: "Tool 1", inputSchema: { type: "object" } }],
        },
      })
      await listPromise

      // Second call should return cached result without new request
      const cached = await client.listTools()
      expect(cached).toEqual([{ name: "tool1", description: "Tool 1", inputSchema: { type: "object" } }])
    })
  })

  describe("callTool", () => {
    it("sends tools/call and returns the result", async () => {
      const { McpClient } = await getMcpClient()
      const client = new McpClient({ command: "server" })

      // Connect
      const connectPromise = client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      const initReq = JSON.parse(mockProc._stdin.read().toString())
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: initReq.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "test", version: "1.0" },
          capabilities: { tools: {} },
        },
      })
      await connectPromise

      const callPromise = client.callTool("get_items", { query: "test" })
      await new Promise(resolve => setTimeout(resolve, 10))

      const callReq = JSON.parse(mockProc._stdin.read().toString())
      expect(callReq.method).toBe("tools/call")
      expect(callReq.params.name).toBe("get_items")
      expect(callReq.params.arguments).toEqual({ query: "test" })

      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: callReq.id,
        result: {
          content: [{ type: "text", text: "item1\nitem2" }],
        },
      })

      const result = await callPromise
      expect(result).toEqual({
        content: [{ type: "text", text: "item1\nitem2" }],
      })
    })

    it("enforces timeout on tools/call", async () => {
      const { McpClient } = await getMcpClient()
      const client = new McpClient({ command: "server" })

      // Connect
      const connectPromise = client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      const initReq = JSON.parse(mockProc._stdin.read().toString())
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: initReq.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "test", version: "1.0" },
          capabilities: { tools: {} },
        },
      })
      await connectPromise

      // Use a very short timeout (50ms) and never respond
      vi.useFakeTimers()
      const callPromise = client.callTool("slow_tool", {}, 50)

      await vi.advanceTimersByTimeAsync(60)

      await expect(callPromise).rejects.toThrow(/timeout/i)
      vi.useRealTimers()
    })
  })

  describe("JSON-RPC error handling", () => {
    it("rejects with error when server returns JSON-RPC error", async () => {
      const { McpClient } = await getMcpClient()
      const client = new McpClient({ command: "server" })

      const connectPromise = client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      const initReq = JSON.parse(mockProc._stdin.read().toString())
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: initReq.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "test", version: "1.0" },
          capabilities: { tools: {} },
        },
      })
      await connectPromise

      const callPromise = client.callTool("bad_tool", {})
      await new Promise(resolve => setTimeout(resolve, 10))

      const callReq = JSON.parse(mockProc._stdin.read().toString())
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: callReq.id,
        error: { code: -32601, message: "Method not found" },
      })

      await expect(callPromise).rejects.toThrow("Method not found")
    })
  })

  describe("process crash detection", () => {
    it("sets state to disconnected on process close", async () => {
      const { McpClient } = await getMcpClient()
      const client = new McpClient({ command: "server" })

      const connectPromise = client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      const initReq = JSON.parse(mockProc._stdin.read().toString())
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: initReq.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "test", version: "1.0" },
          capabilities: { tools: {} },
        },
      })
      await connectPromise

      expect(client.isConnected()).toBe(true)

      // Simulate process crash
      mockProc.emit("close", 1)
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(client.isConnected()).toBe(false)
    })

    it("rejects pending requests when process crashes", async () => {
      const { McpClient } = await getMcpClient()
      const client = new McpClient({ command: "server" })

      const connectPromise = client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      const initReq = JSON.parse(mockProc._stdin.read().toString())
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: initReq.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "test", version: "1.0" },
          capabilities: { tools: {} },
        },
      })
      await connectPromise

      const callPromise = client.callTool("some_tool", {})
      await new Promise(resolve => setTimeout(resolve, 10))

      // Crash the process without responding
      mockProc.emit("close", 1)

      await expect(callPromise).rejects.toThrow(/disconnected|crash|close/i)
    })
  })

  describe("shutdown", () => {
    it("kills the process gracefully", async () => {
      const { McpClient } = await getMcpClient()
      const client = new McpClient({ command: "server" })

      const connectPromise = client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      const initReq = JSON.parse(mockProc._stdin.read().toString())
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: initReq.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "test", version: "1.0" },
          capabilities: { tools: {} },
        },
      })
      await connectPromise

      client.shutdown()

      expect(mockProc.kill).toHaveBeenCalled()
      expect(client.isConnected()).toBe(false)
    })
  })

  describe("invalid JSON handling", () => {
    it("ignores malformed JSON lines on stdout", async () => {
      const { McpClient } = await getMcpClient()
      const client = new McpClient({ command: "server" })

      const connectPromise = client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))

      // Send garbage first
      mockProc._stdout.write("not json at all\n")
      await new Promise(resolve => setTimeout(resolve, 10))

      // Then send valid initialize response
      const initReq = JSON.parse(mockProc._stdin.read().toString())
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: initReq.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "test", version: "1.0" },
          capabilities: { tools: {} },
        },
      })

      await connectPromise
      expect(client.isConnected()).toBe(true)
    })
  })

  describe("concurrent request ID matching", () => {
    it("routes responses to correct pending requests by ID", async () => {
      const { McpClient } = await getMcpClient()
      const client = new McpClient({ command: "server" })

      const connectPromise = client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      const initReq = JSON.parse(mockProc._stdin.read().toString())
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: initReq.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "test", version: "1.0" },
          capabilities: { tools: {} },
        },
      })
      await connectPromise

      // Fire two concurrent requests
      const call1 = client.callTool("tool_a", { x: 1 })
      const call2 = client.callTool("tool_b", { y: 2 })
      await new Promise(resolve => setTimeout(resolve, 10))

      // Read both requests
      const allData = mockProc._stdin.read()?.toString() ?? ""
      const lines = allData.split("\n").filter(Boolean)
      expect(lines).toHaveLength(2)
      const req1 = JSON.parse(lines[0])
      const req2 = JSON.parse(lines[1])

      // Respond to second request first (out of order)
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: req2.id,
        result: { content: [{ type: "text", text: "result_b" }] },
      })
      sendResponse(mockProc, {
        jsonrpc: "2.0",
        id: req1.id,
        result: { content: [{ type: "text", text: "result_a" }] },
      })

      const [result1, result2] = await Promise.all([call1, call2])
      expect(result1.content[0].text).toBe("result_a")
      expect(result2.content[0].text).toBe("result_b")
    })
  })

  describe("error event on process error", () => {
    it("handles process error event", async () => {
      const { McpClient } = await getMcpClient()
      const client = new McpClient({ command: "nonexistent-binary" })

      const connectPromise = client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))

      // Simulate spawn error
      mockProc.emit("error", new Error("spawn ENOENT"))
      mockProc.emit("close", 1)

      await expect(connectPromise).rejects.toThrow(/ENOENT|disconnected|close/i)
    })
  })
})
