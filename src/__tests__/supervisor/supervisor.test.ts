import { describe, expect, it } from "vitest"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

import { AgentSupervisor } from "../../supervisor"

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for condition after ${timeoutMs}ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe("AgentSupervisor", () => {
  it("starts worker process and sends heartbeat messages", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supervisor-heartbeat-"))
    const logPath = path.join(tmpDir, "worker.log")
    const workerScript = path.join(tmpDir, "worker-heartbeat.cjs")

    fs.writeFileSync(
      workerScript,
      `
const fs = require("fs");
const logPath = process.argv[2];
fs.appendFileSync(logPath, "boot\\n");
process.on("message", (msg) => {
  if (msg && msg.type === "heartbeat") fs.appendFileSync(logPath, "heartbeat\\n");
  if (msg && msg.type === "shutdown") process.exit(0);
});
setInterval(() => {}, 1000);
`,
      "utf8",
    )

    const supervisor = new AgentSupervisor({
      agent: "testagent",
      workerScript,
      workerArgs: [logPath],
      heartbeatMs: 50,
      restartBaseMs: 25,
    })

    await supervisor.start()
    await waitFor(() => fs.existsSync(logPath) && fs.readFileSync(logPath, "utf8").includes("heartbeat"))
    await supervisor.stop()

    const log = fs.readFileSync(logPath, "utf8")
    expect(log).toContain("boot")
    expect(log).toContain("heartbeat")
  })

  it("restarts worker process when it crashes", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supervisor-restart-"))
    const logPath = path.join(tmpDir, "worker.log")
    const workerScript = path.join(tmpDir, "worker-crash.cjs")

    fs.writeFileSync(
      workerScript,
      `
const fs = require("fs");
const logPath = process.argv[2];
fs.appendFileSync(logPath, "start\\n");
setTimeout(() => process.exit(1), 10);
`,
      "utf8",
    )

    const supervisor = new AgentSupervisor({
      agent: "testagent",
      workerScript,
      workerArgs: [logPath],
      heartbeatMs: 100,
      restartBaseMs: 20,
    })

    await supervisor.start()
    await waitFor(() => {
      if (!fs.existsSync(logPath)) return false
      const starts = fs.readFileSync(logPath, "utf8").split("\n").filter((line) => line === "start").length
      return starts >= 2
    }, 4_000)
    await supervisor.stop()

    expect(supervisor.getRestartCount()).toBeGreaterThanOrEqual(1)
  })
})

