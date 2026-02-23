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
    model: "MiniMax-Text-01",
    messages: [{ role: "user", content: "say hello in 5 words" }],
  });

  console.log(response.choices[0].message.content);
}

main();
