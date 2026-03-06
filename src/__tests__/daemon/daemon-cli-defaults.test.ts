import { describe, expect, it, vi } from "vitest"
import { EventEmitter } from "events"

describe("daemon CLI default dependency branches", () => {
  it("uses default sendCommand transport and parses JSON responses", async () => {
    vi.resetModules()

    class MockConnection extends EventEmitter {
      write = vi.fn()
      end = vi.fn(() => {
        this.emit("data", Buffer.from('{"ok":true,"summary":"status-ok"}', "utf-8"))
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
    vi.doMock("../../identity", () => ({ getRepoRoot: () => "/mock/repo" }))
    vi.doMock("../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))

    const { createDefaultOuroCliDeps } = await import("../../daemon/daemon-cli")
    const deps = createDefaultOuroCliDeps("/tmp/daemon.sock")
    const response = await deps.sendCommand("/tmp/daemon.sock", { kind: "daemon.status" })

    expect(createConnection).toHaveBeenCalledWith("/tmp/daemon.sock")
    expect(response.summary).toBe("status-ok")
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
    vi.doMock("../../identity", () => ({ getRepoRoot: () => "/mock/repo" }))
    vi.doMock("../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))

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
    vi.doMock("../../identity", () => ({ getRepoRoot: () => "/mock/repo" }))
    vi.doMock("../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))
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

    const result = await runOuroCli(["start"], deps)
    expect(result).toContain("daemon started")
    expect(consoleLog).toHaveBeenCalled()
  })

  it("formats fallback command responses from socket results", async () => {
    vi.resetModules()

    vi.doMock("net", () => ({ createConnection: vi.fn() }))
    vi.doMock("child_process", () => ({ spawn: vi.fn() }))
    vi.doMock("../../identity", () => ({ getRepoRoot: () => "/mock/repo" }))
    vi.doMock("../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))

    const { runOuroCli } = await import("../../daemon/daemon-cli")

    const baseDeps = {
      socketPath: "/tmp/daemon.sock",
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
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
})
