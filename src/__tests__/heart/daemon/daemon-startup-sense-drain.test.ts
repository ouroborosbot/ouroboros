import { afterEach, describe, expect, it, vi } from "vitest"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

import { OuroDaemon } from "../../../heart/daemon/daemon"

function tmpSocketPath(name: string): string {
  return path.join(os.tmpdir(), `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.sock`)
}

function make(socketPath: string, bundlesRoot?: string) {
  const processManager = {
    listAgentSnapshots: vi.fn(() => []),
    startAutoStartAgents: vi.fn(async () => undefined),
    stopAll: vi.fn(async () => undefined),
    startAgent: vi.fn(async () => undefined),
    sendToAgent: vi.fn(),
  }

  const scheduler = {
    listJobs: vi.fn(() => []),
    triggerJob: vi.fn(async (jobId: string) => ({ ok: true, message: `triggered ${jobId}` })),
    reconcile: vi.fn(async () => undefined),
  }

  const healthMonitor = {
    runChecks: vi.fn(async () => []),
  }

  const router = {
    send: vi.fn(async () => ({ id: "msg-1", queuedAt: "2026-03-10T00:00:00.000Z" })),
    pollInbox: vi.fn(() => []),
  }

  const senseManager = {
    startAutoStartSenses: vi.fn(async () => undefined),
    stopAll: vi.fn(async () => undefined),
    listSenseRows: vi.fn(() => []),
  }

  const daemon = new OuroDaemon({
    socketPath,
    processManager,
    scheduler,
    healthMonitor,
    router,
    bundlesRoot,
    senseManager,
  } as any)
  return { daemon, processManager, scheduler, healthMonitor, router, senseManager }
}

/**
 * Helper: create a pending message file in the per-sense pending dir structure.
 * Path: {bundlesRoot}/{agent}.ouro/state/pending/{friendId}/{channel}/{key}/{filename}.json
 */
function writePendingMessage(
  bundlesRoot: string,
  agent: string,
  friendId: string,
  channel: string,
  key: string,
  message: { from: string; content: string; timestamp: number },
): void {
  const dir = path.join(bundlesRoot, `${agent}.ouro`, "state", "pending", friendId, channel, key)
  fs.mkdirSync(dir, { recursive: true })
  const filename = `${message.timestamp}-${Math.random().toString(16).slice(2)}.json`
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(message), "utf-8")
}

describe("daemon startup sense pending drain", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("drains pending dirs for bluebubbles sense on daemon start", async () => {
    const socketPath = tmpSocketPath("startup-bb-drain")
    const bundlesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "startup-drain-"))

    writePendingMessage(bundlesRoot, "slugger", "friend-1", "bluebubbles", "chat-abc", {
      from: "alice",
      content: "hey, are you there?",
      timestamp: 1710000000000,
    })

    const { daemon, router } = make(socketPath, bundlesRoot)
    await daemon.start()
    await daemon.stop()

    // The drained message should be routed through the daemon router
    expect(router.send).toHaveBeenCalledWith(expect.objectContaining({
      from: "alice",
      to: "slugger",
      content: "hey, are you there?",
    }))

    // Pending dir should be empty after drain
    const pendingDir = path.join(bundlesRoot, "slugger.ouro", "state", "pending", "friend-1", "bluebubbles", "chat-abc")
    const remaining = fs.existsSync(pendingDir) ? fs.readdirSync(pendingDir).filter(f => f.endsWith(".json")) : []
    expect(remaining).toHaveLength(0)

    fs.rmSync(bundlesRoot, { recursive: true, force: true })
  })

  it("drains pending dirs for teams sense on daemon start", async () => {
    const socketPath = tmpSocketPath("startup-teams-drain")
    const bundlesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "startup-drain-"))

    writePendingMessage(bundlesRoot, "slugger", "friend-2", "teams", "conv-xyz", {
      from: "bob",
      content: "urgent: need approval",
      timestamp: 1710000001000,
    })

    const { daemon, router } = make(socketPath, bundlesRoot)
    await daemon.start()
    await daemon.stop()

    expect(router.send).toHaveBeenCalledWith(expect.objectContaining({
      from: "bob",
      to: "slugger",
      content: "urgent: need approval",
    }))

    fs.rmSync(bundlesRoot, { recursive: true, force: true })
  })

  it("does NOT drain CLI pending dirs at daemon start", async () => {
    const socketPath = tmpSocketPath("startup-no-cli-drain")
    const bundlesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "startup-drain-"))

    writePendingMessage(bundlesRoot, "slugger", "friend-3", "cli", "session", {
      from: "local-user",
      content: "cli message should remain",
      timestamp: 1710000002000,
    })

    const { daemon, router } = make(socketPath, bundlesRoot)
    await daemon.start()
    await daemon.stop()

    // CLI pending should NOT be routed
    expect(router.send).not.toHaveBeenCalled()

    // CLI pending file should still exist
    const cliPendingDir = path.join(bundlesRoot, "slugger.ouro", "state", "pending", "friend-3", "cli", "session")
    const files = fs.readdirSync(cliPendingDir).filter(f => f.endsWith(".json"))
    expect(files).toHaveLength(1)

    fs.rmSync(bundlesRoot, { recursive: true, force: true })
  })

  it("drains multiple pending messages across multiple agents and senses", async () => {
    const socketPath = tmpSocketPath("startup-multi-drain")
    const bundlesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "startup-drain-"))

    // Agent 1: slugger, BB sense
    writePendingMessage(bundlesRoot, "slugger", "friend-a", "bluebubbles", "chat-1", {
      from: "alice",
      content: "msg-1",
      timestamp: 1710000010000,
    })
    writePendingMessage(bundlesRoot, "slugger", "friend-a", "bluebubbles", "chat-1", {
      from: "alice",
      content: "msg-2",
      timestamp: 1710000011000,
    })

    // Agent 2: ouroboros, Teams sense
    writePendingMessage(bundlesRoot, "ouroboros", "friend-b", "teams", "conv-2", {
      from: "bob",
      content: "msg-3",
      timestamp: 1710000012000,
    })

    const { daemon, router } = make(socketPath, bundlesRoot)
    await daemon.start()
    await daemon.stop()

    // All 3 messages should be routed
    expect(router.send).toHaveBeenCalledTimes(3)
    expect(router.send).toHaveBeenCalledWith(expect.objectContaining({ to: "slugger", content: "msg-1" }))
    expect(router.send).toHaveBeenCalledWith(expect.objectContaining({ to: "slugger", content: "msg-2" }))
    expect(router.send).toHaveBeenCalledWith(expect.objectContaining({ to: "ouroboros", content: "msg-3" }))

    fs.rmSync(bundlesRoot, { recursive: true, force: true })
  })

  it("proceeds normally when no pending messages exist", async () => {
    const socketPath = tmpSocketPath("startup-no-pending")
    const bundlesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "startup-drain-"))

    // Create a bundle dir with state/pending but no messages
    fs.mkdirSync(path.join(bundlesRoot, "slugger.ouro", "state", "pending"), { recursive: true })

    const { daemon, router } = make(socketPath, bundlesRoot)
    await daemon.start()
    await daemon.stop()

    expect(router.send).not.toHaveBeenCalled()

    fs.rmSync(bundlesRoot, { recursive: true, force: true })
  })

  it("skips inner channel pending dirs (not an always-on sense)", async () => {
    const socketPath = tmpSocketPath("startup-no-inner-drain")
    const bundlesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "startup-drain-"))

    writePendingMessage(bundlesRoot, "slugger", "self", "inner", "dialog", {
      from: "system",
      content: "inner notice should remain",
      timestamp: 1710000003000,
    })

    const { daemon, router } = make(socketPath, bundlesRoot)
    await daemon.start()
    await daemon.stop()

    // Inner channel pending should NOT be routed
    expect(router.send).not.toHaveBeenCalled()

    // Inner pending file should still exist
    const innerPendingDir = path.join(bundlesRoot, "slugger.ouro", "state", "pending", "self", "inner", "dialog")
    const files = fs.readdirSync(innerPendingDir).filter(f => f.endsWith(".json"))
    expect(files).toHaveLength(1)

    fs.rmSync(bundlesRoot, { recursive: true, force: true })
  })

  it("tolerates missing state/pending directory", async () => {
    const socketPath = tmpSocketPath("startup-no-state-dir")
    const bundlesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "startup-drain-"))

    // Create bundle dir without state/pending
    fs.mkdirSync(path.join(bundlesRoot, "slugger.ouro"), { recursive: true })

    const { daemon } = make(socketPath, bundlesRoot)
    await expect(daemon.start()).resolves.toBeUndefined()
    await daemon.stop()

    fs.rmSync(bundlesRoot, { recursive: true, force: true })
  })

  it("tolerates unreadable pending directory entries", async () => {
    const socketPath = tmpSocketPath("startup-unreadable-pending")
    const bundlesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "startup-drain-"))

    // Create a pending dir with an unparseable JSON file
    const dir = path.join(bundlesRoot, "slugger.ouro", "state", "pending", "friend-x", "bluebubbles", "chat-bad")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "1710000000000-bad.json"), "{invalid-json", "utf-8")

    // Also create a valid one to ensure partial success
    writePendingMessage(bundlesRoot, "slugger", "friend-y", "teams", "conv-good", {
      from: "carol",
      content: "valid message",
      timestamp: 1710000004000,
    })

    const { daemon, router } = make(socketPath, bundlesRoot)
    await daemon.start()
    await daemon.stop()

    // The valid message should still be routed
    expect(router.send).toHaveBeenCalledWith(expect.objectContaining({
      from: "carol",
      to: "slugger",
      content: "valid message",
    }))

    fs.rmSync(bundlesRoot, { recursive: true, force: true })
  })
})
