import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const emitNervesEvent = vi.fn()

vi.mock("../../nerves/runtime", () => ({
  emitNervesEvent: (...args: any[]) => emitNervesEvent(...args),
}))

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

    const chat = {
      chatGuid: "any;-;ari@mendelow.me",
      chatIdentifier: "ari@mendelow.me",
      isGroup: false,
      sessionKey: "chat:any;-;ari@mendelow.me",
      sendTarget: { kind: "chat_guid", value: "any;-;ari@mendelow.me" } as const,
    }

    await expect(client.sendText({ chat, text: "hello once" })).resolves.toEqual({ messageGuid: undefined })
    await expect(client.sendText({ chat, text: "hello twice" })).resolves.toEqual({ messageGuid: undefined })
    await expect(client.sendText({ chat, text: "hello thrice" })).resolves.toEqual({ messageGuid: undefined })

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
      chat,
      text: "hi",
      textForAgent: "hi",
      attachments: [],
      hasPayloadData: false,
      requiresRepair: false,
    }

    await expect(client.repairEvent(event)).resolves.toBe(event)
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
