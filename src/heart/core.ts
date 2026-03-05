import Anthropic from "@anthropic-ai/sdk";
import OpenAI, { AzureOpenAI } from "openai";
import {
  getAnthropicConfig,
  getAzureConfig,
  getContextConfig,
  getMinimaxConfig,
} from "../config";
import { loadAgentConfig } from "../identity";
import { execTool, summarizeArgs, finalAnswerTool, getToolsForChannel, isConfirmationRequired } from "../repertoire/tools";
import type { ToolContext } from "../repertoire/tools";
import { getChannelCapabilities } from "../mind/friends/channel";
import { streamChatCompletion, streamResponsesApi, toResponsesInput, toResponsesTools } from "./streaming";
import type { AssistantMessageWithReasoning, ResponseItem } from "./streaming";
import { detectKick } from "./kicks";
import { emitNervesEvent } from "../nerves/runtime";
import type { KickReason } from "./kicks";
import type { TurnResult } from "./streaming";
import type { UsageData } from "../mind/context";
import { trimMessages } from "../mind/context";
import { buildSystem } from "../mind/prompt";
import type { Channel } from "../mind/prompt";

export type ProviderId = "azure" | "anthropic" | "minimax";

interface ProviderRuntime {
  id: ProviderId;
  model: string;
  client: unknown;
  streamTurn(request: ProviderTurnRequest): Promise<TurnResult>;
  appendToolOutput(callId: string, output: string): void;
  resetTurnState(messages: OpenAI.ChatCompletionMessageParam[]): void;
}

interface ProviderTurnRequest {
  messages: OpenAI.ChatCompletionMessageParam[];
  activeTools: OpenAI.ChatCompletionTool[];
  callbacks: ChannelCallbacks;
  signal?: AbortSignal;
  traceId?: string;
  toolChoiceRequired?: boolean;
}

interface ProviderRegistry {
  resolve(): ProviderRuntime | null;
}

let _providerRuntime: ProviderRuntime | null = null;

const ANTHROPIC_SETUP_TOKEN_PREFIX = "sk-ant-oat01-";
const ANTHROPIC_SETUP_TOKEN_MIN_LENGTH = 80;
const ANTHROPIC_OAUTH_BETA_HEADER =
  "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14";

interface AnthropicCredential {
  token: string;
}

function getAnthropicReauthGuidance(reason: string): string {
  return `${reason} Run \`claude setup-token\`, then set providers.anthropic.setupToken in secrets.json.`;
}

function resolveAnthropicSetupTokenCredential(): AnthropicCredential {
  const anthropicConfig = getAnthropicConfig();
  const token = anthropicConfig.setupToken?.trim();
  if (!token) {
    throw new Error(
      getAnthropicReauthGuidance(
        "Anthropic provider is selected but no setup-token credential was found.",
      ),
    );
  }
  if (!token.startsWith(ANTHROPIC_SETUP_TOKEN_PREFIX)) {
    throw new Error(
      getAnthropicReauthGuidance(
        `Anthropic credential is not a setup-token (expected prefix ${ANTHROPIC_SETUP_TOKEN_PREFIX}).`,
      ),
    );
  }
  if (token.length < ANTHROPIC_SETUP_TOKEN_MIN_LENGTH) {
    throw new Error(
      getAnthropicReauthGuidance("Anthropic setup-token looks too short."),
    );
  }
  return { token };
}

function toAnthropicTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: string; text?: unknown } => (
      typeof part === "object" &&
      part !== null &&
      (part as { type?: unknown }).type === "text"
    ))
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n");
}

function parseToolCallInput(argumentsJson: string): Record<string, unknown> {
  if (!argumentsJson.trim()) return {};
  try {
    const parsed = JSON.parse(argumentsJson);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function toAnthropicMessages(
  messages: OpenAI.ChatCompletionMessageParam[],
): { system?: string; messages: Array<Record<string, unknown>> } {
  let system: string | undefined;
  const converted: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      if (!system) {
        const text = toAnthropicTextContent((msg as OpenAI.ChatCompletionSystemMessageParam).content);
        system = text || undefined;
      }
      continue;
    }

    if (msg.role === "user") {
      converted.push({
        role: "user",
        content: toAnthropicTextContent((msg as OpenAI.ChatCompletionUserMessageParam).content),
      });
      continue;
    }

    if (msg.role === "assistant") {
      const assistant = msg as OpenAI.ChatCompletionAssistantMessageParam;
      const blocks: Array<Record<string, unknown>> = [];
      const text = toAnthropicTextContent(assistant.content);
      if (text) {
        blocks.push({ type: "text", text });
      }
      if (assistant.tool_calls) {
        for (const toolCall of assistant.tool_calls) {
          blocks.push({
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.function.name,
            input: parseToolCallInput(toolCall.function.arguments),
          });
        }
      }
      if (blocks.length === 0) {
        blocks.push({ type: "text", text: "" });
      }
      converted.push({ role: "assistant", content: blocks });
      continue;
    }

    if (msg.role === "tool") {
      const tool = msg as OpenAI.ChatCompletionToolMessageParam;
      converted.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: tool.tool_call_id,
            content: toAnthropicTextContent(tool.content),
          },
        ],
      });
    }
  }

  return { system, messages: converted };
}

function toAnthropicTools(tools: OpenAI.ChatCompletionTool[]): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description ?? "",
    input_schema: (tool.function.parameters as Record<string, unknown>) ?? { type: "object", properties: {} },
  }));
}

function toAnthropicUsage(raw: Record<string, unknown>): UsageData {
  const inputTokens = Number(raw.input_tokens ?? 0) || 0;
  const cacheCreateTokens = Number(raw.cache_creation_input_tokens ?? 0) || 0;
  const cacheReadTokens = Number(raw.cache_read_input_tokens ?? 0) || 0;
  const outputTokens = Number(raw.output_tokens ?? 0) || 0;
  const totalInputTokens = inputTokens + cacheCreateTokens + cacheReadTokens;
  return {
    input_tokens: totalInputTokens,
    output_tokens: outputTokens,
    reasoning_tokens: 0,
    total_tokens: totalInputTokens + outputTokens,
  };
}

function isAnthropicAuthFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as HttpError).status;
  if (status === 401 || status === 403) return true;
  const lower = error.message.toLowerCase();
  return (
    lower.includes("oauth authentication") ||
    lower.includes("authentication failed") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid api key")
  );
}

function withAnthropicAuthGuidance(error: unknown): Error {
  const base = error instanceof Error ? error.message : String(error);
  if (isAnthropicAuthFailure(error)) {
    return new Error(getAnthropicReauthGuidance(`Anthropic authentication failed (${base}).`));
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function streamAnthropicMessages(
  client: Anthropic,
  model: string,
  request: ProviderTurnRequest,
): Promise<TurnResult> {
  const { system, messages } = toAnthropicMessages(request.messages);
  const anthropicTools = toAnthropicTools(request.activeTools);

  const params: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    messages,
    stream: true,
  };
  if (system) params.system = system;
  if (anthropicTools.length > 0) params.tools = anthropicTools;
  if (request.toolChoiceRequired && anthropicTools.length > 0) {
    params.tool_choice = { type: "any" };
  }

  let response: AsyncIterable<Record<string, unknown>>;
  try {
    response = await client.messages.create(
      params as unknown as Anthropic.MessageCreateParamsStreaming,
      request.signal ? { signal: request.signal } : {},
    ) as AsyncIterable<Record<string, unknown>>;
  } catch (error) {
    throw withAnthropicAuthGuidance(error);
  }

  let content = "";
  let streamStarted = false;
  let usage: UsageData | undefined;
  const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();

  try {
    for await (const event of response) {
      if (request.signal?.aborted) break;
      const eventType = String(event.type ?? "");
      if (eventType === "content_block_start") {
        const block = event.content_block as Record<string, unknown> | undefined;
        if (block?.type === "tool_use") {
          const index = Number(event.index);
          const rawInput = block.input;
          const input = rawInput && typeof rawInput === "object"
            ? JSON.stringify(rawInput)
            : "";
          toolCalls.set(index, {
            id: String(block.id ?? ""),
            name: String(block.name ?? ""),
            arguments: input,
          });
        }
        continue;
      }

      if (eventType === "content_block_delta") {
        const delta = event.delta as Record<string, unknown> | undefined;
        const deltaType = String(delta?.type ?? "");
        if (deltaType === "text_delta") {
          if (!streamStarted) {
            request.callbacks.onModelStreamStart();
            streamStarted = true;
          }
          const text = String(delta?.text ?? "");
          content += text;
          request.callbacks.onTextChunk(text);
          continue;
        }
        if (deltaType === "thinking_delta") {
          if (!streamStarted) {
            request.callbacks.onModelStreamStart();
            streamStarted = true;
          }
          request.callbacks.onReasoningChunk(String(delta?.thinking ?? ""));
          continue;
        }
        if (deltaType === "input_json_delta") {
          const index = Number(event.index);
          const existing = toolCalls.get(index);
          if (existing) {
            existing.arguments += String(delta?.partial_json ?? "");
          }
          continue;
        }
      }

      if (eventType === "content_block_stop") {
        const index = Number(event.index);
        const existing = toolCalls.get(index);
        if (existing && existing.arguments.trim().length === 0) {
          existing.arguments = "{}";
        }
        continue;
      }

      if (eventType === "message_delta") {
        const rawUsage = event.usage;
        if (rawUsage && typeof rawUsage === "object") {
          usage = toAnthropicUsage(rawUsage as Record<string, unknown>);
        }
      }
    }
  } catch (error) {
    throw withAnthropicAuthGuidance(error);
  }

  return {
    content,
    toolCalls: [...toolCalls.values()],
    outputItems: [],
    usage,
  };
}

export function createProviderRegistry(): ProviderRegistry {
  const runtimeFactories: Record<ProviderId, () => ProviderRuntime> = {
    azure: () => {
      const azureConfig = getAzureConfig();
      if (!(azureConfig.apiKey && azureConfig.endpoint && azureConfig.deployment && azureConfig.modelName)) {
        throw new Error(
          "provider 'azure' is selected in agent.json but providers.azure is incomplete in secrets.json.",
        );
      }
      const client = new AzureOpenAI({
        apiKey: azureConfig.apiKey,
        endpoint: azureConfig.endpoint.replace(/\/openai.*$/, ""),
        deployment: azureConfig.deployment,
        apiVersion: azureConfig.apiVersion,
        timeout: 30000,
        maxRetries: 0,
      });
      let nativeInput: ResponseItem[] | null = null;
      let nativeInstructions = "";
      return {
        id: "azure",
        model: azureConfig.modelName,
        client,
        resetTurnState(messages: OpenAI.ChatCompletionMessageParam[]): void {
          const { instructions, input } = toResponsesInput(messages);
          nativeInput = input;
          nativeInstructions = instructions;
        },
        appendToolOutput(callId: string, output: string): void {
          if (!nativeInput) return;
          nativeInput.push({ type: "function_call_output", call_id: callId, output });
        },
        async streamTurn(request: ProviderTurnRequest): Promise<TurnResult> {
          if (!nativeInput) this.resetTurnState(request.messages);
          const params: Record<string, unknown> = {
            model: this.model,
            input: nativeInput,
            instructions: nativeInstructions,
            tools: toResponsesTools(request.activeTools),
            reasoning: { effort: "medium", summary: "detailed" },
            stream: true,
            store: false,
            include: ["reasoning.encrypted_content"],
          };
          if (request.traceId) params.metadata = { trace_id: request.traceId };
          if (request.toolChoiceRequired) params.tool_choice = "required";
          const result = await streamResponsesApi(this.client as OpenAI, params, request.callbacks, request.signal);
          for (const item of result.outputItems) nativeInput!.push(item);
          return result;
        },
      };
    },
    anthropic: () => {
      const anthropicConfig = getAnthropicConfig();
      if (!(anthropicConfig.model && anthropicConfig.setupToken)) {
        throw new Error(
          "provider 'anthropic' is selected in agent.json but providers.anthropic.model/setupToken is incomplete in secrets.json.",
        );
      }
      const credential = resolveAnthropicSetupTokenCredential();
      const client = new Anthropic({
        apiKey: credential.token,
        timeout: 30000,
        maxRetries: 0,
        defaultHeaders: {
          "anthropic-beta": ANTHROPIC_OAUTH_BETA_HEADER,
        },
      });
      return {
        id: "anthropic",
        model: anthropicConfig.model,
        client,
        resetTurnState(_messages: OpenAI.ChatCompletionMessageParam[]): void {
          // Anthropic request payload is derived from canonical messages each turn.
        },
        appendToolOutput(_callId: string, _output: string): void {
          // Anthropic uses canonical messages for tool_result tracking.
        },
        streamTurn(request: ProviderTurnRequest): Promise<TurnResult> {
          return streamAnthropicMessages(client, anthropicConfig.model, request);
        },
      };
    },
    minimax: () => {
      const minimaxConfig = getMinimaxConfig();
      if (!minimaxConfig.apiKey) {
        throw new Error(
          "provider 'minimax' is selected in agent.json but providers.minimax.apiKey is missing in secrets.json.",
        );
      }
      const client = new OpenAI({
        apiKey: minimaxConfig.apiKey,
        baseURL: "https://api.minimaxi.chat/v1",
        timeout: 30000,
        maxRetries: 0,
      });
      return {
        id: "minimax",
        model: minimaxConfig.model,
        client,
        resetTurnState(_messages: OpenAI.ChatCompletionMessageParam[]): void {
          // No provider-owned turn state for chat-completions providers.
        },
        appendToolOutput(_callId: string, _output: string): void {
          // Chat-completions providers rely on canonical messages only.
        },
        streamTurn(request: ProviderTurnRequest): Promise<TurnResult> {
          const params: Record<string, unknown> = {
            messages: request.messages,
            tools: request.activeTools,
            stream: true,
          };
          if (this.model) params.model = this.model;
          if (request.traceId) params.metadata = { trace_id: request.traceId };
          if (request.toolChoiceRequired) params.tool_choice = "required";
          return streamChatCompletion(this.client as OpenAI, params, request.callbacks, request.signal);
        },
      };
    },
  };

  return {
    resolve(): ProviderRuntime | null {
      const provider = loadAgentConfig().provider;
      return runtimeFactories[provider]();
    },
  };
}

function getProviderRuntime(): ProviderRuntime {
  if (!_providerRuntime) {
    try {
      _providerRuntime = createProviderRegistry().resolve();
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
      throw new Error("unreachable");
    }
    if (!_providerRuntime) {
      console.error(
        "provider runtime could not be initialized.",
      );
      process.exit(1);
      throw new Error("unreachable");
    }
  }
  return _providerRuntime;
}

export function getModel(): string {
  return getProviderRuntime().model;
}

export function getProvider(): ProviderId {
  return getProviderRuntime().id;
}

export function getProviderDisplayLabel(): string {
  const model = getModel();
  const providerLabelBuilders: Record<ProviderId, () => string> = {
    azure: () => `azure openai (${getAzureConfig().deployment || "default"}, model: ${model})`,
    anthropic: () => `anthropic (${model})`,
    minimax: () => `minimax (${model})`,
  };
  return providerLabelBuilders[getProvider()]();
}

// Re-export tools, execTool, summarizeArgs from ./tools for backward compat
export { tools, execTool, summarizeArgs, getToolsForChannel } from "../repertoire/tools";
export type { ToolContext } from "../repertoire/tools";
// Re-export streaming functions for backward compat
export { streamChatCompletion, streamResponsesApi, toResponsesInput, toResponsesTools } from "./streaming";
export type { TurnResult } from "./streaming";

// Re-export prompt functions for backward compat
export { buildSystem } from "../mind/prompt";
export type { Channel } from "../mind/prompt";

export interface ChannelCallbacks {
  onModelStart(): void;
  onModelStreamStart(): void;
  onTextChunk(text: string): void;
  onReasoningChunk(text: string): void;
  onToolStart(name: string, args: Record<string, string>): void;
  onToolEnd(name: string, summary: string, success: boolean): void;
  onError(error: Error, severity: "transient" | "terminal"): void;
  onKick?(): void;
  onConfirmAction?(name: string, args: Record<string, string>): Promise<"confirmed" | "denied">;
}

export interface RunAgentOptions {
  toolChoiceRequired?: boolean;
  disableStreaming?: boolean;
  skipConfirmation?: boolean;
  toolContext?: ToolContext;
  traceId?: string;
  drainSteeringFollowUps?: () => Array<{ text: string }>;
}

// Re-export kick utilities for backward compat
export { hasToolIntent } from "./kicks";

export const MAX_TOOL_ROUNDS = 10;

function upsertSystemPrompt(
  messages: OpenAI.ChatCompletionMessageParam[],
  systemText: string,
): void {
  const systemMessage: OpenAI.ChatCompletionSystemMessageParam = { role: "system", content: systemText };
  if (messages[0]?.role === "system") {
    messages[0] = systemMessage;
  } else {
    messages.unshift(systemMessage);
  }
}

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
  const last = messages[messages.length - 1];
  if (last?.role === "assistant") {
    const asst = last as OpenAI.ChatCompletionAssistantMessageParam;
    if (asst.tool_calls) {
      delete asst.tool_calls;
      // If the assistant message is now empty, remove it entirely
      if (!asst.content) messages.pop();
    }
  }
}

// Detect context overflow errors from Azure or MiniMax
function isContextOverflow(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  const msg = err.message || "";
  if (code === "context_length_exceeded") return true;
  if (msg.includes("context_length_exceeded")) return true;
  if (msg.includes("context window exceeds limit")) return true;
  return false;
}

// HTTP error with optional status code (OpenAI SDK errors)
interface HttpError extends Error { status?: number }

// Detect transient network errors worth retrying
export function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message || "";
  const code = (err as NodeJS.ErrnoException).code || "";
  // Node.js network error codes
  if (["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EPIPE",
       "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "ECONNABORTED"].includes(code)) return true;
  // OpenAI SDK / fetch errors
  if (msg.includes("fetch failed")) return true;
  if (msg.includes("network") && !msg.includes("context")) return true;
  if (msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT")) return true;
  if (msg.includes("socket hang up")) return true;
  if (msg.includes("getaddrinfo")) return true;
  // HTTP 429 / 500 / 502 / 503 / 504
  const status = (err as HttpError).status;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return true;
  return false;
}

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;

export async function runAgent(
  messages: OpenAI.ChatCompletionMessageParam[],
  callbacks: ChannelCallbacks,
  channel?: Channel,
  signal?: AbortSignal,
  options?: RunAgentOptions,
): Promise<{ usage?: UsageData }> {
  const providerRuntime = getProviderRuntime();
  const provider = providerRuntime.id;
  const { maxToolOutputChars } = getContextConfig();
  const traceId = options?.traceId;
  emitNervesEvent({
    event: "engine.turn_start",
    trace_id: traceId,
    component: "engine",
    message: "runAgent turn started",
    meta: { channel: channel ?? "unknown", provider },
  });

  // Per-turn friend refresh: re-read friend record from disk for fresh context
  const friendStore = options?.toolContext?.friendStore;
  const friendId = options?.toolContext?.context?.friend?.id;
  let currentContext = options?.toolContext?.context;

  if (friendStore && friendId) {
    const freshFriend = await friendStore.get(friendId);
    if (freshFriend) {
      currentContext = { ...currentContext!, friend: freshFriend };
    }
  }

  // Refresh system prompt at start of each turn when channel is provided.
  // If refresh fails, keep existing system prompt (or inject a minimal safe fallback)
  // so turn execution remains consistent and non-fatal.
  if (channel) {
    try {
      const refreshed = await buildSystem(channel, options, currentContext);
      upsertSystemPrompt(messages, refreshed);
    } catch (error) {
      const hadExistingSystemPrompt = messages[0]?.role === "system" && typeof messages[0].content === "string";
      const existingSystemText = hadExistingSystemPrompt ? (messages[0].content as string) : undefined;
      const fallback = existingSystemText ?? "You are a helpful assistant.";
      upsertSystemPrompt(messages, fallback);
      emitNervesEvent({
        level: "warn",
        event: "mind.step_error",
        trace_id: traceId,
        component: "mind",
        message: "buildSystem refresh failed; using fallback prompt",
        meta: {
          channel,
          reason: error instanceof Error ? error.message : String(error),
          used_existing_prompt: hadExistingSystemPrompt,
        },
      });
    }
  }

  let kickCount = 0;
  let done = false;
  let toolRounds = 0;
  let lastUsage: UsageData | undefined;
  let overflowRetried = false;
  let retryCount = 0;
  let lastKickReason: KickReason | null = null;

  // Prevent MaxListenersExceeded warning — each iteration adds a listener
  try { require("events").setMaxListeners(MAX_TOOL_ROUNDS + 5, signal); } catch { /* unsupported */ }

  const toolPreferences = currentContext?.friend?.toolPreferences;
  const baseTools = getToolsForChannel(
    channel ? getChannelCapabilities(channel) : undefined,
    toolPreferences && Object.keys(toolPreferences).length > 0 ? toolPreferences : undefined,
  );

  while (!done) {
    // Compute activeTools per-iteration: include final_answer when
    // toolChoiceRequired is set OR after a narration kick (false-positive escape hatch)
    const activeTools = (options?.toolChoiceRequired || lastKickReason === "narration")
      ? [...baseTools, finalAnswerTool]
      : baseTools;
    const steeringFollowUps = options?.drainSteeringFollowUps?.() ?? [];
    if (steeringFollowUps.length > 0) {
      for (const followUp of steeringFollowUps) {
        messages.push({ role: "user", content: followUp.text });
      }
      providerRuntime.resetTurnState(messages);
    }
    // Yield so pending I/O (stdin Ctrl-C) can be processed between iterations
    await new Promise((r) => setImmediate(r));
    if (signal?.aborted) break;
    try {
      callbacks.onModelStart();

      const result = await providerRuntime.streamTurn({
        messages,
        activeTools,
        callbacks,
        signal,
        traceId,
        toolChoiceRequired: options?.toolChoiceRequired,
      });

      // Track usage from the latest API call
      if (result.usage) lastUsage = result.usage;
      retryCount = 0; // reset on success

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
      // Store reasoning items from the API response on the assistant message
      // so they persist through session save/load and can be restored in toResponsesInput
      const reasoningItems = result.outputItems.filter((item): item is ResponseItem & { type: "reasoning" } => "type" in item && item.type === "reasoning");
      if (reasoningItems.length > 0) {
        (msg as AssistantMessageWithReasoning)._reasoning_items = reasoningItems;
      }
      if (!result.toolCalls.length) {
        const kick = detectKick(result.content, options);
        if (kick) {
          kickCount++;
          lastKickReason = kick.reason;
          toolRounds++;
          if (toolRounds >= MAX_TOOL_ROUNDS) {
            callbacks.onError(new Error(`tool loop limit reached (${MAX_TOOL_ROUNDS} rounds)`), "terminal");
            done = true;
            continue;
          }
          callbacks.onKick?.();
          // Preserve original content with self-correction appended
          const kickContent = result.content
            ? result.content + "\n\n" + kick.message
            : kick.message;
          messages.push({ role: "assistant", content: kickContent });
          providerRuntime.resetTurnState(messages);
          continue;
        }
        messages.push(msg);
        done = true;
      } else {
        // Check for final_answer sole call: intercept before tool execution
        const isSoleFinalAnswer = result.toolCalls.length === 1 && result.toolCalls[0].name === "final_answer";
        if (isSoleFinalAnswer) {
          let answer: string;
          try {
            const parsed = JSON.parse(result.toolCalls[0].arguments);
            answer = parsed.answer ?? result.content;
          } catch {
            answer = result.content;
          }
          // Push clean assistant message with extracted answer (no tool_calls)
          messages.push({ role: "assistant", content: answer } as OpenAI.ChatCompletionAssistantMessageParam);
          done = true;
          continue;
        }

        messages.push(msg);
        toolRounds++;
        if (toolRounds >= MAX_TOOL_ROUNDS) {
          // Strip tool_calls from the assistant message we just pushed so the
          // conversation stays valid (every tool_call needs a tool response).
          stripLastToolCalls(messages);
          callbacks.onError(new Error(`tool loop limit reached (${MAX_TOOL_ROUNDS} rounds)`), "terminal");
          done = true;
          break;
        }
        // SHARED: execute tools (final_answer in mixed calls is rejected inline)
        for (const tc of result.toolCalls) {
          if (signal?.aborted) break;
          // Intercept final_answer in mixed call: reject it
          if (tc.name === "final_answer") {
            const rejection = "rejected: final_answer must be the only tool call. Finish your work first, then call final_answer alone.";
            messages.push({ role: "tool", tool_call_id: tc.id, content: rejection });
            providerRuntime.appendToolOutput(tc.id, rejection);
            continue;
          }
          let args: Record<string, string> = {};
          try {
            args = JSON.parse(tc.arguments);
          } catch {
            /* ignore */
          }
          const argSummary = summarizeArgs(tc.name, args);
          // Confirmation check for mutate tools
          if (isConfirmationRequired(tc.name) && !options?.skipConfirmation) {
            let decision: "confirmed" | "denied" = "denied";
            if (callbacks.onConfirmAction) {
              decision = await callbacks.onConfirmAction(tc.name, args);
            }
            if (decision !== "confirmed") {
              const cancelled = "Action cancelled by user.";
              callbacks.onToolStart(tc.name, args);
              callbacks.onToolEnd(tc.name, argSummary, false);
              messages.push({ role: "tool", tool_call_id: tc.id, content: cancelled });
              providerRuntime.appendToolOutput(tc.id, cancelled);
              continue;
            }
          }
          callbacks.onToolStart(tc.name, args);
          let toolResult: string;
          let success: boolean;
          try {
            toolResult = await execTool(tc.name, args, options?.toolContext);
            success = true;
          } catch (e) {
            toolResult = `error: ${e}`;
            success = false;
          }
          if (toolResult.length > maxToolOutputChars) {
            toolResult = `output too large (${toolResult.length} chars, limit ${maxToolOutputChars}). retry with narrower scope — e.g. read fewer lines, filter output, or use a more specific command.`;
            success = false;
          }
          callbacks.onToolEnd(tc.name, argSummary, success);
          messages.push({ role: "tool", tool_call_id: tc.id, content: toolResult });
          providerRuntime.appendToolOutput(tc.id, toolResult);
        }
      }
    } catch (e) {
      // Abort is not an error — just stop cleanly
      if (signal?.aborted) {
        stripLastToolCalls(messages);
        break;
      }
      // Context overflow: trim aggressively and retry once
      if (isContextOverflow(e) && !overflowRetried) {
        overflowRetried = true;
        stripLastToolCalls(messages);
        const { maxTokens, contextMargin } = getContextConfig();
        const trimmed = trimMessages(messages, maxTokens, contextMargin, maxTokens * 2);
        messages.splice(0, messages.length, ...trimmed);
        providerRuntime.resetTurnState(messages);
        callbacks.onError(new Error("context trimmed, retrying..."), "transient");
        continue;
      }
      // Transient network errors: retry with exponential backoff
      if (isTransientError(e) && retryCount < MAX_RETRIES) {
        retryCount++;
        const delay = RETRY_BASE_MS * Math.pow(2, retryCount - 1);
        callbacks.onError(new Error(`network error, retrying in ${delay / 1000}s (${retryCount}/${MAX_RETRIES})...`), "transient");
        // Wait with abort support
        const aborted = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), delay);
          if (signal) {
            const onAbort = () => { clearTimeout(timer); resolve(true); };
            if (signal.aborted) { clearTimeout(timer); resolve(true); return; }
            signal.addEventListener("abort", onAbort, { once: true });
          }
        });
        if (aborted) { stripLastToolCalls(messages); break; }
        providerRuntime.resetTurnState(messages);
        continue;
      }
      callbacks.onError(e instanceof Error ? e : new Error(String(e)), "terminal");
      emitNervesEvent({
        level: "error",
        event: "engine.error",
        trace_id: traceId,
        component: "engine",
        message: e instanceof Error ? e.message : String(e),
        meta: {},
      });
      stripLastToolCalls(messages);
      done = true;
    }
  }
  emitNervesEvent({
    event: "engine.turn_end",
    trace_id: traceId,
    component: "engine",
    message: "runAgent turn completed",
    meta: { done },
  });
  return { usage: lastUsage };
}
