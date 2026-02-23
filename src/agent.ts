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
  const stream = await client.chat.completions.create({
    model: process.env.MINIMAX_MODEL || "MiniMax-M2.5",
    messages: [{ role: "user", content: "write a short poem about the joy of coding" }],
    stream: true,
  });

  let inThink = false;
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (!text) continue;

    if (text.includes("<think>")) {
      inThink = true;
      process.stdout.write("\x1b[2m");
    }

    process.stdout.write(text);

    if (text.includes("</think>")) {
      inThink = false;
      process.stdout.write("\x1b[0m");
    }
  }
  process.stdout.write("\n");
}

main();
