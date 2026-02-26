import * as fs from "fs";
import * as path from "path";
import { getModel } from "../engine/core";
import { tools } from "../engine/tools";
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

function toolsSection(): string {
  const list = tools
    .map((t) => `- ${t.function.name}: ${t.function.description}`)
    .join("\n");
  return `## my tools\n${list}`;
}

function skillsSection(): string {
  const names = listSkills() || [];
  if (!names.length) return "";
  return `## my skills (use load_skill to activate)\n${names.join(", ")}`;
}

export function buildSystem(channel: Channel = "cli"): string {
  return [
    soulSection(),
    identitySection(),
    loreSection(),
    friendsSection(),
    selfAwareSection(channel),
    providerSection(),
    dateSection(),
    toolsSection(),
    skillsSection(),
  ]
    .filter(Boolean)
    .join("\n\n");
}
