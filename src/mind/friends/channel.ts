// Channel capabilities -- hardcoded const map keyed by channel identifier.
// Pure lookup, no I/O, cannot fail. Unknown channel gets minimal defaults.

import type { ChannelCapabilities } from "./types"

const CHANNEL_CAPABILITIES: Record<string, ChannelCapabilities> = {
  cli: {
    channel: "cli",
    availableIntegrations: [],
    supportsMarkdown: false,
    supportsStreaming: true,
    supportsRichCards: false,
    maxMessageLength: Infinity,
  },
  teams: {
    channel: "teams",
    availableIntegrations: ["ado", "graph"],
    supportsMarkdown: true,
    supportsStreaming: true,
    supportsRichCards: true,
    maxMessageLength: Infinity,
  },
}

const DEFAULT_CAPABILITIES: ChannelCapabilities = {
  channel: "cli",
  availableIntegrations: [],
  supportsMarkdown: false,
  supportsStreaming: false,
  supportsRichCards: false,
  maxMessageLength: Infinity,
}

export function getChannelCapabilities(channel: string): ChannelCapabilities {
  return CHANNEL_CAPABILITIES[channel] ?? DEFAULT_CAPABILITIES
}
