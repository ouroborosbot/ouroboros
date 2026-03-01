import * as fs from "fs";
import * as path from "path";
import { getAgentRoot } from "../identity";

// Skills live in {agentRoot}/skills/ directory
export function getSkillsDir(): string {
  return path.join(getAgentRoot(), "skills");
}

// in-memory store for loaded skills
const loadedSkills: string[] = [];

export function listSkills(): string[] {
  const skillsDir = getSkillsDir();
  if (!fs.existsSync(skillsDir)) {
    return [];
  }
  return fs
    .readdirSync(skillsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.basename(f, ".md"))
    .sort();
}

export function loadSkill(skillName: string): string {
  const skillPath = path.join(getSkillsDir(), `${skillName}.md`);

  if (!fs.existsSync(skillPath)) {
    throw new Error(`skill '${skillName}' not found`);
  }

  const content = fs.readFileSync(skillPath, "utf-8");

  if (!loadedSkills.includes(skillName)) {
    loadedSkills.push(skillName);
  }

  return content;
}

export function getLoadedSkills(): string[] {
  return [...loadedSkills];
}

export function clearLoadedSkills(): void {
  loadedSkills.length = 0;
}
