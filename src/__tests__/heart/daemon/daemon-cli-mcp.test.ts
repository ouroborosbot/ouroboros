import { describe, it, expect, vi, beforeEach } from "vitest"

import {
  parseOuroCommand,
  runOuroCli,
  type OuroCliDeps,
} from "../../../heart/daemon/daemon-cli"

function createMockDeps(overrides: Partial<OuroCliDeps> = {}): OuroCliDeps {
  return {
    socketPath: "/tmp/ouro-test.sock",
    sendCommand: vi.fn().mockResolvedValue({ ok: true, summary: "ok" }),
    startDaemonProcess: vi.fn().mockResolvedValue({ pid: 12345 }),
    writeStdout: vi.fn(),
    checkSocketAlive: vi.fn().mockResolvedValue(true),
    cleanupStaleSocket: vi.fn(),
    fallbackPendingMessage: vi.fn().mockReturnValue("pending"),
    ...overrides,
  }
}

describe("ouro mcp CLI parsing", () => {
  it("parses 'mcp list' command", () => {
    expect(parseOuroCommand(["mcp", "list"])).toEqual({ kind: "mcp.list" })
  })

  it("parses 'mcp call' with server, tool, and args", () => {
    expect(
      parseOuroCommand(["mcp", "call", "ado", "get_work_items", "--args", '{"query":"..."}'])
    ).toEqual({
      kind: "mcp.call",
      server: "ado",
      tool: "get_work_items",
      args: '{"query":"..."}',
    })
  })

  it("parses 'mcp call' without args flag", () => {
    expect(parseOuroCommand(["mcp", "call", "ado", "get_work_items"])).toEqual({
      kind: "mcp.call",
      server: "ado",
      tool: "get_work_items",
    })
  })

  it("throws for 'mcp call' with missing server/tool", () => {
    expect(() => parseOuroCommand(["mcp", "call"])).toThrow(/usage/i)
    expect(() => parseOuroCommand(["mcp", "call", "ado"])).toThrow(/usage/i)
  })

  it("throws for 'mcp' with unknown subcommand", () => {
    expect(() => parseOuroCommand(["mcp", "unknown"])).toThrow(/usage/i)
  })

  it("throws for bare 'mcp' without subcommand", () => {
    expect(() => parseOuroCommand(["mcp"])).toThrow(/usage/i)
  })
})

describe("ouro mcp CLI execution", () => {
  let mockMcpManager: {
    listAllTools: ReturnType<typeof vi.fn>
    callTool: ReturnType<typeof vi.fn>
    start: ReturnType<typeof vi.fn>
    shutdown: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockMcpManager = {
      listAllTools: vi.fn().mockReturnValue([
        {
          server: "ado",
          tools: [
            { name: "get_items", description: "Get work items", inputSchema: { type: "object" } },
          ],
        },
        {
          server: "mail",
          tools: [
            { name: "send_mail", description: "Send mail", inputSchema: { type: "object" } },
          ],
        },
      ]),
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "tool result here" }],
      }),
      start: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn(),
    }
  })

  it("'mcp list' calls listAllTools and formats output", async () => {
    const deps = createMockDeps({ mcpManager: mockMcpManager as never })

    const result = await runOuroCli(["mcp", "list"], deps)

    expect(mockMcpManager.listAllTools).toHaveBeenCalled()
    expect(result).toContain("ado")
    expect(result).toContain("get_items")
    expect(result).toContain("mail")
    expect(result).toContain("send_mail")
  })

  it("'mcp call' calls callTool and prints result", async () => {
    const deps = createMockDeps({ mcpManager: mockMcpManager as never })

    const result = await runOuroCli(["mcp", "call", "ado", "get_items", "--args", '{"query":"test"}'], deps)

    expect(mockMcpManager.callTool).toHaveBeenCalledWith("ado", "get_items", { query: "test" })
    expect(result).toContain("tool result here")
  })

  it("'mcp call' without args passes empty object", async () => {
    const deps = createMockDeps({ mcpManager: mockMcpManager as never })

    await runOuroCli(["mcp", "call", "ado", "get_items"], deps)

    expect(mockMcpManager.callTool).toHaveBeenCalledWith("ado", "get_items", {})
  })

  it("'mcp list' with no mcpManager returns helpful error", async () => {
    const deps = createMockDeps()

    const result = await runOuroCli(["mcp", "list"], deps)

    expect(result).toContain("no MCP servers configured")
  })

  it("'mcp call' with no mcpManager returns helpful error", async () => {
    const deps = createMockDeps()

    const result = await runOuroCli(["mcp", "call", "ado", "get_items"], deps)

    expect(result).toContain("no MCP servers configured")
  })

  it("'mcp list' with empty tools shows appropriate message", async () => {
    mockMcpManager.listAllTools.mockReturnValue([])
    const deps = createMockDeps({ mcpManager: mockMcpManager as never })

    const result = await runOuroCli(["mcp", "list"], deps)

    expect(result).toContain("no tools")
  })
})
