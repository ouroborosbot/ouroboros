import { describe, expect, it, vi } from "vitest"

import {
  parseOuroCommand,
  runOuroCli,
  type OuroCliDeps,
} from "../../daemon/daemon-cli"
import { OuroDaemon } from "../../daemon/daemon"

describe("ouro CLI parsing", () => {
  it("parses primary daemon commands", () => {
    expect(parseOuroCommand([])).toEqual({ kind: "daemon.up" })
    expect(parseOuroCommand(["up"])).toEqual({ kind: "daemon.up" })
    expect(parseOuroCommand(["stop"])).toEqual({ kind: "daemon.stop" })
    expect(parseOuroCommand(["status"])).toEqual({ kind: "daemon.status" })
    expect(parseOuroCommand(["logs"])).toEqual({ kind: "daemon.logs" })
    expect(parseOuroCommand(["hatch"])).toEqual({ kind: "hatch.start" })
    expect(
      parseOuroCommand([
        "hatch",
        "--agent",
        "Sprout",
        "--human",
        "Ari",
        "--provider",
        "anthropic",
        "--setup-token",
        "sk-ant-oat01-test-token",
      ]),
    ).toEqual({
      kind: "hatch.start",
      agentName: "Sprout",
      humanName: "Ari",
      provider: "anthropic",
      credentials: {
        setupToken: "sk-ant-oat01-test-token",
      },
    })
  })

  it("parses chat, message, and poke commands", () => {
    expect(parseOuroCommand(["chat", "slugger"])).toEqual({
      kind: "chat.connect",
      agent: "slugger",
    })

    expect(parseOuroCommand([
      "msg",
      "--session",
      "session-1",
      "--to",
      "slugger",
      "--task",
      "habit-heartbeat",
      "status update",
    ])).toEqual({
      kind: "message.send",
      from: "ouro-cli",
      to: "slugger",
      content: "status update",
      sessionId: "session-1",
      taskRef: "habit-heartbeat",
    })

    expect(parseOuroCommand(["poke", "slugger", "--task", "habit-heartbeat"])).toEqual({
      kind: "task.poke",
      agent: "slugger",
      taskId: "habit-heartbeat",
    })

    expect(parseOuroCommand([
      "link",
      "slugger",
      "--friend",
      "friend-1",
      "--provider",
      "aad",
      "--external-id",
      "aad-user-123",
    ])).toEqual({
      kind: "friend.link",
      agent: "slugger",
      friendId: "friend-1",
      provider: "aad",
      externalId: "aad-user-123",
    })
  })

  it("rejects deprecated command families", () => {
    expect(() => parseOuroCommand(["agent", "start", "slugger"])).toThrow("Unknown command")
    expect(() => parseOuroCommand(["cron", "list"])).toThrow("Unknown command")
  })

  it("throws on malformed command shapes", () => {
    expect(() => parseOuroCommand(["chat"])).toThrow("Usage")
    expect(() => parseOuroCommand(["msg", "--to", "slugger"])).toThrow("Usage")
    expect(() => parseOuroCommand(["poke"])).toThrow("Usage")
    expect(() => parseOuroCommand(["link"])).toThrow("Usage")
    expect(() => parseOuroCommand(["link", "slugger", "--friend", "friend-1", "--provider", "aad"])).toThrow("Usage")
    expect(() =>
      parseOuroCommand([
        "link",
        "slugger",
        "--friend",
        "friend-1",
        "--provider",
        "unknown-provider",
        "--external-id",
        "ext-1",
      ]),
    ).toThrow("Unknown identity provider")
    expect(parseOuroCommand([
      "link",
      "slugger",
      "--external-id",
      "ext-1",
      "--provider",
      "aad",
      "--friend",
      "friend-1",
    ])).toEqual({
      kind: "friend.link",
      agent: "slugger",
      friendId: "friend-1",
      provider: "aad",
      externalId: "ext-1",
    })
    expect(parseOuroCommand([
      "link",
      "slugger",
      "--friend",
      "friend-1",
      "--provider",
      "aad",
      "--external-id",
      "ext-1",
      "--ignored",
      "value",
    ])).toEqual({
      kind: "friend.link",
      agent: "slugger",
      friendId: "friend-1",
      provider: "aad",
      externalId: "ext-1",
    })
    expect(parseOuroCommand(["poke", "slugger", "extra", "--task", "habit-heartbeat"])).toEqual({
      kind: "task.poke",
      agent: "slugger",
      taskId: "habit-heartbeat",
    })
    expect(() => parseOuroCommand(["poke", "slugger"])).toThrow("Usage")
    expect(() => parseOuroCommand(["mystery"])).toThrow("Unknown command")
  })
})

describe("ouro CLI execution", () => {
  it("starts daemon on `up` when socket is not live", async () => {
    const installSubagents = vi.fn(async () => ({
      claudeInstalled: 0,
      codexInstalled: 0,
      notes: [],
    }))
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(),
      startDaemonProcess: vi.fn(async () => ({ pid: 12345 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents,
    }

    const result = await runOuroCli(["up"], deps)

    expect(result).toContain("daemon started")
    expect(installSubagents).toHaveBeenCalledTimes(1)
    expect(deps.startDaemonProcess).toHaveBeenCalledWith("/tmp/ouro-test.sock")
    expect(deps.sendCommand).not.toHaveBeenCalled()
  })

  it("is idempotent for `up` when daemon already running", async () => {
    const installSubagents = vi.fn(async () => ({
      claudeInstalled: 0,
      codexInstalled: 0,
      notes: [],
    }))
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents,
    }

    const result = await runOuroCli(["up"], deps)

    expect(result).toContain("already running")
    expect(installSubagents).toHaveBeenCalledTimes(1)
    expect(deps.startDaemonProcess).not.toHaveBeenCalled()
    expect(deps.sendCommand).not.toHaveBeenCalled()
  })

  it("attempts .ouro UTI registration during `up` setup", async () => {
    const registerOuroBundleType = vi.fn(async () => ({ attempted: true, registered: true }))
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(),
      startDaemonProcess: vi.fn(async () => ({ pid: 4321 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      registerOuroBundleType,
    }

    await runOuroCli(["up"], deps)

    expect(registerOuroBundleType).toHaveBeenCalledTimes(1)
  })

  it("continues `up` flow when .ouro UTI registration throws", async () => {
    const registerOuroBundleType = vi.fn(async () => {
      throw new Error("registration failed")
    })
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(),
      startDaemonProcess: vi.fn(async () => ({ pid: 5678 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      registerOuroBundleType,
    }

    const result = await runOuroCli(["up"], deps)

    expect(registerOuroBundleType).toHaveBeenCalledTimes(1)
    expect(result).toContain("daemon started")
  })

  it("routes status command through daemon socket", async () => {
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true, summary: "running" })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
    }

    const result = await runOuroCli(["status"], deps)

    expect(deps.sendCommand).toHaveBeenCalledWith(
      "/tmp/ouro-test.sock",
      expect.objectContaining({ kind: "daemon.status" }),
    )
    expect(result).toContain("running")
  })

  it("routes bare ouro to hatch when no agents are discovered", async () => {
    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true, message: "hatch started" })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      listDiscoveredAgents: vi.fn(async () => []),
    } as OuroCliDeps & {
      listDiscoveredAgents: () => Promise<string[]>
    }

    await runOuroCli([], deps)

    expect(deps.sendCommand).toHaveBeenCalledWith(
      "/tmp/ouro-test.sock",
      expect.objectContaining({ kind: "hatch.start" }),
    )
  })

  it("routes bare ouro to chat when exactly one agent is discovered", async () => {
    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true, message: "connected to slugger" })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      listDiscoveredAgents: vi.fn(async () => ["slugger"]),
    } as OuroCliDeps & {
      listDiscoveredAgents: () => Promise<string[]>
    }

    await runOuroCli([], deps)

    expect(deps.sendCommand).toHaveBeenCalledWith(
      "/tmp/ouro-test.sock",
      expect.objectContaining({ kind: "chat.connect", agent: "slugger" }),
    )
  })

  it("prompts selection on bare ouro when multiple agents are discovered", async () => {
    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true, message: "unexpected socket call" })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      listDiscoveredAgents: vi.fn(async () => ["ouroboros", "slugger"]),
    } as OuroCliDeps & {
      listDiscoveredAgents: () => Promise<string[]>
    }

    const result = await runOuroCli([], deps)

    expect(result).toContain("who do you want to talk to?")
    expect(result).toContain("ouroboros")
    expect(result).toContain("slugger")
    expect(deps.sendCommand).not.toHaveBeenCalled()
  })

  it("continues `up` flow when subagent install throws", async () => {
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(),
      startDaemonProcess: vi.fn(async () => ({ pid: 777 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => {
        throw new Error("install exploded")
      }),
    }

    const result = await runOuroCli(["up"], deps)

    expect(result).toContain("daemon started")
    expect(deps.startDaemonProcess).toHaveBeenCalledTimes(1)
  })

  it("continues `up` flow when subagent install throws a non-Error value", async () => {
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(),
      startDaemonProcess: vi.fn(async () => ({ pid: 778 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => {
        throw "install exploded string"
      }),
    }

    const result = await runOuroCli(["up"], deps)

    expect(result).toContain("daemon started")
    expect(deps.startDaemonProcess).toHaveBeenCalledTimes(1)
  })

  it("routes msg command through daemon socket", async () => {
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true, message: "queued" })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
    }

    await runOuroCli(["msg", "--to", "slugger", "hi"], deps)

    expect(deps.sendCommand).toHaveBeenCalledWith(
      "/tmp/ouro-test.sock",
      expect.objectContaining({
        kind: "message.send",
        from: "ouro-cli",
        to: "slugger",
        content: "hi",
      }),
    )
  })

  it("routes link command through local friend linker instead of daemon socket", async () => {
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true, message: "unexpected daemon call" })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      linkFriendIdentity: vi.fn(async () => "linked aad:aad-user-123 to friend-1"),
    }

    const result = await runOuroCli([
      "link",
      "slugger",
      "--friend",
      "friend-1",
      "--provider",
      "aad",
      "--external-id",
      "aad-user-123",
    ], deps)

    expect(result).toContain("linked aad:aad-user-123 to friend-1")
    expect(deps.linkFriendIdentity).toHaveBeenCalledWith({
      kind: "friend.link",
      agent: "slugger",
      friendId: "friend-1",
      provider: "aad",
      externalId: "aad-user-123",
    })
    expect(deps.sendCommand).not.toHaveBeenCalled()
  })

  it("falls back to pending inbox when msg cannot reach daemon", async () => {
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => {
        throw new Error("connect ECONNREFUSED")
      }),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/AgentBundles/slugger.ouro/inbox/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
    }

    const result = await runOuroCli(["msg", "--to", "slugger", "hi"], deps)

    expect(deps.fallbackPendingMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: "message.send",
      to: "slugger",
      content: "hi",
    }))
    expect(result).toContain("queued message fallback")
  })

  it("executes hatch flow locally and starts daemon after auth verification", async () => {
    const runHatchFlow = vi.fn(async () => ({
      bundleRoot: "/tmp/AgentBundles/Sprout.ouro",
      selectedIdentity: "medusa.md",
      specialistSecretsPath: "/tmp/.agentsecrets/AdoptionSpecialist/secrets.json",
      hatchlingSecretsPath: "/tmp/.agentsecrets/Sprout/secrets.json",
    }))

    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true, message: "unexpected sendCommand call" })),
      startDaemonProcess: vi.fn(async () => ({ pid: 999 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      registerOuroBundleType: vi.fn(async () => ({ attempted: true, registered: true })),
      runHatchFlow,
    } as OuroCliDeps & {
      runHatchFlow: typeof runHatchFlow
    }

    const result = await runOuroCli([
      "hatch",
      "--agent",
      "Sprout",
      "--human",
      "Ari",
      "--provider",
      "anthropic",
      "--setup-token",
      "sk-ant-oat01-test-token",
    ], deps)

    expect(runHatchFlow).toHaveBeenCalledWith({
      agentName: "Sprout",
      humanName: "Ari",
      provider: "anthropic",
      credentials: {
        setupToken: "sk-ant-oat01-test-token",
      },
    })
    expect(deps.registerOuroBundleType).toHaveBeenCalledTimes(1)
    expect(deps.startDaemonProcess).toHaveBeenCalledWith("/tmp/ouro-test.sock")
    expect(result).toContain("hatched Sprout")
    expect(result).toContain("/tmp/AgentBundles/Sprout.ouro")
    expect(result).toContain("medusa.md")
  })
})

describe("daemon command protocol", () => {
  it("handles raw JSON command payloads and returns structured JSON", async () => {
    const daemon = new OuroDaemon({
      socketPath: "/tmp/ouro-test.sock",
      processManager: {
        listAgentSnapshots: () => [
          {
            name: "slugger",
            channel: "cli",
            status: "running",
            pid: 123,
            restartCount: 0,
            startedAt: null,
            lastCrashAt: null,
            backoffMs: 1000,
          },
        ],
        startAutoStartAgents: async () => undefined,
        stopAll: async () => undefined,
        startAgent: async () => undefined,
      },
      scheduler: {
        listJobs: () => [],
        triggerJob: async () => ({ ok: true, message: "triggered" }),
      },
      healthMonitor: {
        runChecks: async () => [{ name: "agent-processes", status: "ok", message: "all good" }],
      },
      router: {
        send: async () => ({ id: "msg-1", queuedAt: "2026-03-05T22:00:00.000Z" }),
        pollInbox: () => [],
      },
    })

    const raw = await daemon.handleRawPayload("{\"kind\":\"daemon.status\"}")
    const parsed = JSON.parse(raw) as { ok: boolean; summary?: string }

    expect(parsed.ok).toBe(true)
    expect(parsed.summary).toContain("slugger")
  })

  it("returns protocol errors for malformed payloads", async () => {
    const daemon = new OuroDaemon({
      socketPath: "/tmp/ouro-test.sock",
      processManager: {
        listAgentSnapshots: () => [],
        startAutoStartAgents: async () => undefined,
        stopAll: async () => undefined,
        startAgent: async () => undefined,
      },
      scheduler: {
        listJobs: () => [],
        triggerJob: async () => ({ ok: true, message: "triggered" }),
      },
      healthMonitor: {
        runChecks: async () => [],
      },
      router: {
        send: async () => ({ id: "msg-1", queuedAt: "2026-03-05T22:00:00.000Z" }),
        pollInbox: () => [],
      },
    })

    const raw = await daemon.handleRawPayload("not-json")
    const parsed = JSON.parse(raw) as { ok: boolean; error?: string }

    expect(parsed.ok).toBe(false)
    expect(parsed.error).toContain("Invalid daemon command payload")
  })
})
