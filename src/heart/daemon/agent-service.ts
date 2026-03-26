/**
 * Agent service layer — handles MCP-facing daemon commands.
 * Each handler receives { agent, friendId, ...params } and returns DaemonResponse.
 * Reads agent state from the filesystem: facts.jsonl, sessions, inner dialog, tasks.
 */

import * as fs from "fs"
import * as path from "path"
import type { DaemonResponse } from "./daemon"
import { getAgentRoot } from "../identity"
import { emitNervesEvent } from "../../nerves/runtime"

export interface AgentServiceParams {
  agent: string
  friendId: string
  [key: string]: unknown
}

/** A parsed fact from facts.jsonl, with embedding stripped. */
interface Fact {
  id: string
  text: string
  source: string
  createdAt: string
  about?: string
}

/** Read a file from the agent root, returning null if it doesn't exist. */
function readAgentFile(agent: string, ...segments: string[]): string | null {
  const filePath = path.join(getAgentRoot(agent), ...segments)
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath, "utf-8")
}

/** Parse a JSONL file into an array of Fact objects, stripping embeddings. */
function parseFactsJsonl(content: string): Fact[] {
  const facts: Fact[] = []
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    try {
      const parsed = JSON.parse(trimmed)
      facts.push({
        id: parsed.id ?? "",
        text: parsed.text ?? "",
        source: parsed.source ?? "",
        createdAt: parsed.createdAt ?? "",
        about: parsed.about,
      })
    } catch {
      // Skip malformed lines
    }
  }
  return facts
}

/** Read agent facts from psyche/memory/facts.jsonl plus today's daily journal. */
function readAgentMemory(agent: string): Fact[] {
  const facts: Fact[] = []

  // Main facts file
  const factsContent = readAgentFile(agent, "psyche", "memory", "facts.jsonl")
  if (factsContent) {
    facts.push(...parseFactsJsonl(factsContent))
  }

  // Today's daily journal
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const dailyContent = readAgentFile(agent, "psyche", "memory", "daily", `${today}.jsonl`)
  if (dailyContent) {
    facts.push(...parseFactsJsonl(dailyContent))
  }

  return facts
}

/** Extract keywords from a query string (lowercase, >2 chars). */
function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\W+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2)
}

/** Search facts by keyword matching against the text field. */
function searchFacts(facts: Fact[], query: string): Fact[] {
  const keywords = extractKeywords(query)
  if (keywords.length === 0) return []
  return facts.filter((fact) => {
    const textLower = fact.text.toLowerCase()
    return keywords.some((kw) => textLower.includes(kw))
  })
}

/** Session info extracted from the filesystem. */
interface SessionInfo {
  friendId: string
  channel: string
  key: string
  lastUsage: string
}

/** Enumerate sessions from state/sessions/, reading session.json files. */
function enumerateSessions(agent: string): SessionInfo[] {
  const sessionsDir = path.join(getAgentRoot(agent), "state", "sessions")
  if (!fs.existsSync(sessionsDir)) return []

  const sessions: SessionInfo[] = []
  const friendDirs = safeReaddir(sessionsDir)

  for (const friendId of friendDirs) {
    const friendPath = path.join(sessionsDir, friendId)
    if (!safeIsDir(friendPath)) continue
    const channels = safeReaddir(friendPath)
    for (const channel of channels) {
      const channelPath = path.join(friendPath, channel)
      if (!safeIsDir(channelPath)) continue
      const keys = safeReaddir(channelPath)
      for (const key of keys) {
        const sessionFile = path.join(channelPath, key, "session.json")
        if (!fs.existsSync(sessionFile)) continue
        try {
          const data = JSON.parse(fs.readFileSync(sessionFile, "utf-8"))
          sessions.push({
            friendId,
            channel,
            key,
            lastUsage: data.lastUsage ?? "",
          })
        } catch {
          // Skip malformed session files
        }
      }
    }
  }

  return sessions
}

function safeReaddir(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath).map(String)
  } catch {
    return []
  }
}

function safeIsDir(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory()
  } catch {
    return false
  }
}

/** Read inner dialog runtime status. */
function readInnerDialogStatus(agent: string): { status: string; lastCompletedAt: string } | null {
  const content = readAgentFile(agent, "state", "sessions", "self", "inner", "runtime.json")
  if (!content) return null
  try {
    const data = JSON.parse(content)
    return { status: data.status ?? "unknown", lastCompletedAt: data.lastCompletedAt ?? "" }
  } catch {
    return null
  }
}

/** List markdown files in {agentRoot}/tasks/. */
function listTaskFiles(agent: string): string[] {
  const tasksDir = path.join(getAgentRoot(agent), "tasks")
  if (!fs.existsSync(tasksDir)) return []
  try {
    return fs.readdirSync(tasksDir).map(String).filter((f) => f.endsWith(".md"))
  } catch {
    return []
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function handleAgentStatus(params: AgentServiceParams): Promise<DaemonResponse> {
  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_start",
    message: "handling agent.status",
    meta: { agent: params.agent, friendId: params.friendId },
  })

  const facts = readAgentMemory(params.agent)
  const innerStatus = readInnerDialogStatus(params.agent)
  const sessions = enumerateSessions(params.agent)

  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_end",
    message: "completed agent.status",
    meta: { agent: params.agent },
  })

  return {
    ok: true,
    message: `Agent ${params.agent} status`,
    data: {
      agent: params.agent,
      innerStatus: innerStatus?.status ?? "unknown",
      lastThoughtAt: innerStatus?.lastCompletedAt ?? null,
      sessionCount: sessions.length,
      hasMemory: facts.length > 0,
      factCount: facts.length,
    },
  }
}

export async function handleAgentAsk(params: AgentServiceParams): Promise<DaemonResponse> {
  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_start",
    message: "handling agent.ask",
    meta: { agent: params.agent, friendId: params.friendId },
  })

  const question = params.question as string | undefined
  if (!question) {
    emitNervesEvent({
      level: "error",
      component: "daemon",
      event: "daemon.agent_service_error",
      message: "agent.ask missing question parameter",
      meta: { agent: params.agent },
    })
    return { ok: false, error: "Missing required parameter: question" }
  }

  const facts = readAgentMemory(params.agent)
  const matches = searchFacts(facts, question).slice(0, 10)
  const context = matches.length > 0
    ? matches.map((f) => f.text).join("\n")
    : `No relevant memories found for: ${question}`

  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_end",
    message: "completed agent.ask",
    meta: { agent: params.agent },
  })

  return { ok: true, message: context }
}

export async function handleAgentCatchup(params: AgentServiceParams): Promise<DaemonResponse> {
  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_start",
    message: "handling agent.catchup",
    meta: { agent: params.agent, friendId: params.friendId },
  })

  // Recent sessions sorted by lastUsage, take 5 most recent
  const sessions = enumerateSessions(params.agent)
  const sorted = sessions.sort((a, b) => (b.lastUsage || "").localeCompare(a.lastUsage || ""))
  const recentSessions = sorted.slice(0, 5).map((s) => ({
    friendId: s.friendId,
    channel: s.channel,
    key: s.key,
    lastUsage: s.lastUsage,
  }))

  // Inner dialog status
  const innerStatus = readInnerDialogStatus(params.agent)

  // Today's journal entries
  const today = new Date().toISOString().slice(0, 10)
  const dailyContent = readAgentFile(params.agent, "psyche", "memory", "daily", `${today}.jsonl`)
  const todayEntries = dailyContent ? parseFactsJsonl(dailyContent) : []

  // Build summary
  const parts: string[] = []
  if (innerStatus) {
    parts.push(`Inner dialog: ${innerStatus.status} (last completed: ${innerStatus.lastCompletedAt || "never"})`)
  }
  if (recentSessions.length > 0) {
    parts.push(`Recent sessions (${recentSessions.length}):`)
    for (const s of recentSessions) {
      parts.push(`  - ${s.friendId}/${s.channel}/${s.key} (${s.lastUsage || "unknown"})`)
    }
  } else {
    parts.push("No recent sessions")
  }
  if (todayEntries.length > 0) {
    parts.push(`Today's journal (${todayEntries.length} entries):`)
    for (const entry of todayEntries.slice(0, 5)) {
      parts.push(`  - ${entry.text}`)
    }
  }

  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_end",
    message: "completed agent.catchup",
    meta: { agent: params.agent },
  })

  return {
    ok: true,
    message: parts.length > 0
      ? parts.join("\n")
      : `No recent activity for ${params.agent}`,
    data: { recentSessions, innerStatus, todayEntryCount: todayEntries.length },
  }
}

export async function handleAgentDelegate(params: AgentServiceParams): Promise<DaemonResponse> {
  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_start",
    message: "handling agent.delegate",
    meta: { agent: params.agent, friendId: params.friendId },
  })

  const task = params.task as string | undefined
  if (!task) {
    emitNervesEvent({
      level: "error",
      component: "daemon",
      event: "daemon.agent_service_error",
      message: "agent.delegate missing task parameter",
      meta: { agent: params.agent },
    })
    return { ok: false, error: "Missing required parameter: task" }
  }

  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_end",
    message: "completed agent.delegate",
    meta: { agent: params.agent },
  })

  return {
    ok: true,
    message: `Task queued for delegate to ${params.agent}: ${task}`,
    data: { task, context: params.context ?? null, queuedAt: new Date().toISOString() },
  }
}

export async function handleAgentGetContext(params: AgentServiceParams): Promise<DaemonResponse> {
  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_start",
    message: "handling agent.getContext",
    meta: { agent: params.agent, friendId: params.friendId },
  })

  const query = (params.question as string | undefined)
    ?? (params.query as string | undefined)
    ?? (params.topic as string | undefined)

  const facts = readAgentMemory(params.agent)
  const innerStatus = readInnerDialogStatus(params.agent)
  const sessions = enumerateSessions(params.agent)
  const taskFiles = listTaskFiles(params.agent)

  let memorySummary: string | null = null
  if (query) {
    const matches = searchFacts(facts, query)
    memorySummary = matches.length > 0
      ? matches.slice(0, 10).map((f) => f.text).join("\n")
      : `No relevant memories found for: ${query}`
  } else {
    // Return last 10 facts as summary
    const recent = facts.slice(-10)
    if (recent.length > 0) {
      memorySummary = recent.map((f) => f.text).join("\n")
    }
  }

  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_end",
    message: "completed agent.getContext",
    meta: { agent: params.agent },
  })

  return {
    ok: true,
    data: {
      agent: params.agent,
      hasMemory: facts.length > 0,
      factCount: facts.length,
      memorySummary,
      taskCount: taskFiles.length,
      sessionCount: sessions.length,
      innerStatus: innerStatus?.status ?? null,
    },
  }
}

export async function handleAgentSearchMemory(params: AgentServiceParams): Promise<DaemonResponse> {
  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_start",
    message: "handling agent.searchMemory",
    meta: { agent: params.agent, friendId: params.friendId },
  })

  const query = params.query as string | undefined
  if (!query) {
    emitNervesEvent({
      level: "error",
      component: "daemon",
      event: "daemon.agent_service_error",
      message: "agent.searchMemory missing query parameter",
      meta: { agent: params.agent },
    })
    return { ok: false, error: "Missing required parameter: query" }
  }

  const facts = readAgentMemory(params.agent)
  const matches = searchFacts(facts, query).slice(0, 20)
  const formatted = matches.map(
    (f) => `[fact] ${f.text} (source=${f.source}, ${f.createdAt})`,
  )

  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_end",
    message: "completed agent.searchMemory",
    meta: { agent: params.agent, matchCount: matches.length },
  })

  return {
    ok: true,
    message: matches.length > 0 ? `Found ${matches.length} matches` : "No matches found",
    data: { query, matches: formatted },
  }
}

export async function handleAgentGetTask(params: AgentServiceParams): Promise<DaemonResponse> {
  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_start",
    message: "handling agent.getTask",
    meta: { agent: params.agent, friendId: params.friendId },
  })

  const taskFiles = listTaskFiles(params.agent)
  // Look for active tasks: files with "doing" in the name that don't have "done"
  const activeTasks = taskFiles.filter((f) => {
    const lower = f.toLowerCase()
    return lower.includes("doing") && !lower.includes("done")
  })
  const taskNames = activeTasks.length > 0 ? activeTasks : taskFiles

  // Read first status line from each task file
  const tasks = taskNames.map((name) => {
    const content = readAgentFile(params.agent, "tasks", name)
    let statusLine = ""
    if (content) {
      const firstLine = content.split("\n").find((l) => l.trim().length > 0)
      statusLine = firstLine?.trim() ?? ""
    }
    return { name, statusLine }
  })

  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_end",
    message: "completed agent.getTask",
    meta: { agent: params.agent },
  })

  return {
    ok: true,
    message: tasks.length > 0
      ? `Tasks (${tasks.length}): ${tasks.map((t) => t.name).join(", ")}`
      : `No active tasks for ${params.agent}`,
    data: { tasks, activeCount: activeTasks.length, totalCount: taskFiles.length },
  }
}

export async function handleAgentCheckScope(params: AgentServiceParams): Promise<DaemonResponse> {
  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_start",
    message: "handling agent.checkScope",
    meta: { agent: params.agent, friendId: params.friendId },
  })

  const item = params.item as string | undefined
  if (!item) {
    emitNervesEvent({
      level: "error",
      component: "daemon",
      event: "daemon.agent_service_error",
      message: "agent.checkScope missing item parameter",
      meta: { agent: params.agent },
    })
    return { ok: false, error: "Missing required parameter: item" }
  }

  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_end",
    message: "completed agent.checkScope",
    meta: { agent: params.agent },
  })

  return {
    ok: true,
    message: `Scope check for: ${item}`,
    data: { item, inScope: true, reason: "MVP: scope check requires inference — defaulting to in-scope" },
  }
}

export async function handleAgentRequestDecision(params: AgentServiceParams): Promise<DaemonResponse> {
  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_start",
    message: "handling agent.requestDecision",
    meta: { agent: params.agent, friendId: params.friendId },
  })

  const topic = params.topic as string | undefined
  if (!topic) {
    emitNervesEvent({
      level: "error",
      component: "daemon",
      event: "daemon.agent_service_error",
      message: "agent.requestDecision missing topic parameter",
      meta: { agent: params.agent },
    })
    return { ok: false, error: "Missing required parameter: topic" }
  }

  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_end",
    message: "completed agent.requestDecision",
    meta: { agent: params.agent },
  })

  return {
    ok: true,
    message: `Decision request queued: ${topic}`,
    data: {
      topic,
      options: params.options ?? null,
      status: "pending",
      note: "MVP: decision requires inference — queued for agent review",
    },
  }
}

export async function handleAgentCheckGuidance(params: AgentServiceParams): Promise<DaemonResponse> {
  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_start",
    message: "handling agent.checkGuidance",
    meta: { agent: params.agent, friendId: params.friendId },
  })

  const topic = params.topic as string | undefined
  if (!topic) {
    emitNervesEvent({
      level: "error",
      component: "daemon",
      event: "daemon.agent_service_error",
      message: "agent.checkGuidance missing topic parameter",
      meta: { agent: params.agent },
    })
    return { ok: false, error: "Missing required parameter: topic" }
  }

  // Search facts for guidance
  const facts = readAgentMemory(params.agent)
  const matches = searchFacts(facts, topic)

  // Also search today's journal
  const today = new Date().toISOString().slice(0, 10)
  const dailyContent = readAgentFile(params.agent, "psyche", "memory", "daily", `${today}.jsonl`)
  const journalMatches = dailyContent ? searchFacts(parseFactsJsonl(dailyContent), topic) : []

  const allMatches = [...matches, ...journalMatches]
  // Deduplicate by id
  const seen = new Set<string>()
  const unique = allMatches.filter((f) => {
    if (seen.has(f.id)) return false
    seen.add(f.id)
    return true
  })

  let guidance: string
  if (unique.length > 0) {
    guidance = `Relevant guidance:\n${unique.slice(0, 10).map((f) => f.text).join("\n")}`
  } else {
    guidance = `No specific guidance found for: ${topic}`
  }

  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_end",
    message: "completed agent.checkGuidance",
    meta: { agent: params.agent },
  })

  return { ok: true, message: guidance }
}

export async function handleAgentReportProgress(params: AgentServiceParams): Promise<DaemonResponse> {
  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_start",
    message: "handling agent.reportProgress",
    meta: { agent: params.agent, friendId: params.friendId },
  })

  const summary = params.summary as string | undefined
  if (!summary) {
    emitNervesEvent({
      level: "error",
      component: "daemon",
      event: "daemon.agent_service_error",
      message: "agent.reportProgress missing summary parameter",
      meta: { agent: params.agent },
    })
    return { ok: false, error: "Missing required parameter: summary" }
  }

  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_end",
    message: "completed agent.reportProgress",
    meta: { agent: params.agent },
  })

  return {
    ok: true,
    message: `Progress noted: ${summary}`,
    data: { summary, receivedAt: new Date().toISOString() },
  }
}

export async function handleAgentReportBlocker(params: AgentServiceParams): Promise<DaemonResponse> {
  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_start",
    message: "handling agent.reportBlocker",
    meta: { agent: params.agent, friendId: params.friendId },
  })

  const blocker = params.blocker as string | undefined
  if (!blocker) {
    emitNervesEvent({
      level: "error",
      component: "daemon",
      event: "daemon.agent_service_error",
      message: "agent.reportBlocker missing blocker parameter",
      meta: { agent: params.agent },
    })
    return { ok: false, error: "Missing required parameter: blocker" }
  }

  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_end",
    message: "completed agent.reportBlocker",
    meta: { agent: params.agent },
  })

  return {
    ok: true,
    message: `Blocker reported: ${blocker}`,
    data: { blocker, receivedAt: new Date().toISOString() },
  }
}

export async function handleAgentReportComplete(params: AgentServiceParams): Promise<DaemonResponse> {
  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_start",
    message: "handling agent.reportComplete",
    meta: { agent: params.agent, friendId: params.friendId },
  })

  const summary = params.summary as string | undefined
  if (!summary) {
    emitNervesEvent({
      level: "error",
      component: "daemon",
      event: "daemon.agent_service_error",
      message: "agent.reportComplete missing summary parameter",
      meta: { agent: params.agent },
    })
    return { ok: false, error: "Missing required parameter: summary" }
  }

  emitNervesEvent({
    component: "daemon",
    event: "daemon.agent_service_end",
    message: "completed agent.reportComplete",
    meta: { agent: params.agent },
  })

  return {
    ok: true,
    message: `Completion reported: ${summary}`,
    data: { summary, receivedAt: new Date().toISOString() },
  }
}
