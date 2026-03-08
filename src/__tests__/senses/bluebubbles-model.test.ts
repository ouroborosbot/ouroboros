import { describe, expect, it } from "vitest"

const dmOgPayload = {
  type: "new-message",
  data: {
    guid: "CCDE56E5-8D22-4DF9-B1A8-98E868A1B234",
    text: "https://ouroboros.bot",
    handle: {
      address: "ari@mendelow.me",
      service: "iMessage",
      country: "US",
    },
    attachments: [
      {
        guid: "BD74C362-B41E-43D2-BD13-E3F984F5E6E5",
        transferName: "0701F4A6-4C84-4265-9666-8B97FD19CE0B.pluginPayloadAttachment",
        totalBytes: 1239,
      },
      {
        guid: "D79C1BC9-A31F-4FA8-B6C0-A3AB4062E082",
        transferName: "FEA3D9B6-605B-4F1A-9AA1-98F05A8CAB58.pluginPayloadAttachment",
        totalBytes: 65917,
      },
    ],
    dateCreated: 1772944130631,
    isDelivered: true,
    isFromMe: false,
    balloonBundleId: "com.apple.messages.URLBalloonProvider",
    associatedMessageGuid: null,
    associatedMessageType: null,
    threadOriginatorGuid: null,
    hasPayloadData: true,
    chats: [
      {
        guid: "any;-;ari@mendelow.me",
        style: 45,
        chatIdentifier: "ari@mendelow.me",
        displayName: "",
      },
    ],
    dateEdited: null,
    dateRetracted: null,
    partCount: 1,
  },
}

const dmImagePayload = {
  type: "new-message",
  data: {
    guid: "E6451C2E-CDFA-4C12-9C1B-ADD8D2F2DEB4",
    text: "",
    handle: {
      address: "ari@mendelow.me",
      service: "iMessage",
      country: "US",
    },
    attachments: [
      {
        guid: "5FBD7BDD-EE5C-46BC-8C02-9E277E8A3EF3",
        uti: "public.heic",
        mimeType: "image/jpeg",
        transferName: "IMG_5045.heic.jpeg",
        totalBytes: 3789572,
        height: 800,
        width: 600,
      },
    ],
    dateCreated: 1772946699113,
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

const dmAudioPayload = {
  type: "new-message",
  data: {
    guid: "5D50082A-49A1-46C5-BB71-58C60A0EB3A8",
    text: "",
    handle: {
      address: "ari@mendelow.me",
      service: "iMessage",
      country: "US",
    },
    attachments: [
      {
        guid: "5E5B5B46-382E-46EF-97F8-F582D8209B79",
        uti: "com.apple.coreaudio-format",
        mimeType: "audio/mp3",
        transferName: "Audio Message.mp3.mp3",
        totalBytes: 11495,
      },
    ],
    dateCreated: 1772946845074,
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

const dmThreadPayload = {
  type: "new-message",
  data: {
    guid: "C4B2E437-A373-43F6-9740-9CD84E5893A0",
    text: "threaded reply",
    handle: {
      address: "ari@mendelow.me",
      service: "iMessage",
      country: "US",
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
      country: "US",
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
    text: "Loved “yep, threaded replies solid. both came through with the correct quoted message”",
    handle: {
      address: "ari@mendelow.me",
      service: "iMessage",
      country: "US",
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

const editedPayload = {
  type: "updated-message",
  data: {
    guid: "4A4F2A85-21AD-4AC6-98A8-34B8F4D07AA9",
    text: "edited version",
    handle: {
      address: "ari@mendelow.me",
      service: "iMessage",
      country: "US",
    },
    attachments: [],
    dateCreated: 1772949000000,
    dateEdited: 1772949005000,
    dateRetracted: null,
    isDelivered: true,
    dateRead: null,
    associatedMessageGuid: null,
    associatedMessageType: null,
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

const unsentPayload = {
  type: "updated-message",
  data: {
    guid: "A9C0AB3C-858A-42BC-9951-66A5C9B1B2B8",
    text: "",
    handle: {
      address: "ari@mendelow.me",
      service: "iMessage",
      country: "US",
    },
    attachments: [],
    dateCreated: 1772949100000,
    dateEdited: null,
    dateRetracted: 1772949105000,
    isDelivered: true,
    dateRead: null,
    associatedMessageGuid: null,
    associatedMessageType: null,
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
    text: "still here — are you testing message delivery or do you need something?",
    handle: {
      address: "ari@mendelow.me",
      service: "iMessage",
      country: "US",
    },
    attachments: [],
    dateCreated: 1772948413321,
    dateEdited: null,
    dateRetracted: null,
    isDelivered: true,
    dateRead: 1772948415000,
    associatedMessageGuid: null,
    associatedMessageType: null,
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

describe("normalizeBlueBubblesEvent", () => {
  it("normalizes a DM OG-card message with explicit fallback context", async () => {
    const { normalizeBlueBubblesEvent } = await import("../../senses/bluebubbles-model")
    const result = normalizeBlueBubblesEvent(dmOgPayload)

    expect(result.kind).toBe("message")
    expect(result.chat.isGroup).toBe(false)
    expect(result.chat.sessionKey).toBe("chat:any;-;ari@mendelow.me")
    expect(result.sender.externalId).toBe("ari@mendelow.me")
    expect(result.messageGuid).toBe("CCDE56E5-8D22-4DF9-B1A8-98E868A1B234")
    expect(result.textForAgent).toContain("https://ouroboros.bot")
    expect(result.textForAgent).toContain("link preview")
    expect(result.attachments).toHaveLength(2)
  })

  it("normalizes image attachments into explicit fallback text", async () => {
    const { normalizeBlueBubblesEvent } = await import("../../senses/bluebubbles-model")
    const result = normalizeBlueBubblesEvent(dmImagePayload)

    expect(result.kind).toBe("message")
    expect(result.textForAgent).toContain("image attachment")
    expect(result.textForAgent).toContain("IMG_5045.heic.jpeg")
  })

  it("normalizes audio attachments into explicit fallback text", async () => {
    const { normalizeBlueBubblesEvent } = await import("../../senses/bluebubbles-model")
    const result = normalizeBlueBubblesEvent(dmAudioPayload)

    expect(result.kind).toBe("message")
    expect(result.textForAgent).toContain("audio attachment")
    expect(result.textForAgent).toContain("Audio Message.mp3.mp3")
  })

  it("uses threadOriginatorGuid to derive a DM thread session", async () => {
    const { normalizeBlueBubblesEvent } = await import("../../senses/bluebubbles-model")
    const result = normalizeBlueBubblesEvent(dmThreadPayload)

    expect(result.kind).toBe("message")
    expect(result.chat.sessionKey).toBe(
      "chat:any;-;ari@mendelow.me:thread:54D4109C-7170-41A1-8161-F6F8C863CC0D",
    )
    expect(result.replyToGuid).toBe("54D4109C-7170-41A1-8161-F6F8C863CC0D")
  })

  it("uses group chat identity plus threadOriginatorGuid for group thread sessions", async () => {
    const { normalizeBlueBubblesEvent } = await import("../../senses/bluebubbles-model")
    const result = normalizeBlueBubblesEvent(groupThreadPayload)

    expect(result.kind).toBe("message")
    expect(result.chat.isGroup).toBe(true)
    expect(result.chat.displayName).toBe("Consciousness TBD")
    expect(result.chat.sessionKey).toBe(
      "chat:any;+;35820e69c97c459992d29a334f412979:thread:3E02B90F-D374-4381-BDD2-3572D3EB1195",
    )
  })

  it("normalizes associated-message reactions as first-class mutations", async () => {
    const { normalizeBlueBubblesEvent } = await import("../../senses/bluebubbles-model")
    const result = normalizeBlueBubblesEvent(reactionPayload)

    expect(result.kind).toBe("mutation")
    expect(result.mutationType).toBe("reaction")
    expect(result.shouldNotifyAgent).toBe(true)
    expect(result.targetMessageGuid).toBe("CB4EB152-A678-4F0E-8075-1AB09B5496F8")
    expect(result.textForAgent).toContain("reacted with")
  })

  it("normalizes edited-message updates as notifyable mutations", async () => {
    const { normalizeBlueBubblesEvent } = await import("../../senses/bluebubbles-model")
    const result = normalizeBlueBubblesEvent(editedPayload)

    expect(result.kind).toBe("mutation")
    expect(result.mutationType).toBe("edit")
    expect(result.shouldNotifyAgent).toBe(true)
    expect(result.textForAgent).toContain("edited")
    expect(result.textForAgent).toContain("edited version")
  })

  it("normalizes unsent-message updates as notifyable mutations", async () => {
    const { normalizeBlueBubblesEvent } = await import("../../senses/bluebubbles-model")
    const result = normalizeBlueBubblesEvent(unsentPayload)

    expect(result.kind).toBe("mutation")
    expect(result.mutationType).toBe("unsend")
    expect(result.shouldNotifyAgent).toBe(true)
    expect(result.textForAgent).toContain("unsent")
  })

  it("normalizes read/delivery state changes without dropping them silently", async () => {
    const { normalizeBlueBubblesEvent } = await import("../../senses/bluebubbles-model")
    const result = normalizeBlueBubblesEvent(readPayload)

    expect(result.kind).toBe("mutation")
    expect(result.mutationType).toBe("read")
    expect(result.shouldNotifyAgent).toBe(false)
    expect(result.chat.sessionKey).toBe("chat:any;-;ari@mendelow.me")
  })
})
