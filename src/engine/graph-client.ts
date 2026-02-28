// Graph API client.
// Provides a generic graphRequest() for arbitrary endpoints
// and a thin getProfile() wrapper for backward compatibility.

import { handleApiError } from "./api-error"

const GRAPH_BASE = "https://graph.microsoft.com/v1.0"

interface GraphProfile {
  displayName: string
  mail: string | null
  jobTitle: string | null
  department: string | null
  officeLocation: string | null
}

// Generic Graph API request. Returns response body as pretty-printed JSON string.
export async function graphRequest(
  token: string,
  method: string,
  path: string,
  body?: string,
): Promise<string> {
  try {
    const url = `${GRAPH_BASE}${path}`
    const opts: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
    if (body) opts.body = body

    const res = await fetch(url, opts)

    if (!res.ok) {
      return handleApiError(res, "Graph", "graph")
    }

    const data = await res.json()
    return JSON.stringify(data, null, 2)
  } catch (err) {
    return handleApiError(err, "Graph", "graph")
  }
}

// Backward-compatible thin wrapper: fetches /me and formats as human-readable text.
export async function getProfile(token: string): Promise<string> {
  try {
    const res = await fetch(`${GRAPH_BASE}/me`, {
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
