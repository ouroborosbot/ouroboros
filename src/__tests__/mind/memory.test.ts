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
});
