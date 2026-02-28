// Azure DevOps API client.
// Provides a generic adoRequest() for arbitrary endpoints
// and a thin queryWorkItems() wrapper for backward compatibility.

import { handleApiError } from "./api-error"

const ADO_BASE = "https://dev.azure.com"
const DEFAULT_API_VERSION = "api-version=7.1"

interface WiqlResult {
  workItems: { id: number }[]
}

interface WorkItemFields {
  "System.Title": string
  "System.State": string
  "System.AssignedTo": { displayName: string } | null
}

interface WorkItemDetail {
  id: number
  fields: WorkItemFields
}

interface WorkItemBatchResult {
  value: WorkItemDetail[]
}

// Append api-version=7.1 to the URL if not already present.
function ensureApiVersion(path: string): string {
  if (path.includes("api-version=")) return path
  return path.includes("?") ? `${path}&${DEFAULT_API_VERSION}` : `${path}?${DEFAULT_API_VERSION}`
}

// Generic ADO API request. Returns response body as pretty-printed JSON string.
export async function adoRequest(
  token: string,
  method: string,
  org: string,
  path: string,
  body?: string,
): Promise<string> {
  try {
    const fullPath = ensureApiVersion(path)
    const url = `${ADO_BASE}/${org}${fullPath}`
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
      return handleApiError(res, "ADO", "ado")
    }

    const data = await res.json()
    return JSON.stringify(data, null, 2)
  } catch (err) {
    return handleApiError(err, "ADO", "ado")
  }
}

// Backward-compatible thin wrapper: runs WIQL query and returns formatted work items.
export async function queryWorkItems(
  token: string,
  org: string,
  query: string,
): Promise<string> {
  try {
    // Step 1: Run WIQL query to get work item IDs
    const wiqlRes = await fetch(
      `${ADO_BASE}/${org}/_apis/wit/wiql?${DEFAULT_API_VERSION}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      },
    )

    if (!wiqlRes.ok) {
      return handleApiError(wiqlRes, "ADO", "ado")
    }

    const wiqlData = (await wiqlRes.json()) as WiqlResult

    if (!wiqlData.workItems || wiqlData.workItems.length === 0) {
      return "No work items found matching the query."
    }

    // Step 2: Fetch work item details (batch, max 200)
    const ids = wiqlData.workItems.slice(0, 200).map((wi) => wi.id)
    const detailRes = await fetch(
      `${ADO_BASE}/${org}/_apis/wit/workitems?ids=${ids.join(",")}&${DEFAULT_API_VERSION}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    if (!detailRes.ok) {
      return handleApiError(detailRes, "ADO", "ado")
    }

    const detailData = (await detailRes.json()) as WorkItemBatchResult

    // Format results
    const lines = detailData.value.map((wi) => {
      const assignedTo = wi.fields["System.AssignedTo"]?.displayName || "Unassigned"
      return `#${wi.id}: ${wi.fields["System.Title"]} [${wi.fields["System.State"]}] (${assignedTo})`
    })

    return lines.join("\n")
  } catch (err) {
    return handleApiError(err, "ADO", "ado")
  }
}
