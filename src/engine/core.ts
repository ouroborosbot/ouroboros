import OpenAI, { AzureOpenAI } from "openai";
import * as fs from "fs";
import * as path from "path";
import { listSkills } from "../repertoire/skills";
import { getAzureConfig, getMinimaxConfig } from "../config";
import { tools, execTool, summarizeArgs } from "./tools";

let _client: OpenAI | null = null;
let _model: string | null = null;
let _provider: "azure" | "minimax" | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const azureConfig = getAzureConfig();
    const minimaxConfig = getMinimaxConfig();

    if (azureConfig.apiKey && azureConfig.endpoint && azureConfig.deployment && azureConfig.modelName) {
      _client = new AzureOpenAI({
        apiKey: azureConfig.apiKey,
        endpoint: azureConfig.endpoint.replace(/\/openai.*$/, ""),
        deployment: azureConfig.deployment,
        apiVersion: azureConfig.apiVersion,
        timeout: 30000,
        maxRetries: 0,
      });
      _model = azureConfig.modelName;
      _provider = "azure";
    } else if (minimaxConfig.apiKey) {
      _client = new OpenAI({
        apiKey: minimaxConfig.apiKey,
        baseURL: "https://api.minimaxi.chat/v1",
        timeout: 30000,
        maxRetries: 0,
      });
      _model = minimaxConfig.model;
      _provider = "minimax";
    } else {
      console.error(
        "no provider configured. set azure or minimax credentials in config.json or env vars.",
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

export function getProvider(): "azure" | "minimax" {
  if (_provider === null) getClient(); // ensure initialized
  return _provider!;
}

// Re-export tools, execTool, summarizeArgs from ./tools for backward compat
export { tools, execTool, summarizeArgs } from "./tools";

export function toResponsesInput(
  messages: OpenAI.ChatCompletionMessageParam[],
): { instructions: string; input: any[] } {
  let instructions = "";
  const input: any[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      if (!instructions) {
        instructions = (msg as any).content || "";
      }
      continue;
    }

    if (msg.role === "user") {
      input.push({ role: "user", content: (msg as any).content });
      continue;
    }

    if (msg.role === "assistant") {
      const a = msg as any;
      if (a.content) {
        input.push({ role: "assistant", content: a.content });
      }
      if (a.tool_calls) {
        for (const tc of a.tool_calls) {
          input.push({
            type: "function_call",
            call_id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
            status: "completed",
          });
        }
      }
      continue;
    }

    if (msg.role === "tool") {
      const t = msg as any;
      input.push({
        type: "function_call_output",
        call_id: t.tool_call_id,
        output: t.content,
      });
      continue;
    }
  }

  return { instructions, input };
}

export function toResponsesTools(
  ccTools: OpenAI.ChatCompletionTool[],
): { type: "function"; name: string; description: string | null; parameters: Record<string, unknown> | null; strict: false }[] {
  return ccTools.map((t) => ({
    type: "function" as const,
    name: t.function.name,
    description: t.function.description ?? null,
    parameters: (t.function.parameters as Record<string, unknown>) ?? null,
    strict: false as const,
  }));
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

export interface TurnResult {
  content: string;
  toolCalls: { id: string; name: string; arguments: string }[];
  outputItems: any[];
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

export async function streamChatCompletion(
  client: any,
  createParams: any,
  callbacks: ChannelCallbacks,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const response = (await client.chat.completions.create(
    createParams,
    signal ? { signal } : {},
  )) as any;

  let content = "";
  let toolCalls: Record<
    number,
    { id: string; name: string; arguments: string }
  > = {};
  let streamStarted = false;

  // State machine for parsing inline <think> tags (MiniMax pattern)
  let contentBuf = "";
  let inThinkTag = false;
  const OPEN_TAG = "<think>";
  const CLOSE_TAG = "</think>";

  function processContentBuf(flush: boolean): void {
    while (contentBuf.length > 0) {
      if (inThinkTag) {
        const end = contentBuf.indexOf(CLOSE_TAG);
        if (end !== -1) {
          const reasoning = contentBuf.slice(0, end);
          if (reasoning) callbacks.onReasoningChunk(reasoning);
          contentBuf = contentBuf.slice(end + CLOSE_TAG.length);
          inThinkTag = false;
        } else {
          // Check if buffer ends with a partial </think> prefix
          if (!flush) {
            let retain = 0;
            for (let i = 1; i < CLOSE_TAG.length && i <= contentBuf.length; i++) {
              if (contentBuf.endsWith(CLOSE_TAG.slice(0, i))) retain = i;
            }
            if (retain > 0) {
              const reasoning = contentBuf.slice(0, -retain);
              if (reasoning) callbacks.onReasoningChunk(reasoning);
              contentBuf = contentBuf.slice(-retain);
              return;
            }
          }
          // All reasoning, flush it
          callbacks.onReasoningChunk(contentBuf);
          contentBuf = "";
        }
      } else {
        const start = contentBuf.indexOf(OPEN_TAG);
        if (start !== -1) {
          const text = contentBuf.slice(0, start);
          if (text) callbacks.onTextChunk(text);
          contentBuf = contentBuf.slice(start + OPEN_TAG.length);
          inThinkTag = true;
        } else {
          // Check if buffer ends with a partial <think> prefix
          if (!flush) {
            let retain = 0;
            for (let i = 1; i < OPEN_TAG.length && i <= contentBuf.length; i++) {
              if (contentBuf.endsWith(OPEN_TAG.slice(0, i))) retain = i;
            }
            if (retain > 0) {
              const text = contentBuf.slice(0, -retain);
              if (text) callbacks.onTextChunk(text);
              contentBuf = contentBuf.slice(-retain);
              return;
            }
          }
          // All content, flush it
          callbacks.onTextChunk(contentBuf);
          contentBuf = "";
        }
      }
    }
  }

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
      contentBuf += d.content;
      processContentBuf(false);
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
  // Flush any remaining buffer at end of stream
  if (contentBuf) processContentBuf(true);

  return {
    content,
    toolCalls: Object.values(toolCalls),
    outputItems: [],
  };
}

export async function streamResponsesApi(
  client: any,
  createParams: any,
  callbacks: ChannelCallbacks,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const response = (await client.responses.create(
    createParams,
    signal ? { signal } : {},
  )) as any;

  let content = "";
  let streamStarted = false;
  const toolCalls: { id: string; name: string; arguments: string }[] = [];
  const outputItems: any[] = [];
  let currentToolCall: { call_id: string; name: string; arguments: string } | null = null;

  for await (const event of response) {
    if (signal?.aborted) break;

    switch (event.type) {
      case "response.output_text.delta": {
        if (!streamStarted) {
          callbacks.onModelStreamStart();
          streamStarted = true;
        }
        const delta = String(event.delta);
        callbacks.onTextChunk(delta);
        content += delta;
        break;
      }
      case "response.reasoning_summary_text.delta": {
        if (!streamStarted) {
          callbacks.onModelStreamStart();
          streamStarted = true;
        }
        callbacks.onReasoningChunk(String(event.delta));
        break;
      }
      case "response.output_item.added": {
        if (event.item?.type === "function_call") {
          currentToolCall = {
            call_id: event.item.call_id,
            name: event.item.name,
            arguments: "",
          };
        }
        break;
      }
      case "response.function_call_arguments.delta": {
        if (currentToolCall) {
          currentToolCall.arguments += event.delta;
        }
        break;
      }
      case "response.output_item.done": {
        outputItems.push(event.item);
        if (event.item?.type === "function_call") {
          toolCalls.push({
            id: event.item.call_id,
            name: event.item.name,
            arguments: event.item.arguments,
          });
          currentToolCall = null;
        }
        break;
      }
      default:
        // Unknown/unhandled events silently ignored
        break;
    }
  }

  return {
    content,
    toolCalls,
    outputItems,
  };
}

export const MAX_TOOL_ROUNDS = 10;

// Remove orphan tool_calls from the last assistant message and any
// trailing tool-result messages that lack a matching tool_call.
// This keeps the conversation valid after an abort or tool-loop limit.
export function stripLastToolCalls(
  messages: OpenAI.ChatCompletionMessageParam[],
): void {
  // Pop any trailing tool-result messages
  while (messages.length && messages[messages.length - 1].role === "tool") {
    messages.pop();
  }
  // Strip tool_calls from the last assistant message
  const last = messages[messages.length - 1] as any;
  if (last?.role === "assistant" && last.tool_calls) {
    delete last.tool_calls;
    // If the assistant message is now empty, remove it entirely
    if (!last.content) messages.pop();
  }
}

export async function runAgent(
  messages: OpenAI.ChatCompletionMessageParam[],
  callbacks: ChannelCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const client = getClient();
  const provider = getProvider();
  const model = getModel();
  let done = false;
  let toolRounds = 0;

  // For Azure Responses API: maintain native input array with original output
  // items (reasoning, function_calls) in correct order.  Initialized from CC
  // messages on first iteration (session resumption), then kept in sync with
  // the API's own output items for accurate multi-turn tool loops.
  let azureInput: any[] | null = null;
  let azureInstructions = "";

  // Prevent MaxListenersExceeded warning — each iteration adds a listener
  try { require("events").setMaxListeners(MAX_TOOL_ROUNDS + 5, signal); } catch { /* unsupported */ }

  while (!done) {
    // Yield so pending I/O (stdin Ctrl-C) can be processed between iterations
    await new Promise((r) => setImmediate(r));
    if (signal?.aborted) break;
    try {
      callbacks.onModelStart();

      let result: TurnResult;

      if (provider === "azure") {
        // First iteration: build from CC messages (handles session resumption)
        if (!azureInput) {
          const { instructions, input } = toResponsesInput(messages);
          azureInput = input;
          azureInstructions = instructions;
        }
        result = await streamResponsesApi(
          client,
          {
            model,
            input: azureInput,
            instructions: azureInstructions,
            tools: toResponsesTools(tools),
            reasoning: { effort: "medium", summary: "detailed" },
            stream: true,
            store: false,
            include: ["reasoning.encrypted_content"],
          },
          callbacks,
          signal,
        );
        // Append ALL output items (reasoning + function_calls + text) in order
        for (const item of result.outputItems) {
          azureInput.push(item);
        }
      } else {
        const createParams: any = { messages, tools, stream: true };
        if (model) createParams.model = model;
        result = await streamChatCompletion(client, createParams, callbacks, signal);
      }

      // SHARED: build CC-format assistant message from TurnResult
      const msg: OpenAI.ChatCompletionAssistantMessageParam = {
        role: "assistant",
      };
      if (result.content) msg.content = result.content;
      if (result.toolCalls.length)
        msg.tool_calls = result.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        }));
      messages.push(msg);

      if (!result.toolCalls.length) {
        done = true;
      } else {
        toolRounds++;
        if (toolRounds >= MAX_TOOL_ROUNDS) {
          // Strip tool_calls from the assistant message we just pushed so the
          // conversation stays valid (every tool_call needs a tool response).
          stripLastToolCalls(messages);
          callbacks.onError(new Error(`tool loop limit reached (${MAX_TOOL_ROUNDS} rounds)`));
          done = true;
          break;
        }
        // SHARED: execute tools
        for (const tc of result.toolCalls) {
          if (signal?.aborted) break;
          let args: Record<string, string> = {};
          try {
            args = JSON.parse(tc.arguments);
          } catch {
            /* ignore */
          }
          const argSummary = summarizeArgs(tc.name, args);
          callbacks.onToolStart(tc.name, args);
          let toolResult: string;
          let success: boolean;
          try {
            toolResult = await execTool(tc.name, args);
            success = true;
          } catch (e) {
            toolResult = `error: ${e}`;
            success = false;
          }
          callbacks.onToolEnd(tc.name, argSummary, success);
          messages.push({ role: "tool", tool_call_id: tc.id, content: toolResult });
          // Keep Azure input in sync with tool results
          if (azureInput) {
            azureInput.push({ type: "function_call_output", call_id: tc.id, output: toolResult });
          }
        }
      }
    } catch (e) {
      // Abort is not an error — just stop cleanly
      if (signal?.aborted) {
        stripLastToolCalls(messages);
        break;
      }
      callbacks.onError(e instanceof Error ? e : new Error(String(e)));
      stripLastToolCalls(messages);
      done = true;
    }
  }
}
