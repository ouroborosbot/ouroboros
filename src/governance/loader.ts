import * as fs from "fs"
import * as path from "path"
import { emitNervesEvent } from "../nerves/runtime"

export interface GovernanceDocument {
  relativePath: string
  absolutePath: string
  content: string
}

export interface GovernanceLoadResult {
  documents: GovernanceDocument[]
  missing: string[]
}

export const REQUIRED_GOVERNANCE_DOCS = ["ARCHITECTURE.md", "CONSTITUTION.md"] as const

export function loadGovernanceDocs(agentRoot: string, relativePaths: string[]): GovernanceLoadResult {
  emitNervesEvent({
    component: "governance",
    event: "governance.loader_call",
    message: "loading governance docs",
    meta: {
      root: agentRoot,
      count: relativePaths.length,
    },
  })

  const documents: GovernanceDocument[] = []
  const missing: string[] = []

  for (const relativePath of relativePaths) {
    const absolutePath = path.join(agentRoot, relativePath)
    try {
      const content = fs.readFileSync(absolutePath, "utf8")
      documents.push({ relativePath, absolutePath, content })
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") {
        missing.push(relativePath)
        continue
      }
      throw error
    }
  }

  return { documents, missing }
}

export function runGovernancePreflight(repoRoot: string): GovernanceLoadResult {
  const result = loadGovernanceDocs(repoRoot, [...REQUIRED_GOVERNANCE_DOCS])
  if (result.missing.length > 0) {
    const missingList = result.missing.join(", ")
    throw new Error(
      `Governance preflight failed: missing required docs at repo root ${repoRoot}: ${missingList}`,
    )
  }
  return result
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error
}
