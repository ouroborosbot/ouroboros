import { afterEach, describe, expect, it, vi } from "vitest"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

vi.mock("../../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn(),
}))

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8")
}

function writeTask(
  tasksRoot: string,
  collection: "one-shots" | "ongoing",
  stem: string,
  frontmatter: Record<string, unknown>,
  body = "Task body.",
): void {
  fs.mkdirSync(path.join(tasksRoot, collection), { recursive: true })
  const lines = ["---"]
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`)
        continue
      }
      lines.push(`${key}:`)
      for (const item of value) {
        lines.push(`- ${String(item)}`)
      }
      continue
    }

    lines.push(`${key}: ${String(value)}`)
  }
  lines.push("---", "", body, "")
  fs.writeFileSync(path.join(tasksRoot, collection, `${stem}.md`), lines.join("\n"), "utf-8")
}

function writeAgentConfig(agentRoot: string, overrides: Record<string, unknown> = {}): void {
  writeJson(path.join(agentRoot, "agent.json"), {
    version: 1,
    enabled: true,
    provider: "anthropic",
    senses: {
      cli: { enabled: true },
      teams: { enabled: false },
      bluebubbles: { enabled: false },
    },
    phrases: {
      thinking: ["working"],
      tool: ["running tool"],
      followup: ["processing"],
    },
    ...overrides,
  })
}

function writeCodingState(agentRoot: string, records: unknown[]): void {
  writeJson(path.join(agentRoot, "state", "coding", "sessions.json"), {
    sequence: records.length,
    records,
  })
}

function buildCodingRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const session = {
    id: "coding-001",
    runner: "codex",
    workdir: "/tmp/workdir",
    taskRef: "outlook",
    originSession: { friendId: "friend-1", channel: "cli", key: "session" },
    checkpoint: "needs human input on daemon wiring",
    artifactPath: "/tmp/coding-001.md",
    status: "waiting_input",
    stdoutTail: "needs human input on daemon wiring",
    stderrTail: "",
    pid: null,
    startedAt: "2026-03-29T11:20:00.000Z",
    lastActivityAt: "2026-03-29T11:58:00.000Z",
    endedAt: null,
    restartCount: 0,
    lastExitCode: null,
    lastSignal: null,
    failure: null,
  }

  const request = {
    runner: "codex",
    workdir: "/tmp/workdir",
    prompt: "Work the Outlook slice.",
    originSession: { friendId: "friend-1", channel: "cli", key: "session" },
    sessionId: "coding-001",
    parentAgent: "alpha",
  }

  return {
    request,
    session: {
      ...session,
      ...overrides,
    },
  }
}

function makeBundleRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "outlook-read-"))
}

describe("outlook direct reads", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("reads machine and per-agent Outlook state directly from existing bundle truth", async () => {
    const bundlesRoot = makeBundleRoot()
    const alphaRoot = path.join(bundlesRoot, "alpha.ouro")
    const betaRoot = path.join(bundlesRoot, "beta.ouro")

    writeAgentConfig(alphaRoot)
    writeAgentConfig(betaRoot)

    writeTask(path.join(alphaRoot, "tasks"), "one-shots", "2026-03-29-1100-agent-dashboard", {
      type: "one-shot",
      category: "infrastructure",
      title: "Build Outlook",
      status: "processing",
      created: "2026-03-29",
      updated: "2026-03-29",
      depends_on: [],
    })
    writeTask(path.join(alphaRoot, "tasks"), "ongoing", "2026-03-29-1115-cross-session-followup", {
      type: "ongoing",
      category: "coordination",
      title: "Watch live collaborator threads",
      status: "blocked",
      created: "2026-03-29",
      updated: "2026-03-29",
    })
    writeJson(path.join(alphaRoot, "state", "obligations", "ob-1.json"), {
      id: "ob-1",
      origin: { friendId: "friend-1", channel: "cli", key: "session" },
      content: "Bring daemon hosting back with tests.",
      status: "investigating",
      createdAt: "2026-03-29T11:10:00.000Z",
      updatedAt: "2026-03-29T11:56:00.000Z",
      nextAction: "finish the read layer and move to daemon hosting",
    })
    writeJson(path.join(alphaRoot, "state", "sessions", "friend-1", "cli", "session.json"), {
      version: 1,
      messages: [],
      state: { lastFriendActivityAt: "2026-03-29T11:59:00.000Z" },
    })
    writeJson(path.join(alphaRoot, "friends", "friend-1.json"), { name: "Ari" })
    writeJson(path.join(alphaRoot, "state", "sessions", "self", "inner", "dialog.json"), {
      version: 1,
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "waking up.\n\nwhat needs my attention?" },
        { role: "assistant", content: "The daemon seam is the next honest move." },
        { role: "user", content: "[pending from friend-1/cli/session]: Please think through the daemon seam." },
        { role: "assistant", content: "The daemon seam should stay local-only and loopback-bound." },
      ],
    })
    writeJson(path.join(alphaRoot, "state", "sessions", "self", "inner", "runtime.json"), {
      status: "idle",
      lastCompletedAt: "2026-03-29T11:57:00.000Z",
    })
    writeJson(path.join(alphaRoot, "state", "pending", "self", "inner", "dialog", "000.json"), {
      from: "friend-1",
      content: "Please think through the daemon seam.",
      timestamp: Date.parse("2026-03-29T11:55:00.000Z"),
      delegatedFrom: { friendId: "friend-1", channel: "cli", key: "session" },
      obligationStatus: "pending",
      mode: "plan",
    })
    writeCodingState(alphaRoot, [buildCodingRecord()])

    writeTask(path.join(betaRoot, "tasks"), "one-shots", "2026-03-20-0900-old-task", {
      type: "one-shot",
      category: "infrastructure",
      title: "Old stale work",
      status: "paused",
      created: "2026-03-20",
      updated: "2026-03-20",
    })
    fs.mkdirSync(path.join(betaRoot, "tasks", "one-shots"), { recursive: true })
    fs.writeFileSync(path.join(betaRoot, "tasks", "one-shots", "2026-03-21-0901-bad-task.md"), "---\ntype: one-shot\nstatus: nope\n---\n", "utf-8")
    writeJson(path.join(betaRoot, "state", "sessions", "friend-2", "cli", "session.json"), {
      version: 1,
      messages: [],
      state: { lastFriendActivityAt: "2026-03-21T10:00:00.000Z" },
    })
    writeJson(path.join(betaRoot, "friends", "friend-2.json"), { name: "Sam" })
    writeJson(path.join(betaRoot, "state", "sessions", "self", "inner", "dialog.json"), {
      version: 1,
      messages: [],
    })
    writeJson(path.join(betaRoot, "state", "sessions", "self", "inner", "runtime.json"), {
      status: "idle",
      lastCompletedAt: "2026-03-21T10:00:00.000Z",
    })
    fs.mkdirSync(path.join(betaRoot, "state", "coding"), { recursive: true })
    fs.writeFileSync(path.join(betaRoot, "state", "coding", "sessions.json"), "{not-json", "utf-8")

    const { readOutlookMachineState, readOutlookAgentState } = await import("../../../heart/daemon/outlook-read")

    const machine = readOutlookMachineState({
      bundlesRoot,
      now: () => new Date("2026-03-29T12:00:00.000Z"),
      runtimeMetadata: {
        version: "0.1.0-test",
        lastUpdated: "2026-03-29T11:30:00.000Z",
        repoRoot: "/tmp/repo",
        configFingerprint: "cfg-test",
      },
    })

    expect(machine.productName).toBe("Ouro Outlook")
    expect(machine.agentCount).toBe(2)
    expect(machine.degraded.status).toBe("degraded")
    expect(machine.agents.map((agent) => agent.agentName)).toEqual(["alpha", "beta"])
    expect(machine.agents[0]).toMatchObject({
      agentName: "alpha",
      freshness: { status: "fresh" },
      tasks: { liveCount: 2, blockedCount: 1 },
      obligations: { openCount: 1 },
      coding: { activeCount: 1, blockedCount: 1 },
    })
    expect(machine.agents[1]).toMatchObject({
      agentName: "beta",
      freshness: { status: "stale" },
      degraded: { status: "degraded" },
    })

    const alpha = readOutlookAgentState("alpha", {
      bundlesRoot,
      now: () => new Date("2026-03-29T12:00:00.000Z"),
    })

    expect(alpha.agentName).toBe("alpha")
    expect(alpha.tasks.liveTaskNames).toEqual([
      "agent-dashboard",
      "cross-session-followup",
    ])
    expect(alpha.sessions.liveCount).toBe(1)
    expect(alpha.sessions.items[0]).toMatchObject({
      friendId: "friend-1",
      friendName: "Ari",
      channel: "cli",
    })
    expect(alpha.inner).toMatchObject({
      visibility: "summary",
      status: "queued",
      hasPending: true,
      surfacedSummary: null,
    })
    expect(alpha.coding.items[0]).toMatchObject({
      id: "coding-001",
      status: "waiting_input",
    })
  })

  it("re-reads request-time truth instead of holding hidden dashboard state", async () => {
    const bundlesRoot = makeBundleRoot()
    const alphaRoot = path.join(bundlesRoot, "alpha.ouro")

    writeAgentConfig(alphaRoot)
    writeTask(path.join(alphaRoot, "tasks"), "one-shots", "2026-03-29-1100-agent-dashboard", {
      type: "one-shot",
      category: "infrastructure",
      title: "Build Outlook",
      status: "processing",
      created: "2026-03-29",
      updated: "2026-03-29",
    })
    writeJson(path.join(alphaRoot, "state", "sessions", "self", "inner", "dialog.json"), {
      version: 1,
      messages: [],
    })
    writeJson(path.join(alphaRoot, "state", "sessions", "self", "inner", "runtime.json"), {
      status: "idle",
    })

    const { readOutlookAgentState } = await import("../../../heart/daemon/outlook-read")

    const first = readOutlookAgentState("alpha", {
      bundlesRoot,
      now: () => new Date("2026-03-29T12:00:00.000Z"),
    })
    expect(first.tasks.liveCount).toBe(1)

    writeTask(path.join(alphaRoot, "tasks"), "one-shots", "2026-03-29-1100-agent-dashboard", {
      type: "one-shot",
      category: "infrastructure",
      title: "Build Outlook",
      status: "done",
      created: "2026-03-29",
      updated: "2026-03-29",
    }, "Task body is now complete.")

    const second = readOutlookAgentState("alpha", {
      bundlesRoot,
      now: () => new Date("2026-03-29T12:00:00.000Z"),
    })
    expect(second.tasks.liveCount).toBe(0)
    expect(second.tasks.byStatus.done).toBe(1)
  })
})
