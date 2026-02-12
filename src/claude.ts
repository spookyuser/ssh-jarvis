import Anthropic from "@anthropic-ai/sdk";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export class ClaudeSession {
  private client: Anthropic;
  private messages: Message[] = [];
  private systemPrompt: string;
  private maxTokens: number;

  constructor(opts: { systemPrompt: string; maxTokens?: number }) {
    this.client = new Anthropic();
    this.systemPrompt = opts.systemPrompt;
    this.maxTokens = opts.maxTokens ?? 4096;
  }

  async send(
    input: string,
    onOutput: (text: string) => void
  ): Promise<void> {
    this.messages.push({ role: "user", content: input.trim() });

    if (this.messages.length > 80) {
      this.messages = this.messages.slice(-80);
    }

    const stream = this.client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: this.maxTokens,
      system: this.systemPrompt,
      messages: this.messages,
    });

    let fullResponse = "";

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        onOutput(event.delta.text);
        fullResponse += event.delta.text;
      }
    }

    if (fullResponse) {
      this.messages.push({ role: "assistant", content: fullResponse });
    }
  }
}
