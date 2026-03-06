import { beforeEach, describe, expect, it, vi } from "vitest"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import type OpenAI from "openai"

const mockBuildSystem = vi.fn()
const mockRunAgent = vi.fn()
const mockSessionPath = vi.fn()
const mockLoadSession = vi.fn()
const mockPostTurn = vi.fn()
const mockCaptureTurnMemories = vi.fn()
const mockGetAgentRoot = vi.fn()

vi.mock("../../mind/prompt", () => ({
  buildSystem: (...args: any[]) => mockBuildSystem(...args),
}))

vi.mock("../../heart/core", () => ({
  runAgent: (...args: any[]) => mockRunAgent(...args),
}))

vi.mock("../../config", () => ({
  sessionPath: (...args: any[]) => mockSessionPath(...args),
}))

vi.mock("../../mind/context", () => ({
  loadSession: (...args: any[]) => mockLoadSession(...args),
  postTurn: (...args: any[]) => mockPostTurn(...args),
}))

vi.mock("../../mind/memory-capture", () => ({
  captureTurnMemories: (...args: any[]) => mockCaptureTurnMemories(...args),
}))

vi.mock("../../identity", () => ({
  getAgentRoot: (...args: any[]) => mockGetAgentRoot(...args),
}))

vi.mock("../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn(),
}))

import {
  buildInnerDialogBootstrapMessage,
  buildInstinctUserMessage,
  loadInnerDialogInstincts,
  runInnerDialogTurn,
} from "../../senses/inner-dialog"

describe("inner dialog runtime", () => {
  let sessionFile: string
  let agentRoot: string

  beforeEach(() => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "inner-dialog-test-"))
    sessionFile = path.join(tmp, "inner-dialog-session.json")
    agentRoot = path.join(tmp, "agent-root")
    fs.mkdirSync(path.join(agentRoot, "psyche"), { recursive: true })
    fs.writeFileSync(path.join(agentRoot, "psyche", "ASPIRATIONS.md"), "Keep improving the harness.", "utf8")

    mockBuildSystem.mockReset().mockResolvedValue("system prompt")
    mockRunAgent.mockReset().mockImplementation(async (messages: OpenAI.ChatCompletionMessageParam[], callbacks: any) => {
      callbacks?.onModelStart?.()
      callbacks?.onModelStreamStart?.()
      callbacks?.onTextChunk?.("inner-dialog text chunk")
      callbacks?.onReasoningChunk?.("inner-dialog reasoning chunk")
      callbacks?.onToolStart?.("memory_search")
      callbacks?.onToolEnd?.("memory_search", true)
      callbacks?.onError?.(new Error("inner-dialog synthetic callback error"))
      messages.push({ role: "assistant", content: "Noted. I will continue autonomous work." })
      return { usage: undefined }
    })
    mockSessionPath.mockReset().mockReturnValue(sessionFile)
    mockLoadSession.mockReset().mockReturnValue(null)
    mockPostTurn.mockReset().mockImplementation((_messages: OpenAI.ChatCompletionMessageParam[], _path: string, _usage: any, hooks: any) => {
      hooks?.beforeTrim?.([...(Array.isArray(_messages) ? _messages : [])])
    })
    mockCaptureTurnMemories.mockReset()
    mockGetAgentRoot.mockReset().mockReturnValue(agentRoot)
  })

  it("builds bootstrap message with aspirations and current state", () => {
    const message = buildInnerDialogBootstrapMessage("Learn and help Ari.", "No prior session found.")
    expect(message).toContain("Learn and help Ari.")
    expect(message).toContain("No prior session found.")
    expect(message).toContain("decide what to do next")
  })

  it("uses fallback aspirations text when aspirations are blank", () => {
    const message = buildInnerDialogBootstrapMessage("", "No prior session found.")
    expect(message).toContain("No explicit aspirations file found")
  })

  it("loads instincts from bundle config and falls back to defaults when missing", () => {
    const instinctsFile = path.join(agentRoot, "psyche", "inner-dialog-instincts.json")
    fs.writeFileSync(
      instinctsFile,
      JSON.stringify([{ id: "backlog", prompt: "Instinct: review pending tasks.", enabled: true }], null, 2),
      "utf8",
    )
    const configured = loadInnerDialogInstincts(agentRoot)
    expect(configured).toHaveLength(1)
    expect(configured[0].prompt).toContain("review pending tasks")

    fs.unlinkSync(instinctsFile)
    const fallback = loadInnerDialogInstincts(agentRoot)
    expect(fallback.length).toBeGreaterThan(0)
    expect(fallback[0].prompt.toLowerCase()).toContain("heartbeat")
  })

  it("falls back to defaults for empty, malformed, or disabled instinct configs", () => {
    const instinctsFile = path.join(agentRoot, "psyche", "inner-dialog-instincts.json")

    fs.writeFileSync(instinctsFile, "", "utf8")
    expect(loadInnerDialogInstincts(agentRoot)[0].prompt.toLowerCase()).toContain("heartbeat")

    fs.writeFileSync(instinctsFile, JSON.stringify({ not: "an-array" }), "utf8")
    expect(loadInnerDialogInstincts(agentRoot)[0].prompt.toLowerCase()).toContain("heartbeat")

    fs.writeFileSync(
      instinctsFile,
      JSON.stringify([{ id: "disabled", prompt: "disabled instinct", enabled: false }]),
      "utf8",
    )
    expect(loadInnerDialogInstincts(agentRoot)[0].prompt.toLowerCase()).toContain("heartbeat")

    fs.writeFileSync(instinctsFile, "{bad-json", "utf8")
    expect(loadInnerDialogInstincts(agentRoot)[0].prompt.toLowerCase()).toContain("heartbeat")
  })

  it("uses instinct text to produce user-role prompts (not hardcoded continue)", () => {
    const text = buildInstinctUserMessage(
      [{ id: "backlog", prompt: "Instinct: review pending tasks.", enabled: true }],
      "heartbeat",
      { cycleCount: 3, resting: true },
    )
    expect(text).toContain("Instinct: review pending tasks.")
    expect(text.toLowerCase()).not.toBe("continue")
  })

  it("falls back to default instinct when no enabled instinct is available", () => {
    const text = buildInstinctUserMessage(
      [{ id: "disabled", prompt: "disabled", enabled: false }],
      "instinct",
      { cycleCount: 4, resting: false },
    )
    expect(text.toLowerCase()).toContain("heartbeat instinct")
  })

  it("starts autonomous turn with bootstrap context and runs agent on cli channel", async () => {
    await runInnerDialogTurn({
      reason: "boot",
      instincts: [{ id: "heartbeat", prompt: "Instinct: check in.", enabled: true }],
      now: () => new Date("2026-03-06T12:00:00.000Z"),
    })

    expect(mockRunAgent).toHaveBeenCalledTimes(1)
    const [messages, _callbacks, channel] = mockRunAgent.mock.calls[0]
    expect(channel).toBe("cli")
    expect(messages[0]).toMatchObject({ role: "system" })
    expect(messages[1]).toMatchObject({ role: "user" })
    expect(String(messages[1].content)).toContain("Keep improving the harness")
    expect(mockPostTurn).toHaveBeenCalledTimes(1)
    expect(mockCaptureTurnMemories).toHaveBeenCalledTimes(1)
  })

  it("uses bootstrap fallback text when aspirations file is missing", async () => {
    fs.unlinkSync(path.join(agentRoot, "psyche", "ASPIRATIONS.md"))

    await runInnerDialogTurn({
      reason: "boot",
      instincts: [{ id: "heartbeat", prompt: "Instinct: check in.", enabled: true }],
      now: () => new Date("2026-03-06T12:01:00.000Z"),
    })

    const [messages] = mockRunAgent.mock.calls[0]
    expect(String(messages[1].content)).toContain("No explicit aspirations file found")
  })

  it("appends instinct-driven user messages on resumed sessions", async () => {
    mockLoadSession.mockReturnValue({
      messages: [
        { role: "system", content: "system prompt" },
        { role: "assistant", content: "I will rest until heartbeat." },
      ],
    })

    await runInnerDialogTurn({
      reason: "heartbeat",
      instincts: [{ id: "backlog", prompt: "Instinct: review pending tasks.", enabled: true }],
      now: () => new Date("2026-03-06T12:05:00.000Z"),
    })

    const [messages] = mockRunAgent.mock.calls[0]
    const lastUser = [...messages].reverse().find((message: OpenAI.ChatCompletionMessageParam) => message.role === "user")
    expect(lastUser).toBeDefined()
    expect(String(lastUser!.content)).toContain("Instinct: review pending tasks.")
    expect(String(lastUser!.content).toLowerCase()).not.toBe("continue")
  })

  it("adds checkpoint-oriented context when resuming after interruption", async () => {
    mockLoadSession.mockReturnValue({
      messages: [
        { role: "system", content: "system prompt" },
        {
          role: "assistant",
          content:
            "checkpoint: Unit 2b editing src/governance/convention.ts and src/__tests__/governance/convention.test.ts",
        },
      ],
    })

    await runInnerDialogTurn({
      reason: "heartbeat",
      instincts: [{ id: "resume", prompt: "Instinct: resume interrupted work.", enabled: true }],
      now: () => new Date("2026-03-06T12:06:00.000Z"),
    })

    const [messages] = mockRunAgent.mock.calls[0]
    const lastUser = [...messages].reverse().find((message: OpenAI.ChatCompletionMessageParam) => message.role === "user")
    expect(lastUser).toBeDefined()
    const content = String(lastUser!.content)
    expect(content).toContain("Instinct: resume interrupted work.")
    expect(content).toContain("checkpoint:")
    expect(content).toContain("Unit 2b editing src/governance/convention.ts")
  })

  it("uses default reason/clock/instinct loading when options are omitted", async () => {
    fs.writeFileSync(
      path.join(agentRoot, "psyche", "inner-dialog-instincts.json"),
      JSON.stringify([{ id: "default-file", prompt: "Instinct from file.", enabled: true }]),
      "utf8",
    )
    mockLoadSession.mockReturnValue({
      messages: [
        { role: "system", content: "system prompt" },
        { role: "assistant", content: "ready for next cycle" },
      ],
    })

    await runInnerDialogTurn()

    const [messages] = mockRunAgent.mock.calls[0]
    const lastUser = [...messages].reverse().find((message: OpenAI.ChatCompletionMessageParam) => message.role === "user")
    expect(lastUser).toBeDefined()
    expect(String(lastUser!.content)).toContain("Instinct from file.")
    expect(String(lastUser!.content)).toContain("reason: heartbeat")
  })
})
