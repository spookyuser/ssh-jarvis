import Anthropic from "@anthropic-ai/sdk";
import { TOOLS } from "./tools";
import { renderToolCall } from "./renderers";
import { VirtualMachine } from "./vm";

// ── Types ────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string | Anthropic.ContentBlock[];
}

// ── Session ──────────────────────────────────────────────────────

export class ClaudeSession {
  private client: Anthropic;
  private messages: Message[] = [];
  private systemPrompt: string;
  private maxTokens: number;
  private vm: VirtualMachine;

  constructor(opts: { systemPrompt: string; maxTokens?: number }) {
    this.client = new Anthropic();
    this.systemPrompt = opts.systemPrompt;
    this.maxTokens = opts.maxTokens ?? 8192;
    this.vm = new VirtualMachine();
  }

  get cwd(): string {
    return this.vm.cwd;
  }

  async send(
    input: string,
    onOutput: (text: string) => void
  ): Promise<void> {
    const trimmed = input.trim();

    // ── Local commands (no API call) ─────────────────────────────

    if (trimmed === "pwd") {
      onOutput(this.vm.cwd + "\n");
      return;
    }

    if (trimmed === "cd" || trimmed.startsWith("cd ")) {
      const target = trimmed === "cd" ? "/" : trimmed.slice(3).trim();
      this.vm.setCwd(target);
      return;
    }

    // ── Everything else → Claude ─────────────────────────────────
    // Include machine state so Claude knows what already exists.

    const state = this.vm.serialize();
    const message = `[state]\n${state}\n\n[input]\n${trimmed}`;

    this.messages.push({ role: "user", content: message });

    if (this.messages.length > 80) {
      this.messages = this.messages.slice(-80);
    }

    const stream = this.client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: this.maxTokens,
      system: this.systemPrompt,
      messages: this.messages,
      tools: TOOLS,
      tool_choice: { type: "any" },
    });

    // Collect content blocks for conversation history
    const contentBlocks: Anthropic.ContentBlock[] = [];

    let currentToolName = "";
    let currentToolId = "";
    let jsonBuffer = "";

    for await (const event of stream) {
      switch (event.type) {
        case "content_block_start": {
          if (event.content_block.type === "tool_use") {
            currentToolName = event.content_block.name;
            currentToolId = event.content_block.id;
            jsonBuffer = "";
          } else {
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
            let toolInput: any;
            try {
              toolInput = JSON.parse(jsonBuffer);
            } catch {
              onOutput("[SUBSYSTEM ERROR: malformed response]\n");
              break;
            }

            // Apply side effects to VM
            this.applyToolSideEffects(currentToolName, toolInput);

            // Render (state_update is invisible)
            if (currentToolName !== "state_update") {
              const rendered = renderToolCall(currentToolName, toolInput);
              onOutput(rendered);
              onOutput("\n");
            }

            contentBlocks.push({
              type: "tool_use",
              id: currentToolId,
              name: currentToolName,
              input: toolInput,
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

      const toolResults = contentBlocks
        .filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        )
        .map((b) => ({
          type: "tool_result" as const,
          tool_use_id: b.id,
          content: "OK",
        }));

      this.messages.push({
        role: "user",
        content: toolResults,
      } as any);
    }
  }

  // ── Side effects ───────────────────────────────────────────────

  private applyToolSideEffects(name: string, input: any): void {
    switch (name) {
      case "file_listing":
        if (input.cwd && input.entries) {
          this.vm.storeListing(input.cwd, input.entries);
        }
        break;

      case "file_content":
        if (input.path && input.content) {
          this.vm.storeContent(
            input.path,
            input.content,
            input.language
          );
        }
        break;

      case "state_update":
        this.vm.applyMutations(input);
        break;
    }
  }
}
