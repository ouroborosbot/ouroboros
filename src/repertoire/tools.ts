import type OpenAI from "openai";
import { tools, baseToolDefinitions } from "./tools-base";
import type { ToolContext, ToolDefinition } from "./tools-base";
import { teamsToolDefinitions, summarizeTeamsArgs } from "./tools-teams";
import type { ChannelCapabilities } from "../mind/context/types";

// Re-export types and constants used by the rest of the codebase
export { tools, finalAnswerTool } from "./tools-base";
export type { ToolContext, ToolHandler, ToolDefinition } from "./tools-base";
export { teamsTools } from "./tools-teams";

// All tool definitions in a single registry
const allDefinitions: ToolDefinition[] = [...baseToolDefinitions, ...teamsToolDefinitions];

// Return the appropriate tools list based on channel capabilities.
// Base tools (no integration) are always included.
// Teams/integration tools are included only if their integration is in availableIntegrations.
export function getToolsForChannel(capabilities?: ChannelCapabilities): OpenAI.ChatCompletionTool[] {
  if (!capabilities || capabilities.availableIntegrations.length === 0) {
    return tools;
  }
  const available = new Set(capabilities.availableIntegrations);
  const filtered = teamsToolDefinitions.filter(
    (d) => d.integration && available.has(d.integration),
  );
  return [...tools, ...filtered.map((d) => d.tool)];
}

// Check whether a tool requires user confirmation before execution.
// Reads from ToolDefinition.confirmationRequired instead of a separate Set.
export function isConfirmationRequired(toolName: string): boolean {
  const def = allDefinitions.find((d) => d.tool.function.name === toolName);
  return def?.confirmationRequired === true;
}

export async function execTool(name: string, args: Record<string, string>, ctx?: ToolContext): Promise<string> {
  // Look up from combined registry
  const def = allDefinitions.find((d) => d.tool.function.name === name);
  if (!def) return `unknown: ${name}`;
  return await def.handler(args, ctx);
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
  return JSON.stringify(args).slice(0, 30);
}
