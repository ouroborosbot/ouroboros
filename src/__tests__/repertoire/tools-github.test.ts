import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../../repertoire/github-client", () => ({
  githubRequest: vi.fn(),
}))

import { githubRequest } from "../../repertoire/github-client"
import { githubToolDefinitions, summarizeGithubArgs } from "../../repertoire/tools-github"

describe("githubToolDefinitions", () => {
  it("contains github_create_issue tool", () => {
    const names = githubToolDefinitions.map((d) => d.tool.function.name)
    expect(names).toContain("github_create_issue")
  })

  it("github_create_issue has correct parameter schema", () => {
    const def = githubToolDefinitions.find((d) => d.tool.function.name === "github_create_issue")!
    const params = def.tool.function.parameters as {
      type: string
      properties: Record<string, { type: string }>
      required: string[]
    }
    expect(params.properties).toHaveProperty("owner")
    expect(params.properties).toHaveProperty("repo")
    expect(params.properties).toHaveProperty("title")
    expect(params.properties).toHaveProperty("body")
    expect(params.properties).toHaveProperty("labels")
    expect(params.required).toContain("owner")
    expect(params.required).toContain("repo")
    expect(params.required).toContain("title")
  })

  it("github_create_issue has integration 'github'", () => {
    const def = githubToolDefinitions.find((d) => d.tool.function.name === "github_create_issue")!
    expect(def.integration).toBe("github")
  })

  it("github_create_issue has confirmationRequired true", () => {
    const def = githubToolDefinitions.find((d) => d.tool.function.name === "github_create_issue")!
    expect(def.confirmationRequired).toBe(true)
  })
})

describe("github_create_issue handler", () => {
  const handler = githubToolDefinitions.find(
    (d) => d.tool.function.name === "github_create_issue",
  )!.handler

  beforeEach(() => {
    vi.mocked(githubRequest).mockReset()
  })

  it("returns AUTH_REQUIRED:github when githubToken is missing", async () => {
    const result = await handler({ owner: "o", repo: "r", title: "test" }, { signin: async () => undefined } as any)
    expect(result).toContain("AUTH_REQUIRED:github")
  })

  it("returns AUTH_REQUIRED:github when ctx is undefined", async () => {
    const result = await handler({ owner: "o", repo: "r", title: "test" })
    expect(result).toContain("AUTH_REQUIRED:github")
  })

  it("calls githubRequest with correct method, path, and body on success", async () => {
    vi.mocked(githubRequest).mockResolvedValue('{"id": 1, "html_url": "https://github.com/o/r/issues/1"}')

    await handler(
      { owner: "myorg", repo: "myrepo", title: "Bug fix" },
      { githubToken: "tok123", signin: async () => undefined } as any,
    )

    expect(githubRequest).toHaveBeenCalledWith(
      "tok123",
      "POST",
      "/repos/myorg/myrepo/issues",
      JSON.stringify({ title: "Bug fix" }),
    )
  })

  it("includes body in request when provided", async () => {
    vi.mocked(githubRequest).mockResolvedValue('{"id": 2}')

    await handler(
      { owner: "o", repo: "r", title: "Issue", body: "Description here" },
      { githubToken: "tok", signin: async () => undefined } as any,
    )

    expect(githubRequest).toHaveBeenCalledWith(
      "tok",
      "POST",
      "/repos/o/r/issues",
      JSON.stringify({ title: "Issue", body: "Description here" }),
    )
  })

  it("splits comma-separated labels into array", async () => {
    vi.mocked(githubRequest).mockResolvedValue('{"id": 3}')

    await handler(
      { owner: "o", repo: "r", title: "Issue", labels: "bug, enhancement, urgent" },
      { githubToken: "tok", signin: async () => undefined } as any,
    )

    expect(githubRequest).toHaveBeenCalledWith(
      "tok",
      "POST",
      "/repos/o/r/issues",
      JSON.stringify({ title: "Issue", labels: ["bug", "enhancement", "urgent"] }),
    )
  })

  it("omits labels key when labels is empty string", async () => {
    vi.mocked(githubRequest).mockResolvedValue('{"id": 4}')

    await handler(
      { owner: "o", repo: "r", title: "Issue", labels: "" },
      { githubToken: "tok", signin: async () => undefined } as any,
    )

    expect(githubRequest).toHaveBeenCalledWith(
      "tok",
      "POST",
      "/repos/o/r/issues",
      JSON.stringify({ title: "Issue" }),
    )
  })

  it("omits labels key when labels is not provided", async () => {
    vi.mocked(githubRequest).mockResolvedValue('{"id": 5}')

    await handler(
      { owner: "o", repo: "r", title: "Issue" },
      { githubToken: "tok", signin: async () => undefined } as any,
    )

    expect(githubRequest).toHaveBeenCalledWith(
      "tok",
      "POST",
      "/repos/o/r/issues",
      JSON.stringify({ title: "Issue" }),
    )
  })

  it("includes both body and labels when both provided", async () => {
    vi.mocked(githubRequest).mockResolvedValue('{"id": 6}')

    await handler(
      { owner: "o", repo: "r", title: "Issue", body: "Details", labels: "bug" },
      { githubToken: "tok", signin: async () => undefined } as any,
    )

    expect(githubRequest).toHaveBeenCalledWith(
      "tok",
      "POST",
      "/repos/o/r/issues",
      JSON.stringify({ title: "Issue", body: "Details", labels: ["bug"] }),
    )
  })
})

describe("summarizeGithubArgs", () => {
  it("returns truncated title for github_create_issue", () => {
    const result = summarizeGithubArgs("github_create_issue", { title: "Fix the login bug" })
    expect(result).toBe("Fix the login bug")
  })

  it("returns empty string when title is missing", () => {
    const result = summarizeGithubArgs("github_create_issue", {})
    expect(result).toBe("")
  })

  it("returns undefined for unknown tool", () => {
    const result = summarizeGithubArgs("unknown_tool", { title: "test" })
    expect(result).toBeUndefined()
  })
})
