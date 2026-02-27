import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

import { queryWorkItems } from "../../engine/ado-client"

describe("queryWorkItems", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it("returns formatted work items on success", async () => {
    // First call: WIQL query returns work item IDs
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          workItems: [{ id: 123 }, { id: 456 }],
        }),
      })
      // Second call: fetch work item details
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [
            {
              id: 123,
              fields: {
                "System.Title": "Fix the bug",
                "System.State": "Active",
                "System.AssignedTo": { displayName: "Jane Doe" },
              },
            },
            {
              id: 456,
              fields: {
                "System.Title": "Add feature",
                "System.State": "New",
                "System.AssignedTo": { displayName: "John Smith" },
              },
            },
          ],
        }),
      })

    const result = await queryWorkItems("test-token", "myorg", "SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Active'")

    expect(result).toContain("123")
    expect(result).toContain("Fix the bug")
    expect(result).toContain("Active")
    expect(result).toContain("Jane Doe")
    expect(result).toContain("456")
    expect(result).toContain("Add feature")

    // Verify WIQL call
    expect(mockFetch).toHaveBeenCalledWith(
      "https://dev.azure.com/myorg/_apis/wit/wiql?api-version=7.1",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        }),
      }),
    )
  })

  it("returns message when no work items found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        workItems: [],
      }),
    })

    const result = await queryWorkItems("test-token", "myorg", "SELECT [System.Id] FROM WorkItems")
    expect(result).toContain("No work items found")
  })

  it("handles unassigned work items", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          workItems: [{ id: 789 }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [
            {
              id: 789,
              fields: {
                "System.Title": "Unassigned task",
                "System.State": "New",
                "System.AssignedTo": null,
              },
            },
          ],
        }),
      })

    const result = await queryWorkItems("test-token", "myorg", "query")
    expect(result).toContain("789")
    expect(result).toContain("Unassigned task")
    expect(result).toContain("Unassigned")
  })

  it("returns AUTH_REQUIRED on 401 from WIQL query", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    })

    const result = await queryWorkItems("bad-token", "myorg", "query")
    expect(result).toBe("AUTH_REQUIRED:ado")
  })

  it("returns AUTH_REQUIRED on 401 from work item details fetch", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ workItems: [{ id: 1 }] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      })

    const result = await queryWorkItems("token", "myorg", "query")
    expect(result).toBe("AUTH_REQUIRED:ado")
  })

  it("returns PERMISSION_DENIED on 403", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    })

    const result = await queryWorkItems("token", "myorg", "query")
    expect(result).toContain("PERMISSION_DENIED")
  })

  it("returns THROTTLED on 429", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    })

    const result = await queryWorkItems("token", "myorg", "query")
    expect(result).toContain("THROTTLED")
  })

  it("returns NETWORK_ERROR on fetch failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"))

    const result = await queryWorkItems("token", "myorg", "query")
    expect(result).toContain("NETWORK_ERROR")
  })
})
