// ── Virtual Machine ──────────────────────────────────────────────
// Persistent state for a single SSH session. The filesystem is
// explored incrementally — entries appear as Claude generates them.
// Subsequent commands see the accumulated state, so `ls` then `cat`
// always agree on what exists.

export interface FSNode {
  type: "file" | "dir" | "symlink";
  name: string;
  permissions?: string;
  owner?: string;
  group?: string;
  size?: string;
  modified?: string;
  language?: string;
  link_target?: string;
}

export class VirtualMachine {
  private nodes = new Map<string, FSNode>();
  private fileContents = new Map<string, string>();
  private _cwd = "/";
  private _env: Record<string, string> = {};

  get cwd(): string {
    return this._cwd;
  }

  resolve(input: string): string {
    const path = input.trim();
    if (!path || path === ".") return this._cwd;
    if (path === "~") return "/";
    if (path.startsWith("/")) return normalize(path);
    const base = this._cwd === "/" ? "" : this._cwd;
    return normalize(`${base}/${path}`);
  }

  // ── Writes ─────────────────────────────────────────────────────

  setCwd(path: string): void {
    this._cwd = this.resolve(path);
  }

  storeListing(dirPath: string, entries: FSNode[]): void {
    const dir = this.resolve(dirPath);
    if (!this.nodes.has(dir)) {
      this.nodes.set(dir, { type: "dir", name: basename(dir) });
    }
    for (const entry of entries) {
      const child =
        dir === "/" ? `/${entry.name}` : `${dir}/${entry.name}`;
      this.nodes.set(child, entry);
    }
  }

  storeContent(
    filePath: string,
    content: string,
    language?: string
  ): void {
    const path = this.resolve(filePath);
    this.fileContents.set(path, content);
    if (!this.nodes.has(path)) {
      this.nodes.set(path, {
        type: "file",
        name: basename(path),
        language,
      });
    }
  }

  applyMutations(m: {
    cwd?: string;
    create?: Array<{
      path: string;
      type?: string;
      permissions?: string;
      owner?: string;
      size?: string;
      modified?: string;
      content?: string;
      language?: string;
    }>;
    remove?: string[];
    env?: Record<string, string>;
  }): void {
    if (m.cwd) this.setCwd(m.cwd);

    if (m.create) {
      for (const item of m.create) {
        const path = this.resolve(item.path);
        this.nodes.set(path, {
          type: (item.type as FSNode["type"]) ?? "file",
          name: basename(path),
          permissions: item.permissions,
          owner: item.owner,
          size: item.size,
          modified: item.modified,
          language: item.language,
        });
        if (item.content !== undefined) {
          this.fileContents.set(path, item.content);
        }
      }
    }

    if (m.remove) {
      for (const p of m.remove) {
        const resolved = this.resolve(p);
        for (const key of [...this.nodes.keys()]) {
          if (key === resolved || key.startsWith(resolved + "/")) {
            this.nodes.delete(key);
            this.fileContents.delete(key);
          }
        }
      }
    }

    if (m.env) {
      Object.assign(this._env, m.env);
    }
  }

  // ── Reads ──────────────────────────────────────────────────────

  hasContent(filePath: string): boolean {
    return this.fileContents.has(this.resolve(filePath));
  }

  getContent(filePath: string): string | undefined {
    return this.fileContents.get(this.resolve(filePath));
  }

  getNode(path: string): FSNode | undefined {
    return this.nodes.get(this.resolve(path));
  }

  // ── Serialization ──────────────────────────────────────────────
  // Compact representation of machine state for Claude's context.

  serialize(): string {
    const lines: string[] = [`cwd: ${this._cwd}`];

    if (this.nodes.size > 0) {
      lines.push("known filesystem:");
      const sorted = [...this.nodes.entries()].sort((a, b) =>
        a[0].localeCompare(b[0])
      );
      for (const [path, node] of sorted) {
        const suffix = node.type === "dir" ? "/" : "";
        const size = node.size ? ` (${node.size})` : "";
        const cached = this.fileContents.has(path) ? " [cached]" : "";
        lines.push(`  ${path}${suffix}${size}${cached}`);
      }
    } else {
      lines.push("filesystem: unexplored");
    }

    const envKeys = Object.keys(this._env);
    if (envKeys.length > 0) {
      lines.push("env:");
      for (const [k, v] of Object.entries(this._env)) {
        lines.push(`  ${k}=${v}`);
      }
    }

    return lines.join("\n");
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function normalize(path: string): string {
  const parts = path.split("/").filter(Boolean);
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return "/" + resolved.join("/");
}

function basename(path: string): string {
  return path.split("/").pop() || "/";
}
