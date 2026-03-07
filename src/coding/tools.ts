import type OpenAI from "openai"

import { getCodingSessionManager } from "./index"
import { emitNervesEvent } from "../nerves/runtime"
import type { CodingRunner, CodingSessionRequest } from "./types"

const RUNNERS: CodingRunner[] = ["claude", "codex"]

function requireArg(args: Record<string, string>, key: string): string | null {
  const value = args[key]
  if (!value || value.trim().length === 0) {
    return null
  }
  return value.trim()
}

function parseRunner(value: string): CodingRunner | null {
  return RUNNERS.includes(value as CodingRunner) ? (value as CodingRunner) : null
}

function optionalArg(args: Record<string, string>, key: "taskRef" | "scopeFile" | "stateFile"): string | undefined {
  const raw = args[key]
  if (!raw) return undefined
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function emitCodingToolEvent(toolName: string): void {
  emitNervesEvent({
    component: "repertoire",
    event: "repertoire.coding_tool_call",
    message: "coding tool handler invoked",
    meta: { toolName },
  })
}

const codingSpawnTool: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "coding_spawn",
    description: "spawn a coding session using claude/codex and explicit task-threaded guidance",
    parameters: {
      type: "object",
      properties: {
        runner: { type: "string", enum: ["claude", "codex"] },
        workdir: { type: "string" },
        prompt: { type: "string" },
        taskRef: { type: "string" },
        scopeFile: { type: "string" },
        stateFile: { type: "string" },
      },
      required: ["runner", "workdir", "prompt", "taskRef"],
    },
  },
}

const codingStatusTool: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "coding_status",
    description: "inspect coding sessions; omit sessionId to list all active/known sessions",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
      },
    },
  },
}

const codingSendInputTool: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "coding_send_input",
    description: "send stdin text to an existing coding session",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        input: { type: "string" },
      },
      required: ["sessionId", "input"],
    },
  },
}

const codingKillTool: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "coding_kill",
    description: "terminate an existing coding session",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
      },
      required: ["sessionId"],
    },
  },
}

export const codingToolDefinitions = [
  {
    tool: codingSpawnTool,
    handler: async (args: Record<string, string>): Promise<string> => {
      emitCodingToolEvent("coding_spawn")
      const rawRunner = requireArg(args, "runner")
      if (!rawRunner) return "runner is required"
      const runner = parseRunner(rawRunner)
      if (!runner) return `invalid runner: ${rawRunner}`

      const workdir = requireArg(args, "workdir")
      if (!workdir) return "workdir is required"

      const prompt = requireArg(args, "prompt")
      if (!prompt) return "prompt is required"

      const taskRef = requireArg(args, "taskRef")
      if (!taskRef) return "taskRef is required"

      const request: CodingSessionRequest = {
        runner,
        workdir,
        prompt,
        taskRef,
      }

      const scopeFile = optionalArg(args, "scopeFile")
      if (scopeFile) request.scopeFile = scopeFile
      const stateFile = optionalArg(args, "stateFile")
      if (stateFile) request.stateFile = stateFile

      const session = await getCodingSessionManager().spawnSession(request)
      return JSON.stringify(session)
    },
  },
  {
    tool: codingStatusTool,
    handler: (args: Record<string, string>): string => {
      emitCodingToolEvent("coding_status")
      const manager = getCodingSessionManager()
      const sessionId = requireArg(args, "sessionId")
      if (!sessionId) {
        return JSON.stringify(manager.listSessions())
      }

      const session = manager.getSession(sessionId)
      if (!session) return `session not found: ${sessionId}`
      return JSON.stringify(session)
    },
  },
  {
    tool: codingSendInputTool,
    handler: (args: Record<string, string>): string => {
      emitCodingToolEvent("coding_send_input")
      const sessionId = requireArg(args, "sessionId")
      if (!sessionId) return "sessionId is required"

      const input = requireArg(args, "input")
      if (!input) return "input is required"

      return JSON.stringify(getCodingSessionManager().sendInput(sessionId, input))
    },
  },
  {
    tool: codingKillTool,
    handler: (args: Record<string, string>): string => {
      emitCodingToolEvent("coding_kill")
      const sessionId = requireArg(args, "sessionId")
      if (!sessionId) return "sessionId is required"

      return JSON.stringify(getCodingSessionManager().killSession(sessionId))
    },
  },
]
