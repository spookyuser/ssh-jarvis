import Anthropic from "@anthropic-ai/sdk";
import { TOOLS } from "./tools";
import { SYSTEM_PROMPT } from "./prompt";
import { renderToolCall } from "./renderers";

// ── Types ────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string | Anthropic.ContentBlock[];
}

// ── Session ──────────────────────────────────────────────────────

export class ClaudeSession {
  private client: Anthropic;
  private messages: Message[] = [];
  private maxTokens: number;

  constructor(opts?: { maxTokens?: number }) {
    this.client = new Anthropic();
    this.maxTokens = opts?.maxTokens ?? 8192;
  }

  async send(
    input: string,
    onOutput: (text: string) => void
  ): Promise<void> {
    this.messages.push({ role: "user", content: input });

    // Sliding window — keep conversation bounded
    if (this.messages.length > 80) {
      this.messages = this.messages.slice(-80);
    }

    // Stream the response, collecting each tool call and rendering
    // it as soon as its content_block completes. This gives us
    // per-tool-call responsiveness without parsing partial JSON.

    const stream = this.client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: this.maxTokens,
      system: SYSTEM_PROMPT,
      messages: this.messages,
      tools: TOOLS,
      // "any" = must use at least one tool, but picks which.
      // This is the structural constraint — Claude cannot respond
      // with bare text. It must go through a typed schema.
      tool_choice: { type: "any" },
    });

    // Collect content blocks for conversation history
    const contentBlocks: Anthropic.ContentBlock[] = [];

    // Track current tool call being streamed
    let currentToolName = "";
    let currentToolId = "";
    let jsonBuffer = "";
    let blockIndex = -1;

    for await (const event of stream) {
      switch (event.type) {
        case "content_block_start": {
          blockIndex = event.index;
          if (event.content_block.type === "tool_use") {
            currentToolName = event.content_block.name;
            currentToolId = event.content_block.id;
            jsonBuffer = "";
          } else {
            // Text block — ignore. Claude shouldn't produce these
            // with tool_choice: "any", but be defensive.
            currentToolName = "";
          }
          break;
        }

        case "content_block_delta": {
          if (
            currentToolName &&
            event.delta.type === "input_json_delta"
          ) {
            jsonBuffer += event.delta.partial_json;
          }
          break;
        }

        case "content_block_stop": {
          if (currentToolName && jsonBuffer) {
            let input: any;
            try {
              input = JSON.parse(jsonBuffer);
            } catch {
              onOutput("[SUBSYSTEM ERROR: malformed response]\n");
              break;
            }

            // Render through the appropriate ANSI renderer
            const rendered = renderToolCall(currentToolName, input);
            onOutput(rendered);
            onOutput("\n");

            // Store for conversation history
            contentBlocks.push({
              type: "tool_use",
              id: currentToolId,
              name: currentToolName,
              input,
            } as Anthropic.ContentBlock);
          }

          currentToolName = "";
          jsonBuffer = "";
          break;
        }
      }
    }

    // ── Update conversation history ──────────────────────────────

    if (contentBlocks.length > 0) {
      this.messages.push({
        role: "assistant",
        content: contentBlocks,
      });

      // Close the tool-use loop so Claude stays consistent
      const toolResults = contentBlocks
        .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        .map((b) => ({
          type: "tool_result" as const,
          tool_use_id: b.id,
          content: "Rendered.",
        }));

      this.messages.push({
        role: "user",
        content: toolResults,
      } as any);
    }
  }
}
