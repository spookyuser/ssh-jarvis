// ── ANSI Terminal Renderers ───────────────────────────────────────
// Each function takes structured data from a tool call and returns
// a string of ANSI-coded terminal bytes. Claude never touches this
// layer — it only fills in schemas. All visual decisions live here.

// ── Escape codes ─────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";
const BRIGHT_BLUE = "\x1b[94m";
const BRIGHT_GREEN = "\x1b[92m";

// ── Types (mirror the tool schemas) ──────────────────────────────

interface FileEntry {
  name: string;
  type: "file" | "dir" | "symlink";
  permissions?: string;
  owner?: string;
  group?: string;
  size?: string;
  modified?: string;
  link_target?: string;
}

interface ProcessEntry {
  pid: number;
  user: string;
  cpu?: string;
  mem?: string;
  vsz?: string;
  rss?: string;
  tty?: string;
  stat?: string;
  start?: string;
  time?: string;
  command: string;
}

interface StatusEntry {
  label: string;
  value: string;
  status?: "ok" | "warning" | "critical" | "inactive" | "info";
}

// ── Renderers ────────────────────────────────────────────────────

export function renderFileListing(data: {
  cwd: string;
  entries: FileEntry[];
}): string {
  if (data.entries.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push(`total ${data.entries.length}`);

  // Column widths
  const maxOwner = Math.max(
    ...data.entries.map((e) => (e.owner ?? "stark").length)
  );
  const maxGroup = Math.max(
    ...data.entries.map((e) => (e.group ?? "stark").length)
  );
  const maxSize = Math.max(
    ...data.entries.map((e) => (e.size ?? "0").length)
  );

  for (const entry of data.entries) {
    const typeChar =
      entry.type === "dir" ? "d" : entry.type === "symlink" ? "l" : "-";
    const perms =
      entry.permissions ?? (entry.type === "dir" ? "rwxr-xr-x" : "rw-r--r--");
    const owner = (entry.owner ?? "stark").padEnd(maxOwner);
    const group = (entry.group ?? "stark").padEnd(maxGroup);
    const size = (entry.size ?? "0").padStart(maxSize);
    const modified = entry.modified ?? "Feb 12 00:00";

    let nameStr: string;
    if (entry.type === "dir") {
      nameStr = `${BOLD}${BRIGHT_BLUE}${entry.name}/${RESET}`;
    } else if (entry.type === "symlink") {
      nameStr = `${CYAN}${entry.name}${RESET} -> ${entry.link_target ?? "???"}`;
    } else if (perms.includes("x")) {
      nameStr = `${BRIGHT_GREEN}${entry.name}${RESET}`;
    } else {
      nameStr = entry.name;
    }

    lines.push(
      `${typeChar}${perms}  1 ${owner} ${group} ${GREEN}${size}${RESET} ${modified} ${nameStr}`
    );
  }

  return lines.join("\n");
}

export function renderFileContent(data: {
  path: string;
  content: string;
  language?: string;
}): string {
  const contentLines = data.content.split("\n");
  const numWidth = Math.max(3, String(contentLines.length).length);

  const rendered = contentLines.map((line, i) => {
    const num = String(i + 1).padStart(numWidth);
    return `${DIM}${num} ${RESET}${DIM}│${RESET} ${line}`;
  });

  return rendered.join("\n");
}

export function renderCommandOutput(data: { lines: string[] }): string {
  return data.lines.join("\n");
}

export function renderProcessList(data: {
  processes: ProcessEntry[];
}): string {
  const header = `${BOLD}USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND${RESET}`;
  const lines = [header];

  for (const p of data.processes) {
    const user = (p.user ?? "root").padEnd(12);
    const pid = String(p.pid).padStart(5);
    const cpu = (p.cpu ?? "0.0").padStart(4);
    const mem = (p.mem ?? "0.0").padStart(4);
    const vsz = (p.vsz ?? "0").padStart(7);
    const rss = (p.rss ?? "0").padStart(5);
    const tty = (p.tty ?? "?").padEnd(8);
    const stat = (p.stat ?? "S").padEnd(4);
    const start = (p.start ?? "00:00").padEnd(7);
    const time = (p.time ?? "0:00").padEnd(7);

    lines.push(
      `${user}${pid} ${cpu} ${mem} ${vsz} ${rss} ${tty} ${stat} ${start} ${time} ${p.command}`
    );
  }

  return lines.join("\n");
}

export function renderSystemStatus(data: {
  title: string;
  entries: StatusEntry[];
}): string {
  const WIDTH = 50;

  const statusColor: Record<string, string> = {
    ok: GREEN,
    warning: YELLOW,
    critical: RED,
    inactive: DIM,
    info: CYAN,
  };

  const lines: string[] = [];
  lines.push(`╔${"═".repeat(WIDTH)}╗`);
  lines.push(`║${centerPad(data.title, WIDTH)}║`);
  lines.push(`╠${"═".repeat(WIDTH)}╣`);

  for (const entry of data.entries) {
    const color = statusColor[entry.status ?? "info"] ?? "";
    const label = entry.label;
    const value = entry.value;

    // Visible length (without ANSI codes) for padding
    const visible = `  ${label}: ${value}`;
    const padding = Math.max(0, WIDTH - visible.length);
    const content = `  ${label}: ${color}${value}${color ? RESET : ""}`;

    lines.push(`║${content}${" ".repeat(padding)}║`);
  }

  lines.push(`╚${"═".repeat(WIDTH)}╝`);
  return lines.join("\n");
}

// ── Dispatch ─────────────────────────────────────────────────────

export function renderToolCall(name: string, input: any): string {
  switch (name) {
    case "file_listing":
      return renderFileListing(input);
    case "file_content":
      return renderFileContent(input);
    case "command_output":
      return renderCommandOutput(input);
    case "process_list":
      return renderProcessList(input);
    case "system_status":
      return renderSystemStatus(input);
    case "state_update":
      return "";
    default:
      return `[unknown subsystem: ${name}]`;
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function centerPad(text: string, width: number): string {
  const padding = Math.max(0, width - text.length);
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return " ".repeat(left) + text + " ".repeat(right);
}
