import { afterEach, describe, expect, it, vi } from "vitest"

describe("daemon entrypoint", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("boots daemon with default socket and wires signal handlers", async () => {
    vi.resetModules()

    const start = vi.fn(async () => undefined)
    const stop = vi.fn(async () => undefined)
    const emitNervesEvent = vi.fn()
    const configureDaemonRuntimeLogger = vi.fn()
    const daemonCtor = vi.fn()
    const processManagerCtor = vi.fn()
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => code as never) as any)
    const onHandlers: Record<string, () => void> = {}
    const onSpy = vi.spyOn(process, "on").mockImplementation(((event: string, cb: () => void) => {
      onHandlers[event] = cb
      return process
    }) as any)

    class MockOuroDaemon {
      constructor(_opts: unknown) {
        daemonCtor(_opts)
      }
      start = start
      stop = stop
    }

    class MockProcessManager {
      listAgentSnapshots = vi.fn(() => [{ name: "slugger", status: "crashed" }])
      constructor(_opts: unknown) {
        processManagerCtor(_opts)
      }
    }

    vi.doMock("../../../heart/daemon/daemon", () => ({
      OuroDaemon: MockOuroDaemon,
    }))
    vi.doMock("../../../heart/daemon/process-manager", () => ({
      DaemonProcessManager: MockProcessManager,
    }))
    vi.doMock("../../../nerves/runtime", () => ({ emitNervesEvent }))
    vi.doMock("../../../heart/daemon/runtime-logging", () => ({ configureDaemonRuntimeLogger }))

    const argvSpy = vi.spyOn(process, "argv", "get").mockReturnValue(["node", "daemon-entry.js"])

    await import("../../../heart/daemon/daemon-entry")
    await Promise.resolve()

    expect(start).toHaveBeenCalledTimes(1)
    expect(configureDaemonRuntimeLogger).toHaveBeenCalledWith("daemon")
    expect(processManagerCtor).toHaveBeenCalledTimes(1)
    expect(daemonCtor).toHaveBeenCalledTimes(1)

    const processManagerOptions = processManagerCtor.mock.calls[0]?.[0] as {
      agents: Array<{ entry: string }>
    }
    expect(processManagerOptions.agents.length).toBeGreaterThan(0)
    expect(processManagerOptions.agents.every((agent) => agent.entry === "heart/agent-entry.js")).toBe(true)

    const daemonOptions = daemonCtor.mock.calls[0]?.[0] as {
      scheduler: {
        listJobs: () => unknown[]
        triggerJob: (jobId: string) => Promise<{ ok: boolean; message: string }>
      }
      healthMonitor: { runChecks: () => Promise<unknown[]> }
      router: {
        send: (message: { from: string; to: string; content: string; priority?: string }) => Promise<{ id: string; queuedAt: string }>
        pollInbox: (agent: string) => unknown[]
      }
    }
    expect(daemonOptions.scheduler.listJobs()).toEqual([])
    await expect(daemonOptions.scheduler.triggerJob("nightly")).resolves.toEqual({
      ok: false,
      message: "unknown scheduled job: nightly",
    })
    await expect(daemonOptions.healthMonitor.runChecks()).resolves.toEqual([
      { name: "agent-processes", status: "critical", message: "non-running agents: slugger" },
      { name: "cron-health", status: "ok", message: "cron jobs are healthy" },
      { name: "disk-space", status: "ok", message: "disk usage healthy (0%)" },
    ])
    await expect(daemonOptions.router.send({
      from: "slugger",
      to: "ouroboros",
      content: "hi",
    })).resolves.toEqual(
      expect.objectContaining({ id: expect.stringContaining("msg-") }),
    )
    expect(daemonOptions.router.pollInbox("ouroboros")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "slugger", to: "ouroboros", content: "hi" }),
      ]),
    )

    expect(emitNervesEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "daemon.entry_start", meta: { socketPath: "/tmp/ouroboros-daemon.sock" } }),
    )
    expect(emitNervesEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "daemon.health_alert" }),
    )
    expect(onSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function))
    expect(onSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function))

    onHandlers.SIGINT?.()
    await Promise.resolve()
    expect(stop).toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(0)

    onHandlers.SIGTERM?.()
    await Promise.resolve()
    expect(exitSpy).toHaveBeenCalledWith(0)

    argvSpy.mockRestore()
  })

  it("emits error and exits when daemon start fails", async () => {
    vi.resetModules()

    const start = vi.fn(async () => {
      throw new Error("boom")
    })
    const stop = vi.fn(async () => undefined)
    const emitNervesEvent = vi.fn()
    const configureDaemonRuntimeLogger = vi.fn()
    const daemonCtor = vi.fn()
    const processManagerCtor = vi.fn()
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => code as never) as any)
    vi.spyOn(process, "on").mockImplementation(((
      _event: string,
      _cb: () => void,
    ) => process) as any)

    class MockOuroDaemon {
      constructor(_opts: unknown) {
        daemonCtor(_opts)
      }
      start = start
      stop = stop
    }

    class MockProcessManager {
      listAgentSnapshots = vi.fn(() => [])
      constructor(_opts: unknown) {
        processManagerCtor(_opts)
      }
    }

    vi.doMock("../../../heart/daemon/daemon", () => ({
      OuroDaemon: MockOuroDaemon,
    }))
    vi.doMock("../../../heart/daemon/process-manager", () => ({
      DaemonProcessManager: MockProcessManager,
    }))
    vi.doMock("../../../nerves/runtime", () => ({ emitNervesEvent }))
    vi.doMock("../../../heart/daemon/runtime-logging", () => ({ configureDaemonRuntimeLogger }))

    const argvSpy = vi.spyOn(process, "argv", "get").mockReturnValue([
      "node",
      "daemon-entry.js",
      "--socket",
      "/tmp/custom.sock",
    ])

    await import("../../../heart/daemon/daemon-entry")
    await Promise.resolve()
    await Promise.resolve()

    expect(emitNervesEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "daemon.entry_error" }),
    )
    expect(configureDaemonRuntimeLogger).toHaveBeenCalledWith("daemon")
    expect(processManagerCtor).toHaveBeenCalledTimes(1)
    expect(daemonCtor).toHaveBeenCalledTimes(1)
    expect(stop).toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(1)

    argvSpy.mockRestore()
  })

  it("falls back to default socket when --socket value is blank", async () => {
    vi.resetModules()

    const start = vi.fn(async () => undefined)
    const stop = vi.fn(async () => undefined)
    const emitNervesEvent = vi.fn()
    const configureDaemonRuntimeLogger = vi.fn()
    vi.spyOn(process, "on").mockImplementation(((
      _event: string,
      _cb: () => void,
    ) => process) as any)

    class MockOuroDaemon {
      start = start
      stop = stop
    }

    class MockProcessManager {
      listAgentSnapshots = vi.fn(() => [])
    }

    vi.doMock("../../../heart/daemon/daemon", () => ({
      OuroDaemon: MockOuroDaemon,
    }))
    vi.doMock("../../../heart/daemon/process-manager", () => ({
      DaemonProcessManager: MockProcessManager,
    }))
    vi.doMock("../../../nerves/runtime", () => ({ emitNervesEvent }))
    vi.doMock("../../../heart/daemon/runtime-logging", () => ({ configureDaemonRuntimeLogger }))

    const argvSpy = vi.spyOn(process, "argv", "get").mockReturnValue([
      "node",
      "daemon-entry.js",
      "--socket",
      "   ",
    ])

    await import("../../../heart/daemon/daemon-entry")
    await Promise.resolve()

    expect(emitNervesEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "daemon.entry_start", meta: { socketPath: "/tmp/ouroboros-daemon.sock" } }),
    )
    expect(configureDaemonRuntimeLogger).toHaveBeenCalledWith("daemon")

    argvSpy.mockRestore()
  })
})
