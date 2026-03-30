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

    writeAgentConfig(alphaRoot, {
      senses: {
        cli: { enabled: true },
        teams: { enabled: true },
        bluebubbles: { enabled: false },
      },
    })
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
    writeJson(path.join(alphaRoot, "state", "obligations", "ob-0.json"), {
      id: "ob-0",
      origin: { friendId: "friend-2", channel: "teams", key: "thread" },
      content: "Older open thread.",
      status: "pending",
      createdAt: "2026-03-29T09:10:00.000Z",
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
    fs.writeFileSync(path.join(betaRoot, "tasks", "one-shots", "badname.md"), "---\ntype: one-shot\ncategory: infrastructure\ntitle: Bad filename\nstatus: paused\ncreated: 2026-03-21\nupdated: 2026-03-21\n---\n", "utf-8")
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
      obligations: { openCount: 2 },
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
    expect(alpha.senses).toEqual(["cli", "teams"])
    expect(alpha.tasks.liveTaskNames).toEqual([
      "agent-dashboard",
      "cross-session-followup",
    ])
    expect(alpha.obligations.items.map((item) => item.id)).toEqual(["ob-1", "ob-0"])
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

  it("handles sparse or malformed direct-read inputs without inventing state", async () => {
    const bundlesRoot = makeBundleRoot()
    const gammaRoot = path.join(bundlesRoot, "gamma.ouro")
    const deltaRoot = path.join(bundlesRoot, "delta.ouro")
    const epsilonRoot = path.join(bundlesRoot, "epsilon.ouro")
    const zetaRoot = path.join(bundlesRoot, "zeta.ouro")
    const thetaRoot = path.join(bundlesRoot, "theta.ouro")

    fs.mkdirSync(gammaRoot, { recursive: true })
    fs.writeFileSync(path.join(gammaRoot, "agent.json"), "{not-json", "utf-8")
    writeJson(path.join(gammaRoot, "state", "sessions", "self", "inner", "dialog.json"), {
      version: 1,
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "waking up.\n\nwhat needs my attention?" },
        { role: "assistant", content: "Nothing is on fire, but there is no fresh outer activity." },
      ],
    })
    writeJson(path.join(gammaRoot, "state", "sessions", "self", "inner", "runtime.json"), {
      status: "idle",
    })
    writeCodingState(gammaRoot, [
      { session: { runner: "codex" } },
      buildCodingRecord({
        id: "coding-002",
        checkpoint: null,
        originSession: { friendId: 42 },
        taskRef: null,
        stdoutTail: "stdout fallback checkpoint",
        stderrTail: "",
        lastActivityAt: "2026-03-29T09:00:00.000Z",
      }),
      buildCodingRecord({
        id: "coding-003",
        checkpoint: null,
        originSession: { friendId: 42 },
        taskRef: null,
        stdoutTail: "",
        stderrTail: "stderr fallback checkpoint",
        lastActivityAt: "2026-03-29T09:05:00.000Z",
      }),
      buildCodingRecord({
        id: "coding-004",
        checkpoint: null,
        originSession: { friendId: 42 },
        taskRef: null,
        stdoutTail: "",
        stderrTail: "",
        lastActivityAt: "2026-03-29T09:10:00.000Z",
      }),
    ])
    writeAgentConfig(deltaRoot)
    writeJson(path.join(deltaRoot, "state", "sessions", "self", "inner", "dialog.json"), {
      version: 1,
      messages: [],
    })
    writeJson(path.join(deltaRoot, "state", "sessions", "self", "inner", "runtime.json"), {
      status: "idle",
    })
    writeAgentConfig(epsilonRoot)
    writeJson(path.join(epsilonRoot, "state", "sessions", "self", "inner", "dialog.json"), {
      version: 1,
      messages: [],
    })
    writeJson(path.join(epsilonRoot, "state", "sessions", "self", "inner", "runtime.json"), {
      status: "idle",
    })
    writeJson(path.join(epsilonRoot, "state", "coding", "sessions.json"), {
      sequence: 1,
      records: { bad: true },
    })
    writeAgentConfig(zetaRoot)
    writeJson(path.join(zetaRoot, "state", "sessions", "self", "inner", "dialog.json"), {
      version: 1,
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "[pending from friend-7/cli/session]: Please think about the daemon seam." },
        { role: "assistant", content: "The daemon seam should stay loopback-only." },
      ],
    })
    writeJson(path.join(zetaRoot, "state", "sessions", "self", "inner", "runtime.json"), {
      status: "idle",
    })
    writeJson(path.join(thetaRoot, "agent.json"), {
      version: 1,
      provider: 42,
      phrases: {
        thinking: ["working"],
        tool: ["running tool"],
        followup: ["processing"],
      },
    })
    writeJson(path.join(thetaRoot, "state", "sessions", "self", "inner", "dialog.json"), {
      version: 1,
      messages: [],
    })
    writeJson(path.join(thetaRoot, "state", "sessions", "self", "inner", "runtime.json"), {
      status: "idle",
    })

    const { readOutlookAgentState, readOutlookMachineState } = await import("../../../heart/daemon/outlook-read")

    const gamma = readOutlookAgentState("gamma", {
      bundlesRoot,
      now: () => new Date("2026-03-29T12:00:00.000Z"),
    })

    expect(gamma.enabled).toBe(false)
    expect(gamma.degraded.status).toBe("degraded")
    expect(gamma.degraded.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "agent-config-unreadable" }),
      ]),
    )
    expect(gamma.freshness.status).toBe("fresh")
    expect(gamma.inner).toMatchObject({
      status: "idle",
      hasPending: false,
      surfacedSummary: null,
    })
    expect(gamma.coding.items).toHaveLength(3)
    expect(gamma.coding.items[0]).toMatchObject({
      id: "coding-002",
      checkpoint: "stdout fallback checkpoint",
      originSession: null,
      taskRef: null,
    })
    expect(gamma.coding.items[1]).toMatchObject({
      id: "coding-003",
      checkpoint: "stderr fallback checkpoint",
      originSession: null,
    })
    expect(gamma.coding.items[2]).toMatchObject({
      id: "coding-004",
      checkpoint: null,
      originSession: null,
    })

    const delta = readOutlookAgentState("delta", {
      bundlesRoot,
      now: () => new Date("2026-03-29T12:00:00.000Z"),
    })

    expect(delta.freshness.status).toBe("unknown")
    expect(delta.degraded.status).toBe("ok")

    const machine = readOutlookMachineState({
      bundlesRoot,
      agentNames: ["delta"],
      now: () => new Date("2026-03-29T12:00:00.000Z"),
      runtimeMetadata: {
        version: "0.1.0-test",
        lastUpdated: "2026-03-29T11:30:00.000Z",
        repoRoot: "/tmp/repo",
        configFingerprint: "cfg-test",
      },
    })

    expect(machine.agentCount).toBe(1)
    expect(machine.freshness.status).toBe("unknown")
    expect(machine.degraded.status).toBe("ok")

    const epsilon = readOutlookAgentState("epsilon", {
      bundlesRoot,
      now: () => new Date("2026-03-29T12:00:00.000Z"),
    })
    expect(epsilon.coding.items).toEqual([])

    const zeta = readOutlookAgentState("zeta", {
      bundlesRoot,
      now: () => new Date("2026-03-29T12:00:00.000Z"),
    })
    expect(zeta.inner).toMatchObject({
      status: "surfaced",
      surfacedSummary: "\"The daemon seam should stay loopback-only.\"",
    })

    const theta = readOutlookAgentState("theta", {
      bundlesRoot,
      now: () => new Date("2026-03-29T12:00:00.000Z"),
    })
    expect(theta.enabled).toBe(true)
    expect(theta.provider).toBeNull()
    expect(theta.senses).toEqual([])
  })

  it("records non-Error coding read failures truthfully", async () => {
    const bundlesRoot = makeBundleRoot()
    const etaRoot = path.join(bundlesRoot, "eta.ouro")
    const iotaRoot = path.join(bundlesRoot, "iota.ouro")
    writeAgentConfig(etaRoot)
    writeJson(path.join(etaRoot, "state", "sessions", "self", "inner", "dialog.json"), {
      version: 1,
      messages: [],
    })
    writeJson(path.join(etaRoot, "state", "sessions", "self", "inner", "runtime.json"), {
      status: "idle",
    })
    writeJson(path.join(etaRoot, "state", "coding", "sessions.json"), {
      sequence: 1,
      records: [],
    })
    writeAgentConfig(iotaRoot)
    writeJson(path.join(iotaRoot, "state", "sessions", "self", "inner", "dialog.json"), {
      version: 1,
      messages: [],
    })
    writeJson(path.join(iotaRoot, "state", "sessions", "self", "inner", "runtime.json"), {
      status: "idle",
    })

    vi.resetModules()
    vi.doMock("fs", async () => {
      const actual = await vi.importActual<typeof import("fs")>("fs")
      return {
        ...actual,
        readFileSync: ((filePath: fs.PathOrFileDescriptor, encoding?: unknown) => {
          if (typeof filePath === "string" && filePath.endsWith(path.join("eta.ouro", "state", "coding", "sessions.json"))) {
            throw "boom-string"
          }
          if (typeof filePath === "string" && filePath.endsWith(path.join("iota.ouro", "agent.json"))) {
            throw "config-string"
          }
          return actual.readFileSync(filePath, encoding as BufferEncoding)
        }) as typeof fs.readFileSync,
      }
    })
    const { readOutlookAgentState } = await import("../../../heart/daemon/outlook-read")
    const eta = readOutlookAgentState("eta", {
      bundlesRoot,
      now: () => new Date("2026-03-29T12:00:00.000Z"),
    })

    expect(eta.degraded.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "coding-state-unreadable",
          detail: expect.stringContaining("boom-string"),
        }),
      ]),
    )

    const iota = readOutlookAgentState("iota", {
      bundlesRoot,
      now: () => new Date("2026-03-29T12:00:00.000Z"),
    })
    expect(iota.degraded.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "agent-config-unreadable",
          detail: expect.stringContaining("config-string"),
        }),
      ]),
    )
    vi.doUnmock("fs")
  })

  it("uses default discovery and runtime dependencies when options are omitted", async () => {
    const bundlesRoot = makeBundleRoot()
    const alphaRoot = path.join(bundlesRoot, "alpha.ouro")
    writeAgentConfig(alphaRoot)
    writeJson(path.join(alphaRoot, "state", "sessions", "self", "inner", "dialog.json"), {
      version: 1,
      messages: [],
    })
    writeJson(path.join(alphaRoot, "state", "sessions", "self", "inner", "runtime.json"), {
      status: "idle",
    })

    vi.resetModules()

    const getAgentBundlesRootMock = vi.fn(() => bundlesRoot)
    const getRuntimeMetadataMock = vi.fn(() => ({
      version: "0.1.0-test",
      lastUpdated: "2026-03-29T11:30:00.000Z",
      repoRoot: "/tmp/repo",
      configFingerprint: "cfg-test",
    }))
    const listEnabledBundleAgentsMock = vi.fn(() => ["alpha"])

    vi.doMock("../../../heart/identity", async () => {
      const actual = await vi.importActual<typeof import("../../../heart/identity")>("../../../heart/identity")
      return {
        ...actual,
        getAgentBundlesRoot: getAgentBundlesRootMock,
      }
    })
    vi.doMock("../../../heart/daemon/runtime-metadata", async () => {
      const actual = await vi.importActual<typeof import("../../../heart/daemon/runtime-metadata")>("../../../heart/daemon/runtime-metadata")
      return {
        ...actual,
        getRuntimeMetadata: getRuntimeMetadataMock,
      }
    })
    vi.doMock("../../../heart/daemon/agent-discovery", async () => {
      const actual = await vi.importActual<typeof import("../../../heart/daemon/agent-discovery")>("../../../heart/daemon/agent-discovery")
      return {
        ...actual,
        listEnabledBundleAgents: listEnabledBundleAgentsMock,
      }
    })

    const { readOutlookAgentState, readOutlookMachineState } = await import("../../../heart/daemon/outlook-read")

    const agent = readOutlookAgentState("alpha")
    const machine = readOutlookMachineState()

    expect(agent.agentRoot).toBe(path.join(bundlesRoot, "alpha.ouro"))
    expect(machine.runtime.version).toBe("0.1.0-test")
    expect(getAgentBundlesRootMock).toHaveBeenCalled()
    expect(getRuntimeMetadataMock).toHaveBeenCalledWith({ bundlesRoot })
    expect(listEnabledBundleAgentsMock).toHaveBeenCalledWith({ bundlesRoot })

    vi.doUnmock("../../../heart/identity")
    vi.doUnmock("../../../heart/daemon/runtime-metadata")
    vi.doUnmock("../../../heart/daemon/agent-discovery")
  })
})
