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
// The world config provides narrative context. The tool rules are
// fixed infrastructure — they don't change between worlds.

const TOOL_RULES = `This machine has persistent state. Each command you receive includes a [state] block showing the current working directory and known filesystem. Respect it — entries in the known filesystem are real. You may extend the filesystem but never contradict what exists.

Each command also includes an [input] block. This is the operator's raw input. It might be a Unix command, a question, a made-up command, or anything. Interpret it in the context of this machine and respond.

You have output tools (rendered to the operator's terminal):
- file_listing: structured directory entries
- file_content: raw file bytes (for code: real, working, importable source — never descriptions of code)
- command_output: lines of text (for any textual output)
- process_list: structured process table
- system_status: diagnostics panel with status indicators

And a state mutation tool (invisible, no terminal output):
- state_update: mutate cwd, create/remove filesystem entries, set env vars. Call alongside output tools when a command changes machine state.

Rules:
- file_content is sacred. The content field is the literal bytes of the file. Write real code with types, imports, error handling, and comments that reveal engineering history.
- When you generate a directory listing, those entries become permanent. The state persists.
- Arbitrary input is valid. Not everything is a Unix command. Respond appropriately to whatever the operator types.
- No commentary. No markdown. You are a machine. Express character through the systems you run, the code you store, and the state you maintain.`;

export function buildSystemPrompt(world: WorldConfig): string {
  return `${world.context}\n\n${TOOL_RULES}`;
}

// ── Boot sequence ────────────────────────────────────────────────

export function buildBootSequence(world: WorldConfig): string {
  const WIDTH = 50;
  const lines: string[] = [];

  lines.push(`╔${"═".repeat(WIDTH)}╗`);
  lines.push(`║${center(world.name, WIDTH)}║`);

  if (world.subtitle) {
    lines.push(`║${center(world.subtitle, WIDTH)}║`);
  }
  if (world.system_name) {
    lines.push(`║${center(`[ ${world.system_name} ]`, WIDTH)}║`);
  }

  lines.push(`╠${"═".repeat(WIDTH)}╣`);
  lines.push(`║${" ".repeat(WIDTH)}║`);

  if (world.boot_status) {
    for (const { label, value } of world.boot_status) {
      const content = `  ${label}: ${value}`;
      const padding = Math.max(0, WIDTH - content.length);
      lines.push(`║${content}${" ".repeat(padding)}║`);
    }
  }

  lines.push(`║${" ".repeat(WIDTH)}║`);

  if (world.boot_message) {
    for (const msgLine of world.boot_message.split("\n")) {
      const content = `  ${msgLine}`;
      const padding = Math.max(0, WIDTH - content.length);
      lines.push(`║${content}${" ".repeat(padding)}║`);
    }
  }

  lines.push(`║${" ".repeat(WIDTH)}║`);
  lines.push(`╚${"═".repeat(WIDTH)}╝`);

  return lines.join("\n") + "\n";
}

// ── Helpers ──────────────────────────────────────────────────────

function center(text: string, width: number): string {
  const padding = Math.max(0, width - text.length);
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return " ".repeat(left) + text + " ".repeat(right);
}
