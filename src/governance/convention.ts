import { GOVERNANCE_CHECK_RESULTS } from "../harness/primitives";
import { emitNervesEvent } from "../nerves/runtime";

export const GOVERNANCE_CONVENTION_ID = "constitution-classification";
export const GOVERNANCE_DEFAULT_RESULT = "within-bounds";
export const GOVERNANCE_GUIDANCE = {
  withinBounds:
    "additive hardening and local feature work default to within-bounds when architecture boundaries stay intact",
  requiresReview:
    "structural boundary shifts, ownership/workflow rewrites, and broad cross-cutting changes require review before execution",
} as const;

export function queryGovernanceConvention(query?: string): string {
  const normalized = query?.trim();
  emitNervesEvent({
    component: "governance",
    event: "governance.convention_query",
    message: "querying governance convention",
    meta: { query: normalized || "classification" },
  });
  if (!normalized || normalized === "classification") {
    return JSON.stringify({
      convention: GOVERNANCE_CONVENTION_ID,
      defaultResult: GOVERNANCE_DEFAULT_RESULT,
      results: [...GOVERNANCE_CHECK_RESULTS],
      guidance: GOVERNANCE_GUIDANCE,
    });
  }
  return `error: unsupported governance_convention query '${query}'. supported queries: classification`;
}
