import OpenAI from "openai";
import * as readline from "readline";

const apiKey = process.env.MINIMAX_API_KEY;
if (!apiKey) {
  console.error("Error: MINIMAX_API_KEY environment variable is not set.");
  process.exit(1);
}

const client = new OpenAI({
  apiKey,
  baseURL: "https://api.minimaxi.chat/v1",
});

const messages: OpenAI.ChatCompletionMessageParam[] = [];

async function streamResponse(): Promise<string> {
  const stream = await client.chat.completions.create({
    model: process.env.MINIMAX_MODEL || "MiniMax-M2.5",
    messages,
    stream: true,
  });

  let full = "";
  let inThink = false;
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (!text) continue;

    full += text;

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
  if (inThink) process.stdout.write("\x1b[0m");
  process.stdout.write("\n");
  return full;
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let closed = false;
  rl.on("close", () => { closed = true; });

  console.log("MiniMax chat (type 'exit' to quit)\n");
  process.stdout.write("\x1b[36m> \x1b[0m");

  for await (const input of rl) {
    if (closed) break;
    if (input.trim().toLowerCase() === "exit") break;
    if (!input.trim()) {
      process.stdout.write("\x1b[36m> \x1b[0m");
      continue;
    }

    messages.push({ role: "user", content: input });
    const reply = await streamResponse();
    messages.push({ role: "assistant", content: reply });
    console.log();
    if (closed) break;
    process.stdout.write("\x1b[36m> \x1b[0m");
  }

  rl.close();
}

main();
