import { describe, expect, it } from "vitest"

describe("outlook machine view", () => {
  it("builds a machine-overview-first view with daemon truth, entrypoints, and attention-sorted agents", async () => {
    const { buildOutlookMachineView } = await import("../../../heart/daemon/outlook-view")

    const view = buildOutlookMachineView({
      machine: {
        productName: "Ouro Outlook",
        observedAt: "2026-03-30T07:35:00.000Z",
        runtime: {
          version: "0.1.0-alpha.109",
          lastUpdated: "2026-03-30T00:30:24.000Z",
          repoRoot: "/mock/repo",
          configFingerprint: "cfg-123",
        },
        agentCount: 3,
        freshness: {
          status: "fresh",
          latestActivityAt: "2026-03-30T07:34:00.000Z",
          ageMs: 60_000,
        },
        degraded: {
          status: "degraded",
          issues: [{ code: "agent-degraded", detail: "alpha: task scanner unreadable" }],
        },
        agents: [
          {
            agentName: "beta",
            enabled: true,
            freshness: { status: "fresh", latestActivityAt: "2026-03-30T07:34:00.000Z", ageMs: 60_000 },
            degraded: { status: "ok", issues: [] },
            tasks: { liveCount: 1, blockedCount: 0 },
            obligations: { openCount: 1 },
            coding: { activeCount: 1, blockedCount: 0 },
          },
          {
            agentName: "alpha",
            enabled: true,
            freshness: { status: "fresh", latestActivityAt: "2026-03-30T07:32:00.000Z", ageMs: 180_000 },
            degraded: { status: "degraded", issues: [{ code: "task-parse-error", detail: "bad frontmatter" }] },
            tasks: { liveCount: 2, blockedCount: 1 },
            obligations: { openCount: 2 },
            coding: { activeCount: 0, blockedCount: 1 },
          },
          {
            agentName: "gamma",
            enabled: false,
            freshness: { status: "stale", latestActivityAt: "2026-03-28T07:34:00.000Z", ageMs: 172_800_000 },
            degraded: { status: "ok", issues: [] },
            tasks: { liveCount: 0, blockedCount: 0 },
            obligations: { openCount: 0 },
            coding: { activeCount: 0, blockedCount: 0 },
          },
        ],
      },
      daemon: {
        status: "running",
        health: "warn",
        mode: "dev",
        socketPath: "/tmp/ouro.sock",
        outlookUrl: "http://127.0.0.1:4310/outlook",
        entryPath: "/mock/repo/dist/heart/daemon/daemon-entry.js",
        workerCount: 2,
        senseCount: 5,
      },
    })

    expect(view.overview).toEqual(expect.objectContaining({
      productName: "Ouro Outlook",
      primaryEntryPoint: "http://127.0.0.1:4310/outlook",
      daemon: expect.objectContaining({
        status: "running",
        health: "warn",
        mode: "dev",
        workerCount: 2,
        senseCount: 5,
      }),
      runtime: expect.objectContaining({
        version: "0.1.0-alpha.109",
        repoRoot: "/mock/repo",
      }),
      freshness: expect.objectContaining({ status: "fresh" }),
      degraded: expect.objectContaining({ status: "degraded" }),
      totals: {
        agents: 3,
        enabledAgents: 2,
        degradedAgents: 1,
        staleAgents: 1,
        liveTasks: 3,
        blockedTasks: 1,
        openObligations: 3,
        activeCodingAgents: 1,
        blockedCodingAgents: 1,
      },
      entrypoints: [
        { kind: "web", label: "Open Outlook", target: "http://127.0.0.1:4310/outlook" },
        { kind: "cli", label: "CLI JSON", target: "ouro outlook --json" },
      ],
    }))

    expect(view.agents.map((agent) => agent.agentName)).toEqual(["alpha", "gamma", "beta"])
    expect(view.agents.map((agent) => agent.attention)).toEqual([
      expect.objectContaining({ level: "degraded", label: "Needs intervention" }),
      expect.objectContaining({ level: "stale", label: "Needs reorientation" }),
      expect.objectContaining({ level: "active", label: "In motion" }),
    ])
  })

  it("treats healthy idle machines as calm and keeps agent order stable within the same attention band", async () => {
    const { buildOutlookMachineView } = await import("../../../heart/daemon/outlook-view")

    const view = buildOutlookMachineView({
      machine: {
        productName: "Ouro Outlook",
        observedAt: "2026-03-30T07:35:00.000Z",
        runtime: {
          version: "0.1.0-alpha.109",
          lastUpdated: "2026-03-30T00:30:24.000Z",
          repoRoot: "/mock/repo",
          configFingerprint: "cfg-123",
        },
        agentCount: 2,
        freshness: {
          status: "unknown",
          latestActivityAt: null,
          ageMs: null,
        },
        degraded: {
          status: "ok",
          issues: [],
        },
        agents: [
          {
            agentName: "alpha",
            enabled: true,
            freshness: { status: "unknown", latestActivityAt: null, ageMs: null },
            degraded: { status: "ok", issues: [] },
            tasks: { liveCount: 0, blockedCount: 0 },
            obligations: { openCount: 0 },
            coding: { activeCount: 0, blockedCount: 0 },
          },
          {
            agentName: "beta",
            enabled: true,
            freshness: { status: "unknown", latestActivityAt: null, ageMs: null },
            degraded: { status: "ok", issues: [] },
            tasks: { liveCount: 0, blockedCount: 0 },
            obligations: { openCount: 0 },
            coding: { activeCount: 0, blockedCount: 0 },
          },
        ],
      },
      daemon: {
        status: "running",
        health: "ok",
        mode: "production",
        socketPath: "/tmp/ouro.sock",
        outlookUrl: "http://127.0.0.1:4310/outlook",
        entryPath: "/mock/repo/dist/heart/daemon/daemon-entry.js",
        workerCount: 0,
        senseCount: 0,
      },
    })

    expect(view.overview.mood).toBe("calm")
    expect(view.agents.map((agent) => agent.agentName)).toEqual(["alpha", "beta"])
    expect(view.agents.every((agent) => agent.attention.level === "idle")).toBe(true)
  })

  it("marks stale but non-degraded machines as watchful and blocked agents as blocked", async () => {
    const { buildOutlookMachineView } = await import("../../../heart/daemon/outlook-view")

    const view = buildOutlookMachineView({
      machine: {
        productName: "Ouro Outlook",
        observedAt: "2026-03-30T07:35:00.000Z",
        runtime: {
          version: "0.1.0-alpha.109",
          lastUpdated: "2026-03-30T00:30:24.000Z",
          repoRoot: "/mock/repo",
          configFingerprint: "cfg-123",
        },
        agentCount: 1,
        freshness: {
          status: "stale",
          latestActivityAt: "2026-03-28T07:35:00.000Z",
          ageMs: 172_800_000,
        },
        degraded: {
          status: "ok",
          issues: [],
        },
        agents: [
          {
            agentName: "alpha",
            enabled: true,
            freshness: { status: "fresh", latestActivityAt: "2026-03-30T07:35:00.000Z", ageMs: 0 },
            degraded: { status: "ok", issues: [] },
            tasks: { liveCount: 1, blockedCount: 1 },
            obligations: { openCount: 0 },
            coding: { activeCount: 0, blockedCount: 0 },
          },
        ],
      },
      daemon: {
        status: "running",
        health: "ok",
        mode: "production",
        socketPath: "/tmp/ouro.sock",
        outlookUrl: "http://127.0.0.1:4310/outlook",
        entryPath: "/mock/repo/dist/heart/daemon/daemon-entry.js",
        workerCount: 1,
        senseCount: 1,
      },
    })

    expect(view.overview.mood).toBe("watchful")
    expect(view.agents).toEqual([
      expect.objectContaining({
        agentName: "alpha",
        attention: {
          level: "blocked",
          label: "Blocked",
        },
      }),
    ])
  })
})
