import type { ToolDefinition } from "./tools-base"
import { githubRequest } from "./github-client"

export const githubToolDefinitions: ToolDefinition[] = [
  {
    tool: {
      type: "function",
      function: {
        name: "github_create_issue",
        description: "Create a GitHub issue on a repository. Requires OAuth authorization.",
        parameters: {
          type: "object",
          properties: {
            owner: { type: "string", description: "Repository owner (user or organization)" },
            repo: { type: "string", description: "Repository name" },
            title: { type: "string", description: "Issue title" },
            body: { type: "string", description: "Issue body/description (optional)" },
            labels: { type: "string", description: "Comma-separated label names (optional)" },
          },
          required: ["owner", "repo", "title"],
        },
      },
    },
    handler: async (args, ctx) => {
      if (!ctx?.githubToken) {
        return "AUTH_REQUIRED:github -- I need access to GitHub. Please sign in when prompted."
      }
      const payload: Record<string, unknown> = { title: args.title }
      if (args.body) payload.body = args.body
      if (args.labels) {
        const parsed = args.labels.split(",").map((l) => l.trim())
        if (parsed.length > 0 && parsed[0] !== "") {
          payload.labels = parsed
        }
      }
      return githubRequest(ctx.githubToken, "POST", `/repos/${args.owner}/${args.repo}/issues`, JSON.stringify(payload))
    },
    integration: "github",
    confirmationRequired: true,
  },
]

export function summarizeGithubArgs(name: string, args: Record<string, string>): string | undefined {
  if (name === "github_create_issue") return args.title || ""
  return undefined
}
