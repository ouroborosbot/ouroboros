import { emitNervesEvent } from "../nerves/runtime"
import { runOuroCli } from "./daemon-cli"

export type OuroCliRunner = (args: string[]) => Promise<string>

export interface OuroBotWrapperDeps {
  loadCanonicalRunner: () => Promise<OuroCliRunner>
  fallbackRunCli: OuroCliRunner
  writeStdout: (text: string) => void
}

async function defaultLoadCanonicalRunner(): Promise<OuroCliRunner> {
  const packageName = "@ouro.bot/cli"
  const specifier = packageName
  const loaded = await import(specifier) as Record<string, unknown>
  const candidate = Object.prototype.hasOwnProperty.call(loaded, "runOuroCli")
    ? loaded["runOuroCli"]
    : undefined
  if (typeof candidate === "function") {
    return candidate as OuroCliRunner
  }
  throw new Error("@ouro.bot/cli does not export runOuroCli")
}

function defaultWriteStdout(_text: string): void {
  // Wrapper is intentionally silent by default to avoid duplicate terminal output.
}

export async function runOuroBotWrapper(args: string[], deps: Partial<OuroBotWrapperDeps> = {}): Promise<string> {
  emitNervesEvent({
    component: "daemon",
    event: "daemon.ouro_bot_wrapper_start",
    message: "starting ouro.bot wrapper delegation",
    meta: { args },
  })

  const loadCanonicalRunner = deps.loadCanonicalRunner ?? defaultLoadCanonicalRunner
  const fallbackRunCli = deps.fallbackRunCli ?? runOuroCli
  const writeStdout = deps.writeStdout ?? defaultWriteStdout

  let delegatedTo = "@ouro.bot/cli"
  let runner = fallbackRunCli

  try {
    runner = await loadCanonicalRunner()
  } catch (error) {
    delegatedTo = "local-fallback"
    emitNervesEvent({
      level: "warn",
      component: "daemon",
      event: "daemon.ouro_bot_wrapper_fallback",
      message: "canonical ouro.bot package unavailable; falling back to local CLI",
      meta: { error: error instanceof Error ? error.message : String(error) },
    })
  }

  const result = await runner(args)
  if (result.trim().length > 0) {
    writeStdout(result)
  }

  emitNervesEvent({
    component: "daemon",
    event: "daemon.ouro_bot_wrapper_end",
    message: "completed ouro.bot wrapper delegation",
    meta: { delegatedTo },
  })

  return result
}
