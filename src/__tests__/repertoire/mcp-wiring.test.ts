import { describe, it, expect, vi, afterEach } from "vitest"
import { resetSharedMcpManager } from "../../repertoire/mcp-manager"
import type { OuroCliDeps } from "../../heart/daemon/daemon-cli"

/**
 * Tests for MCP Manager wiring into production code paths:
 * 1. daemon-cli.ts runOuroCli lazily initializes mcpManager for mcp commands
 * 2. daemon.ts stop() calls shutdownSharedMcpManager()
 */

function createMockMcpManager() {
  return {
    listAllTools: vi.fn().mockReturnValue([
      { server: "ado", tools: [{ name: "get_items", description: "Get items", inputSchema: { type: "object" } }] },
    ]),
    callTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] }),
    start: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn(),
  }
}

function createMinimalDeps(overrides: Partial<OuroCliDeps> = {}): OuroCliDeps {
  return {
    socketPath: "/tmp/test.sock",
    sendCommand: vi.fn().mockResolvedValue({ ok: true }),
    startDaemonProcess: vi.fn().mockResolvedValue({ pid: 1 }),
    writeStdout: vi.fn(),
    checkSocketAlive: vi.fn().mockResolvedValue(true),
    cleanupStaleSocket: vi.fn(),
    fallbackPendingMessage: vi.fn().mockReturnValue("pending"),
    ...overrides,
  }
}

describe("MCP Manager wiring", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetSharedMcpManager()
  })

  describe("runOuroCli lazy mcpManager init for mcp commands", () => {
    it("mcp list uses getSharedMcpManager when deps.mcpManager is undefined", async () => {
      vi.resetModules()
      const mockManager = createMockMcpManager()

      vi.doMock("../../repertoire/mcp-manager", async () => {
        const actual = await vi.importActual<typeof import("../../repertoire/mcp-manager")>("../../repertoire/mcp-manager")
        return {
          ...actual,
          getSharedMcpManager: vi.fn().mockResolvedValue(mockManager),
        }
      })

      const { runOuroCli } = await import("../../heart/daemon/daemon-cli")
      const deps = createMinimalDeps()

      const result = await runOuroCli(["mcp", "list"], deps)
      expect(result).toContain("ado")
      expect(result).toContain("get_items")

      vi.doUnmock("../../repertoire/mcp-manager")
    })

    it("mcp call uses getSharedMcpManager when deps.mcpManager is undefined", async () => {
      vi.resetModules()
      const mockManager = createMockMcpManager()

      vi.doMock("../../repertoire/mcp-manager", async () => {
        const actual = await vi.importActual<typeof import("../../repertoire/mcp-manager")>("../../repertoire/mcp-manager")
        return {
          ...actual,
          getSharedMcpManager: vi.fn().mockResolvedValue(mockManager),
        }
      })

      const { runOuroCli } = await import("../../heart/daemon/daemon-cli")
      const deps = createMinimalDeps()

      const result = await runOuroCli(["mcp", "call", "ado", "get_items", "--args", '{"query":"test"}'], deps)
      expect(mockManager.callTool).toHaveBeenCalledWith("ado", "get_items", { query: "test" })
      expect(result).toContain("result")

      vi.doUnmock("../../repertoire/mcp-manager")
    })

    it("mcp list still shows 'no servers' when getSharedMcpManager returns null", async () => {
      vi.resetModules()

      vi.doMock("../../repertoire/mcp-manager", async () => {
        const actual = await vi.importActual<typeof import("../../repertoire/mcp-manager")>("../../repertoire/mcp-manager")
        return {
          ...actual,
          getSharedMcpManager: vi.fn().mockResolvedValue(null),
        }
      })

      const { runOuroCli } = await import("../../heart/daemon/daemon-cli")
      const deps = createMinimalDeps()

      const result = await runOuroCli(["mcp", "list"], deps)
      expect(result).toContain("no MCP servers configured")

      vi.doUnmock("../../repertoire/mcp-manager")
    })
  })

  describe("daemon stop calls shutdownSharedMcpManager", () => {
    it("stop() invokes shutdownSharedMcpManager", async () => {
      vi.resetModules()
      const shutdownSpy = vi.fn()

      vi.doMock("../../repertoire/mcp-manager", () => ({
        shutdownSharedMcpManager: shutdownSpy,
      }))

      const { OuroDaemon } = await import("../../heart/daemon/daemon")

      const daemon = new OuroDaemon({
        socketPath: "/tmp/mcp-wiring-test.sock",
        processManager: {
          stopAll: vi.fn(async () => undefined),
          listAgentSnapshots: vi.fn(() => []),
          startAutoStartAgents: vi.fn(async () => undefined),
        },
        scheduler: { listJobs: vi.fn(() => []), stop: vi.fn() },
        healthMonitor: { runChecks: vi.fn(async () => []) },
        router: { send: vi.fn(), pollInbox: vi.fn(() => []) },
        senseManager: { stopAll: vi.fn(async () => undefined), listSenseRows: vi.fn(() => []) },
      } as any)

      await daemon.stop()
      expect(shutdownSpy).toHaveBeenCalledOnce()

      vi.doUnmock("../../repertoire/mcp-manager")
    })
  })
})
