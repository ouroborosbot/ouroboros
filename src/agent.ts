import OpenAI from "openai";

const apiKey = process.env.MINIMAX_API_KEY;
if (!apiKey) {
  console.error("Error: MINIMAX_API_KEY environment variable is not set.");
  process.exit(1);
}

const client = new OpenAI({
  apiKey,
  baseURL: "https://api.minimaxi.chat/v1",
});

async function main() {
  const response = await client.chat.completions.create({
    model: process.env.MINIMAX_MODEL || "MiniMax-M2.5",
    messages: [{ role: "user", content: "say hello in 5 words" }],
  });

  const raw = response.choices[0].message.content ?? "";
  const formatted = raw.replace(
    /<think>([\s\S]*?)<\/think>/g,
    (_match, thinking: string) => `\x1b[2m<think>${thinking}</think>\x1b[0m`
  );
  console.log(formatted);
}

main();
