import * as http from "http"
import type { AddressInfo } from "net"
import { emitNervesEvent } from "../../nerves/runtime"
import { readOutlookAgentState, readOutlookMachineState } from "./outlook-read"
import type { OutlookAgentState, OutlookMachineState } from "./outlook-types"

export interface StartOutlookHttpServerOptions {
  host?: string
  port?: number
  readMachineState?: () => OutlookMachineState
  readAgentState?: (agentName: string) => OutlookAgentState | null
  renderApp?: (input: { origin: string; machine: OutlookMachineState }) => string
}

export interface OutlookHttpServerHandle {
  origin: string
  stop(): Promise<void>
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
}

function defaultRenderApp(input: { origin: string; machine: OutlookMachineState }): string {
  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    `  <title>${input.machine.productName}</title>`,
    "</head>",
    "<body>",
    `  <main><h1>${input.machine.productName}</h1><p>${input.origin}/outlook/api/machine</p><pre>${escapeHtml(JSON.stringify(input.machine, null, 2))}</pre></main>`,
    "</body>",
    "</html>",
  ].join("\n")
}

function writeJson(response: http.ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" })
  response.end(`${JSON.stringify(payload, null, 2)}\n`)
}

function writeHtml(response: http.ServerResponse, html: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
  response.end(html)
}

function normalizePath(urlValue: string | undefined): string {
  const parsed = new URL(urlValue ?? "/", "http://127.0.0.1")
  return parsed.pathname.replace(/\/+$/, "") || "/"
}

export async function startOutlookHttpServer(options: StartOutlookHttpServerOptions = {}): Promise<OutlookHttpServerHandle> {
  const host = options.host ?? "127.0.0.1"
  const port = options.port ?? 0
  const readMachineState = options.readMachineState ?? (() => readOutlookMachineState())
  const readAgentState = options.readAgentState ?? ((agentName: string) => readOutlookAgentState(agentName))
  const renderApp = options.renderApp ?? defaultRenderApp

  const server = http.createServer((request, response) => {
    const pathname = normalizePath(request.url)
    const machine = readMachineState()
    const origin = `http://${host}:${(server.address() as AddressInfo).port}`

    if (pathname === "/outlook") {
      writeHtml(response, renderApp({ origin, machine }))
      return
    }

    if (pathname === "/outlook/api/machine") {
      writeJson(response, 200, machine)
      return
    }

    const agentMatch = /^\/outlook\/api\/agents\/([^/]+)$/.exec(pathname)
    if (agentMatch) {
      const agent = decodeURIComponent(agentMatch[1]!)
      const state = readAgentState(agent)
      if (!state) {
        writeJson(response, 404, { ok: false, error: `unknown agent: ${agent}` })
        return
      }
      writeJson(response, 200, state)
      return
    }

    writeJson(response, 404, { ok: false, error: `unknown outlook path: ${pathname}` })
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, host, () => resolve())
  })

  const address = server.address() as AddressInfo
  const origin = `http://${host}:${address.port}`

  emitNervesEvent({
    component: "daemon",
    event: "daemon.outlook_http_started",
    message: "started Outlook HTTP server",
    meta: { origin },
  })

  return {
    origin,
    async stop(): Promise<void> {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      emitNervesEvent({
        component: "daemon",
        event: "daemon.outlook_http_stopped",
        message: "stopped Outlook HTTP server",
        meta: { origin },
      })
    },
  }
}
