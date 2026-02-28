import type OpenAI from "openai";
import type { ToolHandler } from "./tools-base";
import { getProfile, graphRequest } from "./graph-client";
import { queryWorkItems, adoRequest } from "./ado-client";

// Tools that require user confirmation before execution (mutate operations).
// Enforcement happens in the agent loop (Unit 11); this is metadata only.
export const confirmationRequired: Set<string> = new Set([
  "graph_mutate",
  "ado_mutate",
]);

const MUTATE_METHODS = ["POST", "PATCH", "DELETE"];

export const teamsTools: OpenAI.ChatCompletionTool[] = [
  // -- Generic Graph tools --
  {
    type: "function",
    function: {
      name: "graph_query",
      description: "GET any Microsoft Graph API endpoint. Use graph_docs first to look up the correct path.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Graph API path after /v1.0, e.g. /me/messages?$top=5" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "graph_mutate",
      description: "POST/PATCH/DELETE any Microsoft Graph API endpoint. Requires user confirmation. Use graph_docs first to look up the correct path.",
      parameters: {
        type: "object",
        properties: {
          method: { type: "string", enum: ["POST", "PATCH", "DELETE"], description: "HTTP method" },
          path: { type: "string", description: "Graph API path after /v1.0" },
          body: { type: "string", description: "JSON request body (optional)" },
        },
        required: ["method", "path"],
      },
    },
  },
  // -- Generic ADO tools --
  {
    type: "function",
    function: {
      name: "ado_query",
      description: "GET or POST (for WIQL read queries) any Azure DevOps API endpoint. Use ado_docs first to look up the correct path.",
      parameters: {
        type: "object",
        properties: {
          organization: { type: "string", description: "Azure DevOps organization name" },
          path: { type: "string", description: "ADO API path after /{org}, e.g. /_apis/wit/wiql" },
          method: { type: "string", enum: ["GET", "POST"], description: "HTTP method (defaults to GET)" },
          body: { type: "string", description: "JSON request body (optional, used with POST for WIQL)" },
        },
        required: ["organization", "path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ado_mutate",
      description: "POST/PATCH/DELETE any Azure DevOps API endpoint for actual mutations. Requires user confirmation. Use ado_docs first to look up the correct path.",
      parameters: {
        type: "object",
        properties: {
          method: { type: "string", enum: ["POST", "PATCH", "DELETE"], description: "HTTP method" },
          organization: { type: "string", description: "Azure DevOps organization name" },
          path: { type: "string", description: "ADO API path after /{org}" },
          body: { type: "string", description: "JSON request body (optional)" },
        },
        required: ["method", "organization", "path"],
      },
    },
  },
  // -- Convenience aliases (backward compat) --
  {
    type: "function",
    function: {
      name: "graph_profile",
      description: "get the current user's Microsoft 365 profile (name, email, job title, department, office location)",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "ado_work_items",
      description: "query or list Azure DevOps work items. provide an organization and optionally a WIQL query.",
      parameters: {
        type: "object",
        properties: {
          organization: { type: "string", description: "Azure DevOps organization name" },
          query: { type: "string", description: "WIQL query (optional, defaults to recent assigned work items)" },
        },
        required: ["organization"],
      },
    },
  },
];

const DEFAULT_ADO_QUERY = "SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo] FROM WorkItems WHERE [System.AssignedTo] = @Me AND [System.State] <> 'Closed' ORDER BY [System.ChangedDate] DESC";

// Validate ADO organization against configured list.
// Returns error string if invalid, undefined if ok.
function validateAdoOrg(org: string, allowed: string[]): string | undefined {
  if (allowed.length > 0 && !allowed.includes(org)) {
    return `Organization "${org}" is not in the configured organizations: ${allowed.join(", ")}. Use one of these instead.`;
  }
  return undefined;
}

export const teamsToolHandlers: Record<string, ToolHandler> = {
  // -- Generic Graph --
  graph_query: async (args, ctx) => {
    if (!ctx?.graphToken) {
      return "AUTH_REQUIRED:graph -- I need access to Microsoft Graph. Please sign in when prompted.";
    }
    return graphRequest(ctx.graphToken, "GET", args.path);
  },
  graph_mutate: async (args, ctx) => {
    if (!ctx?.graphToken) {
      return "AUTH_REQUIRED:graph -- I need access to Microsoft Graph. Please sign in when prompted.";
    }
    if (!MUTATE_METHODS.includes(args.method)) {
      return `Invalid method "${args.method}". Must be one of: ${MUTATE_METHODS.join(", ")}`;
    }
    return graphRequest(ctx.graphToken, args.method, args.path, args.body);
  },
  // -- Generic ADO --
  ado_query: async (args, ctx) => {
    if (!ctx?.adoToken) {
      return "AUTH_REQUIRED:ado -- I need access to Azure DevOps. Please sign in when prompted.";
    }
    const orgError = validateAdoOrg(args.organization, ctx.adoOrganizations);
    if (orgError) return orgError;
    const method = args.method || "GET";
    return adoRequest(ctx.adoToken, method, args.organization, args.path, args.body);
  },
  ado_mutate: async (args, ctx) => {
    if (!ctx?.adoToken) {
      return "AUTH_REQUIRED:ado -- I need access to Azure DevOps. Please sign in when prompted.";
    }
    if (!MUTATE_METHODS.includes(args.method)) {
      return `Invalid method "${args.method}". Must be one of: ${MUTATE_METHODS.join(", ")}`;
    }
    const orgError = validateAdoOrg(args.organization, ctx.adoOrganizations);
    if (orgError) return orgError;
    return adoRequest(ctx.adoToken, args.method, args.organization, args.path, args.body);
  },
  // -- Convenience aliases --
  graph_profile: async (_args, ctx) => {
    if (!ctx?.graphToken) {
      return "AUTH_REQUIRED:graph -- I need access to your Microsoft 365 profile. Please sign in when prompted.";
    }
    return getProfile(ctx.graphToken);
  },
  ado_work_items: async (args, ctx) => {
    if (!ctx?.adoToken) {
      return "AUTH_REQUIRED:ado -- I need access to your Azure DevOps account. Please sign in when prompted.";
    }
    const org = args.organization;
    const orgError = validateAdoOrg(org, ctx.adoOrganizations);
    if (orgError) return orgError;
    const query = args.query || DEFAULT_ADO_QUERY;
    return queryWorkItems(ctx.adoToken, org, query);
  },
};

export function summarizeTeamsArgs(name: string, args: Record<string, string>): string | undefined {
  if (name === "graph_profile") return "";
  if (name === "ado_work_items") return args.organization || "";
  if (name === "graph_query") return args.path || "";
  if (name === "graph_mutate") return `${args.method || ""} ${args.path || ""}`;
  if (name === "ado_query") return `${args.organization || ""} ${args.path || ""}`;
  if (name === "ado_mutate") return `${args.method || ""} ${args.organization || ""} ${args.path || ""}`;
  return undefined;
}
