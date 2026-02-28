import type OpenAI from "openai";
import { tools, baseToolHandlers } from "./tools-base";
import type { ToolContext } from "./tools-base";
import { teamsTools, teamsToolHandlers, summarizeTeamsArgs } from "./tools-teams";

// Re-export types and constants used by the rest of the codebase
export { tools, finalAnswerTool } from "./tools-base";
export type { ToolContext, ToolHandler } from "./tools-base";
export { teamsTools } from "./tools-teams";

// Return the appropriate tools list based on channel.
// Teams gets base tools + teams tools; CLI (and any other channel) gets base tools only.
export function getToolsForChannel(channel?: string): OpenAI.ChatCompletionTool[] {
  if (channel === "teams") {
    return [...tools, ...teamsTools];
  }
  return tools;
}

export async function execTool(name: string, args: Record<string, string>, ctx?: ToolContext): Promise<string> {
  const h = baseToolHandlers[name] || teamsToolHandlers[name];
  if (!h) return `unknown: ${name}`;
  return await h(args, ctx);
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
