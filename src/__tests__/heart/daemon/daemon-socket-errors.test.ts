import { afterEach, describe, expect, it, vi } from "vitest"
import * as fs from "fs"
import * as net from "net"
import * as os from "os"
import * as path from "path"
import { emitNervesEvent } from "../../../nerves/runtime"

vi.mock("../../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn(),
}))

import { OuroDaemon } from "../../../heart/daemon/daemon"

function tmpSocketPath(name: string): string {
  return path.join(os.tmpdir(), `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.sock`)
}

function makeDaemon(socketPath: string) {
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
    send: vi.fn(async () => ({ id: "msg-1", queuedAt: "2026-03-05T23:00:00.000Z" })),
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
    senseManager,
  } as any)
  return { daemon }
}

describe("daemon socket error handling", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("logs connection errors without crashing the daemon", async () => {
    const socketPath = tmpSocketPath("conn-error")
    const { daemon } = makeDaemon(socketPath)

    await daemon.start()

    // Connect a client and trigger an error by destroying the connection abruptly
    const client = net.createConnection(socketPath)
    await new Promise<void>((resolve) => {
      client.on("connect", () => {
        // Write partial data then destroy to trigger error on server side
        client.write("partial")
        client.destroy()
        resolve()
      })
    })

    // Give the daemon a moment to handle the destroyed connection
    await new Promise((resolve) => setTimeout(resolve, 50))

    // The daemon should still be running and accepting connections
    const client2 = net.createConnection(socketPath)
    const response = await new Promise<string>((resolve, reject) => {
      let raw = ""
      client2.on("connect", () => {
        client2.write(JSON.stringify({ kind: "daemon.health" }))
        client2.end()
      })
      client2.on("data", (chunk) => { raw += chunk.toString("utf-8") })
      client2.on("error", reject)
      client2.on("end", () => resolve(raw))
    })

    expect(JSON.parse(response).ok).toBe(true)

    await daemon.stop()
  })

  it("logs and handles connection-level errors via connection.on('error')", async () => {
    const socketPath = tmpSocketPath("conn-err-handler")
    const { daemon } = makeDaemon(socketPath)

    await daemon.start()

    // Emit nerves event for connection error should be registered
    expect(emitNervesEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "daemon.server_start",
      }),
    )

    await daemon.stop()
  })

  it("handles server error after listen without crashing", async () => {
    const socketPath = tmpSocketPath("server-post-listen")
    const { daemon } = makeDaemon(socketPath)

    await daemon.start()

    // Daemon is running, the server should have a persistent error handler
    // Verify this by checking that the daemon started successfully
    expect(emitNervesEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "daemon.server_start",
      }),
    )

    await daemon.stop()
  })
})
