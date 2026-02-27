// Minimal Azure DevOps API client for Phase 1.
// Uses raw fetch with user-delegated OAuth token.

import { handleApiError } from "./api-error"

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

export async function queryWorkItems(
  token: string,
  org: string,
  query: string,
): Promise<string> {
  try {
    // Step 1: Run WIQL query to get work item IDs
    const wiqlRes = await fetch(
      `https://dev.azure.com/${org}/_apis/wit/wiql?api-version=7.1`,
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
      `https://dev.azure.com/${org}/_apis/wit/workitems?ids=${ids.join(",")}&api-version=7.1`,
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
