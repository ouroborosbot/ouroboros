import fs from "fs"
import os from "os"
import path from "path"
import { describe, expect, it } from "vitest"

import { buildKnowledgeGraphMemorySnapshot } from "../../mind/knowledge-graph-import"

function writeEntity(baseDir: string, slug: string, summary: string, items: unknown): void {
  const dir = path.join(baseDir, slug)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "summary.md"), summary, "utf8")
  fs.writeFileSync(path.join(dir, "items.json"), JSON.stringify(items, null, 2), "utf8")
}

describe("buildKnowledgeGraphMemorySnapshot", () => {
  it("converts representative people/company/project entities into memory facts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kg-import-"))
    const peopleDir = path.join(root, "people")
    const companiesDir = path.join(root, "companies")
    const projectsDir = path.join(root, "projects")

    writeEntity(
      peopleDir,
      "ari",
      "# Ari\n\nPrimary partner and collaborator.",
      [
        {
          id: "ari-001",
          fact: "Ari prefers concise status updates",
          timestamp: "2026-02-20",
          status: "active",
        },
        {
          id: "ari-002",
          fact: "Old preference superseded",
          timestamp: "2025-12-01",
          status: "superseded",
        },
      ],
    )

    writeEntity(
      companiesDir,
      "spoonjoy",
      "# Spoonjoy\n\nAri's active product project.",
      [
        {
          id: "spoonjoy-001",
          fact: "Spoonjoy uses Cloudflare services",
          timestamp: "2026-02-18",
          status: "active",
        },
      ],
    )

    writeEntity(
      projectsDir,
      "azure-openclaw",
      "Azure OpenClaw migration project",
      [
        {
          id: "aoc-001",
          fact: "Project is in implementation planning",
          timestamp: "2026-02-19",
          status: "active",
        },
      ],
    )

    const result = buildKnowledgeGraphMemorySnapshot(
      {
        peopleDir,
        companiesDir,
        projectsDir,
      },
      "2026-03-05T21:30:00.000Z",
    )

    const ids = result.facts.map((fact) => fact.id)
    expect(ids).toContain("people:ari:summary")
    expect(ids).toContain("people:ari:ari-001")
    expect(ids).not.toContain("people:ari:ari-002")
    expect(ids).toContain("companies:spoonjoy:summary")
    expect(ids).toContain("projects:azure-openclaw:summary")

    const summaryFact = result.facts.find((fact) => fact.id === "people:ari:summary")
    expect(summaryFact?.text).toContain("Primary partner and collaborator.")

    const entityKeys = Object.keys(result.entities).sort()
    expect(entityKeys).toEqual(["ari", "azure-openclaw", "spoonjoy"])
    expect(result.entities.ari.count).toBe(2)
    expect(result.entities.spoonjoy.count).toBe(2)
    expect(result.entities["azure-openclaw"].count).toBe(2)
  })

  it("handles missing items.json by falling back to summary-only facts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kg-import-missing-"))
    const peopleDir = path.join(root, "people")
    fs.mkdirSync(path.join(peopleDir, "blue"), { recursive: true })
    fs.writeFileSync(path.join(peopleDir, "blue", "summary.md"), "# Blue\n\nMini Australian Shepherd", "utf8")

    const result = buildKnowledgeGraphMemorySnapshot(
      {
        peopleDir,
        companiesDir: path.join(root, "companies"),
        projectsDir: path.join(root, "projects"),
      },
      "2026-03-05T21:30:00.000Z",
    )

    expect(result.facts).toHaveLength(1)
    expect(result.facts[0].id).toBe("people:blue:summary")
    expect(result.entities.blue.count).toBe(1)
  })
})
