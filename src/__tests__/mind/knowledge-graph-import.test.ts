import fs from "fs"
import os from "os"
import path from "path"
import { describe, expect, it } from "vitest"

import {
  buildKnowledgeGraphMemorySnapshot,
  importKnowledgeGraphIntoMemory,
  writeKnowledgeGraphMemorySnapshot,
} from "../../mind/knowledge-graph-import"

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

  it("handles malformed and partial entity files while preserving only valid active facts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kg-import-branches-"))
    const peopleDir = path.join(root, "people")
    const companiesDir = path.join(root, "companies")
    const projectsDir = path.join(root, "projects")

    writeEntity(
      peopleDir,
      "zeta",
      "# Zeta\n\nSummary stays even when items.json is not an array.",
      { not: "an-array" },
    )

    const alphaDir = path.join(peopleDir, "alpha")
    fs.mkdirSync(alphaDir, { recursive: true })
    fs.writeFileSync(path.join(alphaDir, "summary.md"), "# Alpha\n\nSummary with malformed items payload.", "utf8")
    fs.writeFileSync(path.join(alphaDir, "items.json"), "{", "utf8")

    const betaDir = path.join(peopleDir, "beta")
    fs.mkdirSync(betaDir, { recursive: true })
    fs.writeFileSync(path.join(betaDir, "items.json"), JSON.stringify([
      {
        fact: "Fact without explicit id or timestamp",
      },
      {
        id: "beta-blank",
        fact: "   ",
        status: "active",
      },
      {
        id: "beta-iso",
        fact: "Fact with explicit ISO timestamp",
        timestamp: "2026-02-20T03:04:05.000Z",
        status: "active",
      },
    ], null, 2), "utf8")

    const gammaDir = path.join(peopleDir, "gamma")
    fs.mkdirSync(gammaDir, { recursive: true })
    fs.writeFileSync(path.join(gammaDir, "items.json"), "[]", "utf8")

    const deltaDir = path.join(peopleDir, "delta")
    fs.mkdirSync(deltaDir, { recursive: true })
    fs.writeFileSync(path.join(deltaDir, "summary.md"), "# Delta", "utf8")
    fs.writeFileSync(path.join(deltaDir, "items.json"), "[]", "utf8")

    const result = buildKnowledgeGraphMemorySnapshot(
      { peopleDir, companiesDir, projectsDir },
      "2026-03-05T21:45:00.000Z",
    )

    expect(Object.keys(result.entities).sort()).toEqual(["alpha", "beta", "zeta"])
    expect(result.entities.beta.factIds).toContain("people:beta:item-1")
    expect(result.entities.beta.factIds).toContain("people:beta:beta-iso")
    expect(result.facts.some((fact) => fact.id === "people:beta:beta-blank")).toBe(false)

    const fallbackFact = result.facts.find((fact) => fact.id === "people:beta:item-1")
    expect(fallbackFact?.createdAt).toBe("2026-03-05T21:45:00.000Z")

    const isoFact = result.facts.find((fact) => fact.id === "people:beta:beta-iso")
    expect(isoFact?.createdAt).toBe("2026-02-20T03:04:05.000Z")
  })
})

describe("knowledge graph snapshot writing", () => {
  it("writes snapshot files and supports the import wrapper", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kg-import-write-"))
    const peopleDir = path.join(root, "people")
    const companiesDir = path.join(root, "companies")
    const projectsDir = path.join(root, "projects")
    const outDir = path.join(root, "out")
    const factsPath = path.join(outDir, "facts.jsonl")
    const entitiesPath = path.join(outDir, "entities.json")

    writeEntity(
      peopleDir,
      "ari",
      "# Ari\n\nPrimary partner.",
      [
        {
          id: "ari-001",
          fact: "Ari prefers concise updates",
          timestamp: "2026-02-20",
          status: "active",
        },
      ],
    )

    const imported = importKnowledgeGraphIntoMemory(
      { peopleDir, companiesDir, projectsDir },
      { factsPath, entitiesPath },
      "2026-03-05T22:00:00.000Z",
    )

    expect(imported.facts.length).toBe(2)
    expect(fs.existsSync(factsPath)).toBe(true)
    expect(fs.existsSync(entitiesPath)).toBe(true)
    expect(fs.readFileSync(factsPath, "utf8")).toContain("people:ari:summary")
    expect(fs.readFileSync(entitiesPath, "utf8")).toContain("\"ari\"")

    const emptyFactsPath = path.join(outDir, "empty-facts.jsonl")
    const emptyEntitiesPath = path.join(outDir, "empty-entities.json")
    writeKnowledgeGraphMemorySnapshot(
      { facts: [], entities: {} },
      { factsPath: emptyFactsPath, entitiesPath: emptyEntitiesPath },
    )
    expect(fs.readFileSync(emptyFactsPath, "utf8")).toBe("")
    expect(fs.readFileSync(emptyEntitiesPath, "utf8")).toBe("{}\n")
  })
})
