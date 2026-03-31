import { spawn, type ChildProcess } from "child_process"
import { randomUUID } from "crypto"

export interface ShellSession {
  id: string
  command: string
  status: "running" | "exited"
  exitCode: number | null
  pid: number | undefined
  startedAt: number
  output: string[]
}

interface LiveSession {
  process: ChildProcess
  info: ShellSession
}

const sessions = new Map<string, LiveSession>()
const MAX_OUTPUT_LINES = 200

export function spawnBackgroundShell(command: string): ShellSession {
  const id = randomUUID()
  const proc = spawn("sh", ["-c", command], {
    stdio: ["pipe", "pipe", "pipe"],
  })

  const session: LiveSession = {
    process: proc,
    info: {
      id,
      command,
      status: "running",
      exitCode: null,
      pid: proc.pid,
      startedAt: Date.now(),
      output: [],
    },
  }

  const appendOutput = (data: Buffer) => {
    const lines = data.toString().split("\n")
    for (const line of lines) {
      if (line.length > 0 || session.info.output.length > 0) {
        session.info.output.push(line)
      }
    }
    // Keep only the last MAX_OUTPUT_LINES
    if (session.info.output.length > MAX_OUTPUT_LINES) {
      session.info.output = session.info.output.slice(-MAX_OUTPUT_LINES)
    }
  }

  proc.stdout?.on("data", appendOutput)
  proc.stderr?.on("data", appendOutput)

  proc.on("close", (code) => {
    session.info.status = "exited"
    session.info.exitCode = code
  })

  sessions.set(id, session)

  return { ...session.info }
}

export function getShellSession(id: string): ShellSession | undefined {
  const session = sessions.get(id)
  if (!session) return undefined
  return { ...session.info }
}

export function listShellSessions(): ShellSession[] {
  return Array.from(sessions.values()).map((s) => ({
    id: s.info.id,
    command: s.info.command,
    status: s.info.status,
    exitCode: s.info.exitCode,
    pid: s.info.pid,
    startedAt: s.info.startedAt,
    output: [], // Don't include full output in listing
  }))
}

export function tailShellSession(id: string, lines = 50): string | undefined {
  const session = sessions.get(id)
  if (!session) return undefined
  const tail = session.info.output.slice(-lines)
  return tail.join("\n")
}

/** Reset all sessions (for testing) */
export function resetShellSessions(): void {
  for (const session of sessions.values()) {
    if (session.info.status === "running") {
      session.process.kill()
    }
  }
  sessions.clear()
}
