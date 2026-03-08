import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EventEmitter } from "node:events"

const mocks = vi.hoisted(() => ({
  runAgent: vi.fn(),
  buildSystem: vi.fn().mockResolvedValue("system prompt"),
  createSummarize: vi.fn(() => vi.fn()),
  sessionPath: vi.fn().mockReturnValue("/tmp/bluebubbles-session.json"),
  getBlueBubblesConfig: vi.fn().mockReturnValue({
    serverUrl: "http://bluebubbles.local",
    password: "secret-token",
    accountId: "default",
  }),
  getBlueBubblesChannelConfig: vi.fn().mockReturnValue({
    port: 18790,
    webhookPath: "/bluebubbles-webhook",
    requestTimeoutMs: 30000,
  }),
  loadSession: vi.fn().mockReturnValue(null),
  postTurn: vi.fn(),
  accumulateFriendTokens: vi.fn(),
  resolveContext: vi.fn(),
  resolverCtor: vi.fn(),
  storeCtor: vi.fn(),
  emitNervesEvent: vi.fn(),
  sendText: vi.fn().mockResolvedValue({ messageGuid: "sent-guid" }),
  repairEvent: vi.fn(async (event: unknown) => event),
  createServer: vi.fn(),
  listen: vi.fn((_: number, cb?: () => void) => cb?.()),
}))

vi.mock("../../heart/core", () => ({
  runAgent: (...args: any[]) => mocks.runAgent(...args),
  createSummarize: () => mocks.createSummarize(),
}))

vi.mock("../../mind/prompt", () => ({
  buildSystem: (...args: any[]) => mocks.buildSystem(...args),
}))

vi.mock("../../heart/config", () => ({
  sessionPath: (...args: any[]) => mocks.sessionPath(...args),
  getBlueBubblesConfig: (...args: any[]) => mocks.getBlueBubblesConfig(...args),
  getBlueBubblesChannelConfig: (...args: any[]) => mocks.getBlueBubblesChannelConfig(...args),
}))

vi.mock("../../mind/context", () => ({
  loadSession: (...args: any[]) => mocks.loadSession(...args),
  postTurn: (...args: any[]) => mocks.postTurn(...args),
  deleteSession: vi.fn(),
}))

vi.mock("../../mind/friends/tokens", () => ({
  accumulateFriendTokens: (...args: any[]) => mocks.accumulateFriendTokens(...args),
}))

vi.mock("../../mind/friends/store-file", () => ({
  FileFriendStore: vi.fn(function (this: any, root: string) {
    mocks.storeCtor(root)
    this.get = vi.fn()
    this.put = vi.fn()
    this.delete = vi.fn()
    this.findByExternalId = vi.fn()
    this.hasAnyFriends = vi.fn().mockResolvedValue(true)
  }),
}))

vi.mock("../../mind/friends/resolver", () => ({
  FriendResolver: vi.fn(function (this: any, store: unknown, params: unknown) {
    mocks.resolverCtor(store, params)
    this.resolve = (...args: any[]) => mocks.resolveContext(...args)
  }),
}))

vi.mock("../../nerves/runtime", () => ({
  emitNervesEvent: (...args: any[]) => mocks.emitNervesEvent(...args),
}))

vi.mock("../../senses/bluebubbles-client", () => ({
  createBlueBubblesClient: vi.fn(() => ({
    sendText: (...args: any[]) => mocks.sendText(...args),
    repairEvent: (...args: any[]) => mocks.repairEvent(...args),
  })),
}))

vi.mock("node:http", () => ({
  createServer: (...args: any[]) => mocks.createServer(...args),
}))

const dmThreadPayload = {
  type: "new-message",
  data: {
    guid: "C4B2E437-A373-43F6-9740-9CD84E5893A0",
    text: "threaded reply",
    handle: {
      address: "ari@mendelow.me",
      service: "iMessage",
    },
    attachments: [],
    dateCreated: 1772946888623,
    isFromMe: false,
    threadOriginatorGuid: "54D4109C-7170-41A1-8161-F6F8C863CC0D",
    chats: [
      {
        guid: "any;-;ari@mendelow.me",
        style: 45,
        chatIdentifier: "ari@mendelow.me",
        displayName: "",
      },
    ],
  },
}

const groupThreadPayload = {
  type: "new-message",
  data: {
    guid: "E29915DA-FC59-412A-BACC-B5EEDBA414EB",
    text: "yay!",
    handle: {
      address: "ari@mendelow.me",
      service: "iMessage",
    },
    attachments: [],
    dateCreated: 1772947679927,
    isFromMe: false,
    threadOriginatorGuid: "3E02B90F-D374-4381-BDD2-3572D3EB1195",
    chats: [
      {
        guid: "any;+;35820e69c97c459992d29a334f412979",
        style: 43,
        chatIdentifier: "35820e69c97c459992d29a334f412979",
        displayName: "Consciousness TBD",
      },
    ],
  },
}

const reactionPayload = {
  type: "new-message",
  data: {
    guid: "BA2CFB68-52D2-4D8F-8A33-394C37035347",
    text: "Loved “great”",
    handle: {
      address: "ari@mendelow.me",
      service: "iMessage",
    },
    attachments: [],
    dateCreated: 1772948058386,
    isFromMe: false,
    associatedMessageGuid: "p:0/CB4EB152-A678-4F0E-8075-1AB09B5496F8",
    associatedMessageType: "love",
    chats: [
      {
        guid: "any;-;ari@mendelow.me",
        style: 45,
        chatIdentifier: "ari@mendelow.me",
        displayName: "",
      },
    ],
  },
}

const readPayload = {
  type: "updated-message",
  data: {
    guid: "174D57C8-5985-4528-8539-E4DBD777FE59",
    text: "still here",
    handle: {
      address: "ari@mendelow.me",
      service: "iMessage",
    },
    attachments: [],
    dateCreated: 1772948413321,
    dateRead: 1772948415000,
    isFromMe: false,
    chats: [
      {
        guid: "any;-;ari@mendelow.me",
        style: 45,
        chatIdentifier: "ari@mendelow.me",
        displayName: "",
      },
    ],
  },
}

function resetMocks(): void {
  mocks.runAgent.mockReset().mockImplementation(async (_messages: any, callbacks: any) => {
    callbacks.onModelStart()
    callbacks.onTextChunk("got it")
    return {
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        reasoning_tokens: 0,
        total_tokens: 15,
      },
    }
  })
  mocks.buildSystem.mockReset().mockResolvedValue("system prompt")
  mocks.sessionPath.mockReset().mockReturnValue("/tmp/bluebubbles-session.json")
  mocks.getBlueBubblesConfig.mockReset().mockReturnValue({
    serverUrl: "http://bluebubbles.local",
    password: "secret-token",
    accountId: "default",
  })
  mocks.getBlueBubblesChannelConfig.mockReset().mockReturnValue({
    port: 18790,
    webhookPath: "/bluebubbles-webhook",
    requestTimeoutMs: 30000,
  })
  mocks.loadSession.mockReset().mockReturnValue(null)
  mocks.postTurn.mockReset()
  mocks.accumulateFriendTokens.mockReset()
  mocks.resolveContext.mockReset().mockResolvedValue({
    friend: {
      id: "friend-uuid",
      name: "Ari",
      externalIds: [],
      tenantMemberships: [],
      toolPreferences: {},
      notes: {},
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      schemaVersion: 1,
    },
    channel: {
      channel: "bluebubbles",
      availableIntegrations: [],
      supportsMarkdown: false,
      supportsStreaming: false,
      supportsRichCards: false,
      maxMessageLength: Infinity,
    },
  })
  mocks.resolverCtor.mockReset()
  mocks.storeCtor.mockReset()
  mocks.emitNervesEvent.mockReset()
  mocks.sendText.mockReset().mockResolvedValue({ messageGuid: "sent-guid" })
  mocks.repairEvent.mockReset().mockImplementation(async (event: unknown) => event)
  mocks.listen.mockReset().mockImplementation((_: number, cb?: () => void) => cb?.())
  mocks.createServer.mockReset().mockImplementation((handler: unknown) => ({
    listen: mocks.listen,
    close: vi.fn(),
    handler,
  }))
}

function createMockRequest(method: string, url: string, body?: unknown): EventEmitter & {
  method: string
  url: string
  headers: Record<string, string>
} {
  const req = new EventEmitter() as EventEmitter & {
    method: string
    url: string
    headers: Record<string, string>
  }
  req.method = method
  req.url = url
  req.headers = { "content-type": "application/json" }
  queueMicrotask(() => {
    if (typeof body !== "undefined") {
      const payload = typeof body === "string" ? body : JSON.stringify(body)
      req.emit("data", Buffer.from(payload))
    }
    req.emit("end")
  })
  return req
}

function createMockResponse() {
  let statusCode = 200
  const headers = new Map<string, string>()
  let body = ""
  let resolver: (() => void) | null = null
  const done = new Promise<void>((resolve) => {
    resolver = resolve
  })

  const res = {
    get statusCode() {
      return statusCode
    },
    set statusCode(value: number) {
      statusCode = value
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value)
    },
    writeHead(code: number, nextHeaders?: Record<string, string>) {
      statusCode = code
      for (const [name, value] of Object.entries(nextHeaders ?? {})) {
        headers.set(name.toLowerCase(), value)
      }
    },
    end(chunk?: string | Buffer) {
      if (typeof chunk !== "undefined") {
        body += chunk.toString()
      }
      resolver?.()
    },
  }

  return {
    res,
    done,
    getBody: () => body,
    getHeader: (name: string) => headers.get(name.toLowerCase()),
  }
}

describe("BlueBubbles sense runtime", () => {
  beforeEach(() => {
    vi.resetModules()
    resetMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("handles DM threaded messages with stable session routing and a threaded send target", async () => {
    const bluebubbles = await import("../../senses/bluebubbles")
    await bluebubbles.handleBlueBubblesEvent(dmThreadPayload)

    expect(mocks.sessionPath).toHaveBeenCalledWith(
      "friend-uuid",
      "bluebubbles",
      "chat:any;-;ari@mendelow.me:thread:54D4109C-7170-41A1-8161-F6F8C863CC0D",
    )
    expect(mocks.buildSystem).toHaveBeenCalledWith(
      "bluebubbles",
      undefined,
      expect.objectContaining({
        friend: expect.objectContaining({ id: "friend-uuid" }),
        channel: expect.objectContaining({ channel: "bluebubbles" }),
      }),
    )
    expect(mocks.runAgent).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: "system", content: "system prompt" }),
        expect.objectContaining({ role: "user", content: "threaded reply" }),
      ]),
      expect.any(Object),
      "bluebubbles",
      expect.any(AbortSignal),
      expect.objectContaining({
        toolContext: expect.objectContaining({
          context: expect.objectContaining({
            friend: expect.objectContaining({ id: "friend-uuid" }),
          }),
        }),
      }),
    )
    expect(mocks.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        chat: expect.objectContaining({ chatGuid: "any;-;ari@mendelow.me" }),
        replyToMessageGuid: "C4B2E437-A373-43F6-9740-9CD84E5893A0",
        text: "got it",
      }),
    )
    expect(mocks.postTurn).toHaveBeenCalledTimes(1)
    expect(mocks.accumulateFriendTokens).toHaveBeenCalledWith(
      expect.anything(),
      "friend-uuid",
      expect.objectContaining({ total_tokens: 15 }),
    )
  })

  it("uses group chat identity rather than sender handle instability for group sessions", async () => {
    mocks.resolveContext.mockResolvedValueOnce({
      friend: {
        id: "group-uuid",
        name: "Consciousness TBD",
        externalIds: [],
        tenantMemberships: [],
        toolPreferences: {},
        notes: {},
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
        schemaVersion: 1,
      },
      channel: {
        channel: "bluebubbles",
        availableIntegrations: [],
        supportsMarkdown: false,
        supportsStreaming: false,
        supportsRichCards: false,
        maxMessageLength: Infinity,
      },
    })

    const bluebubbles = await import("../../senses/bluebubbles")
    await bluebubbles.handleBlueBubblesEvent(groupThreadPayload)

    expect(mocks.resolverCtor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: "imessage-handle",
        externalId: "group:any;+;35820e69c97c459992d29a334f412979",
        displayName: "Consciousness TBD",
        channel: "bluebubbles",
      }),
    )
    expect(mocks.sessionPath).toHaveBeenCalledWith(
      "group-uuid",
      "bluebubbles",
      "chat:any;+;35820e69c97c459992d29a334f412979:thread:3E02B90F-D374-4381-BDD2-3572D3EB1195",
    )
    expect(mocks.runAgent.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "ari@mendelow.me: yay!" }),
      ]),
    )
    expect(mocks.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        chat: expect.objectContaining({
          chatGuid: "any;+;35820e69c97c459992d29a334f412979",
          displayName: "Consciousness TBD",
        }),
      }),
    )
  })

  it("runs notifyable mutations but returns explicit non-agent handling for read-only state changes", async () => {
    const bluebubbles = await import("../../senses/bluebubbles")

    const reactionResult = await bluebubbles.handleBlueBubblesEvent(reactionPayload)
    const runAgentCallCount = mocks.runAgent.mock.calls.length
    const readResult = await bluebubbles.handleBlueBubblesEvent(readPayload)

    expect(reactionResult).toEqual(
      expect.objectContaining({
        handled: true,
        notifiedAgent: true,
        kind: "mutation",
      }),
    )
    expect(runAgentCallCount).toBe(1)
    expect(readResult).toEqual(
      expect.objectContaining({
        handled: true,
        notifiedAgent: false,
        reason: "mutation_state_only",
      }),
    )
    expect(mocks.runAgent).toHaveBeenCalledTimes(1)
  })

  it("accepts valid webhook posts and rejects incorrect webhook passwords", async () => {
    const bluebubbles = await import("../../senses/bluebubbles")
    const handler = bluebubbles.createBlueBubblesWebhookHandler()

    const unauthorizedReq = createMockRequest(
      "POST",
      "/bluebubbles-webhook?password=wrong-token",
      dmThreadPayload,
    )
    const unauthorizedRes = createMockResponse()
    await handler(unauthorizedReq as any, unauthorizedRes.res as any)
    await unauthorizedRes.done

    expect(unauthorizedRes.res.statusCode).toBe(401)
    expect(mocks.runAgent).not.toHaveBeenCalled()

    const authorizedReq = createMockRequest(
      "POST",
      "/bluebubbles-webhook?password=secret-token",
      dmThreadPayload,
    )
    const authorizedRes = createMockResponse()
    await handler(authorizedReq as any, authorizedRes.res as any)
    await authorizedRes.done

    expect(authorizedRes.res.statusCode).toBe(200)
    expect(authorizedRes.getHeader("content-type")).toContain("application/json")
    expect(authorizedRes.getBody()).toContain("\"handled\":true")
    expect(mocks.runAgent).toHaveBeenCalledTimes(1)
  })

  it("starts an HTTP server on the configured BlueBubbles port", async () => {
    const bluebubbles = await import("../../senses/bluebubbles")
    bluebubbles.startBlueBubblesApp()

    expect(mocks.createServer).toHaveBeenCalledTimes(1)
    expect(mocks.listen).toHaveBeenCalledWith(18790, expect.any(Function))
  })
})
