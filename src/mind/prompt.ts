import * as fs from "fs";
import * as path from "path";
import { getModel, getProvider } from "../heart/core";
import { getAzureConfig } from "../config";
import { finalAnswerTool, getToolsForChannel } from "../repertoire/tools";
import { listSkills } from "../repertoire/skills";
import { getAgentRoot, getAgentName } from "../identity";
import type { ResolvedContext } from "./friends/types";
import { getChannelCapabilities } from "./friends/channel";

// Lazy-loaded psyche text cache
let _psycheCache: { soul: string; identity: string; lore: string; friends: string } | null = null;

function loadPsycheFile(name: string): string {
  try {
    const psycheDir = path.join(getAgentRoot(), "psyche");
    return fs.readFileSync(path.join(psycheDir, name), "utf-8").trim();
  } catch {
    return "";
  }
}

function loadPsyche(): { soul: string; identity: string; lore: string; friends: string } {
  if (_psycheCache) return _psycheCache;
  _psycheCache = {
    soul: loadPsycheFile("SOUL.md"),
    identity: loadPsycheFile("IDENTITY.md"),
    lore: loadPsycheFile("LORE.md"),
    friends: loadPsycheFile("FRIENDS.md"),
  };
  return _psycheCache;
}

export function resetPsycheCache(): void {
  _psycheCache = null;
}

export type Channel = "cli" | "teams";

function soulSection(): string {
  return loadPsyche().soul;
}

function identitySection(): string {
  return loadPsyche().identity;
}

function loreSection(): string {
  const text = loadPsyche().lore;
  if (!text) return "";
  return `## my lore\n${text}`;
}

function friendsSection(): string {
  const text = loadPsyche().friends;
  if (!text) return "";
  return `## my friends\n${text}`;
}

export function runtimeInfoSection(channel: Channel): string {
  const lines: string[] = [];
  const agentName = getAgentName();

  lines.push(`## runtime`);
  lines.push(`agent: ${agentName}`);
  lines.push(`cwd: ${process.cwd()}`);
  lines.push(`channel: ${channel}`);
  lines.push(`i can read and modify my own source code.`);

  if (channel === "cli") {
    lines.push("i introduce myself on boot with a fun random greeting.");
  } else {
    lines.push(
      "i am responding in Microsoft Teams. i keep responses concise. i use markdown formatting. i do not introduce myself on boot.",
    );
  }

  return lines.join("\n");
}

function providerSection(): string {
  const model = getModel();
  const provider = getProvider() === "azure"
    ? `azure openai (${getAzureConfig().deployment || "default"}, model: ${model})`
    : `minimax (${model})`;
  return `## my provider\n${provider}`;
}

function dateSection(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `current date: ${today}`;
}

function toolsSection(channel: Channel, options?: BuildSystemOptions): string {
  const channelTools = getToolsForChannel(getChannelCapabilities(channel));
  const activeTools = options?.toolChoiceRequired ? [...channelTools, finalAnswerTool] : channelTools;
  const list = activeTools
    .map((t) => `- ${t.function.name}: ${t.function.description}`)
    .join("\n");
  return `## my tools\n${list}`;
}

function skillsSection(): string {
  const names = listSkills() || [];
  if (!names.length) return "";
  return `## my skills (use load_skill to activate)\n${names.join(", ")}`;
}

export interface BuildSystemOptions {
  toolChoiceRequired?: boolean;
  disableStreaming?: boolean;
}

// Returns a "## my flags" section when runtime flags alter agent behavior.
// Currently only handles disableStreaming for the Teams channel.
//
// Rationale for --disable-streaming (research findings):
// - devtunnel nginx relay buffers chunked/SSE responses (microsoft/dev-tunnels#518)
// - 60-second hard timeout on web-forwarded connections via devtunnels.ms
// - No HTTP/2 support on devtunnels.ms (falls back to HTTP/1.1)
// - Teams SDK throttles streaming update() calls to 1 req/sec
// - Combined, these limitations cause chunked streaming to be extremely slow
//   over devtunnel: each chunk waits for relay buffering + throttle, compounding
//   into multi-minute latencies for even short responses
// - Buffering all text and sending as a single emit() avoids the compounding
//   latency entirely, delivering responses in seconds instead of minutes
export function flagsSection(channel: Channel, options?: BuildSystemOptions): string {
  if (!options?.disableStreaming || channel !== "teams") return "";
  return `## my flags
streaming to Teams is disabled. my text responses are buffered and sent as a single message after i finish generating. the user will not see incremental text output, only status updates (thinking phrases, tool names).

**why**: the devtunnel nginx relay buffers chunked/SSE responses (microsoft/dev-tunnels#518), there is a 60-second hard timeout on web-forwarded connections, no HTTP/2 support on devtunnels.ms, and Teams throttles streaming updates to 1 req/sec. combined, these cause compounding latency that makes chunked streaming extremely slow over devtunnel. buffering avoids this entirely.`;
}

function toolBehaviorSection(options?: BuildSystemOptions): string {
  if (!options?.toolChoiceRequired) return "";
  return `## tool behavior
tool_choice is set to "required" — you MUST call a tool on every turn.
when you have finished all work and want to give a text response, call the \`final_answer\` tool with your response text.
\`final_answer\` must be the ONLY tool call in that turn. do not combine it with other tool calls.`;
}

export function contextSection(context?: ResolvedContext): string {
  if (!context) return ""

  const lines: string[] = ["## friend context"]

  const friendOrIdentity = context.friend
  if (!friendOrIdentity) return ""
  const emailId = friendOrIdentity.externalIds.find(e => e.provider === "aad")
  const idDisplay = emailId
    ? `${friendOrIdentity.displayName} (${emailId.externalId})`
    : friendOrIdentity.displayName
  lines.push(`friend: ${idDisplay}`)

  // Channel
  const ch = context.channel
  const traits: string[] = []
  if (ch.supportsMarkdown) traits.push("markdown")
  if (!ch.supportsStreaming) traits.push("no streaming")
  if (ch.supportsStreaming) traits.push("streaming")
  if (ch.supportsRichCards) traits.push("rich cards")
  if (ch.maxMessageLength !== Infinity) traits.push(`max ${ch.maxMessageLength} chars`)
  /* v8 ignore next -- empty-traits branch unreachable: streaming/no-streaming always adds a trait @preserve */
  lines.push(`channel: ${ch.channel}${traits.length ? ` (${traits.join(", ")})` : ""}`)

  // Friend record and state detection (friend is guaranteed non-null here -- checked above)
  const friend = context.friend!
  const notes = friend.notes
  const prefs = friend.toolPreferences
  const hasNotes = Object.keys(notes).length > 0
  const hasPrefs = Object.keys(prefs).length > 0
  const isNewFriend = !hasNotes && !hasPrefs

  // Priority guidance
  lines.push("")
  lines.push("my friend's request comes first. i help with what they need before social niceties.")

  // Name quality instruction
  lines.push("i prefer to use whatever name my friend prefers. if i learn a preferred name, i save it with save_friend_note.")

  // Memory ephemerality instruction
  lines.push("my conversation memory is ephemeral -- it resets between sessions. to remember something important about my friend, i use save_friend_note to write it to disk for future me.")

  // Working-memory trust instruction
  lines.push("the conversation is my source of truth. my notes are a journal for future me -- they may be stale or incomplete.")

  // Stale notes awareness instruction
  lines.push("when i learn something that might invalidate an existing note, i check related notes and update or override any that are stale.")

  // New-friend behavior
  if (isNewFriend) {
    lines.push("this is a new friend -- i have no notes or preferences saved yet. i should learn their name and how they like to work, and save what i learn.")
  }

  // Friend notes (from FriendRecord -- rendered in system prompt, NOT toolPreferences)
  if (hasNotes) {
    lines.push("")
    lines.push("## what i know about this friend")
    for (const [key, value] of Object.entries(notes)) {
      lines.push(`- ${key}: ${value}`)
    }
  }

  return lines.join("\n")
}

export async function buildSystem(channel: Channel = "cli", options?: BuildSystemOptions, context?: ResolvedContext): Promise<string> {
  return [
    soulSection(),
    identitySection(),
    loreSection(),
    friendsSection(),
    runtimeInfoSection(channel),
    flagsSection(channel, options),
    providerSection(),
    dateSection(),
    toolsSection(channel, options),
    skillsSection(),
    toolBehaviorSection(options),
    contextSection(context),
  ]
    .filter(Boolean)
    .join("\n\n");
}
