import * as net from "net";
import { ClaudeSession } from "./claude";
import { loadWorld, buildSystemPrompt } from "./prompt";

const PORT = parseInt(process.env.PORT ?? "2222");
const world = loadWorld();
const SYSTEM_PROMPT = buildSystemPrompt(world);

// ── Escape translation ──────────────────────────────────────────

function toTerminalBytes(text: string): string {
  return text
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/\n/g, "\r\n");
}

function createAnsiTranslator(write: (bytes: string) => void) {
  let pending = "";
  return {
    push(chunk: string): void {
      const text = pending + chunk;
      pending = "";
      const trailingPartial = text.match(/(\\x[0-9a-fA-F]?|\\)$/);
      if (trailingPartial) {
        {
          const partial = trailingPartial[0];
          pending = partial;
          const complete = text.slice(0, -partial.length);
          if (complete) write(toTerminalBytes(complete));
          return;
        }
      }
      write(toTerminalBytes(text));
    },
    flush(): void {
      if (pending) {
        write(toTerminalBytes(pending));
        pending = "";
      }
    },
  };
}

// ── Server ───────────────────────────────────────────────────────
// Raw TCP socket. Claude handles everything: telnet negotiation,
// boot, prompt, commands. Node only does echo, line buffering,
// and \xNN byte translation.

net.createServer((socket) => {
  socket.setEncoding("utf8");

  const claude = new ClaudeSession({ systemPrompt: SYSTEM_PROMPT });
  let inputBuffer = "";
  let isProcessing = false;

  // Tell Claude a new operator connected — it handles the rest
  processInput("[operator connected]");

  socket.on("data", (raw: string) => {
    const data = raw.replace(/\xff[\xfb\xfc\xfd\xfe]./g, "");
    if (!data) return;

    for (const char of data) {
      const code = char.charCodeAt(0);

      // Backspace
      if (code === 127 || code === 8) {
        if (inputBuffer.length > 0) {
          inputBuffer = inputBuffer.slice(0, -1);
          socket.write("\b \b");
        }
        continue;
      }

      // Enter
      if (char === "\r" || char === "\n") {
        socket.write("\r\n");
        const line = inputBuffer;
        inputBuffer = "";
        processInput(line);
        continue;
      }

      // Ignore control chars
      if (code < 32) continue;

      // Echo + buffer
      if (code < 127) {
        inputBuffer += char;
        socket.write(char);
      }
    }
  });

  socket.on("error", () => { });
  socket.on("close", () => console.log("Client disconnected"));

  async function processInput(input: string): Promise<void> {
    if (isProcessing) return;
    isProcessing = true;

    const translator = createAnsiTranslator((bytes) => {
      if (!socket.destroyed) socket.write(bytes);
    });

    try {
      await claude.send(input, (chunk) => translator.push(chunk));
      translator.flush();
    } catch (err: any) {
      if (!socket.destroyed) {
        socket.write(`\r\n[ERROR] ${err.message}\r\n`);
      }
    }

    isProcessing = false;
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`Listening on port ${PORT} — telnet localhost ${PORT}`);
});
