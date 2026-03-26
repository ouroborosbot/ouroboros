import * as fs from "fs"
import type { Readable, Writable } from "stream"
import { sendDaemonCommand } from "./socket-client"
import type { DaemonCommand, DaemonResponse } from "./daemon"
import { emitNervesEvent } from "../../nerves/runtime"

/**
 * MCP tool schema definition.
 * Matches the MCP protocol's tool listing format.
 */
export interface McpToolSchema {
  name: string
  description: string
  inputSchema: {
    type: "object"
    properties: Record<string, { type: string; description: string }>
    required?: string[]
  }
}

/**
 * Maps MCP tool names to daemon command kinds.
 */
const TOOL_TO_COMMAND: Record<string, string> = {
  ask: "agent.ask",
  status: "agent.status",
  catchup: "agent.catchup",
  delegate: "agent.delegate",
  get_context: "agent.getContext",
  search_memory: "agent.searchMemory",
  get_task: "agent.getTask",
  check_scope: "agent.checkScope",
  request_decision: "agent.requestDecision",
  check_guidance: "agent.checkGuidance",
  report_progress: "agent.reportProgress",
  report_blocker: "agent.reportBlocker",
  report_complete: "agent.reportComplete",
}

export interface McpServerOptions {
  agent: string
  friendId: string
  socketPath: string
  stdin: Readable
  stdout: Writable
}

interface JsonRpcRequest {
  jsonrpc: "2.0"
  id?: number | string
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: "2.0"
  id: number | string | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface McpServer {
  agent: string
  friendId: string
  start(): void
  stop(): void
}

/**
 * Create an MCP server that speaks JSON-RPC 2.0 over stdio.
 * Handles initialize, initialized, tools/list, and tools/call.
 * Forwards tool calls to the daemon via Unix socket.
 */
export function createMcpServer(options: McpServerOptions): McpServer {
  const { agent, friendId, socketPath, stdin, stdout } = options
  let buffer = ""
  let running = false

  function writeResponse(response: JsonRpcResponse): void {
    const body = JSON.stringify(response)
    const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`
    stdout.write(header + body)
  }

  function handleData(chunk: Buffer): void {
    buffer += chunk.toString("utf-8")
    // Try to parse JSON-RPC messages from the buffer using Content-Length framing
    while (buffer.length > 0) {
      const headerEnd = buffer.indexOf("\r\n\r\n")
      if (headerEnd === -1) break

      const headerSection = buffer.slice(0, headerEnd)
      const contentLengthMatch = headerSection.match(/Content-Length:\s*(\d+)/i)
      if (!contentLengthMatch) {
        // Invalid framing, skip
        buffer = buffer.slice(headerEnd + 4)
        continue
      }

      const contentLength = parseInt(contentLengthMatch[1], 10)
      const bodyStart = headerEnd + 4
      if (buffer.length < bodyStart + contentLength) break // Not enough data yet

      const body = buffer.slice(bodyStart, bodyStart + contentLength)
      buffer = buffer.slice(bodyStart + contentLength)

      let request: JsonRpcRequest
      try {
        request = JSON.parse(body) as JsonRpcRequest
      } catch {
        writeResponse({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        })
        continue
      }

      void handleRequest(request)
    }
  }

  async function handleRequest(request: JsonRpcRequest): Promise<void> {
    emitNervesEvent({
      component: "daemon",
      event: "daemon.mcp_request_start",
      message: "handling MCP request",
      meta: { method: request.method, agent },
    })

    // Notifications (no id) don't get responses
    if (request.id === undefined) {
      emitNervesEvent({
        component: "daemon",
        event: "daemon.mcp_request_end",
        message: "handled MCP notification",
        meta: { method: request.method, agent },
      })
      return
    }

    switch (request.method) {
      case "initialize":
        await handleInitialize(request)
        break
      case "tools/list":
        handleToolsList(request)
        break
      case "tools/call":
        await handleToolsCall(request)
        break
      default:
        writeResponse({
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`,
          },
        })
        break
    }

    emitNervesEvent({
      component: "daemon",
      event: "daemon.mcp_request_end",
      message: "completed MCP request",
      meta: { method: request.method, agent },
    })
  }

  async function handleInitialize(request: JsonRpcRequest): Promise<void> {
    // Check daemon is running by verifying socket exists
    if (!fs.existsSync(socketPath)) {
      writeResponse({
        jsonrpc: "2.0",
        id: request.id!,
        error: {
          code: -32002,
          message: `Agent daemon is not running. Start it with: ouro daemon --agent ${agent}`,
        },
      })
      return
    }

    writeResponse({
      jsonrpc: "2.0",
      id: request.id!,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: {
          name: "ouro-mcp-server",
          version: "0.1.0",
        },
        capabilities: {
          tools: { listChanged: false },
        },
      },
    })
  }

  function handleToolsList(request: JsonRpcRequest): void {
    const tools = getToolSchemas()
    writeResponse({
      jsonrpc: "2.0",
      id: request.id!,
      result: { tools },
    })
  }

  async function handleToolsCall(request: JsonRpcRequest): Promise<void> {
    const params = request.params ?? {}
    const toolName = params.name as string
    const toolArgs = (params.arguments ?? {}) as Record<string, unknown>

    const commandKind = TOOL_TO_COMMAND[toolName]
    if (!commandKind) {
      writeResponse({
        jsonrpc: "2.0",
        id: request.id!,
        result: {
          content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
          isError: true,
        },
      })
      return
    }

    const command: DaemonCommand = {
      kind: commandKind,
      agent,
      friendId,
      ...toolArgs,
    } as DaemonCommand

    let daemonResponse: DaemonResponse
    try {
      daemonResponse = await sendDaemonCommand(socketPath, command)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      writeResponse({
        jsonrpc: "2.0",
        id: request.id!,
        result: {
          content: [{ type: "text", text: `Daemon error: ${errorMessage}` }],
          isError: true,
        },
      })
      return
    }

    const text = daemonResponse.message
      ?? daemonResponse.summary
      ?? JSON.stringify(daemonResponse.data ?? { ok: daemonResponse.ok })

    writeResponse({
      jsonrpc: "2.0",
      id: request.id!,
      result: {
        content: [{ type: "text", text }],
        isError: !daemonResponse.ok,
      },
    })
  }

  function onData(chunk: Buffer): void {
    handleData(chunk)
  }

  return {
    agent,
    friendId,
    start() {
      if (running) return
      running = true
      stdin.on("data", onData)
      emitNervesEvent({
        component: "daemon",
        event: "daemon.mcp_server_start",
        message: "MCP server started",
        meta: { agent, friendId, socketPath },
      })
    },
    stop() {
      if (!running) return
      running = false
      stdin.removeListener("data", onData)
      emitNervesEvent({
        component: "daemon",
        event: "daemon.mcp_server_stop",
        message: "MCP server stopped",
        meta: { agent, friendId },
      })
    },
  }
}

/**
 * Returns the list of MCP tool schemas.
 * Defined here as a stub -- full schemas will be added in Unit 5.
 */
export function getToolSchemas(): McpToolSchema[] {
  return Object.keys(TOOL_TO_COMMAND).map((name) => ({
    name,
    description: `${name.replace(/_/g, " ")} -- agent tool`,
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  }))
}
