// Semantic ADO tools -- enriched, single-call operations over the ADO API.
// Phase 3: ado_backlog_list (query), more mutation tools in 3D.

import type { ToolDefinition } from "./tools-base"
import { adoRequest } from "./ado-client"
import { resolveAdoContext } from "./ado-context"

// Fields fetched for enriched work items
const ENRICHED_FIELDS = [
  "System.Id",
  "System.Title",
  "System.WorkItemType",
  "System.State",
  "System.AssignedTo",
  "System.AreaPath",
  "System.IterationPath",
  "System.Parent",
].join(",")

interface WiqlResponse {
  workItems?: { id: number }[]
}

interface EnrichedWorkItem {
  id: number
  fields: Record<string, any>
}

interface BatchResponse {
  value?: EnrichedWorkItem[]
}

function buildWiqlQuery(project: string, filters: Record<string, string>): string {
  const conditions: string[] = [`[System.TeamProject] = '${project}'`]

  if (filters.areaPath) {
    conditions.push(`[System.AreaPath] UNDER '${filters.areaPath}'`)
  }
  if (filters.iteration) {
    conditions.push(`[System.IterationPath] = '${filters.iteration}'`)
  }
  if (filters.workItemType) {
    conditions.push(`[System.WorkItemType] = '${filters.workItemType}'`)
  }
  if (filters.state) {
    conditions.push(`[System.State] = '${filters.state}'`)
  }
  if (filters.assignee) {
    conditions.push(`[System.AssignedTo] Contains '${filters.assignee}'`)
  }

  return `SELECT [System.Id] FROM WorkItems WHERE ${conditions.join(" AND ")} ORDER BY [System.ChangedDate] DESC`
}

function formatWorkItems(items: EnrichedWorkItem[]): any[] {
  return items.map(wi => ({
    id: wi.id,
    title: wi.fields["System.Title"] ?? "",
    type: wi.fields["System.WorkItemType"] ?? "",
    state: wi.fields["System.State"] ?? "",
    assignedTo: wi.fields["System.AssignedTo"]?.displayName ?? null,
    areaPath: wi.fields["System.AreaPath"] ?? "",
    iteration: wi.fields["System.IterationPath"] ?? "",
    parent: wi.fields["System.Parent"] ?? null,
  }))
}

export const adoSemanticToolDefinitions: ToolDefinition[] = [
  {
    tool: {
      type: "function",
      function: {
        name: "ado_backlog_list",
        description:
          "Query the backlog and return enriched work items with hierarchy, type, parent, assignee, area path, and iteration. Supports filtering. Use this instead of raw WIQL queries.",
        parameters: {
          type: "object",
          properties: {
            organization: { type: "string", description: "ADO organization (optional -- omit to discover)" },
            project: { type: "string", description: "ADO project (optional -- omit to discover)" },
            areaPath: { type: "string", description: "Filter by area path (e.g. 'Platform\\\\Team A')" },
            iteration: { type: "string", description: "Filter by iteration path (e.g. 'Sprint 2')" },
            workItemType: { type: "string", description: "Filter by work item type (e.g. 'Bug', 'Epic', 'User Story')" },
            state: { type: "string", description: "Filter by state (e.g. 'Active', 'New', 'Closed')" },
            assignee: { type: "string", description: "Filter by assigned person name" },
          },
        },
      },
    },
    handler: async (args, ctx) => {
      if (!ctx?.adoToken) {
        return "AUTH_REQUIRED:ado -- I need access to Azure DevOps. Please sign in when prompted."
      }

      const adoCtx = await resolveAdoContext(
        ctx.adoToken,
        ctx.context!,
        { organization: args.organization, project: args.project },
      )

      if (!adoCtx.ok) {
        return adoCtx.error
      }

      const { organization, project } = adoCtx
      const wiql = buildWiqlQuery(project, args)

      // Step 1: WIQL query to get IDs
      const wiqlResult = await adoRequest(
        ctx.adoToken,
        "POST",
        organization,
        `/${project}/_apis/wit/wiql`,
        JSON.stringify({ query: wiql }),
      )

      // Check for API errors (non-JSON responses)
      let wiqlData: WiqlResponse
      try {
        wiqlData = JSON.parse(wiqlResult)
      } catch {
        return wiqlResult // Pass through error message
      }

      if (!wiqlData.workItems || wiqlData.workItems.length === 0) {
        return JSON.stringify({ items: [], message: "No work items found matching the query." })
      }

      // Step 2: Batch fetch enriched details (max 200)
      const ids = wiqlData.workItems.slice(0, 200).map(wi => wi.id)
      const batchResult = await adoRequest(
        ctx.adoToken,
        "GET",
        organization,
        `/${project}/_apis/wit/workitems?ids=${ids.join(",")}&fields=${ENRICHED_FIELDS}`,
      )

      let batchData: BatchResponse
      try {
        batchData = JSON.parse(batchResult)
      } catch {
        return batchResult
      }

      const items = formatWorkItems(batchData.value ?? [])
      return JSON.stringify({ items, organization, project })
    },
    integration: "ado",
  },
]
