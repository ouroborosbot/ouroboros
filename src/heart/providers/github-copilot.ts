import { getGithubCopilotConfig } from "../config";
import { emitNervesEvent } from "../../nerves/runtime";
import type { ProviderRuntime } from "../core";

export function createGithubCopilotProviderRuntime(): ProviderRuntime {
  emitNervesEvent({
    component: "engine",
    event: "engine.provider_init",
    message: "github-copilot provider init",
    meta: { provider: "github-copilot" },
  });
  const config = getGithubCopilotConfig();
  if (!config.githubToken) {
    throw new Error(
      "provider 'github-copilot' is selected in agent.json but providers.github-copilot.githubToken is missing in secrets.json.",
    );
  }
  if (!config.baseUrl) {
    throw new Error(
      "provider 'github-copilot' is selected in agent.json but providers.github-copilot.baseUrl is missing in secrets.json.",
    );
  }
  // Stub — full implementation in Unit 2b
  throw new Error("github-copilot provider not yet implemented");
}
