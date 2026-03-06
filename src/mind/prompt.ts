import * as fs from "fs";
import * as path from "path";
import { getProviderDisplayLabel } from "../heart/core";
import { finalAnswerTool, getToolsForChannel } from "../repertoire/tools";
import { listSkills } from "../repertoire/skills";
import { getAgentRoot, getAgentName } from "../identity";
import type { ResolvedContext } from "./friends/types";
import { getChannelCapabilities } from "./friends/channel";
import { emitNervesEvent } from "../nerves/runtime";
import { getFirstImpressions } from "./first-impressions";
import { getTaskModule } from "../tasks";

// Lazy-loaded psyche text cache
let _psycheCache: {
  soul: string;
  identity: string;
  lore: string;
  friends: string;
  tacitKnowledge: string;
  aspirations: string;
} | null = null;

function loadPsycheFile(name: string): string {
  try {
    const psycheDir = path.join(getAgentRoot(), "psyche");
    return fs.readFileSync(path.join(psycheDir, name), "utf-8").trim();
  } catch {
    return "";
  }
}

function loadPsyche(): {
  soul: string;
  identity: string;
  lore: string;
  friends: string;
  tacitKnowledge: string;
  aspirations: string;
} {
  if (_psycheCache) return _psycheCache;
  _psycheCache = {
    soul: loadPsycheFile("SOUL.md"),
    identity: loadPsycheFile("IDENTITY.md"),
    lore: loadPsycheFile("LORE.md"),
    friends: loadPsycheFile("FRIENDS.md"),
    tacitKnowledge: loadPsycheFile("TACIT.md"),
    aspirations: loadPsycheFile("ASPIRATIONS.md"),
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

function tacitKnowledgeSection(): string {
  const text = loadPsyche().tacitKnowledge;
  if (!text) return "";
  return `## tacit knowledge\n${text}`;
}

function aspirationsSection(): string {
  const text = loadPsyche().aspirations;
  if (!text) return "";
  return `## my aspirations\n${text}`;
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
  return `## my provider\n${getProviderDisplayLabel()}`;
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

function taskBoardSection(): string {
  try {
    const board = getTaskModule().getBoard().compact.trim();
    if (!board) return "";
    return `## task board\n${board}`;
  } catch {
    return "";
  }
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
    ? `${friendOrIdentity.name} (${emailId.externalId})`
    : friendOrIdentity.name
  lines.push(`friend: ${idDisplay}`)

  // Channel
  const ch = context.channel
  const traits: string[] = []
  if (ch.supportsMarkdown) traits.push("markdown")
  if (!ch.supportsStreaming) traits.push("no streaming")
  if (ch.supportsStreaming) traits.push("streaming")
  if (ch.supportsRichCards) traits.push("rich cards")
  // maxMessageLength constraint removed -- chunked streaming handles delivery,
  // error recovery splits on failure. No artificial limits in the prompt.
  /* v8 ignore next -- empty-traits branch unreachable: streaming/no-streaming always adds a trait @preserve */
  lines.push(`channel: ${ch.channel}${traits.length ? ` (${traits.join(", ")})` : ""}`)

  // Friend record (guaranteed non-null here -- checked above)
  const friend = context.friend!

  // Always-on directives (permanent in contextSection, never gated by token threshold)
  lines.push("")
  lines.push("my conversation memory is ephemeral -- it resets between sessions. anything i learn about my friend, i save with save_friend_note so future me remembers.")
  lines.push("the conversation is my source of truth. my notes are a journal for future me -- they may be stale or incomplete.")
  lines.push("when i learn something that might invalidate an existing note, i check related notes and update or override any that are stale.")
  lines.push("i save ANYTHING i learn about my friend immediately with save_friend_note -- names, preferences, what they do, what they care about. when in doubt, save it. saving comes BEFORE responding: i call save_friend_note first, then final_answer on the next turn.")

  // Onboarding instructions (only below token threshold -- drop once exceeded)
  const impressions = getFirstImpressions(friend)
  if (impressions) {
    lines.push(impressions)
  }

  // Friend notes (from FriendRecord -- rendered in system prompt, NOT toolPreferences)
  if (Object.keys(friend.notes).length > 0) {
    lines.push("")
    lines.push("## what i know about this friend")
    for (const [key, entry] of Object.entries(friend.notes)) {
      lines.push(`- ${key}: [${entry.savedAt.slice(0, 10)}] ${entry.value}`)
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
    tacitKnowledgeSection(),
    aspirationsSection(),
    runtimeInfoSection(channel),
    providerSection(),
    dateSection(),
    toolsSection(channel, options),
    skillsSection(),
    taskBoardSection(),
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
