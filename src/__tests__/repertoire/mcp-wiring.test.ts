import { describe, it, expect, vi, afterEach } from "vitest"
import { resetSharedMcpManager } from "../../repertoire/mcp-manager"

/**
 * Tests for MCP Manager wiring into production code paths:
 * 1. daemon.ts handleCommand routes mcp.list/mcp.call to shared manager
 * 2. daemon.ts stop() calls shutdownSharedMcpManager()
 * 3. CLI routes mcp commands through daemon socket (not locally)
 */

describe("MCP Manager wiring", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetSharedMcpManager()
  })

  describe("daemon stop calls shutdownSharedMcpManager", () => {
    it("stop() invokes shutdownSharedMcpManager", async () => {
      vi.resetModules()
      const shutdownSpy = vi.fn()

      vi.doMock("../../repertoire/mcp-manager", () => ({
        getSharedMcpManager: vi.fn().mockResolvedValue(null),
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

  describe("CLI routes mcp commands through daemon socket", () => {
    it("mcp list goes through sendCommand, not local mcpManager", async () => {
      const { runOuroCli } = await import("../../heart/daemon/daemon-cli")

      const sendCommand = vi.fn().mockResolvedValue({
        ok: true,
        data: [
          { server: "ado", tools: [{ name: "get_items", description: "Get items" }] },
        ],
      })

      const deps = {
        socketPath: "/tmp/test.sock",
        sendCommand,
        startDaemonProcess: vi.fn().mockResolvedValue({ pid: 1 }),
        writeStdout: vi.fn(),
        checkSocketAlive: vi.fn().mockResolvedValue(true),
        cleanupStaleSocket: vi.fn(),
        fallbackPendingMessage: vi.fn().mockReturnValue("pending"),
      }

      const result = await runOuroCli(["mcp", "list"], deps)
      expect(sendCommand).toHaveBeenCalledWith("/tmp/test.sock", { kind: "mcp.list" })
      expect(result).toContain("ado")
    })

    it("mcp call goes through sendCommand, not local mcpManager", async () => {
      const { runOuroCli } = await import("../../heart/daemon/daemon-cli")

      const sendCommand = vi.fn().mockResolvedValue({
        ok: true,
        data: { content: [{ type: "text", text: "result" }] },
      })

      const deps = {
        socketPath: "/tmp/test.sock",
        sendCommand,
        startDaemonProcess: vi.fn().mockResolvedValue({ pid: 1 }),
        writeStdout: vi.fn(),
        checkSocketAlive: vi.fn().mockResolvedValue(true),
        cleanupStaleSocket: vi.fn(),
        fallbackPendingMessage: vi.fn().mockReturnValue("pending"),
      }

      const result = await runOuroCli(["mcp", "call", "ado", "get_items", "--args", '{"query":"test"}'], deps)
      expect(sendCommand).toHaveBeenCalledWith("/tmp/test.sock", {
        kind: "mcp.call",
        server: "ado",
        tool: "get_items",
        args: '{"query":"test"}',
      })
      expect(result).toContain("result")
    })
  })
})
