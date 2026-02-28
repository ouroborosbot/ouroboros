import type OpenAI from "openai";
import type { ToolHandler } from "./tools-base";
import { getProfile } from "./graph-client";
import { queryWorkItems } from "./ado-client";

export const teamsTools: OpenAI.ChatCompletionTool[] = [
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

export const teamsToolHandlers: Record<string, ToolHandler> = {
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
    if (ctx.adoOrganizations.length > 0 && !ctx.adoOrganizations.includes(org)) {
      return `Organization "${org}" is not in the configured organizations: ${ctx.adoOrganizations.join(", ")}. Use one of these instead.`;
    }
    const query = args.query || DEFAULT_ADO_QUERY;
    return queryWorkItems(ctx.adoToken, org, query);
  },
};

export function summarizeTeamsArgs(name: string, args: Record<string, string>): string | undefined {
  if (name === "graph_profile") return "";
  if (name === "ado_work_items") return args.organization || "";
  return undefined;
}
