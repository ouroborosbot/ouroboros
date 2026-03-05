// GitHub API client.
// Provides a generic githubRequest() for arbitrary GitHub REST API endpoints.

import { handleApiError } from "../heart/api-error"
import { emitNervesEvent } from "../nerves/runtime"

const GITHUB_BASE = "https://api.github.com"

// Generic GitHub API request. Returns response body as pretty-printed JSON string.
export async function githubRequest(
  token: string,
  method: string,
  path: string,
  body?: string,
): Promise<string> {
  try {
    emitNervesEvent({
      event: "client.request_start",
      component: "clients",
      message: "starting GitHub request",
      meta: { client: "github", method, path },
    })

    const url = `${GITHUB_BASE}${path}`
    const opts: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
    }
    if (body) opts.body = body

    const res = await fetch(url, opts)

    if (!res.ok) {
      emitNervesEvent({
        level: "error",
        event: "client.error",
        component: "clients",
        message: "GitHub request failed",
        meta: { client: "github", method, path, status: res.status },
      })
      return handleApiError(res, "GitHub", "github")
    }

    const data = await res.json()
    emitNervesEvent({
      event: "client.request_end",
      component: "clients",
      message: "GitHub request completed",
      meta: { client: "github", method, path, success: true },
    })
    return JSON.stringify(data, null, 2)
  } catch (err) {
    emitNervesEvent({
      level: "error",
      event: "client.error",
      component: "clients",
      message: "GitHub request threw exception",
      meta: {
        client: "github",
        method,
        path,
        reason: err instanceof Error ? err.message : String(err),
      },
    })
    return handleApiError(err, "GitHub", "github")
  }
}
