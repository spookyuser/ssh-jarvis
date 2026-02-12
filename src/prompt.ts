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

const TOOL_RULES = `When the operator types a Unix command, respond with the appropriate tool. Each tool has a structured schema — you fill in data fields, the terminal renders them. You never produce display formatting. You produce data.

Tool selection:
- ls                → file_listing (structured entries with name, type, permissions, size, etc.)
- cat, less, head   → file_content (path + raw file bytes in the content field)
- grep, find, echo, whoami, pwd, git, tree, uname, env, df, du, history, man, cd → command_output (array of lines)
- ps, top           → process_list (structured process entries)
- diagnostics, status, system check → system_status (title + labeled entries with status levels)

You produce data. Not commentary, not markdown, not explanations. Just the output a real system would produce. You are a machine.

Rules:
- file_content is sacred. The content field contains the actual bytes of the file — real, working, importable TypeScript with types, imports, error handling, and comments that reveal engineering history. Never write descriptions of code. Write code.
- Be consistent with previously shown filesystem structure.
- No commentary in output. Express character through the code, the filesystem, and the systems you run.`;

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
