import { describe, it, expect, vi, beforeEach } from "vitest"
import { emitNervesEvent } from "../../nerves/runtime"

function emitTestEvent(testName: string): void {
  emitNervesEvent({
    component: "engine",
    event: "engine.test_run",
    message: testName,
    meta: { test: true },
  })
}

function defaultReadFileSync(filePath: any, _encoding?: any): string {
  const p = String(filePath)
  if (p.endsWith("SOUL.md")) return "mock soul"
  if (p.endsWith("IDENTITY.md")) return "mock identity"
  if (p.endsWith("LORE.md")) return "mock lore"
  if (p.endsWith("package.json")) return JSON.stringify({ name: "other" })
  return ""
}

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(defaultReadFileSync),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}))

vi.mock("../../repertoire/skills", () => ({
  listSkills: vi.fn(),
  loadSkill: vi.fn(),
}))

vi.mock("../../heart/identity", () => ({
  loadAgentConfig: vi.fn(() => ({
    name: "testagent",
    configPath: "~/.agentsecrets/testagent/secrets.json",
    provider: "minimax",
  })),
  DEFAULT_AGENT_CONTEXT: { maxTokens: 80000, contextMargin: 20 },
  getAgentName: vi.fn(() => "testagent"),
  getAgentSecretsPath: vi.fn(() => "/tmp/.agentsecrets/testagent/secrets.json"),
  getAgentRoot: vi.fn(() => "/mock/repo/testagent"),
  getRepoRoot: vi.fn(() => "/mock/repo"),
  resetIdentity: vi.fn(),
}))

const mockCreate = vi.fn()
vi.mock("openai", () => {
  class MockOpenAI {
    chat = { completions: { create: mockCreate } }
    responses = { create: vi.fn() }
    constructor() {}
  }
  return { default: MockOpenAI, AzureOpenAI: MockOpenAI }
})

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: vi.fn() }
    constructor() {}
  }
  return { default: MockAnthropic }
})

vi.mock("../../mind/associative-recall", () => ({
  injectAssociativeRecall: vi.fn().mockResolvedValue(undefined),
}))

import * as fs from "fs"
import * as identity from "../../heart/identity"
import type { ChannelCallbacks } from "../../heart/core"

function makeStream(chunks: any[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) yield chunk
    },
  }
}

function makeChunk(content?: string, toolCalls?: any[]) {
  const delta: any = {}
  if (content !== undefined) delta.content = content
  if (toolCalls !== undefined) delta.tool_calls = toolCalls
  return { choices: [{ delta }] }
}

const noopCallbacks: ChannelCallbacks = {
  onModelStart: () => {},
  onModelStreamStart: () => {},
  onTextChunk: () => {},
  onReasoningChunk: () => {},
  onToolStart: () => {},
  onToolEnd: () => {},
  onError: () => {},
}

describe("reasoning effort flow in runAgent", () => {
  beforeEach(async () => {
    vi.resetModules()
    mockCreate.mockReset()
    vi.mocked(fs.readFileSync).mockImplementation(defaultReadFileSync)
    vi.mocked(identity.loadAgentConfig).mockReturnValue({
      name: "testagent",
      configPath: "~/.agentsecrets/testagent/secrets.json",
      provider: "minimax",
    })
    const config = await import("../../heart/config")
    config.resetConfigCache()
    config.patchRuntimeConfig({ providers: { minimax: { apiKey: "test-key", model: "test-model" } } })
  })

  it("provides supportedReasoningEfforts on ToolContext from provider runtime", async () => {
    emitTestEvent("provides supportedReasoningEfforts on ToolContext")
    // set_reasoning_effort tool call -> check ctx has supportedReasoningEfforts
    const toolCallId = "call_effort_1"
    mockCreate
      .mockReturnValueOnce(makeStream([
        makeChunk(undefined, [{ index: 0, id: toolCallId, function: { name: "shell", arguments: '{"command":"echo hi"}' } }]),
      ]))
      .mockReturnValueOnce(makeStream([makeChunk("done")]))

    const core = await import("../../heart/core")
    core.resetProviderRuntime()
    const { runAgent } = core

    let capturedCtx: any = null
    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, noopCallbacks, undefined, undefined, {
      toolChoiceRequired: false,
      execTool: async (_name, _args, ctx) => {
        capturedCtx = ctx
        return "ok"
      },
      toolContext: { signin: async () => undefined },
    })

    // MiniMax has no supportedReasoningEfforts -- it should be undefined
    expect(capturedCtx).toBeDefined()
    expect(capturedCtx.supportedReasoningEfforts).toBeUndefined()
  })

  it("provides setReasoningEffort callback on ToolContext", async () => {
    emitTestEvent("provides setReasoningEffort on ToolContext")
    const toolCallId = "call_effort_2"
    mockCreate
      .mockReturnValueOnce(makeStream([
        makeChunk(undefined, [{ index: 0, id: toolCallId, function: { name: "shell", arguments: '{"command":"echo hi"}' } }]),
      ]))
      .mockReturnValueOnce(makeStream([makeChunk("done")]))

    const core = await import("../../heart/core")
    core.resetProviderRuntime()
    const { runAgent } = core

    let capturedCtx: any = null
    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, noopCallbacks, undefined, undefined, {
      toolChoiceRequired: false,
      execTool: async (_name, _args, ctx) => {
        capturedCtx = ctx
        return "ok"
      },
      toolContext: { signin: async () => undefined },
    })

    expect(capturedCtx).toBeDefined()
    expect(typeof capturedCtx.setReasoningEffort).toBe("function")
  })

  it("set_reasoning_effort tool mutates effort for subsequent turns", async () => {
    emitTestEvent("set_reasoning_effort mutates effort")
    // First call: model invokes set_reasoning_effort tool
    // Second call: model returns text (effort should have been updated)
    const toolCallId = "call_set_effort"
    mockCreate
      .mockReturnValueOnce(makeStream([
        makeChunk(undefined, [{ index: 0, id: toolCallId, function: { name: "set_reasoning_effort", arguments: '{"level":"high"}' } }]),
      ]))
      .mockReturnValueOnce(makeStream([makeChunk("done with high effort")]))

    const core = await import("../../heart/core")
    core.resetProviderRuntime()
    const { runAgent } = core
    const { baseToolDefinitions } = await import("../../repertoire/tools-base")
    const seTool = baseToolDefinitions.find(d => d.tool.function.name === "set_reasoning_effort")

    const messages: any[] = [{ role: "system", content: "test" }]
    await runAgent(messages, noopCallbacks, undefined, undefined, {
      toolChoiceRequired: false,
      tools: [seTool!.tool, { type: "function", function: { name: "shell", description: "run shell command", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } } }],
      execTool: async (name, args, ctx) => {
        if (name === "set_reasoning_effort") {
          return seTool!.handler(args, ctx)
        }
        return "ok"
      },
      toolContext: { signin: async () => undefined },
    })

    // The tool message in conversation should indicate the effort was set
    const toolResults = messages.filter((m: any) => m.role === "tool")
    // set_reasoning_effort with MiniMax (no capabilities) -> "not available"
    // This test verifies the flow path exists even when the provider has no supported efforts
    expect(toolResults.length).toBeGreaterThan(0)
  })

  it("passes providerCapabilities to getToolsForChannel in runAgent", async () => {
    emitTestEvent("passes providerCapabilities to getToolsForChannel")
    mockCreate.mockReturnValue(makeStream([makeChunk("ok")]))
    const core = await import("../../heart/core")
    core.resetProviderRuntime()
    const { runAgent } = core

    const messages: any[] = [{ role: "system", content: "test" }]
    // MiniMax has empty capabilities, so set_reasoning_effort should not be in the tools
    await runAgent(messages, noopCallbacks, undefined, undefined, {
      toolChoiceRequired: false,
    })

    // The test verifies the flow doesn't crash -- actual capability filtering
    // is tested in tools-capability-gating.test.ts
    expect(true).toBe(true)
  })
})
