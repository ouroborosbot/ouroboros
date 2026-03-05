export interface RequiredEvent {
  component: string
  event: string
}

export const REQUIRED_EVENTS: RequiredEvent[] = [
  { component: "engine", event: "engine.turn_start" },
  { component: "engine", event: "engine.turn_end" },
  { component: "engine", event: "engine.error" },
  { component: "mind", event: "mind.step_start" },
  { component: "mind", event: "mind.step_end" },
  { component: "tools", event: "tool.start" },
  { component: "tools", event: "tool.end" },
  { component: "tools", event: "tool.error" },
  { component: "channels", event: "channel.message_sent" },
  { component: "channels", event: "channel.error" },
  { component: "config/identity", event: "config.load" },
  { component: "config/identity", event: "identity.resolve" },
  { component: "config/identity", event: "config_identity.error" },
  { component: "clients", event: "client.request_start" },
  { component: "clients", event: "client.request_end" },
  { component: "clients", event: "client.error" },
  { component: "repertoire", event: "repertoire.load_start" },
  { component: "repertoire", event: "repertoire.load_end" },
  { component: "repertoire", event: "repertoire.error" },
  { component: "channels", event: "channel.verify_state" },
  { component: "channels", event: "channel.message_received" },
  { component: "channels", event: "channel.token_status" },
  { component: "channels", event: "channel.signin_result" },
  { component: "channels", event: "channel.signin_error" },
  { component: "channels", event: "channel.handler_error" },
  { component: "channels", event: "channel.unhandled_rejection" },
  { component: "channels", event: "channel.app_error" },
  { component: "channels", event: "channel.app_started" },
  { component: "engine", event: "engine.provider_init_error" },
  { component: "friends", event: "friends.persist_error" },
]

export const REQUIRED_ENVELOPE_FIELDS = [
  "ts",
  "level",
  "event",
  "trace_id",
  "component",
  "message",
  "meta",
] as const

export const SENSITIVE_PATTERNS: RegExp[] = [
  /\btoken\s*[:=]/i,
  /\bapi[_-]?key\b/i,
  /\bpassword\b/i,
  /\bsecret\b/i,
  /\bauthorization\b/i,
]

export function eventKey(component: string, event: string): string {
  return `${component}:${event}`
}

export function getRequiredEventKeys(): string[] {
  return REQUIRED_EVENTS.map((item) => eventKey(item.component, item.event))
}

export function getDeclaredLogpoints(): string[] {
  return getRequiredEventKeys()
}
