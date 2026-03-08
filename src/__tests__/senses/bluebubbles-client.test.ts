import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const emitNervesEvent = vi.fn()

vi.mock("../../nerves/runtime", () => ({
  emitNervesEvent: (...args: any[]) => emitNervesEvent(...args),
}))

const dmChat = {
  chatGuid: "any;-;ari@mendelow.me",
  chatIdentifier: "ari@mendelow.me",
  isGroup: false,
  sessionKey: "chat:any;-;ari@mendelow.me",
  sendTarget: { kind: "chat_guid", value: "any;-;ari@mendelow.me" } as const,
}

describe("BlueBubbles client", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    emitNervesEvent.mockReset()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it("sends threaded replies through the BlueBubbles text endpoint", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { guid: "sent-guid" } }), { status: 200 }),
    ) as typeof fetch

    const { createBlueBubblesClient } = await import("../../senses/bluebubbles-client")
    const client = createBlueBubblesClient(
      {
        serverUrl: "http://bluebubbles.local",
        password: "secret-token",
        accountId: "default",
      },
      {
        port: 18790,
        webhookPath: "/bluebubbles-webhook",
        requestTimeoutMs: 30000,
      },
    )

    const result = await client.sendText({
      chat: {
        chatGuid: "any;-;ari@mendelow.me",
        chatIdentifier: "ari@mendelow.me",
        isGroup: false,
        sessionKey: "chat:any;-;ari@mendelow.me",
        sendTarget: { kind: "chat_guid", value: "any;-;ari@mendelow.me" },
      },
      text: "  hello from ouro  ",
      replyToMessageGuid: "incoming-guid",
    })

    expect(result).toEqual({ messageGuid: "sent-guid" })
    expect(global.fetch).toHaveBeenCalledWith(
      "http://bluebubbles.local/api/v1/message/text?password=secret-token",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.any(String),
        signal: expect.any(AbortSignal),
      }),
    )

    const request = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    expect(request).toMatchObject({
      chatGuid: "any;-;ari@mendelow.me",
      message: "hello from ouro",
      method: "private-api",
      selectedMessageGuid: "incoming-guid",
      partIndex: 0,
    })
  })

  it("supports plain sends and root-level message guid responses", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ guid: "root-guid" }), { status: 200 }),
    ) as typeof fetch

    const { createBlueBubblesClient } = await import("../../senses/bluebubbles-client")
    const client = createBlueBubblesClient(
      {
        serverUrl: "http://bluebubbles.local/",
        password: "secret-token",
        accountId: "default",
      },
      {
        port: 18790,
        webhookPath: "/bluebubbles-webhook",
        requestTimeoutMs: 30000,
      },
    )

    const result = await client.sendText({
      chat: {
        chatGuid: "any;+;group-guid",
        chatIdentifier: "group-guid",
        displayName: "Consciousness TBD",
        isGroup: true,
        sessionKey: "chat:any;+;group-guid",
        sendTarget: { kind: "chat_guid", value: "any;+;group-guid" },
      },
      text: "plain send",
    })

    expect(result).toEqual({ messageGuid: "root-guid" })
    const request = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    expect(request).not.toHaveProperty("method")
    expect(request).not.toHaveProperty("selectedMessageGuid")
  })

  it("rejects empty text and missing chatGuid before calling fetch", async () => {
    global.fetch = vi.fn() as typeof fetch

    const { createBlueBubblesClient } = await import("../../senses/bluebubbles-client")
    const client = createBlueBubblesClient(
      {
        serverUrl: "http://bluebubbles.local",
        password: "secret-token",
        accountId: "default",
      },
      {
        port: 18790,
        webhookPath: "/bluebubbles-webhook",
        requestTimeoutMs: 30000,
      },
    )

    await expect(
      client.sendText({
        chat: {
          chatGuid: "any;-;ari@mendelow.me",
          chatIdentifier: "ari@mendelow.me",
          isGroup: false,
          sessionKey: "chat:any;-;ari@mendelow.me",
          sendTarget: { kind: "chat_guid", value: "any;-;ari@mendelow.me" },
        },
        text: "   ",
      }),
    ).rejects.toThrow("non-empty text")

    await expect(
      client.sendText({
        chat: {
          chatIdentifier: "ari@mendelow.me",
          isGroup: false,
          sessionKey: "chat_identifier:ari@mendelow.me",
          sendTarget: { kind: "chat_identifier", value: "ari@mendelow.me" },
        },
        text: "hello",
      }),
    ).rejects.toThrow("requires chat.chatGuid")

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("surfaces BlueBubbles send errors with response details", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("private api required", { status: 403 }),
    ) as typeof fetch

    const { createBlueBubblesClient } = await import("../../senses/bluebubbles-client")
    const client = createBlueBubblesClient(
      {
        serverUrl: "http://bluebubbles.local",
        password: "secret-token",
        accountId: "default",
      },
      {
        port: 18790,
        webhookPath: "/bluebubbles-webhook",
        requestTimeoutMs: 30000,
      },
    )

    await expect(
      client.sendText({
        chat: {
          chatGuid: "any;-;ari@mendelow.me",
          chatIdentifier: "ari@mendelow.me",
          isGroup: false,
          sessionKey: "chat:any;-;ari@mendelow.me",
          sendTarget: { kind: "chat_guid", value: "any;-;ari@mendelow.me" },
        },
        text: "hello",
      }),
    ).rejects.toThrow("BlueBubbles send failed (403): private api required")
  })

  it("treats empty or invalid response bodies as guid-less success and repairs events as passthrough", async () => {
    const responses = [
      new Response("", { status: 200 }),
      new Response("not-json", { status: 200 }),
      new Response(JSON.stringify({ data: {} }), { status: 200 }),
    ]
    global.fetch = vi.fn().mockImplementation(async () => responses.shift()!) as typeof fetch

    const { createBlueBubblesClient } = await import("../../senses/bluebubbles-client")
    const client = createBlueBubblesClient(
      {
        serverUrl: "http://bluebubbles.local",
        password: "secret-token",
        accountId: "default",
      },
      {
        port: 18790,
        webhookPath: "/bluebubbles-webhook",
        requestTimeoutMs: 30000,
      },
    )

    await expect(client.sendText({ chat: dmChat, text: "hello once" })).resolves.toEqual({ messageGuid: undefined })
    await expect(client.sendText({ chat: dmChat, text: "hello twice" })).resolves.toEqual({ messageGuid: undefined })
    await expect(client.sendText({ chat: dmChat, text: "hello thrice" })).resolves.toEqual({ messageGuid: undefined })

    const event = {
      kind: "message" as const,
      eventType: "new-message",
      messageGuid: "msg-1",
      timestamp: 1,
      fromMe: false,
      sender: {
        provider: "imessage-handle" as const,
        externalId: "ari@mendelow.me",
        rawId: "ari@mendelow.me",
        displayName: "ari@mendelow.me",
      },
      chat: dmChat,
      text: "hi",
      textForAgent: "hi",
      attachments: [],
      hasPayloadData: false,
      requiresRepair: false,
    }

    await expect(client.repairEvent(event)).resolves.toBe(event)
  })

  it("hydrates repairable OG-card messages by fetching the full BlueBubbles message record", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            guid: "msg-og",
            text: "https://ouroboros.bot",
            handle: {
              address: "ari@mendelow.me",
              service: "iMessage",
            },
            attachments: [
              {
                guid: "payload-guid",
                transferName: "preview.pluginPayloadAttachment",
                totalBytes: 1234,
              },
            ],
            balloonBundleId: "com.apple.messages.URLBalloonProvider",
            hasPayloadData: true,
            payloadData: [
              {
                title: "Ouroboros Bot",
                summary: "Agent harness for iMessage",
              },
            ],
            chats: [
              {
                guid: "any;-;ari@mendelow.me",
                style: 45,
                chatIdentifier: "ari@mendelow.me",
                displayName: "",
              },
            ],
          },
        }),
        { status: 200 },
      ),
    ) as typeof fetch

    const { createBlueBubblesClient } = await import("../../senses/bluebubbles-client")
    const client = createBlueBubblesClient(
      {
        serverUrl: "http://bluebubbles.local",
        password: "secret-token",
        accountId: "default",
      },
      {
        port: 18790,
        webhookPath: "/bluebubbles-webhook",
        requestTimeoutMs: 30000,
      },
    )

    const result = await client.repairEvent({
      kind: "message",
      eventType: "new-message",
      messageGuid: "msg-og",
      timestamp: 1,
      fromMe: false,
      sender: {
        provider: "imessage-handle",
        externalId: "ari@mendelow.me",
        rawId: "ari@mendelow.me",
        displayName: "ari@mendelow.me",
      },
      chat: dmChat,
      text: "https://ouroboros.bot",
      textForAgent: "https://ouroboros.bot\n[link preview attached]",
      attachments: [{ guid: "payload-guid", transferName: "preview.pluginPayloadAttachment" }],
      balloonBundleId: "com.apple.messages.URLBalloonProvider",
      hasPayloadData: true,
      requiresRepair: true,
    })

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/message/msg-og?"),
      expect.objectContaining({
        method: "GET",
        signal: expect.any(AbortSignal),
      }),
    )
    expect(result).toEqual(
      expect.objectContaining({
        kind: "message",
        messageGuid: "msg-og",
        requiresRepair: false,
      }),
    )
    expect(result.textForAgent).toContain("Ouroboros Bot")
    expect(result.textForAgent).toContain("Agent harness for iMessage")
  })

  it("returns an explicit fallback notice when repair fetch fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as typeof fetch

    const { createBlueBubblesClient } = await import("../../senses/bluebubbles-client")
    const client = createBlueBubblesClient(
      {
        serverUrl: "http://bluebubbles.local",
        password: "secret-token",
        accountId: "default",
      },
      {
        port: 18790,
        webhookPath: "/bluebubbles-webhook",
        requestTimeoutMs: 30000,
      },
    )

    const result = await client.repairEvent({
      kind: "message",
      eventType: "new-message",
      messageGuid: "msg-audio",
      timestamp: 1,
      fromMe: false,
      sender: {
        provider: "imessage-handle",
        externalId: "ari@mendelow.me",
        rawId: "ari@mendelow.me",
        displayName: "ari@mendelow.me",
      },
      chat: dmChat,
      text: "",
      textForAgent: "[audio attachment: Audio Message.mp3]",
      attachments: [{ guid: "audio-guid", mimeType: "audio/mp3", transferName: "Audio Message.mp3" }],
      hasPayloadData: false,
      requiresRepair: true,
    })

    expect(result.requiresRepair).toBe(false)
    expect(result.textForAgent).toContain("audio attachment")
    expect(result).toEqual(
      expect.objectContaining({
        repairNotice: expect.stringContaining("network down"),
      }),
    )
  })

  it("falls back to an unknown error body when reading the error response fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockRejectedValue(new Error("no body")),
    }) as typeof fetch

    const { createBlueBubblesClient } = await import("../../senses/bluebubbles-client")
    const client = createBlueBubblesClient(
      {
        serverUrl: "http://bluebubbles.local",
        password: "secret-token",
        accountId: "default",
      },
      {
        port: 18790,
        webhookPath: "/bluebubbles-webhook",
        requestTimeoutMs: 30000,
      },
    )

    await expect(
      client.sendText({
        chat: {
          chatGuid: "any;-;ari@mendelow.me",
          chatIdentifier: "ari@mendelow.me",
          isGroup: false,
          sessionKey: "chat:any;-;ari@mendelow.me",
          sendTarget: { kind: "chat_guid", value: "any;-;ari@mendelow.me" },
        },
        text: "hello",
      }),
    ).rejects.toThrow("BlueBubbles send failed (500): unknown")
  })
})
