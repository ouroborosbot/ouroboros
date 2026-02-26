import type { Channel } from "../mind/prompt"

export interface CommandContext {
  channel: Channel
}

export interface CommandResult {
  action: "exit" | "new" | "response"
  message?: string
}

export interface Command {
  name: string
  description: string
  channels: Channel[]
  handler: (ctx: CommandContext) => CommandResult
}

export interface DispatchResult {
  handled: boolean
  result?: CommandResult
}

export interface CommandRegistry {
  register(cmd: Command): void
  get(name: string): Command | undefined
  list(channel: Channel): Command[]
  dispatch(name: string, ctx: CommandContext): DispatchResult
}

export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<string, Command>()

  return {
    register(cmd: Command): void {
      commands.set(cmd.name, cmd)
    },
    get(name: string): Command | undefined {
      return commands.get(name)
    },
    list(channel: Channel): Command[] {
      return [...commands.values()].filter((c) => c.channels.includes(channel))
    },
    dispatch(name: string, ctx: CommandContext): DispatchResult {
      const cmd = commands.get(name)
      if (!cmd) return { handled: false }
      return { handled: true, result: cmd.handler(ctx) }
    },
  }
}

export function registerDefaultCommands(registry: CommandRegistry): void {
  registry.register({
    name: "exit",
    description: "quit ouroboros",
    channels: ["cli"],
    handler: () => ({ action: "exit" }),
  })

  registry.register({
    name: "new",
    description: "start a new conversation",
    channels: ["cli", "teams"],
    handler: () => ({ action: "new" }),
  })

  registry.register({
    name: "commands",
    description: "list available commands",
    channels: ["cli", "teams"],
    handler: (ctx) => {
      const cmds = registry.list(ctx.channel)
      const lines = cmds.map((c) => `/${c.name} - ${c.description}`)
      return { action: "response", message: lines.join("\n") }
    },
  })
}

export function parseSlashCommand(input: string): { command: string; args: string } | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith("/")) return null
  // Reject // (double slash)
  if (trimmed.startsWith("//")) return null
  const rest = trimmed.slice(1)
  if (!rest) return null
  const spaceIdx = rest.indexOf(" ")
  if (spaceIdx === -1) {
    return { command: rest.toLowerCase(), args: "" }
  }
  return { command: rest.slice(0, spaceIdx).toLowerCase(), args: rest.slice(spaceIdx + 1) }
}
