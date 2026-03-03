import OpenAI, { AzureOpenAI } from "openai";
import { getAzureConfig, getMinimaxConfig, getContextConfig } from "../config";
import { execTool, summarizeArgs, finalAnswerTool, getToolsForChannel, isConfirmationRequired } from "../repertoire/tools";
import type { ToolContext } from "../repertoire/tools";
import { getChannelCapabilities } from "../mind/context/channel";
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
        "no provider configured. set azure or minimax credentials in config.json.",
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
}

// Re-export kick utilities for backward compat
export { hasToolIntent } from "./kicks";

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
  const client = getClient();
  const provider = getProvider();
  const model = getModel();
  const { maxToolOutputChars } = getContextConfig();
  const traceId = options?.traceId;
  emitNervesEvent({
    event: "engine.turn_start",
    trace_id: traceId,
    component: "engine",
    message: "runAgent turn started",
    meta: { channel: channel ?? "unknown", provider },
  });

  // Refresh system prompt at start of each turn when channel is provided
  if (channel) {
    messages[0] = { role: "system", content: await buildSystem(channel, options) };
  }

  let kickCount = 0;
  let done = false;
  let toolRounds = 0;
  let lastUsage: UsageData | undefined;
  let overflowRetried = false;
  let retryCount = 0;
  let lastKickReason: KickReason | null = null;

  // For Azure Responses API: maintain native input array with original output
  // items (reasoning, function_calls) in correct order.  Initialized from CC
  // messages on first iteration (session resumption), then kept in sync with
  // the API's own output items for accurate multi-turn tool loops.
  let azureInput: ResponseItem[] | null = null;
  let azureInstructions = "";

  // Prevent MaxListenersExceeded warning — each iteration adds a listener
  try { require("events").setMaxListeners(MAX_TOOL_ROUNDS + 5, signal); } catch { /* unsupported */ }

  const baseTools = getToolsForChannel(channel ? getChannelCapabilities(channel) : undefined);

  while (!done) {
    // Compute activeTools per-iteration: include final_answer when
    // toolChoiceRequired is set OR after a narration kick (false-positive escape hatch)
    const activeTools = (options?.toolChoiceRequired || lastKickReason === "narration")
      ? [...baseTools, finalAnswerTool]
      : baseTools;
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
        const azureParams: Record<string, unknown> = {
          model,
          input: azureInput,
          instructions: azureInstructions,
          tools: toResponsesTools(activeTools),
          reasoning: { effort: "medium", summary: "detailed" },
          stream: true,
          store: false,
          include: ["reasoning.encrypted_content"],
        };
        if (traceId) azureParams.metadata = { trace_id: traceId };
        if (options?.toolChoiceRequired) azureParams.tool_choice = "required";
        result = await streamResponsesApi(
          client,
          azureParams,
          callbacks,
          signal,
        );
        // Append ALL output items (reasoning + function_calls + text) in order
        for (const item of result.outputItems) {
          azureInput.push(item);
        }
      } else {
        const createParams: Record<string, unknown> = { messages, tools: activeTools, stream: true };
        if (model) createParams.model = model;
        if (traceId) createParams.metadata = { trace_id: traceId };
        if (options?.toolChoiceRequired) createParams.tool_choice = "required";
        result = await streamChatCompletion(client, createParams, callbacks, signal);
      }

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
          // Discard azureInput so it's rebuilt from messages on retry
          azureInput = null;
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
            if (azureInput) {
              azureInput.push({ type: "function_call_output", call_id: tc.id, output: rejection });
            }
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
              if (azureInput) {
                azureInput.push({ type: "function_call_output", call_id: tc.id, output: cancelled });
              }
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
      // Context overflow: trim aggressively and retry once
      if (isContextOverflow(e) && !overflowRetried) {
        overflowRetried = true;
        stripLastToolCalls(messages);
        const { maxTokens, contextMargin } = getContextConfig();
        const trimmed = trimMessages(messages, maxTokens, contextMargin, maxTokens * 2);
        messages.splice(0, messages.length, ...trimmed);
        azureInput = null; // force rebuild from trimmed messages
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
        azureInput = null; // force rebuild on retry
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
