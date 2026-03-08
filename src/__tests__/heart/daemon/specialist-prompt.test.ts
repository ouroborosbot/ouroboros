import { describe, it, expect } from "vitest"

describe("buildSpecialistSystemPrompt", () => {
  it("includes SOUL.md text", async () => {
    const { buildSpecialistSystemPrompt } = await import("../../../heart/daemon/specialist-prompt")
    const prompt = buildSpecialistSystemPrompt("I am the soul.", "I am the identity.", ["Agent1"])
    expect(prompt).toContain("I am the soul.")
  })

  it("includes identity text", async () => {
    const { buildSpecialistSystemPrompt } = await import("../../../heart/daemon/specialist-prompt")
    const prompt = buildSpecialistSystemPrompt("soul text", "I am Medusa, a serpentine specialist.", ["Agent1"])
    expect(prompt).toContain("I am Medusa, a serpentine specialist.")
  })

  it("includes existing bundle names when provided", async () => {
    const { buildSpecialistSystemPrompt } = await import("../../../heart/daemon/specialist-prompt")
    const prompt = buildSpecialistSystemPrompt("soul", "identity", ["Slugger", "Ouroboros"])
    expect(prompt).toContain("Slugger")
    expect(prompt).toContain("Ouroboros")
  })

  it("handles no bundles gracefully", async () => {
    const { buildSpecialistSystemPrompt } = await import("../../../heart/daemon/specialist-prompt")
    const prompt = buildSpecialistSystemPrompt("soul", "identity", [])
    expect(prompt).toBeDefined()
    expect(prompt.length).toBeGreaterThan(0)
  })

  it("handles empty SOUL and identity gracefully", async () => {
    const { buildSpecialistSystemPrompt } = await import("../../../heart/daemon/specialist-prompt")
    const prompt = buildSpecialistSystemPrompt("", "", [])
    expect(prompt).toBeDefined()
    expect(prompt.length).toBeGreaterThan(0)
  })

  it("includes tool usage guidance for hatch_agent, final_answer, read_file, list_directory", async () => {
    const { buildSpecialistSystemPrompt } = await import("../../../heart/daemon/specialist-prompt")
    const prompt = buildSpecialistSystemPrompt("soul", "identity", [])
    expect(prompt).toContain("hatch_agent")
    expect(prompt).toContain("final_answer")
    expect(prompt).toContain("read_file")
    expect(prompt).toContain("list_directory")
  })
})
