import { runAuditCli } from "./cli"

const code = runAuditCli(process.argv.slice(2))
process.exit(code)
