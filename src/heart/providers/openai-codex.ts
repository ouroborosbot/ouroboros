import OpenAI from "openai";
import { getOpenAICodexConfig } from "../../config";
import { loadAgentConfig } from "../../identity";
import type { ProviderRuntime, ProviderTurnRequest } from "../core";
import type { ResponseItem } from "../streaming";
import { streamResponsesApi, toResponsesInput, toResponsesTools } from "../streaming";

interface HttpError extends Error { status?: number }
const OPENAI_CODEX_AUTH_FAILURE_MARKERS = [
  "authentication failed",
  "unauthorized",
  "invalid api key",
  "invalid bearer token",
]

function getOpenAICodexSecretsPathForGuidance(): string {
  return loadAgentConfig().configPath;
}

function getOpenAICodexAgentNameForGuidance(): string {
  return loadAgentConfig().name;
}

function getOpenAICodexOAuthInstructions(): string {
  const agentName = getOpenAICodexAgentNameForGuidance();
  return [
    "Fix:",
    `  1. Run \`npm run auth:openai-codex -- --agent ${agentName}\``,
    "     (or run `codex login` and set the OAuth token manually)",
    `  2. Open ${getOpenAICodexSecretsPathForGuidance()}`,
    "  3. Confirm providers.openai-codex.oauthAccessToken is set",
  ].join("\n");
}

function getOpenAICodexReauthGuidance(reason: string): string {
  return [
    "OpenAI Codex configuration error.",
    reason,
    getOpenAICodexOAuthInstructions(),
  ].join("\n");
}

function isOpenAICodexAuthFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as HttpError).status;
  if (status === 401 || status === 403) return true;
  const lower = error.message.toLowerCase();
  return OPENAI_CODEX_AUTH_FAILURE_MARKERS.some((marker) => lower.includes(marker));
}

function withOpenAICodexAuthGuidance(error: unknown): Error {
  const base = error instanceof Error ? error.message : String(error);
  if (isOpenAICodexAuthFailure(error)) {
    return new Error(getOpenAICodexReauthGuidance(`OpenAI Codex authentication failed (${base}).`));
  }
  return error instanceof Error ? error : new Error(String(error));
}

export function createOpenAICodexProviderRuntime(): ProviderRuntime {
  const codexConfig = getOpenAICodexConfig();
  if (!(codexConfig.model && codexConfig.oauthAccessToken)) {
    throw new Error(
      getOpenAICodexReauthGuidance(
        "provider 'openai-codex' is selected in agent.json but providers.openai-codex.model/oauthAccessToken is incomplete in secrets.json.",
      ),
    );
  }
  const token = codexConfig.oauthAccessToken.trim();
  if (!token) {
    throw new Error(
      getOpenAICodexReauthGuidance(
        "OpenAI Codex OAuth access token is empty.",
      ),
    );
  }
  const client = new OpenAI({
    apiKey: token,
    timeout: 30000,
    maxRetries: 0,
  });
  let nativeInput: ResponseItem[] | null = null;
  let nativeInstructions = "";
  return {
    id: "openai-codex",
    model: codexConfig.model,
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
    async streamTurn(request: ProviderTurnRequest) {
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
      try {
        const result = await streamResponsesApi(this.client as OpenAI, params, request.callbacks, request.signal);
        for (const item of result.outputItems) nativeInput!.push(item);
        return result;
      } catch (error) {
        throw withOpenAICodexAuthGuidance(error);
      }
    },
  };
}
