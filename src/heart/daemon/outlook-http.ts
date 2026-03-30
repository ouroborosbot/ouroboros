import * as http from "http"
import type { AddressInfo } from "net"
import { emitNervesEvent } from "../../nerves/runtime"
import { readOutlookAgentState, readOutlookMachineState } from "./outlook-read"
import type { OutlookAgentState, OutlookAgentView, OutlookMachineState, OutlookMachineView } from "./outlook-types"

export interface StartOutlookHttpServerOptions {
  host?: string
  port?: number
  readMachineState?: () => OutlookMachineState
  readMachineView?: (input: { origin: string; machine: OutlookMachineState }) => OutlookMachineView
  readAgentState?: (agentName: string) => OutlookAgentState | null
  readAgentView?: (agentName: string) => OutlookAgentView | null
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
  const productName = escapeHtml(input.machine.productName)
  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    `  <title>${productName}</title>`,
    "</head>",
    "<body>",
    `  <main><h1>${productName}</h1><p>${input.origin}/outlook/api/machine</p><pre>${escapeHtml(JSON.stringify(input.machine, null, 2))}</pre></main>`,
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

function normalizePath(urlValue = "/"): string {
  const parsed = new URL(urlValue, "http://127.0.0.1")
  const normalizedPath = parsed.pathname.replace(/\/+$/, "")
  if (normalizedPath.length === 0) return "/"
  return normalizedPath
}

export async function startOutlookHttpServer(options: StartOutlookHttpServerOptions = {}): Promise<OutlookHttpServerHandle> {
  const host = options.host ?? "127.0.0.1"
  const port = options.port ?? 0
  const readMachineState = options.readMachineState ?? (() => readOutlookMachineState())
  const readMachineView = options.readMachineView
  const readAgentState = options.readAgentState ?? ((agentName: string) => readOutlookAgentState(agentName))
  const readAgentView = options.readAgentView
  const renderApp = options.renderApp ?? defaultRenderApp

  const server = http.createServer((request, response) => {
    const pathname = normalizePath(request.url)
    const machine = readMachineState()
    const origin = `http://${host}:${(server.address() as AddressInfo).port}`
    const machineView = readMachineView?.({ origin, machine })

    if (pathname === "/outlook") {
      writeHtml(response, renderApp({ origin, machine }))
      return
    }

    if (pathname === "/outlook/api/machine") {
      writeJson(response, 200, machineView ?? machine)
      return
    }

    const agentMatch = /^\/outlook\/api\/agents\/([^/]+)$/.exec(pathname)
    if (agentMatch) {
      const agent = decodeURIComponent(agentMatch[1]!)
      const view = readAgentView?.(agent)
      if (view) {
        writeJson(response, 200, view)
        return
      }
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
