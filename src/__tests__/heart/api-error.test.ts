import { describe, it, expect } from "vitest"
import { handleApiError } from "../../heart/api-error"

describe("handleApiError", () => {
  it("returns AUTH_REQUIRED for 401 status", () => {
    const response = { status: 401, statusText: "Unauthorized" }
    expect(handleApiError(response, "Graph", "graph")).toBe("AUTH_REQUIRED:graph")
  })

  it("returns PERMISSION_DENIED for 403 status", () => {
    const response = { status: 403, statusText: "Forbidden" }
    expect(handleApiError(response, "Graph", "graph")).toBe(
      "PERMISSION_DENIED: You don't have access to this Graph resource. Your admin may need to grant additional permissions.",
    )
  })

  it("returns THROTTLED for 429 status", () => {
    const response = { status: 429, statusText: "Too Many Requests" }
    expect(handleApiError(response, "Graph", "graph")).toBe(
      "THROTTLED: Graph is rate-limiting requests. Try again in a moment.",
    )
  })

  it("returns SERVICE_ERROR for 500 status", () => {
    const response = { status: 500, statusText: "Internal Server Error" }
    expect(handleApiError(response, "Graph", "graph")).toBe(
      "SERVICE_ERROR: Graph is temporarily unavailable (500).",
    )
  })

  it("returns SERVICE_ERROR for 502 status", () => {
    const response = { status: 502, statusText: "Bad Gateway" }
    expect(handleApiError(response, "ADO", "ado")).toBe(
      "SERVICE_ERROR: ADO is temporarily unavailable (502).",
    )
  })

  it("returns SERVICE_ERROR for 503 status", () => {
    const response = { status: 503, statusText: "Service Unavailable" }
    expect(handleApiError(response, "Graph", "graph")).toBe(
      "SERVICE_ERROR: Graph is temporarily unavailable (503).",
    )
  })

  it("returns generic error for other status codes", () => {
    const response = { status: 400, statusText: "Bad Request" }
    expect(handleApiError(response, "Graph", "graph")).toBe(
      "ERROR: Graph returned 400 Bad Request.",
    )
  })

  it("handles network errors (no status)", () => {
    const error = new Error("fetch failed")
    expect(handleApiError(error, "Graph", "graph")).toBe(
      "NETWORK_ERROR: Could not reach Graph.",
    )
  })

  it("handles non-Error network errors", () => {
    expect(handleApiError("something went wrong", "ADO", "ado")).toBe(
      "NETWORK_ERROR: Could not reach ADO.",
    )
  })
})
