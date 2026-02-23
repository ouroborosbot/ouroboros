import OpenAI from "openai";
import * as readline from "readline";
import * as fs from "fs";
import { execSync } from "child_process";

// Required environment variables
const REQUIRED_ENV_VARS = ["MINIMAX_API_KEY"];
const OPTIONAL_ENV_VARS = ["MINIMAX_MODEL"];

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

const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file at the given path",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "File path to read" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
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
  },
  {
    type: "function",
    function: {
      name: "shell",
      description: "Run a shell command and return its output",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "Shell command to execute" } },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List files and directories in a given path",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Directory path to list" } },
        required: ["path"],
      },
    },
  },
];

function executeTool(name: string, args: Record<string, string>): string {
  switch (name) {
    case "read_file":
      return fs.readFileSync(args.path, "utf-8");
    case "write_file":
      fs.writeFileSync(args.path, args.content, "utf-8");
      return "OK";
    case "shell":
      return execSync(args.command, { encoding: "utf-8", timeout: 30_000 });
    case "list_directory":
      const entries = fs.readdirSync(args.path, { withFileTypes: true });
      return entries.map(e => `${e.isDirectory() ? "d" : "-" }  ${e.name}`).join("\n");
    default:
      return `Unknown tool: ${name}`;
  }
}

const messages: OpenAI.ChatCompletionMessageParam[] = [];

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

async function streamResponse(spinner: Spinner): Promise<StreamResult> {
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

    // Stop spinner before writing any content to stdout
    spinner.stop();

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
        if (typeof resp.status === "number") return resp.status;
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

          const { content, toolCalls } = await streamResponse(spinner);
          // Spinner is now stopped inside streamResponse before content is written

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
    
    // Attempt git commit if this is a git repo
    try {
      if (fs.existsSync(".git")) {
        console.log("\nChecking for changes to commit...");
        const status = execSync("git status --porcelain", { encoding: "utf-8" });
        if (status.trim()) {
          console.log("Changes detected:");
          console.log(status);
          console.log("\nRun 'git add .' and 'git commit' manually to commit changes.");
        } else {
          console.log("No changes to commit.");
        }
      }
    } catch {
      // Git not available or not a git repo - silently ignore
    }
    
    console.log("Goodbye!");
  }
}

main();
