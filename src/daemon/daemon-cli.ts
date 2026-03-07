import { spawn } from "child_process"
import * as fs from "fs"
import * as net from "net"
import * as path from "path"
import { getRepoRoot } from "../identity"
import { emitNervesEvent } from "../nerves/runtime"
import type { DaemonCommand, DaemonResponse } from "./daemon"

export type OuroCliCommand =
  | { kind: "daemon.up" }
  | { kind: "daemon.stop" }
  | { kind: "daemon.status" }
  | { kind: "daemon.logs" }
  | { kind: "chat.connect"; agent: string }
  | { kind: "message.send"; from: string; to: string; content: string; sessionId?: string; taskRef?: string }
  | { kind: "task.poke"; agent: string; taskId: string }
  | { kind: "hatch.start" }

export interface OuroCliDeps {
  socketPath: string
  sendCommand: (socketPath: string, command: DaemonCommand) => Promise<DaemonResponse>
  startDaemonProcess: (socketPath: string) => Promise<{ pid: number | null }>
  writeStdout: (text: string) => void
  checkSocketAlive: (socketPath: string) => Promise<boolean>
  cleanupStaleSocket: (socketPath: string) => void
}

function usage(): string {
  return [
    "Usage:",
    "  ouro [up]",
    "  ouro stop|status|logs|hatch",
    "  ouro chat <agent>",
    "  ouro msg --to <agent> [--session <id>] [--task <ref>] <message>",
    "  ouro poke <agent> --task <task-id>",
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

export function parseOuroCommand(args: string[]): OuroCliCommand {
  const [head, second] = args
  if (!head) return { kind: "daemon.up" }

  if (head === "up") return { kind: "daemon.up" }
  if (head === "stop") return { kind: "daemon.stop" }
  if (head === "status") return { kind: "daemon.status" }
  if (head === "logs") return { kind: "daemon.logs" }
  if (head === "hatch") return { kind: "hatch.start" }
  if (head === "chat") {
    if (!second) throw new Error(`Usage\n${usage()}`)
    return { kind: "chat.connect", agent: second }
  }
  if (head === "msg") return parseMessageCommand(args.slice(1))
  if (head === "poke") return parsePokeCommand(args.slice(1))

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

export function createDefaultOuroCliDeps(socketPath = "/tmp/ouroboros-daemon.sock"): OuroCliDeps {
  return {
    socketPath,
    sendCommand: defaultSendCommand,
    startDaemonProcess: defaultStartDaemonProcess,
    writeStdout: defaultWriteStdout,
    checkSocketAlive: defaultCheckSocketAlive,
    cleanupStaleSocket: defaultCleanupStaleSocket,
  }
}

function toDaemonCommand(command: Exclude<OuroCliCommand, { kind: "daemon.up" }>): DaemonCommand {
  return command
}

export async function runOuroCli(args: string[], deps: OuroCliDeps = createDefaultOuroCliDeps()): Promise<string> {
  const command = parseOuroCommand(args)
  emitNervesEvent({
    component: "daemon",
    event: "daemon.cli_command",
    message: "ouro CLI command invoked",
    meta: { kind: command.kind },
  })

  if (command.kind === "daemon.up") {
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

  const daemonCommand = toDaemonCommand(command)
  const response = await deps.sendCommand(deps.socketPath, daemonCommand)
  const message = response.summary ?? response.message ?? (response.ok ? "ok" : `error: ${response.error ?? "unknown error"}`)
  deps.writeStdout(message)
  return message
}
