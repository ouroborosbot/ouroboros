import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../repertoire/ado-client", () => ({
  adoRequest: vi.fn(),
  queryWorkItems: vi.fn(),
  discoverOrganizations: vi.fn(),
  discoverProjects: vi.fn(),
}))

vi.mock("../../repertoire/ado-context", () => ({
  resolveAdoContext: vi.fn(),
}))

import { adoRequest } from "../../repertoire/ado-client"
import { resolveAdoContext } from "../../repertoire/ado-context"
import { adoSemanticToolDefinitions } from "../../repertoire/ado-semantic"

function findTool(name: string) {
  return adoSemanticToolDefinitions.find(d => d.tool.function.name === name)
}

function makeCtx(overrides?: any) {
  return {
    adoToken: "test-token",
    signin: vi.fn(),
    context: {
      identity: { id: "uuid-1", displayName: "Jordan", externalIds: [{ provider: "aad" as const, externalId: "jordan@contoso.com", tenantId: "t1", linkedAt: "2026-01-01" }], tenantMemberships: ["t1"], createdAt: "2026-01-01", updatedAt: "2026-01-01", schemaVersion: 1 },
      channel: { channel: "teams" as const, availableIntegrations: ["ado" as const, "graph" as const], supportsMarkdown: true, supportsStreaming: true, supportsRichCards: true, maxMessageLength: 28000 },
      memory: null,
    },
    ...overrides,
  }
}

describe("ado_backlog_list tool", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("is registered as a ToolDefinition with integration 'ado'", () => {
    const def = findTool("ado_backlog_list")
    expect(def).toBeDefined()
    expect(def!.integration).toBe("ado")
  })

  it("returns enriched work items with hierarchy, type, parent, assignee", async () => {
    vi.mocked(resolveAdoContext).mockResolvedValue({ ok: true, organization: "contoso", project: "Platform" })
    // WIQL returns IDs
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({
      workItems: [{ id: 100 }, { id: 101 }, { id: 102 }],
    }))
    // Batch fetch returns enriched items
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({
      value: [
        { id: 100, fields: { "System.Title": "Epic One", "System.WorkItemType": "Epic", "System.State": "Active", "System.AssignedTo": { displayName: "Jordan" }, "System.AreaPath": "Platform\\Team A", "System.IterationPath": "Sprint 1", "System.Parent": null } },
        { id: 101, fields: { "System.Title": "Story One", "System.WorkItemType": "User Story", "System.State": "New", "System.AssignedTo": null, "System.AreaPath": "Platform\\Team A", "System.IterationPath": "Sprint 1", "System.Parent": 100 } },
        { id: 102, fields: { "System.Title": "Task One", "System.WorkItemType": "Task", "System.State": "Active", "System.AssignedTo": { displayName: "Sam" }, "System.AreaPath": "Platform\\Team A", "System.IterationPath": "Sprint 1", "System.Parent": 101 } },
      ],
    }))

    const def = findTool("ado_backlog_list")!
    const result = await def.handler({}, makeCtx())
    const parsed = JSON.parse(result)

    expect(parsed.items).toHaveLength(3)
    expect(parsed.items[0].id).toBe(100)
    expect(parsed.items[0].type).toBe("Epic")
    expect(parsed.items[0].title).toBe("Epic One")
    expect(parsed.items[0].assignedTo).toBe("Jordan")
    expect(parsed.items[0].parent).toBeNull()
    expect(parsed.items[1].parent).toBe(100)
    expect(parsed.items[2].parent).toBe(101)
  })

  it("filters by area path", async () => {
    vi.mocked(resolveAdoContext).mockResolvedValue({ ok: true, organization: "contoso", project: "Platform" })
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({ workItems: [] }))

    const def = findTool("ado_backlog_list")!
    await def.handler({ areaPath: "Platform\\Team B" }, makeCtx())

    // Check the WIQL query includes area path filter
    const wiqlCall = vi.mocked(adoRequest).mock.calls[0]
    const body = JSON.parse(wiqlCall[4]!)
    expect(body.query).toContain("System.AreaPath")
    expect(body.query).toContain("Platform\\Team B")
  })

  it("filters by iteration", async () => {
    vi.mocked(resolveAdoContext).mockResolvedValue({ ok: true, organization: "contoso", project: "Platform" })
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({ workItems: [] }))

    const def = findTool("ado_backlog_list")!
    await def.handler({ iteration: "Sprint 2" }, makeCtx())

    const wiqlCall = vi.mocked(adoRequest).mock.calls[0]
    const body = JSON.parse(wiqlCall[4]!)
    expect(body.query).toContain("System.IterationPath")
    expect(body.query).toContain("Sprint 2")
  })

  it("filters by work item type", async () => {
    vi.mocked(resolveAdoContext).mockResolvedValue({ ok: true, organization: "contoso", project: "Platform" })
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({ workItems: [] }))

    const def = findTool("ado_backlog_list")!
    await def.handler({ workItemType: "Bug" }, makeCtx())

    const wiqlCall = vi.mocked(adoRequest).mock.calls[0]
    const body = JSON.parse(wiqlCall[4]!)
    expect(body.query).toContain("System.WorkItemType")
    expect(body.query).toContain("Bug")
  })

  it("filters by state", async () => {
    vi.mocked(resolveAdoContext).mockResolvedValue({ ok: true, organization: "contoso", project: "Platform" })
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({ workItems: [] }))

    const def = findTool("ado_backlog_list")!
    await def.handler({ state: "Active" }, makeCtx())

    const wiqlCall = vi.mocked(adoRequest).mock.calls[0]
    const body = JSON.parse(wiqlCall[4]!)
    expect(body.query).toContain("System.State")
    expect(body.query).toContain("Active")
  })

  it("filters by assignee", async () => {
    vi.mocked(resolveAdoContext).mockResolvedValue({ ok: true, organization: "contoso", project: "Platform" })
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({ workItems: [] }))

    const def = findTool("ado_backlog_list")!
    await def.handler({ assignee: "Jordan" }, makeCtx())

    const wiqlCall = vi.mocked(adoRequest).mock.calls[0]
    const body = JSON.parse(wiqlCall[4]!)
    expect(body.query).toContain("System.AssignedTo")
    expect(body.query).toContain("Jordan")
  })

  it("returns empty result with message when no work items found", async () => {
    vi.mocked(resolveAdoContext).mockResolvedValue({ ok: true, organization: "contoso", project: "Platform" })
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({ workItems: [] }))

    const def = findTool("ado_backlog_list")!
    const result = await def.handler({}, makeCtx())
    const parsed = JSON.parse(result)

    expect(parsed.items).toHaveLength(0)
    expect(parsed.message).toContain("No work items")
  })

  it("returns error when ADO context resolution fails", async () => {
    vi.mocked(resolveAdoContext).mockResolvedValue({ ok: false, error: "Multiple ADO organizations found" })

    const def = findTool("ado_backlog_list")!
    const result = await def.handler({}, makeCtx())
    expect(result).toContain("Multiple ADO organizations found")
  })

  it("returns error when no ADO token available", async () => {
    const def = findTool("ado_backlog_list")!
    const result = await def.handler({}, { ...makeCtx(), adoToken: undefined })
    expect(result).toContain("AUTH_REQUIRED")
  })

  it("handles API error from WIQL query", async () => {
    vi.mocked(resolveAdoContext).mockResolvedValue({ ok: true, organization: "contoso", project: "Platform" })
    vi.mocked(adoRequest).mockResolvedValueOnce("ERROR: 500 Internal Server Error")

    const def = findTool("ado_backlog_list")!
    const result = await def.handler({}, makeCtx())
    expect(result).toContain("ERROR")
  })

  it("uses ADO context helper for org/project resolution", async () => {
    vi.mocked(resolveAdoContext).mockResolvedValue({ ok: true, organization: "myorg", project: "myproject" })
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({ workItems: [] }))

    const def = findTool("ado_backlog_list")!
    await def.handler({ organization: "myorg", project: "myproject" }, makeCtx())

    expect(resolveAdoContext).toHaveBeenCalledWith("test-token", makeCtx().context, { organization: "myorg", project: "myproject" })
  })

  it("passes org and project from args to resolveAdoContext", async () => {
    vi.mocked(resolveAdoContext).mockResolvedValue({ ok: true, organization: "explicit-org", project: "explicit-proj" })
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({ workItems: [] }))

    const def = findTool("ado_backlog_list")!
    await def.handler({ organization: "explicit-org", project: "explicit-proj" }, makeCtx())

    // WIQL query should be sent to the resolved org
    const wiqlCall = vi.mocked(adoRequest).mock.calls[0]
    expect(wiqlCall[2]).toBe("explicit-org") // org parameter
    expect(wiqlCall[3]).toContain("explicit-proj") // path includes project
  })
})
