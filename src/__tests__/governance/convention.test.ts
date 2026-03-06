import { describe, it, expect } from "vitest";
import {
  GOVERNANCE_CONVENTION_ID,
  GOVERNANCE_DEFAULT_RESULT,
  GOVERNANCE_GUIDANCE,
  classifyGovernanceProposal,
  queryGovernanceConvention,
} from "../../governance/convention";

describe("governance convention query", () => {
  it("returns classification payload by default", () => {
    const parsed = JSON.parse(queryGovernanceConvention());
    expect(parsed.convention).toBe(GOVERNANCE_CONVENTION_ID);
    expect(parsed.defaultResult).toBe(GOVERNANCE_DEFAULT_RESULT);
    expect(parsed.results).toEqual(["within-bounds", "requires-review"]);
    expect(parsed.guidance).toEqual(GOVERNANCE_GUIDANCE);
  });

  it("returns classification payload for explicit classification query", () => {
    const parsed = JSON.parse(queryGovernanceConvention("classification"));
    expect(parsed.convention).toBe("constitution-classification");
    expect(parsed.defaultResult).toBe("within-bounds");
  });

  it("treats whitespace query as classification", () => {
    const parsed = JSON.parse(queryGovernanceConvention("   "));
    expect(parsed.results).toEqual(["within-bounds", "requires-review"]);
  });

  it("returns explicit error for unsupported query", () => {
    expect(queryGovernanceConvention("unknown")).toBe(
      "error: unsupported governance_convention query 'unknown'. supported queries: classification",
    );
  });

  it("classifies representative hardening proposals with calibrated defaults", () => {
    const cases = [
      {
        summary: "Add shell timeout guards to tool execution and capture timeout diagnostics.",
        expected: "within-bounds",
      },
      {
        summary: "Add schema validation for reflection artifacts before writing to disk.",
        expected: "within-bounds",
      },
      {
        summary: "Improve interruption resume checkpoints for inner-dialog turns.",
        expected: "within-bounds",
      },
      {
        summary: "Rewrite governance ownership workflow across both agents.",
        expected: "requires-review",
      },
      {
        summary: "Replace bundle root location strategy and agent root resolution architecture.",
        expected: "requires-review",
      },
    ] as const;

    for (const item of cases) {
      expect(classifyGovernanceProposal(item.summary)).toBe(item.expected);
    }
  });
});
