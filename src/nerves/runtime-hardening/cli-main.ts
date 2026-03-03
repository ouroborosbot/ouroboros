import { runRuntimeHardeningCli } from "./cli"

const code = runRuntimeHardeningCli(process.argv.slice(2))
process.exit(code)
