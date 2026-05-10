import {
  runBuiltInVoiceRealtimeEvalSuite,
  summarizeVoiceRealtimeEvalSuite,
} from "./voice/realtime-eval"

const reports = runBuiltInVoiceRealtimeEvalSuite()
const summary = summarizeVoiceRealtimeEvalSuite(reports)
const expectedKnownBadFailed = summary.failed === 1 && summary.failedScenarioIds[0] === "voice-known-bad-latency"
const happyPathPassed = reports.some((report) => report.scenarioId === "voice-happy-path" && report.passed)

// eslint-disable-next-line no-console -- terminal UX: eval command summary
console.log(JSON.stringify({ summary, expectedKnownBadFailed, happyPathPassed }, null, 2))

if (!expectedKnownBadFailed || !happyPathPassed) {
  process.exit(1)
}
