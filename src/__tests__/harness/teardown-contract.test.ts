import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect } from "vitest";
import { checkGate3aTeardown } from "../../harness/teardown-contract";

function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

describe("gate 3a teardown contract", () => {
  it("passes for the current repository state", () => {
    const report = checkGate3aTeardown(process.cwd());
    expect(report.ok).toBe(true);
    expect(report.violations).toEqual([]);
  });

  it("reports reflection remnants, stale scripts, and missing context utility tests", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate3a-teardown-"));

    fs.mkdirSync(path.join(root, "src", "reflection"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "reflection", "trigger.ts"), "export const x = 1;\n", "utf8");

    fs.mkdirSync(path.join(root, "src", "mind"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "mind", "context.ts"), "export const y = 1;\n", "utf8");

    writeJson(path.join(root, "package.json"), {
      scripts: {
        test: "vitest run",
        reflect: "node dist/reflection/autonomous-loop.js",
      },
    });

    const report = checkGate3aTeardown(root);
    expect(report.ok).toBe(false);
    expect(report.violations.some((v) => v.includes("src/reflection"))).toBe(true);
    expect(report.violations.some((v) => v.includes("reflect"))).toBe(true);
    expect(report.violations.some((v) => v.includes("context.test.ts"))).toBe(true);
  });

  it("handles roots without package.json by treating scripts as empty", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate3a-teardown-nopkg-"));
    fs.mkdirSync(path.join(root, "src", "mind"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "__tests__", "mind"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "mind", "context.ts"), "export const x = 1;\n", "utf8");
    fs.writeFileSync(path.join(root, "src", "__tests__", "mind", "context.test.ts"), "describe('x', () => {});\n", "utf8");

    const report = checkGate3aTeardown(root);
    expect(report.ok).toBe(true);
    expect(report.violations).toEqual([]);
  });

  it("handles package.json without scripts and non-string script values", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate3a-teardown-noscripts-"));
    fs.mkdirSync(path.join(root, "src", "mind"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "__tests__", "mind"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "mind", "context.ts"), "export const x = 1;\n", "utf8");
    fs.writeFileSync(path.join(root, "src", "__tests__", "mind", "context.test.ts"), "describe('x', () => {});\n", "utf8");

    writeJson(path.join(root, "package.json"), {});
    const noScriptsReport = checkGate3aTeardown(root);
    expect(noScriptsReport.ok).toBe(true);
    expect(noScriptsReport.violations).toEqual([]);

    writeJson(path.join(root, "package.json"), { scripts: { weird: 42 } });
    const nonStringScriptReport = checkGate3aTeardown(root);
    expect(nonStringScriptReport.ok).toBe(true);
    expect(nonStringScriptReport.violations).toEqual([]);
  });
});
