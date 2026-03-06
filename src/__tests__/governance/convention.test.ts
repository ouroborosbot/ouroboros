import { describe, it, expect } from "vitest";
import {
  GOVERNANCE_CONVENTION_ID,
  GOVERNANCE_DEFAULT_RESULT,
  GOVERNANCE_GUIDANCE,
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
});
