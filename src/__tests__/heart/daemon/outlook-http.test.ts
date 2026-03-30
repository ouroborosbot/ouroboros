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
})
