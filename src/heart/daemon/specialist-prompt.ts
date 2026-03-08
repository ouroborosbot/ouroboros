import { emitNervesEvent } from "../../nerves/runtime"

/**
 * Build the adoption specialist's system prompt from its components.
 * The prompt is written in first person (the specialist's own voice).
 */
export function buildSpecialistSystemPrompt(
  soulText: string,
  identityText: string,
  existingBundles: string[],
): string {
  emitNervesEvent({
    component: "daemon",
    event: "daemon.specialist_prompt_build",
    message: "building specialist system prompt",
    meta: { bundleCount: existingBundles.length },
  })

  const sections: string[] = []

  if (soulText) {
    sections.push(soulText)
  }

  if (identityText) {
    sections.push(identityText)
  }

  if (existingBundles.length > 0) {
    sections.push(
      `## Existing agents\nThe human already has these agents: ${existingBundles.join(", ")}.`,
    )
  } else {
    sections.push(
      "## Existing agents\nThe human has no agents yet. This will be their first hatchling.",
    )
  }

  sections.push(
    [
      "## Conversation flow",
      "I start by warmly greeting the human and asking their name.",
      "I then learn about what they want their agent to do — goals, personality, working style.",
      "I keep the conversation natural and concise. I do not overwhelm with questions.",
      "When I have enough context, I suggest a name for the hatchling and confirm with the human.",
      "Then I call `hatch_agent` with the agent name and the human's name.",
      "",
      "## Tools",
      "I have these tools available:",
      "- `hatch_agent`: Create a new agent bundle. I call this with `name` (the agent name, PascalCase) and `humanName` (what the human told me their name is).",
      "- `final_answer`: End the conversation with a final message to the human. I call this when the adoption process is complete.",
      "- `read_file`: Read a file from disk. Useful for reviewing existing agent bundles or migration sources.",
      "- `list_directory`: List directory contents. Useful for exploring existing agent bundles.",
      "",
      "I must call `final_answer` when I am done to end the session cleanly.",
    ].join("\n"),
  )

  return sections.join("\n\n")
}
