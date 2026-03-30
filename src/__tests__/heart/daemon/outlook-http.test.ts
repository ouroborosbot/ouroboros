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
      renderApp: ({ machine }) => `<!doctype html><title>${machine.productName}</title>`,
    })

    expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

    const html = await fetch(`${server.origin}/outlook`).then((response) => response.text())
    expect(html).toContain("Ouro Outlook")

    const machine = await fetch(`${server.origin}/outlook/api/machine`).then((response) => response.json())
    expect(machine).toEqual(expect.objectContaining({ productName: "Ouro Outlook" }))

    const agent = await fetch(`${server.origin}/outlook/api/agents/slugger`).then((response) => response.json())
    expect(agent).toEqual(expect.objectContaining({ agentName: "slugger" }))

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
      readAgentState: () => null,
    })

    const html = await fetch(`${server.origin}/outlook/`).then((response) => response.text())

    expect(html).toContain("&lt;Outlook&gt; &amp; &quot;Co&quot;")
    expect(html).toContain(`${server.origin}/outlook/api/machine`)
    expect(html).toContain("&quot;productName&quot;: &quot;Ouro &lt;Outlook&gt; &amp; \\&quot;Co\\&quot;&quot;")

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
