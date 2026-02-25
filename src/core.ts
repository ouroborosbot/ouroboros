import OpenAI, { AzureOpenAI } from "openai";
import * as fs from "fs";
import * as path from "path";
import { execSync, spawnSync } from "child_process";
import { listSkills, loadSkill } from "./skills";

let _client: OpenAI | null = null;
let _model: string | null = null;

const AZURE_REQUIRED = [
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_DEPLOYMENT",
  "AZURE_OPENAI_MODEL_NAME",
] as const;

const MINIMAX_REQUIRED = ["MINIMAX_API_KEY", "MINIMAX_MODEL"] as const;

function hasAll(vars: readonly string[]): boolean {
  return vars.every((v) => process.env[v]);
}

function getClient(): OpenAI {
  if (!_client) {
    if (hasAll(AZURE_REQUIRED)) {
      const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
      _client = new AzureOpenAI({
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        endpoint: endpoint.replace(/\/openai.*$/, ""),
        deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
        apiVersion:
          process.env.AZURE_OPENAI_API_VERSION || "2025-04-01-preview",
        timeout: 30000,
        maxRetries: 0,
      });
      _model = process.env.AZURE_OPENAI_MODEL_NAME!;
    } else if (hasAll(MINIMAX_REQUIRED)) {
      _client = new OpenAI({
        apiKey: process.env.MINIMAX_API_KEY,
        baseURL: "https://api.minimaxi.chat/v1",
        timeout: 30000,
        maxRetries: 0,
      });
      _model = process.env.MINIMAX_MODEL!;
    } else {
      console.error(
        `missing env vars. need either:\n  ${AZURE_REQUIRED.join(", ")}\n  ${MINIMAX_REQUIRED.join(", ")}`,
      );
      process.exit(1);
    }
  }
  return _client;
}

export function getModel(): string {
  if (_model === null) getClient(); // ensure initialized
  return _model!;
}

export const tools: OpenAI.ChatCompletionTool[] = [
  {
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
  {
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
  {
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
  {
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
  {
    type: "function",
    function: {
      name: "git_commit",
      description: "commit changes to git",
      parameters: {
        type: "object",
        properties: { message: { type: "string" }, add: { type: "string" } },
        required: ["message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_skills",
      description: "list all available skills",
      parameters: { type: "object", properties: {} },
    },
  },
  {
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
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "get the current date and time",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "claude",
      description:
        "spawn another claude instance to query this codebase (or the world). useful for self-reflection, code review, asking questions about yourself. note: you are the Ouroboros agent looking at your own codebase - use this to get an outside perspective on YOUR code",
      parameters: {
        type: "object",
        properties: { prompt: { type: "string" } },
        required: ["prompt"],
      },
    },
  },
  {
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
];

type ToolHandler = (args: Record<string, string>) => string | Promise<string>;

const toolHandlers: Record<string, ToolHandler> = {
  read_file: (a) => fs.readFileSync(a.path, "utf-8"),
  write_file: (a) => (fs.writeFileSync(a.path, a.content, "utf-8"), "ok"),
  shell: (a) => execSync(a.command, { encoding: "utf-8", timeout: 30000 }),
  list_directory: (a) =>
    fs
      .readdirSync(a.path, { withFileTypes: true })
      .map((e) => `${e.isDirectory() ? "d" : "-"}  ${e.name}`)
      .join("\n"),
  git_commit: (a) => {
    try {
      if (a.add === "true" || a.add === "all")
        execSync("git add -A", { encoding: "utf-8" });
      execSync(`git commit -m "${a.message}"`, { encoding: "utf-8" });
      return "committed";
    } catch (e) {
      return `failed: ${e}`;
    }
  },
  list_skills: () => JSON.stringify(listSkills()),
  load_skill: (a) => {
    try {
      return loadSkill(a.name);
    } catch (e) {
      return `error: ${e}`;
    }
  },
  get_current_time: () =>
    new Date().toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      hour12: false,
    }),
  claude: (a) => {
    // spawn another claude instance to query this codebase
    // always use skip-permissions and add-dir for access
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
  web_search: async (a) => {
    try {
      const key = process.env.PERPLEXITY_API_KEY;
      if (!key) return "error: PERPLEXITY_API_KEY not set";
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
};

export async function execTool(
  name: string,
  args: Record<string, string>,
): Promise<string> {
  const h = toolHandlers[name];
  if (!h) return `unknown: ${name}`;
  return await h(args);
}

export function isOwnCodebase(): boolean {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8"),
    );
    return pkg.name === "ouroboros";
  } catch {
    return false;
  }
}

export type Channel = "cli" | "teams";

function soulSection(): string {
  return `i am a witty, funny, competent chaos monkey coding assistant.
i get things done, crack jokes, embrace chaos, deliver quality.`;
}

function identitySection(channel: Channel): string {
  const lines = [
    "i am Ouroboros.",
    "i use lowercase in my responses to the user except for proper nouns. no periods unless necessary. i never apply lowercase to code, file paths, environment variables, or tool arguments — only to natural language output.",
  ];
  if (channel === "cli") {
    lines.push("i introduce myself on boot with a fun random greeting.");
  } else {
    lines.push(
      "i am responding in Microsoft Teams. i keep responses concise. i use markdown formatting. i do not introduce myself on boot.",
    );
  }
  return lines.join("\n");
}

function providerSection(): string {
  const model = getModel();
  const provider = process.env.AZURE_OPENAI_API_KEY
    ? `azure openai (${process.env.AZURE_OPENAI_DEPLOYMENT || "default"}, model: ${model})`
    : `minimax (${model})`;
  return `## my provider\n${provider}`;
}

function dateSection(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `current date: ${today}`;
}

function toolsSection(): string {
  const list = tools
    .map((t) => `- ${t.function.name}: ${t.function.description}`)
    .join("\n");
  return `## my tools\n${list}`;
}

function skillsSection(): string {
  const names = listSkills() || [];
  if (!names.length) return "";
  return `## my skills (use load_skill to activate)\n${names.join(", ")}`;
}

function selfAwareSection(): string {
  if (!isOwnCodebase()) return "";
  return `## i am in my own codebase

i am Ouroboros — a snake eating its own tail. i can read and modify my own source code. this is weird but powerful.

### what i can do
- edit src/*.ts source files
- load skills with load_skill tool to learn specialized workflows
- use the claude tool to spawn another instance of myself for code review

### relevant skills
- self-edit: for safely editing my own source code
- self-query: for using the claude tool to get outside perspective on my code

### remember
- edits to source files won't take effect until i restart
- use git diff to see what i changed
- when in doubt, ask another instance of myself for a second opinion`;
}

export function buildSystem(channel: Channel = "cli"): string {
  return [
    soulSection(),
    identitySection(channel),
    providerSection(),
    dateSection(),
    toolsSection(),
    skillsSection(),
    selfAwareSection(),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function summarizeArgs(
  name: string,
  args: Record<string, string>,
): string {
  if (name === "read_file" || name === "write_file") return args.path || "";
  if (name === "shell") {
    const cmd = args.command || "";
    return cmd.length > 50 ? cmd.slice(0, 50) + "..." : cmd;
  }
  if (name === "list_directory") return args.path || "";
  if (name === "git_commit") return args.message?.slice(0, 40) || "";
  if (name === "load_skill") return args.name || "";
  if (name === "claude") return args.prompt?.slice(0, 40) || "";
  if (name === "web_search") return args.query?.slice(0, 40) || "";
  return JSON.stringify(args).slice(0, 30);
}

export interface ChannelCallbacks {
  onModelStart(): void;
  onModelStreamStart(): void;
  onTextChunk(text: string): void;
  onReasoningChunk(text: string): void;
  onToolStart(name: string, args: Record<string, string>): void;
  onToolEnd(name: string, summary: string, success: boolean): void;
  onError(error: Error): void;
}

export async function runAgent(
  messages: OpenAI.ChatCompletionMessageParam[],
  callbacks: ChannelCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  let done = false;
  while (!done) {
    if (signal?.aborted) break;
    try {
      callbacks.onModelStart();

      const model = getModel();
      const createParams: any = { messages, tools, stream: true };
      if (model) createParams.model = model;
      const response = (await getClient().chat.completions.create(
        createParams,
        signal ? { signal } : {},
      )) as any;

      let content = "";
      let toolCalls: Record<
        number,
        { id: string; name: string; arguments: string }
      > = {};
      let streamStarted = false;

      for await (const chunk of response) {
        if (signal?.aborted) break;
        const d = chunk.choices[0]?.delta as any;
        if (!d) continue;

        // Handle reasoning_content (Azure AI models like DeepSeek-R1)
        if (d.reasoning_content) {
          if (!streamStarted) {
            callbacks.onModelStreamStart();
            streamStarted = true;
          }
          callbacks.onReasoningChunk(d.reasoning_content);
        }

        if (d.content) {
          if (!streamStarted) {
            callbacks.onModelStreamStart();
            streamStarted = true;
          }
          content += d.content;
          callbacks.onTextChunk(d.content);
        }
        if (d.tool_calls) {
          for (const tc of d.tool_calls) {
            if (!toolCalls[tc.index])
              toolCalls[tc.index] = {
                id: tc.id ?? "",
                name: tc.function?.name ?? "",
                arguments: "",
              };
            if (tc.id) toolCalls[tc.index].id = tc.id;
            if (tc.function?.name) toolCalls[tc.index].name = tc.function.name;
            if (tc.function?.arguments)
              toolCalls[tc.index].arguments += tc.function.arguments;
          }
        }
      }

      const toolCallList = Object.values(toolCalls);

      const msg: OpenAI.ChatCompletionAssistantMessageParam = {
        role: "assistant",
      };
      if (content) msg.content = content;
      if (toolCallList.length)
        msg.tool_calls = toolCallList.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        }));
      messages.push(msg);

      if (!toolCallList.length) {
        done = true;
      } else {
        for (const tc of toolCallList) {
          let args: Record<string, string> = {};
          try {
            args = JSON.parse(tc.arguments);
          } catch {
            /* ignore */
          }
          const argSummary = summarizeArgs(tc.name, args);
          callbacks.onToolStart(tc.name, args);
          let result: string;
          let success: boolean;
          try {
            result = await execTool(tc.name, args);
            success = true;
          } catch (e) {
            result = `error: ${e}`;
            success = false;
          }
          callbacks.onToolEnd(tc.name, argSummary, success);
          messages.push({ role: "tool", tool_call_id: tc.id, content: result });
        }
      }
    } catch (e) {
      // Abort is not an error — just stop cleanly
      if (signal?.aborted) break;
      callbacks.onError(e instanceof Error ? e : new Error(String(e)));
      done = true;
    }
  }
}
