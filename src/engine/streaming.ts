import type OpenAI from "openai";
import type { ChannelCallbacks } from "./core";

export interface TurnResult {
  content: string;
  toolCalls: { id: string; name: string; arguments: string }[];
  outputItems: any[];
}

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
      // Restore reasoning items before content (matching API item order)
      if (a._reasoning_items) {
        for (const ri of a._reasoning_items) {
          input.push(ri);
        }
      }
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
