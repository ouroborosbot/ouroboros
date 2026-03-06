import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type OpenAI from "openai";
import {
  appendFactsWithDedup,
  extractMemoryHighlights,
  ensureMemoryStorePaths,
  type MemoryFact,
} from "../../mind/memory";
import { baseToolDefinitions } from "../../repertoire/tools-base";

describe("memory write path", () => {
  it("extracts highlights from user/assistant messages", () => {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "remember: ari prefers concise updates" },
      { role: "assistant", content: "learned: use branch-per-gate discipline" },
      { role: "assistant", content: "normal text that should be ignored" },
    ];
    const highlights = extractMemoryHighlights(messages);
    expect(highlights).toEqual([
      "ari prefers concise updates",
      "use branch-per-gate discipline",
    ]);
  });

  it("ignores non-string content and empty highlight payloads", () => {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "assistant", content: [{ type: "text", text: "remember: should be ignored" } as any] as any },
      { role: "user", content: "remember:   " },
      { role: "assistant", content: "learned:    " },
      { role: "assistant", content: "learned: keep strict TDD" },
    ];
    expect(extractMemoryHighlights(messages)).toEqual(["keep strict TDD"]);
  });

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
});
