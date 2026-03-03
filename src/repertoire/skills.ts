import * as fs from "fs";
import * as path from "path";
import { getAgentRoot } from "../identity";
import { emitObservabilityEvent } from "../observability/runtime";

// Skills live in {agentRoot}/skills/ directory
export function getSkillsDir(): string {
  return path.join(getAgentRoot(), "skills");
}

// in-memory store for loaded skills
const loadedSkills: string[] = [];

export function listSkills(): string[] {
  emitObservabilityEvent({
    event: "repertoire.load_start",
    component: "repertoire",
    message: "listing skills",
    meta: { operation: "listSkills" },
  });
  const skillsDir = getSkillsDir();
  if (!fs.existsSync(skillsDir)) {
    emitObservabilityEvent({
      event: "repertoire.load_end",
      component: "repertoire",
      message: "skills directory missing",
      meta: { operation: "listSkills", count: 0 },
    });
    return [];
  }
  const skills = fs
    .readdirSync(skillsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.basename(f, ".md"))
    .sort();
  emitObservabilityEvent({
    event: "repertoire.load_end",
    component: "repertoire",
    message: "listed skills",
    meta: { operation: "listSkills", count: skills.length },
  });
  return skills;
}

export function loadSkill(skillName: string): string {
  emitObservabilityEvent({
    event: "repertoire.load_start",
    component: "repertoire",
    message: "loading skill",
    meta: { operation: "loadSkill", skill: skillName },
  });
  const skillPath = path.join(getSkillsDir(), `${skillName}.md`);

  if (!fs.existsSync(skillPath)) {
    emitObservabilityEvent({
      level: "error",
      event: "repertoire.error",
      component: "repertoire",
      message: "skill not found",
      meta: { operation: "loadSkill", skill: skillName },
    });
    throw new Error(`skill '${skillName}' not found`);
  }

  const content = fs.readFileSync(skillPath, "utf-8");

  if (!loadedSkills.includes(skillName)) {
    loadedSkills.push(skillName);
  }

  emitObservabilityEvent({
    event: "repertoire.load_end",
    component: "repertoire",
    message: "loaded skill",
    meta: { operation: "loadSkill", skill: skillName },
  });
  return content;
}

export function getLoadedSkills(): string[] {
  return [...loadedSkills];
}

export function clearLoadedSkills(): void {
  loadedSkills.length = 0;
}
