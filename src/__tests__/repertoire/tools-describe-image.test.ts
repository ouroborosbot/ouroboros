import { describe, it, expect, vi, beforeEach } from "vitest"
import { emitNervesEvent } from "../../nerves/runtime"

function emitTestEvent(testName: string): void {
  emitNervesEvent({
    component: "repertoire",
    event: "repertoire.test_run",
    message: testName,
    meta: { test: true },
  })
}

// Mock identity so loadConfig doesn't demand a real --agent argv; the
// runtime config override injected via patchRuntimeConfig is all the tests
// actually need for the BB/minimax lookups.
vi.mock("../../heart/identity", () => ({
  loadAgentConfig: vi.fn(() => ({
    provider: "minimax",
    humanFacing: { provider: "minimax", model: "MiniMax-M2.5" },
    agentFacing: { provider: "minimax", model: "MiniMax-M2.5" },
  })),
  getAgentName: vi.fn(() => "testagent"),
  getAgentSecretsPath: vi.fn(() => "/tmp/.agentsecrets/testagent/secrets.json"),
  getAgentRoot: vi.fn(() => "/tmp/agents/testagent"),
  getAgentToolsRoot: vi.fn(() => "/tmp/agents/testagent/tools"),
  getRepoRoot: vi.fn(() => "/tmp/repo"),
  DEFAULT_AGENT_CONTEXT: { maxTokens: 80000, contextMargin: 20 },
  resetIdentity: vi.fn(),
}))

describe("describe_image tool", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe("tool schema and AX-1 description", () => {
    it("appears in bluebubblesToolDefinitions with the name describe_image", async () => {
      emitTestEvent("describe_image in bb defs")
      const { bluebubblesToolDefinitions } = await import("../../repertoire/tools-bluebubbles")
      const def = bluebubblesToolDefinitions.find(
        (d) => d.tool.function.name === "describe_image",
      )
      expect(def).toBeDefined()
    })

    it("description is a paragraph (>=150 chars) and not a one-liner starting with 'Describes'", async () => {
      emitTestEvent("describe_image AX-1 description")
      const { bluebubblesToolDefinitions } = await import("../../repertoire/tools-bluebubbles")
      const def = bluebubblesToolDefinitions.find(
        (d) => d.tool.function.name === "describe_image",
      )!
      const description = def.tool.function.description ?? ""
      expect(description.length).toBeGreaterThanOrEqual(150)
      expect(description).not.toMatch(/^Describes? (an )?image\.$/)
    })

    it("description mentions 'vision-language model' (or VLM), 'targeted', and why it exists", async () => {
      emitTestEvent("describe_image AX-1 keywords")
      const { bluebubblesToolDefinitions } = await import("../../repertoire/tools-bluebubbles")
      const def = bluebubblesToolDefinitions.find(
        (d) => d.tool.function.name === "describe_image",
      )!
      const description = (def.tool.function.description ?? "").toLowerCase()
      expect(description).toMatch(/vision-language model|\bvlm\b/)
      expect(description).toContain("targeted")
      // must explain the reason (chat model can't see images natively)
      expect(description).toMatch(/can'?t see|can not see|cannot see|doesn'?t see|no.*vision/)
    })

    it("has attachment_guid and prompt parameters, both required", async () => {
      emitTestEvent("describe_image params")
      const { bluebubblesToolDefinitions } = await import("../../repertoire/tools-bluebubbles")
      const def = bluebubblesToolDefinitions.find(
        (d) => d.tool.function.name === "describe_image",
      )!
      const params = def.tool.function.parameters as {
        type: string
        properties: Record<string, { type: string; description?: string }>
        required?: string[]
      }
      expect(params.type).toBe("object")
      expect(params.properties.attachment_guid).toBeDefined()
      expect(params.properties.attachment_guid.type).toBe("string")
      expect(params.properties.prompt).toBeDefined()
      expect(params.properties.prompt.type).toBe("string")
      expect(params.required).toEqual(expect.arrayContaining(["attachment_guid", "prompt"]))
    })
  })

  describe("tool-set gating", () => {
    it("non-vision chat model: describe_image is in the tool set for bluebubbles channel", async () => {
      emitTestEvent("describe_image gating non-vision")
      const config = await import("../../heart/config")
      config.resetConfigCache()
      config.patchRuntimeConfig({ providers: { minimax: { apiKey: "test-key" } } })
      const { getToolsForChannel } = await import("../../repertoire/tools")
      const { getChannelCapabilities } = await import("../../mind/friends/channel")
      const tools = getToolsForChannel(
        getChannelCapabilities("bluebubbles"),
        undefined,
        undefined,
        undefined,
        undefined,
        "MiniMax-M2.5",
      )
      expect(tools.find((t) => t.function.name === "describe_image")).toBeDefined()
    })

    it("vision-capable chat model: describe_image is NOT in the tool set", async () => {
      emitTestEvent("describe_image gating vision")
      const config = await import("../../heart/config")
      config.resetConfigCache()
      config.patchRuntimeConfig({ providers: { minimax: { apiKey: "test-key" } } })
      const { getToolsForChannel } = await import("../../repertoire/tools")
      const { getChannelCapabilities } = await import("../../mind/friends/channel")
      const tools = getToolsForChannel(
        getChannelCapabilities("bluebubbles"),
        undefined,
        undefined,
        undefined,
        undefined,
        "claude-opus-4-6",
      )
      expect(tools.find((t) => t.function.name === "describe_image")).toBeUndefined()
    })

    it("chat model omitted: describe_image is included (safer default)", async () => {
      emitTestEvent("describe_image gating default")
      const config = await import("../../heart/config")
      config.resetConfigCache()
      config.patchRuntimeConfig({ providers: { minimax: { apiKey: "test-key" } } })
      const { getToolsForChannel } = await import("../../repertoire/tools")
      const { getChannelCapabilities } = await import("../../mind/friends/channel")
      const tools = getToolsForChannel(getChannelCapabilities("bluebubbles"))
      expect(tools.find((t) => t.function.name === "describe_image")).toBeDefined()
    })

    it("describe_image is NOT registered for non-bluebubbles channels even without vision", async () => {
      emitTestEvent("describe_image gating teams")
      const config = await import("../../heart/config")
      config.resetConfigCache()
      config.patchRuntimeConfig({ providers: { minimax: { apiKey: "test-key" } } })
      const { getToolsForChannel } = await import("../../repertoire/tools")
      const { getChannelCapabilities } = await import("../../mind/friends/channel")
      const tools = getToolsForChannel(
        getChannelCapabilities("teams"),
        undefined,
        undefined,
        undefined,
        undefined,
        "MiniMax-M2.5",
      )
      expect(tools.find((t) => t.function.name === "describe_image")).toBeUndefined()
    })
  })

  describe("handler", () => {
    it("returns description when attachment guid is found in the cache", async () => {
      emitTestEvent("describe_image handler happy")
      const config = await import("../../heart/config")
      config.resetConfigCache()
      config.patchRuntimeConfig({
        providers: { minimax: { apiKey: "test-key" } },
        bluebubbles: { serverUrl: "http://bluebubbles.local", password: "secret", accountId: "default" },
      })
      const { rememberBlueBubblesAttachment, resetBlueBubblesAttachmentCache } = await import(
        "../../senses/bluebubbles/attachment-cache"
      )
      resetBlueBubblesAttachmentCache()
      rememberBlueBubblesAttachment({
        guid: "img-1",
        mimeType: "image/png",
        transferName: "pic.png",
      })

      // Stub global fetch for downloadAttachment inside the handler
      const originalFetch = global.fetch
      try {
        global.fetch = vi.fn().mockResolvedValue(
          new Response(Buffer.from("image-bytes"), {
            status: 200,
            headers: { "content-type": "image/png" },
          }),
        ) as typeof fetch

        // Stub the VLM client
        vi.doMock("../../heart/providers/minimax-vlm", () => ({
          minimaxVlmDescribe: vi.fn().mockResolvedValue("a cat on a keyboard"),
        }))

        const { bluebubblesToolDefinitions } = await import("../../repertoire/tools-bluebubbles")
        const def = bluebubblesToolDefinitions.find(
          (d) => d.tool.function.name === "describe_image",
        )!
        const result = await def.handler(
          { attachment_guid: "img-1", prompt: "what is this?" },
          undefined,
        )
        expect(result).toBe("a cat on a keyboard")
      } finally {
        global.fetch = originalFetch
        vi.doUnmock("../../heart/providers/minimax-vlm")
      }
    })

    it("returns AX-2 error when attachment guid is not in the cache", async () => {
      emitTestEvent("describe_image handler not found")
      const config = await import("../../heart/config")
      config.resetConfigCache()
      config.patchRuntimeConfig({ providers: { minimax: { apiKey: "test-key" } } })
      const { resetBlueBubblesAttachmentCache } = await import(
        "../../senses/bluebubbles/attachment-cache"
      )
      resetBlueBubblesAttachmentCache()
      const { bluebubblesToolDefinitions } = await import("../../repertoire/tools-bluebubbles")
      const def = bluebubblesToolDefinitions.find(
        (d) => d.tool.function.name === "describe_image",
      )!
      const result = await def.handler(
        { attachment_guid: "missing-guid", prompt: "what is this?" },
        undefined,
      )
      expect(result).toMatch(/no attachment.*missing-guid/i)
      expect(result).toMatch(/ask the user to resend|verify the guid|recent messages/i)
    })

    it("surfaces VLM client errors verbatim prefixed with 'describe_image failed:'", async () => {
      emitTestEvent("describe_image handler vlm failure")
      const config = await import("../../heart/config")
      config.resetConfigCache()
      config.patchRuntimeConfig({
        providers: { minimax: { apiKey: "test-key" } },
        bluebubbles: { serverUrl: "http://bluebubbles.local", password: "secret", accountId: "default" },
      })
      const { rememberBlueBubblesAttachment, resetBlueBubblesAttachmentCache } = await import(
        "../../senses/bluebubbles/attachment-cache"
      )
      resetBlueBubblesAttachmentCache()
      rememberBlueBubblesAttachment({
        guid: "img-2",
        mimeType: "image/png",
        transferName: "pic.png",
      })
      const originalFetch = global.fetch
      try {
        global.fetch = vi.fn().mockResolvedValue(
          new Response(Buffer.from("image-bytes"), {
            status: 200,
            headers: { "content-type": "image/png" },
          }),
        ) as typeof fetch
        vi.doMock("../../heart/providers/minimax-vlm", () => ({
          minimaxVlmDescribe: vi.fn().mockRejectedValue(
            new Error("minimax VLM: rate limited (HTTP 429) — wait and retry in a moment"),
          ),
        }))
        const { bluebubblesToolDefinitions } = await import("../../repertoire/tools-bluebubbles")
        const def = bluebubblesToolDefinitions.find(
          (d) => d.tool.function.name === "describe_image",
        )!
        const result = await def.handler(
          { attachment_guid: "img-2", prompt: "what is this?" },
          undefined,
        )
        expect(result).toMatch(/^describe_image failed:/)
        expect(result).toContain("rate limited")
        expect(result).toContain("wait and retry")
      } finally {
        global.fetch = originalFetch
        vi.doUnmock("../../heart/providers/minimax-vlm")
      }
    })

    it("missing attachment_guid arg: returns AX-2 error", async () => {
      emitTestEvent("describe_image handler missing guid arg")
      const { bluebubblesToolDefinitions } = await import("../../repertoire/tools-bluebubbles")
      const def = bluebubblesToolDefinitions.find(
        (d) => d.tool.function.name === "describe_image",
      )!
      const result = await def.handler({ prompt: "p" } as Record<string, string>, undefined)
      expect(result).toMatch(/attachment_guid.*required|missing attachment/i)
    })

    it("missing prompt arg: returns AX-2 error", async () => {
      emitTestEvent("describe_image handler missing prompt arg")
      const { bluebubblesToolDefinitions } = await import("../../repertoire/tools-bluebubbles")
      const def = bluebubblesToolDefinitions.find(
        (d) => d.tool.function.name === "describe_image",
      )!
      const result = await def.handler(
        { attachment_guid: "x" } as Record<string, string>,
        undefined,
      )
      expect(result).toMatch(/prompt.*required|missing prompt/i)
    })

    it("non-minimax provider: returns AX-2 error about credentials", async () => {
      emitTestEvent("describe_image handler non-minimax")
      const config = await import("../../heart/config")
      config.resetConfigCache()
      // No minimax key in config
      config.patchRuntimeConfig({
        providers: { minimax: { apiKey: "" } },
        bluebubbles: { serverUrl: "http://bluebubbles.local", password: "secret", accountId: "default" },
      })
      const { rememberBlueBubblesAttachment, resetBlueBubblesAttachmentCache } = await import(
        "../../senses/bluebubbles/attachment-cache"
      )
      resetBlueBubblesAttachmentCache()
      rememberBlueBubblesAttachment({
        guid: "img-3",
        mimeType: "image/png",
        transferName: "pic.png",
      })
      const originalFetch = global.fetch
      try {
        global.fetch = vi.fn().mockResolvedValue(
          new Response(Buffer.from("image-bytes"), {
            status: 200,
            headers: { "content-type": "image/png" },
          }),
        ) as typeof fetch
        const { bluebubblesToolDefinitions } = await import("../../repertoire/tools-bluebubbles")
        const def = bluebubblesToolDefinitions.find(
          (d) => d.tool.function.name === "describe_image",
        )!
        const result = await def.handler(
          { attachment_guid: "img-3", prompt: "what is this?" },
          undefined,
        )
        expect(result).toMatch(/^describe_image failed:/)
        expect(result).toMatch(/api key|credentials|re-run credential setup/i)
      } finally {
        global.fetch = originalFetch
      }
    })
  })
})
