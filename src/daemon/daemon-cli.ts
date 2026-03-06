import { spawn } from "child_process"
import * as net from "net"
import * as path from "path"
import { getRepoRoot } from "../identity"
import { emitNervesEvent } from "../nerves/runtime"
import type { DaemonCommand, DaemonResponse } from "./daemon"

export type OuroCliCommand = Exclude<DaemonCommand, { kind: "message.send" | "message.poll" }>

export interface OuroCliDeps {
  socketPath: string
  sendCommand: (socketPath: string, command: DaemonCommand) => Promise<DaemonResponse>
  startDaemonProcess: (socketPath: string) => Promise<{ pid: number | null }>
  writeStdout: (text: string) => void
}

function usage(): string {
  return [
    "Usage:",
    "  ouro start|stop|status|health",
    "  ouro agent start|stop|restart <agent>",
    "  ouro cron list",
    "  ouro cron trigger <job-id>",
  ].join("\n")
}

export function parseOuroCommand(args: string[]): OuroCliCommand {
  const [head, second, third] = args
  if (!head) throw new Error(`Usage\n${usage()}`)

  if (head === "start") return { kind: "daemon.start" }
  if (head === "stop") return { kind: "daemon.stop" }
  if (head === "status") return { kind: "daemon.status" }
  if (head === "health") return { kind: "daemon.health" }

  if (head === "agent") {
    if (!second || !third) throw new Error(`Usage\n${usage()}`)
    if (second === "start") return { kind: "agent.start", agent: third }
    if (second === "stop") return { kind: "agent.stop", agent: third }
    if (second === "restart") return { kind: "agent.restart", agent: third }
    throw new Error(`Unknown command '${args.join(" ")}'.\n${usage()}`)
  }

  if (head === "cron") {
    if (second === "list") return { kind: "cron.list" }
    if (second === "trigger" && third) return { kind: "cron.trigger", jobId: third }
    throw new Error(`Usage\n${usage()}`)
  }

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
      try {
        const parsed = JSON.parse(raw) as DaemonResponse
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

export function createDefaultOuroCliDeps(socketPath = "/tmp/ouroboros-daemon.sock"): OuroCliDeps {
  return {
    socketPath,
    sendCommand: defaultSendCommand,
    startDaemonProcess: defaultStartDaemonProcess,
    writeStdout: defaultWriteStdout,
  }
}

export async function runOuroCli(args: string[], deps: OuroCliDeps = createDefaultOuroCliDeps()): Promise<string> {
  const command = parseOuroCommand(args)
  emitNervesEvent({
    component: "daemon",
    event: "daemon.cli_command",
    message: "ouro CLI command invoked",
    meta: { kind: command.kind },
  })

  if (command.kind === "daemon.start") {
    const started = await deps.startDaemonProcess(deps.socketPath)
    const message = `daemon started (pid ${started.pid ?? "unknown"})`
    deps.writeStdout(message)
    return message
  }

  const response = await deps.sendCommand(deps.socketPath, command)
  const message = response.summary ?? response.message ?? (response.ok ? "ok" : `error: ${response.error ?? "unknown error"}`)
  deps.writeStdout(message)
  return message
}
