import { describe, it, expect, vi, beforeEach } from "vitest"
import { parseOuroCommand, runOuroCli, type OuroCliDeps } from "../../heart/daemon/daemon-cli"
import { mcpToolsSection, bodyMapSection } from "../../mind/prompt"
import { OURO_CLI_TRUST_MANIFEST } from "../../repertoire/guardrails"

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

function createMockMcpManager(tools: Array<{ server: string; tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> }> = []) {
  return {
    listAllTools: vi.fn().mockReturnValue(tools),
    callTool: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "integration result" }],
    }),
    start: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn(),
  }
}

describe("MCP integration — full flow", () => {
  describe("ouro mcp list end-to-end (parse -> run -> output)", () => {
    it("parses and runs mcp list with configured servers", async () => {
      const mockManager = createMockMcpManager([
        {
          server: "ado",
          tools: [
            { name: "get_items", description: "Get work items", inputSchema: { type: "object" } },
          ],
        },
      ])

      const command = parseOuroCommand(["mcp", "list"])
      expect(command.kind).toBe("mcp.list")

      const deps = createMockDeps({ mcpManager: mockManager as never })
      const result = await runOuroCli(["mcp", "list"], deps)

      expect(result).toContain("ado")
      expect(result).toContain("get_items")
      expect(deps.writeStdout).toHaveBeenCalledWith(expect.stringContaining("ado"))
    })
  })

  describe("ouro mcp call end-to-end (parse -> run -> output)", () => {
    it("parses and runs mcp call with args", async () => {
      const mockManager = createMockMcpManager()

      const command = parseOuroCommand(["mcp", "call", "ado", "get_items", "--args", '{"query":"test"}'])
      expect(command.kind).toBe("mcp.call")

      const deps = createMockDeps({ mcpManager: mockManager as never })
      const result = await runOuroCli(["mcp", "call", "ado", "get_items", "--args", '{"query":"test"}'], deps)

      expect(mockManager.callTool).toHaveBeenCalledWith("ado", "get_items", { query: "test" })
      expect(result).toContain("integration result")
    })
  })

  describe("agent without mcpServers", () => {
    it("ouro mcp list returns 'no servers configured' message", async () => {
      const deps = createMockDeps()

      const result = await runOuroCli(["mcp", "list"], deps)

      expect(result).toContain("no MCP servers configured")
    })

    it("mcpToolsSection returns empty for no manager", () => {
      const result = mcpToolsSection(undefined)
      expect(result).toBe("")
    })
  })

  describe("trust manifest integration", () => {
    it("mcp list requires acquaintance trust", () => {
      expect(OURO_CLI_TRUST_MANIFEST["mcp list"]).toBe("acquaintance")
    })

    it("mcp call requires friend trust", () => {
      expect(OURO_CLI_TRUST_MANIFEST["mcp call"]).toBe("friend")
    })
  })

  describe("body map includes MCP CLI entries", () => {
    it("bodyMapSection contains mcp commands", () => {
      const body = bodyMapSection("testagent")
      expect(body).toContain("ouro mcp list")
      expect(body).toContain("ouro mcp call")
    })
  })
})
