import * as fs from "fs";
import * as path from "path";

// skills live in skills/ directory relative to project root
const SKILLS_DIR = path.join(__dirname, "..", "..", "skills");

// in-memory store for loaded skills
const loadedSkills: string[] = [];

export function listSkills(): string[] {
  if (!fs.existsSync(SKILLS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.basename(f, ".md"))
    .sort();
}

export function loadSkill(skillName: string): string {
  const skillPath = path.join(SKILLS_DIR, `${skillName}.md`);
  
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
