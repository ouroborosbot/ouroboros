import type OpenAI from "openai";
import { tools, baseToolDefinitions } from "./tools-base";
import type { ToolContext, ToolDefinition } from "./tools-base";
import { teamsToolDefinitions, summarizeTeamsArgs } from "./tools-teams";
import { adoSemanticToolDefinitions } from "./ado-semantic";
import type { ChannelCapabilities } from "../mind/context/types";
import { emitNervesEvent } from "../nerves/runtime";

// Re-export types and constants used by the rest of the codebase
export { tools, finalAnswerTool } from "./tools-base";
export type { ToolContext, ToolHandler, ToolDefinition } from "./tools-base";
export { teamsTools } from "./tools-teams";

// All tool definitions in a single registry
const allDefinitions: ToolDefinition[] = [...baseToolDefinitions, ...teamsToolDefinitions, ...adoSemanticToolDefinitions];
const REMOTE_BLOCKED_LOCAL_TOOLS = new Set(["shell", "read_file", "write_file", "git_commit", "gh_cli"]);

function baseToolsForCapabilities(capabilities?: ChannelCapabilities): OpenAI.ChatCompletionTool[] {
  const isRemoteChannel = capabilities?.channel === "teams";
  if (!isRemoteChannel) return tools;
  return tools.filter((tool) => !REMOTE_BLOCKED_LOCAL_TOOLS.has(tool.function.name));
}

// Return the appropriate tools list based on channel capabilities.
// Base tools (no integration) are always included.
// Teams/integration tools are included only if their integration is in availableIntegrations.
export function getToolsForChannel(capabilities?: ChannelCapabilities): OpenAI.ChatCompletionTool[] {
  const baseTools = baseToolsForCapabilities(capabilities);

  if (!capabilities || capabilities.availableIntegrations.length === 0) {
    return baseTools;
  }
  const available = new Set(capabilities.availableIntegrations);
  const integrationTools = [...teamsToolDefinitions, ...adoSemanticToolDefinitions].filter(
    (d) => d.integration && available.has(d.integration),
  );
  return [...baseTools, ...integrationTools.map((d) => d.tool)];
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

  const isRemoteChannel = ctx?.context?.channel?.channel === "teams";
  if (isRemoteChannel && REMOTE_BLOCKED_LOCAL_TOOLS.has(name)) {
    const message =
      "I can't do that from here because I'm talking to multiple people in a shared remote channel, and local shell/file/git/gh operations could let conversations interfere with each other. Ask me for a remote-safe alternative (Graph/ADO/web), or run that operation from CLI.";
    emitNervesEvent({
      level: "warn",
      event: "tool.error",
      component: "tools",
      message: "blocked local tool in remote channel",
      meta: { name, channel: "teams" },
    });
    return message;
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
