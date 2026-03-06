import type OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import { emitNervesEvent } from "../nerves/runtime";

export interface MemoryStorePaths {
  rootDir: string;
  factsPath: string;
  entitiesPath: string;
  dailyDir: string;
}

export interface MemoryFact {
  id: string;
  text: string;
  source: string;
  createdAt: string;
  embedding: number[];
}

export interface MemoryWriteResult {
  added: number;
  skipped: number;
}

const HIGHLIGHT_PREFIX = /^\s*(?:remember|learned)\s*:\s*(.+)\s*$/i;
const DEDUP_THRESHOLD = 0.6;

export function ensureMemoryStorePaths(rootDir: string): MemoryStorePaths {
  const factsPath = path.join(rootDir, "facts.jsonl");
  const entitiesPath = path.join(rootDir, "entities.json");
  const dailyDir = path.join(rootDir, "daily");

  fs.mkdirSync(rootDir, { recursive: true });
  fs.mkdirSync(dailyDir, { recursive: true });
  if (!fs.existsSync(factsPath)) fs.writeFileSync(factsPath, "", "utf8");
  if (!fs.existsSync(entitiesPath)) fs.writeFileSync(entitiesPath, "{}\n", "utf8");

  emitNervesEvent({
    component: "mind",
    event: "mind.memory_paths_ready",
    message: "memory store paths ready",
    meta: { rootDir },
  });
  return { rootDir, factsPath, entitiesPath, dailyDir };
}

export function extractMemoryHighlights(messages: OpenAI.ChatCompletionMessageParam[]): string[] {
  const highlights: string[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    if (typeof message.content !== "string") continue;
    for (const line of message.content.split("\n")) {
      const match = line.match(HIGHLIGHT_PREFIX);
      if (!match) continue;
      const text = match[1].trim();
      if (text.length > 0) highlights.push(text);
    }
  }
  emitNervesEvent({
    component: "mind",
    event: "mind.memory_extract",
    message: "extracted memory highlights",
    meta: { count: highlights.length },
  });
  return highlights;
}

function overlapScore(left: string, right: string): number {
  const leftWords = new Set(
    left
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter(Boolean),
  );
  const rightWords = new Set(
    right
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter(Boolean),
  );
  if (leftWords.size === 0 || rightWords.size === 0) return 0;
  let common = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) common++;
  }
  return common / Math.min(leftWords.size, rightWords.size);
}

function readExistingFacts(factsPath: string): MemoryFact[] {
  if (!fs.existsSync(factsPath)) return [];
  const raw = fs.readFileSync(factsPath, "utf8").trim();
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => JSON.parse(line) as MemoryFact);
}

export function appendFactsWithDedup(stores: MemoryStorePaths, incoming: MemoryFact[]): MemoryWriteResult {
  const existing = readExistingFacts(stores.factsPath);
  const all = [...existing];
  let added = 0;
  let skipped = 0;

  for (const fact of incoming) {
    const duplicate = all.some((prior) => overlapScore(prior.text, fact.text) > DEDUP_THRESHOLD);
    if (duplicate) {
      skipped++;
      continue;
    }
    all.push(fact);
    added++;
    fs.appendFileSync(stores.factsPath, `${JSON.stringify(fact)}\n`, "utf8");
  }

  emitNervesEvent({
    component: "mind",
    event: "mind.memory_write",
    message: "memory write completed",
    meta: { added, skipped },
  });
  return { added, skipped };
}
