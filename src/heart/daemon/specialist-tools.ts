import type OpenAI from "openai"
import * as fs from "fs"
import { baseToolDefinitions, finalAnswerTool } from "../../repertoire/tools-base"
import { runHatchFlow, type HatchFlowInput, type HatchCredentialsInput } from "./hatch-flow"
import { playHatchAnimation } from "./hatch-animation"
import type { AgentProvider } from "../identity"
import { emitNervesEvent } from "../../nerves/runtime"

const hatchAgentTool: OpenAI.ChatCompletionFunctionTool = {
  type: "function",
  function: {
    name: "hatch_agent",
    description:
      "create a new agent bundle with the given name. call this when you have gathered enough information from the human to hatch their agent.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "the name for the new agent (PascalCase, e.g. 'Slugger')",
        },
      },
      required: ["name"],
    },
  },
}

const readFileTool = baseToolDefinitions.find((d) => d.tool.function.name === "read_file")!
const listDirTool = baseToolDefinitions.find((d) => d.tool.function.name === "list_directory")!

/**
 * Returns the specialist's tool schema array.
 */
export function getSpecialistTools(): OpenAI.ChatCompletionFunctionTool[] {
  return [hatchAgentTool, finalAnswerTool, readFileTool.tool, listDirTool.tool]
}

export interface ExecSpecialistToolDeps {
  humanName: string
  provider: AgentProvider
  credentials: HatchCredentialsInput
  bundlesRoot?: string
  secretsRoot?: string
  animationWriter?: (text: string) => void
}

/**
 * Execute a specialist tool call.
 * Returns the tool result string.
 */
export async function execSpecialistTool(
  name: string,
  args: Record<string, string>,
  deps: ExecSpecialistToolDeps,
): Promise<string> {
  emitNervesEvent({
    component: "daemon",
    event: "daemon.specialist_tool_exec",
    message: "executing specialist tool",
    meta: { tool: name },
  })

  if (name === "hatch_agent") {
    const agentName = args.name
    if (!agentName) {
      return "error: missing required 'name' parameter for hatch_agent"
    }

    const input: HatchFlowInput = {
      agentName,
      humanName: deps.humanName,
      provider: deps.provider,
      credentials: deps.credentials,
    }
    const result = await runHatchFlow(input, {
      bundlesRoot: deps.bundlesRoot,
      secretsRoot: deps.secretsRoot,
    })
    await playHatchAnimation(agentName, deps.animationWriter)

    return [
      `hatched ${agentName} successfully.`,
      `bundle path: ${result.bundleRoot}`,
      `identity seed: ${result.selectedIdentity}`,
      `specialist secrets: ${result.specialistSecretsPath}`,
      `hatchling secrets: ${result.hatchlingSecretsPath}`,
    ].join("\n")
  }

  if (name === "read_file") {
    try {
      return fs.readFileSync(args.path, "utf-8")
    } catch (e) {
      return `error: ${e instanceof Error ? e.message : /* v8 ignore next -- defensive: non-Error catch branch @preserve */ String(e)}`
    }
  }

  if (name === "list_directory") {
    try {
      return fs
        .readdirSync(args.path, { withFileTypes: true })
        .map((e) => `${e.isDirectory() ? "d" : "-"}  ${e.name}`)
        .join("\n")
    } catch (e) {
      return `error: ${e instanceof Error ? e.message : /* v8 ignore next -- defensive: non-Error catch branch @preserve */ String(e)}`
    }
  }

  return `error: unknown tool '${name}'`
}
