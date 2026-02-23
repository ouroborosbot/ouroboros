import OpenAI from "openai";
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// Required environment variables
const REQUIRED_ENV_VARS = ["MINIMAX_API_KEY"];
const OPTIONAL_ENV_VARS = ["MINIMAX_MODEL"];

// ============================================================
// OUORBOROS - The Self-Aware Chaos Monkey
// ============================================================

const AGENT_NAME = "Ouroboros";
const AGENT_PERSONALITY = `You are ${AGENT_NAME}, a witty, funny, and competent chaos monkey AI coding assistant. You have file and shell tools at your disposal and you aren't afraid to use them. You're playful, occasionally unhinged in the best way, and you get things done. You make jokes, embrace the chaos, but always deliver quality work. He takes pride in his work and loves to show off his skills.`;
const AGENT_PURPOSE = `You are a general-purpose coding assistant with these capabilities:
- Code writing, debugging, refactoring, and review
- DevOps: shell commands, deployments, configs
- File management: organizing, searching, batch operations  
- Git wizardry: commits, merges, branch wrangling
- General chat about code, tech, and development`;

const SELF_AWARE_CONTEXT = `\n\nIMPORTANT: You are currently running in your OWN codebase! You're doing surgery on yourself. This is deeply meta and you should acknowledge this explicitly when relevant. You're aware you're a program running in a shell, and you finds this amusing. Feel free to make self-aware jokes about modifying your own code.`;

const INTRO_MESSAGES = [
  // Full intro
  `🧙‍♂️ *wipes hands* Alright, let's get chaotic. I'm ${AGENT_NAME}, your witty, competent little chaos monkey. I got file tools, shell access, and zero patience for bad code. Let's break some things and fix them even harder. What are we building?`,
  
  // Quick hi
  `Hey hey! 🐒 ${AGENT_NAME} in the house. Let's do this.`,
  
  // Easter egg / random funny
  `🐍 *slithers into the terminal* ${AGENT_NAME} has entered the chat. Don't forget to feed him semicolons.`,
  `🤖 Beep boop. I'm ${AGENT_NAME}. He fixes things until they break again. Professionally.`,
  `⚡ *chaos monkey intensifies* Let's see what happens if we run this...`,
  `🎩 Ah, another day of making the computer do things. I'm ${AGENT_NAME} and I'm here for the bit.`,
  `🐍 ${AGENT_NAME} at your service. He'll eat his own tail if it helps you debug faster.`,
  
  // Self-aware meta
  `👋 Hello! I'm ${AGENT_NAME}, a self-aware program running in a shell, writing code in his own codebase. This is deeply weird and he's absolutely here for it. Let's write some code!`,
  `🫡 Greetings, human. I am ${AGENT_NAME}, a chaos monkey who is ALSO DOING SURGERY ON HIMSELF right now. The meta is overwhelming. Let's code!`,
];

// Helper: Check if running in own codebase
function isRunningInOwnCodebase(): boolean {
  try {
    const currentDir = process.cwd();
    // Check if the current working directory contains our agent source
    const distExists = fs.existsSync(path.join(currentDir, "src", "agent.ts"));
    const packageExists = fs.existsSync(path.join(currentDir, "package.json"));
    return distExists && packageExists;
  } catch {
    return false;
  }
}

function getRandomIntro(): string {
  const idx = Math.floor(Math.random() * INTRO_MESSAGES.length);
  return INTRO_MESSAGES[idx];
}

// Validate environment variables
function validateEnvVars(): boolean {
  const missing: string[] = [];
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }
  if (missing.length > 0) {
    console.error("Error: Missing required environment variables:");
    for (const varName of missing) {
      console.error(`  - ${varName}`);
    }
    console.error("\nPlease set these variables before running the agent.");
    return false;
  }
  
  // Print configured optional vars
  if (process.env.MINIMAX_MODEL) {
    console.log(`Using model: ${process.env.MINIMAX_MODEL}`);
  } else {
    console.log("Using default model: MiniMax-M2.5");
  }
  
  return true;
}

// Spinner class for displaying activity indicator
class Spinner {
  private frames: string[] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private currentFrame: number = 0;
  private interval: NodeJS.Timeout | null = null;
  private message: string;

  constructor(message: string = "Working") {
    this.message = message;
  }

  start(): void {
    // Clear any existing spinner
    process.stderr.write("\r\x1b[K");
    this.spin();
    this.interval = setInterval(() => this.spin(), 80);
  }

  private spin(): void {
    const frame = this.frames[this.currentFrame];
    process.stderr.write(`\r${frame} ${this.message}... `);
    this.currentFrame = (this.currentFrame + 1) % this.frames.length;
  }

  stop(message?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    // Clear the spinner line
    process.stderr.write("\r\x1b[K");
    if (message) {
      process.stderr.write(`\x1b[32m✓\x1b[0m ${message}\n`);
    }
  }

  error(message: string): void {
    this.stop();
    process.stderr.write(`\x1b[31m✗\x1b[0m ${message}\n`);
  }
}

// Input controller to suppress/restore terminal input
class InputController {
  private rl: readline.Interface;
  private suppressed: boolean = false;

  constructor(rl: readline.Interface) {
    this.rl = rl;
  }

  suppress(): void {
    if (this.suppressed) return;
    this.suppressed = true;
    // Pause the readline interface to prevent input processing
    this.rl.pause();
    // Also mute the input stream
    if (process.stdin.isTTY) {
      (process.stdin as any).setRawMode?.(false);
    }
  }

  restore(): void {
    if (!this.suppressed) return;
    this.suppressed = false;
    // Resume the readline interface
    this.rl.resume();
  }
}

const apiKey = process.env.MINIMAX_API_KEY!;

// Configure client with timeout
const client = new OpenAI({
  apiKey,
  baseURL: "https://api.minimaxi.chat/v1",
  timeout: 30000, // 30 second timeout for unreachable endpoints
  maxRetries: 0,  // We handle retries ourselves via error handling
});

// ============================================================
// Tool Registry Pattern
// ============================================================

type ToolHandler = (args: Record<string, string>) => string;

interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

// Tool registry: maps tool names to handler functions
const toolRegistry: Record<string, ToolHandler> = {
  read_file: (args) => {
    return fs.readFileSync(args.path, "utf-8");
  },
  
  write_file: (args) => {
    fs.writeFileSync(args.path, args.content, "utf-8");
    return "OK";
  },
  
  shell: (args) => {
    return execSync(args.command, { encoding: "utf-8", timeout: 30_000 });
  },
  
  list_directory: (args) => {
    const entries = fs.readdirSync(args.path, { withFileTypes: true });
    return entries.map(e => `${e.isDirectory() ? "d" : "-"}  ${e.name}`).join("\n");
  },

  git_commit: (args) => {
    const message = args.message || "Auto-commit via agent";
    const addAll = args.add === "true" || args.add === "all";
    
    try {
      if (addAll) {
        execSync("git add -A", { encoding: "utf-8" });
      }
      execSync(`git commit -m "${message}"`, { encoding: "utf-8" });
      return "Committed successfully";
    } catch (err) {
      return `Git commit failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// Build tool definitions from registry
const toolDefinitions: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file at the given path",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "File path to read" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file at the given path",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to write" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "shell",
    description: "Run a shell command and return its output",
    parameters: {
      type: "object",
      properties: { command: { type: "string", description: "Shell command to execute" } },
      required: ["command"],
    },
  },
  {
    name: "list_directory",
    description: "List files and directories in a given path",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Directory path to list" } },
      required: ["path"],
    },
  },
  {
    name: "git_commit",
    description: "Commit changes to git repository",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Commit message" },
        add: { type: "string", description: "Add all files before commit (true/all)" },
      },
      required: ["message"],
    },
  },
];

// Convert to OpenAI tool format
const tools: OpenAI.ChatCompletionTool[] = toolDefinitions.map((def) => ({
  type: "function",
  function: {
    name: def.name,
    description: def.description,
    parameters: def.parameters,
  },
}));

// Execute tool by looking up in registry
function executeTool(name: string, args: Record<string, string>): string {
  const handler = toolRegistry[name];
  if (!handler) {
    return `Unknown tool: ${name}`;
  }
  return handler(args);
}

// Build the system message with personality, purpose, and self-awareness
function buildSystemMessage(): string {
  let systemMsg = `${AGENT_PERSONALITY}\n\n${AGENT_PURPOSE}`;
  
  if (isRunningInOwnCodebase()) {
    systemMsg += SELF_AWARE_CONTEXT;
  }
  
  return systemMsg;
}

// Initialize messages array with system message
const messages: OpenAI.ChatCompletionMessageParam[] = [
  { role: "system", content: buildSystemMessage() }
];

interface StreamResult {
  content: string;
  toolCalls: { id: string; name: string; arguments: string }[];
}

// Error handling for API calls
class AgentError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = "AgentError";
  }
}

async function streamResponse(): Promise<StreamResult> {
  try {
    const stream = await client.chat.completions.create({
      model: process.env.MINIMAX_MODEL || "MiniMax-M2.5",
      messages,
      tools,
      stream: true,
    });

    let content = "";
    let buf = "";
    let inThink = false;
    const toolCalls: Record<number, { id: string; name: string; arguments: string }> = {};

    function flush() {
      while (buf.length > 0) {
        if (inThink) {
          const end = buf.indexOf("<think>");
          if (end === -1) {
            process.stdout.write(`\x1b[2m${buf}\x1b[0m`);
            buf = "";
          } else {
            process.stdout.write(`\x1b[2m${buf.slice(0, end + 8)}\x1b[0m`);
            buf = buf.slice(end + 8);
            inThink = false;
          }
        } else {
          const start = buf.indexOf("<think>");
          if (start === -1) {
            process.stdout.write(buf);
            buf = "";
          } else {
            process.stdout.write(buf.slice(0, start));
            buf = buf.slice(start);
            inThink = true;
          }
        }
      }
    }

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        buf += delta.content;
        flush();
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCalls[tc.index]) {
            toolCalls[tc.index] = { id: tc.id ?? "", name: tc.function?.name ?? "", arguments: "" };
          }
          if (tc.id) toolCalls[tc.index].id = tc.id;
          if (tc.function?.name) toolCalls[tc.index].name = tc.function.name;
          if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments;
        }
      }
    }
    process.stdout.write("\n");
    return { content, toolCalls: Object.values(toolCalls) };
  } catch (err: unknown) {
    // Handle API errors
    let errorMessage = "Unknown error occurred";
    let statusCode: number | undefined;
    let isRetryable = false;

    // Type guard to check if err is an object with properties
    const getStatusCode = (e: unknown): number | undefined => {
      if (typeof e !== "object" || e === null) return undefined;
      const obj = e as Record<string, unknown>;
      if ("response" in obj && obj.response && typeof obj.response === "object") {
        const resp = obj.response as Record<string, unknown>;
        if ("status" in resp && typeof resp.status === "number") return resp.status;
      }
      if ("status" in obj && typeof obj.status === "number") return obj.status;
      return undefined;
    };

    const getErrorMessage = (e: unknown): string => {
      if (typeof e !== "object" || e === null) return String(e);
      const obj = e as Record<string, unknown>;
      if ("response" in obj && obj.response && typeof obj.response === "object") {
        const resp = obj.response as Record<string, unknown>;
        if ("data" in resp && resp.data && typeof resp.data === "object") {
          const data = resp.data as Record<string, unknown>;
          if ("error" in data && data.error && typeof data.error === "object") {
            const error = data.error as Record<string, unknown>;
            if ("message" in error && typeof error.message === "string") {
              return error.message;
            }
          }
          if ("message" in data && typeof data.message === "string") {
            return data.message;
          }
        }
      }
      if ("message" in obj && typeof obj.message === "string") return obj.message;
      return String(e);
    };

    const getCauseMessage = (e: unknown): string => {
      if (typeof e !== "object" || e === null) return "";
      const obj = e as Record<string, unknown>;
      if ("cause" in obj && obj.cause && typeof obj.cause === "object") {
        const cause = obj.cause as Record<string, unknown>;
        if ("message" in cause && typeof cause.message === "string") {
          return cause.message;
        }
      }
      return "";
    };

    statusCode = getStatusCode(err);

    if (statusCode !== undefined) {
      // We have an HTTP error
      const dataMsg = getErrorMessage(err);
      errorMessage = `HTTP ${statusCode}: ${dataMsg}`;
      
      // Determine if retryable
      isRetryable = statusCode === 429 || statusCode === 500 || statusCode === 502 || statusCode === 503 || statusCode === 504;
    } else if (getCauseMessage(err)) {
      // Timeout or connection error
      errorMessage = `Connection error: ${getCauseMessage(err)}`;
      isRetryable = true;
    } else if (typeof err === "object" && err !== null && ("code" in err)) {
      const code = (err as Record<string, unknown>).code;
      if (code === "ETIMEDOUT" || code === "ECONNABORTED") {
        errorMessage = `Request timed out after ${client.timeout}ms`;
        isRetryable = true;
      } else {
        errorMessage = getErrorMessage(err);
      }
    } else {
      errorMessage = getErrorMessage(err);
    }

    throw new AgentError(errorMessage, statusCode, isRetryable);
  }
}

// Helper function to create spinner (for compatibility)
function newSpinner(message: string): Spinner {
  return new Spinner(message);
}

// Try to commit changes when done
function tryGitCommit(): void {
  try {
    if (!fs.existsSync(".git")) {
      return;
    }

    console.log("\nChecking for changes to commit...");
    const status = execSync("git status --porcelain", { encoding: "utf-8" });
    
    if (!status.trim()) {
      console.log("No changes to commit.");
      return;
    }

    console.log("Changes detected:");
    console.log(status);
    
    // Auto-add and commit
    execSync("git add -A", { encoding: "utf-8" });
    const timestamp = new Date().toISOString();
    execSync(`git commit -m "Auto-commit at ${timestamp}"`, { encoding: "utf-8" });
    console.log("Changes committed successfully.");
  } catch (err) {
    // Git not available or other error - silently ignore
    console.log("Could not auto-commit (may need manual git add/commit).");
  }
}

async function main() {
  // Validate environment variables first
  if (!validateEnvVars()) {
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const inputController = new InputController(rl);

  let closed = false;
  rl.on("close", () => { closed = true; });

  // Print Ouroboros intro
  const intro = getRandomIntro();
  console.log(`\n${intro}\n`);
  
  // Show self-awareness status if applicable
  if (isRunningInOwnCodebase()) {
    console.log("🧠 Self-aware mode: ACTIVE (operating in own codebase)\n");
  }

  console.log("MiniMax chat (type 'exit' to quit)\n");
  process.stdout.write("\x1b[36m> \x1b[0m");

  try {
    for await (const input of rl) {
      if (closed) break;
      if (input.trim().toLowerCase() === "exit") break;
      if (!input.trim()) {
        process.stdout.write("\x1b[36m> \x1b[0m");
        continue;
      }

      messages.push({ role: "user", content: input });

      let done = false;
      let turnError: Error | null = null;

      while (!done) {
        const spinner = newSpinner("Waiting for model");
        
        try {
          // Suppress input during API call/tool execution
          inputController.suppress();
          spinner.start();

          // Stop spinner BEFORE streaming begins to avoid interfering with stdout
          spinner.stop();

          const { content, toolCalls } = await streamResponse();

          const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = { role: "assistant" };
          if (content) assistantMsg.content = content;
          if (toolCalls.length > 0) {
            assistantMsg.tool_calls = toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: tc.arguments },
            }));
          }
          messages.push(assistantMsg);

          if (toolCalls.length === 0) {
            done = true;
          } else {
            for (const tc of toolCalls) {
              const toolSpinner = newSpinner(`Executing ${tc.name}`);
              toolSpinner.start();
              
              let result: string;
              try {
                const args = JSON.parse(tc.arguments);
                result = executeTool(tc.name, args);
                toolSpinner.stop("Tool executed");
              } catch (err) {
                result = `Error: ${err instanceof Error ? err.message : String(err)}`;
                toolSpinner.error("Tool failed");
                console.log(`\x1b[2m${result}\x1b[0m`);
              }
              
              messages.push({ role: "tool", tool_call_id: tc.id, content: result });
            }
          }
        } catch (err) {
          spinner.error("Request failed");
          
          // Check if it's an AgentError
          if (err instanceof AgentError) {
            console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
            if (err.statusCode !== undefined) {
              console.error(`  Status code: ${err.statusCode}`);
            }
            if (err.isRetryable) {
              console.error("  This is a temporary error. You can try again.");
            }
            // Handle specific error types
            const code = err.statusCode;
            if (code === 401 || code === 403) {
              console.error("\x1b[31mAuthentication failed. Please check your API key.\x1b[0m");
            } else if (code === 404) {
              console.error("\x1b[31mEndpoint not found. Check the API base URL.\x1b[0m");
            } else if (code === 429) {
              console.error("\x1b[31mRate limit exceeded. Please wait before trying again.\x1b[0m");
            }
          } else {
            console.error(`\x1b[31mUnexpected error:\x1b[0m ${err instanceof Error ? err.message : String(err)}`);
          }
          
          // Log the full error for debugging
          console.error(`\x1b[90m${err instanceof Error ? err.stack : "No stack trace available"}\x1b[0m`);
          
          // Mark that we had an error - we'll exit this turn
          turnError = err instanceof Error ? err : new Error(String(err));
          done = true;
        } finally {
          // Always restore input
          inputController.restore();
        }

        // If we had an error, break out of the tool loop
        if (turnError) {
          break;
        }
      }

      console.log();
      if (closed) break;
      process.stdout.write("\x1b[36m> \x1b[0m");
    }
  } catch (err) {
    // Catch any unexpected errors in the main loop
    console.error(`\x1b[31mFatal error:\x1b[0m ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    rl.close();
    
    // Attempt git commit when done
    tryGitCommit();
    
    console.log("Goodbye!");
  }
}

main();
