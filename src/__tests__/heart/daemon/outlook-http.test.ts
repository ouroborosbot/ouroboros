import { describe, expect, it, vi } from "vitest"

vi.mock("../../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn(),
}))

describe("outlook http", () => {
  it("serves loopback-only HTML and JSON endpoints for Outlook", async () => {
    const { startOutlookHttpServer } = await import("../../../heart/daemon/outlook-http")

    const server = await startOutlookHttpServer({
      host: "127.0.0.1",
      port: 0,
      readMachineState: () => ({
        productName: "Ouro Outlook",
        agentCount: 1,
      }),
      readAgentState: (agentName: string) => (
        agentName === "slugger"
          ? { agentName: "slugger", productName: "Ouro Outlook" }
          : null
      ),
      readAgentView: (agentName: string) => (
        agentName === "slugger"
          ? {
              productName: "Ouro Outlook",
              interactionModel: "read-only",
              viewer: { kind: "human", innerDetail: "summary" },
              agent: { agentName: "slugger" },
            } as any
          : null
      ),
      renderApp: ({ machine }) => `<!doctype html><title>${machine.productName}</title>`,
    })

    expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

    const html = await fetch(`${server.origin}/outlook`).then((response) => response.text())
    expect(html).toContain("Ouro Outlook")

    const machine = await fetch(`${server.origin}/outlook/api/machine`).then((response) => response.json())
    expect(machine).toEqual(expect.objectContaining({ productName: "Ouro Outlook" }))

    const agent = await fetch(`${server.origin}/outlook/api/agents/slugger`).then((response) => response.json())
    expect(agent).toEqual(expect.objectContaining({
      interactionModel: "read-only",
      agent: expect.objectContaining({ agentName: "slugger" }),
    }))

    const missing = await fetch(`${server.origin}/outlook/api/agents/missing`)
    expect(missing.status).toBe(404)

    await server.stop()
  })

  it("renders the default app safely and normalizes trailing-slash Outlook routes", async () => {
    const { startOutlookHttpServer } = await import("../../../heart/daemon/outlook-http")

    const server = await startOutlookHttpServer({
      host: "127.0.0.1",
      port: 0,
      readMachineState: () => ({
        productName: "Ouro <Outlook> & \"Co\"",
        agentCount: 1,
      }),
      readMachineView: () => ({
        overview: {
          productName: "Ouro <Outlook> & \"Co\"",
          observedAt: "2026-03-30T07:35:00.000Z",
          primaryEntryPoint: "http://127.0.0.1:4310/outlook",
          daemon: {
            status: "running",
            health: "ok",
            mode: "production",
            socketPath: "/tmp/ouro.sock",
            outlookUrl: "http://127.0.0.1:4310/outlook",
            entryPath: "/mock/repo/dist/heart/daemon/daemon-entry.js",
            workerCount: 1,
            senseCount: 2,
          },
          runtime: {
            version: "0.1.0-alpha.109",
            lastUpdated: "2026-03-30T00:30:24.000Z",
            repoRoot: "/mock/repo",
            configFingerprint: "cfg-123",
          },
          freshness: {
            status: "fresh",
            latestActivityAt: "2026-03-30T07:34:00.000Z",
            ageMs: 60_000,
          },
          degraded: {
            status: "ok",
            issues: [],
          },
          totals: {
            agents: 1,
            enabledAgents: 1,
            degradedAgents: 0,
            staleAgents: 0,
            liveTasks: 1,
            blockedTasks: 0,
            openObligations: 0,
            activeCodingAgents: 1,
            blockedCodingAgents: 0,
          },
          mood: "calm",
          entrypoints: [
            { kind: "web", label: "Open Outlook", target: "http://127.0.0.1:4310/outlook" },
            { kind: "cli", label: "CLI JSON", target: "ouro outlook --json" },
          ],
        },
        agents: [
          {
            agentName: "slugger",
            enabled: true,
            freshness: { status: "fresh", latestActivityAt: "2026-03-30T07:34:00.000Z", ageMs: 60_000 },
            degraded: { status: "ok", issues: [] },
            tasks: { liveCount: 1, blockedCount: 0 },
            obligations: { openCount: 0 },
            coding: { activeCount: 1, blockedCount: 0 },
            attention: { level: "active", label: "In motion" },
          },
        ],
      }),
      readAgentState: () => null,
    })

    const html = await fetch(`${server.origin}/outlook/`).then((response) => response.text())

    expect(html).toContain("&lt;Outlook&gt; &amp; &quot;Co&quot;")
    expect(html).toContain("Machine Overview")
    expect(html).toContain("Regain the plot together.")
    expect(html).toContain("ouro outlook --json")
    expect(html).toContain('data-agent-name="slugger"')

    await server.stop()
  })

  it("returns a JSON 404 for unknown Outlook routes", async () => {
    const { startOutlookHttpServer } = await import("../../../heart/daemon/outlook-http")

    const server = await startOutlookHttpServer({
      host: "127.0.0.1",
      port: 0,
      readMachineState: () => ({
        productName: "Ouro Outlook",
        agentCount: 1,
      }),
      readAgentState: () => null,
      renderApp: () => "<!doctype html><title>Ouro Outlook</title>",
    })

    const response = await fetch(`${server.origin}/outlook/nope`)
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "unknown outlook path: /outlook/nope",
    })

    await server.stop()
  })

  it("uses the default direct-read hooks and default renderer when no options are provided", async () => {
    vi.resetModules()
    const readOutlookMachineState = vi.fn(() => ({
      productName: "Ouro Outlook",
      agentCount: 1,
    }))
    const readOutlookAgentState = vi.fn((agentName: string) => (
      agentName === "slugger"
        ? { agentName: "slugger", productName: "Ouro Outlook" }
        : null
    ))

    vi.doMock("../../../heart/daemon/outlook-read", () => ({
      readOutlookMachineState,
      readOutlookAgentState,
    }))

    const { startOutlookHttpServer } = await import("../../../heart/daemon/outlook-http")
    const server = await startOutlookHttpServer()

    expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

    const html = await fetch(`${server.origin}/outlook`).then((response) => response.text())
    expect(html).toContain("<h1>Ouro Outlook</h1>")

    const agent = await fetch(`${server.origin}/outlook/api/agents/slugger`).then((response) => response.json())
    expect(agent).toEqual(expect.objectContaining({ agentName: "slugger" }))

    const root = await fetch(server.origin)
    expect(root.status).toBe(404)
    await expect(root.json()).resolves.toEqual({
      ok: false,
      error: "unknown outlook path: /",
    })

    expect(readOutlookMachineState).toHaveBeenCalled()
    expect(readOutlookAgentState).toHaveBeenCalledWith("slugger")

    await server.stop()
    vi.doUnmock("../../../heart/daemon/outlook-read")
  })
})
