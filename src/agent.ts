import OpenAI from "openai";
import * as readline from "readline";
import * as fs from "fs";
import { execSync } from "child_process";

const apiKey = process.env.MINIMAX_API_KEY;
if (!apiKey) {
  console.error("Error: MINIMAX_API_KEY environment variable is not set.");
  process.exit(1);
}

const client = new OpenAI({
  apiKey,
  baseURL: "https://api.minimaxi.chat/v1",
});

const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file at the given path",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "File path to read" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file at the given path",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to write" },
          content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shell",
      description: "Run a shell command and return its output",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "Shell command to execute" } },
        required: ["command"],
      },
    },
  },
];

function executeTool(name: string, args: Record<string, string>): string {
  switch (name) {
    case "read_file":
      return fs.readFileSync(args.path, "utf-8");
    case "write_file":
      fs.writeFileSync(args.path, args.content, "utf-8");
      return "OK";
    case "shell":
      return execSync(args.command, { encoding: "utf-8", timeout: 30_000 });
    default:
      return `Unknown tool: ${name}`;
  }
}

const messages: OpenAI.ChatCompletionMessageParam[] = [];

interface StreamResult {
  content: string;
  toolCalls: { id: string; name: string; arguments: string }[];
}

async function streamResponse(): Promise<StreamResult> {
  const stream = await client.chat.completions.create({
    model: process.env.MINIMAX_MODEL || "MiniMax-M2.5",
    messages,
    tools,
    stream: true,
  });

  let content = "";
  let buf = "";
  let inThink = false;
  const toolCalls: Record<number, { id: string; name: string; arguments: string }> = {};

  function flush() {
    while (buf.length > 0) {
      if (inThink) {
        const end = buf.indexOf("</think>");
        if (end === -1) {
          process.stdout.write(`\x1b[2m${buf}\x1b[0m`);
          buf = "";
        } else {
          process.stdout.write(`\x1b[2m${buf.slice(0, end + 8)}\x1b[0m`);
          buf = buf.slice(end + 8);
          inThink = false;
        }
      } else {
        const start = buf.indexOf("<think>");
        if (start === -1) {
          process.stdout.write(buf);
          buf = "";
        } else {
          process.stdout.write(buf.slice(0, start));
          buf = buf.slice(start);
          inThink = true;
        }
      }
    }
  }

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;

    if (delta.content) {
      content += delta.content;
      buf += delta.content;
      flush();
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (!toolCalls[tc.index]) {
          toolCalls[tc.index] = { id: tc.id ?? "", name: tc.function?.name ?? "", arguments: "" };
        }
        if (tc.id) toolCalls[tc.index].id = tc.id;
        if (tc.function?.name) toolCalls[tc.index].name = tc.function.name;
        if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments;
      }
    }
  }
  process.stdout.write("\n");
  return { content, toolCalls: Object.values(toolCalls) };
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let closed = false;
  rl.on("close", () => { closed = true; });

  console.log("MiniMax chat (type 'exit' to quit)\n");
  process.stdout.write("\x1b[36m> \x1b[0m");

  for await (const input of rl) {
    if (closed) break;
    if (input.trim().toLowerCase() === "exit") break;
    if (!input.trim()) {
      process.stdout.write("\x1b[36m> \x1b[0m");
      continue;
    }

    messages.push({ role: "user", content: input });
    const { content, toolCalls } = await streamResponse();

    const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = { role: "assistant" };
    if (content) assistantMsg.content = content;
    if (toolCalls.length > 0) {
      assistantMsg.tool_calls = toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }
    messages.push(assistantMsg);

    for (const tc of toolCalls) {
      console.log(`\x1b[33m[tool: ${tc.name}]\x1b[0m`);
      let result: string;
      try {
        const args = JSON.parse(tc.arguments);
        result = executeTool(tc.name, args);
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      console.log(`\x1b[2m${result}\x1b[0m`);
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }

    console.log();
    if (closed) break;
    process.stdout.write("\x1b[36m> \x1b[0m");
  }

  rl.close();
}

main();
