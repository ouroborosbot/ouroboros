import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  __memoryTestUtils,
  appendFactsWithDedup,
  ensureMemoryStorePaths,
  saveMemoryFact,
  searchMemoryFacts,
  type MemoryFact,
} from "../../mind/memory";
import { baseToolDefinitions } from "../../repertoire/tools-base";

describe("memory write path", () => {
  it("ensures memory data file paths exist in bundle psyche memory root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-paths-"));
    const stores = ensureMemoryStorePaths(root);
    expect(stores.factsPath).toBe(path.join(root, "facts.jsonl"));
    expect(stores.entitiesPath).toBe(path.join(root, "entities.json"));
    expect(stores.dailyDir).toBe(path.join(root, "daily"));
    expect(fs.existsSync(stores.dailyDir)).toBe(true);

    const second = ensureMemoryStorePaths(root);
    expect(second).toEqual(stores);
  });

  it("writes novel facts and skips near-duplicates (>60% overlap)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-dedup-"));
    const stores = ensureMemoryStorePaths(root);

    const first: MemoryFact = {
      id: "f1",
      text: "ari prefers concise updates with explicit command outputs",
      source: "unit-test",
      createdAt: "2026-03-06T01:00:00.000Z",
      embedding: [0.1, 0.2],
    };
    const duplicate: MemoryFact = {
      id: "f2",
      text: "ari prefers concise updates with explicit outputs",
      source: "unit-test",
      createdAt: "2026-03-06T01:01:00.000Z",
      embedding: [0.1, 0.2],
    };
    const novel: MemoryFact = {
      id: "f3",
      text: "slugger should run coverage gate after branch merge",
      source: "unit-test",
      createdAt: "2026-03-06T01:02:00.000Z",
      embedding: [0.2, 0.3],
    };

    const firstWrite = appendFactsWithDedup(stores, [first]);
    expect(firstWrite.added).toBe(1);
    expect(firstWrite.skipped).toBe(0);

    const secondWrite = appendFactsWithDedup(stores, [duplicate, novel]);
    expect(secondWrite.added).toBe(1);
    expect(secondWrite.skipped).toBe(1);

    const lines = fs.readFileSync(stores.factsPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
  });

  it("covers cosineSimilarity edge cases used by semantic scoring", () => {
    const { cosineSimilarity } = __memoryTestUtils;
    expect(cosineSimilarity([], [1])).toBe(0);
    expect(cosineSimilarity([1], [])).toBe(0);
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
    expect(cosineSimilarity([1, 0], [0, 0])).toBe(0);
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
  });

  it("handles missing facts file and zero-word facts safely", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-missing-facts-"));
    const stores = {
      rootDir: root,
      factsPath: path.join(root, "facts.jsonl"),
      entitiesPath: path.join(root, "entities.json"),
      dailyDir: path.join(root, "daily"),
    };
    fs.mkdirSync(stores.dailyDir, { recursive: true });
    fs.writeFileSync(stores.entitiesPath, "{}\n", "utf8");

    const result = appendFactsWithDedup(stores, [
      { id: "blank-1", text: "", source: "unit-test", createdAt: "2026-03-06T01:03:00.000Z", embedding: [0] },
      { id: "blank-2", text: "", source: "unit-test", createdAt: "2026-03-06T01:04:00.000Z", embedding: [0] },
    ]);
    expect(result.added).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it("rebuilds entity index when entities file is missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-missing-entities-"));
    const stores = {
      rootDir: root,
      factsPath: path.join(root, "facts.jsonl"),
      entitiesPath: path.join(root, "entities.json"),
      dailyDir: path.join(root, "daily"),
    };
    fs.mkdirSync(stores.dailyDir, { recursive: true });

    const result = appendFactsWithDedup(stores, [
      {
        id: "fact-missing-entities",
        text: "Ari tracks entity index recovery behavior",
        source: "unit-test",
        createdAt: "2026-03-06T01:05:00.000Z",
        embedding: [0.1, 0.2],
      },
    ]);

    expect(result).toEqual({ added: 1, skipped: 0 });
    const entities = JSON.parse(fs.readFileSync(stores.entitiesPath, "utf8"));
    expect(entities.ari.factIds).toContain("fact-missing-entities");
  });

  it("updates entity index and daily logs for newly added facts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-structures-"));
    const stores = ensureMemoryStorePaths(root);
    const facts: MemoryFact[] = [
      {
        id: "f-entity-1",
        text: "Ari improved the harness memory layer",
        source: "unit-test",
        createdAt: "2026-03-06T10:00:00.000Z",
        embedding: [0.1, 0.2],
      },
      {
        id: "f-entity-2",
        text: "Slugger improved memory coverage",
        source: "unit-test",
        createdAt: "2026-03-06T10:05:00.000Z",
        embedding: [0.2, 0.3],
      },
    ];

    const result = appendFactsWithDedup(stores, facts);
    expect(result).toEqual({ added: 2, skipped: 0 });

    const entities = JSON.parse(fs.readFileSync(stores.entitiesPath, "utf8"));
    expect(entities.ari.factIds).toContain("f-entity-1");
    expect(entities.slugger.factIds).toContain("f-entity-2");
    expect(entities.memory.factIds).toContain("f-entity-1");
    expect(entities.memory.factIds).toContain("f-entity-2");

    const dailyPath = path.join(stores.dailyDir, "2026-03-06.jsonl");
    expect(fs.existsSync(dailyPath)).toBe(true);
    const dailyLines = fs.readFileSync(dailyPath, "utf8").trim().split("\n");
    expect(dailyLines).toHaveLength(2);
  });

  it("recovers from malformed entities.json by rebuilding index", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-entities-malformed-"));
    const stores = ensureMemoryStorePaths(root);
    fs.writeFileSync(stores.entitiesPath, "{not-json", "utf8");

    const result = appendFactsWithDedup(stores, [
      {
        id: "f-malformed-1",
        text: "Ari documents restart behavior",
        source: "unit-test",
        createdAt: "2026-03-06T10:15:00.000Z",
        embedding: [0.4, 0.5],
      },
    ]);

    expect(result).toEqual({ added: 1, skipped: 0 });
    const entities = JSON.parse(fs.readFileSync(stores.entitiesPath, "utf8"));
    expect(entities.ari.factIds).toContain("f-malformed-1");
  });

  it("handles empty entities index files and avoids duplicate factIds for existing entities", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-entities-empty-"));
    const stores = ensureMemoryStorePaths(root);
    fs.writeFileSync(stores.entitiesPath, "", "utf8");

    const first: MemoryFact = {
      id: "same-id",
      text: "ari alpha",
      source: "unit-test",
      createdAt: "",
      embedding: [0.1],
    };
    const second: MemoryFact = {
      id: "same-id",
      text: "ari beta gamma",
      source: "unit-test",
      createdAt: "",
      embedding: [0.2],
    };

    const result = appendFactsWithDedup(stores, [first, second]);
    expect(result).toEqual({ added: 2, skipped: 0 });

    const entities = JSON.parse(fs.readFileSync(stores.entitiesPath, "utf8"));
    expect(entities.ari.count).toBe(2);
    expect(entities.ari.factIds).toEqual(["same-id"]);

    const unknownDayPath = path.join(stores.dailyDir, "unknown.jsonl");
    expect(fs.existsSync(unknownDayPath)).toBe(true);
  });

  it("keeps friend memory tools available alongside agent memory tools", () => {
    const names = baseToolDefinitions.map((def) => def.tool.function.name);
    expect(names).toContain("save_friend_note");
    expect(names).toContain("memory_search");
  });

  it("saveMemoryFact writes embedding vectors when provider succeeds", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-save-embedding-"));
    const fixedNow = "2026-03-06T12:00:00.000Z";

    const result = await saveMemoryFact({
      memoryRoot: root,
      text: "Ari prefers crisp progress updates",
      about: "ari",
      source: "tool:memory_save",
      now: () => new Date(fixedNow),
      idFactory: () => "fact-embedded",
      embeddingProvider: {
        embed: async () => [[0.2, 0.4, 0.6]],
      },
    });

    expect(result).toEqual({ added: 1, skipped: 0 });
    const factsPath = path.join(root, "facts.jsonl");
    const saved = JSON.parse(fs.readFileSync(factsPath, "utf8").trim()) as MemoryFact;
    expect(saved.id).toBe("fact-embedded");
    expect(saved.text).toBe("Ari prefers crisp progress updates");
    expect(saved.source).toBe("tool:memory_save");
    expect(saved.about).toBe("ari");
    expect(saved.createdAt).toBe(fixedNow);
    expect(saved.embedding).toEqual([0.2, 0.4, 0.6]);
  });

  it("saveMemoryFact degrades gracefully to empty embeddings when provider fails", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-save-fallback-"));

    const result = await saveMemoryFact({
      memoryRoot: root,
      text: "Store this even if embedding API is down",
      source: "tool:memory_save",
      idFactory: () => "fact-fallback",
      embeddingProvider: {
        embed: async () => {
          throw new Error("embedding service unavailable");
        },
      },
    });

    expect(result).toEqual({ added: 1, skipped: 0 });
    const factsPath = path.join(root, "facts.jsonl");
    const saved = JSON.parse(fs.readFileSync(factsPath, "utf8").trim()) as MemoryFact;
    expect(saved.id).toBe("fact-fallback");
    expect(saved.embedding).toEqual([]);
  });

  it("saveMemoryFact degrades gracefully when provider throws non-Error", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-save-fallback-string-"));

    const result = await saveMemoryFact({
      memoryRoot: root,
      text: "Store this even if embedding API throws a string",
      source: "tool:memory_save",
      idFactory: () => "fact-fallback-string",
      embeddingProvider: {
        embed: async () => {
          throw "embedding string failure";
        },
      },
    });

    expect(result).toEqual({ added: 1, skipped: 0 });
    const factsPath = path.join(root, "facts.jsonl");
    const saved = JSON.parse(fs.readFileSync(factsPath, "utf8").trim()) as MemoryFact;
    expect(saved.id).toBe("fact-fallback-string");
    expect(saved.embedding).toEqual([]);
  });

  it("saveMemoryFact falls back to empty embedding when provider returns no vectors", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-save-no-vectors-"));

    const result = await saveMemoryFact({
      memoryRoot: root,
      text: "Save even when embedding vector list is empty",
      source: "tool:memory_save",
      idFactory: () => "fact-empty-vectors",
      embeddingProvider: {
        embed: async () => [],
      },
    });

    expect(result).toEqual({ added: 1, skipped: 0 });
    const factsPath = path.join(root, "facts.jsonl");
    const saved = JSON.parse(fs.readFileSync(factsPath, "utf8").trim()) as MemoryFact;
    expect(saved.id).toBe("fact-empty-vectors");
    expect(saved.embedding).toEqual([]);
  });

  it("searchMemoryFacts falls back to substring matching for empty-embedding facts", async () => {
    const facts: MemoryFact[] = [
      {
        id: "fallback-hit",
        text: "Ari likes mushroom pizza",
        source: "cli",
        createdAt: "2026-03-06T00:00:00.000Z",
        embedding: [],
      },
      {
        id: "embedded-hit",
        text: "Ari tracks strict TypeScript rules",
        source: "teams",
        createdAt: "2026-03-06T00:01:00.000Z",
        embedding: [1, 0],
      },
    ];

    const results = await searchMemoryFacts("pizza", facts, {
      embed: async () => [[1, 0]],
    });

    expect(results.map((fact) => fact.id)).toContain("fallback-hit");
  });

  it("searchMemoryFacts falls back to substring when embedding provider throws", async () => {
    const facts: MemoryFact[] = [
      {
        id: "substring-hit",
        text: "Retry migration after the daemon restarts",
        source: "cli",
        createdAt: "2026-03-06T00:00:00.000Z",
        embedding: [0.2, 0.8],
      },
      {
        id: "substring-miss",
        text: "unrelated note",
        source: "cli",
        createdAt: "2026-03-06T00:00:01.000Z",
        embedding: [0.8, 0.2],
      },
    ];

    const results = await searchMemoryFacts("daemon", facts, {
      embed: async () => {
        throw new Error("query embedding failed");
      },
    });

    expect(results.map((fact) => fact.id)).toEqual(["substring-hit"]);
  });

  it("searchMemoryFacts returns empty list for blank queries", async () => {
    const results = await searchMemoryFacts("   ", [
      {
        id: "x",
        text: "anything",
        source: "cli",
        createdAt: "2026-03-06T00:00:00.000Z",
        embedding: [1, 0],
      },
    ]);
    expect(results).toEqual([]);
  });

  it("searchMemoryFacts falls back to substring when embedding provider throws non-Error", async () => {
    const facts: MemoryFact[] = [
      {
        id: "substring-hit",
        text: "Daemon restart fallback note",
        source: "cli",
        createdAt: "2026-03-06T00:00:00.000Z",
        embedding: [0.2, 0.8],
      },
    ];

    const results = await searchMemoryFacts("daemon", facts, {
      embed: async () => {
        throw "non-error throw";
      },
    });

    expect(results.map((fact) => fact.id)).toEqual(["substring-hit"]);
  });

  it("searchMemoryFacts falls back when default embedding provider is unavailable", async () => {
    vi.resetModules();
    vi.doMock("../../heart/config", async () => {
      const actual = await vi.importActual<typeof import("../../heart/config")>("../../heart/config");
      return { ...actual, getOpenAIEmbeddingsApiKey: () => "   " };
    });
    const { searchMemoryFacts: dynamicSearchMemoryFacts } = await import("../../mind/memory");

    const facts: MemoryFact[] = [
      {
        id: "daemon-hit",
        text: "Daemon keeps retrying this task",
        source: "cli",
        createdAt: "2026-03-06T00:00:00.000Z",
        embedding: [0.1, 0.2],
      },
      {
        id: "other",
        text: "completely unrelated memory",
        source: "cli",
        createdAt: "2026-03-06T00:00:01.000Z",
        embedding: [0.2, 0.1],
      },
    ];

    const results = await dynamicSearchMemoryFacts("daemon", facts);
    expect(results.map((fact) => fact.id)).toEqual(["daemon-hit"]);
  });

  it("searchMemoryFacts falls back when query embedding is missing/empty", async () => {
    const facts: MemoryFact[] = [
      {
        id: "fallback-hit",
        text: "Ari prefers daemon status updates",
        source: "cli",
        createdAt: "2026-03-06T00:00:00.000Z",
        embedding: [0.4, 0.6],
      },
      {
        id: "miss",
        text: "something else",
        source: "cli",
        createdAt: "2026-03-06T00:00:01.000Z",
        embedding: [0.6, 0.4],
      },
    ];

    const results = await searchMemoryFacts("daemon", facts, {
      embed: async () => [],
    });
    expect(results.map((fact) => fact.id)).toEqual(["fallback-hit"]);
  });

  it("searchMemoryFacts uses default OpenAI embedding provider and sorts scored results", async () => {
    vi.resetModules();
    vi.doMock("../../heart/config", async () => {
      const actual = await vi.importActual<typeof import("../../heart/config")>("../../heart/config");
      return { ...actual, getOpenAIEmbeddingsApiKey: () => "test-openai-key" };
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ data: [{ embedding: [1, 0] }] }),
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    try {
      const { searchMemoryFacts: dynamicSearchMemoryFacts } = await import("../../mind/memory");
      const facts: MemoryFact[] = [
        {
          id: "best",
          text: "alpha strongest match",
          source: "cli",
          createdAt: "2026-03-06T00:00:00.000Z",
          embedding: [1, 0],
        },
        {
          id: "weaker",
          text: "alpha weaker match",
          source: "cli",
          createdAt: "2026-03-06T00:00:01.000Z",
          embedding: [0.6, 0.8],
        },
        {
          id: "fallback",
          text: "alpha substring fallback",
          source: "cli",
          createdAt: "2026-03-06T00:00:02.000Z",
          embedding: [],
        },
      ];

      const results = await dynamicSearchMemoryFacts("alpha", facts);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(results.map((fact) => fact.id)).toEqual(["best", "weaker", "fallback"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("searchMemoryFacts falls back when default OpenAI embedding request is non-OK", async () => {
    vi.resetModules();
    vi.doMock("../../heart/config", async () => {
      const actual = await vi.importActual<typeof import("../../heart/config")>("../../heart/config");
      return { ...actual, getOpenAIEmbeddingsApiKey: () => "test-openai-key" };
    });

    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => ({ data: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    try {
      const { searchMemoryFacts: dynamicSearchMemoryFacts } = await import("../../mind/memory");
      const results = await dynamicSearchMemoryFacts("daemon", [
        {
          id: "fallback-hit",
          text: "daemon fallback entry",
          source: "cli",
          createdAt: "2026-03-06T00:00:00.000Z",
          embedding: [1, 0],
        },
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(results.map((fact) => fact.id)).toEqual(["fallback-hit"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("searchMemoryFacts falls back when default OpenAI embedding payload is malformed", async () => {
    vi.resetModules();
    vi.doMock("../../heart/config", async () => {
      const actual = await vi.importActual<typeof import("../../heart/config")>("../../heart/config");
      return { ...actual, getOpenAIEmbeddingsApiKey: () => "test-openai-key" };
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ data: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    try {
      const { searchMemoryFacts: dynamicSearchMemoryFacts } = await import("../../mind/memory");
      const results = await dynamicSearchMemoryFacts("daemon", [
        {
          id: "fallback-hit",
          text: "daemon fallback entry",
          source: "cli",
          createdAt: "2026-03-06T00:00:00.000Z",
          embedding: [1, 0],
        },
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(results.map((fact) => fact.id)).toEqual(["fallback-hit"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
