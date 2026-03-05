// Shared error handling for Graph and ADO API responses.
// Maps HTTP status codes to LLM-readable error messages.

import { emitNervesEvent } from "../nerves/runtime"

interface ApiResponse {
  status: number
  statusText: string
}

export function handleApiError(
  responseOrError: ApiResponse | unknown,
  service: string,
  connectionName: string,
): string {
  // Network error (no HTTP response)
  if (!responseOrError || typeof responseOrError !== "object" || !("status" in responseOrError)) {
    emitNervesEvent({
      level: "error",
      component: "clients",
      event: "client.error",
      message: "network error",
      meta: { service },
    })
    return `NETWORK_ERROR: Could not reach ${service}.`
  }

  const response = responseOrError as ApiResponse
  const { status, statusText } = response

  if (status === 401) {
    return `AUTH_REQUIRED:${connectionName}`
  }
  if (status === 403) {
    return `PERMISSION_DENIED: You don't have access to this ${service} resource. Your admin may need to grant additional permissions.`
  }
  if (status === 429) {
    return `THROTTLED: ${service} is rate-limiting requests. Try again in a moment.`
  }
  if (status >= 500) {
    return `SERVICE_ERROR: ${service} is temporarily unavailable (${status}).`
  }

  return `ERROR: ${service} returned ${status} ${statusText}.`
}
