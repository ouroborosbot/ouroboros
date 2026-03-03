import * as fs from "fs";
import * as path from "path";
import { getModel, getProvider } from "../engine/core";
import { getAzureConfig } from "../config";
import { finalAnswerTool, getToolsForChannel } from "../engine/tools";
import { listSkills } from "../repertoire/skills";
import { getAgentRoot, getAgentName } from "../identity";
import { emitObservabilityEvent } from "../observability/runtime";

// Lazy-loaded psyche text cache
let _psycheCache: { soul: string; identity: string; lore: string; friends: string } | null = null;

function loadPsycheFile(name: string): string {
  try {
    const psycheDir = path.join(getAgentRoot(), "docs", "psyche");
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
  const channelTools = getToolsForChannel(channel);
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

export function buildSystem(channel: Channel = "cli", options?: BuildSystemOptions): string {
  emitObservabilityEvent({
    event: "mind.step_start",
    component: "mind",
    message: "buildSystem started",
    meta: { channel, options: options ?? {} },
  });

  const system = [
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
  ]
    .filter(Boolean)
    .join("\n\n");

  emitObservabilityEvent({
    event: "mind.step_end",
    component: "mind",
    message: "buildSystem completed",
    meta: { channel },
  });

  return system;
}
