import * as fs from "fs";
import * as path from "path";

const REMOVED_PATHS = [
  "src/reflection",
  "src/reflection/autonomous-loop.ts",
  "src/reflection/loop-entry.ts",
  "src/reflection/trigger.ts",
  "src/__tests__/reflection/autonomous-loop.test.ts",
] as const;

const REMOVED_SCRIPT_NAMES = ["reflect", "reflect:dry", "reflect:loop", "reflect:loop:dry"] as const;

const STALE_REFLECTION_SCRIPT_MARKERS = ["reflection/", "autonomous-loop", "loop-entry", "reflect:loop", "reflect:dry"] as const;

const REQUIRED_CONTEXT_FILES = ["src/mind/context.ts", "src/__tests__/mind/context.test.ts"] as const;

export interface Gate3aTeardownReport {
  ok: boolean;
  violations: string[];
}

function readScripts(repoRoot: string): Record<string, unknown> {
  const packageJsonPath = path.join(repoRoot, "package.json");
  if (!fs.existsSync(packageJsonPath)) return {};
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { scripts?: Record<string, unknown> };
  return packageJson.scripts ?? {};
}

export function checkGate3aTeardown(repoRoot: string): Gate3aTeardownReport {
  const violations: string[] = [];

  for (const relativePath of REMOVED_PATHS) {
    if (fs.existsSync(path.join(repoRoot, relativePath))) {
      violations.push(`expected removed path to be absent: ${relativePath}`);
    }
  }

  const scripts = readScripts(repoRoot);
  for (const scriptName of REMOVED_SCRIPT_NAMES) {
    if (scriptName in scripts) {
      violations.push(`stale reflect script still present: ${scriptName}`);
    }
  }

  for (const [name, command] of Object.entries(scripts)) {
    const text = typeof command === "string" ? command : "";
    if (STALE_REFLECTION_SCRIPT_MARKERS.some((marker) => text.includes(marker))) {
      violations.push(`stale reflection orchestration reference found in script '${name}': ${text}`);
    }
  }

  for (const required of REQUIRED_CONTEXT_FILES) {
    if (!fs.existsSync(path.join(repoRoot, required))) {
      violations.push(`required context utility contract missing: ${required}`);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}
