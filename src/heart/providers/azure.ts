import OpenAI, { AzureOpenAI } from "openai";
import { DefaultAzureCredential } from "@azure/identity";
import { getAzureConfig } from "../config";
import { emitNervesEvent } from "../../nerves/runtime";
import type { ProviderCapability, ProviderRuntime, ProviderTurnRequest } from "../core";
import type { ResponseItem, TurnResult } from "../streaming";
import { streamResponsesApi, toResponsesInput, toResponsesTools } from "../streaming";
import { getModelCapabilities } from "../model-capabilities";

const COGNITIVE_SERVICES_SCOPE = "https://cognitiveservices.azure.com/.default";

export function createAzureTokenProvider(managedIdentityClientId?: string): () => Promise<string> {
  const credentialOptions = managedIdentityClientId
    ? { managedIdentityClientId }
    : undefined;
  const credential = new DefaultAzureCredential(credentialOptions);

  return async (): Promise<string> => {
    try {
      const tokenResponse = await credential.getToken(COGNITIVE_SERVICES_SCOPE);
      return tokenResponse.token;
    } catch {
      throw new Error(
        "Azure OpenAI authentication failed. Either set providers.azure.apiKey in secrets.json, or run 'az login' to authenticate with your Azure account.",
      );
    }
  };
}

export function createAzureProviderRuntime(): ProviderRuntime {
  emitNervesEvent({
    component: "engine",
    event: "engine.provider_init",
    message: "azure provider init",
    meta: { provider: "azure" },
  });
  const azureConfig = getAzureConfig();
  if (!(azureConfig.apiKey && azureConfig.endpoint && azureConfig.deployment && azureConfig.modelName)) {
    throw new Error(
      "provider 'azure' is selected in agent.json but providers.azure is incomplete in secrets.json.",
    );
  }
  const modelCaps = getModelCapabilities(azureConfig.modelName);
  const capabilities = new Set<ProviderCapability>();
  if (modelCaps.reasoningEffort) capabilities.add("reasoning-effort");

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
    capabilities,
    supportedReasoningEfforts: modelCaps.reasoningEffort,
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
        reasoning: { effort: request.reasoningEffort ?? "medium", summary: "detailed" },
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
}
