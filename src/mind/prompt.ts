import * as fs from "fs";
import * as path from "path";
import { getModel, getProvider } from "../heart/core";
import { getAzureConfig } from "../config";
import { finalAnswerTool, getToolsForChannel } from "../repertoire/tools";
import { listSkills } from "../repertoire/skills";
import { getAgentRoot, getAgentName } from "../identity";
import type { ResolvedContext } from "./friends/types";
import { getChannelCapabilities } from "./friends/channel";
import { emitNervesEvent } from "../nerves/runtime";

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
  const activeTools = (options?.toolChoiceRequired ?? true) ? [...channelTools, finalAnswerTool] : channelTools;
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
}

function toolBehaviorSection(options?: BuildSystemOptions): string {
  if (!(options?.toolChoiceRequired ?? true)) return "";
  return `## tool behavior
tool_choice is set to "required" -- i must call a tool on every turn.
- need more information? i call a tool.
- ready to respond to the user? i call \`final_answer\`.
\`final_answer\` is a tool call -- it satisfies the tool_choice requirement.
\`final_answer\` must be the ONLY tool call in that turn. do not combine it with other tool calls.
do NOT call \`get_current_time\` or other no-op tools just before \`final_answer\`. if i am done, i call \`final_answer\` directly.`;
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
  emitNervesEvent({
    event: "mind.step_start",
    component: "mind",
    message: "buildSystem started",
    meta: { channel, has_context: Boolean(context), tool_choice_required: Boolean(options?.toolChoiceRequired) },
  });

  const system = [
    soulSection(),
    identitySection(),
    loreSection(),
    friendsSection(),
    runtimeInfoSection(channel),
    providerSection(),
    dateSection(),
    toolsSection(channel, options),
    skillsSection(),
    toolBehaviorSection(options),
    contextSection(context),
  ]
    .filter(Boolean)
    .join("\n\n");

  emitNervesEvent({
    event: "mind.step_end",
    component: "mind",
    message: "buildSystem completed",
    meta: { channel },
  });

  return system;
}
