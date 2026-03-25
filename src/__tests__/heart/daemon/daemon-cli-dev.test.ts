import { describe, expect, it, vi } from "vitest"

import {
  runOuroCli,
  type OuroCliDeps,
} from "../../../heart/daemon/daemon-cli"

vi.mock("../../../heart/identity", () => ({
  getRepoRoot: () => "/mock/repo",
  getAgentBundlesRoot: () => "/mock/AgentBundles",
  getAgentName: () => "test",
  getAgentRoot: () => "/mock/AgentBundles/test.ouro",
  getAgentDaemonLogsDir: () => "/mock/logs",
}))

function makeDeps(overrides: Partial<OuroCliDeps> = {}): OuroCliDeps {
  return {
    socketPath: "/tmp/ouro-test.sock",
    sendCommand: vi.fn(async () => ({ ok: true })),
    startDaemonProcess: vi.fn(async () => ({ pid: 42 })),
    writeStdout: vi.fn(),
    checkSocketAlive: vi.fn(async () => false),
    cleanupStaleSocket: vi.fn(),
    fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
    ...overrides,
  }
}

describe("ouro dev command handler", () => {
  it("starts daemon in dev mode when dist entry exists", async () => {
    const deps = makeDeps({
      existsSync: vi.fn(() => true),
      getRepoCwd: vi.fn(() => "/my/dev/repo"),
      ensureDaemonBootPersistence: vi.fn(),
    })

    const result = await runOuroCli(["dev"], deps)

    expect(result).toContain("dev mode")
    expect(result).toContain("/my/dev/repo")
    expect(deps.ensureDaemonBootPersistence).toHaveBeenCalledWith("/tmp/ouro-test.sock")
    expect(deps.startDaemonProcess).toHaveBeenCalled()
    // Must NOT call checkForCliUpdate
    expect(deps.checkForCliUpdate).toBeUndefined()
  })

  it("prints error and exits when dist entry is missing", async () => {
    const deps = makeDeps({
      existsSync: vi.fn(() => false),
      getRepoCwd: vi.fn(() => "/my/dev/repo"),
    })

    const result = await runOuroCli(["dev"], deps)

    expect(result).toContain("not a valid ouro harness repo")
    expect(result).toContain("npm run build")
    expect(deps.startDaemonProcess).not.toHaveBeenCalled()
  })

  it("does not call checkForCliUpdate in dev mode", async () => {
    const checkForCliUpdate = vi.fn()
    const deps = makeDeps({
      existsSync: vi.fn(() => true),
      getRepoCwd: vi.fn(() => "/my/dev/repo"),
      ensureDaemonBootPersistence: vi.fn(),
      checkForCliUpdate,
    })

    await runOuroCli(["dev"], deps)

    expect(checkForCliUpdate).not.toHaveBeenCalled()
  })

  it("does not call performSystemSetup deps in dev mode", async () => {
    const installOuroCommand = vi.fn()
    const registerOuroBundleType = vi.fn()
    const syncGlobalOuroBotWrapper = vi.fn()
    const ensureSkillManagement = vi.fn()
    const ensureCurrentVersionInstalled = vi.fn()
    const deps = makeDeps({
      existsSync: vi.fn(() => true),
      getRepoCwd: vi.fn(() => "/my/dev/repo"),
      ensureDaemonBootPersistence: vi.fn(),
      installOuroCommand,
      registerOuroBundleType,
      syncGlobalOuroBotWrapper,
      ensureSkillManagement,
      ensureCurrentVersionInstalled,
    })

    await runOuroCli(["dev"], deps)

    expect(installOuroCommand).not.toHaveBeenCalled()
    expect(registerOuroBundleType).not.toHaveBeenCalled()
    expect(syncGlobalOuroBotWrapper).not.toHaveBeenCalled()
    expect(ensureSkillManagement).not.toHaveBeenCalled()
    expect(ensureCurrentVersionInstalled).not.toHaveBeenCalled()
  })
})
