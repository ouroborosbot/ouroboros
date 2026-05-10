import { describe, expect, it } from "vitest"
import {
  buildVoiceRealtimeEvalHappyPath,
  gradeVoiceRealtimeEvalTimeline,
  runBuiltInVoiceRealtimeEvalSuite,
  summarizeVoiceRealtimeEvalSuite,
  type VoiceRealtimeEvalExpectation,
  type VoiceRealtimeEvalTimelineEvent,
} from "../../../senses/voice/realtime-eval"

const baselineExpectation: VoiceRealtimeEvalExpectation = {
  maxFirstAssistantAudioMs: 1_200,
  maxUserTurnResponseMs: 900,
  maxToolPresenceMs: 600,
  maxBargeInClearMs: 120,
  maxBargeInTruncateMs: 180,
  requireManualFloorControl: true,
  requireFriendContext: {
    friendId: "friend-ari",
    sessionKey: "twilio-phone-friend-ari-via-ouro",
    marker: "trust=family",
  },
  requireHangup: true,
  requiredTranscripts: [
    { role: "user", contains: "weather" },
    { role: "assistant", contains: "checking the weather" },
  ],
}

function mutateHappyPath(mutator: (events: VoiceRealtimeEvalTimelineEvent[]) => void): VoiceRealtimeEvalTimelineEvent[] {
  const events = buildVoiceRealtimeEvalHappyPath()
  mutator(events)
  return events
}

describe("voice realtime eval kernel", () => {
  it("passes a healthy transport-aware voice timeline and reports core latency metrics", () => {
    const report = gradeVoiceRealtimeEvalTimeline("happy-path", buildVoiceRealtimeEvalHappyPath(), baselineExpectation)

    expect(report.passed).toBe(true)
    expect(report.findings).toEqual([])
    expect(report.metrics).toMatchObject({
      ttfaMs: 720,
      firstUserResponseMs: 280,
      firstToolPresenceMs: 260,
      firstBargeInClearMs: 40,
      firstBargeInTruncateMs: 70,
    })
    expect(report.transportSources).toEqual([
      "openai-realtime-control",
      "openai-sip",
      "twilio-media-stream",
      "voice-eval",
    ])
  })

  it("flags missing or late first audio, late user responses, and missing transcripts", () => {
    const late = mutateHappyPath((events) => {
      const firstAudio = events.find((event) => event.type === "assistant.audio.started")
      if (firstAudio) firstAudio.atMs = 1_900
      const firstResponse = events.find((event) => event.type === "response.requested" && event.correlationId === "user-1")
      if (firstResponse) firstResponse.atMs = 3_000
      const transcript = events.find((event) => event.type === "assistant.transcript.done")
      if (transcript) transcript.text = "done"
    })

    const report = gradeVoiceRealtimeEvalTimeline("late-path", late, baselineExpectation)

    expect(report.passed).toBe(false)
    expect(report.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "first_audio_late",
      "user_response_late",
      "transcript_missing",
    ]))
    expect(report.findings.find((finding) => finding.code === "first_audio_late")).toMatchObject({
      severity: "fail",
      source: { transport: "openai-sip", id: "sip-call-1" },
    })
  })

  it("flags absent tool presence, duplicate response requests while playback is active, and weak floor control", () => {
    const flawed = mutateHappyPath((events) => {
      const session = events.find((event) => event.type === "session.updated")
      if (session?.session) {
        session.session.turnDetection = { createResponse: true, interruptResponse: true }
      }
      const holdingIndex = events.findIndex((event) => event.type === "tool.holding.started")
      if (holdingIndex >= 0) events.splice(holdingIndex, 1)
      events.push({
        type: "response.requested",
        atMs: 1_600,
        correlationId: "overlap",
        source: { transport: "openai-realtime-control", id: "ws-1" },
      })
    })

    const report = gradeVoiceRealtimeEvalTimeline("tool-floor-path", flawed, baselineExpectation)

    expect(report.passed).toBe(false)
    expect(report.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "manual_floor_control_missing",
      "tool_presence_missing",
      "response_overlap",
    ]))
  })

  it("flags missed barge-in controls, missing friend context, and missing hangup", () => {
    const flawed = mutateHappyPath((events) => {
      const clearIndex = events.findIndex((event) => event.type === "transport.playback_cleared")
      if (clearIndex >= 0) events.splice(clearIndex, 1)
      const truncateIndex = events.findIndex((event) => event.type === "response.truncated")
      if (truncateIndex >= 0) events.splice(truncateIndex, 1)
      const context = events.find((event) => event.type === "voice.context.injected")
      if (context) {
        context.friendId = "friend-stranger"
        context.sessionKey = "twilio-phone-stranger"
        context.text = "trust=unknown"
      }
      const hangupIndex = events.findIndex((event) => event.type === "call.hangup.requested")
      if (hangupIndex >= 0) events.splice(hangupIndex, 1)
    })

    const report = gradeVoiceRealtimeEvalTimeline("identity-barge-path", flawed, baselineExpectation)

    expect(report.passed).toBe(false)
    expect(report.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "barge_in_clear_missing",
      "barge_in_truncate_missing",
      "friend_context_mismatch",
      "hangup_missing",
    ]))
  })

  it("rejects empty inputs and invalid latency budgets", () => {
    expect(() => gradeVoiceRealtimeEvalTimeline("", buildVoiceRealtimeEvalHappyPath(), baselineExpectation)).toThrow(
      "voice eval scenario id is empty",
    )
    expect(() => gradeVoiceRealtimeEvalTimeline("empty", [], baselineExpectation)).toThrow(
      "voice eval timeline is empty",
    )
    expect(() => gradeVoiceRealtimeEvalTimeline("bad-threshold", buildVoiceRealtimeEvalHappyPath(), {
      ...baselineExpectation,
      maxFirstAssistantAudioMs: 0,
    })).toThrow("voice eval latency budgets must be positive")
  })

  it("runs built-in no-human scenarios and summarizes pass/fail counts", () => {
    const reports = runBuiltInVoiceRealtimeEvalSuite()
    const summary = summarizeVoiceRealtimeEvalSuite(reports)

    expect(reports.map((report) => report.scenarioId)).toEqual([
      "voice-happy-path",
      "voice-known-bad-latency",
    ])
    expect(summary).toEqual({
      passed: 1,
      failed: 1,
      total: 2,
      failedScenarioIds: ["voice-known-bad-latency"],
    })
    expect(reports[1].findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "first_audio_late",
      "user_response_late",
    ]))
  })
})
