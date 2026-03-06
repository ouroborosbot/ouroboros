import fs from "fs"
import path from "path"
import { emitNervesEvent } from "../nerves/runtime"
import type { EntityIndex, MemoryFact } from "./memory"

export interface KnowledgeGraphSnapshotInput {
  peopleDir: string
  companiesDir: string
  projectsDir: string
}

export interface KnowledgeGraphSnapshot {
  facts: MemoryFact[]
  entities: EntityIndex
}

export interface KnowledgeGraphOutputPaths {
  factsPath: string
  entitiesPath: string
}

interface KnowledgeGraphItem {
  id?: string
  fact?: string
  timestamp?: string
  status?: string
}

type KnowledgeDomain = "people" | "companies" | "projects"

const DOMAINS: ReadonlyArray<readonly [KnowledgeDomain, keyof KnowledgeGraphSnapshotInput]> = [
  ["people", "peopleDir"],
  ["companies", "companiesDir"],
  ["projects", "projectsDir"],
]

function listEntitySlugs(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return []
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

function normalizeSummary(raw: string): string {
  const normalized = raw.replace(/\\n/g, "\n")
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const content = lines[0]?.startsWith("#") ? lines.slice(1) : lines
  return content.join(" ").trim()
}

function readSummary(entityDir: string): string | null {
  const summaryPath = path.join(entityDir, "summary.md")
  if (!fs.existsSync(summaryPath)) return null
  const raw = fs.readFileSync(summaryPath, "utf8")
  const summary = normalizeSummary(raw)
  return summary.length > 0 ? summary : null
}

function readItems(entityDir: string): KnowledgeGraphItem[] {
  const itemsPath = path.join(entityDir, "items.json")
  if (!fs.existsSync(itemsPath)) return []

  try {
    const parsed = JSON.parse(fs.readFileSync(itemsPath, "utf8")) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed as KnowledgeGraphItem[]
  } catch {
    return []
  }
}

function isActive(status: string | undefined): boolean {
  if (!status) return true
  return status.trim().toLowerCase() === "active"
}

function normalizeTimestamp(value: string | undefined, fallbackIso: string): string {
  const trimmed = value?.trim()
  if (!trimmed) return fallbackIso
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00.000Z`
  return trimmed
}

function createFact(id: string, text: string, source: string, createdAt: string): MemoryFact {
  return {
    id,
    text,
    source,
    createdAt,
    embedding: [],
  }
}

export function buildKnowledgeGraphMemorySnapshot(
  input: KnowledgeGraphSnapshotInput,
  generatedAt = new Date().toISOString(),
): KnowledgeGraphSnapshot {
  const facts: MemoryFact[] = []
  const entities: EntityIndex = {}

  for (const [domain, key] of DOMAINS) {
    const rootDir = input[key]
    for (const slug of listEntitySlugs(rootDir)) {
      const entityDir = path.join(rootDir, slug)
      const factIds: string[] = []
      let lastSeenAt = generatedAt

      const summary = readSummary(entityDir)
      if (summary) {
        const fact = createFact(
          `${domain}:${slug}:summary`,
          summary,
          `clawd:${domain}:${slug}:summary`,
          generatedAt,
        )
        facts.push(fact)
        factIds.push(fact.id)
        lastSeenAt = fact.createdAt
      }

      for (const item of readItems(entityDir)) {
        if (!isActive(item.status)) continue
        const text = item.fact?.trim()
        if (!text) continue

        const itemId = item.id?.trim() || `item-${factIds.length + 1}`
        const createdAt = normalizeTimestamp(item.timestamp, generatedAt)
        const fact = createFact(
          `${domain}:${slug}:${itemId}`,
          text,
          `clawd:${domain}:${slug}:items`,
          createdAt,
        )
        facts.push(fact)
        factIds.push(fact.id)
        lastSeenAt = createdAt
      }

      if (factIds.length > 0) {
        entities[slug] = {
          count: factIds.length,
          factIds,
          lastSeenAt,
        }
      }
    }
  }

  emitNervesEvent({
    component: "mind",
    event: "mind.knowledge_graph_import",
    message: "built memory snapshot from knowledge graph",
    meta: {
      fact_count: facts.length,
      entity_count: Object.keys(entities).length,
    },
  })

  return { facts, entities }
}

export function writeKnowledgeGraphMemorySnapshot(snapshot: KnowledgeGraphSnapshot, output: KnowledgeGraphOutputPaths): void {
  fs.mkdirSync(path.dirname(output.factsPath), { recursive: true })
  fs.mkdirSync(path.dirname(output.entitiesPath), { recursive: true })

  const factsBody = snapshot.facts.map((fact) => JSON.stringify(fact)).join("\n")
  fs.writeFileSync(output.factsPath, factsBody.length > 0 ? `${factsBody}\n` : "", "utf8")
  fs.writeFileSync(output.entitiesPath, `${JSON.stringify(snapshot.entities, null, 2)}\n`, "utf8")

  emitNervesEvent({
    component: "mind",
    event: "mind.knowledge_graph_write",
    message: "wrote knowledge graph snapshot into memory store",
    meta: {
      facts_path: output.factsPath,
      entities_path: output.entitiesPath,
      fact_count: snapshot.facts.length,
      entity_count: Object.keys(snapshot.entities).length,
    },
  })
}

export function importKnowledgeGraphIntoMemory(
  input: KnowledgeGraphSnapshotInput,
  output: KnowledgeGraphOutputPaths,
  generatedAt = new Date().toISOString(),
): KnowledgeGraphSnapshot {
  const snapshot = buildKnowledgeGraphMemorySnapshot(input, generatedAt)
  writeKnowledgeGraphMemorySnapshot(snapshot, output)
  return snapshot
}
