import { describe, expect, it, vi } from "vitest"

vi.mock("../../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))

describe("daemon status tombstone display", () => {
  it("shows tombstone line when daemon is stopped and tombstone exists", async () => {
    vi.resetModules()

    vi.doMock("net", () => ({ createConnection: vi.fn() }))
    vi.doMock("child_process", () => ({ spawn: vi.fn() }))
    vi.doMock("../../../heart/identity", () => ({
      getRepoRoot: () => "/mock/repo",
      getAgentBundlesRoot: () => "/mock/AgentBundles",
      getAgentDaemonLogsDir: () => "/tmp/dummy",
      getAgentDaemonLoggingConfigPath: () => "/tmp/dummy.json",
    }))
    vi.doMock("../../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))

    // Mock daemon-tombstone to return a tombstone
    vi.doMock("../../../heart/daemon/daemon-tombstone", () => ({
      readDaemonTombstone: () => ({
        reason: "uncaughtException",
        message: "out of memory",
        stack: null,
        timestamp: "2026-03-27T10:00:00.000Z",
        pid: 12345,
        uptimeSeconds: 3600,
      }),
      getTombstonePath: () => "/mock/.ouro-cli/daemon-death.json",
    }))

    const { runOuroCli, createDefaultOuroCliDeps } = await import("../../../heart/daemon/daemon-cli")
    const deps = createDefaultOuroCliDeps("/tmp/daemon.sock")

    const result = await runOuroCli(["status"], {
      ...deps,
      sendCommand: vi.fn(async () => {
        const error = new Error("daemon unreachable") as Error & { code?: string }
        error.code = "ENOENT"
        throw error
      }),
      writeStdout: vi.fn(),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
    })

    expect(result).toContain("Last death: 2026-03-27T10:00:00.000Z -- uncaughtException: out of memory")
    expect(result).toContain("daemon not running; run `ouro up`")
  })

  it("shows exit code only when signal is null", async () => {
    vi.resetModules()

    vi.doMock("net", () => ({ createConnection: vi.fn() }))
    vi.doMock("child_process", () => ({ spawn: vi.fn() }))
    vi.doMock("../../../heart/identity", () => ({
      getRepoRoot: () => "/mock/repo",
      getAgentBundlesRoot: () => "/mock/AgentBundles",
      getAgentDaemonLogsDir: () => "/tmp/dummy",
      getAgentDaemonLoggingConfigPath: () => "/tmp/dummy.json",
    }))
    vi.doMock("../../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))

    const { runOuroCli, createDefaultOuroCliDeps } = await import("../../../heart/daemon/daemon-cli")
    const deps = createDefaultOuroCliDeps("/tmp/daemon.sock")

    const result = await runOuroCli(["status"], {
      ...deps,
      sendCommand: vi.fn(async () => ({
        ok: true,
        summary: "running",
        data: {
          overview: {
            daemon: "running",
            health: "ok",
            socketPath: "/tmp/daemon.sock",
            version: "0.1.0",
            lastUpdated: "2026-03-27",
            repoRoot: "/mock/repo",
            configFingerprint: "abc",
            workerCount: 1,
            senseCount: 0,
            entryPath: "/mock/daemon-entry.js",
            mode: "production",
          },
          senses: [],
          workers: [
            {
              agent: "slugger",
              worker: "inner-dialog",
              status: "crashed",
              pid: null,
              restartCount: 1,
              lastExitCode: 1,
              lastSignal: null,
            },
          ],
        },
      })),
      writeStdout: vi.fn(),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
    })

    expect(result).toContain("code=1")
    expect(result).not.toContain("signal=")
  })

  it("shows signal only when exit code is null", async () => {
    vi.resetModules()

    vi.doMock("net", () => ({ createConnection: vi.fn() }))
    vi.doMock("child_process", () => ({ spawn: vi.fn() }))
    vi.doMock("../../../heart/identity", () => ({
      getRepoRoot: () => "/mock/repo",
      getAgentBundlesRoot: () => "/mock/AgentBundles",
      getAgentDaemonLogsDir: () => "/tmp/dummy",
      getAgentDaemonLoggingConfigPath: () => "/tmp/dummy.json",
    }))
    vi.doMock("../../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))

    const { runOuroCli, createDefaultOuroCliDeps } = await import("../../../heart/daemon/daemon-cli")
    const deps = createDefaultOuroCliDeps("/tmp/daemon.sock")

    const result = await runOuroCli(["status"], {
      ...deps,
      sendCommand: vi.fn(async () => ({
        ok: true,
        summary: "running",
        data: {
          overview: {
            daemon: "running",
            health: "ok",
            socketPath: "/tmp/daemon.sock",
            version: "0.1.0",
            lastUpdated: "2026-03-27",
            repoRoot: "/mock/repo",
            configFingerprint: "abc",
            workerCount: 1,
            senseCount: 0,
            entryPath: "/mock/daemon-entry.js",
            mode: "production",
          },
          senses: [],
          workers: [
            {
              agent: "slugger",
              worker: "inner-dialog",
              status: "crashed",
              pid: null,
              restartCount: 1,
              lastExitCode: null,
              lastSignal: "SIGTERM",
            },
          ],
        },
      })),
      writeStdout: vi.fn(),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
    })

    expect(result).toContain("signal=SIGTERM")
    expect(result).not.toContain("code=")
  })

  it("shows exit info in worker table for running daemon with crashed agent", async () => {
    vi.resetModules()

    vi.doMock("net", () => ({ createConnection: vi.fn() }))
    vi.doMock("child_process", () => ({ spawn: vi.fn() }))
    vi.doMock("../../../heart/identity", () => ({
      getRepoRoot: () => "/mock/repo",
      getAgentBundlesRoot: () => "/mock/AgentBundles",
      getAgentDaemonLogsDir: () => "/tmp/dummy",
      getAgentDaemonLoggingConfigPath: () => "/tmp/dummy.json",
    }))
    vi.doMock("../../../nerves/runtime", () => ({ emitNervesEvent: vi.fn() }))

    const { runOuroCli, createDefaultOuroCliDeps } = await import("../../../heart/daemon/daemon-cli")
    const deps = createDefaultOuroCliDeps("/tmp/daemon.sock")

    const result = await runOuroCli(["status"], {
      ...deps,
      sendCommand: vi.fn(async () => ({
        ok: true,
        summary: "running",
        data: {
          overview: {
            daemon: "running",
            health: "warn",
            socketPath: "/tmp/daemon.sock",
            version: "0.1.0-alpha.147",
            lastUpdated: "2026-03-27",
            repoRoot: "/mock/repo",
            configFingerprint: "abc123",
            workerCount: 1,
            senseCount: 0,
            entryPath: "/mock/dist/heart/daemon/daemon-entry.js",
            mode: "production",
          },
          senses: [],
          workers: [
            {
              agent: "slugger",
              worker: "inner-dialog",
              status: "crashed",
              pid: null,
              restartCount: 3,
              lastExitCode: 137,
              lastSignal: "SIGKILL",
            },
          ],
        },
      })),
      writeStdout: vi.fn(),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
    })

    expect(result).toContain("Last Exit")
    expect(result).toContain("code=137 signal=SIGKILL")
  })
})
