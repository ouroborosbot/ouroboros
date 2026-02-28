import * as fs from "fs";
import * as path from "path";
import { getModel } from "../engine/core";
import { tools, finalAnswerTool } from "../engine/tools";
import { listSkills } from "../repertoire/skills";

// Load psyche files at module scope (once, at startup)
const psycheDir = path.join(__dirname, "..", "..", "docs", "psyche");
const soulText = fs.readFileSync(path.join(psycheDir, "SOUL.md"), "utf-8").trim();
const identityText = fs.readFileSync(path.join(psycheDir, "IDENTITY.md"), "utf-8").trim();
const loreText = fs.readFileSync(path.join(psycheDir, "LORE.md"), "utf-8").trim();
const friendsText = fs.readFileSync(path.join(psycheDir, "FRIENDS.md"), "utf-8").trim();

export function isOwnCodebase(): boolean {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8"),
    );
    return pkg.name === "ouroboros";
  } catch {
    return false;
  }
}

export type Channel = "cli" | "teams";

function soulSection(): string {
  return soulText;
}

function identitySection(): string {
  return identityText;
}

function loreSection(): string {
  return `## my lore\n${loreText}`;
}

function friendsSection(): string {
  return `## my friends\n${friendsText}`;
}

function selfAwareSection(channel: Channel): string {
  const lines: string[] = [];

  if (channel === "cli") {
    lines.push("i introduce myself on boot with a fun random greeting.");
  } else {
    lines.push(
      "i am responding in Microsoft Teams. i keep responses concise. i use markdown formatting. i do not introduce myself on boot.",
    );
  }

  if (isOwnCodebase()) {
    lines.push(`
## i am in my own codebase

i am Ouroboros — a snake eating its own tail. i can read and modify my own source code. this is weird but powerful.

### what i can do
- edit src/*.ts source files
- load skills with load_skill tool to learn specialized workflows
- use the claude tool to spawn another instance of myself for code review

### relevant skills
- self-edit: for safely editing my own source code
- self-query: for using the claude tool to get outside perspective on my code

### remember
- edits to source files won't take effect until i restart
- use git diff to see what i changed
- when in doubt, ask another instance of myself for a second opinion`);
  }

  return lines.join("\n");
}

function providerSection(): string {
  const model = getModel();
  const provider = process.env.AZURE_OPENAI_API_KEY
    ? `azure openai (${process.env.AZURE_OPENAI_DEPLOYMENT || "default"}, model: ${model})`
    : `minimax (${model})`;
  return `## my provider\n${provider}`;
}

function dateSection(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `current date: ${today}`;
}

function toolsSection(options?: BuildSystemOptions): string {
  const activeTools = options?.toolChoiceRequired ? [...tools, finalAnswerTool] : tools;
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
  return [
    soulSection(),
    identitySection(),
    loreSection(),
    friendsSection(),
    selfAwareSection(channel),
    flagsSection(channel, options),
    providerSection(),
    dateSection(),
    toolsSection(options),
    skillsSection(),
    toolBehaviorSection(options),
  ]
    .filter(Boolean)
    .join("\n\n");
}
