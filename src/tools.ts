import Anthropic from "@anthropic-ai/sdk";

// ── Tool definitions ─────────────────────────────────────────────
// Output tools have tight schemas — Claude fills in data fields,
// the server renders them into ANSI terminal bytes.
// state_update is invisible — it mutates the VM and produces no output.

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "file_listing",
    description: "Structured directory listing with entry metadata.",
    input_schema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description: "Absolute path of the directory being listed",
        },
        entries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: {
                type: "string",
                enum: ["file", "dir", "symlink"],
              },
              permissions: {
                type: "string",
                description: "e.g. rwxr-xr-x",
              },
              owner: { type: "string" },
              group: { type: "string" },
              size: {
                type: "string",
                description: "Human-readable, e.g. 4.2K",
              },
              modified: {
                type: "string",
                description: "e.g. Mar 14 09:32",
              },
              link_target: {
                type: "string",
                description: "Symlink target path",
              },
            },
            required: ["name", "type"],
          },
        },
      },
      required: ["cwd", "entries"],
    },
  },

  {
    name: "file_content",
    description:
      "Raw file contents. The content field is the literal bytes of " +
      "the file. For code: real, working, importable source with types, " +
      "implementations, and comments that reveal engineering history. " +
      "Never describe code. Write it.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute path of the file",
        },
        content: {
          type: "string",
          description:
            "The raw file content — actual source code, config, or data",
        },
        language: {
          type: "string",
          description: "Language identifier, e.g. typescript, json, yaml",
        },
      },
      required: ["path", "content"],
    },
  },

  {
    name: "command_output",
    description:
      "Lines of text output. Use for any command or response that " +
      "produces text — grep, find, git, echo, errors, or anything else.",
    input_schema: {
      type: "object" as const,
      properties: {
        lines: {
          type: "array",
          items: { type: "string" },
          description: "Output lines. One string per terminal line.",
        },
      },
      required: ["lines"],
    },
  },

  {
    name: "process_list",
    description: "Structured process table.",
    input_schema: {
      type: "object" as const,
      properties: {
        processes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              pid: { type: "number" },
              user: { type: "string" },
              cpu: { type: "string" },
              mem: { type: "string" },
              vsz: { type: "string" },
              rss: { type: "string" },
              tty: { type: "string" },
              stat: { type: "string" },
              start: { type: "string" },
              time: { type: "string" },
              command: { type: "string" },
            },
            required: ["pid", "user", "command"],
          },
        },
      },
      required: ["processes"],
    },
  },

  {
    name: "system_status",
    description:
      "Diagnostics panel with box-drawing borders and status indicators.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        entries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "string" },
              status: {
                type: "string",
                enum: ["ok", "warning", "critical", "inactive", "info"],
              },
            },
            required: ["label", "value"],
          },
        },
      },
      required: ["title", "entries"],
    },
  },

  {
    name: "state_update",
    description:
      "Mutate machine state. Produces no visible output. Call alongside " +
      "output tools when a command changes the filesystem, working " +
      "directory, or environment (mkdir, rm, touch, mv, export, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description: "New working directory (absolute path)",
        },
        create: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "Absolute path" },
              type: {
                type: "string",
                enum: ["file", "dir", "symlink"],
              },
              permissions: { type: "string" },
              owner: { type: "string" },
              size: { type: "string" },
              modified: { type: "string" },
              content: {
                type: "string",
                description: "File content, if creating with content",
              },
              language: { type: "string" },
            },
            required: ["path"],
          },
          description: "Filesystem entries to create or update",
        },
        remove: {
          type: "array",
          items: { type: "string" },
          description: "Absolute paths to remove",
        },
        env: {
          type: "object",
          description: "Environment variables to set or update",
        },
      },
    },
  },
];
