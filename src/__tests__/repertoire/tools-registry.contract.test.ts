import { describe, it, expect } from "vitest";
import { baseToolDefinitions } from "../../repertoire/tools-base";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getDuplicateCounts(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return new Map([...counts.entries()].filter(([, c]) => c > 1));
}

describe("tool registry contract", () => {
  it("tool names are non-empty and unique", () => {
    const names = baseToolDefinitions.map((d) => d.tool.function.name);

    const empty = names.filter((n) => typeof n !== "string" || n.trim().length === 0);
    expect(empty, `Tool names must be non-empty strings`).toEqual([]);

    const dupes = getDuplicateCounts(names);
    if (dupes.size > 0) {
      const report = [...dupes.entries()].map(([name, count]) => `${name} (${count})`).join(", ");
      throw new Error(`Duplicate tool names found: ${report}`);
    }
  });

  it("tool schema is sane", () => {
    const errors: string[] = [];

    for (const def of baseToolDefinitions) {
      const name = def.tool.function?.name;
      const tool = def.tool as any;

      if (tool.type !== "function") errors.push(`${name}: tool.type must be 'function'`);

      const description = tool.function?.description;
      if (typeof description !== "string" || description.trim().length === 0) {
        errors.push(`${name}: function.description must be a non-empty string`);
      }

      const parameters = tool.function?.parameters;
      if (!isPlainObject(parameters)) {
        errors.push(`${name}: function.parameters must be a non-null object`);
      } else {
        const pType = (parameters as any).type;
        if (pType === "object") {
          const props = (parameters as any).properties;
          if (!isPlainObject(props)) errors.push(`${name}: parameters.properties must be a plain object when type==='object'`);
        }

        const required = (parameters as any).required;
        if (required !== undefined) {
          if (!Array.isArray(required) || required.some((r: unknown) => typeof r !== "string")) {
            errors.push(`${name}: parameters.required must be an array of strings when present`);
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Tool schema contract violations:\n- ${errors.join("\n- ")}`);
    }
  });

  it("every tool definition has a handler function", () => {
    for (const def of baseToolDefinitions) {
      const name = def.tool.function.name;
      expect(typeof def.handler, `tool '${name}' is missing a handler`).toBe("function");
    }
  });

  it("tool surface area snapshot", () => {
    const names = baseToolDefinitions.map((d) => d.tool.function.name).slice().sort();
    expect(names).toMatchSnapshot();
  });
});
