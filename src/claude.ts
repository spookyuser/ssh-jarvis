import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./prompt";

const TERMINAL_TOOL: Anthropic.Tool = {
  name: "terminal_output",
  description:
    "Render raw text to the operator's terminal. This is the ONLY way to display output. The text will be rendered directly in a monospace SSH terminal with no processing. Never use markdown — this is a raw terminal.",
  input_schema: {
    type: "object" as const,
    properties: {
      output: {
        type: "string",
        description:
          "The exact text to display in the terminal. Use plain text",
      },
    },
    required: ["output"],
  },
};

interface Message {
  role: "user" | "assistant";
  content: string | Anthropic.ContentBlock[];
}

export class ClaudeSession {
  private client: Anthropic;
  private messages: Message[] = [];
  private model: string;
  private maxTokens: number;

  constructor(opts?: { model?: string; maxTokens?: number }) {
    this.client = new Anthropic();
    this.model = opts?.model ?? "claude-2";
    this.maxTokens = opts?.maxTokens ?? 4096;
  }

  async send(
    input: string,
    onChunk: (text: string) => void
  ): Promise<string> {
    this.messages.push({ role: "user", content: input });

    if (this.messages.length > 80) {
      this.messages = this.messages.slice(-80);
    }

    const stream = this.client.messages.stream({
      model: "claude-4-sonnet-20250514",

      max_tokens: this.maxTokens,
      system: SYSTEM_PROMPT,
      messages: this.messages,
      tools: [TERMINAL_TOOL],
      tool_choice: { type: "tool", name: "terminal_output" },
    });

    // Stream the tool input JSON and extract the "output" field in real-time
    let jsonBuffer = "";
    let isInsideOutput = false;
    let outputStarted = false;
    let escapeNext = false;
    let fullOutput = "";

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "input_json_delta"
      ) {
        const delta = event.delta.partial_json;
        jsonBuffer += delta;

        if (!isInsideOutput) {
          // Look for the start of the output value string
          const pattern = /"output"\s*:\s*"/;
          const match = jsonBuffer.match(pattern);
          if (match && match.index !== undefined) {
            isInsideOutput = true;
            outputStarted = true;
            // Process anything after the opening quote
            const startIdx = match.index + match[0].length;
            const remainder = jsonBuffer.slice(startIdx);
            processChars(remainder, onChunk);
          }
        } else {
          // We're inside the output string, process new delta chars
          processChars(delta, onChunk);
        }
      }
    }

    function processChars(
      text: string,
      emit: (text: string) => void
    ): void {
      for (const char of text) {
        if (escapeNext) {
          escapeNext = false;
          switch (char) {
            case "n":
              emit("\n");
              fullOutput += "\n";
              break;
            case "t":
              emit("\t");
              fullOutput += "\t";
              break;
            case '"':
              emit('"');
              fullOutput += '"';
              break;
            case "\\":
              emit("\\");
              fullOutput += "\\";
              break;
            default:
              emit(char);
              fullOutput += char;
              break;
          }
        } else if (char === "\\") {
          escapeNext = true;
        } else if (char === '"') {
          // End of the output string value
          isInsideOutput = false;
          return;
        } else {
          emit(char);
          fullOutput += char;
        }
      }
    }

    // Store the tool use in conversation history so Claude stays consistent
    const toolId = "term_" + Date.now();
    this.messages.push({
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: toolId,
          name: "terminal_output",
          input: { output: fullOutput },
        },
      ],
    });

    // Tool result to close the loop
    this.messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolId,
          content: "Displayed to operator.",
        },
      ],
    } as any);

    return fullOutput;
  }
}
