import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

const mockGetAgentRoot = vi.fn()
const mockGetOpenAIEmbeddingsApiKey = vi.fn().mockReturnValue("")
vi.mock("../../heart/identity", () => ({
  getAgentName: () => "test-agent",
  getAgentRoot: () => mockGetAgentRoot(),
}))
vi.mock("../../heart/config", () => ({
  getOpenAIEmbeddingsApiKey: () => mockGetOpenAIEmbeddingsApiKey(),
}))
vi.mock("../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn(),
}))

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// ── recall tool handler: journal search ──────────────────────────

describe("recall tool: journal search via .index.json", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "recall-journal-"))
    mockGetAgentRoot.mockReturnValue(tmpDir)
    mockGetOpenAIEmbeddingsApiKey.mockReset().mockReturnValue("test-key")
    mockFetch.mockReset()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("includes journal results tagged [journal] from .index.json", async () => {
    // Create diary/ with a fact
    const diaryDir = path.join(tmpDir, "diary")
    fs.mkdirSync(diaryDir, { recursive: true })
    const fact = { id: "f1", text: "oauth2 is our auth method", source: "test", createdAt: "2026-03-25T00:00:00Z", embedding: [0.9, 0.1, 0.0] }
    fs.writeFileSync(path.join(diaryDir, "facts.jsonl"), JSON.stringify(fact) + "\n", "utf8")

    // Create journal/.index.json sidecar with an indexed file
    const journalDir = path.join(tmpDir, "journal")
    fs.mkdirSync(journalDir, { recursive: true })
    fs.writeFileSync(path.join(journalDir, "auth-thoughts.md"), "# Auth thoughts\nThinking about auth redesign...", "utf8")
    const journalIndex = [
      { filename: "auth-thoughts.md", embedding: [0.85, 0.15, 0.0], mtime: Date.now(), preview: "Auth thoughts" },
    ]
    fs.writeFileSync(path.join(journalDir, ".index.json"), JSON.stringify(journalIndex), "utf8")

    // Mock embedding API
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.9, 0.1, 0.0] }] }),
    })

    const { baseToolDefinitions } = await import("../../repertoire/tools-base")
    const recallTool = baseToolDefinitions.find((d) => d.tool.function.name === "recall")
    expect(recallTool).toBeDefined()

    const result = await recallTool!.handler({ query: "auth" }, undefined)
    // Should contain journal results tagged [journal]
    expect(result).toContain("[journal]")
    expect(result).toContain("auth-thoughts.md")
    expect(result).toContain("Auth thoughts")
  })

  it("tags diary results as [diary]", async () => {
    const diaryDir = path.join(tmpDir, "diary")
    fs.mkdirSync(diaryDir, { recursive: true })
    const fact = { id: "f1", text: "auth uses oauth2", source: "test", createdAt: "2026-03-25T00:00:00Z", embedding: [0.9, 0.1, 0.0] }
    fs.writeFileSync(path.join(diaryDir, "facts.jsonl"), JSON.stringify(fact) + "\n", "utf8")

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.9, 0.1, 0.0] }] }),
    })

    const { baseToolDefinitions } = await import("../../repertoire/tools-base")
    const recallTool = baseToolDefinitions.find((d) => d.tool.function.name === "recall")
    const result = await recallTool!.handler({ query: "auth" }, undefined)
    expect(result).toContain("[diary]")
  })

  it("journal results include filename and preview snippet", async () => {
    const journalDir = path.join(tmpDir, "journal")
    fs.mkdirSync(journalDir, { recursive: true })
    fs.writeFileSync(path.join(journalDir, "notes.md"), "# Project notes\nSome details...", "utf8")
    const journalIndex = [
      { filename: "notes.md", embedding: [0.8, 0.2, 0.0], mtime: Date.now(), preview: "Project notes" },
    ]
    fs.writeFileSync(path.join(journalDir, ".index.json"), JSON.stringify(journalIndex), "utf8")

    // No diary entries
    const diaryDir = path.join(tmpDir, "diary")
    fs.mkdirSync(diaryDir, { recursive: true })
    fs.writeFileSync(path.join(diaryDir, "facts.jsonl"), "", "utf8")

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.8, 0.2, 0.0] }] }),
    })

    const { baseToolDefinitions } = await import("../../repertoire/tools-base")
    const recallTool = baseToolDefinitions.find((d) => d.tool.function.name === "recall")
    const result = await recallTool!.handler({ query: "project" }, undefined)
    expect(result).toContain("[journal]")
    expect(result).toContain("notes.md")
    expect(result).toContain("Project notes")
  })

  it("returns empty when no journal index exists and no diary entries match", async () => {
    const diaryDir = path.join(tmpDir, "diary")
    fs.mkdirSync(diaryDir, { recursive: true })
    fs.writeFileSync(path.join(diaryDir, "facts.jsonl"), "", "utf8")

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.5, 0.5, 0.0] }] }),
    })

    const { baseToolDefinitions } = await import("../../repertoire/tools-base")
    const recallTool = baseToolDefinitions.find((d) => d.tool.function.name === "recall")
    const result = await recallTool!.handler({ query: "something" }, undefined)
    // When no matches, result should be empty or indicate no results
    expect(result).toBe("")
  })
})

// ── injectAssociativeRecall: diary + journal tagging ────────────

describe("injectAssociativeRecall diary+journal tagging", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "assoc-recall-journal-"))
    mockGetAgentRoot.mockReturnValue(tmpDir)
    mockGetOpenAIEmbeddingsApiKey.mockReset().mockReturnValue("test-key")
    mockFetch.mockReset()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("tags diary results as [diary] in recalled context", async () => {
    const diaryDir = path.join(tmpDir, "diary")
    fs.mkdirSync(diaryDir, { recursive: true })
    const fact = { id: "f1", text: "auth uses oauth2", source: "test", createdAt: "2026-03-25T00:00:00Z", embedding: [0.9, 0.1, 0.0] }
    fs.writeFileSync(path.join(diaryDir, "facts.jsonl"), JSON.stringify(fact) + "\n", "utf8")

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.9, 0.1, 0.0] }] }),
    })

    const { injectAssociativeRecall } = await import("../../mind/associative-recall")
    const messages: any[] = [
      { role: "system", content: "you are helpful" },
      { role: "user", content: "tell me about auth" },
    ]

    await injectAssociativeRecall(messages)
    expect(messages[0].content).toContain("[diary]")
    expect(messages[0].content).toContain("auth uses oauth2")
  })

  it("includes journal results tagged [journal] in recalled context", async () => {
    const diaryDir = path.join(tmpDir, "diary")
    fs.mkdirSync(diaryDir, { recursive: true })
    fs.writeFileSync(path.join(diaryDir, "facts.jsonl"), "", "utf8")

    // Create journal index with matching content
    const journalDir = path.join(tmpDir, "journal")
    fs.mkdirSync(journalDir, { recursive: true })
    fs.writeFileSync(path.join(journalDir, "api-design.md"), "# API Design\nThinking about endpoints...", "utf8")
    const journalIndex = [
      { filename: "api-design.md", embedding: [0.85, 0.15, 0.0], mtime: Date.now(), preview: "API Design" },
    ]
    fs.writeFileSync(path.join(journalDir, ".index.json"), JSON.stringify(journalIndex), "utf8")

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.85, 0.15, 0.0] }] }),
    })

    const { injectAssociativeRecall } = await import("../../mind/associative-recall")
    const messages: any[] = [
      { role: "system", content: "you are helpful" },
      { role: "user", content: "tell me about API design" },
    ]

    await injectAssociativeRecall(messages)
    expect(messages[0].content).toContain("[journal]")
    expect(messages[0].content).toContain("api-design.md")
  })

  it("merges diary and journal results sorted by score", async () => {
    const diaryDir = path.join(tmpDir, "diary")
    fs.mkdirSync(diaryDir, { recursive: true })
    const fact = { id: "f1", text: "auth is important", source: "test", createdAt: "2026-03-25T00:00:00Z", embedding: [0.8, 0.2, 0.0] }
    fs.writeFileSync(path.join(diaryDir, "facts.jsonl"), JSON.stringify(fact) + "\n", "utf8")

    const journalDir = path.join(tmpDir, "journal")
    fs.mkdirSync(journalDir, { recursive: true })
    fs.writeFileSync(path.join(journalDir, "auth-notes.md"), "# Auth notes", "utf8")
    const journalIndex = [
      { filename: "auth-notes.md", embedding: [0.9, 0.1, 0.0], mtime: Date.now(), preview: "Auth notes" },
    ]
    fs.writeFileSync(path.join(journalDir, ".index.json"), JSON.stringify(journalIndex), "utf8")

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.85, 0.15, 0.0] }] }),
    })

    const { injectAssociativeRecall } = await import("../../mind/associative-recall")
    const messages: any[] = [
      { role: "system", content: "you are helpful" },
      { role: "user", content: "tell me about auth" },
    ]

    await injectAssociativeRecall(messages)
    const content = messages[0].content
    expect(content).toContain("[diary]")
    expect(content).toContain("[journal]")
  })
})
