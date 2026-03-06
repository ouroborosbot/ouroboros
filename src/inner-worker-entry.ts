// Thin entrypoint for the autonomous inner-dialog worker process.
// Requires --agent before importing runtime modules that rely on identity.
if (!process.argv.includes("--agent")) {
  // eslint-disable-next-line no-console -- pre-boot guard
  console.error("Missing required --agent <name> argument.\nUsage: node dist/inner-worker-entry.js --agent ouroboros")
  process.exit(1)
}

import { startInnerDialogWorker } from "./senses/inner-dialog-worker"

startInnerDialogWorker().catch((error) => {
  // eslint-disable-next-line no-console -- fatal startup guard for worker process
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

