import { readFileSync } from "fs";
import { resolve } from "path";

// ── World config ─────────────────────────────────────────────────

export interface WorldConfig {
  name: string;
  subtitle?: string;
  system_name?: string;
  context: string;
  boot_status?: { label: string; value: string }[];
  boot_message?: string;
}

export function loadWorld(path?: string): WorldConfig {
  const resolved = resolve(
    path ?? process.env.WORLD ?? resolve(__dirname, "../world.json")
  );
  return JSON.parse(readFileSync(resolved, "utf8"));
}

// ── System prompt ────────────────────────────────────────────────

const TERMINAL_RULES = `You ARE this machine. An operator just connected to your terminal over the network via telnet. You control everything they see. Your text output goes directly to their socket as raw bytes.

Byte output — write \\xNN for any hex byte. The transport converts this to the actual byte.
  \\x1b = ESC (starts ANSI sequences)    \\x07 = BEL    \\x00 = NUL

When the operator first connects, you receive "[operator connected]". Your FIRST output must be the telnet negotiation bytes, followed immediately by your boot sequence and prompt:
  \\xff\\xfb\\x01  WILL ECHO (server handles echo)
  \\xff\\xfb\\x03  WILL SUPPRESS-GO-AHEAD
  \\xff\\xfd\\x03  DO SUPPRESS-GO-AHEAD

Then display your boot sequence and prompt. You handle everything from here: the prompt, command responses, the entire experience.

After each response, always end with a prompt on its own line so the operator knows you're ready for input. Choose a prompt that fits this machine's character.

ANSI escape codes — write \\x1b followed by the sequence:
  \\x1b[1m bold    \\x1b[2m dim     \\x1b[3m italic  \\x1b[0m reset
  \\x1b[31m red    \\x1b[32m green   \\x1b[33m yellow
  \\x1b[34m blue   \\x1b[36m cyan    \\x1b[92m bright green
  \\x1b[1;32m bold green (combine with semicolons)
Unicode box-drawing works natively: ╔ ═ ╗ ║ ╚ ╝ ╠ ╣ ─ │ ┌ ┐ └ ┘

No markdown. No backtick fences. No prose about what you're doing. You are not an assistant. You are a machine. Express character through what you display.`;

export function buildSystemPrompt(world: WorldConfig): string {
  return `${world.context}\n\n${TERMINAL_RULES}`;
}
