// Azure DevOps API client.
// Provides a generic adoRequest() for arbitrary endpoints
// and a thin queryWorkItems() wrapper for backward compatibility.

import { handleApiError } from "../heart/api-error"

const ADO_BASE = "https://dev.azure.com"
const VSSPS_BASE = "https://app.vssps.visualstudio.com"
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

// Determine correct Content-Type for ADO requests.
function resolveContentType(method: string, path: string): string {
  const upper = method.toUpperCase()
  const isWorkItemMutation =
    (upper === "POST" || upper === "PATCH") &&
    path.toLowerCase().includes("/_apis/wit/workitems/")

  return isWorkItemMutation
    ? "application/json-patch+json"
    : "application/json"
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

    const contentType = resolveContentType(method, path)

    const opts: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
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

// Discover ADO organizations accessible by the authenticated user.
// 1. Fetches user profile to get publicAlias (member ID)
// 2. Uses Accounts API to list organizations for that member
// Throws on API errors (callers handle error presentation).
export async function discoverOrganizations(token: string): Promise<string[]> {
  // Step 1: Get the user's publicAlias from their profile
  const profileRes = await fetch(
    `${VSSPS_BASE}/_apis/profile/profiles/me?${DEFAULT_API_VERSION}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  )

  if (!profileRes.ok) {
    throw new Error(`ADO profile request failed: ${profileRes.status} ${profileRes.statusText}`)
  }

  const profile = (await profileRes.json()) as { publicAlias?: string }
  const memberId = profile.publicAlias
  if (!memberId) {
    throw new Error("ADO profile response missing publicAlias")
  }

  // Step 2: List organizations for this member
  const accountsRes = await fetch(
    `${VSSPS_BASE}/_apis/accounts?memberId=${memberId}&${DEFAULT_API_VERSION}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  )

  if (!accountsRes.ok) {
    throw new Error(`ADO accounts request failed: ${accountsRes.status} ${accountsRes.statusText}`)
  }

  const data = (await accountsRes.json()) as { value?: { accountName: string }[] }
  return (data.value ?? []).map((a) => a.accountName)
}

// Discover projects within an ADO organization.
// Throws on API errors (callers handle error presentation).
export async function discoverProjects(token: string, org: string): Promise<string[]> {
  const res = await fetch(
    `${ADO_BASE}/${org}/_apis/projects?${DEFAULT_API_VERSION}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  )

  if (!res.ok) {
    throw new Error(`ADO projects request failed: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as { value?: { name: string }[] }
  return (data.value ?? []).map((p) => p.name)
}
