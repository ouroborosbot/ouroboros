// Minimal Graph API client for Phase 1.
// Uses raw fetch with user-delegated OAuth token.

import { handleApiError } from "./api-error"

interface GraphProfile {
  displayName: string
  mail: string | null
  jobTitle: string | null
  department: string | null
  officeLocation: string | null
}

export async function getProfile(token: string): Promise<string> {
  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      return handleApiError(res, "Graph", "graph")
    }

    const profile = (await res.json()) as GraphProfile
    const lines = [
      `Name: ${profile.displayName}`,
      `Email: ${profile.mail || "N/A"}`,
      `Job Title: ${profile.jobTitle || "N/A"}`,
      `Department: ${profile.department || "N/A"}`,
      `Office: ${profile.officeLocation || "N/A"}`,
    ]
    return lines.join("\n")
  } catch (err) {
    return handleApiError(err, "Graph", "graph")
  }
}
