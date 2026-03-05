/**
 * File completeness check (Rule 5).
 *
 * Every production file with executable code must have at least one
 * emitNervesEvent call. Type-only files (containing only type/interface/enum
 * declarations) are exempt.
 */

export interface FileCompletenessResult {
  status: "pass" | "fail"
  missing: string[]
  exempt: string[]
}

/**
 * Determines if a source file is type-only (no executable code).
 * A file is type-only if it contains no function, class, or const declarations.
 */
export function isTypeOnlyFile(source: string): boolean {
  // Look for executable code markers: function, class, const/let/var declarations
  const executablePattern = /\b(function|class|const|let|var)\s/
  return !executablePattern.test(source)
}

/**
 * Check that all production files have at least one emitNervesEvent call.
 *
 * @param filesWithKeys - Map of filePath -> keys found by source scanner
 * @param fileContents - Map of filePath -> source content for ALL production files
 */
export function checkFileCompleteness(
  filesWithKeys: Map<string, string[]>,
  fileContents: Map<string, string>,
): FileCompletenessResult {
  const missing: string[] = []
  const exempt: string[] = []

  for (const [filePath, source] of fileContents) {
    const hasKeys = filesWithKeys.has(filePath) && filesWithKeys.get(filePath)!.length > 0
    if (hasKeys) continue

    if (isTypeOnlyFile(source)) {
      exempt.push(filePath)
    } else {
      missing.push(filePath)
    }
  }

  return {
    status: missing.length === 0 ? "pass" : "fail",
    missing: missing.sort(),
    exempt: exempt.sort(),
  }
}
