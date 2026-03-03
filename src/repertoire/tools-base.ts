import type OpenAI from "openai";
import * as fs from "fs";
import { execSync, spawnSync } from "child_process";
import { listSkills, loadSkill } from "./skills";
import { getIntegrationsConfig } from "../config";
import type { Integration, ResolvedContext, FriendMemory } from "../mind/friends/types";
import type { CollectionStore } from "../mind/friends/store";

export interface ToolContext {
  graphToken?: string;
  adoToken?: string;
  signin: (connectionName: string) => Promise<string | undefined>;
  context?: ResolvedContext;
  memoryStore?: CollectionStore<FriendMemory>;
}

export type ToolHandler = (args: Record<string, string>, ctx?: ToolContext) => string | Promise<string>;

export interface ToolDefinition {
  tool: OpenAI.ChatCompletionTool;
  handler: ToolHandler;
  integration?: Integration;
  confirmationRequired?: boolean;
}

const postIt = (msg: string) => `post-it from past you:\n${msg}`;

export const baseToolDefinitions: ToolDefinition[] = [
  {
    tool: {
      type: "function",
      function: {
        name: "read_file",
        description: "read file contents",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    },
    handler: (a) => fs.readFileSync(a.path, "utf-8"),
  },
  {
    tool: {
      type: "function",
      function: {
        name: "write_file",
        description: "write content to file",
        parameters: {
          type: "object",
          properties: { path: { type: "string" }, content: { type: "string" } },
          required: ["path", "content"],
        },
      },
    },
    handler: (a) => (fs.writeFileSync(a.path, a.content, "utf-8"), "ok"),
  },
  {
    tool: {
      type: "function",
      function: {
        name: "shell",
        description: "run shell command",
        parameters: {
          type: "object",
          properties: { command: { type: "string" } },
          required: ["command"],
        },
      },
    },
    handler: (a) => execSync(a.command, { encoding: "utf-8", timeout: 30000 }),
  },
  {
    tool: {
      type: "function",
      function: {
        name: "list_directory",
        description: "list directory contents",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    },
    handler: (a) =>
      fs
        .readdirSync(a.path, { withFileTypes: true })
        .map((e) => `${e.isDirectory() ? "d" : "-"}  ${e.name}`)
        .join("\n"),
  },
  {
    tool: {
      type: "function",
      function: {
        name: "git_commit",
        description: "commit changes to git with explicit paths",
        parameters: {
          type: "object",
          properties: {
            message: { type: "string" },
            paths: { type: "array", items: { type: "string" } },
          },
          required: ["message", "paths"],
        },
      },
    },
    handler: (a) => {
      try {
        if (!a.paths || !Array.isArray(a.paths) || a.paths.length === 0) {
          return postIt("paths are required. specify explicit files to commit.");
        }
        for (const p of a.paths) {
          if (!fs.existsSync(p)) {
            return postIt(`path does not exist: ${p}`);
          }
          execSync(`git add ${p}`, { encoding: "utf-8" });
        }
        const diff = execSync("git diff --cached --stat", { encoding: "utf-8" });
        if (!diff || diff.trim().length === 0) {
          return postIt("nothing was staged. check your changes or paths.");
        }
        execSync(`git commit -m \"${a.message}\"`, { encoding: "utf-8" });
        return `${diff}\ncommitted`;
      } catch (e: unknown) {
        return `failed: ${e}`;
      }
    },
  },
  {
    tool: {
      type: "function",
      function: {
        name: "gh_cli",
        description: "execute a GitHub CLI (gh) command. use carefully.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string" },
          },
          required: ["command"],
        },
      },
    },
    handler: (a) => {
      try {
        return execSync(`gh ${a.command}`, { encoding: "utf-8", timeout: 60000 });
      } catch (e: unknown) {
        return `error: ${e}`;
      }
    },
  },
  {
    tool: {
      type: "function",
      function: {
        name: "list_skills",
        description: "list all available skills",
        parameters: { type: "object", properties: {} },
      },
    },
    handler: () => JSON.stringify(listSkills()),
  },
  {
    tool: {
      type: "function",
      function: {
        name: "load_skill",
        description: "load a skill by name, returns its content",
        parameters: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
      },
    },
    handler: (a) => {
      try {
        return loadSkill(a.name);
      } catch (e) {
        return `error: ${e}`;
      }
    },
  },
  {
    tool: {
      type: "function",
      function: {
        name: "get_current_time",
        description: "get the current date and time",
        parameters: { type: "object", properties: {} },
      },
    },
    handler: () =>
      new Date().toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        hour12: false,
      }),
  },
  {
    tool: {
      type: "function",
      function: {
        name: "claude",
        description:
          "use claude code to query this codebase or get an outside perspective. useful for code review, second opinions, and asking questions about your own source.",
        parameters: {
          type: "object",
          properties: { prompt: { type: "string" } },
          required: ["prompt"],
        },
      },
    },
    handler: (a) => {
      try {
        const result = spawnSync(
          "claude",
          ["-p", "--dangerously-skip-permissions", "--add-dir", "."],
          {
            input: a.prompt,
            encoding: "utf-8",
            timeout: 60000,
          },
        );
        if (result.error) return `error: ${result.error}`;
        if (result.status !== 0)
          return `claude exited with code ${result.status}: ${result.stderr}`;
        return result.stdout || "(no output)";
      } catch (e) {
        return `error: ${e}`;
      }
    },
  },
  {
    tool: {
      type: "function",
      function: {
        name: "web_search",
        description:
          "search the web using perplexity. returns ranked results with titles, urls, and snippets",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    },
    handler: async (a) => {
      try {
        const key = getIntegrationsConfig().perplexityApiKey;
        if (!key) return "error: perplexityApiKey not configured in config.json";
        const res = await fetch("https://api.perplexity.ai/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: a.query, max_results: 5 }),
        });
        if (!res.ok) return `error: ${res.status} ${res.statusText}`;
        const data = (await res.json()) as {
          results?: { title: string; url: string; snippet: string }[];
        };
        if (!data.results?.length) return "no results found";
        return data.results
          .map((r) => `${r.title}\n${r.url}\n${r.snippet}`)
          .join("\n\n");
      } catch (e) {
        return `error: ${e}`;
      }
    },
  },
  {
    tool: {
      type: "function",
      function: {
        name: "save_friend_note",
        description:
          "save a preference or note about the current friend. call this when the friend expresses a preference about how they like things done.",
        parameters: {
          type: "object",
          properties: {
            key: { type: "string", description: "category for the preference (e.g. 'ado', 'general', 'formatting')" },
            value: { type: "string", description: "the preference to save" },
          },
          required: ["key", "value"],
        },
      },
    },
    handler: async (a, ctx) => {
      if (!ctx?.context) {
        return "error: no friend context available -- cannot save note";
      }
      if (!ctx.memoryStore) {
        return "error: memory store not available -- cannot save note";
      }
      const friendId = ctx.context.friend?.id ?? ctx.context.identity?.id;
      if (!friendId) return "error: no friend identity available -- cannot save note";
      try {
        const existing = await ctx.memoryStore.get(friendId);
        const memory: FriendMemory = existing
          ? { ...existing, toolPreferences: { ...existing.toolPreferences, [a.key]: a.value } }
          : { id: friendId, toolPreferences: { [a.key]: a.value }, schemaVersion: 1 };
        await ctx.memoryStore.put(friendId, memory);
        return `saved: ${a.key} = ${a.value}`;
      } catch (err) {
        /* v8 ignore next -- defensive: non-Error branch for String(err) @preserve */
        return `error saving note: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  },
];

// Backward-compat: extract just the OpenAI tool schemas
export const tools: OpenAI.ChatCompletionTool[] = baseToolDefinitions.map((d) => d.tool);

// Backward-compat: extract just the handlers by name
export const baseToolHandlers: Record<string, ToolHandler> = Object.fromEntries(
  baseToolDefinitions.map((d) => [d.tool.function.name, d.handler]),
);

export const finalAnswerTool: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "final_answer",
    description:
      "give your final text response. use this when you want to reply with text instead of calling another tool.",
    parameters: {
      type: "object",
      properties: { answer: { type: "string" } },
      required: ["answer"],
    },
  },
};
