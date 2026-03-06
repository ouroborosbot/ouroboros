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

const REQUIRES_REVIEW_PATTERNS = [
  "rewrite",
  "replace",
  "architecture",
  "ownership",
  "workflow",
  "bundle root",
  "agent root",
  "constitution",
  "governance model",
] as const

export function classifyGovernanceProposal(summary: string): (typeof GOVERNANCE_CHECK_RESULTS)[number] {
  const normalized = summary.trim().toLowerCase()
  const requiresReview = REQUIRES_REVIEW_PATTERNS.some((pattern) => normalized.includes(pattern))
  const result = requiresReview ? "requires-review" : GOVERNANCE_DEFAULT_RESULT
  emitNervesEvent({
    component: "governance",
    event: "governance.convention_classify",
    message: "classifying proposal against governance convention",
    meta: {
      result,
      summary: normalized.slice(0, 200),
    },
  })
  return result
}

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
