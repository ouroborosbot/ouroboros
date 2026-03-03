// Azure DevOps API client.
// Provides a generic adoRequest() for arbitrary endpoints
// and a thin queryWorkItems() wrapper for backward compatibility.

import { handleApiError } from "./api-error"
import { emitObservabilityEvent } from "../observability/runtime"

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
    emitObservabilityEvent({
      event: "client.request_start",
      component: "clients",
      message: "starting ADO request",
      meta: { client: "ado", method, org, path },
    })

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
      emitObservabilityEvent({
        level: "error",
        event: "client.error",
        component: "clients",
        message: "ADO request failed",
        meta: { client: "ado", method, org, path, status: res.status },
      })
      return handleApiError(res, "ADO", "ado")
    }

    const data = await res.json()
    emitObservabilityEvent({
      event: "client.request_end",
      component: "clients",
      message: "ADO request completed",
      meta: { client: "ado", method, org, path, success: true },
    })
    return JSON.stringify(data, null, 2)
  } catch (err) {
    emitObservabilityEvent({
      level: "error",
      event: "client.error",
      component: "clients",
      message: "ADO request threw exception",
      meta: {
        client: "ado",
        method,
        org,
        path,
        reason: err instanceof Error ? err.message : String(err),
      },
    })
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
    emitObservabilityEvent({
      event: "client.request_start",
      component: "clients",
      message: "starting ADO work item query",
      meta: { client: "ado", org, operation: "queryWorkItems" },
    })

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
      emitObservabilityEvent({
        level: "error",
        event: "client.error",
        component: "clients",
        message: "ADO WIQL query failed",
        meta: { client: "ado", org, operation: "queryWorkItems", stage: "wiql", status: wiqlRes.status },
      })
      return handleApiError(wiqlRes, "ADO", "ado")
    }

    const wiqlData = (await wiqlRes.json()) as WiqlResult

    if (!wiqlData.workItems || wiqlData.workItems.length === 0) {
      emitObservabilityEvent({
        event: "client.request_end",
        component: "clients",
        message: "ADO work item query returned no results",
        meta: { client: "ado", org, operation: "queryWorkItems", count: 0 },
      })
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
      emitObservabilityEvent({
        level: "error",
        event: "client.error",
        component: "clients",
        message: "ADO work item details fetch failed",
        meta: { client: "ado", org, operation: "queryWorkItems", stage: "details", status: detailRes.status },
      })
      return handleApiError(detailRes, "ADO", "ado")
    }

    const detailData = (await detailRes.json()) as WorkItemBatchResult

    // Format results
    const lines = detailData.value.map((wi) => {
      const assignedTo = wi.fields["System.AssignedTo"]?.displayName || "Unassigned"
      return `#${wi.id}: ${wi.fields["System.Title"]} [${wi.fields["System.State"]}] (${assignedTo})`
    })

    emitObservabilityEvent({
      event: "client.request_end",
      component: "clients",
      message: "ADO work item query completed",
      meta: { client: "ado", org, operation: "queryWorkItems", count: lines.length },
    })
    return lines.join("\n")
  } catch (err) {
    emitObservabilityEvent({
      level: "error",
      event: "client.error",
      component: "clients",
      message: "ADO work item query threw exception",
      meta: {
        client: "ado",
        org,
        operation: "queryWorkItems",
        reason: err instanceof Error ? err.message : String(err),
      },
    })
    return handleApiError(err, "ADO", "ado")
  }
}
