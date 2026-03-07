import { spawn } from "child_process"
import * as fs from "fs"
import * as net from "net"
import * as os from "os"
import * as path from "path"
import { getAgentBundlesRoot, getRepoRoot, type AgentProvider } from "../heart/identity"
import { emitNervesEvent } from "../nerves/runtime"
import { FileFriendStore } from "../mind/friends/store-file"
import { isIdentityProvider, type IdentityProvider } from "../mind/friends/types"
import type { DaemonCommand, DaemonResponse } from "./daemon"
import { registerOuroBundleUti as defaultRegisterOuroBundleUti } from "./ouro-uti"
import { installSubagentsForAvailableCli, type SubagentInstallResult } from "./subagent-installer"
import {
  runHatchFlow as defaultRunHatchFlow,
  type HatchCredentialsInput,
  type HatchFlowInput,
  type HatchFlowResult,
} from "./hatch-flow"

export type OuroCliCommand =
  | { kind: "daemon.up" }
  | { kind: "daemon.stop" }
  | { kind: "daemon.status" }
  | { kind: "daemon.logs" }
  | { kind: "chat.connect"; agent: string }
  | { kind: "message.send"; from: string; to: string; content: string; sessionId?: string; taskRef?: string }
  | { kind: "task.poke"; agent: string; taskId: string }
  | { kind: "friend.link"; agent: string; friendId: string; provider: IdentityProvider; externalId: string }
  | { kind: "hatch.start"; agentName?: string; humanName?: string; provider?: AgentProvider; credentials?: HatchCredentialsInput; migrationPath?: string }

export interface OuroCliDeps {
  socketPath: string
  sendCommand: (socketPath: string, command: DaemonCommand) => Promise<DaemonResponse>
  startDaemonProcess: (socketPath: string) => Promise<{ pid: number | null }>
  writeStdout: (text: string) => void
  checkSocketAlive: (socketPath: string) => Promise<boolean>
  cleanupStaleSocket: (socketPath: string) => void
  fallbackPendingMessage: (command: Extract<DaemonCommand, { kind: "message.send" }>) => string
  installSubagents: () => Promise<SubagentInstallResult>
  linkFriendIdentity?: (command: Extract<OuroCliCommand, { kind: "friend.link" }>) => Promise<string>
  listDiscoveredAgents?: () => Promise<string[]> | string[]
  runHatchFlow?: (input: HatchFlowInput) => Promise<HatchFlowResult>
  promptInput?: (question: string) => Promise<string>
  registerOuroBundleType?: () => Promise<unknown> | unknown
}

function usage(): string {
  return [
    "Usage:",
    "  ouro [up]",
    "  ouro stop|status|logs|hatch",
    "  ouro chat <agent>",
    "  ouro msg --to <agent> [--session <id>] [--task <ref>] <message>",
    "  ouro poke <agent> --task <task-id>",
    "  ouro link <agent> --friend <id> --provider <provider> --external-id <external-id>",
  ].join("\n")
}

function parseMessageCommand(args: string[]): OuroCliCommand {
  let to: string | undefined
  let sessionId: string | undefined
  let taskRef: string | undefined
  const messageParts: string[] = []

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i]
    if (token === "--to") {
      to = args[i + 1]
      i += 1
      continue
    }
    if (token === "--session") {
      sessionId = args[i + 1]
      i += 1
      continue
    }
    if (token === "--task") {
      taskRef = args[i + 1]
      i += 1
      continue
    }
    messageParts.push(token)
  }

  const content = messageParts.join(" ").trim()
  if (!to || !content) throw new Error(`Usage\n${usage()}`)

  return {
    kind: "message.send",
    from: "ouro-cli",
    to,
    content,
    sessionId,
    taskRef,
  }
}

function parsePokeCommand(args: string[]): OuroCliCommand {
  const agent = args[0]
  if (!agent) throw new Error(`Usage\n${usage()}`)

  let taskId: string | undefined
  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === "--task") {
      taskId = args[i + 1]
      i += 1
    }
  }

  if (!taskId) throw new Error(`Usage\n${usage()}`)
  return { kind: "task.poke", agent, taskId }
}

function parseLinkCommand(args: string[]): OuroCliCommand {
  const agent = args[0]
  if (!agent) throw new Error(`Usage\n${usage()}`)

  let friendId: string | undefined
  let providerRaw: string | undefined
  let externalId: string | undefined
  for (let i = 1; i < args.length; i += 1) {
    const token = args[i]
    if (token === "--friend") {
      friendId = args[i + 1]
      i += 1
      continue
    }
    if (token === "--provider") {
      providerRaw = args[i + 1]
      i += 1
      continue
    }
    if (token === "--external-id") {
      externalId = args[i + 1]
      i += 1
      continue
    }
  }

  if (!friendId || !providerRaw || !externalId) {
    throw new Error(`Usage\n${usage()}`)
  }
  if (!isIdentityProvider(providerRaw)) {
    throw new Error(`Unknown identity provider '${providerRaw}'. Use aad|local|teams-conversation.`)
  }

  return {
    kind: "friend.link",
    agent,
    friendId,
    provider: providerRaw,
    externalId,
  }
}

function isAgentProvider(value: unknown): value is AgentProvider {
  return value === "azure" || value === "anthropic" || value === "minimax" || value === "openai-codex"
}

function parseHatchCommand(args: string[]): OuroCliCommand {
  let agentName: string | undefined
  let humanName: string | undefined
  let providerRaw: string | undefined
  let migrationPath: string | undefined
  const credentials: HatchCredentialsInput = {}

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i]
    if (token === "--agent") {
      agentName = args[i + 1]
      i += 1
      continue
    }
    if (token === "--human") {
      humanName = args[i + 1]
      i += 1
      continue
    }
    if (token === "--provider") {
      providerRaw = args[i + 1]
      i += 1
      continue
    }
    if (token === "--setup-token") {
      credentials.setupToken = args[i + 1]
      i += 1
      continue
    }
    if (token === "--oauth-token") {
      credentials.oauthAccessToken = args[i + 1]
      i += 1
      continue
    }
    if (token === "--api-key") {
      credentials.apiKey = args[i + 1]
      i += 1
      continue
    }
    if (token === "--endpoint") {
      credentials.endpoint = args[i + 1]
      i += 1
      continue
    }
    if (token === "--deployment") {
      credentials.deployment = args[i + 1]
      i += 1
      continue
    }
    if (token === "--migration-path") {
      migrationPath = args[i + 1]
      i += 1
      continue
    }
  }

  if (providerRaw && !isAgentProvider(providerRaw)) {
    throw new Error("Unknown provider. Use azure|anthropic|minimax|openai-codex.")
  }

  return {
    kind: "hatch.start",
    agentName,
    humanName,
    provider: providerRaw,
    credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
    migrationPath,
  }
}

export function parseOuroCommand(args: string[]): OuroCliCommand {
  const [head, second] = args
  if (!head) return { kind: "daemon.up" }

  if (head === "up") return { kind: "daemon.up" }
  if (head === "stop") return { kind: "daemon.stop" }
  if (head === "status") return { kind: "daemon.status" }
  if (head === "logs") return { kind: "daemon.logs" }
  if (head === "hatch") return parseHatchCommand(args.slice(1))
  if (head === "chat") {
    if (!second) throw new Error(`Usage\n${usage()}`)
    return { kind: "chat.connect", agent: second }
  }
  if (head === "msg") return parseMessageCommand(args.slice(1))
  if (head === "poke") return parsePokeCommand(args.slice(1))
  if (head === "link") return parseLinkCommand(args.slice(1))

  throw new Error(`Unknown command '${args.join(" ")}'.\n${usage()}`)
}

function defaultSendCommand(socketPath: string, command: DaemonCommand): Promise<DaemonResponse> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath)
    let raw = ""

    client.on("connect", () => {
      client.write(JSON.stringify(command))
      client.end()
    })
    client.on("data", (chunk) => {
      raw += chunk.toString("utf-8")
    })
    client.on("error", reject)
    client.on("end", () => {
      const trimmed = raw.trim()
      if (trimmed.length === 0 && command.kind === "daemon.stop") {
        resolve({ ok: true, message: "daemon stopped" })
        return
      }
      if (trimmed.length === 0) {
        reject(new Error("Daemon returned empty response."))
        return
      }
      try {
        const parsed = JSON.parse(trimmed) as DaemonResponse
        resolve(parsed)
      } catch (error) {
        reject(error)
      }
    })
  })
}

function defaultStartDaemonProcess(socketPath: string): Promise<{ pid: number | null }> {
  const entry = path.join(getRepoRoot(), "dist", "daemon", "daemon-entry.js")
  const child = spawn("node", [entry, "--socket", socketPath], {
    detached: true,
    stdio: "ignore",
  })
  child.unref()
  return Promise.resolve({ pid: child.pid ?? null })
}

function defaultWriteStdout(text: string): void {
  // eslint-disable-next-line no-console -- terminal UX: CLI command output
  console.log(text)
}

function defaultCheckSocketAlive(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const client = net.createConnection(socketPath)
    let raw = ""
    let done = false

    const finalize = (alive: boolean) => {
      if (done) return
      done = true
      resolve(alive)
    }

    if ("setTimeout" in client && typeof client.setTimeout === "function") {
      client.setTimeout(800, () => {
        client.destroy()
        finalize(false)
      })
    }

    client.on("connect", () => {
      client.write(JSON.stringify({ kind: "daemon.status" } satisfies DaemonCommand))
      client.end()
    })
    client.on("data", (chunk) => {
      raw += chunk.toString("utf-8")
    })
    client.on("error", () => finalize(false))
    client.on("end", () => {
      if (raw.trim().length === 0) {
        finalize(false)
        return
      }
      try {
        JSON.parse(raw)
        finalize(true)
      } catch {
        finalize(false)
      }
    })
  })
}

function defaultCleanupStaleSocket(socketPath: string): void {
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath)
  }
}

function defaultFallbackPendingMessage(command: Extract<DaemonCommand, { kind: "message.send" }>): string {
  const inboxDir = path.join(getAgentBundlesRoot(), `${command.to}.ouro`, "inbox")
  const pendingPath = path.join(inboxDir, "pending.jsonl")
  const queuedAt = new Date().toISOString()
  const payload = {
    from: command.from,
    to: command.to,
    content: command.content,
    priority: command.priority ?? "normal",
    sessionId: command.sessionId,
    taskRef: command.taskRef,
    queuedAt,
  }
  fs.mkdirSync(inboxDir, { recursive: true })
  fs.appendFileSync(pendingPath, `${JSON.stringify(payload)}\n`, "utf-8")
  emitNervesEvent({
    level: "warn",
    component: "daemon",
    event: "daemon.message_fallback_queued",
    message: "queued message to pending fallback file",
    meta: {
      to: command.to,
      path: pendingPath,
      sessionId: command.sessionId ?? null,
      taskRef: command.taskRef ?? null,
    },
  })
  return pendingPath
}

async function defaultInstallSubagents(): Promise<SubagentInstallResult> {
  return installSubagentsForAvailableCli({
    repoRoot: getRepoRoot(),
  })
}

async function defaultPromptInput(question: string): Promise<string> {
  const readline = await import("readline/promises")
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    const response = await rl.question(question)
    return response.trim()
  } finally {
    rl.close()
  }
}

function defaultListDiscoveredAgents(): string[] {
  const bundlesRoot = getAgentBundlesRoot()
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(bundlesRoot, { withFileTypes: true })
  } catch {
    return []
  }

  const discovered: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith(".ouro")) continue
    const agentName = entry.name.slice(0, -5)
    const configPath = path.join(bundlesRoot, entry.name, "agent.json")
    let enabled = true
    try {
      const raw = fs.readFileSync(configPath, "utf-8")
      const parsed = JSON.parse(raw) as { enabled?: unknown }
      if (typeof parsed.enabled === "boolean") {
        enabled = parsed.enabled
      }
    } catch {
      continue
    }
    if (enabled) {
      discovered.push(agentName)
    }
  }

  return discovered.sort((left, right) => left.localeCompare(right))
}

async function defaultLinkFriendIdentity(command: Extract<OuroCliCommand, { kind: "friend.link" }>): Promise<string> {
  const friendStore = new FileFriendStore(path.join(getAgentBundlesRoot(), `${command.agent}.ouro`, "friends"))
  const current = await friendStore.get(command.friendId)
  if (!current) {
    return `friend not found: ${command.friendId}`
  }

  const alreadyLinked = current.externalIds.some(
    (ext) => ext.provider === command.provider && ext.externalId === command.externalId,
  )
  if (alreadyLinked) {
    return `identity already linked: ${command.provider}:${command.externalId}`
  }

  const now = new Date().toISOString()
  await friendStore.put(command.friendId, {
    ...current,
    externalIds: [
      ...current.externalIds,
      {
        provider: command.provider,
        externalId: command.externalId,
        linkedAt: now,
      },
    ],
    updatedAt: now,
  })

  return `linked ${command.provider}:${command.externalId} to ${command.friendId}`
}

export function createDefaultOuroCliDeps(socketPath = "/tmp/ouroboros-daemon.sock"): OuroCliDeps {
  return {
    socketPath,
    sendCommand: defaultSendCommand,
    startDaemonProcess: defaultStartDaemonProcess,
    writeStdout: defaultWriteStdout,
    checkSocketAlive: defaultCheckSocketAlive,
    cleanupStaleSocket: defaultCleanupStaleSocket,
    fallbackPendingMessage: defaultFallbackPendingMessage,
    installSubagents: defaultInstallSubagents,
    linkFriendIdentity: defaultLinkFriendIdentity,
    listDiscoveredAgents: defaultListDiscoveredAgents,
    runHatchFlow: defaultRunHatchFlow,
    promptInput: defaultPromptInput,
    registerOuroBundleType: defaultRegisterOuroBundleUti,
  }
}

function toDaemonCommand(command: Exclude<OuroCliCommand, { kind: "daemon.up" } | { kind: "friend.link" } | { kind: "hatch.start" }>): DaemonCommand {
  return command
}

async function resolveHatchInput(command: Extract<OuroCliCommand, { kind: "hatch.start" }>, deps: OuroCliDeps): Promise<HatchFlowInput> {
  const prompt = deps.promptInput
  const agentName = command.agentName ?? (prompt ? await prompt("Hatchling name: ") : "")
  const humanName = command.humanName ?? (prompt ? await prompt("Your name: ") : os.userInfo().username)
  const providerRaw = command.provider ?? (prompt ? await prompt("Provider (azure|anthropic|minimax|openai-codex): ") : "")

  if (!agentName || !humanName || !isAgentProvider(providerRaw)) {
    throw new Error(`Usage\n${usage()}`)
  }

  const credentials: HatchCredentialsInput = { ...(command.credentials ?? {}) }
  if (providerRaw === "anthropic" && !credentials.setupToken && prompt) {
    credentials.setupToken = await prompt("Anthropic setup-token: ")
  }
  if (providerRaw === "openai-codex" && !credentials.oauthAccessToken && prompt) {
    credentials.oauthAccessToken = await prompt("OpenAI Codex OAuth token: ")
  }
  if (providerRaw === "minimax" && !credentials.apiKey && prompt) {
    credentials.apiKey = await prompt("MiniMax API key: ")
  }
  if (providerRaw === "azure") {
    if (!credentials.apiKey && prompt) credentials.apiKey = await prompt("Azure API key: ")
    if (!credentials.endpoint && prompt) credentials.endpoint = await prompt("Azure endpoint: ")
    if (!credentials.deployment && prompt) credentials.deployment = await prompt("Azure deployment: ")
  }

  return {
    agentName,
    humanName,
    provider: providerRaw,
    credentials,
    migrationPath: command.migrationPath,
  }
}

async function registerOuroBundleTypeNonBlocking(deps: OuroCliDeps): Promise<void> {
  const registerOuroBundleType = deps.registerOuroBundleType
  if (!registerOuroBundleType) return
  try {
    await Promise.resolve(registerOuroBundleType())
  } catch (error) {
    emitNervesEvent({
      level: "warn",
      component: "daemon",
      event: "daemon.ouro_uti_register_error",
      message: "failed .ouro UTI registration from CLI flow",
      meta: { error: error instanceof Error ? error.message : String(error) },
    })
  }
}

export async function runOuroCli(args: string[], deps: OuroCliDeps = createDefaultOuroCliDeps()): Promise<string> {
  let command = parseOuroCommand(args)
  if (args.length === 0) {
    const discovered = await Promise.resolve(
      deps.listDiscoveredAgents ? deps.listDiscoveredAgents() : defaultListDiscoveredAgents(),
    )
    if (discovered.length === 0) {
      command = { kind: "hatch.start" }
    } else if (discovered.length === 1) {
      command = { kind: "chat.connect", agent: discovered[0] }
    } else {
      const message = `who do you want to talk to? ${discovered.join(", ")} (use: ouro chat <agent>)`
      deps.writeStdout(message)
      return message
    }
    emitNervesEvent({
      component: "daemon",
      event: "daemon.cli_auto_route",
      message: "routed bare ouro command from discovered agents",
      meta: { target: command.kind, count: discovered.length },
    })
  }
  emitNervesEvent({
    component: "daemon",
    event: "daemon.cli_command",
    message: "ouro CLI command invoked",
    meta: { kind: command.kind },
  })

  if (command.kind === "daemon.up") {
    try {
      await deps.installSubagents()
    } catch (error) {
      emitNervesEvent({
        level: "warn",
        component: "daemon",
        event: "daemon.subagent_install_error",
        message: "subagent auto-install failed",
        meta: { error: error instanceof Error ? error.message : String(error) },
      })
    }

    await registerOuroBundleTypeNonBlocking(deps)

    const alive = await deps.checkSocketAlive(deps.socketPath)
    if (alive) {
      const message = `daemon already running (${deps.socketPath})`
      deps.writeStdout(message)
      return message
    }

    deps.cleanupStaleSocket(deps.socketPath)
    const started = await deps.startDaemonProcess(deps.socketPath)
    const message = `daemon started (pid ${started.pid ?? "unknown"})`
    deps.writeStdout(message)
    return message
  }

  if (command.kind === "friend.link") {
    const linker = deps.linkFriendIdentity ?? defaultLinkFriendIdentity
    const message = await linker(command)
    deps.writeStdout(message)
    return message
  }

  if (command.kind === "hatch.start") {
    const hatchRunner = deps.runHatchFlow
    if (!hatchRunner) {
      const response = await deps.sendCommand(deps.socketPath, { kind: "hatch.start" })
      const message = response.summary ?? response.message ?? (response.ok ? "ok" : `error: ${response.error ?? "unknown error"}`)
      deps.writeStdout(message)
      return message
    }

    const hatchInput = await resolveHatchInput(command, deps)
    const result = await hatchRunner(hatchInput)

    try {
      await deps.installSubagents()
    } catch (error) {
      emitNervesEvent({
        level: "warn",
        component: "daemon",
        event: "daemon.subagent_install_error",
        message: "subagent auto-install failed",
        meta: { error: error instanceof Error ? error.message : String(error) },
      })
    }

    await registerOuroBundleTypeNonBlocking(deps)

    const alive = await deps.checkSocketAlive(deps.socketPath)
    let daemonMessage = `daemon already running (${deps.socketPath})`
    if (!alive) {
      deps.cleanupStaleSocket(deps.socketPath)
      const started = await deps.startDaemonProcess(deps.socketPath)
      daemonMessage = `daemon started (pid ${started.pid ?? "unknown"})`
    }

    const message = `hatched ${hatchInput.agentName} at ${result.bundleRoot} using specialist identity ${result.selectedIdentity}; ${daemonMessage}`
    deps.writeStdout(message)
    return message
  }

  const daemonCommand = toDaemonCommand(command)
  let response: DaemonResponse
  try {
    response = await deps.sendCommand(deps.socketPath, daemonCommand)
  } catch (error) {
    if (command.kind === "message.send") {
      const pendingPath = deps.fallbackPendingMessage(command)
      const message = `daemon unavailable; queued message fallback at ${pendingPath}`
      deps.writeStdout(message)
      return message
    }
    throw error
  }
  const message = response.summary ?? response.message ?? (response.ok ? "ok" : `error: ${response.error ?? "unknown error"}`)
  deps.writeStdout(message)
  return message
}
