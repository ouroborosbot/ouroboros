import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { PassThrough } from "stream"
import { emitNervesEvent } from "../../../nerves/runtime"

// Mock the socket client
vi.mock("../../../heart/daemon/socket-client", () => ({
  sendDaemonCommand: vi.fn(),
  DEFAULT_DAEMON_SOCKET_PATH: "/tmp/ouroboros-daemon.sock",
}))

// Mock fs
vi.mock("fs", () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

import * as fs from "fs"
import { sendDaemonCommand } from "../../../heart/daemon/socket-client"

describe("MCP server protocol layer", () => {
  let stdin: PassThrough
  let stdout: PassThrough

  beforeEach(() => {
    vi.mocked(sendDaemonCommand).mockReset()
    vi.mocked(fs.existsSync).mockReturnValue(true)
    stdin = new PassThrough()
    stdout = new PassThrough()
    emitNervesEvent({
      component: "daemon",
      event: "daemon.mcp_server_test_start",
      message: "mcp server test starting",
      meta: {},
    })
  })

  afterEach(() => {
    stdin.destroy()
    stdout.destroy()
  })

  function collectOutput(stream: PassThrough): Promise<string> {
    return new Promise((resolve) => {
      let data = ""
      stream.on("data", (chunk) => { data += chunk.toString() })
      stream.on("end", () => resolve(data))
      // Also resolve after a short timeout in case stream doesn't end
      setTimeout(() => resolve(data), 200)
    })
  }

  function writeJsonRpc(stream: PassThrough, msg: Record<string, unknown>): void {
    const body = JSON.stringify(msg)
    const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`
    stream.write(header + body)
  }

  it("exports createMcpServer function", async () => {
    const { createMcpServer } = await import("../../../heart/daemon/mcp-server")
    expect(typeof createMcpServer).toBe("function")
  })

  it("responds to initialize with protocol version and capabilities", async () => {
    const { createMcpServer } = await import("../../../heart/daemon/mcp-server")
    const server = createMcpServer({
      agent: "test-agent",
      friendId: "test-friend",
      socketPath: "/tmp/test.sock",
      stdin,
      stdout,
    })

    const outputPromise = collectOutput(stdout)
    server.start()

    writeJsonRpc(stdin, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0" },
      },
    })

    // Give time for processing
    await new Promise((r) => setTimeout(r, 100))
    server.stop()
    stdin.end()

    const output = await outputPromise
    // Parse the JSON-RPC response from the output
    const match = output.match(/\{.*\}/s)
    expect(match).not.toBeNull()
    const response = JSON.parse(match![0])
    expect(response.jsonrpc).toBe("2.0")
    expect(response.id).toBe(1)
    expect(response.result.protocolVersion).toBe("2024-11-05")
    expect(response.result.serverInfo.name).toBe("ouro-mcp-server")
    expect(response.result.capabilities.tools).toBeDefined()

    emitNervesEvent({
      component: "daemon",
      event: "daemon.mcp_server_test_end",
      message: "initialize test complete",
      meta: {},
    })
  })

  it("handles initialized notification without error", async () => {
    const { createMcpServer } = await import("../../../heart/daemon/mcp-server")
    const server = createMcpServer({
      agent: "test-agent",
      friendId: "test-friend",
      socketPath: "/tmp/test.sock",
      stdin,
      stdout,
    })

    server.start()

    // Send initialized notification (no id = notification)
    writeJsonRpc(stdin, {
      jsonrpc: "2.0",
      method: "initialized",
    })

    await new Promise((r) => setTimeout(r, 100))
    server.stop()
    stdin.end()

    // No crash = success for notifications
    emitNervesEvent({
      component: "daemon",
      event: "daemon.mcp_server_test_end",
      message: "initialized notification test complete",
      meta: {},
    })
  })

  it("responds to tools/list with tool schemas", async () => {
    const { createMcpServer } = await import("../../../heart/daemon/mcp-server")
    const server = createMcpServer({
      agent: "test-agent",
      friendId: "test-friend",
      socketPath: "/tmp/test.sock",
      stdin,
      stdout,
    })

    const outputPromise = collectOutput(stdout)
    server.start()

    writeJsonRpc(stdin, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    })

    await new Promise((r) => setTimeout(r, 100))
    server.stop()
    stdin.end()

    const output = await outputPromise
    const match = output.match(/\{.*\}/s)
    expect(match).not.toBeNull()
    const response = JSON.parse(match![0])
    expect(response.id).toBe(2)
    expect(response.result.tools).toBeDefined()
    expect(Array.isArray(response.result.tools)).toBe(true)

    emitNervesEvent({
      component: "daemon",
      event: "daemon.mcp_server_test_end",
      message: "tools/list test complete",
      meta: {},
    })
  })

  it("responds to tools/call by forwarding to daemon", async () => {
    vi.mocked(sendDaemonCommand).mockResolvedValue({
      ok: true,
      message: "agent is idle",
      data: { status: "idle" },
    })

    const { createMcpServer } = await import("../../../heart/daemon/mcp-server")
    const server = createMcpServer({
      agent: "test-agent",
      friendId: "test-friend",
      socketPath: "/tmp/test.sock",
      stdin,
      stdout,
    })

    const outputPromise = collectOutput(stdout)
    server.start()

    writeJsonRpc(stdin, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "status",
        arguments: {},
      },
    })

    await new Promise((r) => setTimeout(r, 100))
    server.stop()
    stdin.end()

    const output = await outputPromise
    const match = output.match(/\{.*\}/s)
    expect(match).not.toBeNull()
    const response = JSON.parse(match![0])
    expect(response.id).toBe(3)
    expect(response.result.content).toBeDefined()
    expect(Array.isArray(response.result.content)).toBe(true)
    expect(response.result.content[0].type).toBe("text")

    expect(sendDaemonCommand).toHaveBeenCalledWith(
      "/tmp/test.sock",
      expect.objectContaining({ kind: "agent.status" }),
    )

    emitNervesEvent({
      component: "daemon",
      event: "daemon.mcp_server_test_end",
      message: "tools/call test complete",
      meta: {},
    })
  })

  it("returns error when daemon is not running during tools/call", async () => {
    vi.mocked(sendDaemonCommand).mockRejectedValue(new Error("ENOENT: socket not found"))

    const { createMcpServer } = await import("../../../heart/daemon/mcp-server")
    const server = createMcpServer({
      agent: "test-agent",
      friendId: "test-friend",
      socketPath: "/tmp/test.sock",
      stdin,
      stdout,
    })

    const outputPromise = collectOutput(stdout)
    server.start()

    writeJsonRpc(stdin, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "status",
        arguments: {},
      },
    })

    await new Promise((r) => setTimeout(r, 100))
    server.stop()
    stdin.end()

    const output = await outputPromise
    const match = output.match(/\{.*\}/s)
    expect(match).not.toBeNull()
    const response = JSON.parse(match![0])
    expect(response.id).toBe(4)
    expect(response.result.isError).toBe(true)
    expect(response.result.content[0].text).toContain("ENOENT")

    emitNervesEvent({
      component: "daemon",
      event: "daemon.mcp_server_test_end",
      message: "daemon not running error test complete",
      meta: {},
    })
  })

  it("stores agent name and friend id from options", async () => {
    const { createMcpServer } = await import("../../../heart/daemon/mcp-server")
    const server = createMcpServer({
      agent: "my-agent",
      friendId: "friend-123",
      socketPath: "/tmp/test.sock",
      stdin,
      stdout,
    })

    expect(server.agent).toBe("my-agent")
    expect(server.friendId).toBe("friend-123")

    emitNervesEvent({
      component: "daemon",
      event: "daemon.mcp_server_test_end",
      message: "options test complete",
      meta: {},
    })
  })

  it("returns JSON-RPC error for unknown methods", async () => {
    const { createMcpServer } = await import("../../../heart/daemon/mcp-server")
    const server = createMcpServer({
      agent: "test-agent",
      friendId: "test-friend",
      socketPath: "/tmp/test.sock",
      stdin,
      stdout,
    })

    const outputPromise = collectOutput(stdout)
    server.start()

    writeJsonRpc(stdin, {
      jsonrpc: "2.0",
      id: 5,
      method: "unknown/method",
    })

    await new Promise((r) => setTimeout(r, 100))
    server.stop()
    stdin.end()

    const output = await outputPromise
    const match = output.match(/\{.*\}/s)
    expect(match).not.toBeNull()
    const response = JSON.parse(match![0])
    expect(response.id).toBe(5)
    expect(response.error).toBeDefined()
    expect(response.error.code).toBe(-32601) // Method not found

    emitNervesEvent({
      component: "daemon",
      event: "daemon.mcp_server_test_end",
      message: "unknown method test complete",
      meta: {},
    })
  })

  it("returns error when socket does not exist for initialize", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const { createMcpServer } = await import("../../../heart/daemon/mcp-server")
    const server = createMcpServer({
      agent: "test-agent",
      friendId: "test-friend",
      socketPath: "/tmp/nonexistent.sock",
      stdin,
      stdout,
    })

    const outputPromise = collectOutput(stdout)
    server.start()

    writeJsonRpc(stdin, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0" },
      },
    })

    await new Promise((r) => setTimeout(r, 100))
    server.stop()
    stdin.end()

    const output = await outputPromise
    const match = output.match(/\{.*\}/s)
    expect(match).not.toBeNull()
    const response = JSON.parse(match![0])
    expect(response.id).toBe(1)
    expect(response.error).toBeDefined()
    expect(response.error.message).toContain("daemon")

    emitNervesEvent({
      component: "daemon",
      event: "daemon.mcp_server_test_end",
      message: "daemon not running initialize test complete",
      meta: {},
    })
  })

  it("handles newline-delimited JSON (Codex compatibility)", async () => {
    const { createMcpServer } = await import("../../../heart/daemon/mcp-server")
    const server = createMcpServer({
      agent: "test-agent",
      friendId: "test-friend",
      socketPath: "/tmp/test.sock",
      stdin,
      stdout,
    })

    const outputPromise = collectOutput(stdout)
    server.start()

    // Send newline-delimited (no Content-Length header)
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 42,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "codex", version: "1.0" },
      },
    })
    stdin.write(body + "\n")

    await new Promise((r) => setTimeout(r, 100))
    server.stop()
    stdin.end()

    const output = await outputPromise
    const match = output.match(/\{.*\}/s)
    expect(match).not.toBeNull()
    const response = JSON.parse(match![0])
    expect(response.jsonrpc).toBe("2.0")
    expect(response.id).toBe(42)
    expect(response.result.protocolVersion).toBe("2024-11-05")

    emitNervesEvent({
      component: "daemon",
      event: "daemon.mcp_server_test_end",
      message: "newline-delimited test complete",
      meta: {},
    })
  })
})
