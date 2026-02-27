// A kick is a self-correction. When the harness detects a malformed response,
// it injects an assistant-role message as if the model caught its own mistake.
//
// Kicks are:
//   - assistant role (self-correction, not external rebuke)
//   - first person ("I" not "you")
//   - forward-looking (what I'm doing next, not what I did wrong)
//   - short (one sentence)

export type KickReason = "empty" | "narration" | "tool_required";

export interface Kick {
  reason: KickReason;
  message: string;
}

const KICK_MESSAGES: Record<KickReason, string> = {
  empty: "I sent an empty message by accident — let me try again.",
  narration: "I narrated instead of acting. Calling the tool now.",
  tool_required: "tool-required is on — I need to call a tool. use /tool-required to turn it off.",
};

const TOOL_INTENT_PATTERNS = [
  // Explicit intent — "let me", "I'll", "I will"
  /\blet me\b/i,
  /\bi'll\b/i,
  /\bi will\b/i,
  /\bi would like to\b/i,
  /\bi want to\b/i,

  // "going to" variants
  /\bi'm going to\b/i,
  /\bgoing to\b/i,
  /\bi am going to\b/i,

  // Action announcements — "I need to", "I should", "I can"
  /\bi need to\b/i,
  /\bi should\b/i,
  /\bi can\b/i,

  // Gerund phase shifts — "entering", "starting", "proceeding", "switching"
  /\bentering\b/i,
  /\bstarting with\b/i,
  /\bproceeding\b/i,
  /\bswitching to\b/i,

  // Temporal narration — "first", "now I", "next"
  /\bfirst,?\s+i\b/i,
  /\bnow i\b/i,
  /\bnext,?\s+i\b/i,

  // Hedged intent — "allow me to", "time to"
  /\ballow me to\b/i,
  /\btime to\b/i,

  // Self-narration — "my next step", "my plan"
  /\bmy next step\b/i,
  /\bmy plan\b/i,
];

// Normalize curly quotes/apostrophes to straight so patterns match consistently
function normalize(text: string): string {
  return text.replace(/[\u2018\u2019\u2032]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

export function hasToolIntent(text: string): boolean {
  return TOOL_INTENT_PATTERNS.some((p) => p.test(normalize(text)));
}

// Detect what kind of kick is needed, or null if response is fine.
// Priority: empty > narration > tool_required
export function detectKick(
  content: string,
  options?: { toolChoiceRequired?: boolean },
): Kick | null {
  const isEmpty = !content?.trim();

  if (isEmpty) {
    return { reason: "empty", message: KICK_MESSAGES.empty };
  }

  if (hasToolIntent(content)) {
    return { reason: "narration", message: KICK_MESSAGES.narration };
  }

  if (options?.toolChoiceRequired) {
    return { reason: "tool_required", message: KICK_MESSAGES.tool_required };
  }

  return null;
}
