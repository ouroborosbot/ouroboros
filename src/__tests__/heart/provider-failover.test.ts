import { describe, it, expect, vi } from "vitest"

vi.mock("../../nerves/runtime", () => ({
  emitNervesEvent: vi.fn(),
}))

import { buildFailoverContext, handleFailoverReply } from "../../heart/provider-failover"

describe("buildFailoverContext", () => {
  it("builds message with working providers", () => {
    const ctx = buildFailoverContext(
      "exceeded your usage limit",
      "usage-limit",
      "openai-codex",
      "slugger",
      {
        anthropic: { ok: true },
        minimax: { ok: false, classification: "auth-failure", message: "no credentials configured" },
        azure: { ok: false, classification: "auth-failure", message: "no credentials configured" },
      },
    )

    expect(ctx.errorSummary).toBe("openai-codex hit its usage limit (exceeded your usage limit)")
    expect(ctx.workingProviders).toEqual(["anthropic"])
    expect(ctx.unconfiguredProviders).toContain("minimax")
    expect(ctx.unconfiguredProviders).toContain("azure")
    expect(ctx.userMessage).toContain("switch to anthropic")
    expect(ctx.userMessage).toContain("ouro auth --agent slugger")
  })

  it("handles multiple working providers", () => {
    const ctx = buildFailoverContext(
      "auth failed",
      "auth-failure",
      "openai-codex",
      "slugger",
      {
        anthropic: { ok: true },
        azure: { ok: true },
        minimax: { ok: false, classification: "auth-failure", message: "no credentials configured" },
      },
    )

    expect(ctx.workingProviders).toEqual(["anthropic", "azure"])
    expect(ctx.userMessage).toContain("switch to anthropic")
    expect(ctx.userMessage).toContain("switch to azure")
  })

  it("handles no working providers", () => {
    const ctx = buildFailoverContext(
      "server error",
      "server-error",
      "anthropic",
      "slugger",
      {
        "openai-codex": { ok: false, classification: "server-error", message: "502" },
        minimax: { ok: false, classification: "auth-failure", message: "no credentials configured" },
        azure: { ok: false, classification: "auth-failure", message: "no credentials configured" },
      },
    )

    expect(ctx.workingProviders).toHaveLength(0)
    expect(ctx.userMessage).toContain("ouro auth --agent slugger")
  })

  it("handles no providers at all (empty inventory)", () => {
    const ctx = buildFailoverContext(
      "network error",
      "network-error",
      "anthropic",
      "slugger",
      {},
    )

    expect(ctx.workingProviders).toHaveLength(0)
    expect(ctx.unconfiguredProviders).toHaveLength(0)
    expect(ctx.userMessage).toContain("no other providers are available")
  })

  it("omits providers that are configured but also failing", () => {
    const ctx = buildFailoverContext(
      "rate limited",
      "rate-limit",
      "openai-codex",
      "slugger",
      {
        anthropic: { ok: true },
        azure: { ok: false, classification: "rate-limit", message: "429" },
        minimax: { ok: false, classification: "server-error", message: "500" },
      },
    )

    // azure and minimax are configured but failing — not in workingProviders or unconfiguredProviders
    expect(ctx.workingProviders).toEqual(["anthropic"])
    expect(ctx.unconfiguredProviders).toHaveLength(0)
  })

  it("reflects classification in error summary", () => {
    expect(buildFailoverContext("", "auth-failure", "anthropic", "a", {}).errorSummary)
      .toBe("anthropic authentication failed")
    expect(buildFailoverContext("", "usage-limit", "openai-codex", "a", {}).errorSummary)
      .toBe("openai-codex hit its usage limit")
    expect(buildFailoverContext("", "server-error", "azure", "a", {}).errorSummary)
      .toBe("azure is experiencing an outage")
    expect(buildFailoverContext("", "network-error", "minimax", "a", {}).errorSummary)
      .toBe("minimax is unreachable (network error)")
    expect(buildFailoverContext("", "unknown", "anthropic", "a", {}).errorSummary)
      .toBe("anthropic encountered an error")
  })
})

describe("handleFailoverReply", () => {
  const ctx = buildFailoverContext(
    "usage limit",
    "usage-limit",
    "openai-codex",
    "slugger",
    {
      anthropic: { ok: true },
      azure: { ok: true },
    },
  )

  it("matches 'switch to anthropic'", () => {
    expect(handleFailoverReply("switch to anthropic", ctx)).toEqual({ action: "switch", provider: "anthropic" })
  })

  it("matches 'switch to azure'", () => {
    expect(handleFailoverReply("switch to azure", ctx)).toEqual({ action: "switch", provider: "azure" })
  })

  it("matches bare provider name", () => {
    expect(handleFailoverReply("anthropic", ctx)).toEqual({ action: "switch", provider: "anthropic" })
  })

  it("is case-insensitive", () => {
    expect(handleFailoverReply("Switch to Anthropic", ctx)).toEqual({ action: "switch", provider: "anthropic" })
  })

  it("trims whitespace", () => {
    expect(handleFailoverReply("  switch to anthropic  ", ctx)).toEqual({ action: "switch", provider: "anthropic" })
  })

  it("dismisses unrelated messages", () => {
    expect(handleFailoverReply("hey can you review this PR?", ctx)).toEqual({ action: "dismiss" })
  })

  it("dismisses empty reply", () => {
    expect(handleFailoverReply("", ctx)).toEqual({ action: "dismiss" })
  })

  it("does not allow switching to non-working providers", () => {
    const limited = buildFailoverContext("err", "auth-failure", "openai-codex", "s", {
      anthropic: { ok: true },
      minimax: { ok: false, classification: "server-error", message: "down" },
    })
    expect(handleFailoverReply("switch to minimax", limited)).toEqual({ action: "dismiss" })
  })
})
