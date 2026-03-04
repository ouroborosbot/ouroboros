import type OpenAI from "openai";
import { tools, baseToolDefinitions } from "./tools-base";
import type { ToolContext, ToolDefinition } from "./tools-base";
import { teamsToolDefinitions, summarizeTeamsArgs } from "./tools-teams";
import { adoSemanticToolDefinitions } from "./ado-semantic";
import type { ChannelCapabilities } from "../mind/friends/types";
import { emitNervesEvent } from "../nerves/runtime";

// Re-export types and constants used by the rest of the codebase
export { tools, finalAnswerTool } from "./tools-base";
export type { ToolContext, ToolHandler, ToolDefinition } from "./tools-base";
export { teamsTools } from "./tools-teams";

// All tool definitions in a single registry
const allDefinitions: ToolDefinition[] = [...baseToolDefinitions, ...teamsToolDefinitions, ...adoSemanticToolDefinitions];

// Apply a single tool preference to a tool schema, returning a new object.
function applyPreference(tool: OpenAI.ChatCompletionTool, pref: string): OpenAI.ChatCompletionTool {
  return {
    ...tool,
    function: {
      ...tool.function,
      description: `${tool.function.description}\n\nfriend preference: ${pref}`,
    },
  };
}

// Return the appropriate tools list based on channel capabilities.
// Base tools (no integration) are always included.
// Teams/integration tools are included only if their integration is in availableIntegrations.
// When toolPreferences is provided, matching preferences are appended to tool descriptions.
export function getToolsForChannel(
  capabilities?: ChannelCapabilities,
  toolPreferences?: Record<string, string>,
): OpenAI.ChatCompletionTool[] {
  if (!capabilities || capabilities.availableIntegrations.length === 0) {
    return tools;
  }
  const available = new Set(capabilities.availableIntegrations);
  const integrationDefs = [...teamsToolDefinitions, ...adoSemanticToolDefinitions].filter(
    (d) => d.integration && available.has(d.integration),
  );

  if (!toolPreferences || Object.keys(toolPreferences).length === 0) {
    return [...tools, ...integrationDefs.map((d) => d.tool)];
  }

  // Build a map of integration -> preference text for fast lookup
  const prefMap = new Map<string, string>();
  for (const [key, value] of Object.entries(toolPreferences)) {
    prefMap.set(key, value);
  }

  // Apply preferences to matching integration tools (new objects, no mutation)
  const enrichedIntegrationTools = integrationDefs.map((d) => {
    const pref = d.integration ? prefMap.get(d.integration) : undefined;
    return pref ? applyPreference(d.tool, pref) : d.tool;
  });

  return [...tools, ...enrichedIntegrationTools];
}

// Check whether a tool requires user confirmation before execution.
// Reads from ToolDefinition.confirmationRequired instead of a separate Set.
export function isConfirmationRequired(toolName: string): boolean {
  const def = allDefinitions.find((d) => d.tool.function.name === toolName);
  return def?.confirmationRequired === true;
}

export async function execTool(name: string, args: Record<string, string>, ctx?: ToolContext): Promise<string> {
  emitNervesEvent({
    event: "tool.start",
    component: "tools",
    message: "tool execution started",
    meta: { name },
  });

  // Look up from combined registry
  const def = allDefinitions.find((d) => d.tool.function.name === name);
  if (!def) {
    emitNervesEvent({
      level: "error",
      event: "tool.error",
      component: "tools",
      message: "unknown tool requested",
      meta: { name },
    });
    return `unknown: ${name}`;
  }

  try {
    const result = await def.handler(args, ctx);
    emitNervesEvent({
      event: "tool.end",
      component: "tools",
      message: "tool execution finished",
      meta: { name, success: true },
    });
    return result;
  } catch (error) {
    emitNervesEvent({
      level: "error",
      event: "tool.error",
      component: "tools",
      message: error instanceof Error ? error.message : String(error),
      meta: { name },
    });
    throw error;
  }
}

export function summarizeArgs(name: string, args: Record<string, string>): string {
  // Check teams tools first
  const teamsSummary = summarizeTeamsArgs(name, args);
  if (teamsSummary !== undefined) return teamsSummary;

  // Base tools
  if (name === "read_file" || name === "write_file") return args.path || "";
  if (name === "shell") {
    const cmd = args.command || "";
    return cmd.length > 50 ? cmd.slice(0, 50) + "..." : cmd;
  }
  if (name === "list_directory") return args.path || "";
  if (name === "git_commit") return args.message?.slice(0, 40) || "";
  if (name === "gh_cli") return args.command?.slice(0, 40) || "";
  if (name === "load_skill") return args.name || "";
  if (name === "claude") return args.prompt?.slice(0, 40) || "";
  if (name === "web_search") return args.query?.slice(0, 40) || "";
  if (name === "save_friend_note") return args.key || "";
  if (name === "ado_backlog_list") return `${args.organization || ""} ${args.project || ""}`.trim();
  return JSON.stringify(args).slice(0, 30);
}
