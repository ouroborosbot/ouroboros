import { describe, expect, it, vi } from "vitest"

import {
  parseOuroCommand,
  runOuroCli,
  type OuroCliDeps,
} from "../../../heart/daemon/daemon-cli"
import { OuroDaemon } from "../../../heart/daemon/daemon"

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
    expect(
      parseOuroCommand([
        "hatch",
        "--agent",
        "Sprout",
        "--human",
        "Ari",
        "--provider",
        "openai-codex",
        "--oauth-token",
        "oauth-token-1",
        "--api-key",
        "api-key-1",
        "--endpoint",
        "https://example.openai.azure.com",
        "--deployment",
        "gpt-4o-mini",
        "--migration-path",
        "/tmp/legacy-agent",
      ]),
    ).toEqual({
      kind: "hatch.start",
      agentName: "Sprout",
      humanName: "Ari",
      provider: "openai-codex",
      credentials: {
        oauthAccessToken: "oauth-token-1",
        apiKey: "api-key-1",
        endpoint: "https://example.openai.azure.com",
        deployment: "gpt-4o-mini",
      },
      migrationPath: "/tmp/legacy-agent",
    })

    expect(parseOuroCommand(["hatch", "--unknown-flag", "noop"])).toEqual({
      kind: "hatch.start",
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
    expect(() =>
      parseOuroCommand(["hatch", "--agent", "Sprout", "--human", "Ari", "--provider", "invalid-provider"]),
    ).toThrow("Unknown provider")
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

  it("prompts for missing minimax credentials in local hatch flow", async () => {
    const runHatchFlow = vi.fn(async () => ({
      bundleRoot: "/tmp/AgentBundles/Mini.ouro",
      selectedIdentity: "python.md",
      specialistSecretsPath: "/tmp/.agentsecrets/AdoptionSpecialist/secrets.json",
      hatchlingSecretsPath: "/tmp/.agentsecrets/Mini/secrets.json",
    }))
    const promptInput = vi.fn(async (question: string) => {
      if (question === "MiniMax API key: ") return "minimax-key"
      return ""
    })

    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true, message: "unexpected sendCommand call" })),
      startDaemonProcess: vi.fn(async () => ({ pid: 101 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      registerOuroBundleType: vi.fn(async () => ({ attempted: true, registered: true })),
      runHatchFlow,
      promptInput,
    } as OuroCliDeps & {
      runHatchFlow: typeof runHatchFlow
      promptInput: typeof promptInput
    }

    await runOuroCli([
      "hatch",
      "--agent",
      "Mini",
      "--human",
      "Ari",
      "--provider",
      "minimax",
    ], deps)

    expect(promptInput).toHaveBeenCalledWith("MiniMax API key: ")
    expect(runHatchFlow).toHaveBeenCalledWith({
      agentName: "Mini",
      humanName: "Ari",
      provider: "minimax",
      credentials: {
        apiKey: "minimax-key",
      },
    })
  })

  it("prompts for missing anthropic setup token in local hatch flow", async () => {
    const runHatchFlow = vi.fn(async () => ({
      bundleRoot: "/tmp/AgentBundles/ClaudeSprout.ouro",
      selectedIdentity: "medusa.md",
      specialistSecretsPath: "/tmp/.agentsecrets/AdoptionSpecialist/secrets.json",
      hatchlingSecretsPath: "/tmp/.agentsecrets/ClaudeSprout/secrets.json",
    }))
    const promptInput = vi.fn(async (question: string) => {
      if (question === "Anthropic setup-token: ") return "sk-ant-oat01-test-token"
      return ""
    })

    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true, message: "unexpected sendCommand call" })),
      startDaemonProcess: vi.fn(async () => ({ pid: 111 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      registerOuroBundleType: vi.fn(async () => ({ attempted: true, registered: true })),
      runHatchFlow,
      promptInput,
    } as OuroCliDeps & {
      runHatchFlow: typeof runHatchFlow
      promptInput: typeof promptInput
    }

    await runOuroCli([
      "hatch",
      "--agent",
      "ClaudeSprout",
      "--human",
      "Ari",
      "--provider",
      "anthropic",
    ], deps)

    expect(promptInput).toHaveBeenCalledWith("Anthropic setup-token: ")
    expect(runHatchFlow).toHaveBeenCalledWith({
      agentName: "ClaudeSprout",
      humanName: "Ari",
      provider: "anthropic",
      credentials: {
        setupToken: "sk-ant-oat01-test-token",
      },
    })
  })

  it("prompts for missing openai oauth token in local hatch flow", async () => {
    const runHatchFlow = vi.fn(async () => ({
      bundleRoot: "/tmp/AgentBundles/CodexSprout.ouro",
      selectedIdentity: "python.md",
      specialistSecretsPath: "/tmp/.agentsecrets/AdoptionSpecialist/secrets.json",
      hatchlingSecretsPath: "/tmp/.agentsecrets/CodexSprout/secrets.json",
    }))
    const promptInput = vi.fn(async (question: string) => {
      if (question === "OpenAI Codex OAuth token: ") return "oauth-token-abc"
      return ""
    })

    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true, message: "unexpected sendCommand call" })),
      startDaemonProcess: vi.fn(async () => ({ pid: 222 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      registerOuroBundleType: vi.fn(async () => ({ attempted: true, registered: true })),
      runHatchFlow,
      promptInput,
    } as OuroCliDeps & {
      runHatchFlow: typeof runHatchFlow
      promptInput: typeof promptInput
    }

    await runOuroCli([
      "hatch",
      "--agent",
      "CodexSprout",
      "--human",
      "Ari",
      "--provider",
      "openai-codex",
    ], deps)

    expect(promptInput).toHaveBeenCalledWith("OpenAI Codex OAuth token: ")
    expect(runHatchFlow).toHaveBeenCalledWith({
      agentName: "CodexSprout",
      humanName: "Ari",
      provider: "openai-codex",
      credentials: {
        oauthAccessToken: "oauth-token-abc",
      },
    })
  })

  it("throws usage when hatch input cannot resolve required values", async () => {
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      registerOuroBundleType: vi.fn(async () => ({ attempted: true, registered: true })),
      runHatchFlow: vi.fn(async () => ({
        bundleRoot: "/tmp/unused",
        selectedIdentity: "unused.md",
        specialistSecretsPath: "/tmp/unused-specialist.json",
        hatchlingSecretsPath: "/tmp/unused-hatchling.json",
      })),
      promptInput: vi.fn(async () => ""),
    }

    await expect(runOuroCli(["hatch"], deps)).rejects.toThrow("Usage")
  })

  it("throws usage when hatch input is unresolved and promptInput is unavailable", async () => {
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      registerOuroBundleType: vi.fn(async () => ({ attempted: true, registered: true })),
      runHatchFlow: vi.fn(async () => ({
        bundleRoot: "/tmp/unused",
        selectedIdentity: "unused.md",
        specialistSecretsPath: "/tmp/unused-specialist.json",
        hatchlingSecretsPath: "/tmp/unused-hatchling.json",
      })),
    }

    await expect(runOuroCli(["hatch"], deps)).rejects.toThrow("Usage")
  })

  it("does not re-prompt azure credentials when they are provided on CLI", async () => {
    const runHatchFlow = vi.fn(async () => ({
      bundleRoot: "/tmp/AgentBundles/AzureProvided.ouro",
      selectedIdentity: "medusa.md",
      specialistSecretsPath: "/tmp/.agentsecrets/AdoptionSpecialist/secrets.json",
      hatchlingSecretsPath: "/tmp/.agentsecrets/AzureProvided/secrets.json",
    }))
    const promptInput = vi.fn(async () => "unexpected")

    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true, message: "unexpected sendCommand call" })),
      startDaemonProcess: vi.fn(async () => ({ pid: 303 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      registerOuroBundleType: vi.fn(async () => ({ attempted: true, registered: true })),
      runHatchFlow,
      promptInput,
    } as OuroCliDeps & {
      runHatchFlow: typeof runHatchFlow
      promptInput: typeof promptInput
    }

    await runOuroCli([
      "hatch",
      "--agent",
      "AzureProvided",
      "--human",
      "Ari",
      "--provider",
      "azure",
      "--api-key",
      "provided-key",
      "--endpoint",
      "https://provided.endpoint",
      "--deployment",
      "provided-deployment",
    ], deps)

    expect(promptInput).not.toHaveBeenCalledWith("Azure API key: ")
    expect(promptInput).not.toHaveBeenCalledWith("Azure endpoint: ")
    expect(promptInput).not.toHaveBeenCalledWith("Azure deployment: ")
  })

  it("continues `up` flow when UTI registration throws a non-Error value", async () => {
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(),
      startDaemonProcess: vi.fn(async () => ({ pid: 404 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      registerOuroBundleType: vi.fn(async () => {
        throw "registration failed string"
      }),
    }

    const result = await runOuroCli(["up"], deps)
    expect(result).toContain("daemon started")
  })

  it("continues hatch flow when subagent install throws a non-Error value", async () => {
    const runHatchFlow = vi.fn(async () => ({
      bundleRoot: "/tmp/AgentBundles/StringInstall.ouro",
      selectedIdentity: "python.md",
      specialistSecretsPath: "/tmp/.agentsecrets/AdoptionSpecialist/secrets.json",
      hatchlingSecretsPath: "/tmp/.agentsecrets/StringInstall/secrets.json",
    }))

    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 505 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => {
        throw "install failed string"
      }),
      registerOuroBundleType: vi.fn(async () => ({ attempted: true, registered: true })),
      runHatchFlow,
    } as OuroCliDeps & {
      runHatchFlow: typeof runHatchFlow
    }

    const result = await runOuroCli([
      "hatch",
      "--agent",
      "StringInstall",
      "--human",
      "Ari",
      "--provider",
      "anthropic",
      "--setup-token",
      "sk-ant-oat01-test-token",
    ], deps)
    expect(result).toContain("hatched StringInstall")
  })

  it("reports daemon already running in local hatch flow when socket is alive", async () => {
    const runHatchFlow = vi.fn(async () => ({
      bundleRoot: "/tmp/AgentBundles/Alive.ouro",
      selectedIdentity: "python.md",
      specialistSecretsPath: "/tmp/.agentsecrets/AdoptionSpecialist/secrets.json",
      hatchlingSecretsPath: "/tmp/.agentsecrets/Alive/secrets.json",
    }))
    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 606 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
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
      "Alive",
      "--human",
      "Ari",
      "--provider",
      "anthropic",
      "--setup-token",
      "sk-ant-oat01-test-token",
    ], deps)

    expect(deps.startDaemonProcess).not.toHaveBeenCalled()
    expect(result).toContain("daemon already running")
  })

  it("formats unknown pid in hatch flow start message when daemon pid is null", async () => {
    const runHatchFlow = vi.fn(async () => ({
      bundleRoot: "/tmp/AgentBundles/UnknownPid.ouro",
      selectedIdentity: "python.md",
      specialistSecretsPath: "/tmp/.agentsecrets/AdoptionSpecialist/secrets.json",
      hatchlingSecretsPath: "/tmp/.agentsecrets/UnknownPid/secrets.json",
    }))
    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: null })),
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
      "UnknownPid",
      "--human",
      "Ari",
      "--provider",
      "anthropic",
      "--setup-token",
      "sk-ant-oat01-test-token",
    ], deps)

    expect(result).toContain("daemon started (pid unknown)")
  })

  it("formats hatch daemon-proxy responses across summary/message/ok/error shapes", async () => {
    const baseDeps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true, summary: "summary response" })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      runHatchFlow: undefined,
    }

    const summary = await runOuroCli(["hatch"], {
      ...baseDeps,
      sendCommand: vi.fn(async () => ({ ok: true, summary: "summary response" })),
    })
    const ok = await runOuroCli(["hatch"], {
      ...baseDeps,
      sendCommand: vi.fn(async () => ({ ok: true })),
    })
    const error = await runOuroCli(["hatch"], {
      ...baseDeps,
      sendCommand: vi.fn(async () => ({ ok: false })),
    })

    expect(summary).toBe("summary response")
    expect(ok).toBe("ok")
    expect(error).toContain("unknown error")
  })

  it("prompts azure credentials and continues hatch when subagent install throws", async () => {
    const runHatchFlow = vi.fn(async () => ({
      bundleRoot: "/tmp/AgentBundles/AzureSprout.ouro",
      selectedIdentity: "medusa.md",
      specialistSecretsPath: "/tmp/.agentsecrets/AdoptionSpecialist/secrets.json",
      hatchlingSecretsPath: "/tmp/.agentsecrets/AzureSprout/secrets.json",
    }))
    const promptInput = vi.fn(async (question: string) => {
      if (question === "Azure API key: ") return "azure-key"
      if (question === "Azure endpoint: ") return "https://example.openai.azure.com"
      if (question === "Azure deployment: ") return "gpt-4o-mini"
      return ""
    })

    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true, message: "unexpected sendCommand call" })),
      startDaemonProcess: vi.fn(async () => ({ pid: 202 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => {
        throw new Error("install failed")
      }),
      registerOuroBundleType: vi.fn(async () => ({ attempted: true, registered: true })),
      runHatchFlow,
      promptInput,
    } as OuroCliDeps & {
      runHatchFlow: typeof runHatchFlow
      promptInput: typeof promptInput
    }

    const result = await runOuroCli([
      "hatch",
      "--agent",
      "AzureSprout",
      "--human",
      "Ari",
      "--provider",
      "azure",
    ], deps)

    expect(promptInput).toHaveBeenCalledWith("Azure API key: ")
    expect(promptInput).toHaveBeenCalledWith("Azure endpoint: ")
    expect(promptInput).toHaveBeenCalledWith("Azure deployment: ")
    expect(runHatchFlow).toHaveBeenCalledWith({
      agentName: "AzureSprout",
      humanName: "Ari",
      provider: "azure",
      credentials: {
        apiKey: "azure-key",
        endpoint: "https://example.openai.azure.com",
        deployment: "gpt-4o-mini",
      },
    })
    expect(result).toContain("hatched AzureSprout")
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

describe("multi-agent prompt, agent-name shortcut, and help", () => {
  it("prompts for agent selection and starts chat with chosen agent", async () => {
    const startChat = vi.fn(async () => {})
    const promptInput = vi.fn(async () => "slugger")
    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      listDiscoveredAgents: vi.fn(async () => ["ouroboros", "slugger"]),
      startChat,
      promptInput,
    } as OuroCliDeps & {
      listDiscoveredAgents: () => Promise<string[]>
      startChat: typeof startChat
      promptInput: typeof promptInput
    }

    await runOuroCli([], deps)

    expect(promptInput).toHaveBeenCalled()
    expect(startChat).toHaveBeenCalledWith("slugger")
    expect(deps.sendCommand).not.toHaveBeenCalled()
  })

  it("routes ouro <agent-name> to startChat when agent is discovered", async () => {
    const startChat = vi.fn(async () => {})
    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      listDiscoveredAgents: vi.fn(async () => ["ouroboros", "slugger"]),
      startChat,
    } as OuroCliDeps & {
      listDiscoveredAgents: () => Promise<string[]>
      startChat: typeof startChat
    }

    await runOuroCli(["slugger"], deps)

    expect(startChat).toHaveBeenCalledWith("slugger")
  })

  it("throws error for ouro <name> when agent is not discovered", async () => {
    const startChat = vi.fn(async () => {})
    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      listDiscoveredAgents: vi.fn(async () => ["ouroboros"]),
      startChat,
    } as OuroCliDeps & {
      listDiscoveredAgents: () => Promise<string[]>
      startChat: typeof startChat
    }

    await expect(runOuroCli(["slugger"], deps)).rejects.toThrow("Unknown command")
  })

  it("selects agent by number in multi-agent prompt", async () => {
    const startChat = vi.fn(async () => {})
    const promptInput = vi.fn(async () => "2")
    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      listDiscoveredAgents: vi.fn(async () => ["ouroboros", "slugger"]),
      startChat,
      promptInput,
    } as OuroCliDeps & {
      listDiscoveredAgents: () => Promise<string[]>
      startChat: typeof startChat
      promptInput: typeof promptInput
    }

    await runOuroCli([], deps)

    expect(startChat).toHaveBeenCalledWith("slugger")
  })

  it("throws on invalid selection in multi-agent prompt", async () => {
    const startChat = vi.fn(async () => {})
    const promptInput = vi.fn(async () => "invalid")
    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      listDiscoveredAgents: vi.fn(async () => ["ouroboros", "slugger"]),
      startChat,
      promptInput,
    } as OuroCliDeps & {
      listDiscoveredAgents: () => Promise<string[]>
      startChat: typeof startChat
      promptInput: typeof promptInput
    }

    await expect(runOuroCli([], deps)).rejects.toThrow("Invalid selection")
  })

  it("re-throws parse error when startChat is not provided", async () => {
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
    }

    await expect(runOuroCli(["unknown-cmd"], deps)).rejects.toThrow("Unknown command")
  })

  it("returns usage text for --help flag", async () => {
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
    }

    const result = await runOuroCli(["--help"], deps)

    expect(result).toContain("Usage:")
    expect(deps.sendCommand).not.toHaveBeenCalled()
  })
})

describe("single agent → chat via startChat", () => {
  it("calls ensureDaemonRunning then startChat when single agent discovered", async () => {
    const startChat = vi.fn(async () => {})
    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true, message: "unexpected" })),
      startDaemonProcess: vi.fn(async () => ({ pid: 42 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      listDiscoveredAgents: vi.fn(async () => ["slugger"]),
      startChat,
    } as OuroCliDeps & {
      listDiscoveredAgents: () => Promise<string[]>
      startChat: typeof startChat
    }

    await runOuroCli([], deps)

    expect(startChat).toHaveBeenCalledWith("slugger")
    expect(deps.cleanupStaleSocket).toHaveBeenCalled()
    expect(deps.startDaemonProcess).toHaveBeenCalled()
    expect(deps.sendCommand).not.toHaveBeenCalled()
  })

  it("skips daemon start when already running before chat", async () => {
    const startChat = vi.fn(async () => {})
    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true, message: "unexpected" })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      listDiscoveredAgents: vi.fn(async () => ["slugger"]),
      startChat,
    } as OuroCliDeps & {
      listDiscoveredAgents: () => Promise<string[]>
      startChat: typeof startChat
    }

    await runOuroCli([], deps)

    expect(startChat).toHaveBeenCalledWith("slugger")
    expect(deps.startDaemonProcess).not.toHaveBeenCalled()
    expect(deps.sendCommand).not.toHaveBeenCalled()
  })

  it("falls back to chat.connect daemon command when startChat not provided", async () => {
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
})

describe("hatch → auto-chat", () => {
  it("calls startChat with hatched agent name after hatch completes", async () => {
    const startChat = vi.fn(async () => {})
    const runHatchFlow = vi.fn(async () => ({
      bundleRoot: "/tmp/AgentBundles/Sprout.ouro",
      selectedIdentity: "medusa.md",
      specialistSecretsPath: "/tmp/.agentsecrets/AdoptionSpecialist/secrets.json",
      hatchlingSecretsPath: "/tmp/.agentsecrets/Sprout/secrets.json",
    }))

    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 99 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      registerOuroBundleType: vi.fn(async () => ({ attempted: true, registered: true })),
      runHatchFlow,
      startChat,
    } as OuroCliDeps & {
      runHatchFlow: typeof runHatchFlow
      startChat: typeof startChat
    }

    await runOuroCli([
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

    expect(runHatchFlow).toHaveBeenCalled()
    expect(startChat).toHaveBeenCalledWith("Sprout")
  })

  it("ensures daemon is running before starting chat after hatch", async () => {
    const startChat = vi.fn(async () => {})
    const runHatchFlow = vi.fn(async () => ({
      bundleRoot: "/tmp/AgentBundles/Sprout.ouro",
      selectedIdentity: "medusa.md",
      specialistSecretsPath: "/tmp/.agentsecrets/AdoptionSpecialist/secrets.json",
      hatchlingSecretsPath: "/tmp/.agentsecrets/Sprout/secrets.json",
    }))

    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 99 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      registerOuroBundleType: vi.fn(async () => ({ attempted: true, registered: true })),
      runHatchFlow,
      startChat,
    } as OuroCliDeps & {
      runHatchFlow: typeof runHatchFlow
      startChat: typeof startChat
    }

    await runOuroCli([
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

    expect(deps.startDaemonProcess).toHaveBeenCalled()
    expect(startChat).toHaveBeenCalledWith("Sprout")
  })

  it("does not call startChat when startChat is not provided", async () => {
    const runHatchFlow = vi.fn(async () => ({
      bundleRoot: "/tmp/AgentBundles/Sprout.ouro",
      selectedIdentity: "medusa.md",
      specialistSecretsPath: "/tmp/.agentsecrets/AdoptionSpecialist/secrets.json",
      hatchlingSecretsPath: "/tmp/.agentsecrets/Sprout/secrets.json",
    }))

    const deps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 99 })),
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

    expect(result).toContain("hatched Sprout")
  })
})

describe("ensureDaemonRunning", () => {
  it("is a no-op when daemon is already running", async () => {
    const { ensureDaemonRunning } = await import("../../../heart/daemon/daemon-cli")

    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
    }

    const result = await ensureDaemonRunning(deps)

    expect(result.alreadyRunning).toBe(true)
    expect(result.message).toContain("already running")
    expect(deps.startDaemonProcess).not.toHaveBeenCalled()
    expect(deps.cleanupStaleSocket).not.toHaveBeenCalled()
  })

  it("cleans up stale socket and starts daemon when not running", async () => {
    const { ensureDaemonRunning } = await import("../../../heart/daemon/daemon-cli")

    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(),
      startDaemonProcess: vi.fn(async () => ({ pid: 42 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
    }

    const result = await ensureDaemonRunning(deps)

    expect(result.alreadyRunning).toBe(false)
    expect(result.message).toContain("daemon started")
    expect(result.message).toContain("42")
    expect(deps.cleanupStaleSocket).toHaveBeenCalledWith("/tmp/ouro-test.sock")
    expect(deps.startDaemonProcess).toHaveBeenCalledWith("/tmp/ouro-test.sock")
  })

  it("formats unknown pid when startDaemonProcess returns null pid", async () => {
    const { ensureDaemonRunning } = await import("../../../heart/daemon/daemon-cli")

    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(),
      startDaemonProcess: vi.fn(async () => ({ pid: null })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
    }

    const result = await ensureDaemonRunning(deps)

    expect(result.alreadyRunning).toBe(false)
    expect(result.message).toContain("pid unknown")
  })

  it("calls tailLogs directly for ouro logs when tailLogs dep is provided", async () => {
    const tailLogs = vi.fn(() => () => {})
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      tailLogs,
    }

    const result = await runOuroCli(["logs"], deps)

    expect(tailLogs).toHaveBeenCalledTimes(1)
    expect(deps.sendCommand).not.toHaveBeenCalled()
    expect(result).toBe("")
  })

  it("falls back to daemon socket for ouro logs when tailLogs dep is not set", async () => {
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true, summary: "logs available" })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => true),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
    }

    await runOuroCli(["logs"], deps)

    expect(deps.sendCommand).toHaveBeenCalledWith(
      "/tmp/ouro-test.sock",
      { kind: "daemon.logs" },
    )
  })
})

describe("specialist integration (zero agents -> adoption specialist)", () => {
  it("routes bare ouro to adoption specialist when zero agents discovered and dep is provided", async () => {
    const runAdoptionSpecialist = vi.fn(async () => "HatchedBot")
    const startChat = vi.fn(async () => {})
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 42 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      listDiscoveredAgents: vi.fn(async () => []),
      runAdoptionSpecialist,
      startChat,
    }

    await runOuroCli([], deps)

    expect(runAdoptionSpecialist).toHaveBeenCalledTimes(1)
    // Should NOT have fallen through to the old hatch flow
    expect(deps.sendCommand).not.toHaveBeenCalled()
  })

  it("starts daemon and chat with hatchling name after specialist returns a name", async () => {
    const runAdoptionSpecialist = vi.fn(async () => "MyNewBot")
    const startChat = vi.fn(async () => {})
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 77 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      registerOuroBundleType: vi.fn(async () => ({ attempted: true, registered: true })),
      listDiscoveredAgents: vi.fn(async () => []),
      runAdoptionSpecialist,
      startChat,
    }

    await runOuroCli([], deps)

    expect(runAdoptionSpecialist).toHaveBeenCalledTimes(1)
    expect(deps.installSubagents).toHaveBeenCalledTimes(1)
    expect(deps.registerOuroBundleType).toHaveBeenCalledTimes(1)
    expect(deps.startDaemonProcess).toHaveBeenCalled()
    expect(startChat).toHaveBeenCalledWith("MyNewBot")
  })

  it("exits cleanly without starting chat when specialist returns null (aborted)", async () => {
    const runAdoptionSpecialist = vi.fn(async () => null)
    const startChat = vi.fn(async () => {})
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 1 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      listDiscoveredAgents: vi.fn(async () => []),
      runAdoptionSpecialist,
      startChat,
    }

    const result = await runOuroCli([], deps)

    expect(runAdoptionSpecialist).toHaveBeenCalledTimes(1)
    expect(startChat).not.toHaveBeenCalled()
    expect(deps.installSubagents).not.toHaveBeenCalled()
    expect(deps.startDaemonProcess).not.toHaveBeenCalled()
    expect(result).toBe("")
  })

  it("falls back to old hatch flow for explicit ouro hatch command even when specialist dep exists", async () => {
    const runAdoptionSpecialist = vi.fn(async () => "ShouldNotBeUsed")
    const runHatchFlow = vi.fn(async () => ({
      bundleRoot: "/tmp/AgentBundles/ExplicitBot.ouro",
      selectedIdentity: "python.md",
      specialistSecretsPath: "/tmp/.agentsecrets/AdoptionSpecialist/secrets.json",
      hatchlingSecretsPath: "/tmp/.agentsecrets/ExplicitBot/secrets.json",
    }))

    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 33 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      registerOuroBundleType: vi.fn(async () => ({ attempted: true, registered: true })),
      runAdoptionSpecialist,
      runHatchFlow,
    }

    const result = await runOuroCli([
      "hatch",
      "--agent",
      "ExplicitBot",
      "--human",
      "Ari",
      "--provider",
      "anthropic",
      "--setup-token",
      "sk-ant-oat01-test-token",
    ], deps)

    expect(runAdoptionSpecialist).not.toHaveBeenCalled()
    expect(runHatchFlow).toHaveBeenCalled()
    expect(result).toContain("hatched ExplicitBot")
  })

  it("returns empty string without starting chat when startChat is not provided", async () => {
    const runAdoptionSpecialist = vi.fn(async () => "NoChatBot")
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 88 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => ({ claudeInstalled: 0, codexInstalled: 0, notes: [] })),
      registerOuroBundleType: vi.fn(async () => ({ attempted: true, registered: true })),
      listDiscoveredAgents: vi.fn(async () => []),
      runAdoptionSpecialist,
      // No startChat provided
    }

    const result = await runOuroCli([], deps)

    expect(runAdoptionSpecialist).toHaveBeenCalledTimes(1)
    expect(deps.installSubagents).toHaveBeenCalledTimes(1)
    expect(deps.startDaemonProcess).toHaveBeenCalled()
    expect(result).toBe("")
  })

  it("continues subagent install failure gracefully after specialist hatch", async () => {
    const runAdoptionSpecialist = vi.fn(async () => "FailInstallBot")
    const startChat = vi.fn(async () => {})
    const deps: OuroCliDeps = {
      socketPath: "/tmp/ouro-test.sock",
      sendCommand: vi.fn(async () => ({ ok: true })),
      startDaemonProcess: vi.fn(async () => ({ pid: 55 })),
      writeStdout: vi.fn(),
      checkSocketAlive: vi.fn(async () => false),
      cleanupStaleSocket: vi.fn(),
      fallbackPendingMessage: vi.fn(() => "/tmp/pending.jsonl"),
      installSubagents: vi.fn(async () => {
        throw new Error("subagent install failed")
      }),
      registerOuroBundleType: vi.fn(async () => ({ attempted: true, registered: true })),
      listDiscoveredAgents: vi.fn(async () => []),
      runAdoptionSpecialist,
      startChat,
    }

    await runOuroCli([], deps)

    expect(runAdoptionSpecialist).toHaveBeenCalledTimes(1)
    expect(startChat).toHaveBeenCalledWith("FailInstallBot")
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
