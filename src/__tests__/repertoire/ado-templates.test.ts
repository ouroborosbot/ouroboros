import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../repertoire/ado-client", () => ({
  adoRequest: vi.fn(),
}))

import { adoRequest } from "../../repertoire/ado-client"
import { fetchProcessTemplate, deriveHierarchyRules, validateParentChild } from "../../repertoire/ado-templates"

describe("fetchProcessTemplate", () => {
  beforeEach(() => { vi.resetAllMocks() })

  it("fetches and returns Basic process template hierarchy", async () => {
    // Step 1: Project properties returns process template id
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({
      value: [{ name: "System.ProcessTemplateType", value: "adcc42ab-9882-485e-a3ed-7678f01f66bc" }],
    }))
    // Step 2: Process template details
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({
      name: "Basic",
      typeId: "adcc42ab-9882-485e-a3ed-7678f01f66bc",
    }))
    // Step 3: Work item types with hierarchy info
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({
      value: [
        { name: "Epic", color: "FF7B00" },
        { name: "Issue", color: "009CCC" },
        { name: "Task", color: "F2CB1D" },
      ],
    }))

    const result = await fetchProcessTemplate("test-token", "contoso", "MyProject")
    expect(result).not.toBeNull()
    expect(result!.templateName).toBe("Basic")
    expect(result!.workItemTypes).toContain("Epic")
    expect(result!.workItemTypes).toContain("Issue")
    expect(result!.workItemTypes).toContain("Task")
  })

  it("fetches and returns Agile process template hierarchy", async () => {
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({
      value: [{ name: "System.ProcessTemplateType", value: "agile-guid" }],
    }))
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({
      name: "Agile",
      typeId: "agile-guid",
    }))
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({
      value: [
        { name: "Epic", color: "FF7B00" },
        { name: "Feature", color: "773B93" },
        { name: "User Story", color: "009CCC" },
        { name: "Task", color: "F2CB1D" },
        { name: "Bug", color: "CC293D" },
      ],
    }))

    const result = await fetchProcessTemplate("test-token", "contoso", "MyProject")
    expect(result).not.toBeNull()
    expect(result!.templateName).toBe("Agile")
    expect(result!.workItemTypes).toContain("Feature")
    expect(result!.workItemTypes).toContain("User Story")
  })

  it("fetches and returns Scrum process template hierarchy", async () => {
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({
      value: [{ name: "System.ProcessTemplateType", value: "scrum-guid" }],
    }))
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({
      name: "Scrum",
      typeId: "scrum-guid",
    }))
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({
      value: [
        { name: "Epic", color: "FF7B00" },
        { name: "Feature", color: "773B93" },
        { name: "Product Backlog Item", color: "009CCC" },
        { name: "Task", color: "F2CB1D" },
        { name: "Bug", color: "CC293D" },
      ],
    }))

    const result = await fetchProcessTemplate("test-token", "contoso", "MyProject")
    expect(result).not.toBeNull()
    expect(result!.templateName).toBe("Scrum")
    expect(result!.workItemTypes).toContain("Product Backlog Item")
  })

  it("returns null when API call fails", async () => {
    vi.mocked(adoRequest).mockResolvedValueOnce("ERROR: 500 Internal Server Error")

    const result = await fetchProcessTemplate("test-token", "contoso", "MyProject")
    expect(result).toBeNull()
  })

  it("returns null when process template type property is missing", async () => {
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({
      value: [{ name: "SomeOtherProperty", value: "irrelevant" }],
    }))

    const result = await fetchProcessTemplate("test-token", "contoso", "MyProject")
    expect(result).toBeNull()
  })

  it("returns null when process template fetch fails", async () => {
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({
      value: [{ name: "System.ProcessTemplateType", value: "some-guid" }],
    }))
    vi.mocked(adoRequest).mockResolvedValueOnce("ERROR: 404 Not Found")

    const result = await fetchProcessTemplate("test-token", "contoso", "MyProject")
    expect(result).toBeNull()
  })

  it("returns null when work item types fetch fails", async () => {
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({
      value: [{ name: "System.ProcessTemplateType", value: "some-guid" }],
    }))
    vi.mocked(adoRequest).mockResolvedValueOnce(JSON.stringify({
      name: "Basic",
      typeId: "some-guid",
    }))
    vi.mocked(adoRequest).mockResolvedValueOnce("ERROR: 500 Server Error")

    const result = await fetchProcessTemplate("test-token", "contoso", "MyProject")
    expect(result).toBeNull()
  })

  it("handles exception thrown during API call", async () => {
    vi.mocked(adoRequest).mockRejectedValueOnce(new Error("network error"))

    const result = await fetchProcessTemplate("test-token", "contoso", "MyProject")
    expect(result).toBeNull()
  })
})

describe("deriveHierarchyRules", () => {
  it("derives Basic template hierarchy: Epic > Issue > Task", () => {
    const rules = deriveHierarchyRules("Basic", ["Epic", "Issue", "Task"])
    expect(rules["Epic"]).toContain("Issue")
    expect(rules["Issue"]).toContain("Task")
    expect(rules["Task"]).toEqual([])
  })

  it("derives Agile template hierarchy: Epic > Feature > User Story > Task", () => {
    const rules = deriveHierarchyRules("Agile", ["Epic", "Feature", "User Story", "Task", "Bug"])
    expect(rules["Epic"]).toContain("Feature")
    expect(rules["Feature"]).toContain("User Story")
    expect(rules["Feature"]).toContain("Bug")
    expect(rules["User Story"]).toContain("Task")
    expect(rules["User Story"]).toContain("Bug")
  })

  it("derives Scrum template hierarchy: Epic > Feature > PBI > Task", () => {
    const rules = deriveHierarchyRules("Scrum", ["Epic", "Feature", "Product Backlog Item", "Task", "Bug"])
    expect(rules["Epic"]).toContain("Feature")
    expect(rules["Feature"]).toContain("Product Backlog Item")
    expect(rules["Feature"]).toContain("Bug")
    expect(rules["Product Backlog Item"]).toContain("Task")
    expect(rules["Product Backlog Item"]).toContain("Bug")
  })

  it("returns empty rules for unknown template", () => {
    const rules = deriveHierarchyRules("CustomProcess", ["Ticket", "SubTicket"])
    // Should return an object with types as keys, each with empty children array
    expect(rules["Ticket"]).toEqual([])
    expect(rules["SubTicket"]).toEqual([])
  })
})

describe("validateParentChild", () => {
  it("returns valid for correct parent/child in Basic template", () => {
    const rules = deriveHierarchyRules("Basic", ["Epic", "Issue", "Task"])
    const result = validateParentChild(rules, "Epic", "Issue")
    expect(result.valid).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it("returns invalid for wrong parent/child in Basic template", () => {
    const rules = deriveHierarchyRules("Basic", ["Epic", "Issue", "Task"])
    const result = validateParentChild(rules, "Task", "Epic")
    expect(result.valid).toBe(false)
    expect(result.violations.length).toBeGreaterThan(0)
  })

  it("returns valid for Bug as child of User Story in Agile", () => {
    const rules = deriveHierarchyRules("Agile", ["Epic", "Feature", "User Story", "Task", "Bug"])
    const result = validateParentChild(rules, "User Story", "Bug")
    expect(result.valid).toBe(true)
  })

  it("returns invalid when parent type not in rules", () => {
    const rules = deriveHierarchyRules("Basic", ["Epic", "Issue", "Task"])
    const result = validateParentChild(rules, "UnknownType", "Task")
    expect(result.valid).toBe(false)
    expect(result.violations[0]).toContain("UnknownType")
  })

  it("returns violation explanation with allowed children", () => {
    const rules = deriveHierarchyRules("Basic", ["Epic", "Issue", "Task"])
    const result = validateParentChild(rules, "Epic", "Task")
    expect(result.valid).toBe(false)
    expect(result.violations[0]).toContain("Issue")  // should mention what IS allowed
  })
})
