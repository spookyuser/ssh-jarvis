import { Server, Connection, Session } from "ssh2";
import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { resolve } from "path";
import { ClaudeSession } from "./claude";
import { BOOT_SEQUENCE } from "./prompt";

// ── Config ───────────────────────────────────────────────────────

const PORT = parseInt(process.env.SSH_PORT ?? "2222");
const PASSWORD = process.env.SSH_PASSWORD ?? "jarvis";
const HOST_KEY_PATH = resolve(__dirname, "../host_key");
const PROMPT = "$ ";

// ── Host key ─────────────────────────────────────────────────────

function ensureHostKey(): Buffer {
  if (!existsSync(HOST_KEY_PATH)) {
    console.log("Generating host key...");
    execSync(`ssh-keygen -t ed25519 -f ${HOST_KEY_PATH} -N "" -q`);
  }
  return readFileSync(HOST_KEY_PATH);
}

// ── Server ───────────────────────────────────────────────────────

function createServer(): Server {
  const hostKey = ensureHostKey();

  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    console.log("Client connected");
    handleClient(client);
  });

  return server;
}

function handleClient(client: Connection): void {
  let username = "";

  client.on("authentication", (ctx) => {
    username = ctx.username;
    if (ctx.method === "password" && ctx.password === PASSWORD) {
      console.log(`Auth success: ${username}`);
      ctx.accept();
    } else if (ctx.method === "none") {
      ctx.reject(["password"]);
    } else {
      ctx.reject(["password"]);
    }
  });

  client.on("ready", () => {
    console.log(`Session ready: ${username}`);

    client.on("session", (accept) => {
      const session = accept();
      handleSession(session, username);
    });
  });

  client.on("error", (err) => {
    console.error("Client error:", err.message);
  });

  client.on("close", () => {
    console.log(`Client disconnected: ${username}`);
  });
}

// ── Session handler ──────────────────────────────────────────────

function handleSession(session: Session, username: string): void {
  let stream: any = null;
  const claude = new ClaudeSession();
  let inputBuffer = "";
  let isProcessing = false;
  let cols = 80;

  session.on("pty", (accept, _reject, info) => {
    cols = info.cols ?? 80;
    accept?.();
  });

  session.on("shell", (accept) => {
    stream = accept();

    // Boot sequence
    writeToStream(stream, BOOT_SEQUENCE);
    writeToStream(stream, PROMPT);

    stream.on("data", (data: Buffer) => {
      const str = data.toString("utf8");
      for (const char of str) {
        handleChar(char);
      }
    });

    stream.on("close", () => {
      console.log("Stream closed");
    });
  });

  session.on("window-change", (accept, _reject, info) => {
    cols = info.cols ?? cols;
    accept?.();
  });

  function handleChar(char: string): void {
    const code = char.charCodeAt(0);

    // Ctrl+C
    if (code === 3) {
      if (isProcessing) return;
      writeToStream(stream, "^C\r\n");
      writeToStream(stream, PROMPT);
      inputBuffer = "";
      return;
    }

    // Ctrl+D — disconnect
    if (code === 4) {
      writeToStream(stream, "\r\nGoodbye. The suit will miss you.\r\n");
      stream.close();
      return;
    }

    // Backspace / Delete
    if (code === 127 || code === 8) {
      if (inputBuffer.length > 0) {
        inputBuffer = inputBuffer.slice(0, -1);
        stream.write("\b \b");
      }
      return;
    }

    // Enter
    if (char === "\r" || char === "\n") {
      stream.write("\r\n");
      const command = inputBuffer.trim();
      inputBuffer = "";

      if (command === "") {
        writeToStream(stream, PROMPT);
        return;
      }

      processCommand(command);
      return;
    }

    // Tab — ignore
    if (code === 9) return;

    // Escape sequences — ignore
    if (code === 27) return;

    // Printable characters
    if (code >= 32 && code < 127) {
      inputBuffer += char;
      stream.write(char);
    }
  }

  async function processCommand(command: string): Promise<void> {
    if (isProcessing) return;
    isProcessing = true;

    // Local commands
    if (command === "clear") {
      stream.write("\x1b[2J\x1b[H");
      writeToStream(stream, PROMPT);
      isProcessing = false;
      return;
    }

    if (command === "exit" || command === "logout") {
      writeToStream(stream, "Powering down. Stay safe out there.\r\n");
      setTimeout(() => stream.close(), 500);
      isProcessing = false;
      return;
    }

    try {
      await claude.send(command, (chunk) => {
        // The renderers produce \n — convert to \r\n for the terminal.
        // No markdown sanitization needed. The typed tool schemas
        // make markdown structurally impossible.
        const terminalBytes = chunk.replace(/\n/g, "\r\n");
        stream.write(terminalBytes);
      });
    } catch (err: any) {
      writeToStream(
        stream,
        `[SYSTEM ERROR] ${err.message}\r\n`
      );
    }

    writeToStream(stream, PROMPT);
    isProcessing = false;
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function writeToStream(stream: any, text: string): void {
  const sanitized = text.replace(/\r?\n/g, "\r\n");
  stream.write(sanitized);
}

// ── Main ─────────────────────────────────────────────────────────

const server = createServer();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔════════════════════════════════════════════╗
║       SSH-JARVIS Server Running            ║
╠════════════════════════════════════════════╣
║                                            ║
║  Port: ${String(PORT).padEnd(36)}║
║  Password: ${PASSWORD.padEnd(31)}║
║                                            ║
║  ssh operator@localhost -p ${String(PORT).padEnd(14)}║
║                                            ║
╚════════════════════════════════════════════╝
  `);
});

server.on("error", (err: Error) => {
  console.error("Server error:", err);
});
