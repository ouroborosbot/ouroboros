import * as fs from "fs"
import * as path from "path"

export interface GovernanceDocument {
  relativePath: string
  absolutePath: string
  content: string
}

export interface GovernanceLoadResult {
  documents: GovernanceDocument[]
  missing: string[]
}

export function loadGovernanceDocs(agentRoot: string, relativePaths: string[]): GovernanceLoadResult {
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

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error
}
