import { describe, expect, it, vi } from "vitest"
import { EventEmitter } from "events"

describe("daemon CLI default dependency branches", () => {
  it("uses default sendCommand transport and parses JSON responses", async () => {
    vi.resetModules()

    class MockConnection extends EventEmitter {
      write = vi.fn()
      end = vi.fn(() => {
        this.emit("data", Buffer.from("{\"ok\":true,\"summary\":\"status-ok\"}", "utf-8"))
        this.emit("end")
      })
    }

    const createConnection = vi.fn(() => {
      const conn = new MockConnection()
      queueMicrotask(() => conn.emit("connect"))
      return conn
    })

    vi.doMock("net", () => ({ createConnection }))
    vi.doMock("child_process", () => ({ spawn: vi.fn() }))
    vi.doMock("../../identity", () => ({
      getRepoRoot: () => "/mock/repo",
      getAgentBundlesRoot: () => "/mock/AgentBundles",
    }))
    vi.doMock("../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))
    vi.doMock("fs", () => ({ existsSync: vi.fn(() => false), unlinkSync: vi.fn() }))

    const { createDefaultOuroCliDeps } = await import("../../daemon/daemon-cli")
    const deps = createDefaultOuroCliDeps("/tmp/daemon.sock")
    const response = await deps.sendCommand("/tmp/daemon.sock", { kind: "daemon.status" })

    expect(createConnection).toHaveBeenCalledWith("/tmp/daemon.sock")
    expect(response.summary).toBe("status-ok")
    expect(typeof deps.fallbackPendingMessage).toBe("function")
  })

  it("returns daemon-stopped response when stop command receives empty payload", async () => {
    vi.resetModules()

    class MockConnection extends EventEmitter {
      write = vi.fn()
      end = vi.fn(() => {
        this.emit("end")
      })
    }

    const createConnection = vi.fn(() => {
      const conn = new MockConnection()
      queueMicrotask(() => conn.emit("connect"))
      return conn
    })

    vi.doMock("net", () => ({ createConnection }))
    vi.doMock("child_process", () => ({ spawn: vi.fn() }))
    vi.doMock("../../identity", () => ({
      getRepoRoot: () => "/mock/repo",
      getAgentBundlesRoot: () => "/mock/AgentBundles",
    }))
    vi.doMock("../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))
    vi.doMock("fs", () => ({ existsSync: vi.fn(() => false), unlinkSync: vi.fn() }))

    const { createDefaultOuroCliDeps } = await import("../../daemon/daemon-cli")
    const deps = createDefaultOuroCliDeps("/tmp/daemon.sock")

    await expect(deps.sendCommand("/tmp/daemon.sock", { kind: "daemon.stop" })).resolves.toEqual({
      ok: true,
      message: "daemon stopped",
    })
  })

  it("rejects when default sendCommand receives non-json payload", async () => {
    vi.resetModules()

    class MockConnection extends EventEmitter {
      write = vi.fn()
      end = vi.fn(() => {
        this.emit("data", Buffer.from("not-json", "utf-8"))
        this.emit("end")
      })
    }

    const createConnection = vi.fn(() => {
      const conn = new MockConnection()
      queueMicrotask(() => conn.emit("connect"))
      return conn
    })

    vi.doMock("net", () => ({ createConnection }))
    vi.doMock("child_process", () => ({ spawn: vi.fn() }))
    vi.doMock("../../identity", () => ({
      getRepoRoot: () => "/mock/repo",
      getAgentBundlesRoot: () => "/mock/AgentBundles",
    }))
    vi.doMock("../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))
    vi.doMock("fs", () => ({ existsSync: vi.fn(() => false), unlinkSync: vi.fn() }))

    const { createDefaultOuroCliDeps } = await import("../../daemon/daemon-cli")
    const deps = createDefaultOuroCliDeps("/tmp/daemon.sock")

    await expect(deps.sendCommand("/tmp/daemon.sock", { kind: "daemon.status" })).rejects.toBeDefined()
  })

  it("uses default daemon-start process launch and stdout writer", async () => {
    vi.resetModules()

    const unref = vi.fn()
    const spawn = vi.fn(() => ({ pid: undefined, unref }))
    const createConnection = vi.fn()
    const consoleLog = vi.fn()

    vi.doMock("child_process", () => ({ spawn }))
    vi.doMock("net", () => ({ createConnection }))
    vi.doMock("../../identity", () => ({
      getRepoRoot: () => "/mock/repo",
      getAgentBundlesRoot: () => "/mock/AgentBundles",
    }))
    vi.doMock("../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))
    vi.doMock("fs", () => ({ existsSync: vi.fn(() => false), unlinkSync: vi.fn() }))
    vi.stubGlobal("console", { ...console, log: consoleLog })

    const { createDefaultOuroCliDeps, runOuroCli } = await import("../../daemon/daemon-cli")

    const deps = createDefaultOuroCliDeps("/tmp/daemon.sock")
    const started = await deps.startDaemonProcess("/tmp/daemon.sock")

    expect(spawn).toHaveBeenCalledWith(
      "node",
      ["/mock/repo/dist/daemon/daemon-entry.js", "--socket", "/tmp/daemon.sock"],
      expect.objectContaining({ detached: true, stdio: "ignore" }),
    )
    expect(unref).toHaveBeenCalled()
    expect(started.pid).toBeNull()

    const result = await runOuroCli(["up"], {
      ...deps,
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
    })
    expect(result).toContain("daemon started")
    expect(consoleLog).toHaveBeenCalled()
  })

  it("checks socket liveness and cleans stale socket before start", async () => {
    vi.resetModules()

    const existsSync = vi.fn(() => true)
    const unlinkSync = vi.fn()
    const createConnection = vi.fn(() => {
      const conn = new EventEmitter() as EventEmitter & {
        write: (chunk: string) => void
        end: () => void
      }
      conn.write = vi.fn()
      conn.end = vi.fn(() => {
        conn.emit("error", Object.assign(new Error("refused"), { code: "ECONNREFUSED" }))
      })
      queueMicrotask(() => conn.emit("connect"))
      return conn
    })

    vi.doMock("net", () => ({ createConnection }))
    vi.doMock("child_process", () => ({ spawn: vi.fn(() => ({ pid: 1, unref: vi.fn() })) }))
    vi.doMock("../../identity", () => ({
      getRepoRoot: () => "/mock/repo",
      getAgentBundlesRoot: () => "/mock/AgentBundles",
    }))
    vi.doMock("../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))
    vi.doMock("fs", () => ({ existsSync, unlinkSync }))

    const { createDefaultOuroCliDeps } = await import("../../daemon/daemon-cli")
    const deps = createDefaultOuroCliDeps("/tmp/daemon.sock")

    await expect(deps.checkSocketAlive("/tmp/daemon.sock")).resolves.toBe(false)
    deps.cleanupStaleSocket("/tmp/daemon.sock")

    expect(existsSync).toHaveBeenCalledWith("/tmp/daemon.sock")
    expect(unlinkSync).toHaveBeenCalledWith("/tmp/daemon.sock")
  })

  it("formats fallback command responses from socket results", async () => {
    vi.resetModules()

    vi.doMock("net", () => ({ createConnection: vi.fn() }))
    vi.doMock("child_process", () => ({ spawn: vi.fn() }))
    vi.doMock("../../identity", () => ({
      getRepoRoot: () => "/mock/repo",
      getAgentBundlesRoot: () => "/mock/AgentBundles",
    }))
    vi.doMock("../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))
    vi.doMock("fs", () => ({ existsSync: vi.fn(() => false), unlinkSync: vi.fn() }))

    const { runOuroCli } = await import("../../daemon/daemon-cli")

    const baseDeps = {
      socketPath: "/tmp/daemon.sock",
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
    }

    const okOnly = await runOuroCli(["status"], {
      ...baseDeps,
      sendCommand: vi.fn(async () => ({ ok: true })),
    })
    expect(okOnly).toBe("ok")

    const unknownError = await runOuroCli(["status"], {
      ...baseDeps,
      sendCommand: vi.fn(async () => ({ ok: false })),
    })
    expect(unknownError).toContain("unknown error")
  })

  it("writes pending fallback file under target bundle inbox", async () => {
    vi.resetModules()

    const appendFileSync = vi.fn()
    const mkdirSync = vi.fn()
    const existsSync = vi.fn(() => false)
    const unlinkSync = vi.fn()
    vi.doMock("fs", () => ({ appendFileSync, mkdirSync, existsSync, unlinkSync }))
    vi.doMock("net", () => ({ createConnection: vi.fn() }))
    vi.doMock("child_process", () => ({ spawn: vi.fn() }))
    vi.doMock("../../identity", () => ({
      getRepoRoot: () => "/mock/repo",
      getAgentBundlesRoot: () => "/mock/AgentBundles",
    }))
    vi.doMock("../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))

    const { createDefaultOuroCliDeps } = await import("../../daemon/daemon-cli")
    const deps = createDefaultOuroCliDeps("/tmp/daemon.sock")
    const path = deps.fallbackPendingMessage({
      kind: "message.send",
      from: "ouro-cli",
      to: "slugger",
      content: "hello",
      sessionId: "s1",
      taskRef: "t1",
    })

    expect(path).toBe("/mock/AgentBundles/slugger.ouro/inbox/pending.jsonl")
    expect(mkdirSync).toHaveBeenCalledWith("/mock/AgentBundles/slugger.ouro/inbox", { recursive: true })
    expect(appendFileSync).toHaveBeenCalledWith(
      "/mock/AgentBundles/slugger.ouro/inbox/pending.jsonl",
      expect.stringContaining("\"taskRef\":\"t1\""),
      "utf-8",
    )
  })
})
